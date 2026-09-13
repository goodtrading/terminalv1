use rusqlite::{params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const SCHEMA_VERSION: i64 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub struct CandleIdentity {
    pub exchange: String,
    pub market_type: String,
    pub symbol: String,
    pub timeframe: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CandleRow {
    pub open_time_ms: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CandlePageResult {
    pub candles: Vec<CandleRow>,
    pub cache_result: String,
    pub row_count: usize,
    pub limit: usize,
    pub before_ms: Option<i64>,
    pub database_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CandleStoreInitResult {
    pub database_path: String,
    pub schema_version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CandleStoreStats {
    pub database_path: String,
    pub schema_version: i64,
    pub row_count: i64,
    pub file_size_bytes: u64,
}

pub fn candle_db_path(base_dir: &Path) -> PathBuf {
    base_dir.join("Data").join("candles.sqlite")
}

fn normalize_id(value: &str) -> String {
    value.trim().to_lowercase()
}

fn validate_identity(id: &CandleIdentity) -> Result<(), String> {
    if id.exchange.trim().is_empty() {
        return Err("exchange is required".to_string());
    }
    if id.market_type.trim().is_empty() {
        return Err("market_type is required".to_string());
    }
    if id.symbol.trim().is_empty() {
        return Err("symbol is required".to_string());
    }
    if id.timeframe.trim().is_empty() {
        return Err("timeframe is required".to_string());
    }
    Ok(())
}

fn validate_row(row: &CandleRow) -> Result<(), String> {
    if row.open_time_ms <= 0 {
        return Err("open_time_ms must be positive".to_string());
    }
    for (name, value) in [
        ("open", row.open),
        ("high", row.high),
        ("low", row.low),
        ("close", row.close),
        ("volume", row.volume),
    ] {
        if !value.is_finite() {
            return Err(format!("{name} must be finite"));
        }
    }
    if row.low > row.high {
        return Err("low cannot exceed high".to_string());
    }
    Ok(())
}

fn ensure_parent_dir(db_path: &Path) -> Result<(), String> {
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("create candle db parent: {err}"))?;
    }
    Ok(())
}

fn open_connection(db_path: &Path) -> Result<Connection, String> {
    ensure_parent_dir(db_path)?;
    let conn = Connection::open_with_flags(
        db_path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE,
    )
    .map_err(|err| format!("open sqlite: {err}"))?;
    conn.busy_timeout(Duration::from_millis(750))
        .map_err(|err| format!("busy_timeout: {err}"))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|err| format!("pragma journal_mode: {err}"))?;
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|err| format!("pragma synchronous: {err}"))?;
    Ok(conn)
}

fn schema_version(conn: &Connection) -> Result<i64, String> {
    conn.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
        .map_err(|err| format!("read schema version: {err}"))
}

fn ensure_schema(conn: &Connection) -> Result<(), String> {
    let current = schema_version(conn)?;
    if current >= SCHEMA_VERSION {
        return Ok(());
    }

    conn.execute_batch(
        r#"
      CREATE TABLE IF NOT EXISTS candle_history (
        exchange TEXT NOT NULL,
        market_type TEXT NOT NULL,
        symbol TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        open_time_ms INTEGER NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume REAL NOT NULL,
        PRIMARY KEY (exchange, market_type, symbol, timeframe, open_time_ms)
      );

      CREATE INDEX IF NOT EXISTS idx_candle_history_lookup
      ON candle_history (exchange, market_type, symbol, timeframe, open_time_ms DESC);
    "#,
    )
    .map_err(|err| format!("create schema: {err}"))?;

    conn.pragma_update(None, "user_version", SCHEMA_VERSION)
        .map_err(|err| format!("set schema version: {err}"))?;
    Ok(())
}

fn open_ready_connection(db_path: &Path) -> Result<Connection, String> {
    let conn = open_connection(db_path)?;
    ensure_schema(&conn)?;
    Ok(conn)
}

pub fn init_candle_store(db_path: &Path) -> Result<CandleStoreInitResult, String> {
    let conn = open_ready_connection(db_path)?;
    let version = schema_version(&conn)?;
    Ok(CandleStoreInitResult {
        database_path: db_path.to_string_lossy().to_string(),
        schema_version: version,
    })
}

pub fn upsert_candle_batch(
    db_path: &Path,
    identity: &CandleIdentity,
    candles: &[CandleRow],
) -> Result<usize, String> {
    validate_identity(identity)?;
    let mut ready = open_ready_connection(db_path)?;
    let tx = ready
        .transaction()
        .map_err(|err| format!("begin tx: {err}"))?;
    let mut stmt = tx
        .prepare(
            r#"
      INSERT INTO candle_history (
        exchange, market_type, symbol, timeframe, open_time_ms,
        open, high, low, close, volume
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
      ON CONFLICT(exchange, market_type, symbol, timeframe, open_time_ms)
      DO UPDATE SET
        open=excluded.open,
        high=excluded.high,
        low=excluded.low,
        close=excluded.close,
        volume=excluded.volume
      "#,
        )
        .map_err(|err| format!("prepare upsert: {err}"))?;

    let mut written = 0usize;
    let exchange = normalize_id(&identity.exchange);
    let market_type = normalize_id(&identity.market_type);
    let symbol = identity.symbol.trim().to_uppercase();
    let timeframe = identity.timeframe.trim().to_lowercase();

    for candle in candles {
        validate_row(candle)?;
        stmt.execute(params![
            exchange,
            market_type,
            symbol,
            timeframe,
            candle.open_time_ms,
            candle.open,
            candle.high,
            candle.low,
            candle.close,
            candle.volume,
        ])
        .map_err(|err| format!("upsert candle: {err}"))?;
        written += 1;
    }

    drop(stmt);
    tx.commit().map_err(|err| format!("commit tx: {err}"))?;
    Ok(written)
}

pub fn read_candle_page(
    db_path: &Path,
    identity: &CandleIdentity,
    before_ms: Option<i64>,
    limit: usize,
) -> Result<CandlePageResult, String> {
    validate_identity(identity)?;
    let limit = limit.max(1);
    let conn = open_ready_connection(db_path)?;
    let exchange = normalize_id(&identity.exchange);
    let market_type = normalize_id(&identity.market_type);
    let symbol = identity.symbol.trim().to_uppercase();
    let timeframe = identity.timeframe.trim().to_lowercase();

    let mut sql = String::from(
    "SELECT open_time_ms, open, high, low, close, volume FROM candle_history WHERE exchange = ?1 AND market_type = ?2 AND symbol = ?3 AND timeframe = ?4",
  );
    if before_ms.is_some() {
        sql.push_str(" AND open_time_ms < ?5");
    }
    sql.push_str(" ORDER BY open_time_ms DESC LIMIT ?6");

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|err| format!("prepare read: {err}"))?;
    let rows = if let Some(before_ms) = before_ms {
        stmt.query_map(
            params![
                exchange,
                market_type,
                symbol,
                timeframe,
                before_ms,
                limit as i64
            ],
            |row| {
                Ok(CandleRow {
                    open_time_ms: row.get(0)?,
                    open: row.get(1)?,
                    high: row.get(2)?,
                    low: row.get(3)?,
                    close: row.get(4)?,
                    volume: row.get(5)?,
                })
            },
        )
        .map_err(|err| format!("query candles: {err}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("read candles: {err}"))?
    } else {
        stmt.query_map(
            params![
                exchange,
                market_type,
                symbol,
                timeframe,
                i64::MAX,
                limit as i64
            ],
            |row| {
                Ok(CandleRow {
                    open_time_ms: row.get(0)?,
                    open: row.get(1)?,
                    high: row.get(2)?,
                    low: row.get(3)?,
                    close: row.get(4)?,
                    volume: row.get(5)?,
                })
            },
        )
        .map_err(|err| format!("query candles: {err}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("read candles: {err}"))?
    };

    let mut candles = rows;
    candles.reverse();
    candles.retain(|row| validate_row(row).is_ok());

    let cache_result = if candles.is_empty() {
        "CACHE_MISS"
    } else if candles.len() < limit {
        "CACHE_PARTIAL"
    } else {
        "CACHE_HIT"
    }
    .to_string();

    Ok(CandlePageResult {
        row_count: candles.len(),
        candles,
        cache_result,
        limit,
        before_ms,
        database_path: db_path.to_string_lossy().to_string(),
    })
}

pub fn candle_store_stats(db_path: &Path) -> Result<CandleStoreStats, String> {
    let conn = open_ready_connection(db_path)?;
    let schema_version = schema_version(&conn)?;
    let row_count = conn
        .query_row("SELECT COUNT(*) FROM candle_history", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|err| format!("count candles: {err}"))?;
    let file_size_bytes = fs::metadata(db_path).map(|m| m.len()).unwrap_or(0);
    Ok(CandleStoreStats {
        database_path: db_path.to_string_lossy().to_string(),
        schema_version,
        row_count,
        file_size_bytes,
    })
}

pub fn clear_candle_store(db_path: &Path) -> Result<(), String> {
    for target in [
        db_path.to_path_buf(),
        db_path.with_extension("sqlite-wal"),
        db_path.with_extension("sqlite-shm"),
    ] {
        if target.exists() {
            fs::remove_file(&target).map_err(|err| format!("remove candle db: {err}"))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let base = std::env::temp_dir().join(format!("goodtrading-candle-store-{stamp}"));
        candle_db_path(&base)
    }

    fn key() -> CandleIdentity {
        CandleIdentity {
            exchange: "binance".to_string(),
            market_type: "spot".to_string(),
            symbol: "BTCUSDT".to_string(),
            timeframe: "15s".to_string(),
        }
    }

    fn candle(open_time_ms: i64, open: f64) -> CandleRow {
        CandleRow {
            open_time_ms,
            open,
            high: open + 1.0,
            low: open - 1.0,
            close: open + 0.5,
            volume: 1.25,
        }
    }

    #[test]
    fn init_and_latest_page_are_ok() {
        let db_path = temp_db_path();
        let init = init_candle_store(&db_path).expect("init");
        assert_eq!(init.schema_version, SCHEMA_VERSION);
        assert!(db_path.exists());

        upsert_candle_batch(
            &db_path,
            &key(),
            &[
                candle(1_000, 100.0),
                candle(2_000, 101.0),
                candle(3_000, 102.0),
            ],
        )
        .expect("upsert");
        let page = read_candle_page(&db_path, &key(), None, 2).expect("read");
        assert_eq!(page.cache_result, "CACHE_HIT");
        assert_eq!(page.candles.len(), 2);
        assert_eq!(page.candles[0].open_time_ms, 2_000);
        assert_eq!(page.candles[1].open_time_ms, 3_000);
    }

    #[test]
    fn before_queries_are_strictly_older_and_dedupe() {
        let db_path = temp_db_path();
        init_candle_store(&db_path).expect("init");
        let rows = vec![
            candle(10_000, 10.0),
            candle(20_000, 20.0),
            candle(30_000, 30.0),
        ];
        upsert_candle_batch(&db_path, &key(), &rows).expect("upsert");
        upsert_candle_batch(&db_path, &key(), &rows).expect("upsert dup");

        let page = read_candle_page(&db_path, &key(), Some(30_000), 10).expect("read before");
        assert_eq!(page.candles.len(), 2);
        assert_eq!(page.candles[0].open_time_ms, 10_000);
        assert_eq!(page.candles[1].open_time_ms, 20_000);
    }

    #[test]
    fn market_series_do_not_collide() {
        let db_path = temp_db_path();
        init_candle_store(&db_path).expect("init");
        let spot = key();
        let perp = CandleIdentity {
            market_type: "perp".to_string(),
            ..spot.clone()
        };
        upsert_candle_batch(&db_path, &spot, &[candle(50_000, 50.0)]).expect("spot");
        upsert_candle_batch(&db_path, &perp, &[candle(50_000, 60.0)]).expect("perp");

        let spot_page = read_candle_page(&db_path, &spot, None, 10).expect("spot read");
        let perp_page = read_candle_page(&db_path, &perp, None, 10).expect("perp read");
        assert_eq!(spot_page.candles[0].open, 50.0);
        assert_eq!(perp_page.candles[0].open, 60.0);
    }
}

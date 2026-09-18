use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceOutboxItem {
    pub account_id: String,
    pub environment: String,
    pub source: String,
    pub event_id: String,
    pub payload: Value,
    pub status: String,
    pub attempts: i64,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceOutboxEnqueueResult {
    pub inserted_count: usize,
    pub duplicate_count: usize,
    pub pending_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceOutboxDiagnostics {
    pub pending_count: i64,
    pub conflict_count: i64,
    pub last_delivery_failure: Option<String>,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub fn evidence_outbox_db_path(base_dir: &Path) -> PathBuf {
    base_dir.join("Data").join("candles.sqlite")
}

fn app_base_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("app_data_dir: {err}"))?;
    let roaming_dir = app_data_dir.parent().unwrap_or(app_data_dir.as_path());
    Ok(roaming_dir.join("GoodTrading Terminal"))
}

fn app_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(evidence_outbox_db_path(&app_base_dir(app)?))
}

fn open_connection(db_path: &Path) -> Result<Connection, String> {
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("create outbox parent: {err}"))?;
    }
    let conn = Connection::open_with_flags(
        db_path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE,
    )
    .map_err(|err| format!("open outbox sqlite: {err}"))?;
    conn.busy_timeout(Duration::from_millis(750))
        .map_err(|err| format!("outbox busy_timeout: {err}"))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|err| format!("outbox journal_mode: {err}"))?;
    conn.pragma_update(None, "synchronous", "FULL")
        .map_err(|err| format!("outbox synchronous: {err}"))?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS nautilus_evidence_outbox (
          account_id TEXT NOT NULL,
          environment TEXT NOT NULL CHECK (environment = 'PAPER'),
          source TEXT NOT NULL CHECK (source = 'NAUTILUS_PAPER'),
          event_id TEXT NOT NULL,
          payload TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('PENDING', 'CONFLICT')) DEFAULT 'PENDING',
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL,
          PRIMARY KEY (account_id, environment, source, event_id)
        );
        CREATE INDEX IF NOT EXISTS idx_nautilus_evidence_outbox_account_status
          ON nautilus_evidence_outbox (account_id, status, created_at_ms);
        "#,
    )
    .map_err(|err| format!("create outbox schema: {err}"))?;
    Ok(conn)
}

fn required_string(event: &Value, field: &str) -> Result<String, String> {
    event
        .get(field)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| format!("OUTBOX_INVALID_{field}"))
}

fn validate_event(account_id: &str, event: &Value) -> Result<(String, String, String, String), String> {
    if account_id.trim().is_empty() {
        return Err("OUTBOX_ACCOUNT_ID_REQUIRED".to_string());
    }
    let environment = required_string(event, "environment")?;
    let source = required_string(event, "source")?;
    if environment != "PAPER" || source != "NAUTILUS_PAPER" {
        return Err("OUTBOX_PROVENANCE_NOT_NAUTILUS_PAPER".to_string());
    }
    let event_id = required_string(event, "eventId")?;
    let payload = serde_json::to_string(event).map_err(|err| format!("OUTBOX_SERIALIZE: {err}"))?;
    Ok((environment, source, event_id, payload))
}

pub fn enqueue_at_path(
    db_path: &Path,
    account_id: &str,
    events: &[Value],
) -> Result<EvidenceOutboxEnqueueResult, String> {
    let conn = open_connection(db_path)?;
    let tx = conn
        .unchecked_transaction()
        .map_err(|err| format!("outbox begin: {err}"))?;
    let now = now_ms();
    let mut inserted_count = 0usize;
    let mut duplicate_count = 0usize;
    for event in events {
        let (environment, source, event_id, payload) = validate_event(account_id, event)?;
        let inserted = tx
            .execute(
                "INSERT INTO nautilus_evidence_outbox (account_id, environment, source, event_id, payload, created_at_ms, updated_at_ms) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6) ON CONFLICT(account_id, environment, source, event_id) DO NOTHING",
                params![account_id, environment, source, event_id, payload, now],
            )
            .map_err(|err| format!("outbox enqueue: {err}"))?;
        if inserted == 1 {
            inserted_count += 1;
            continue;
        }
        let stored: String = tx
            .query_row(
                "SELECT payload FROM nautilus_evidence_outbox WHERE account_id = ?1 AND environment = ?2 AND source = ?3 AND event_id = ?4",
                params![account_id, environment, source, event_id],
                |row| row.get(0),
            )
            .map_err(|err| format!("outbox duplicate read: {err}"))?;
        let stored_value: Value = serde_json::from_str(&stored).map_err(|err| format!("OUTBOX_CORRUPT_PAYLOAD: {err}"))?;
        if stored_value != *event {
            return Err(format!("NAUTILUS_EVIDENCE_OUTBOX_CONFLICT eventId={event_id}"));
        }
        duplicate_count += 1;
    }
    tx.commit().map_err(|err| format!("outbox commit: {err}"))?;
    let pending_count = conn
        .query_row(
            "SELECT COUNT(*) FROM nautilus_evidence_outbox WHERE account_id = ?1 AND status = 'PENDING'",
            params![account_id],
            |row| row.get(0),
        )
        .map_err(|err| format!("outbox pending count: {err}"))?;
    Ok(EvidenceOutboxEnqueueResult { inserted_count, duplicate_count, pending_count })
}

pub fn list_at_path(db_path: &Path, account_id: &str) -> Result<Vec<EvidenceOutboxItem>, String> {
    let conn = open_connection(db_path)?;
    let mut stmt = conn
        .prepare("SELECT account_id, environment, source, event_id, payload, status, attempts, last_error FROM nautilus_evidence_outbox WHERE account_id = ?1 ORDER BY created_at_ms ASC, event_id ASC")
        .map_err(|err| format!("outbox list prepare: {err}"))?;
    let rows = stmt
        .query_map(params![account_id], |row| {
            let raw: String = row.get(4)?;
            let payload = serde_json::from_str(&raw).map_err(|err| rusqlite::Error::FromSqlConversionFailure(4, rusqlite::types::Type::Text, Box::new(err)))?;
            Ok(EvidenceOutboxItem {
                account_id: row.get(0)?, environment: row.get(1)?, source: row.get(2)?, event_id: row.get(3)?, payload,
                status: row.get(5)?, attempts: row.get(6)?, last_error: row.get(7)?,
            })
        })
        .map_err(|err| format!("outbox list: {err}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|err| format!("outbox row: {err}"))
}

pub fn ack_at_path(db_path: &Path, account_id: &str, event_ids: &[String]) -> Result<(), String> {
    let conn = open_connection(db_path)?;
    let tx = conn.unchecked_transaction().map_err(|err| format!("outbox ack begin: {err}"))?;
    for event_id in event_ids {
        tx.execute("DELETE FROM nautilus_evidence_outbox WHERE account_id = ?1 AND event_id = ?2", params![account_id, event_id]).map_err(|err| format!("outbox ack: {err}"))?;
    }
    tx.commit().map_err(|err| format!("outbox ack commit: {err}"))
}

pub fn mark_failure_at_path(db_path: &Path, account_id: &str, event_ids: &[String], status: &str, error: &str) -> Result<(), String> {
    if status != "PENDING" && status != "CONFLICT" { return Err("OUTBOX_STATUS_INVALID".to_string()); }
    let conn = open_connection(db_path)?;
    let tx = conn.unchecked_transaction().map_err(|err| format!("outbox failure begin: {err}"))?;
    for event_id in event_ids {
        tx.execute("UPDATE nautilus_evidence_outbox SET status = ?1, attempts = attempts + 1, last_error = ?2, updated_at_ms = ?3 WHERE account_id = ?4 AND event_id = ?5", params![status, error, now_ms(), account_id, event_id]).map_err(|err| format!("outbox failure: {err}"))?;
    }
    tx.commit().map_err(|err| format!("outbox failure commit: {err}"))
}

pub fn diagnostics_at_path(db_path: &Path, account_id: &str) -> Result<EvidenceOutboxDiagnostics, String> {
    let conn = open_connection(db_path)?;
    let pending_count = conn.query_row("SELECT COUNT(*) FROM nautilus_evidence_outbox WHERE account_id = ?1 AND status = 'PENDING'", params![account_id], |row| row.get(0)).map_err(|err| format!("outbox diagnostics pending: {err}"))?;
    let conflict_count = conn.query_row("SELECT COUNT(*) FROM nautilus_evidence_outbox WHERE account_id = ?1 AND status = 'CONFLICT'", params![account_id], |row| row.get(0)).map_err(|err| format!("outbox diagnostics conflict: {err}"))?;
    let last_delivery_failure = conn.query_row("SELECT last_error FROM nautilus_evidence_outbox WHERE account_id = ?1 AND last_error IS NOT NULL ORDER BY updated_at_ms DESC LIMIT 1", params![account_id], |row| row.get(0)).optional().map_err(|err| format!("outbox diagnostics error: {err}"))?;
    Ok(EvidenceOutboxDiagnostics { pending_count, conflict_count, last_delivery_failure })
}

#[tauri::command]
pub fn enqueue_nautilus_evidence_outbox(app: AppHandle, account_id: String, events: Vec<Value>) -> Result<EvidenceOutboxEnqueueResult, String> {
    enqueue_at_path(&app_db_path(&app)?, &account_id, &events)
}

#[tauri::command]
pub fn list_nautilus_evidence_outbox(app: AppHandle, account_id: String) -> Result<Vec<EvidenceOutboxItem>, String> {
    list_at_path(&app_db_path(&app)?, &account_id)
}

#[tauri::command]
pub fn ack_nautilus_evidence_outbox(app: AppHandle, account_id: String, event_ids: Vec<String>) -> Result<(), String> {
    ack_at_path(&app_db_path(&app)?, &account_id, &event_ids)
}

#[tauri::command]
pub fn mark_nautilus_evidence_outbox_failure(app: AppHandle, account_id: String, event_ids: Vec<String>, status: String, error: String) -> Result<(), String> {
    mark_failure_at_path(&app_db_path(&app)?, &account_id, &event_ids, &status, &error)
}

#[tauri::command]
pub fn nautilus_evidence_outbox_diagnostics(app: AppHandle, account_id: String) -> Result<EvidenceOutboxDiagnostics, String> {
    diagnostics_at_path(&app_db_path(&app)?, &account_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path() -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("r1w2-outbox-{}-{nonce}.sqlite", std::process::id()))
    }

    fn event(id: &str, price: &str) -> Value {
        serde_json::json!({
            "eventId": id, "eventType": "OrderFilled", "tsEventNs": "1700000000000000001", "tsInitNs": "1700000000000000002",
            "environment": "PAPER", "source": "NAUTILUS_PAPER", "quantity": "0.123456789", "price": price,
            "triggerPrice": "120000.00000001", "reason": null, "metadata": null, "tags": ["GT_PROTECTION=STOP_LOSS"], "linkedOrderIds": [],
            "reduceOnly": true, "reduceOnlySource": "EVENT_FACTUAL", "tagsSource": "EVENT_FACTUAL"
        })
    }

    #[test]
    fn reload_preserves_exact_payload_and_deduplicates() {
        let path = temp_path();
        let first = event("event-a", "123456.12345678");
        enqueue_at_path(&path, "account-a", std::slice::from_ref(&first)).expect("enqueue");
        let reopened = open_connection(&path).expect("reopen");
        let journal_mode: String = reopened
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .expect("journal mode");
        let synchronous: i64 = reopened
            .query_row("PRAGMA synchronous", [], |row| row.get(0))
            .expect("synchronous");
        assert_eq!(journal_mode.to_ascii_lowercase(), "wal");
        assert_eq!(synchronous, 2);
        drop(reopened);
        let loaded = list_at_path(&path, "account-a").expect("reload");
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].payload, first);
        let duplicate = enqueue_at_path(&path, "account-a", std::slice::from_ref(&first)).expect("duplicate");
        assert_eq!(duplicate.inserted_count, 0);
        assert_eq!(duplicate.duplicate_count, 1);
        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(path.with_extension("sqlite-wal"));
        let _ = fs::remove_file(path.with_extension("sqlite-shm"));
    }

    #[test]
    fn incompatible_local_duplicate_fails_closed() {
        let path = temp_path();
        enqueue_at_path(&path, "account-a", &[event("event-a", "1")]).expect("enqueue");
        let result = enqueue_at_path(&path, "account-a", &[event("event-a", "2")]);
        assert!(result.unwrap_err().contains("NAUTILUS_EVIDENCE_OUTBOX_CONFLICT"));
        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(path.with_extension("sqlite-wal"));
        let _ = fs::remove_file(path.with_extension("sqlite-shm"));
    }

    #[test]
    fn batch_conflict_rolls_back_all_new_rows() {
        let path = temp_path();
        enqueue_at_path(&path, "account-a", &[event("existing", "1")]).expect("seed");
        let result = enqueue_at_path(
            &path,
            "account-a",
            &[event("new-before-conflict", "2"), event("existing", "3")],
        );
        assert!(result.unwrap_err().contains("NAUTILUS_EVIDENCE_OUTBOX_CONFLICT"));
        let loaded = list_at_path(&path, "account-a").expect("list");
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].event_id, "existing");
        assert_eq!(loaded[0].payload, event("existing", "1"));
        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(path.with_extension("sqlite-wal"));
        let _ = fs::remove_file(path.with_extension("sqlite-shm"));
    }
}

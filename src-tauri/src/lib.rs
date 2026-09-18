pub mod candle_store;
pub mod evidence_outbox;
pub mod nautilus_daemon;
pub mod nautilus_simulation;

use crate::candle_store::{
    candle_db_path, candle_store_stats, clear_candle_store, init_candle_store, read_candle_page,
    upsert_candle_batch, CandleIdentity, CandlePageResult, CandleRow, CandleStoreInitResult,
    CandleStoreStats,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use tauri::{path::BaseDirectory, AppHandle, Manager};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopStoragePaths {
    mode: String,
    base_dir: String,
    config: String,
    cache: String,
    data: String,
    logs: String,
    sessions: String,
    heatmap: String,
    temp: String,
    settings_file: String,
    log_file: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopLogEvent {
    ts: String,
    event: String,
    #[serde(default)]
    payload: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarketDataCacheInput {
    key: String,
    #[serde(default)]
    payload: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HeatmapCacheInput {
    key: String,
    day: Option<String>,
    #[serde(default)]
    payload: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HeatmapSessionMetadataInput {
    symbol: String,
    source: String,
    started_at: String,
    ended_at: Option<String>,
    bucket_ms: Option<u64>,
    depth: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LogTailInput {
    lines: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenDesktopPathInput {
    target: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CandleHistoryKeyInput {
    exchange: String,
    market_type: String,
    symbol: String,
    timeframe: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CandleHistoryReadInput {
    key: CandleHistoryKeyInput,
    before_ms: Option<i64>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CandleHistoryUpsertInput {
    key: CandleHistoryKeyInput,
    candles: Vec<CandleHistoryRowInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CandleHistoryRowInput {
    open_time_ms: i64,
    open: f64,
    high: f64,
    low: f64,
    close: f64,
    volume: f64,
}

fn app_base_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("app_data_dir: {err}"))?;
    let roaming_dir = app_data_dir.parent().unwrap_or(app_data_dir.as_path());
    Ok(roaming_dir.join("GoodTrading Terminal"))
}

fn storage_paths(app: &AppHandle) -> Result<(PathBuf, DesktopStoragePaths), String> {
    let base = app_base_dir(app)?;
    let config = base.join("Config");
    let cache = base.join("Cache");
    let data = base.join("Data");
    let logs = base.join("Logs");
    let sessions = base.join("Sessions");
    let heatmap = base.join("Heatmap");
    let temp = base.join("Temp");
    let settings_file = config.join("settings.json");
    let log_file = logs.join("desktop.log");
    let paths = DesktopStoragePaths {
        mode: "tauri".to_string(),
        base_dir: path_string(&base),
        config: path_string(&config),
        cache: path_string(&cache),
        data: path_string(&data),
        logs: path_string(&logs),
        sessions: path_string(&sessions),
        heatmap: path_string(&heatmap),
        temp: path_string(&temp),
        settings_file: path_string(&settings_file),
        log_file: path_string(&log_file),
    };
    Ok((base, paths))
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn ensure_storage_dirs(base: &Path) -> Result<(), String> {
    for dir in [
        "Cache", "Config", "Data", "Logs", "Sessions", "Heatmap", "Temp",
    ] {
        fs::create_dir_all(base.join(dir)).map_err(|err| format!("create {dir}: {err}"))?;
    }
    Ok(())
}

fn read_json_file(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(json!({}));
    }
    let raw = fs::read_to_string(path).map_err(|err| format!("read json: {err}"))?;
    serde_json::from_str(&raw).map_err(|err| format!("parse json: {err}"))
}

fn write_json_file(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("create parent: {err}"))?;
    }
    let raw =
        serde_json::to_string_pretty(value).map_err(|err| format!("serialize json: {err}"))?;
    fs::write(path, raw).map_err(|err| format!("write json: {err}"))
}

fn merge_json(base: &mut Value, patch: Value) {
    match (base, patch) {
        (Value::Object(base_obj), Value::Object(patch_obj)) => {
            for (key, value) in patch_obj {
                if value.is_object() && base_obj.get(&key).is_some_and(Value::is_object) {
                    if let Some(existing) = base_obj.get_mut(&key) {
                        merge_json(existing, value);
                    }
                } else {
                    base_obj.insert(key, value);
                }
            }
        }
        (base_slot, next) => {
            *base_slot = next;
        }
    }
}

fn safe_file_stem(value: &str) -> String {
    let cleaned: String = value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
        .collect();
    if cleaned.is_empty() {
        "cache".to_string()
    } else {
        cleaned
    }
}

#[tauri::command]
fn init_desktop_storage(app: AppHandle, settings: Value) -> Result<DesktopStoragePaths, String> {
    let (base, paths) = storage_paths(&app)?;
    ensure_storage_dirs(&base)?;
    let settings_path = base.join("Config").join("settings.json");
    let mut current = read_json_file(&settings_path)?;
    merge_json(&mut current, settings);
    write_json_file(&settings_path, &current)?;
    Ok(paths)
}

#[tauri::command]
fn get_desktop_storage_paths(app: AppHandle) -> Result<DesktopStoragePaths, String> {
    let (base, paths) = storage_paths(&app)?;
    ensure_storage_dirs(&base)?;
    Ok(paths)
}

#[tauri::command]
fn write_desktop_log(app: AppHandle, entry: DesktopLogEvent) -> Result<(), String> {
    let (base, _) = storage_paths(&app)?;
    ensure_storage_dirs(&base)?;
    let log_path = base.join("Logs").join("desktop.log");
    let mut line = Map::new();
    line.insert("ts".to_string(), Value::String(entry.ts));
    line.insert("event".to_string(), Value::String(entry.event));
    line.insert("payload".to_string(), entry.payload);
    let serialized = serde_json::to_string(&Value::Object(line))
        .map_err(|err| format!("serialize log: {err}"))?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|err| format!("open log: {err}"))?;
    writeln!(file, "{serialized}").map_err(|err| format!("write log: {err}"))
}

#[tauri::command]
fn read_desktop_log_tail(app: AppHandle, input: LogTailInput) -> Result<String, String> {
    let (base, _) = storage_paths(&app)?;
    ensure_storage_dirs(&base)?;
    let log_path = base.join("Logs").join("desktop.log");
    if !log_path.exists() {
        return Ok(String::new());
    }
    let raw = fs::read_to_string(log_path).map_err(|err| format!("read log tail: {err}"))?;
    let limit = input.lines.unwrap_or(300).clamp(20, 2_000);
    let mut lines = raw.lines().rev().take(limit).collect::<Vec<_>>();
    lines.reverse();
    Ok(lines.join("\n"))
}

#[tauri::command]
fn open_desktop_storage_path(app: AppHandle, input: OpenDesktopPathInput) -> Result<(), String> {
    let (base, _) = storage_paths(&app)?;
    ensure_storage_dirs(&base)?;
    let target = match input.target.as_str() {
        "appData" => base,
        "logs" => base.join("Logs"),
        "sessions" => base.join("Sessions"),
        "heatmap" => base.join("Heatmap"),
        _ => return Err("unsupported storage target".to_string()),
    };
    fs::create_dir_all(&target).map_err(|err| format!("create open target: {err}"))?;
    Command::new("explorer")
        .arg(&target)
        .spawn()
        .map_err(|err| format!("open folder: {err}"))?;
    Ok(())
}

fn candle_history_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app_base_dir(app)?;
    Ok(candle_db_path(&base))
}

fn candle_identity_from_input(input: CandleHistoryKeyInput) -> CandleIdentity {
    CandleIdentity {
        exchange: input.exchange,
        market_type: input.market_type,
        symbol: input.symbol,
        timeframe: input.timeframe,
    }
}

fn candle_rows_from_input(rows: Vec<CandleHistoryRowInput>) -> Vec<CandleRow> {
    rows.into_iter()
        .map(|row| CandleRow {
            open_time_ms: row.open_time_ms,
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: row.volume,
        })
        .collect()
}

#[tauri::command]
fn init_candle_history_store(app: AppHandle) -> Result<CandleStoreInitResult, String> {
    let db_path = candle_history_db_path(&app)?;
    init_candle_store(&db_path)
}

#[tauri::command]
fn read_candle_history_page(
    app: AppHandle,
    input: CandleHistoryReadInput,
) -> Result<CandlePageResult, String> {
    let db_path = candle_history_db_path(&app)?;
    let identity = candle_identity_from_input(input.key);
    let limit = input.limit.unwrap_or(1000);
    read_candle_page(&db_path, &identity, input.before_ms, limit)
}

#[tauri::command]
fn upsert_candle_history_batch(
    app: AppHandle,
    input: CandleHistoryUpsertInput,
) -> Result<usize, String> {
    let db_path = candle_history_db_path(&app)?;
    let identity = candle_identity_from_input(input.key);
    let candles = candle_rows_from_input(input.candles);
    upsert_candle_batch(&db_path, &identity, &candles)
}

#[tauri::command]
fn get_candle_history_stats(app: AppHandle) -> Result<CandleStoreStats, String> {
    let db_path = candle_history_db_path(&app)?;
    candle_store_stats(&db_path)
}

#[tauri::command]
fn clear_candle_history_store(app: AppHandle) -> Result<(), String> {
    let db_path = candle_history_db_path(&app)?;
    clear_candle_store(&db_path)
}

#[tauri::command]
fn read_desktop_config(app: AppHandle) -> Result<Value, String> {
    let (base, _) = storage_paths(&app)?;
    ensure_storage_dirs(&base)?;
    read_json_file(&base.join("Config").join("settings.json"))
}

#[tauri::command]
fn write_desktop_config(app: AppHandle, config_patch: Value) -> Result<Value, String> {
    let (base, _) = storage_paths(&app)?;
    ensure_storage_dirs(&base)?;
    let settings_path = base.join("Config").join("settings.json");
    let mut current = read_json_file(&settings_path)?;
    merge_json(&mut current, config_patch);
    write_json_file(&settings_path, &current)?;
    Ok(current)
}

#[tauri::command]
fn write_market_data_cache(app: AppHandle, input: MarketDataCacheInput) -> Result<String, String> {
    let (base, _) = storage_paths(&app)?;
    ensure_storage_dirs(&base)?;
    let path = base
        .join("Data")
        .join(format!("{}.json", safe_file_stem(&input.key)));
    write_json_file(&path, &input.payload)?;
    Ok(path_string(&path))
}

#[tauri::command]
fn write_heatmap_cache(app: AppHandle, input: HeatmapCacheInput) -> Result<String, String> {
    let (base, _) = storage_paths(&app)?;
    ensure_storage_dirs(&base)?;
    let day = input.day.unwrap_or_else(|| "unknown-day".to_string());
    let dir = base.join("Heatmap").join(safe_file_stem(&day));
    fs::create_dir_all(&dir).map_err(|err| format!("create heatmap dir: {err}"))?;
    let path = dir.join(format!("{}.json", safe_file_stem(&input.key)));
    write_json_file(&path, &input.payload)?;
    Ok(path_string(&path))
}

#[tauri::command]
fn clear_temp_cache(app: AppHandle) -> Result<(), String> {
    let (base, _) = storage_paths(&app)?;
    let temp = base.join("Temp");
    if temp.exists() {
        fs::remove_dir_all(&temp).map_err(|err| format!("clear temp: {err}"))?;
    }
    fs::create_dir_all(temp).map_err(|err| format!("recreate temp: {err}"))
}

#[tauri::command]
fn write_heatmap_session_metadata(
    app: AppHandle,
    metadata: HeatmapSessionMetadataInput,
) -> Result<String, String> {
    let (base, _) = storage_paths(&app)?;
    ensure_storage_dirs(&base)?;
    let day = metadata.started_at.get(0..10).unwrap_or("unknown-day");
    let timestamp = safe_file_stem(&metadata.started_at.replace(':', "-"));
    let dir = base.join("Sessions").join(day);
    fs::create_dir_all(&dir).map_err(|err| format!("create session dir: {err}"))?;
    let path = dir.join(format!("session-{timestamp}.json"));
    let payload = json!({
      "symbol": metadata.symbol,
      "source": metadata.source,
      "startedAt": metadata.started_at,
      "endedAt": metadata.ended_at,
      "bucketMs": metadata.bucket_ms,
      "depth": metadata.depth,
    });
    write_json_file(&path, &payload)?;
    Ok(path_string(&path))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            init_desktop_storage,
            get_desktop_storage_paths,
            write_desktop_log,
            read_desktop_log_tail,
            open_desktop_storage_path,
            read_desktop_config,
            write_desktop_config,
            write_market_data_cache,
            write_heatmap_cache,
            clear_temp_cache,
            write_heatmap_session_metadata,
            init_candle_history_store,
            read_candle_history_page,
            upsert_candle_history_batch,
            get_candle_history_stats,
            clear_candle_history_store,
            evidence_outbox::enqueue_nautilus_evidence_outbox,
            evidence_outbox::list_nautilus_evidence_outbox,
            evidence_outbox::ack_nautilus_evidence_outbox,
            evidence_outbox::mark_nautilus_evidence_outbox_failure,
            evidence_outbox::nautilus_evidence_outbox_diagnostics,
            nautilus_daemon::nautilus_engine_start,
            nautilus_daemon::nautilus_engine_status,
            nautilus_daemon::nautilus_engine_ping,
            nautilus_daemon::nautilus_engine_version,
            nautilus_daemon::nautilus_engine_stop,
            nautilus_simulation::nautilus_simulation_status,
            nautilus_simulation::nautilus_simulation_force_quote_disconnect_diagnostic,
            nautilus_simulation::nautilus_simulation_start,
            nautilus_simulation::nautilus_simulation_stop,
            nautilus_simulation::nautilus_simulation_reset,
            nautilus_simulation::nautilus_simulation_submit_order,
            nautilus_simulation::nautilus_simulation_close_position,
            nautilus_simulation::nautilus_simulation_cancel_order,
            nautilus_simulation::nautilus_simulation_replace_order,
            nautilus_simulation::nautilus_simulation_get_order,
            nautilus_simulation::nautilus_simulation_list_orders,
            nautilus_simulation::nautilus_simulation_list_order_events,
            nautilus_simulation::nautilus_simulation_list_fills,
            nautilus_simulation::nautilus_simulation_get_position,
            nautilus_simulation::nautilus_simulation_get_account,
            nautilus_simulation::nautilus_simulation_apply_market_snapshot,
            nautilus_simulation::nautilus_simulation_inject_quote_diagnostic,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let mut manager = nautilus_daemon::NautilusProcessManager::new();
            if let Ok(runtime_root) = app
                .path()
                .resolve("nautilus-runtime", BaseDirectory::Resource)
            {
                manager.set_packaged_runtime_root(runtime_root);
            }
            app.manage(Mutex::new(manager));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

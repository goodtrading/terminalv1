use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

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
struct HeatmapSessionMetadataInput {
  symbol: String,
  source: String,
  started_at: String,
  ended_at: Option<String>,
  bucket_ms: Option<u64>,
  depth: Option<u64>,
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
  for dir in ["Cache", "Config", "Data", "Logs", "Sessions", "Heatmap", "Temp"] {
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
  let raw = serde_json::to_string_pretty(value).map_err(|err| format!("serialize json: {err}"))?;
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
  let serialized =
    serde_json::to_string(&Value::Object(line)).map_err(|err| format!("serialize log: {err}"))?;
  let mut file = OpenOptions::new()
    .create(true)
    .append(true)
    .open(log_path)
    .map_err(|err| format!("open log: {err}"))?;
  writeln!(file, "{serialized}").map_err(|err| format!("write log: {err}"))
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
    .invoke_handler(tauri::generate_handler![
      init_desktop_storage,
      get_desktop_storage_paths,
      write_desktop_log,
      read_desktop_config,
      write_desktop_config,
      write_market_data_cache,
      clear_temp_cache,
      write_heatmap_session_metadata,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

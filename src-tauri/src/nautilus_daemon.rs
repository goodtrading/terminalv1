use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::State;

pub const PROTOCOL_VERSION: u32 = 1;
pub const EXPECTED_NAUTILUS_VERSION: &str = "1.231.0";
const DEFAULT_REQUEST_TIMEOUT: Duration = Duration::from_secs(5);
const DEFAULT_STARTUP_TIMEOUT: Duration = Duration::from_secs(60);
const DEFAULT_STOP_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum NautilusProcessState {
    Stopped,
    Starting,
    Healthy,
    Unhealthy,
    Stopping,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NautilusEngineStatus {
    pub state: NautilusProcessState,
    pub pid: Option<u32>,
    pub service: Option<String>,
    pub protocol_version: Option<u32>,
    pub nautilus_version: Option<String>,
    pub python_version: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NautilusEngineVersion {
    pub protocol_version: u32,
    pub nautilus_version: String,
    pub python_version: String,
    pub pid: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NautilusEnginePing {
    pub pong: bool,
}

#[derive(Debug)]
struct RunningDaemon {
    child: Child,
    stdin: ChildStdin,
    stdout_rx: Receiver<String>,
    pid: u32,
    service: Option<String>,
    protocol_version: Option<u32>,
    nautilus_version: Option<String>,
    python_version: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) enum NautilusRequestError {
    Transport(String),
    Protocol(String),
    RequestIdMismatch {
        expected: String,
        actual: Option<String>,
        response: String,
    },
}

impl std::fmt::Display for NautilusRequestError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Transport(message) => write!(f, "transport error: {message}"),
            Self::Protocol(message) => write!(f, "protocol error: {message}"),
            Self::RequestIdMismatch {
                expected,
                actual,
                response,
            } => write!(
                f,
                "request id mismatch: expected {expected}, got {:?}; response={response}",
                actual
            ),
        }
    }
}

impl std::error::Error for NautilusRequestError {}

fn timeout_request_error(
    operation: &str,
    request_id: &str,
    timeout_ms: u128,
    elapsed_ms: u128,
) -> NautilusRequestError {
    NautilusRequestError::Transport(format!(
        "timeout waiting for nautilus daemon response op={operation} request_id={request_id} timeout_ms={timeout_ms} elapsed_ms={elapsed_ms}"
    ))
}

#[derive(Debug)]
pub struct NautilusProcessManager {
    python_interpreter_override: Option<PathBuf>,
    packaged_runtime_root: Option<PathBuf>,
    state: NautilusProcessState,
    running: Option<RunningDaemon>,
    last_error: Option<String>,
    request_counter: u64,
}

impl Default for NautilusProcessManager {
    fn default() -> Self {
        Self::new()
    }
}

impl NautilusProcessManager {
    pub fn new() -> Self {
        Self {
            python_interpreter_override: None,
            packaged_runtime_root: None,
            state: NautilusProcessState::Stopped,
            running: None,
            last_error: None,
            request_counter: 0,
        }
    }

    pub fn with_python_interpreter(path: impl Into<PathBuf>) -> Self {
        Self {
            python_interpreter_override: Some(path.into()),
            packaged_runtime_root: None,
            state: NautilusProcessState::Stopped,
            running: None,
            last_error: None,
            request_counter: 0,
        }
    }

    pub fn with_packaged_runtime_root(path: impl Into<PathBuf>) -> Self {
        Self {
            python_interpreter_override: None,
            packaged_runtime_root: Some(path.into()),
            state: NautilusProcessState::Stopped,
            running: None,
            last_error: None,
            request_counter: 0,
        }
    }

    pub fn set_packaged_runtime_root(&mut self, path: impl Into<PathBuf>) {
        self.packaged_runtime_root = Some(path.into());
    }

    pub fn start(&mut self) -> Result<NautilusEngineStatus, String> {
        self.refresh_child_state()?;
        if matches!(self.state, NautilusProcessState::Healthy) && self.running.is_some() {
            return Ok(self.snapshot());
        }
        if matches!(
            self.state,
            NautilusProcessState::Starting | NautilusProcessState::Stopping
        ) {
            return Err(format!("nautilus daemon is currently {:?}", self.state));
        }

        self.state = NautilusProcessState::Starting;
        self.last_error = None;

        let python = self.resolve_python_interpreter()?;
        let script = self.daemon_script_path()?;
        let mut running = self.spawn_daemon(&python, &script)?;

        let request_id = self.next_request_id();
        let health = Self::send_request(
            &mut running,
            json!({"id": request_id, "op": "health"}),
            DEFAULT_STARTUP_TIMEOUT,
        )
        .map_err(|err| err.to_string())
        .and_then(|response| self.parse_health_response(&response))
        .map_err(|err| {
            let _ = Self::force_kill(&mut running.child);
            err
        })?;

        running.protocol_version = health.protocol_version;
        running.nautilus_version = health.nautilus_version;
        running.python_version = health.python_version;
        running.service = health.service;

        self.state = NautilusProcessState::Healthy;
        self.running = Some(running);
        self.last_error = None;
        Ok(self.snapshot())
    }

    pub fn status(&mut self) -> Result<NautilusEngineStatus, String> {
        self.refresh_child_state()?;
        Ok(self.snapshot())
    }

    pub fn ping(&mut self) -> Result<NautilusEnginePing, String> {
        self.refresh_child_state()?;
        let request_id = self.next_request_id();
        let response = {
            let running = self.running_mut()?;
            Self::send_request(
                running,
                json!({"id": request_id, "op": "ping"}),
                DEFAULT_REQUEST_TIMEOUT,
            )
            .map_err(|err| err.to_string())
        }?;
        if response.get("ok").and_then(Value::as_bool) != Some(true) {
            return Err(self.parse_protocol_error(&response));
        }
        let pong = response
            .get("result")
            .and_then(|result| result.get("pong"))
            .and_then(Value::as_bool)
            .ok_or_else(|| "nautilus ping response missing pong".to_string())?;
        Ok(NautilusEnginePing { pong })
    }

    pub fn version(&mut self) -> Result<NautilusEngineVersion, String> {
        self.refresh_child_state()?;
        let request_id = self.next_request_id();
        let version = {
            let running = self.running_mut()?;
            let response = Self::send_request(
                running,
                json!({"id": request_id, "op": "version"}),
                DEFAULT_REQUEST_TIMEOUT,
            )
            .map_err(|err| err.to_string())?;
            if response.get("ok").and_then(Value::as_bool) != Some(true) {
                return Err(self.parse_protocol_error(&response));
            }
            let result = response
                .get("result")
                .ok_or_else(|| "nautilus version response missing result".to_string())?;
            let version = NautilusEngineVersion {
                protocol_version: result
                    .get("protocolVersion")
                    .and_then(Value::as_u64)
                    .ok_or_else(|| {
                        "nautilus version response missing protocolVersion".to_string()
                    })? as u32,
                nautilus_version: result
                    .get("nautilusVersion")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "nautilus version response missing nautilusVersion".to_string())?
                    .to_string(),
                python_version: result
                    .get("pythonVersion")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "nautilus version response missing pythonVersion".to_string())?
                    .to_string(),
                pid: result
                    .get("pid")
                    .and_then(Value::as_u64)
                    .ok_or_else(|| "nautilus version response missing pid".to_string())?
                    as u32,
            };
            running.protocol_version = Some(version.protocol_version);
            running.nautilus_version = Some(version.nautilus_version.clone());
            running.python_version = Some(version.python_version.clone());
            version
        };
        Ok(version)
    }

    pub fn stop(&mut self) -> Result<NautilusEngineStatus, String> {
        self.refresh_child_state()?;
        if self.running.is_none() {
            self.state = NautilusProcessState::Stopped;
            self.last_error = None;
            return Ok(self.snapshot());
        }

        self.state = NautilusProcessState::Stopping;
        let mut running = self.running.take().expect("running process");
        let request_id = self.next_request_id();
        let _ = Self::send_request(
            &mut running,
            json!({"id": request_id, "op": "shutdown"}),
            DEFAULT_REQUEST_TIMEOUT,
        );

        let exited = Self::wait_for_exit(&mut running.child, DEFAULT_STOP_TIMEOUT)?;
        if !exited {
            let _ = Self::force_kill(&mut running.child);
            let _ = Self::wait_for_exit(&mut running.child, Duration::from_secs(2));
        }

        self.state = NautilusProcessState::Stopped;
        self.last_error = None;
        Ok(self.snapshot())
    }

    fn snapshot(&self) -> NautilusEngineStatus {
        NautilusEngineStatus {
            state: self.state,
            pid: self.running.as_ref().map(|running| running.pid),
            service: self
                .running
                .as_ref()
                .and_then(|running| running.service.clone()),
            protocol_version: self
                .running
                .as_ref()
                .and_then(|running| running.protocol_version),
            nautilus_version: self
                .running
                .as_ref()
                .and_then(|running| running.nautilus_version.clone()),
            python_version: self
                .running
                .as_ref()
                .and_then(|running| running.python_version.clone()),
            last_error: self.last_error.clone(),
        }
    }

    fn running_mut(&mut self) -> Result<&mut RunningDaemon, String> {
        self.refresh_child_state()?;
        self.running
            .as_mut()
            .ok_or_else(|| "nautilus daemon is not running".to_string())
    }

    fn resolve_python_interpreter(&self) -> Result<PathBuf, String> {
        let path = if let Some(override_path) = &self.python_interpreter_override {
            override_path.clone()
        } else if let Some(runtime_root) = &self.packaged_runtime_root {
            runtime_root.join("python.exe")
        } else {
            if cfg!(debug_assertions) {
                let configured = env::var("GT_NAUTILUS_PYTHON")
                    .map_err(|_| "GT_NAUTILUS_PYTHON is not configured".to_string())?;
                let trimmed = configured.trim();
                if trimmed.is_empty() {
                    return Err("GT_NAUTILUS_PYTHON is empty".to_string());
                }
                PathBuf::from(trimmed)
            } else {
                return Err("packaged Nautilus runtime is not configured".to_string());
            }
        };

        if !path.exists() {
            return Err(format!(
                "nautilus runtime python not found: {}",
                path.display()
            ));
        }
        Ok(path)
    }

    fn daemon_script_path(&self) -> Result<PathBuf, String> {
        let path = if let Some(runtime_root) = &self.packaged_runtime_root {
            runtime_root.join("daemon.py")
        } else {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .ok_or_else(|| "unable to resolve repo root for daemon script".to_string())?
                .join("scripts")
                .join("nautilus_bridge")
                .join("daemon.py")
        };
        if !path.exists() {
            return Err(format!(
                "nautilus daemon script not found: {}",
                path.display()
            ));
        }
        Ok(path)
    }

    fn spawn_daemon(&self, python: &Path, script: &Path) -> Result<RunningDaemon, String> {
        let mut command = Command::new(python);
        command
            .arg(script)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = command
            .spawn()
            .map_err(|err| format!("spawn nautilus daemon: {err}"))?;
        let pid = child.id();
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "daemon stdin missing".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "daemon stdout missing".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "daemon stderr missing".to_string())?;
        let stdout_rx = Self::spawn_stdout_reader(stdout);
        Self::spawn_stderr_reader(stderr);

        Ok(RunningDaemon {
            child,
            stdin,
            stdout_rx,
            pid,
            service: None,
            protocol_version: None,
            nautilus_version: None,
            python_version: None,
        })
    }

    fn spawn_stdout_reader(stdout: ChildStdout) -> Receiver<String> {
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line) {
                    Ok(0) => break,
                    Ok(_) => {
                        let payload = line.trim_end_matches(['\r', '\n']).to_string();
                        if tx.send(payload).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });
        rx
    }

    fn spawn_stderr_reader(stderr: ChildStderr) {
        thread::spawn(move || {
            let mut reader = BufReader::new(stderr);
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line) {
                    Ok(0) => break,
                    Ok(_) => {
                        let trimmed = line.trim_end_matches(['\r', '\n']);
                        if !trimmed.is_empty() {
                            eprintln!("[nautilus-daemon] {trimmed}");
                        }
                    }
                    Err(_) => break,
                }
            }
        });
    }

    pub(crate) fn request(
        &mut self,
        op: &str,
        params: Option<Value>,
    ) -> Result<Value, NautilusRequestError> {
        self.refresh_child_state()
            .map_err(NautilusRequestError::Transport)?;
        let request_id = self.next_request_id();
        let request = match params {
            Some(params) => json!({"id": request_id.clone(), "op": op, "params": params}),
            None => json!({"id": request_id.clone(), "op": op}),
        };
        let running = self
            .running_mut()
            .map_err(NautilusRequestError::Transport)?;
        let response = Self::send_request(running, request, DEFAULT_REQUEST_TIMEOUT)?;
        Self::validate_response_envelope(&request_id, &response)?;
        Ok(response)
    }

    fn send_request(
        running: &mut RunningDaemon,
        request: Value,
        timeout: Duration,
    ) -> Result<Value, NautilusRequestError> {
        let request_id = request
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        let operation = request
            .get("op")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        let timeout_ms = timeout.as_millis();
        let serialized = serde_json::to_string(&request)
            .map_err(|err| NautilusRequestError::Protocol(format!("serialize request: {err}")))?;
        writeln!(running.stdin, "{serialized}")
            .map_err(|err| NautilusRequestError::Transport(format!("write daemon stdin: {err}")))?;
        running
            .stdin
            .flush()
            .map_err(|err| NautilusRequestError::Transport(format!("flush daemon stdin: {err}")))?;

        let start = Instant::now();
        loop {
            let remaining = timeout
                .checked_sub(start.elapsed())
                .unwrap_or_else(|| Duration::from_millis(0));
            if remaining.is_zero() {
                let elapsed_ms = start.elapsed().as_millis();
                eprintln!(
                    "[NAUTILUS REQUEST] id={request_id} op={operation} timeoutMs={timeout_ms} elapsedMs={elapsed_ms} result=timeout"
                );
                return Err(timeout_request_error(operation, request_id, timeout_ms, elapsed_ms));
            }
            match running.stdout_rx.recv_timeout(remaining) {
                Ok(raw) => {
                    let elapsed_ms = start.elapsed().as_millis();
                    let response: Value = match serde_json::from_str(&raw) {
                        Ok(response) => response,
                        Err(err) => {
                            eprintln!(
                                "[NAUTILUS REQUEST] id={request_id} op={operation} timeoutMs={timeout_ms} elapsedMs={elapsed_ms} result=protocol_error"
                            );
                            return Err(NautilusRequestError::Protocol(format!(
                                "parse daemon response: {err}; raw={raw}"
                            )));
                        }
                    };
                    eprintln!(
                        "[NAUTILUS REQUEST] id={request_id} op={operation} timeoutMs={timeout_ms} elapsedMs={elapsed_ms} result=ok"
                    );
                    return Ok(response);
                }
                Err(RecvTimeoutError::Timeout) => {
                    let elapsed_ms = start.elapsed().as_millis();
                    eprintln!(
                        "[NAUTILUS REQUEST] id={request_id} op={operation} timeoutMs={timeout_ms} elapsedMs={elapsed_ms} result=timeout"
                    );
                    return Err(timeout_request_error(
                        operation, request_id, timeout_ms, elapsed_ms,
                    ));
                }
                Err(RecvTimeoutError::Disconnected) => {
                    let elapsed_ms = start.elapsed().as_millis();
                    eprintln!(
                        "[NAUTILUS REQUEST] id={request_id} op={operation} timeoutMs={timeout_ms} elapsedMs={elapsed_ms} result=transport_error"
                    );
                    return Err(NautilusRequestError::Transport(
                        format!(
                            "nautilus daemon stdout closed unexpectedly op={operation} request_id={request_id} timeout_ms={timeout_ms} elapsed_ms={elapsed_ms}"
                        ),
                    ));
                }
            }
        }
    }

    fn validate_response_envelope(
        expected_id: &str,
        response: &Value,
    ) -> Result<(), NautilusRequestError> {
        let actual = response
            .get("id")
            .and_then(Value::as_str)
            .map(ToString::to_string);
        if actual.as_deref() != Some(expected_id) {
            return Err(NautilusRequestError::RequestIdMismatch {
                expected: expected_id.to_string(),
                actual,
                response: response.to_string(),
            });
        }
        Ok(())
    }

    fn parse_health_response(&self, response: &Value) -> Result<NautilusEngineStatus, String> {
        if response.get("ok").and_then(Value::as_bool) != Some(true) {
            return Err(self.parse_protocol_error(response));
        }
        let result = response
            .get("result")
            .ok_or_else(|| "health response missing result".to_string())?;
        let status = result
            .get("status")
            .and_then(Value::as_str)
            .ok_or_else(|| "health response missing status".to_string())?;
        if status != "healthy" {
            return Err(format!(
                "health response reported unexpected status: {status}"
            ));
        }

        let service = result
            .get("service")
            .and_then(Value::as_str)
            .ok_or_else(|| "health response missing service".to_string())?
            .to_string();
        let protocol_version = result
            .get("protocolVersion")
            .and_then(Value::as_u64)
            .ok_or_else(|| "health response missing protocolVersion".to_string())?
            as u32;
        if protocol_version != PROTOCOL_VERSION {
            return Err(format!(
        "nautilus protocol version mismatch: expected {PROTOCOL_VERSION}, got {protocol_version}"
      ));
        }
        let nautilus_version = result
            .get("nautilusVersion")
            .and_then(Value::as_str)
            .ok_or_else(|| "health response missing nautilusVersion".to_string())?
            .to_string();
        if nautilus_version != EXPECTED_NAUTILUS_VERSION {
            return Err(format!(
        "nautilus version mismatch: expected {EXPECTED_NAUTILUS_VERSION}, got {nautilus_version}"
      ));
        }
        let python_version = result
            .get("pythonVersion")
            .and_then(Value::as_str)
            .ok_or_else(|| "health response missing pythonVersion".to_string())?
            .to_string();
        let pid = result
            .get("pid")
            .and_then(Value::as_u64)
            .ok_or_else(|| "health response missing pid".to_string())? as u32;

        Ok(NautilusEngineStatus {
            state: NautilusProcessState::Healthy,
            pid: Some(pid),
            service: Some(service),
            protocol_version: Some(protocol_version),
            nautilus_version: Some(nautilus_version),
            python_version: Some(python_version),
            last_error: None,
        })
    }

    fn parse_protocol_error(&self, response: &Value) -> String {
        response
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .unwrap_or_else(|| format!("daemon request failed: {response}"))
    }

    fn refresh_child_state(&mut self) -> Result<(), String> {
        let exited = if let Some(running) = self.running.as_mut() {
            running
                .child
                .try_wait()
                .map_err(|err| format!("check nautilus daemon status: {err}"))?
        } else {
            None
        };

        if let Some(status) = exited {
            let was_stopping = matches!(self.state, NautilusProcessState::Stopping);
            self.running = None;
            self.state = if was_stopping {
                NautilusProcessState::Stopped
            } else {
                NautilusProcessState::Failed
            };
            self.last_error = if was_stopping {
                None
            } else {
                Some(format!("nautilus daemon exited unexpectedly: {status}"))
            };
        }
        Ok(())
    }

    fn wait_for_exit(child: &mut Child, timeout: Duration) -> Result<bool, String> {
        let start = Instant::now();
        loop {
            match child
                .try_wait()
                .map_err(|err| format!("wait for exit: {err}"))?
            {
                Some(_) => return Ok(true),
                None if start.elapsed() >= timeout => return Ok(false),
                None => thread::sleep(Duration::from_millis(50)),
            }
        }
    }

    fn force_kill(child: &mut Child) -> Result<(), String> {
        child
            .kill()
            .map_err(|err| format!("kill nautilus daemon: {err}"))
    }

    fn next_request_id(&mut self) -> String {
        self.request_counter += 1;
        format!("req-{}-{}", std::process::id(), self.request_counter)
    }
}

impl Drop for NautilusProcessManager {
    fn drop(&mut self) {
        if let Some(mut running) = self.running.take() {
            let _ = running.child.kill();
            let _ = running.child.wait();
        }
    }
}

fn lock_manager<'a>(
    state: &'a State<'a, Mutex<NautilusProcessManager>>,
) -> Result<std::sync::MutexGuard<'a, NautilusProcessManager>, String> {
    state
        .lock()
        .map_err(|_| "nautilus manager lock poisoned".to_string())
}

#[tauri::command]
pub fn nautilus_engine_start(
    state: State<'_, Mutex<NautilusProcessManager>>,
) -> Result<NautilusEngineStatus, String> {
    lock_manager(&state)?.start()
}

#[tauri::command]
pub fn nautilus_engine_status(
    state: State<'_, Mutex<NautilusProcessManager>>,
) -> Result<NautilusEngineStatus, String> {
    lock_manager(&state)?.status()
}

#[tauri::command]
pub fn nautilus_engine_ping(
    state: State<'_, Mutex<NautilusProcessManager>>,
) -> Result<NautilusEnginePing, String> {
    lock_manager(&state)?.ping()
}

#[tauri::command]
pub fn nautilus_engine_version(
    state: State<'_, Mutex<NautilusProcessManager>>,
) -> Result<NautilusEngineVersion, String> {
    lock_manager(&state)?.version()
}

#[tauri::command]
pub fn nautilus_engine_stop(
    state: State<'_, Mutex<NautilusProcessManager>>,
) -> Result<NautilusEngineStatus, String> {
    lock_manager(&state)?.stop()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn snapshot_defaults_to_stopped() {
        let manager = NautilusProcessManager::new();
        let snapshot = manager.snapshot();
        assert_eq!(snapshot.state, NautilusProcessState::Stopped);
        assert!(snapshot.pid.is_none());
    }

    #[test]
    fn request_validation_rejects_mismatched_ids() {
        let response = json!({"id": "other", "ok": true, "result": {"pong": true}});
        let error = NautilusProcessManager::validate_response_envelope("expected", &response)
            .expect_err("mismatched ids must fail");
        match error {
            NautilusRequestError::RequestIdMismatch {
                expected,
                actual,
                response,
            } => {
                assert_eq!(expected, "expected");
                assert_eq!(actual.as_deref(), Some("other"));
                assert!(response.contains("other"));
            }
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[test]
    fn timeout_error_preserves_request_diagnostics() {
        let error = timeout_request_error("simulation.start", "req-42-7", 5_000, 5_001);
        assert_eq!(
            error.to_string(),
            "transport error: timeout waiting for nautilus daemon response op=simulation.start request_id=req-42-7 timeout_ms=5000 elapsed_ms=5001"
        );
    }
}

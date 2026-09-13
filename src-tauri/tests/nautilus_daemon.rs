use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use app_lib::nautilus_daemon::{NautilusProcessManager, NautilusProcessState};
use serde_json::Value;

const EXPECTED_NAUTILUS_VERSION: &str = "1.231.0";
const EXPECTED_PYTHON: &str = "G:/Dev/nautilus-env/Scripts/python.exe";
const RAW_DAEMON_STARTUP_TIMEOUT: Duration = Duration::from_secs(25);
const RAW_DAEMON_RESPONSE_TIMEOUT: Duration = Duration::from_secs(20);
const RAW_DAEMON_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(20);

struct RawDaemon {
  child: Child,
  stdin: ChildStdin,
  stdout_rx: Receiver<String>,
}

impl RawDaemon {
  fn send_line_with_timeout(&mut self, line: &str, timeout: Duration) -> Value {
    writeln!(self.stdin, "{line}").expect("write stdin");
    self.stdin.flush().expect("flush stdin");
    let raw = self
      .stdout_rx
      .recv_timeout(timeout)
      .expect("response line");
    serde_json::from_str(&raw).expect("valid json response")
  }

  fn send_line(&mut self, line: &str) -> Value {
    self.send_line_with_timeout(line, RAW_DAEMON_RESPONSE_TIMEOUT)
  }

  fn shutdown(mut self) {
    let response = self.send_line(r#"{"id":"shutdown","op":"shutdown"}"#);
    assert_eq!(response["ok"], Value::Bool(true));
    let status = self
      .child
      .wait_timeout(RAW_DAEMON_SHUTDOWN_TIMEOUT)
      .expect("wait result");
    assert!(status.is_some(), "daemon should exit cleanly after shutdown");
  }
}

trait WaitTimeout {
  fn wait_timeout(
    &mut self,
    timeout: Duration,
  ) -> std::io::Result<Option<std::process::ExitStatus>>;
}

impl WaitTimeout for Child {
  fn wait_timeout(
    &mut self,
    timeout: Duration,
  ) -> std::io::Result<Option<std::process::ExitStatus>> {
    let start = std::time::Instant::now();
    loop {
      if let Some(status) = self.try_wait()? {
        return Ok(Some(status));
      }
      if start.elapsed() >= timeout {
        return Ok(None);
      }
      thread::sleep(Duration::from_millis(50));
    }
  }
}

fn repo_root() -> PathBuf {
  PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .expect("repo root")
    .to_path_buf()
}

fn daemon_script() -> PathBuf {
  repo_root()
    .join("scripts")
    .join("nautilus_bridge")
    .join("daemon.py")
}

fn python_interpreter() -> PathBuf {
  PathBuf::from(EXPECTED_PYTHON)
}

fn unique_temp_dir(prefix: &str) -> PathBuf {
  let stamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .expect("clock")
    .as_nanos();
  std::env::temp_dir().join(format!("goodtrading-{prefix}-{stamp}"))
}

fn spawn_raw_daemon(interpreter: &Path, args: &[&str], envs: &[(&str, &str)]) -> RawDaemon {
  let mut command = Command::new(interpreter);
  command
    .args(args)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
  for (key, value) in envs {
    command.env(key, value);
  }
  let mut child = command.spawn().expect("spawn daemon");
  let stdin = child.stdin.take().expect("stdin");
  let stdout = child.stdout.take().expect("stdout");
  let stderr = child.stderr.take().expect("stderr");
  let (tx, rx) = mpsc::channel();
  thread::spawn(move || read_stdout(stdout, tx));
  thread::spawn(move || read_stderr(stderr));
  RawDaemon { child, stdin, stdout_rx: rx }
}

fn read_stdout(stdout: ChildStdout, tx: mpsc::Sender<String>) {
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
}

fn read_stderr(stderr: ChildStderr) {
  let mut reader = BufReader::new(stderr);
  let mut line = String::new();
  loop {
    line.clear();
    match reader.read_line(&mut line) {
      Ok(0) => break,
      Ok(_) => {}
      Err(_) => break,
    }
  }
}

fn create_fake_nautilus_package(version: &str) -> PathBuf {
  let dir = unique_temp_dir("fake-nautilus");
  let pkg = dir.join("nautilus_trader");
  fs::create_dir_all(&pkg).expect("create fake package dir");
  fs::write(pkg.join("__init__.py"), format!("__version__ = {version:?}\n"))
    .expect("write fake package");
  dir
}

fn tasklist_has_pid(pid: u32) -> bool {
  let output = Command::new("tasklist")
    .args(["/FI", &format!("PID eq {pid}")])
    .output()
    .expect("tasklist");
  let stdout = String::from_utf8_lossy(&output.stdout);
  stdout.contains(&pid.to_string())
}

#[test]
fn daemon_protocol_starts_health_ping_version_and_shutdown_cleanly() {
  let mut manager = NautilusProcessManager::with_python_interpreter(python_interpreter());

  let started = manager.start().expect("start");
  println!("START pid={}", started.pid.expect("pid"));
  assert_eq!(started.state, NautilusProcessState::Healthy);
  assert_eq!(started.protocol_version, Some(1));
  assert_eq!(
    started.nautilus_version.as_deref(),
    Some(EXPECTED_NAUTILUS_VERSION)
  );
  println!(
    "HEALTH status={:?} protocolVersion={:?} nautilusVersion={:?} pythonVersion={:?}",
    started.state,
    started.protocol_version,
    started.nautilus_version,
    started.python_version
  );
  assert!(started.python_version.as_deref().unwrap().starts_with("3."));
  let pid = started.pid.expect("pid");

  let status = manager.status().expect("status");
  assert_eq!(status.state, NautilusProcessState::Healthy);
  assert_eq!(status.pid, Some(pid));

  let ping = manager.ping().expect("ping");
  println!("PING pong={}", ping.pong);
  assert!(ping.pong);

  let version = manager.version().expect("version");
  println!(
    "VERSION protocolVersion={} nautilusVersion={} pythonVersion={}",
    version.protocol_version, version.nautilus_version, version.python_version
  );
  assert_eq!(version.protocol_version, 1);
  assert_eq!(version.nautilus_version, EXPECTED_NAUTILUS_VERSION);
  assert!(version.python_version.starts_with("3."));

  let second_start = manager.start().expect("idempotent start");
  assert_eq!(second_start.pid, Some(pid));

  let stopped = manager.stop().expect("stop");
  println!("STOP state={:?} pid={:?}", stopped.state, stopped.pid);
  assert_eq!(stopped.state, NautilusProcessState::Stopped);
  assert!(stopped.pid.is_none(), "stopped snapshot should clear pid");
  assert!(
    !tasklist_has_pid(pid),
    "owned child PID should no longer exist after stop"
  );
}

#[test]
fn daemon_malformed_json_and_unknown_operation_do_not_kill_process() {
  let mut daemon = spawn_raw_daemon(
    &python_interpreter(),
    &[daemon_script().to_str().expect("script path")],
    &[],
  );

  let health = daemon.send_line_with_timeout(r#"{"id":"0","op":"health"}"#, RAW_DAEMON_STARTUP_TIMEOUT);
  assert_eq!(health["ok"], Value::Bool(true));

  let malformed = daemon.send_line(r#"{"id":"1","op":"ping""#);
  assert_eq!(malformed["ok"], Value::Bool(false));
  assert_eq!(malformed["error"]["code"], "invalid_json");

  let unknown = daemon.send_line(r#"{"id":"2","op":"does_not_exist"}"#);
  assert_eq!(unknown["ok"], Value::Bool(false));
  assert_eq!(unknown["error"]["code"], "unknown_op");

  let ping = daemon.send_line(r#"{"id":"3","op":"ping"}"#);
  assert_eq!(ping["ok"], Value::Bool(true));
  assert_eq!(ping["result"]["pong"], Value::Bool(true));

  daemon.shutdown();
}

#[test]
fn wrong_nautilus_version_is_rejected_before_health() {
  let fake_pkg = create_fake_nautilus_package("0.0.0");
  let script = daemon_script();
  let code = format!(
    "import runpy, sys; sys.path.insert(0, r'{}'); runpy.run_path(r'{}', run_name='__main__')",
    fake_pkg.display(),
    script.display()
  );
  let output = Command::new(python_interpreter())
    .args(["-c", &code])
    .output()
    .expect("run daemon with fake version");
  assert_ne!(output.status.code(), Some(0));
  let stderr = String::from_utf8_lossy(&output.stderr);
  assert!(
    stderr.contains("1.231.0") || stderr.contains("version"),
    "stderr should explain version guard"
  );
}

#[test]
fn missing_interpreter_produces_clear_gt_side_error() {
  let missing = unique_temp_dir("missing-python").join("python.exe");
  let mut manager = NautilusProcessManager::with_python_interpreter(missing);
  let err = manager
    .start()
    .expect_err("missing interpreter should fail");
  assert!(
    err.contains("GT_NAUTILUS_PYTHON")
      || err.contains("not found")
      || err.contains("interpreter")
  );
}

#[test]
fn daemon_crash_marks_manager_failed_without_crashing_the_host() {
  let mut manager = NautilusProcessManager::with_python_interpreter(python_interpreter());
  let started = manager.start().expect("start");
  let pid = started.pid.expect("pid");

  let output = Command::new("taskkill")
    .args(["/PID", &pid.to_string(), "/F", "/T"])
    .output()
    .expect("taskkill");
  assert!(output.status.success(), "taskkill should succeed");

  thread::sleep(Duration::from_millis(300));
  let status = manager.status().expect("status after crash");
  assert!(matches!(
    status.state,
    NautilusProcessState::Failed | NautilusProcessState::Unhealthy
  ));
}

#!/usr/bin/env python3
"""Local-only PAPER supervisor for the stdio Nautilus daemon.

The backend may disconnect and later reattach through the authenticated loopback
control socket. The supervisor owns the daemon and persists only identity and
transport metadata; it never persists trading state.
"""
from __future__ import annotations

import argparse
import json
import os
import secrets
import socket
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Any

PROTOCOL_VERSION = 1
MAX_LINE = 1024 * 1024
STARTUP_STARTED_AT = time.monotonic()


def startup_trace(phase: str) -> None:
    if os.environ.get("GOODTRADING_NAUTILUS_STARTUP_TRACE") == "1":
        elapsed_ms = round((time.monotonic() - STARTUP_STARTED_AT) * 1000)
        print(f"[paper-supervisor] startup phase={phase} elapsed_ms={elapsed_ms}", file=sys.stderr, flush=True)


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, sort_keys=True), encoding="utf-8")
    os.replace(tmp, path)


def read_json_line(stream) -> dict[str, Any]:
    line = stream.readline()
    if not line:
        raise EOFError("daemon stdout closed")
    if len(line) > MAX_LINE:
        raise ValueError("daemon response exceeded 1 MiB")
    return json.loads(line)


class Supervisor:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.metadata_path = Path(args.metadata).resolve()
        self.token = secrets.token_urlsafe(32)
        self.epoch = str(uuid.uuid4())
        self.daemon_instance_id = str(uuid.uuid4())
        self.daemon: subprocess.Popen[str] | None = None
        self.daemon_lock = threading.Lock()
        self.stopping = False
        self.server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server.bind(("127.0.0.1", 0))
        self.server.listen(4)
        self.server.settimeout(0.5)
        self.port = int(self.server.getsockname()[1])
        self.metadata: dict[str, Any] = {
            "schemaVersion": 1,
            "ownerUserId": int(args.owner_user_id),
            "simulationSessionId": None,
            "supervisorEpoch": self.epoch,
            "supervisorPid": os.getpid(),
            "supervisorPort": self.port,
            "supervisorToken": self.token,
            "daemonInstanceId": self.daemon_instance_id,
            "daemonPid": None,
            "protocolVersion": PROTOCOL_VERSION,
            "runtimeVersion": None,
            "nautilusVersion": None,
            "pythonVersion": None,
            "metadataPath": str(self.metadata_path),
        }
        atomic_json(self.metadata_path, self.metadata)

    def spawn_daemon(self) -> None:
        if self.daemon is not None and self.daemon.poll() is None:
            return
        startup_trace("daemon_spawn_begin")
        self.daemon = subprocess.Popen(
            [self.args.python, self.args.daemon],
            cwd=self.args.cwd,
            env=os.environ.copy(),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=sys.stderr,
            text=True,
            bufsize=1,
        )
        self.metadata["daemonPid"] = self.daemon.pid
        atomic_json(self.metadata_path, self.metadata)
        startup_trace(f"daemon_spawned pid={self.daemon.pid}")
        threading.Thread(target=self._monitor_daemon, name="paper-supervisor-daemon-monitor", daemon=True).start()

    def _monitor_daemon(self) -> None:
        daemon = self.daemon
        if daemon is None:
            return
        daemon.wait()
        if not self.stopping:
            # The supervisor must disappear when its canonical daemon is lost.
            # This wakes any backend attach attempt into the existing fail-closed
            # UNRECOVERED path instead of leaving a live control socket behind.
            os._exit(2)

    def daemon_request(self, request: dict[str, Any]) -> dict[str, Any]:
        with self.daemon_lock:
            if self.daemon is None or self.daemon.poll() is not None or self.daemon.stdin is None or self.daemon.stdout is None:
                raise RuntimeError("daemon unavailable")
            self.daemon.stdin.write(json.dumps(request, separators=(",", ":")) + "\n")
            self.daemon.stdin.flush()
            return read_json_line(self.daemon.stdout)

    def start_runtime(self) -> dict[str, Any]:
        self.spawn_daemon()
        startup_trace("health_request_begin")
        health = self.daemon_request({"id": "supervisor-health", "op": "health"})
        startup_trace("health_response")
        if health.get("ok") is not True:
            raise RuntimeError(str(health.get("error") or "daemon health failed"))
        h = health.get("result") or {}
        self.metadata["protocolVersion"] = h.get("protocolVersion", PROTOCOL_VERSION)
        self.metadata["runtimeVersion"] = h.get("runtimeVersion") or h.get("pythonVersion")
        self.metadata["nautilusVersion"] = h.get("nautilusVersion")
        self.metadata["pythonVersion"] = h.get("pythonVersion")
        startup_trace("simulation_start_request_begin")
        started = self.daemon_request({"id": "supervisor-start", "op": "simulation.start"})
        startup_trace("simulation_start_response")
        if started.get("ok") is not True:
            raise RuntimeError(str(started.get("error") or "simulation start failed"))
        result = started.get("result") or {}
        session_id = result.get("simulationSessionId")
        if not isinstance(session_id, str) or not session_id:
            raise RuntimeError("simulation start returned no session identity")
        self.metadata["simulationSessionId"] = session_id
        atomic_json(self.metadata_path, self.metadata)
        return {**result, "health": h, "supervisor": dict(self.metadata)}

    def stop_runtime(self) -> dict[str, Any]:
        self.stopping = True
        result: dict[str, Any] = {"stopped": False}
        try:
            if self.daemon is not None and self.daemon.poll() is None:
                session = self.metadata.get("simulationSessionId")
                stopped = self.daemon_request({"id": "supervisor-stop", "op": "simulation.stop"})
                if stopped.get("ok") is not True:
                    raise RuntimeError(str(stopped.get("error") or "simulation stop failed"))
                shutdown = self.daemon_request({"id": "supervisor-shutdown", "op": "shutdown"})
                if shutdown.get("ok") is not True:
                    raise RuntimeError(str(shutdown.get("error") or "daemon shutdown failed"))
                self.daemon.wait(timeout=5)
                result = {"stopped": True, "simulationSessionId": session}
        finally:
            if self.daemon is not None and self.daemon.poll() is None:
                self.daemon.kill()
                self.daemon.wait(timeout=5)
            try:
                self.metadata_path.unlink()
            except FileNotFoundError:
                pass
            try:
                self.server.close()
            except OSError:
                pass
        return result

    def handle(self, conn: socket.socket) -> None:
        file = conn.makefile("rwb")
        try:
            while not self.stopping:
                request: dict[str, Any] = {}
                try:
                    raw = file.readline(MAX_LINE + 1)
                    if not raw:
                        return
                    if len(raw) > MAX_LINE:
                        raise ValueError("request exceeded 1 MiB")
                    request = json.loads(raw.decode("utf-8"))
                    if request.get("token") != self.token:
                        raise PermissionError("supervisor authentication failed")
                    request_id = request.get("id")
                    op = request.get("op")
                    if op == "supervisor.attach":
                        result: Any = dict(self.metadata)
                    elif op == "supervisor.start":
                        result = self.start_runtime()
                    elif op == "supervisor.status":
                        result = dict(self.metadata)
                    elif op == "supervisor.stop":
                        result = self.stop_runtime()
                    else:
                        if not isinstance(op, str):
                            raise ValueError("missing operation")
                        forwarded = {"id": request_id, "op": op}
                        params = request.get("params")
                        if isinstance(params, dict):
                            forwarded.update(params=params)
                        response = self.daemon_request(forwarded)
                        if response.get("ok") is True:
                            result = response.get("result")
                        else:
                            raise RuntimeError(str(response.get("error") or "daemon request failed"))
                    response = {"id": request_id, "ok": True, "result": result}
                except Exception as exc:
                    response = {"id": request.get("id"), "ok": False, "error": {"code": "SUPERVISOR_ERROR", "message": str(exc)[:500]}}
                file.write((json.dumps(response, separators=(",", ":")) + "\n").encode("utf-8"))
                file.flush()
        finally:
            file.close()
    def run(self) -> int:
        startup_trace("supervisor_ready")
        try:
            while not self.stopping:
                try:
                    conn, _ = self.server.accept()
                except socket.timeout:
                    if self.daemon is not None and self.daemon.poll() is not None and not self.stopping:
                        return 2
                    continue
                with conn:
                    self.handle(conn)
        finally:
            if self.daemon is not None and self.daemon.poll() is None:
                self.daemon.kill()
                self.daemon.wait(timeout=5)
            try:
                self.server.close()
            except OSError:
                pass
        return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--metadata", required=True)
    parser.add_argument("--owner-user-id", required=True, type=int)
    parser.add_argument("--python", required=True)
    parser.add_argument("--daemon", required=True)
    parser.add_argument("--cwd", required=True)
    args = parser.parse_args()
    return Supervisor(args).run()


if __name__ == "__main__":
    raise SystemExit(main())

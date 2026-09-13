from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

REPO_ROOT = Path(r"G:/Dev/tmp-release-commit")
RUNTIME_ROOT = REPO_ROOT / "build" / "n2c" / "runtime" / "nautilus-runtime"
PYTHON_EXE = RUNTIME_ROOT / "python.exe"
DAEMON_PY = RUNTIME_ROOT / "daemon.py"
MANIFEST_PATH = RUNTIME_ROOT / "runtime-manifest.json"
BASELINE_BYTES = 659_307_780
BASELINE_FILES = 11_238


def clean_env() -> dict[str, str]:
    env = os.environ.copy()
    for key in [
        "PATH",
        "PYTHONPATH",
        "PYTHONHOME",
        "GT_NAUTILUS_PYTHON",
        "VIRTUAL_ENV",
        "CONDA_PREFIX",
        "CONDA_DEFAULT_ENV",
        "PIP_INDEX_URL",
        "PIP_EXTRA_INDEX_URL",
    ]:
        env.pop(key, None)
    env["PYTHONUNBUFFERED"] = "1"
    return env


def assert_json_safe(value: Any) -> None:
    json.dumps(value, ensure_ascii=False)
    if isinstance(value, dict):
        for key, item in value.items():
            assert isinstance(key, str)
            assert_json_safe(item)
    elif isinstance(value, list):
        for item in value:
            assert_json_safe(item)


def assert_inside_runtime(path: str) -> None:
    resolved = Path(path).resolve()
    assert str(resolved).startswith(str(RUNTIME_ROOT.resolve())), f"path escaped runtime: {resolved}"
    assert "scripts/nautilus_bridge" not in str(resolved).replace("\\", "/"), f"source tree leaked: {resolved}"
    assert "nautilus-env" not in str(resolved).replace("\\", "/"), f"dev venv leaked: {resolved}"


def runtime_stats() -> dict[str, Any]:
    payload = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return {
        "bytes": payload["totalBytes"],
        "files": payload["fileCount"],
        "delta_bytes": payload["totalBytes"] - BASELINE_BYTES,
        "delta_files": payload["fileCount"] - BASELINE_FILES,
        "manifest": payload,
    }


def module_origins() -> dict[str, str]:
    code = r"""
import importlib
import json
import sys
from pathlib import Path
runtime = Path(sys.executable).resolve().parent
sys.path.insert(0, str(runtime))
mods = {
    'daemon': importlib.import_module('goodtrading.daemon'),
    'contracts': importlib.import_module('goodtrading.contracts'),
    'simulation_core': importlib.import_module('goodtrading.simulation_core'),
    'simulation_service': importlib.import_module('goodtrading.simulation_service'),
    'nautilus_trader': importlib.import_module('nautilus_trader'),
}
print(json.dumps({k: getattr(v, '__file__', None) for k, v in mods.items()}, separators=(',', ':'), ensure_ascii=False))
"""
    output = subprocess.check_output(
        [str(PYTHON_EXE), "-c", code],
        text=True,
        stderr=subprocess.STDOUT,
        cwd=str(tempfile.mkdtemp(prefix="gt-n3c2b-origins-")),
        env=clean_env(),
    )
    origins = json.loads(output.strip())
    for path in origins.values():
        assert isinstance(path, str) and path
        assert_inside_runtime(path)
    return origins


class PackagedDaemonHarness:
    def __init__(self) -> None:
        self.cwd = tempfile.TemporaryDirectory(prefix="gt-n3c2b-daemon-")
        self.env = clean_env()
        self.proc = subprocess.Popen(
            [str(PYTHON_EXE), str(DAEMON_PY)],
            cwd=self.cwd.name,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=self.env,
        )
        assert self.proc.stdin is not None
        assert self.proc.stdout is not None
        assert self.proc.stderr is not None
        self.stdin = self.proc.stdin
        self.stdout = self.proc.stdout
        self.stderr_lines: list[str] = []
        self.stdout_lines: list[str] = []
        self._stderr_thread = threading.Thread(target=self._drain_stderr, daemon=True)
        self._stderr_thread.start()

    def _drain_stderr(self) -> None:
        assert self.proc.stderr is not None
        for line in self.proc.stderr:
            self.stderr_lines.append(line.rstrip("\r\n"))

    def request(self, payload: dict[str, Any], timeout_s: float = 10.0) -> dict[str, Any]:
        assert self.proc.poll() is None, "packaged daemon exited unexpectedly"
        line = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        self.stdin.write(line + "\n")
        self.stdin.flush()
        deadline = time.time() + timeout_s
        raw = ""
        while time.time() < deadline:
            raw = self.stdout.readline()
            if raw:
                break
        assert raw, f"no daemon response for {payload!r}"
        self.stdout_lines.append(raw.rstrip("\r\n"))
        response = json.loads(raw)
        assert_json_safe(response)
        return response

    def expect_ok(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.request(payload)
        assert response["id"] == payload["id"]
        assert response["ok"] is True, response
        return response["result"]

    def expect_error(self, payload: dict[str, Any], code: str) -> dict[str, Any]:
        response = self.request(payload)
        assert response["id"] == payload.get("id")
        assert response["ok"] is False, response
        assert response["error"]["code"] == code, response
        return response["error"]

    def shutdown(self) -> None:
        if self.proc.poll() is not None:
            self.stdin.close()
            self.stdout.close()
            if self.proc.stderr:
                self.proc.stderr.close()
            self.cwd.cleanup()
            return
        response = self.expect_ok({"id": "shutdown-1", "op": "shutdown"})
        assert response["shutdown"] is True
        self.proc.wait(timeout=15)
        self.stdin.close()
        self.stdout.close()
        if self.proc.stderr:
            self.proc.stderr.close()
        self.cwd.cleanup()


class PackagedDaemonSimulationProtocolSmoke:
    @staticmethod
    def instrument() -> dict[str, Any]:
        return {
            "venue": "SIM",
            "marketType": "perpetual",
            "symbol": "BTCUSDT-PERP",
            "baseAsset": "BTC",
            "quoteAsset": "USDT",
            "exchangeNativeSymbol": "BTCUSDT",
        }

    @staticmethod
    def market_request(request_id: str, bid: str = "99999", ask: str = "100001") -> dict[str, Any]:
        return {
            "id": request_id,
            "op": "simulation.inject_quote",
            "bid": bid,
            "ask": ask,
            "bidSize": "10",
            "askSize": "10",
            "timestamp": 123456789,
        }

    @staticmethod
    def production_snapshot(request_id: str, bid: str = "99999.50", ask: str = "100000.00") -> dict[str, Any]:
        return {
            "id": request_id,
            "op": "simulation.apply_market_snapshot",
            "snapshot": {
                "source": {
                    "venue": "BINANCE",
                    "marketType": "perpetual",
                    "symbol": "BTCUSDT",
                },
                "simulationInstrument": {
                    "venue": "SIM",
                    "marketType": "perpetual",
                    "symbol": "BTCUSDT-PERP",
                },
                "bid": bid,
                "ask": ask,
                "bidSize": "12.3",
                "askSize": "8.1",
                "timestampMs": 123456789,
            },
        }

    @classmethod
    def market_order(cls, request_id: str, client_order_id: str = "gt-market-1") -> dict[str, Any]:
        return {
            "id": request_id,
            "op": "simulation.submit_order",
            "clientOrderId": client_order_id,
            "instrument": cls.instrument(),
            "side": "BUY",
            "orderType": "MARKET",
            "quantity": "1",
            "timeInForce": "GTC",
            "reduceOnly": False,
            "postOnly": False,
        }

    @classmethod
    def market_sell_order(cls, request_id: str, client_order_id: str = "gt-market-sell-1", quantity: str = "2") -> dict[str, Any]:
        return {
            "id": request_id,
            "op": "simulation.submit_order",
            "clientOrderId": client_order_id,
            "instrument": cls.instrument(),
            "side": "SELL",
            "orderType": "MARKET",
            "quantity": quantity,
            "timeInForce": "GTC",
            "reduceOnly": False,
            "postOnly": False,
        }

    @classmethod
    def limit_order(cls, request_id: str, client_order_id: str = "gt-limit-1") -> dict[str, Any]:
        return {
            "id": request_id,
            "op": "simulation.submit_order",
            "clientOrderId": client_order_id,
            "instrument": cls.instrument(),
            "side": "BUY",
            "orderType": "LIMIT",
            "quantity": "1",
            "price": "99900",
            "timeInForce": "GTC",
            "reduceOnly": False,
            "postOnly": False,
        }


def main() -> int:
    manifest = runtime_stats()
    assert manifest["manifest"]["pythonVersion"] == "3.12.10"
    assert manifest["manifest"]["nautilusVersion"] == "1.231.0"
    assert manifest["manifest"]["protocolVersion"] == 1
    assert manifest["manifest"]["simulationProtocolVersion"] == 1
    assert manifest["manifest"]["simulationCore"] is True

    origins = module_origins()
    for key, path in origins.items():
        assert_inside_runtime(path)
    print(json.dumps({"moduleOrigins": origins, "runtime": manifest}, indent=2, ensure_ascii=False))

    harness = PackagedDaemonHarness()
    t0 = time.perf_counter()
    try:
        health = harness.expect_ok({"id": "health-1", "op": "health"})
        assert health["protocolVersion"] == 1
        assert health["nautilusVersion"] == "1.231.0"
        assert health["status"] == "healthy"

        ping = harness.expect_ok({"id": "ping-1", "op": "ping"})
        assert ping["pong"] is True

        version = harness.expect_ok({"id": "version-1", "op": "version"})
        assert version["protocolVersion"] == 1
        assert version["nautilusVersion"] == "1.231.0"
        assert version["pythonVersion"].startswith("3.")

        status = harness.expect_ok({"id": "status-1", "op": "simulation.status"})
        assert status["state"] == "STOPPED"

        start = harness.expect_ok({"id": "start-1", "op": "simulation.start"})
        assert start["state"] == "RUNNING"
        start_again = harness.expect_ok({"id": "start-2", "op": "simulation.start"})
        assert start_again["state"] == "RUNNING"
        assert start_again.get("alreadyRunning", False) is True

        stop = harness.expect_ok({"id": "stop-1", "op": "simulation.stop"})
        assert stop["state"] == "STOPPED"
        stop_again = harness.expect_ok({"id": "stop-2", "op": "simulation.stop"})
        assert stop_again["state"] == "STOPPED"
        assert stop_again.get("alreadyStopped", False) is True

        reset = harness.expect_ok({"id": "reset-1", "op": "simulation.reset"})
        assert reset["state"] == "RUNNING"

        harness.expect_ok(PackagedDaemonSimulationProtocolSmoke.market_request("quote-1"))
        market = harness.expect_ok(PackagedDaemonSimulationProtocolSmoke.market_order("market-1"))
        assert market["status"] == "FILLED"
        lookup = harness.expect_ok({"id": "order-1", "op": "simulation.get_order", "clientOrderId": "gt-market-1"})
        assert lookup["status"] == "FILLED"
        position = harness.expect_ok({"id": "position-1", "op": "simulation.get_position"})
        assert position["side"] == "LONG"
        assert position["quantity"] == "1"
        account = harness.expect_ok({"id": "account-1", "op": "simulation.get_account"})
        assert float(account["feesTotal"]) > 0.0

        harness.expect_ok({"id": "reset-snapshot", "op": "simulation.reset"})
        harness.expect_ok(PackagedDaemonSimulationProtocolSmoke.production_snapshot("snapshot-1"))
        snapshot_position = harness.expect_ok({"id": "position-snapshot", "op": "simulation.get_position"})
        assert snapshot_position["side"] == "FLAT"
        assert snapshot_position["quantity"] == "0"
        snapshot_market = harness.expect_ok(PackagedDaemonSimulationProtocolSmoke.market_order("market-snapshot"))
        assert snapshot_market["status"] == "FILLED"
        assert snapshot_market["averageFillPrice"] == "100000.0"

        harness.expect_ok({"id": "reset-2", "op": "simulation.reset"})
        harness.expect_ok(PackagedDaemonSimulationProtocolSmoke.market_request("quote-2"))
        limit = harness.expect_ok(PackagedDaemonSimulationProtocolSmoke.limit_order("limit-1"))
        assert limit["status"] == "ACCEPTED"
        harness.expect_ok(PackagedDaemonSimulationProtocolSmoke.market_request("quote-3", bid="99899", ask="99900"))
        limit_filled = harness.expect_ok({"id": "order-2", "op": "simulation.get_order", "clientOrderId": "gt-limit-1"})
        assert limit_filled["status"] == "FILLED"

        harness.expect_ok({"id": "reset-3", "op": "simulation.reset"})
        harness.expect_ok(PackagedDaemonSimulationProtocolSmoke.market_request("quote-4"))
        harness.expect_ok(PackagedDaemonSimulationProtocolSmoke.limit_order("limit-2", client_order_id="gt-cancel-1"))
        canceled = harness.expect_ok({"id": "cancel-1", "op": "simulation.cancel_order", "clientOrderId": "gt-cancel-1"})
        assert canceled["status"] == "CANCELED"
        harness.expect_ok(PackagedDaemonSimulationProtocolSmoke.market_request("quote-5", bid="99899", ask="99900"))
        canceled_after = harness.expect_ok({"id": "order-3", "op": "simulation.get_order", "clientOrderId": "gt-cancel-1"})
        assert canceled_after["status"] == "CANCELED"
        flat_position = harness.expect_ok({"id": "position-2", "op": "simulation.get_position"})
        assert flat_position["side"] == "FLAT"

        harness.expect_ok({"id": "reset-4", "op": "simulation.reset"})
        harness.expect_ok(PackagedDaemonSimulationProtocolSmoke.market_request("quote-6"))
        harness.expect_ok(PackagedDaemonSimulationProtocolSmoke.market_order("market-2", client_order_id="gt-profit-1"))
        harness.expect_ok(PackagedDaemonSimulationProtocolSmoke.market_request("quote-7", bid="100100", ask="100102"))
        profitable = harness.expect_ok({"id": "account-2", "op": "simulation.get_account"})
        assert profitable["realizedPnl"] != "0"
        assert profitable["feesTotal"] != "0"
        assert isinstance(profitable["balance"], str)
        assert isinstance(profitable["equity"], str)

        harness.expect_ok({"id": "reset-5", "op": "simulation.reset"})
        harness.expect_ok(PackagedDaemonSimulationProtocolSmoke.market_request("quote-8"))
        harness.expect_ok(PackagedDaemonSimulationProtocolSmoke.market_order("market-3", client_order_id="gt-flip-1"))
        harness.expect_ok(PackagedDaemonSimulationProtocolSmoke.market_sell_order("market-4", client_order_id="gt-flip-2", quantity="2"))
        flip_position = harness.expect_ok({"id": "position-3", "op": "simulation.get_position"})
        assert flip_position["side"] == "SHORT"
        assert flip_position["quantity"] == "1"

        harness.expect_error(
            {
                "id": "bad-json-1",
                "op": "simulation.submit_order",
                "clientOrderId": "bad-side",
                "instrument": PackagedDaemonSimulationProtocolSmoke.instrument(),
                "side": "HOLD",
                "orderType": "MARKET",
                "quantity": "1",
                "timeInForce": "GTC",
            },
            "contract_validation_error",
        )
        harness.expect_error({"id": "bad-op-1", "op": "does_not_exist"}, "unknown_op")
        harness.expect_error({"id": "bad-order-1", "op": "simulation.get_order", "clientOrderId": "missing"}, "order_not_found")
        harness.expect_error({"id": "bad-cancel-1", "op": "simulation.cancel_order", "clientOrderId": "missing"}, "order_not_found")
        harness.expect_error({"id": "bad-cancel-state-1", "op": "simulation.cancel_order", "clientOrderId": "gt-flip-1"}, "order_invalid_state")

        ping_after = harness.expect_ok({"id": "ping-2", "op": "ping"})
        assert ping_after["pong"] is True

        account1 = harness.expect_ok({"id": "account-3", "op": "simulation.get_account"})
        account2 = harness.expect_ok({"id": "account-4", "op": "simulation.get_account"})
        assert account1 == account2
        pos1 = harness.expect_ok({"id": "position-4", "op": "simulation.get_position"})
        pos2 = harness.expect_ok({"id": "position-5", "op": "simulation.get_position"})
        assert pos1 == pos2
        lookup1 = harness.expect_ok({"id": "order-4", "op": "simulation.get_order", "clientOrderId": "gt-flip-1"})
        lookup2 = harness.expect_ok({"id": "order-5", "op": "simulation.get_order", "clientOrderId": "gt-flip-1"})
        assert lookup1 == lookup2

        stdout_lines = [line for line in harness.stdout_lines if line.strip()]
        for line in stdout_lines:
            parsed = json.loads(line)
            assert_json_safe(parsed)
        print(json.dumps({"stdoutLines": stdout_lines, "stderrLines": harness.stderr_lines}, indent=2, ensure_ascii=False))

        harness.shutdown()
        duration_ms = (time.perf_counter() - t0) * 1000.0
        print(
            json.dumps(
                {
                    "result": "PASS",
                    "durationMs": round(duration_ms, 2),
                    "moduleOrigins": origins,
                    "runtime": manifest,
                    "stdoutLineCount": len(stdout_lines),
                    "stderrLineCount": len(harness.stderr_lines),
                },
                indent=2,
                ensure_ascii=False,
            )
        )
        return 0
    finally:
        try:
            harness.shutdown()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
import unittest
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.nautilus_bridge.contracts import _json_safe_recursive

PYTHON_EXE = Path(r"G:/Dev/nautilus-env/Scripts/python.exe")
DAEMON_PY = REPO_ROOT / "scripts" / "nautilus_bridge" / "daemon.py"


def _json_safe(value: Any) -> None:
    _json_safe_recursive(value)
    json.loads(json.dumps(value))


class DaemonHarness:
    def __init__(self) -> None:
        env = os.environ.copy()
        env.pop("PYTHONHOME", None)
        env.pop("PYTHONPATH", None)
        env.pop("GT_NAUTILUS_PYTHON", None)
        env["PYTHONUNBUFFERED"] = "1"
        env["PYTHONPATH"] = str(REPO_ROOT)
        self.proc = subprocess.Popen(
            [str(PYTHON_EXE), "-u", str(DAEMON_PY)],
            cwd=str(REPO_ROOT),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
        )
        assert self.proc.stdin is not None
        assert self.proc.stdout is not None
        assert self.proc.stderr is not None
        self.stdin = self.proc.stdin
        self.stdout = self.proc.stdout
        self.stderr_lines: list[str] = []
        self._stderr_thread = threading.Thread(target=self._drain_stderr, daemon=True)
        self._stderr_thread.start()

    def _drain_stderr(self) -> None:
        assert self.proc.stderr is not None
        for line in self.proc.stderr:
            self.stderr_lines.append(line.rstrip("\r\n"))

    def request(self, payload: dict[str, Any], timeout_s: float = 10.0) -> dict[str, Any]:
        assert self.proc.poll() is None, "daemon exited unexpectedly"
        self.stdin.write(json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n")
        self.stdin.flush()
        deadline = time.time() + timeout_s
        line = ""
        while time.time() < deadline:
            line = self.stdout.readline()
            if line:
                break
        assert line, f"no daemon response for {payload!r}"
        response = json.loads(line)
        _json_safe(response)
        return response

    def expect_ok(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.request(payload)
        self._assert_response_envelope(response, payload["id"])
        assert response["ok"] is True, response
        return response["result"]

    def expect_error(self, payload: dict[str, Any], code: str) -> dict[str, Any]:
        response = self.request(payload)
        self._assert_response_envelope(response, payload.get("id"))
        assert response["ok"] is False, response
        assert response["error"]["code"] == code, response
        return response["error"]

    def _assert_response_envelope(self, response: dict[str, Any], request_id: Any) -> None:
        assert response["id"] == request_id, response
        assert "ok" in response, response
        assert any(key in response for key in ("result", "error")), response

    def shutdown(self) -> None:
        if self.proc.poll() is not None:
            for handle in (self.stdin, self.stdout, self.proc.stderr):
                try:
                    handle.close()
                except Exception:
                    pass
            return
        response = self.expect_ok({"id": "shutdown", "op": "shutdown"})
        assert response["shutdown"] is True
        self.proc.wait(timeout=10)
        for handle in (self.stdin, self.stdout, self.proc.stderr):
            try:
                handle.close()
            except Exception:
                pass


class DaemonSimulationProtocolTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.daemon = DaemonHarness()
        self.addCleanup(self.daemon.shutdown)

    def _instrument(self) -> dict[str, Any]:
        return {
            "venue": "SIM",
            "marketType": "perpetual",
            "symbol": "BTCUSDT-PERP",
            "baseAsset": "BTC",
            "quoteAsset": "USDT",
            "exchangeNativeSymbol": "BTCUSDT",
        }

    def _market_request(self, request_id: str, bid: str = "99999", ask: str = "100001") -> dict[str, Any]:
        return {
            "id": request_id,
            "op": "simulation.inject_quote",
            "bid": bid,
            "ask": ask,
            "bidSize": "10",
            "askSize": "10",
            "timestamp": 123456789,
        }

    def _production_snapshot(self, request_id: str, bid: str = "99999.50", ask: str = "100000.00") -> dict[str, Any]:
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

    def _market_order(self, request_id: str) -> dict[str, Any]:
        return {
            "id": request_id,
            "op": "simulation.submit_order",
            "clientOrderId": "gt-market-1",
            "instrument": self._instrument(),
            "side": "BUY",
            "orderType": "MARKET",
            "quantity": "1",
            "timeInForce": "GTC",
            "reduceOnly": False,
            "postOnly": False,
        }

    def _limit_order(self, request_id: str, client_order_id: str = "gt-limit-1") -> dict[str, Any]:
        return {
            "id": request_id,
            "op": "simulation.submit_order",
            "clientOrderId": client_order_id,
            "instrument": self._instrument(),
            "side": "BUY",
            "orderType": "LIMIT",
            "quantity": "1",
            "price": "99900",
            "timeInForce": "GTC",
            "reduceOnly": False,
            "postOnly": False,
        }

    def test_lifecycle_and_existing_ops_remain_healthy(self) -> None:
        health = self.daemon.expect_ok({"id": "health-1", "op": "health"})
        self.assertEqual(health["status"], "healthy")
        self.assertEqual(health["protocolVersion"], 1)
        self.assertEqual(health["nautilusVersion"], "1.231.0")

        version = self.daemon.expect_ok({"id": "version-1", "op": "version"})
        self.assertEqual(version["protocolVersion"], 1)
        self.assertEqual(version["nautilusVersion"], "1.231.0")

        status = self.daemon.expect_ok({"id": "status-1", "op": "simulation.status"})
        self.assertEqual(status["state"], "STOPPED")
        self.assertEqual(status["simulationProtocolVersion"], 1)

        started = self.daemon.expect_ok({"id": "start-1", "op": "simulation.start"})
        self.assertEqual(started["state"], "RUNNING")
        self.assertFalse(started.get("alreadyRunning", False))

        started_again = self.daemon.expect_ok({"id": "start-2", "op": "simulation.start"})
        self.assertEqual(started_again["state"], "RUNNING")
        self.assertTrue(started_again.get("alreadyRunning", False))

        stopped = self.daemon.expect_ok({"id": "stop-1", "op": "simulation.stop"})
        self.assertEqual(stopped["state"], "STOPPED")

        stopped_again = self.daemon.expect_ok({"id": "stop-2", "op": "simulation.stop"})
        self.assertEqual(stopped_again["state"], "STOPPED")

        ping = self.daemon.expect_ok({"id": "ping-1", "op": "ping"})
        self.assertTrue(ping["pong"])

    def test_market_round_trip(self) -> None:
        self.daemon.expect_ok({"id": "start-1", "op": "simulation.start"})
        self.daemon.expect_ok(self._market_request("quote-1"))
        order = self.daemon.expect_ok(self._market_order("market-1"))
        self.assertEqual(order["status"], "FILLED")
        self.assertEqual(order["clientOrderId"], "gt-market-1")

        looked_up = self.daemon.expect_ok({"id": "order-1", "op": "simulation.get_order", "clientOrderId": "gt-market-1"})
        self.assertEqual(looked_up["status"], "FILLED")

        position = self.daemon.expect_ok({"id": "position-1", "op": "simulation.get_position"})
        self.assertEqual(position["side"], "LONG")
        self.assertEqual(position["quantity"], "1")

        account = self.daemon.expect_ok({"id": "account-1", "op": "simulation.get_account"})
        self.assertEqual(float(account["feesTotal"]), 0.0)
        _json_safe(account)

    def test_production_market_snapshot_requires_running_simulation(self) -> None:
        error = self.daemon.expect_error(self._production_snapshot("snapshot-stopped"), "simulation_not_started")
        self.assertEqual(error["message"], "simulation is not running")

    def test_production_market_snapshot_round_trip(self) -> None:
        self.daemon.expect_ok({"id": "start-1", "op": "simulation.start"})
        applied = self.daemon.expect_ok(self._production_snapshot("snapshot-1"))
        self.assertTrue(applied["applied"])
        self.assertEqual(applied["sourceVenue"], "BINANCE")
        self.assertEqual(applied["sourceSymbol"], "BTCUSDT")
        self.assertEqual(applied["simulationSymbol"], "BTCUSDT-PERP")
        self.assertEqual(applied["timestampMs"], 123456789)

        position = self.daemon.expect_ok({"id": "position-1", "op": "simulation.get_position"})
        self.assertEqual(position["side"], "FLAT")
        self.assertEqual(position["quantity"], "0")

        order = self.daemon.expect_ok(self._market_order("market-1"))
        self.assertEqual(order["status"], "FILLED")
        self.assertEqual(order["averageFillPrice"], "100000.0")

    def test_limit_round_trip(self) -> None:
        self.daemon.expect_ok({"id": "start-1", "op": "simulation.start"})
        self.daemon.expect_ok(self._market_request("quote-1"))
        order = self.daemon.expect_ok(self._limit_order("limit-1"))
        self.assertEqual(order["status"], "ACCEPTED")
        self.assertEqual(order["clientOrderId"], "gt-limit-1")

        self.daemon.expect_ok(self._market_request("quote-2", bid="99899", ask="99900"))
        filled = self.daemon.expect_ok({"id": "order-2", "op": "simulation.get_order", "clientOrderId": "gt-limit-1"})
        self.assertEqual(filled["status"], "FILLED")
        self.assertEqual(filled["filledQuantity"], "1")

        position = self.daemon.expect_ok({"id": "position-1", "op": "simulation.get_position"})
        self.assertEqual(position["side"], "LONG")
        self.assertEqual(position["quantity"], "1")

    def test_cancel_round_trip(self) -> None:
        self.daemon.expect_ok({"id": "start-1", "op": "simulation.start"})
        self.daemon.expect_ok(self._market_request("quote-1"))
        self.daemon.expect_ok(self._limit_order("limit-1", client_order_id="gt-cancel-1"))
        canceled = self.daemon.expect_ok({"id": "cancel-1", "op": "simulation.cancel_order", "clientOrderId": "gt-cancel-1"})
        self.assertEqual(canceled["status"], "CANCELED")
        self.daemon.expect_ok(self._market_request("quote-2", bid="99899", ask="99900"))
        after = self.daemon.expect_ok({"id": "order-2", "op": "simulation.get_order", "clientOrderId": "gt-cancel-1"})
        self.assertEqual(after["status"], "CANCELED")
        position = self.daemon.expect_ok({"id": "position-1", "op": "simulation.get_position"})
        self.assertEqual(position["side"], "FLAT")
        self.assertEqual(position["quantity"], "0")

    def test_reset_clears_old_state_and_old_order_not_found(self) -> None:
        self.daemon.expect_ok({"id": "start-1", "op": "simulation.start"})
        self.daemon.expect_ok(self._market_request("quote-1"))
        self.daemon.expect_ok(self._market_order("market-1"))
        before = self.daemon.expect_ok({"id": "account-1", "op": "simulation.get_account"})
        self.assertEqual(before["balance"], "100000")

        reset = self.daemon.expect_ok({"id": "reset-1", "op": "simulation.reset"})
        self.assertEqual(reset["state"], "RUNNING")

        after_account = self.daemon.expect_ok({"id": "account-2", "op": "simulation.get_account"})
        self.assertEqual(after_account["balance"], "100000")
        self.assertEqual(after_account["equity"], "100000")
        self.assertEqual(after_account["realizedPnl"], "0")
        self.assertEqual(after_account["unrealizedPnl"], "0")

        error = self.daemon.expect_error({"id": "order-missing", "op": "simulation.get_order", "clientOrderId": "gt-market-1"}, "order_not_found")
        self.assertIn("unknown order", error["message"])

    def test_invalid_requests_do_not_crash_and_ping_survives(self) -> None:
        self.daemon.expect_ok({"id": "start-1", "op": "simulation.start"})
        self.daemon.expect_error({
            "id": "bad-side",
            "op": "simulation.submit_order",
            "clientOrderId": "bad-side-1",
            "instrument": self._instrument(),
            "side": "HOLD",
            "orderType": "MARKET",
            "quantity": "1",
            "timeInForce": "GTC",
        }, "contract_validation_error")
        self.daemon.expect_error({
            "id": "bad-qty",
            "op": "simulation.submit_order",
            "clientOrderId": "bad-qty-1",
            "instrument": self._instrument(),
            "side": "BUY",
            "orderType": "MARKET",
            "quantity": "0",
            "timeInForce": "GTC",
        }, "contract_validation_error")
        self.daemon.expect_error({
            "id": "bad-limit",
            "op": "simulation.submit_order",
            "clientOrderId": "bad-limit-1",
            "instrument": self._instrument(),
            "side": "BUY",
            "orderType": "LIMIT",
            "quantity": "1",
            "timeInForce": "GTC",
        }, "contract_validation_error")
        self.daemon.expect_error({"id": "missing", "op": "simulation.get_order", "clientOrderId": "does-not-exist"}, "order_not_found")
        self.daemon.expect_error({"id": "unknown-op", "op": "does_not_exist"}, "unknown_op")
        ping = self.daemon.expect_ok({"id": "ping-2", "op": "ping"})
        self.assertTrue(ping["pong"])

    def test_read_idempotency_and_json_safety(self) -> None:
        self.daemon.expect_ok({"id": "start-1", "op": "simulation.start"})
        self.daemon.expect_ok(self._market_request("quote-1"))
        self.daemon.expect_ok(self._market_order("market-1"))
        account1 = self.daemon.expect_ok({"id": "account-1", "op": "simulation.get_account"})
        account2 = self.daemon.expect_ok({"id": "account-2", "op": "simulation.get_account"})
        self.assertEqual(account1, account2)

        position1 = self.daemon.expect_ok({"id": "position-1", "op": "simulation.get_position"})
        position2 = self.daemon.expect_ok({"id": "position-2", "op": "simulation.get_position"})
        self.assertEqual(position1, position2)

        _json_safe(account1)
        _json_safe(position1)


if __name__ == "__main__":
    unittest.main()

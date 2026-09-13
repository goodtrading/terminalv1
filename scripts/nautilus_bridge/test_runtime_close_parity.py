"""Packaged daemon close regression; no app/session is touched."""
from pathlib import Path
import hashlib
import unittest
from scripts.nautilus_bridge import test_daemon_simulation_protocol as protocol

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / "src-tauri/target/debug/nautilus-runtime"

class RuntimeCloseParityTest(unittest.TestCase):
    def test_packaged_close_route_and_canonical_fills(self):
        for name in ("daemon", "simulation_service", "contracts", "simulation_core"):
            source = ROOT / "scripts/nautilus_bridge" / f"{name}.py"
            packaged = RUNTIME / (f"{name}.py" if name == "daemon" else f"goodtrading/{name}.py")
            self.assertEqual(hashlib.sha256(source.read_bytes().replace(b"\r\n", b"\n")).digest(), hashlib.sha256(packaged.read_bytes().replace(b"\r\n", b"\n")).digest(), name)
        previous = protocol.PYTHON_EXE, protocol.DAEMON_PY
        protocol.PYTHON_EXE, protocol.DAEMON_PY = RUNTIME / "python.exe", RUNTIME / "daemon.py"
        try:
            daemon = protocol.DaemonHarness()
        finally:
            protocol.PYTHON_EXE, protocol.DAEMON_PY = previous
        self.addCleanup(daemon.shutdown)
        def call(op, **params):
            return daemon.expect_ok({"id": op, "op": op, **params})
        call("simulation.start")
        call("simulation.inject_quote", bid="100", ask="101", bidSize="10", askSize="10", timestamp=123456789)
        instrument = {"venue":"SIM", "marketType":"perpetual", "symbol":"BTCUSDT-PERP", "baseAsset":"BTC", "quoteAsset":"USDT", "exchangeNativeSymbol":"BTCUSDT"}
        call("simulation.submit_order", **{"clientOrderId":"parity-open", "instrument":instrument, "side":"BUY", "orderType":"MARKET", "quantity":"0.002", "timeInForce":"GTC", "reduceOnly":False,"postOnly":False})
        partial=call("simulation.close_position", instrument=instrument, quantity="0.001")
        self.assertEqual((partial["status"],partial["side"],partial["quantity"]),("FILLED","SELL","0.001"))
        self.assertEqual(call("simulation.get_position")["quantity"],"0.001")
        full=call("simulation.close_position",instrument=instrument)
        self.assertEqual(full["status"],"FILLED")
        self.assertEqual(call("simulation.get_position")["side"],"FLAT")
        fills=call("simulation.list_fills")
        self.assertEqual(len(fills),3)
        self.assertEqual(sorted(f["quantity"] for f in fills),["0.001","0.001","0.002"])

if __name__ == "__main__": unittest.main()

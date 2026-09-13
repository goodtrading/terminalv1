from __future__ import annotations

import sys
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from quote_stream import QuoteStreamClient
from simulation_service import SimulationService


class RuntimeStatusTests(unittest.TestCase):
    def test_quote_stream_status_exposes_initial_truthful_state(self) -> None:
        stream = QuoteStreamClient(
            {"streamUrl": "wss://example.invalid/ws", "capabilityToken": "TEST_REDACTED"},
            lambda _: None,
            lambda: None,
        )
        status = stream.status()
        self.assertEqual(status["configured"], True)
        self.assertEqual(status["connected"], False)
        self.assertEqual(status["sourceAvailable"], False)
        self.assertEqual(status["framesReceived"], 0)
        self.assertEqual(status["decodeErrors"], 0)
        self.assertEqual(status["sequenceErrors"], 0)
        self.assertIsNone(status["lastSequence"])
        self.assertIsNone(status["quoteAgeMs"])

    def test_simulation_status_exposes_applied_decimal_market(self) -> None:
        service = SimulationService()
        service.start()
        service.apply_stream_quote({
            "bestBidPrice": "78000.12345678",
            "bestAskPrice": "78000.22345679",
            "bestBidSize": "1",
            "bestAskSize": "1",
            "sequence": 7,
            "sourceTimestampMs": 1700000000000,
            "localAppliedTimestampMs": 1700000000010,
        })
        market = service.status()["market"]
        self.assertEqual(market["instrument"], "BTCUSDT-PERP")
        self.assertEqual(market["bestBid"], "78000.12")
        self.assertEqual(market["bestAsk"], "78000.22")

    def test_interactive_stream_quote_preserves_execution_timestamp_and_fee_on_repeated_fill_reads(self) -> None:
        service = SimulationService()
        service.start()
        self.addCleanup(service.shutdown)
        source_timestamp_ms = 1_700_000_000_000
        service.apply_stream_quote({
            "bestBidPrice": "78000.12",
            "bestAskPrice": "78000.22",
            "bestBidSize": "1",
            "bestAskSize": "1",
            "sequence": 8,
            "sourceTimestampMs": source_timestamp_ms,
            "localAppliedTimestampMs": source_timestamp_ms + 10,
        })
        order = service.submit_order({
            "clientOrderId": "timestamp-provenance-1",
            "instrument": {
                "venue": "SIM",
                "marketType": "perpetual",
                "symbol": "BTCUSDT-PERP",
                "baseAsset": "BTC",
                "quoteAsset": "USDT",
                "exchangeNativeSymbol": "BTCUSDT",
            },
            "side": "BUY",
            "orderType": "MARKET",
            "quantity": "0.001",
            "timeInForce": "GTC",
            "reduceOnly": False,
            "postOnly": False,
        })
        self.assertEqual(order["status"], "FILLED")

        first = service.list_fills()
        second = service.list_fills()
        self.assertEqual(len(first), 1)
        self.assertEqual(first, second)
        fill = first[0]
        self.assertEqual(fill["clientOrderId"], "timestamp-provenance-1")
        self.assertEqual(fill["timestamp"], source_timestamp_ms)
        self.assertGreater(fill["timestamp"], 0)
        self.assertEqual(fill["fee"], service.get_account()["feesTotal"])

    def test_force_disconnect_keeps_quote_worker_alive_and_configured(self) -> None:
        stream = QuoteStreamClient(
            {"streamUrl": "wss://example.invalid/ws", "capabilityToken": "TEST_REDACTED"},
            lambda _: None,
            lambda: None,
        )

        class FakeSocket:
            def __init__(self) -> None:
                self.shutdown_calls = 0
                self.close_calls = 0

            def shutdown(self, _how: int) -> None:
                self.shutdown_calls += 1

            def close(self) -> None:
                self.close_calls += 1

        worker_ready = threading.Event()
        worker_release = threading.Event()
        worker = threading.Thread(
            target=lambda: (worker_ready.set(), worker_release.wait()),
            daemon=True,
        )
        worker.start()
        worker_ready.wait(timeout=1)
        fake_socket = FakeSocket()
        stream._thread = worker
        stream._socket = fake_socket  # type: ignore[assignment]

        self.assertTrue(stream.force_disconnect_diagnostic())
        self.assertTrue(worker.is_alive())
        self.assertFalse(stream._stop.is_set())
        self.assertTrue(stream.status()["configured"])
        self.assertEqual(fake_socket.shutdown_calls, 1)
        self.assertEqual(fake_socket.close_calls, 1)

        worker_release.set()
        worker.join(timeout=1)

        stream = QuoteStreamClient(
            {"streamUrl": "wss://example.invalid/ws", "capabilityToken": "TEST_REDACTED"},
            lambda _: None,
            lambda: None,
        )
        status = stream.status()
        serialized = repr(status)
        for forbidden in ("capabilityToken", "reconnectToken", "Authorization", "Bearer", "JWT", "cookie"):
            self.assertNotIn(forbidden, serialized)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest
from decimal import Decimal
from unittest.mock import patch

from scripts.nautilus_bridge.contracts import ContractBoundaryError, SimulationCoreJsonBoundary
from scripts.nautilus_bridge.simulation_core import SimulationCore, SimulationCoreConfig


class ClosePositionContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.core = SimulationCore(SimulationCoreConfig(maker_fee=Decimal("0"), taker_fee=Decimal("0")))
        self.core.start()
        self.core.set_market("100", "101")
        self.boundary = SimulationCoreJsonBoundary(self.core)
        self.instrument = {
            "venue": "SIM", "marketType": "perpetual", "symbol": "BTCUSDT-PERP",
            "baseAsset": "BTC", "quoteAsset": "USDT", "exchangeNativeSymbol": "BTCUSDT",
        }
        self.addCleanup(self.core.shutdown)

    def open(self, side: str = "BUY", quantity: str = "2") -> None:
        self.boundary.submit_order({
            "clientOrderId": "open", "instrument": self.instrument, "side": side,
            "orderType": "MARKET", "quantity": quantity, "timeInForce": "GTC",
            "reduceOnly": False, "postOnly": False,
        })

    def test_long_partial_and_exact_full_close(self) -> None:
        self.open()
        partial = self.boundary.close_position({"instrument": self.instrument, "quantity": "0.5"})
        self.assertEqual(partial.side, "SELL")
        self.assertEqual(partial.quantity, "0.5")
        position = self.core.get_position()
        self.assertIsNotNone(position)
        self.assertEqual(str(position["side"]).upper(), "LONG")
        self.assertEqual(Decimal(str(position["quantity"])), Decimal("1.5"))
        partial_fills = [fill for fill in self.core.list_fills() if fill["client_order_id"] == partial.clientOrderId]
        self.assertEqual(len(partial_fills), 1)
        self.assertEqual(Decimal(str(partial_fills[0]["quantity"])), Decimal("0.5"))
        full = self.boundary.close_position({"instrument": self.instrument, "quantity": "1.5"})
        self.assertEqual(full.side, "SELL")
        self.assertIsNone(self.core.get_position())
        self.assertEqual(self.core.get_account()["fees_total"], Decimal("0"))

    def test_exact_long_partial_close_contract(self) -> None:
        self.open(quantity="0.002")
        result = self.boundary.close_position({"instrument": self.instrument, "quantity": "0.001"})
        self.assertEqual(result.side, "SELL")
        self.assertEqual(result.quantity, "0.001")
        self.assertEqual(result.status, "FILLED")
        position = self.core.get_position()
        self.assertIsNotNone(position)
        self.assertEqual(str(position["side"]).upper(), "LONG")
        self.assertEqual(Decimal(str(position["quantity"])), Decimal("0.001"))
        fills = [fill for fill in self.core.list_fills() if fill["client_order_id"] == result.clientOrderId]
        self.assertEqual(len(fills), 1)
        self.assertEqual(Decimal(str(fills[0]["quantity"])), Decimal("0.001"))


    def test_short_partial_close_preserves_short_side(self) -> None:
        self.open("SELL")
        partial = self.boundary.close_position({"instrument": self.instrument, "quantity": "0.5"})
        self.assertEqual(partial.side, "BUY")
        position = self.core.get_position()
        self.assertIsNotNone(position)
        self.assertEqual(str(position["side"]).upper(), "SHORT")
        self.assertEqual(Decimal(str(position["quantity"])), Decimal("1.5"))

    def test_short_full_close(self) -> None:
        self.open("SELL")
        result = self.boundary.close_position({"instrument": self.instrument})
        self.assertEqual(result.side, "BUY")
        self.assertIsNone(self.core.get_position())

    def test_rejects_no_position_zero_negative_invalid_and_overclose(self) -> None:
        cases = ({"instrument": self.instrument}, {"instrument": self.instrument, "quantity": "0"}, {"instrument": self.instrument, "quantity": "-1"}, {"instrument": self.instrument, "quantity": "1e-1"})
        for payload in cases:
            with self.assertRaises(ContractBoundaryError):
                self.boundary.close_position(payload)
        self.open()
        for quantity in ("2.1", "1.", " 1", "01"):
            with self.assertRaises(ContractBoundaryError):
                self.boundary.close_position({"instrument": self.instrument, "quantity": quantity})

    def protect(self, protection: str, client_order_id: str = "protection") -> None:
        if protection == "STOP_LOSS":
            self.boundary.submit_order({
                "clientOrderId": client_order_id, "instrument": self.instrument, "side": "SELL",
                "orderType": "STOP_MARKET", "quantity": "2", "triggerPrice": "90",
                "timeInForce": "GTC", "reduceOnly": True, "postOnly": False,
            })
        else:
            self.boundary.submit_order({
                "clientOrderId": client_order_id, "instrument": self.instrument, "side": "SELL",
                "orderType": "LIMIT", "quantity": "2", "price": "110",
                "timeInForce": "GTC", "reduceOnly": True, "postOnly": False,
                "metadata": {"protectionType": "TAKE_PROFIT"},
            })

    def test_full_close_cancels_long_sl_tp_before_reduce_only_sell(self) -> None:
        self.open()
        self.protect("STOP_LOSS", "sl")
        self.protect("TAKE_PROFIT", "tp")
        events: list[str] = []
        original_cancel = SimulationCoreJsonBoundary.cancel_order
        original_submit = SimulationCoreJsonBoundary.submit_order
        def cancel(boundary, order_id):
            events.append(f"cancel:{order_id}")
            return original_cancel(boundary, order_id)
        def submit(boundary, payload):
            if payload["orderType"] == "MARKET":
                events.append("close:market")
            return original_submit(boundary, payload)

        with patch.object(SimulationCoreJsonBoundary, "cancel_order", cancel), patch.object(SimulationCoreJsonBoundary, "submit_order", submit):
            result = self.boundary.close_position({"instrument": self.instrument})
        self.assertEqual(result.side, "SELL")
        self.assertEqual(events, ["cancel:sl", "cancel:tp", "close:market"])
        self.assertIsNone(self.core.get_position())
        self.assertFalse(any(self.boundary._is_working_protection_for_position(o, {"instrument_id": "BTCUSDT-PERP.SIM"}) for o in self.core.list_orders()))

    def test_full_close_cancels_short_protections_and_buys_reduce_only(self) -> None:
        self.open("SELL")
        self.boundary.submit_order({
            "clientOrderId": "sl", "instrument": self.instrument, "side": "BUY",
            "orderType": "STOP_MARKET", "quantity": "2", "triggerPrice": "110",
            "timeInForce": "GTC", "reduceOnly": True, "postOnly": False,
        })
        self.boundary.submit_order({
            "clientOrderId": "tp", "instrument": self.instrument, "side": "BUY",
            "orderType": "LIMIT", "quantity": "2", "price": "90",
            "timeInForce": "GTC", "reduceOnly": True, "postOnly": False,
            "metadata": {"protectionType": "TAKE_PROFIT"},
        })
        result = self.boundary.close_position({"instrument": self.instrument})
        self.assertEqual(result.side, "BUY")
        close_order = self.core._find_order(self.core._coerce_order_id(result.clientOrderId))
        self.assertTrue(bool(getattr(close_order, "is_reduce_only", False)))
        self.assertIsNone(self.core.get_position())

    def test_full_close_only_sl_only_tp_and_no_protection(self) -> None:
        for protection in ("STOP_LOSS", "TAKE_PROFIT", None):
            with self.subTest(protection=protection):
                self.core.reset()
                self.core.set_market("100", "101")
                self.open()
                if protection:
                    self.protect(protection)
                self.boundary.close_position({"instrument": self.instrument})
                self.assertIsNone(self.core.get_position())

    def test_terminal_protection_is_ignored_and_unrelated_limit_is_preserved(self) -> None:
        self.open()
        self.protect("STOP_LOSS", "terminal-sl")
        self.boundary.cancel_order("terminal-sl")
        self.boundary.submit_order({
            "clientOrderId": "entry-limit", "instrument": self.instrument, "side": "BUY",
            "orderType": "LIMIT", "quantity": "1", "price": "99",
            "timeInForce": "GTC", "reduceOnly": False, "postOnly": False,
        })
        self.boundary.close_position({"instrument": self.instrument})
        self.assertEqual(self.boundary.get_order("entry-limit").status, "ACCEPTED")
        self.assertEqual(self.boundary.get_order("terminal-sl").status, "CANCELED")

    def test_cancel_failure_blocks_market_close(self) -> None:
        self.open()
        self.protect("STOP_LOSS", "sl")
        calls = {"market": 0}
        def fail_cancel(boundary, order_id):
            raise RuntimeError("forced cancel failure")
        original_submit = SimulationCoreJsonBoundary.submit_order
        def count_market(boundary, payload):
            if payload["orderType"] == "MARKET":
                calls["market"] += 1
            return original_submit(boundary, payload)
        with patch.object(SimulationCoreJsonBoundary, "cancel_order", fail_cancel), patch.object(SimulationCoreJsonBoundary, "submit_order", count_market):
            with self.assertRaisesRegex(ContractBoundaryError, "PROTECTION_CANCEL_FAILED"):
                self.boundary.close_position({"instrument": self.instrument})
        self.assertEqual(calls["market"], 0)
        self.assertIsNotNone(self.core.get_position())

    def test_close_failure_after_cleanup_is_explicit_and_not_rolled_back(self) -> None:
        self.open()
        self.protect("TAKE_PROFIT", "tp")
        original_submit = SimulationCoreJsonBoundary.submit_order
        def fail_market(boundary, payload):
            if payload["orderType"] == "MARKET":
                raise RuntimeError("forced close failure")
            return original_submit(boundary, payload)
        with patch.object(SimulationCoreJsonBoundary, "submit_order", fail_market):
            with self.assertRaisesRegex(ContractBoundaryError, "PROTECTIONS_CANCELED_CLOSE_FAILED"):
                self.boundary.close_position({"instrument": self.instrument})
        self.assertIsNotNone(self.core.get_position())
        self.assertEqual(self.boundary.get_order("tp").status, "CANCELED")

    def test_partial_close_does_not_cleanup_protections(self) -> None:
        self.open()
        self.protect("STOP_LOSS", "sl")
        result = self.boundary.close_position({"instrument": self.instrument, "quantity": "0.5"})
        self.assertEqual(result.side, "SELL")
        self.assertEqual(self.boundary.get_order("sl").status, "ACCEPTED")
        self.assertEqual(self.core.get_position()["quantity"], Decimal("1.5"))

    def _trigger_pair(self, side: str, trigger: str, tp_price: str, bid: str, ask: str) -> None:
        self.open(side)
        protection_side = "SELL" if side == "BUY" else "BUY"
        if side == "BUY":
            stop_trigger = "99" if trigger == "99" else "90"
        else:
            stop_trigger = "110"
        self.boundary.submit_order({
            "clientOrderId": "sl", "instrument": self.instrument, "side": protection_side,
            "orderType": "STOP_MARKET", "quantity": "2", "triggerPrice": stop_trigger,
            "timeInForce": "GTC", "reduceOnly": True, "postOnly": False,
        })
        self.boundary.submit_order({
            "clientOrderId": "tp", "instrument": self.instrument, "side": protection_side,
            "orderType": "LIMIT", "quantity": "2", "price": tp_price,
            "timeInForce": "GTC", "reduceOnly": True, "postOnly": False,
            "metadata": {"protectionType": "TAKE_PROFIT"},
        })
        self.boundary.close_position({"instrument": self.instrument, "quantity": "0.5"})
        self.core.set_market(bid, ask)

    def test_partial_long_sl_no_reversal_and_oco_cleanup(self) -> None:
        self._trigger_pair("BUY", "99", "110", "98", "99")
        self.assertIsNone(self.core.get_position())
        self.assertEqual(self.boundary.get_order("sl").status, "FILLED")
        self.assertEqual(self.boundary.get_order("sl").filledQuantity, "1.5")
        self.assertEqual(self.boundary.get_order("tp").status, "CANCELED")

    def test_partial_long_tp_no_reversal_and_oco_cleanup(self) -> None:
        self._trigger_pair("BUY", "110", "110", "110", "111")
        self.assertIsNone(self.core.get_position())
        self.assertEqual(self.boundary.get_order("tp").status, "FILLED")
        self.assertEqual(self.boundary.get_order("tp").filledQuantity, "1.5")
        self.assertEqual(self.boundary.get_order("sl").status, "CANCELED")

    def test_partial_short_sl_no_reversal_and_oco_cleanup(self) -> None:
        self._trigger_pair("SELL", "101", "90", "111", "112")
        self.assertIsNone(self.core.get_position())
        self.assertEqual(self.boundary.get_order("sl").status, "FILLED")
        self.assertEqual(self.boundary.get_order("sl").filledQuantity, "1.5")
        self.assertEqual(self.boundary.get_order("tp").status, "CANCELED")

    def test_partial_short_tp_no_reversal_and_oco_cleanup(self) -> None:
        self._trigger_pair("SELL", "90", "90", "89", "90")
        self.assertIsNone(self.core.get_position())
        self.assertEqual(self.boundary.get_order("tp").status, "FILLED")
        self.assertEqual(self.boundary.get_order("tp").filledQuantity, "1.5")
        self.assertEqual(self.boundary.get_order("sl").status, "CANCELED")

    def test_flat_stale_protection_never_executes(self) -> None:
        self.open()
        self.protect("STOP_LOSS", "sl")
        self.core.submit_market("SELL", "2", reduce_only=True, client_order_id="external-close")
        self.core.set_market("98", "99")
        self.assertIsNone(self.core.get_position())
        self.assertEqual(self.boundary.get_order("sl").status, "CANCELED")

    def test_full_close_is_serialized_by_daemon_state_lock(self) -> None:
        import threading
        import time
        import scripts.nautilus_bridge.daemon as daemon

        started = threading.Event()
        entered = threading.Event()
        def market_callback() -> None:
            started.set()
            with daemon.STATE_LOCK:
                entered.set()

        with daemon.STATE_LOCK:
            worker = threading.Thread(target=market_callback)
            worker.start()
            self.assertTrue(started.wait(timeout=1))
            time.sleep(0.01)
            self.assertFalse(entered.is_set())
        worker.join(timeout=1)
        self.assertTrue(entered.is_set())


if __name__ == "__main__":
    unittest.main()

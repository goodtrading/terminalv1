from __future__ import annotations

import asyncio
import socket
import unittest
from contextlib import ExitStack
from decimal import Decimal
from unittest.mock import patch
from urllib import request as urllib_request

from nautilus_trader.model.identifiers import ClientOrderId

from simulation_core import DEFAULT_SYMBOL
from simulation_core import SimulationCore
from simulation_core import SimulationCoreError
from simulation_core import SimulationCoreConfig


class SimulationCoreTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.core = SimulationCore()

    def tearDown(self) -> None:
        self.core.shutdown()

    def _start_core(self) -> SimulationCore:
        self.core.start()
        return self.core

    def _market_guard(self):
        stack = ExitStack()
        stack.enter_context(patch.object(socket, "create_connection", side_effect=AssertionError("network is forbidden")))
        stack.enter_context(patch.object(asyncio, "open_connection", side_effect=AssertionError("network is forbidden")))
        stack.enter_context(patch.object(urllib_request, "urlopen", side_effect=AssertionError("network is forbidden")))
        return stack

    def _open_long_one(self, *, bid: int = 99_999, ask: int = 100_001):
        self.core.set_market(bid, ask)
        submitted = self.core.submit_market("buy", 1)
        self.assertEqual(submitted["status"], "filled")
        return submitted

    def _open_short_one(self, *, bid: int = 99_999, ask: int = 100_001):
        self.core.set_market(bid, ask)
        submitted = self.core.submit_market("sell", 1)
        self.assertEqual(submitted["status"], "filled")
        return submitted

    def _order_fill_commissions(self, client_order_id: str) -> list[Decimal]:
        cached = self.core._cache.order(ClientOrderId(client_order_id))
        self.assertIsNotNone(cached)
        commissions: list[Decimal] = []
        for event in cached.events:
            commission = getattr(event, "commission", None)
            if commission is not None:
                commissions.append(Decimal(str(commission.as_decimal())))
        return commissions

    def test_core_starts_with_deterministic_account_and_canonical_instrument(self) -> None:
        with self._market_guard():
            self._start_core()
            account = self.core.get_account()
            self.assertEqual(account["venue"], "SIM")
            self.assertEqual(account["instrument"]["symbol"], DEFAULT_SYMBOL)
            self.assertEqual(account["instrument"]["market_type"], "perpetual")
            self.assertEqual(account["instrument"]["quote_currency"], "USDT")
            self.assertEqual(account["balance_total"], Decimal("100000"))
            self.assertEqual(account["balance_free"], Decimal("100000"))
            self.assertEqual(account["balance_locked"], Decimal("0"))
            self.assertEqual(account["realized_pnl"], Decimal("0"))
            self.assertEqual(account["unrealized_pnl"], Decimal("0"))
            self.assertEqual(account["fees_total"], Decimal("0"))
            self.assertEqual(self.core.get_orders(), [])
            self.assertIsNone(self.core.get_position())

    def test_market_buy_fills_position_and_realized_pnl_updates_on_close(self) -> None:
        with self._market_guard():
            self._start_core()
            self._open_long_one()
            position = self.core.get_position()
            self.assertIsNotNone(position)
            self.assertEqual(position["side"], "long")
            self.assertEqual(position["quantity"], Decimal("1"))
            self.assertEqual(position["average_entry_price"], Decimal("100001.0"))
            self.assertEqual(position["realized_pnl"], Decimal("0"))
            self.assertLess(position["unrealized_pnl"], Decimal("0"))
            self.assertEqual(self.core.get_account()["fees_total"], Decimal("0"))

    def test_unrealized_pnl_is_positive_when_market_rises_for_long(self) -> None:
        with self._market_guard():
            self._start_core()
            self._open_long_one()
            self.core.set_market(100_099, 100_101)
            position = self.core.get_position()
            account = self.core.get_account()
            self.assertGreater(position["unrealized_pnl"], Decimal("0"))
            self.assertGreater(account["equity"], account["balance_total"])
            self.assertEqual(position["average_entry_price"], Decimal("100001.0"))

    def test_unrealized_pnl_is_negative_when_market_falls_for_long(self) -> None:
        with self._market_guard():
            self._start_core()
            self._open_long_one()
            self.core.set_market(99_900, 99_902)
            position = self.core.get_position()
            account = self.core.get_account()
            self.assertLess(position["unrealized_pnl"], Decimal("0"))
            self.assertLess(account["equity"], account["balance_total"])

    def test_increase_long_updates_quantity_and_average_entry(self) -> None:
        with self._market_guard():
            self._start_core()
            first = self._open_long_one()
            self.core.set_market(100_199, 100_201)
            second = self.core.submit_market("buy", 1)
            self.assertEqual(second["status"], "filled")
            position = self.core.get_position()
            self.assertEqual(position["side"], "long")
            self.assertEqual(position["quantity"], Decimal("2"))
            self.assertEqual(position["average_entry_price"], Decimal("100101.0"))
            self.assertEqual(position["realized_pnl"], Decimal("0"))
            self.assertEqual(self.core.get_account()["fees_total"], Decimal("0"))
            self.assertEqual(first["status"], "filled")

    def test_reduce_long_changes_realized_pnl_and_keeps_remaining_basis(self) -> None:
        with self._market_guard():
            self._start_core()
            self._open_long_one()
            self.core.set_market(100_199, 100_201)
            self.core.submit_market("buy", 1)
            before = self.core.get_position()
            self.core.set_market(100_299, 100_301)
            reduced = self.core.submit_market("sell", 1)
            after = self.core.get_position()
            self.assertEqual(reduced["status"], "filled")
            self.assertEqual(before["quantity"], Decimal("2"))
            self.assertEqual(after["quantity"], Decimal("1"))
            self.assertEqual(after["side"], "long")
            self.assertGreater(after["realized_pnl"], before["realized_pnl"])
            self.assertEqual(after["average_entry_price"], Decimal("100101.0"))

    def test_profitable_close_results_in_positive_realized_pnl_and_flat_position(self) -> None:
        with self._market_guard():
            self._start_core()
            self._open_long_one()
            self.core.set_market(100_299, 100_301)
            closed = self.core.submit_market("sell", 1)
            account = self.core.get_account()
            self.assertEqual(closed["status"], "filled")
            self.assertIsNone(self.core.get_position())
            self.assertGreater(account["realized_pnl"], Decimal("0"))
            self.assertEqual(account["unrealized_pnl"], Decimal("0"))
            self.assertEqual(account["balance_total"], Decimal("100298"))
            self.assertEqual(account["equity"], Decimal("100298"))

    def test_losing_close_results_in_negative_realized_pnl(self) -> None:
        with self._market_guard():
            self._start_core()
            self._open_long_one()
            self.core.set_market(99_900, 99_902)
            closed = self.core.submit_market("sell", 1)
            account = self.core.get_account()
            self.assertEqual(closed["status"], "filled")
            self.assertIsNone(self.core.get_position())
            self.assertLess(account["realized_pnl"], Decimal("0"))
            self.assertEqual(account["unrealized_pnl"], Decimal("0"))

    def test_flip_long_one_to_short_one_is_supported(self) -> None:
        with self._market_guard():
            self._start_core()
            self._open_long_one()
            self.core.set_market(100_299, 100_301)
            flipped = self.core.submit_market("sell", 2)
            position = self.core.get_position()
            self.assertEqual(flipped["status"], "filled")
            self.assertIsNotNone(position)
            self.assertEqual(position["side"], "short")
            self.assertEqual(position["quantity"], Decimal("1"))

    def test_short_unrealized_pnl_is_positive_when_market_falls(self) -> None:
        with self._market_guard():
            self._start_core()
            self._open_short_one()
            self.core.set_market(99_899, 99_901)
            position = self.core.get_position()
            account = self.core.get_account()
            self.assertEqual(position["side"], "short")
            self.assertGreater(position["unrealized_pnl"], Decimal("0"))
            self.assertGreater(account["equity"], account["balance_total"])

    def test_fees_are_source_derived_and_non_zero(self) -> None:
        # Explicit historical/custom economics fixture, not the Paper default.
        self.core = SimulationCore(SimulationCoreConfig(maker_fee=Decimal("0.0002"), taker_fee=Decimal("0.0005")))
        with self._market_guard():
            self._start_core()
            buy = self._open_long_one()
            self.core.set_market(100_299, 100_301)
            sell = self.core.submit_market("sell", 1)
            buy_commissions = self._order_fill_commissions(buy["client_order_id"])
            sell_commissions = self._order_fill_commissions(sell["client_order_id"])
            commissions = buy_commissions + sell_commissions
            self.assertTrue(all(c > 0 for c in commissions))
            self.assertGreater(sum(commissions, Decimal("0")), Decimal("0"))
            self.assertGreater(self.core.get_account()["fees_total"], Decimal("0"))
            self.assertEqual(self.core.get_account()["balance_total"], Decimal("100197.85"))

    def test_reset_restores_the_exact_start_state(self) -> None:
        with self._market_guard():
            self._start_core()
            baseline = self.core.get_account()
            self._open_long_one()
            self.core.set_market(100_300, 100_302)
            self.assertNotEqual(self.core.get_account()["equity"], baseline["equity"])

            self.core.reset()
            reset_account = self.core.get_account()
            self.assertEqual(reset_account, baseline)
            self.assertEqual(self.core.get_orders(), [])
            self.assertIsNone(self.core.get_position())

    def test_limit_buy_stays_working_then_fills_and_position_appears(self) -> None:
        with self._market_guard():
            self._start_core()
            self.core.set_market(99_999, 100_001)
            submitted = self.core.submit_limit("buy", 1, 99_900)
            self.assertEqual(submitted["status"], "accepted")
            self.assertEqual(submitted["order_type"], "limit")
            self.assertEqual(len(self.core.get_orders()), 1)
            self.assertIsNone(self.core.get_position())

            self.core.set_market(99_899, 99_900)
            self.assertEqual(self.core.get_orders(), [])
            position = self.core.get_position()
            self.assertIsNotNone(position)
            self.assertEqual(position["side"], "long")
            self.assertEqual(position["quantity"], Decimal("1"))

    def test_working_limit_can_be_canceled_and_stays_canceled(self) -> None:
        with self._market_guard():
            self._start_core()
            self.core.set_market(99_999, 100_001)
            submitted = self.core.submit_limit("buy", 1, 99_900)
            self.assertEqual(submitted["status"], "accepted")
            self.assertEqual(len(self.core.get_orders()), 1)
            self.assertIsNone(self.core.get_position())

            canceled = self.core.cancel(submitted)
            self.assertEqual(canceled["status"], "canceled")
            self.assertEqual(self.core.get_orders(), [])
            self.assertIsNone(self.core.get_position())

            self.core.set_market(99_899, 99_900)
            self.assertEqual(self.core.get_orders(), [])
            self.assertIsNone(self.core.get_position())

    def test_invalid_order_and_unknown_cancel_are_controlled(self) -> None:
        with self._market_guard():
            self._start_core()
            self.core.set_market(100_000, 100_001)
            with self.assertRaisesRegex(ValueError, "quantity must be positive"):
                self.core.submit_market("buy", 0)
            with self.assertRaisesRegex(ValueError, "limit orders require a price"):
                self.core.submit_limit("buy", 1, None)  # type: ignore[arg-type]
            with self.assertRaisesRegex(ValueError, "limit orders require a positive price"):
                self.core.submit_limit("buy", 1, 0)
            with self.assertRaisesRegex(SimulationCoreError, "unknown order id"):
                self.core.cancel("missing-order-id")

    def test_canceled_or_filled_limit_order_cannot_be_canceled_again(self) -> None:
        with self._market_guard():
            self._start_core()
            self.core.set_market(99_999, 100_001)
            working = self.core.submit_limit("buy", 1, 99_900)
            canceled = self.core.cancel(working)
            with self.assertRaisesRegex(SimulationCoreError, "already canceled"):
                self.core.cancel(canceled)

            self.core.reset()
            self.core.set_market(99_999, 100_001)
            filled = self.core.submit_limit("buy", 1, 99_900)
            self.core.set_market(99_899, 99_900)
            with self.assertRaisesRegex(SimulationCoreError, "already filled"):
                self.core.cancel(filled)

    def test_packaged_runtime_smoke_guard_is_zero_network(self) -> None:
        with self._market_guard():
            self._start_core()
            self.core.set_market(99_999, 100_001)
            result = self.core.submit_market("buy", 1)
            self.assertEqual(result["status"], "filled")
            self.assertIsNotNone(self.core.get_position())

    def test_native_long_stop_market_reduce_only_triggers_without_reversal(self) -> None:
        with self._market_guard():
            self._start_core()
            self._open_long_one()
            stop = self.core.submit_stop_market("sell", 1, 99_900)
            self.assertEqual(stop["status"], "accepted")
            self.core.set_market(99_899, 99_901)
            triggered = self.core.get_order(stop["client_order_id"])
            self.assertEqual(triggered["status"], "filled")
            self.assertIsNone(self.core.get_position())

    def test_native_short_stop_market_reduce_only_triggers_without_reversal(self) -> None:
        with self._market_guard():
            self._start_core()
            self._open_short_one()
            stop = self.core.submit_stop_market("buy", 1, 100_100)
            self.assertEqual(stop["status"], "accepted")
            self.core.set_market(100_099, 100_101)
            triggered = self.core.get_order(stop["client_order_id"])
            self.assertEqual(triggered["status"], "filled")
            self.assertIsNone(self.core.get_position())


    def test_protective_tp_long_and_short_are_reduce_only(self) -> None:
        with self._market_guard():
            self._start_core()
            self._open_long_one()
            long_tp = self.core.submit_take_profit_limit("sell", 1, 100_100)
            self.assertEqual(long_tp["tags"], ["GT_PROTECTION=TAKE_PROFIT"])
            self.core.set_market(100_100, 100_101)
            self.assertIsNone(self.core.get_position())

            self.core.reset()
            self.core.set_market(99_999, 100_001)
            self._open_short_one()
            short_tp = self.core.submit_take_profit_limit("buy", 1, 99_900)
            self.assertEqual(short_tp["tags"], ["GT_PROTECTION=TAKE_PROFIT"])
            self.core.set_market(99_899, 99_900)
            self.assertIsNone(self.core.get_position())

    def test_protective_stop_safety_and_snapshot_fields(self) -> None:
        with self._market_guard():
            self._start_core()
            with self.assertRaisesRegex(SimulationCoreError, "open position"):
                self.core.submit_stop_market("sell", 1, 99_900)
            self._open_long_one()
            with self.assertRaisesRegex(SimulationCoreError, "side"):
                self.core.submit_stop_market("buy", 1, 99_900)
            with self.assertRaisesRegex(SimulationCoreError, "exceeds"):
                self.core.submit_stop_market("sell", 2, 99_900)
            stop = self.core.submit_stop_market("sell", 1, 99_900)
            self.assertEqual(stop["trigger_price"], Decimal("99900.0"))
            self.assertEqual(stop["tags"], ["GT_PROTECTION=STOP_LOSS"])
            canceled = self.core.cancel(stop)
            self.assertEqual(canceled["status"], "canceled")
            self.core.set_market(99_899, 99_901)
            self.assertEqual(self.core.get_order(stop["client_order_id"])["status"], "canceled")


if __name__ == "__main__":
    unittest.main(verbosity=2)

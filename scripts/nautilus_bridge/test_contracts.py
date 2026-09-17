from __future__ import annotations

import json
import unittest
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

from scripts.nautilus_bridge.contracts import (
    ContractBoundaryError,
    GTOrderIntentDTO,
    GTOrderStateDTO,
    GTPositionDTO,
    GTFillDTO,
    GTTradingEventEnvelopeDTO,
    SimulationCoreJsonBoundary,
    _json_safe_recursive,
)
from scripts.nautilus_bridge.simulation_core import SimulationCore


def _assert_json_safe(value: Any) -> None:
    if value is None or isinstance(value, (str, int, float, bool)):
        return
    if isinstance(value, dict):
        for key, item in value.items():
            assert isinstance(key, str), f"non-string JSON key: {type(key).__name__}"
            _assert_json_safe(item)
        return
    if isinstance(value, list):
        for item in value:
            _assert_json_safe(item)
        return
    raise AssertionError(f"non-JSON-safe value escaped: {type(value).__name__}")


class SimulationCoreJsonContractTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.core = SimulationCore()
        self.core.start()
        self.addCleanup(self.core.shutdown)
        self.boundary = SimulationCoreJsonBoundary(self.core)

    def _market(self) -> None:
        self.core.set_market(99_999, 100_001)

    def _market_lower(self) -> None:
        self.core.set_market(99_899, 99_899)

    def _intent(self, **overrides: Any) -> GTOrderIntentDTO:
        payload: dict[str, Any] = {
            "clientOrderId": overrides.pop("clientOrderId", "gt-json-1"),
            "instrument": overrides.pop(
                "instrument",
                {
                    "venue": "SIM",
                    "marketType": "perpetual",
                    "symbol": "BTCUSDT-PERP",
                    "baseAsset": "BTC",
                    "quoteAsset": "USDT",
                    "exchangeNativeSymbol": "BTCUSDT",
                },
            ),
            "side": overrides.pop("side", "BUY"),
            "orderType": overrides.pop("orderType", "MARKET"),
            "quantity": overrides.pop("quantity", "1"),
            "timeInForce": overrides.pop("timeInForce", "GTC"),
            "reduceOnly": overrides.pop("reduceOnly", False),
            "postOnly": overrides.pop("postOnly", False),
        }
        payload.update(overrides)
        return GTOrderIntentDTO.from_json_dict(payload)

    def test_market_fill_read_model_is_stable_and_reconciles_fees(self) -> None:
        self._market()
        order = self.boundary.submit_order(self._intent(clientOrderId="fill-1", orderType="MARKET", quantity="1"))
        fills = self.boundary.list_fills()
        self.assertEqual(len(fills), 1)
        fill = fills[0]
        self.assertEqual(fill.clientOrderId, "fill-1")
        self.assertEqual(fill.venueOrderId, order.venueOrderId)
        self.assertEqual(fill.quantity, "1")
        self.assertEqual(Decimal(fill.price), Decimal("100001"))
        self.assertEqual(fill.timestamp, 0)
        self.assertIsNotNone(fill.fillId)
        self.assertIsNotNone(fill.fee)
        self.assertIsNotNone(fill.feeAsset)
        self.assertIn(fill.liquidity, {"MAKER", "TAKER", None})
        account = self.boundary.get_account()
        self.assertEqual(sum(Decimal(str(item.fee or "0")) for item in fills), Decimal(str(account.feesTotal)))

    def test_two_market_orders_have_distinct_fill_and_order_identity(self) -> None:
        self._market()
        first = self.boundary.submit_order(self._intent(clientOrderId="fill-order-1", orderType="MARKET"))
        second = self.boundary.submit_order(self._intent(clientOrderId="fill-order-2", orderType="MARKET"))
        fills = self.boundary.list_fills()
        self.assertEqual({item.clientOrderId for item in fills}, {"fill-order-1", "fill-order-2"})
        self.assertEqual(len({item.fillId for item in fills}), 2)
        self.assertNotEqual(first.clientOrderId, second.clientOrderId)

    def test_fill_contract_preserves_exact_decimal_wire_values(self) -> None:
        snapshot = {
            "fill_id": "trade-precision",
            "client_order_id": "client-precision",
            "venue_order_id": "venue-precision",
            "side": "BUY",
            "price": "1.000000000000000001",
            "quantity": "0.000000000000000123",
            "timestamp": 1_700_000_000_123_000_000,
            "fee": "0.000000000000000007",
            "fee_asset": "USDT",
            "liquidity": "TAKER",
        }
        fill = GTFillDTO.from_simulation_snapshot(self.core, snapshot)
        payload = json.loads(json.dumps(fill.to_json_dict()))
        self.assertEqual(payload["fillId"], "trade-precision")
        self.assertEqual(payload["price"], "1.000000000000000001")
        self.assertEqual(payload["quantity"], "0.000000000000000123")
        self.assertEqual(payload["fee"], "0.000000000000000007")
        self.assertEqual(payload["feeAsset"], "USDT")
        self.assertEqual(payload["liquidity"], "TAKER")
        self.assertEqual(payload["timestamp"], 1_700_000_000_123)

        class CacheWithoutFillId:
            def orders(self, **_: Any) -> list[Any]:
                event = SimpleNamespace(
                    last_qty=Decimal("0.000000000000000123"),
                    last_px=Decimal("1.000000000000000001"),
                    ts_event=1_700_000_000_123_000_000,
                    trade_id=None,
                    commission=None,
                    liquidity_side=None,
                )
                return [SimpleNamespace(
                    events=[event],
                    client_order_id="order-level-id",
                    venue_order_id="venue-order-id",
                    instrument_id="BTCUSDT-PERP.SIM",
                    side="BUY",
                )]

        self.core._cache = CacheWithoutFillId()  # noqa: SLF001 - boundary failure fixture
        with self.assertRaisesRegex(Exception, "factual trade_id/fill_id"):
            self.core.list_fills()

    def test_cancel_without_fill_exposes_no_fill(self) -> None:
        self._market()
        accepted = self.boundary.submit_order(self._intent(clientOrderId="fill-cancel-1", orderType="LIMIT", price="99900"))
        self.assertEqual(accepted.status, "ACCEPTED")
        self.boundary.cancel_order("fill-cancel-1")
        self.assertEqual([item for item in self.boundary.list_fills() if item.clientOrderId == "fill-cancel-1"], [])

    def test_market_round_trip_json_safe(self) -> None:
        self._market()
        intent = self._intent(clientOrderId="market-1", orderType="MARKET")
        encoded = json.loads(json.dumps(intent.to_json_dict()))
        result = self.boundary.submit_order(encoded)
        result_json = result.to_json_dict()
        _assert_json_safe(result_json)
        self.assertEqual(result.status, "FILLED")
        self.assertEqual(result.side, "BUY")
        self.assertEqual(result.filledQuantity, "1")
        self.assertEqual(result.remainingQuantity, "0")
        self.assertEqual(result_json["status"], "FILLED")
        position = self.boundary.get_position()
        self.assertEqual(position.side, "LONG")
        self.assertEqual(position.quantity, "1")
        account = self.boundary.get_account()
        _assert_json_safe(account.to_json_dict())
        self.assertIsInstance(account.timestamp, int)

    def test_limit_round_trip_cancel_and_fill(self) -> None:
        self._market()
        limit = self._intent(clientOrderId="limit-1", orderType="LIMIT", price="99900")
        accepted = self.boundary.submit_order(limit.to_json_dict())
        self.assertEqual(accepted.status, "ACCEPTED")
        self.assertEqual(accepted.remainingQuantity, "1")
        self.assertEqual(self.boundary.get_position().side, "FLAT")
        self._market_lower()
        filled = self.boundary.get_order("limit-1")
        self.assertEqual(filled.status, "FILLED")
        self.assertEqual(filled.filledQuantity, "1")
        self.assertEqual(self.boundary.get_position().side, "LONG")

    def test_cancel_round_trip_keeps_position_flat(self) -> None:
        self._market()
        limit = self._intent(clientOrderId="cancel-1", orderType="LIMIT", price="99900")
        accepted = self.boundary.submit_order(limit)
        self.assertEqual(accepted.status, "ACCEPTED")
        canceled = self.boundary.cancel_order("cancel-1")
        self.assertEqual(canceled.status, "CANCELED")
        self.assertEqual(canceled.remainingQuantity, "1")
        self.assertEqual(self.boundary.get_position().side, "FLAT")
        self._market_lower()
        after_move = self.boundary.get_order("cancel-1")
        self.assertEqual(after_move.status, "CANCELED")
        self.assertEqual(self.boundary.get_position().side, "FLAT")

    def test_flip_round_trip_and_execution_economics_json_safe(self) -> None:
        self._market()
        buy = self.boundary.submit_order(self._intent(clientOrderId="buy-1", orderType="MARKET"))
        self.assertEqual(buy.status, "FILLED")
        sell = self.boundary.submit_order(self._intent(clientOrderId="sell-2", orderType="MARKET", side="SELL", quantity="2"))
        self.assertEqual(sell.status, "FILLED")
        position = self.boundary.get_position()
        self.assertEqual(position.side, "SHORT")
        self.assertEqual(position.quantity, "1")
        _assert_json_safe(position.to_json_dict())

        economics = self.boundary.get_execution_economics("sell-2")
        economics_json = economics.to_json_dict()
        _assert_json_safe(economics_json)
        self.assertEqual(economics_json["partialFillCount"], 1)
        self.assertIsNone(economics_json.get("fees"))
        self.assertEqual(economics_json["takerQuantity"], "2")

        account = self.boundary.get_account()
        account_json = account.to_json_dict()
        _assert_json_safe(account_json)
        self.assertEqual(account_json["feesTotal"], "0")
        self.assertNotEqual(Decimal(str(account_json["realizedPnl"])), Decimal("0"))

    def test_validation_and_recursive_json_safety(self) -> None:
        with self.assertRaises(ContractBoundaryError):
            GTOrderIntentDTO.from_json_dict({
                "clientOrderId": "bad-1",
                "instrument": {"venue": "SIM", "marketType": "perpetual", "symbol": "BTCUSDT-PERP", "baseAsset": "BTC", "quoteAsset": "USDT"},
                "side": "BUY",
                "orderType": "LIMIT",
                "quantity": "1",
            })
        market_ioc = GTOrderIntentDTO.from_json_dict({
            "clientOrderId": "bad-2",
            "instrument": {"venue": "SIM", "marketType": "perpetual", "symbol": "BTCUSDT-PERP", "baseAsset": "BTC", "quoteAsset": "USDT"},
            "side": "BUY",
            "orderType": "MARKET",
            "quantity": "1",
            "timeInForce": "IOC",
        })
        self.assertEqual(market_ioc.timeInForce, "IOC")
        with self.assertRaises(ContractBoundaryError):
            self.boundary.submit_order(market_ioc)

        payload = self.boundary.get_account().to_json_dict()
        _json_safe_recursive(payload)
        encoded = json.dumps(payload)
        decoded = json.loads(encoded)
        _assert_json_safe(decoded)

    def test_protective_stop_market_boundary_reaches_native_submit(self) -> None:
        self._market()
        opened = self.boundary.submit_order(self._intent(clientOrderId="sl-open", orderType="MARKET"))
        self.assertEqual(opened.status, "FILLED")
        stop = self.boundary.submit_order(self._intent(
            clientOrderId="sl-1", side="SELL", orderType="STOP_MARKET", quantity="1",
            triggerPrice="99900", reduceOnly=True, metadata={"protectionType": "STOP_LOSS"},
        ))
        self.assertEqual(stop.orderType, "STOP_MARKET")
        self.assertEqual(stop.status, "ACCEPTED")
        self.assertEqual(stop.triggerPrice, "99900")
        self.assertEqual(stop.protectionType, "STOP_LOSS")

    def test_protective_take_profit_boundary_remains_native_limit(self) -> None:
        self._market()
        opened = self.boundary.submit_order(self._intent(clientOrderId="tp-open", orderType="MARKET"))
        self.assertEqual(opened.status, "FILLED")
        tp = self.boundary.submit_order(self._intent(
            clientOrderId="tp-1", side="SELL", orderType="LIMIT", quantity="1",
            price="100100", reduceOnly=True, metadata={"protectionType": "TAKE_PROFIT"},
        ))
        self.assertEqual(tp.orderType, "LIMIT")
        self.assertEqual(tp.status, "ACCEPTED")
        self.assertEqual(tp.protectionType, "TAKE_PROFIT")

    def test_event_envelope_is_json_safe(self) -> None:
        self._market()
        order = self.boundary.submit_order(self._intent(clientOrderId="evt-1", orderType="MARKET"))
        envelope = self.boundary.wrap_event("order.filled", order, occurred_at=123456789, source="nautilus-paper", event_id="evt-123")
        envelope_json = envelope.to_json_dict()
        _assert_json_safe(envelope_json)
        self.assertEqual(envelope_json["schemaVersion"], 1)
        self.assertEqual(envelope_json["eventType"], "order.filled")
        self.assertEqual(envelope_json["source"], "nautilus-paper")
        self.assertEqual(envelope_json["payload"]["status"], "FILLED")


if __name__ == "__main__":
    unittest.main()

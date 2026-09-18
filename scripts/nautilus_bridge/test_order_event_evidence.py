from __future__ import annotations

from decimal import Decimal

from scripts.nautilus_bridge.contracts import SimulationCoreJsonBoundary
from scripts.nautilus_bridge.simulation_core import SimulationCore


def make_core() -> SimulationCore:
    core = SimulationCore()
    core.start()
    core.set_market("100.00", "100.01", timestamp_ns=1_700_000_000_000_000_000)
    return core


def test_raw_order_events_are_stable_and_native_identified() -> None:
    core = make_core()
    try:
        core.submit_limit("BUY", "0.100", "99.00", client_order_id="R1A-LIMIT-001")
        core.cancel("R1A-LIMIT-001")
        boundary = SimulationCoreJsonBoundary(core)
        first = [event.to_json_dict() for event in boundary.list_order_events()]
        second = [event.to_json_dict() for event in boundary.list_order_events()]

        assert first == second
        assert [event["eventType"] for event in first] == [
            "OrderInitialized",
            "OrderSubmitted",
            "OrderAccepted",
            "OrderCanceled",
        ]
        ids = [event["eventId"] for event in first]
        assert len(ids) == len(set(ids))
        assert all(event["clientOrderId"] == "R1A-LIMIT-001" for event in first)
        assert all(event["eventId"] != event["clientOrderId"] for event in first)
        assert all(isinstance(event["tsEventNs"], str) for event in first)
        assert all(int(event["tsEventNs"]) >= 1_700_000_000_000_000_000 for event in first)
    finally:
        core.shutdown()


def test_filled_event_keeps_trade_identity_and_exact_economics() -> None:
    core = make_core()
    try:
        core.submit_market("BUY", "0.100", client_order_id="R1A-MARKET-001")
        events = SimulationCoreJsonBoundary(core).list_order_events()
        fills = [event.to_json_dict() for event in events if event.eventType == "OrderFilled"]
        assert len(fills) == 1
        fill = fills[0]
        assert fill["tradeId"]
        assert fill["tradeId"] != fill["eventId"]
        assert fill["tradeId"] != fill["clientOrderId"]
        assert fill["quantity"] == "0.100"
        assert fill["price"] == "100.01"
        assert fill["liquiditySide"] == "TAKER"
    finally:
        core.shutdown()


def test_protection_tags_are_order_factual_and_relationship_is_not_invented() -> None:
    core = make_core()
    try:
        core.submit_market("BUY", "0.100", client_order_id="R1A-ENTRY-001")
        core.submit_stop_market("SELL", "0.100", "95.00", client_order_id="R1A-SL-001")
        events = [event.to_json_dict() for event in SimulationCoreJsonBoundary(core).list_order_events()]
        protected = [event for event in events if event.get("clientOrderId") == "R1A-SL-001"]
        assert protected
        assert any("GT_PROTECTION=STOP_LOSS" in event["tags"] for event in protected)
        assert any(event["tagsSource"] == "ORDER_FACTUAL" for event in protected)
        assert any(event.get("triggerPrice") == "95.00" for event in protected)
        assert any(event.get("side") == "SELL" for event in protected)
        assert any(event.get("orderType") == "STOP_MARKET" for event in protected)
        assert all(event["contingencyType"] if "contingencyType" in event else None is None for event in protected)
        assert all("parentOrderId" not in event for event in protected)
        assert all(event["linkedOrderIds"] == [] for event in protected)
    finally:
        core.shutdown()

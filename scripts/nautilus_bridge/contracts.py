from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import re
from typing import Any, Mapping
from uuid import uuid4

try:
    from goodtrading.simulation_core import SimulationCore, SimulationCoreError
except ImportError:  # pragma: no cover - dev source-tree fallback
    from scripts.nautilus_bridge.simulation_core import SimulationCore, SimulationCoreError


class ContractBoundaryError(ValueError):
    """Controlled error raised by the GoodTrading JSON boundary."""


_ALLOWED_JSON_SCALARS = (str, int, float, bool, type(None))
_ALLOWED_ORDER_SIDE = {"BUY", "SELL"}
_ALLOWED_ORDER_TYPE = {"MARKET", "LIMIT", "STOP_MARKET", "STOP_LIMIT", "MARKET_IF_TOUCHED", "LIMIT_IF_TOUCHED", "TRAILING_STOP"}
_ALLOWED_TIME_IN_FORCE = {"GTC", "IOC", "FOK", "GTD", "DAY"}
_ALLOWED_ORDER_STATE = {
    "CREATED",
    "SUBMITTED",
    "ACCEPTED",
    "REJECTED",
    "PARTIALLY_FILLED",
    "FILLED",
    "CANCEL_PENDING",
    "CANCELED",
    "EXPIRED",
}
_ALLOWED_POSITION_SIDE = {"LONG", "SHORT", "FLAT"}
_ALLOWED_ORDER_EVENT_TYPES = {
    "order.created",
    "order.submitted",
    "order.accepted",
    "order.rejected",
    "order.partially_filled",
    "order.filled",
    "order.canceled",
}
_ALLOWED_POSITION_EVENT_TYPES = {"position.opened", "position.changed", "position.closed"}
_ALLOWED_ACCOUNT_EVENT_TYPES = {"account.updated"}
_ALLOWED_EXECTYPE = {"execution.quality"}


NAUTILUS_ORDER_STATUS_TO_GT_STATE: dict[str, str] = {
    "initialized": "CREATED",
    "created": "CREATED",
    "submitted": "SUBMITTED",
    "accepted": "ACCEPTED",
    "rejected": "REJECTED",
    "partially_filled": "PARTIALLY_FILLED",
    "filled": "FILLED",
    "pending_cancel": "CANCEL_PENDING",
    "canceled": "CANCELED",
    "expired": "EXPIRED",
}

GT_ORDER_STATE_TO_EVENT_TYPE: dict[str, str] = {
    "CREATED": "order.created",
    "SUBMITTED": "order.submitted",
    "ACCEPTED": "order.accepted",
    "REJECTED": "order.rejected",
    "PARTIALLY_FILLED": "order.partially_filled",
    "FILLED": "order.filled",
    "CANCEL_PENDING": "order.canceled",
    "CANCELED": "order.canceled",
    "EXPIRED": "order.rejected",
}


def _decimal_text(value: Any, field_name: str) -> str:
    try:
        return str(Decimal(str(value)))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ContractBoundaryError(f"{field_name} must be a valid decimal") from exc


_EXACT_DECIMAL = re.compile(r"^(?:0|[1-9]\d*)(?:\.\d+)?$")


def _exact_decimal_text(value: Any, field_name: str) -> str:
    if not isinstance(value, str) or not _EXACT_DECIMAL.fullmatch(value):
        raise ContractBoundaryError(f"{field_name} must be an exact decimal string")
    return value


def _require_non_empty_text(value: Any, field_name: str, *, max_len: int = 128) -> str:
    text = str(value).strip()
    if not text:
        raise ContractBoundaryError(f"{field_name} is required")
    if len(text) > max_len:
        raise ContractBoundaryError(f"{field_name} exceeds max length {max_len}")
    return text


def _ns_to_ms(value: Any | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value) // 1_000_000
    except (TypeError, ValueError) as exc:
        raise ContractBoundaryError("timestamp must be an integer nanosecond value") from exc


def _now_ms() -> int:
    return int(datetime.now(tz=timezone.utc).timestamp() * 1000)


def _json_safe_recursive(value: Any, path: str = "root") -> None:
    if isinstance(value, _ALLOWED_JSON_SCALARS):
        return
    if isinstance(value, Mapping):
        for key, item in value.items():
            if not isinstance(key, str):
                raise ContractBoundaryError(f"{path}: JSON object keys must be strings")
            _json_safe_recursive(item, f"{path}.{key}")
        return
    if isinstance(value, list):
        for index, item in enumerate(value):
            _json_safe_recursive(item, f"{path}[{index}]")
        return
    raise ContractBoundaryError(f"{path}: value is not JSON safe ({type(value).__name__})")


@dataclass(frozen=True, slots=True)
class GTInstrumentRefDTO:
    venue: str
    marketType: str
    symbol: str
    baseAsset: str
    quoteAsset: str
    exchangeNativeSymbol: str | None = None
    metadata: dict[str, Any] | None = None

    def to_json_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "venue": _require_non_empty_text(self.venue, "venue"),
            "marketType": _require_non_empty_text(self.marketType, "marketType"),
            "symbol": _require_non_empty_text(self.symbol, "symbol"),
            "baseAsset": _require_non_empty_text(self.baseAsset, "baseAsset"),
            "quoteAsset": _require_non_empty_text(self.quoteAsset, "quoteAsset"),
        }
        if self.exchangeNativeSymbol is not None:
            payload["exchangeNativeSymbol"] = _require_non_empty_text(self.exchangeNativeSymbol, "exchangeNativeSymbol")
        if self.metadata is not None:
            payload["metadata"] = self.metadata
        _json_safe_recursive(payload)
        return payload

    @classmethod
    def from_json_dict(cls, payload: Mapping[str, Any]) -> "GTInstrumentRefDTO":
        venue = _require_non_empty_text(payload.get("venue"), "instrument.venue")
        market_type = _require_non_empty_text(payload.get("marketType"), "instrument.marketType")
        symbol = _require_non_empty_text(payload.get("symbol"), "instrument.symbol")
        base_asset = _require_non_empty_text(payload.get("baseAsset"), "instrument.baseAsset")
        quote_asset = _require_non_empty_text(payload.get("quoteAsset"), "instrument.quoteAsset")
        exchange_native_symbol = payload.get("exchangeNativeSymbol")
        metadata = payload.get("metadata")
        if metadata is not None:
            _json_safe_recursive(metadata, "instrument.metadata")
        return cls(
            venue=venue,
            marketType=market_type,
            symbol=symbol,
            baseAsset=base_asset,
            quoteAsset=quote_asset,
            exchangeNativeSymbol=_require_non_empty_text(exchange_native_symbol, "instrument.exchangeNativeSymbol") if exchange_native_symbol is not None else None,
            metadata=dict(metadata) if isinstance(metadata, Mapping) else metadata,
        )

    @classmethod
    def from_simulation_core(cls, core: SimulationCore) -> "GTInstrumentRefDTO":
        instrument = core.get_instrument()
        return cls(
            venue=_require_non_empty_text(instrument["venue"], "instrument.venue"),
            marketType=_require_non_empty_text(instrument["market_type"], "instrument.market_type"),
            symbol=_require_non_empty_text(instrument["symbol"], "instrument.symbol"),
            baseAsset=_require_non_empty_text(instrument["base_asset"], "instrument.base_asset"),
            quoteAsset=_require_non_empty_text(instrument["quote_asset"], "instrument.quote_asset"),
            exchangeNativeSymbol=_require_non_empty_text(instrument["exchange_native_symbol"], "instrument.exchange_native_symbol") if instrument.get("exchange_native_symbol") is not None else None,
        )


@dataclass(frozen=True, slots=True)
class GTOrderAttachedLegDTO:
    relation: str
    clientOrderId: str | None = None
    quantity: str | None = None
    price: str | None = None
    triggerPrice: str | None = None
    metadata: dict[str, Any] | None = None

    def to_json_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"relation": _require_non_empty_text(self.relation, "relation")}
        if self.clientOrderId is not None:
            payload["clientOrderId"] = _require_non_empty_text(self.clientOrderId, "clientOrderId")
        if self.quantity is not None:
            payload["quantity"] = _decimal_text(self.quantity, "quantity")
        if self.price is not None:
            payload["price"] = _decimal_text(self.price, "price")
        if self.triggerPrice is not None:
            payload["triggerPrice"] = _decimal_text(self.triggerPrice, "triggerPrice")
        if self.metadata is not None:
            payload["metadata"] = self.metadata
        _json_safe_recursive(payload)
        return payload

    @classmethod
    def from_json_dict(cls, payload: Mapping[str, Any]) -> "GTOrderAttachedLegDTO":
        metadata = payload.get("metadata")
        if metadata is not None:
            _json_safe_recursive(metadata, "attachedOrders.metadata")
        return cls(
            relation=_require_non_empty_text(payload.get("relation"), "attachedOrders.relation"),
            clientOrderId=payload.get("clientOrderId"),
            quantity=_decimal_text(payload["quantity"], "attachedOrders.quantity") if payload.get("quantity") is not None else None,
            price=_decimal_text(payload["price"], "attachedOrders.price") if payload.get("price") is not None else None,
            triggerPrice=_decimal_text(payload["triggerPrice"], "attachedOrders.triggerPrice") if payload.get("triggerPrice") is not None else None,
            metadata=dict(metadata) if isinstance(metadata, Mapping) else metadata,
        )


@dataclass(frozen=True, slots=True)
class GTOrderIntentDTO:
    clientOrderId: str
    instrument: GTInstrumentRefDTO
    side: str
    orderType: str
    quantity: str
    price: str | None = None
    triggerPrice: str | None = None
    trailingDistance: str | None = None
    timeInForce: str | None = None
    reduceOnly: bool | None = None
    postOnly: bool | None = None
    strategyId: str | None = None
    playbookId: str | None = None
    setupId: str | None = None
    attachedOrders: list[GTOrderAttachedLegDTO] | None = None
    metadata: dict[str, Any] | None = None

    def __post_init__(self) -> None:
        if self.side not in _ALLOWED_ORDER_SIDE:
            raise ContractBoundaryError(f"invalid order side: {self.side}")
        if self.orderType not in _ALLOWED_ORDER_TYPE:
            raise ContractBoundaryError(f"invalid order type: {self.orderType}")
        if self.timeInForce is not None and self.timeInForce not in _ALLOWED_TIME_IN_FORCE:
            raise ContractBoundaryError(f"invalid timeInForce: {self.timeInForce}")

        quantity = Decimal(self.quantity)
        if quantity <= 0:
            raise ContractBoundaryError("quantity must be positive")

        needs_price = self.orderType in {"LIMIT", "STOP_LIMIT", "LIMIT_IF_TOUCHED"}
        if needs_price and self.price is None:
            raise ContractBoundaryError(f"{self.orderType} requires price")
        if self.orderType == "MARKET" and self.price is not None:
            raise ContractBoundaryError("MARKET order does not use limit price")
        if self.metadata is not None:
            _json_safe_recursive(self.metadata, "metadata")
        if self.attachedOrders is not None:
            for index, attached in enumerate(self.attachedOrders):
                if not isinstance(attached, GTOrderAttachedLegDTO):
                    raise ContractBoundaryError(f"attachedOrders[{index}] must be GTOrderAttachedLegDTO")

    def to_json_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "clientOrderId": _require_non_empty_text(self.clientOrderId, "clientOrderId"),
            "instrument": self.instrument.to_json_dict(),
            "side": self.side,
            "orderType": self.orderType,
            "quantity": _decimal_text(self.quantity, "quantity"),
        }
        if self.price is not None:
            payload["price"] = _decimal_text(self.price, "price")
        if self.triggerPrice is not None:
            payload["triggerPrice"] = _decimal_text(self.triggerPrice, "triggerPrice")
        if self.trailingDistance is not None:
            payload["trailingDistance"] = _decimal_text(self.trailingDistance, "trailingDistance")
        if self.timeInForce is not None:
            payload["timeInForce"] = self.timeInForce
        if self.reduceOnly is not None:
            payload["reduceOnly"] = self.reduceOnly
        if self.postOnly is not None:
            payload["postOnly"] = self.postOnly
        if self.strategyId is not None:
            payload["strategyId"] = _require_non_empty_text(self.strategyId, "strategyId")
        if self.playbookId is not None:
            payload["playbookId"] = _require_non_empty_text(self.playbookId, "playbookId")
        if self.setupId is not None:
            payload["setupId"] = _require_non_empty_text(self.setupId, "setupId")
        if self.attachedOrders is not None:
            payload["attachedOrders"] = [attached.to_json_dict() for attached in self.attachedOrders]
        if self.metadata is not None:
            payload["metadata"] = self.metadata
        _json_safe_recursive(payload)
        return payload

    @classmethod
    def from_json_dict(cls, payload: Mapping[str, Any]) -> "GTOrderIntentDTO":
        if "instrument" not in payload or payload.get("instrument") is None:
            raise ContractBoundaryError("instrument is required")
        instrument = GTInstrumentRefDTO.from_json_dict(payload["instrument"])
        attached_orders = payload.get("attachedOrders")
        if attached_orders is not None:
            if not isinstance(attached_orders, list):
                raise ContractBoundaryError("attachedOrders must be an array")
            attached_orders = [GTOrderAttachedLegDTO.from_json_dict(item) for item in attached_orders]
        metadata = payload.get("metadata")
        if metadata is not None:
            _json_safe_recursive(metadata, "metadata")
        order_type = _require_non_empty_text(payload.get("orderType"), "orderType").upper()
        price_value = payload.get("price")
        if order_type in {"LIMIT", "STOP_LIMIT", "LIMIT_IF_TOUCHED"} and price_value is None:
            raise ContractBoundaryError(f"{order_type} requires price")
        if order_type == "MARKET" and price_value is not None:
            raise ContractBoundaryError("MARKET order does not use limit price")
        return cls(
            clientOrderId=_require_non_empty_text(payload.get("clientOrderId"), "clientOrderId"),
            instrument=instrument,
            side=_require_non_empty_text(payload.get("side"), "side").upper(),
            orderType=order_type,
            quantity=_decimal_text(payload.get("quantity"), "quantity"),
            price=_decimal_text(payload["price"], "price") if price_value is not None else None,
            triggerPrice=_decimal_text(payload["triggerPrice"], "triggerPrice") if payload.get("triggerPrice") is not None else None,
            trailingDistance=_decimal_text(payload["trailingDistance"], "trailingDistance") if payload.get("trailingDistance") is not None else None,
            timeInForce=_require_non_empty_text(payload.get("timeInForce"), "timeInForce").upper() if payload.get("timeInForce") is not None else None,
            reduceOnly=payload.get("reduceOnly"),
            postOnly=payload.get("postOnly"),
            strategyId=payload.get("strategyId"),
            playbookId=payload.get("playbookId"),
            setupId=payload.get("setupId"),
            attachedOrders=attached_orders,
            metadata=dict(metadata) if isinstance(metadata, Mapping) else metadata,
        )


@dataclass(frozen=True, slots=True)
class GTOrderStateDTO:
    clientOrderId: str
    instrument: GTInstrumentRefDTO
    side: str
    orderType: str
    quantity: str
    filledQuantity: str
    remainingQuantity: str
    status: str
    price: str | None = None
    triggerPrice: str | None = None
    protectionType: str | None = None
    venueOrderId: str | None = None
    averageFillPrice: str | None = None
    reason: str | None = None
    timestamps: dict[str, int] = field(default_factory=dict)
    metadata: dict[str, Any] | None = None

    def __post_init__(self) -> None:
        if self.status not in _ALLOWED_ORDER_STATE:
            raise ContractBoundaryError(f"invalid order state: {self.status}")
        if self.side not in _ALLOWED_ORDER_SIDE:
            raise ContractBoundaryError(f"invalid order side: {self.side}")
        if self.orderType not in _ALLOWED_ORDER_TYPE:
            raise ContractBoundaryError(f"invalid order type: {self.orderType}")
        q = Decimal(self.quantity)
        filled = Decimal(self.filledQuantity)
        remaining = Decimal(self.remainingQuantity)
        if q <= 0:
            raise ContractBoundaryError("quantity must be positive")
        if filled < 0 or remaining < 0:
            raise ContractBoundaryError("filledQuantity/remainingQuantity must be non-negative")
        if filled > q or remaining > q:
            raise ContractBoundaryError("filledQuantity and remainingQuantity must not exceed quantity")
        if abs(q - filled - remaining) > Decimal("0.000000001"):
            raise ContractBoundaryError("filledQuantity + remainingQuantity must equal quantity")
        if self.timestamps is None:
            raise ContractBoundaryError("timestamps are required")
        _json_safe_recursive(self.to_json_dict())

    def to_json_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "clientOrderId": _require_non_empty_text(self.clientOrderId, "clientOrderId"),
            "instrument": self.instrument.to_json_dict(),
            "side": self.side,
            "orderType": self.orderType,
            "quantity": _decimal_text(self.quantity, "quantity"),
            "filledQuantity": _decimal_text(self.filledQuantity, "filledQuantity"),
            "remainingQuantity": _decimal_text(self.remainingQuantity, "remainingQuantity"),
            "status": self.status,
            "timestamps": dict(self.timestamps),
        }
        if self.venueOrderId is not None:
            payload["venueOrderId"] = _require_non_empty_text(self.venueOrderId, "venueOrderId")
        if self.price is not None:
            payload["price"] = _decimal_text(self.price, "price")
        if self.triggerPrice is not None:
            payload["triggerPrice"] = _decimal_text(self.triggerPrice, "triggerPrice")
        if self.protectionType is not None:
            payload["protectionType"] = self.protectionType
        if self.averageFillPrice is not None:
            payload["averageFillPrice"] = _decimal_text(self.averageFillPrice, "averageFillPrice")
        if self.reason is not None:
            payload["reason"] = _require_non_empty_text(self.reason, "reason", max_len=512)
        if self.metadata is not None:
            payload["metadata"] = self.metadata
        return payload

    @classmethod
    def from_simulation_snapshot(cls, core: SimulationCore, snapshot: Mapping[str, Any]) -> "GTOrderStateDTO":
        instrument = GTInstrumentRefDTO.from_simulation_core(core)
        timestamp_map = snapshot.get("timestamps") or {}
        status = _map_nautilus_order_status(snapshot.get("status"))
        filled = _decimal_text(snapshot.get("filled_quantity", "0"), "filled_quantity")
        remaining = _decimal_text(snapshot.get("remaining_quantity", "0"), "remaining_quantity")
        timestamps = {
            "createdAt": _ns_to_ms(timestamp_map.get("created_at")) or 0,
            "updatedAt": _ns_to_ms(timestamp_map.get("updated_at")) or 0,
            **({"submittedAt": _ns_to_ms(timestamp_map.get("submitted_at"))} if timestamp_map.get("submitted_at") is not None else {}),
            **({"acceptedAt": _ns_to_ms(timestamp_map.get("accepted_at"))} if timestamp_map.get("accepted_at") is not None else {}),
            **({"firstFillAt": _ns_to_ms(timestamp_map.get("updated_at"))} if Decimal(filled) > 0 else {}),
            **({"lastFillAt": _ns_to_ms(timestamp_map.get("updated_at"))} if Decimal(filled) > 0 else {}),
            **({"canceledAt": _ns_to_ms(timestamp_map.get("canceled_at"))} if timestamp_map.get("canceled_at") is not None else {}),
            **({"expiredAt": _ns_to_ms(timestamp_map.get("expired_at"))} if timestamp_map.get("expired_at") is not None else {}),
            **({"rejectedAt": _ns_to_ms(timestamp_map.get("rejected_at"))} if timestamp_map.get("rejected_at") is not None else {}),
            **({"completedAt": _ns_to_ms(timestamp_map.get("updated_at"))} if status in {"FILLED", "CANCELED", "REJECTED", "EXPIRED"} else {}),
        }
        tags = snapshot.get("tags") or []
        protection_type = next((tag.split("=", 1)[1] for tag in tags if isinstance(tag, str) and tag.startswith("GT_PROTECTION=") and tag.split("=", 1)[1] in {"STOP_LOSS", "TAKE_PROFIT"}), None)
        return cls(
            clientOrderId=_require_non_empty_text(snapshot.get("client_order_id"), "client_order_id"),
            venueOrderId=snapshot.get("venue_order_id"),
            instrument=instrument,
            side=_require_non_empty_text(snapshot.get("side"), "side").upper(),
            orderType=_require_non_empty_text(snapshot.get("order_type"), "order_type").upper(),
            quantity=_decimal_text(snapshot.get("quantity"), "quantity"),
            filledQuantity=filled,
            remainingQuantity=remaining,
            averageFillPrice=_decimal_text(snapshot.get("average_fill_price"), "average_fill_price") if snapshot.get("average_fill_price") is not None else None,
            status=status,
            price=_decimal_text(snapshot["price"], "price") if snapshot.get("price") is not None else None,
            triggerPrice=_decimal_text(snapshot["trigger_price"], "trigger_price") if snapshot.get("trigger_price") is not None else None,
            protectionType=protection_type,
            reason=snapshot.get("reason"),
            timestamps=timestamps,
        )


@dataclass(frozen=True, slots=True)
class GTPositionDTO:
    instrument: GTInstrumentRefDTO
    side: str
    quantity: str
    averageEntryPrice: str | None = None
    markPrice: str | None = None
    realizedPnl: str = "0"
    unrealizedPnl: str = "0"
    feesTotal: str | None = None
    openedAt: int | None = None
    updatedAt: int = 0
    metadata: dict[str, Any] | None = None

    def __post_init__(self) -> None:
        if self.side not in _ALLOWED_POSITION_SIDE:
            raise ContractBoundaryError(f"invalid position side: {self.side}")
        q = Decimal(self.quantity)
        if self.side == "FLAT" and q != 0:
            raise ContractBoundaryError("FLAT position must have zero quantity")
        if self.side != "FLAT" and q <= 0:
            raise ContractBoundaryError("LONG/SHORT position must have positive quantity")
        if self.metadata is not None:
            _json_safe_recursive(self.metadata, "position.metadata")

    def to_json_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "instrument": self.instrument.to_json_dict(),
            "side": self.side,
            "quantity": _decimal_text(self.quantity, "quantity"),
            "realizedPnl": _decimal_text(self.realizedPnl, "realizedPnl"),
            "unrealizedPnl": _decimal_text(self.unrealizedPnl, "unrealizedPnl"),
            "updatedAt": int(self.updatedAt),
        }
        if self.averageEntryPrice is not None:
            payload["averageEntryPrice"] = _decimal_text(self.averageEntryPrice, "averageEntryPrice")
        if self.markPrice is not None:
            payload["markPrice"] = _decimal_text(self.markPrice, "markPrice")
        if self.feesTotal is not None:
            payload["feesTotal"] = _decimal_text(self.feesTotal, "feesTotal")
        if self.openedAt is not None:
            payload["openedAt"] = int(self.openedAt)
        if self.metadata is not None:
            payload["metadata"] = self.metadata
        _json_safe_recursive(payload)
        return payload

    @classmethod
    def from_simulation_core(cls, core: SimulationCore) -> "GTPositionDTO":
        instrument = GTInstrumentRefDTO.from_simulation_core(core)
        position = core.get_position()
        if position is None:
            updated_at = _ns_to_ms(core.get_account()["timestamp"]) or _now_ms()
            return cls(
                instrument=instrument,
                side="FLAT",
                quantity="0",
                realizedPnl="0",
                unrealizedPnl="0",
                updatedAt=updated_at,
            )
        return cls(
            instrument=instrument,
            side=_require_non_empty_text(position.get("side"), "position.side").upper(),
            quantity=_decimal_text(position.get("quantity"), "position.quantity"),
            averageEntryPrice=_decimal_text(position.get("average_entry_price"), "position.average_entry_price") if position.get("average_entry_price") is not None else None,
            markPrice=_decimal_text(position.get("mark_price"), "position.mark_price") if position.get("mark_price") is not None else None,
            realizedPnl=_decimal_text(position.get("realized_pnl"), "position.realized_pnl"),
            unrealizedPnl=_decimal_text(position.get("unrealized_pnl"), "position.unrealized_pnl"),
            feesTotal=_decimal_text(position.get("fees_total"), "position.fees_total") if position.get("fees_total") is not None else None,
            openedAt=_ns_to_ms(position.get("opened_at")),
            updatedAt=_ns_to_ms(position.get("updated_at")) or 0,
        )


@dataclass(frozen=True, slots=True)
class GTAccountStateDTO:
    accountId: str
    venue: str
    currency: str
    equity: str
    balance: str
    availableBalance: str
    marginUsed: str | None = None
    maintenanceMargin: str | None = None
    realizedPnl: str = "0"
    unrealizedPnl: str = "0"
    feesTotal: str | None = None
    timestamp: int = 0
    metadata: dict[str, Any] | None = None

    def to_json_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "accountId": _require_non_empty_text(self.accountId, "accountId"),
            "venue": _require_non_empty_text(self.venue, "venue"),
            "currency": _require_non_empty_text(self.currency, "currency"),
            "equity": _decimal_text(self.equity, "equity"),
            "balance": _decimal_text(self.balance, "balance"),
            "availableBalance": _decimal_text(self.availableBalance, "availableBalance"),
            "realizedPnl": _decimal_text(self.realizedPnl, "realizedPnl"),
            "unrealizedPnl": _decimal_text(self.unrealizedPnl, "unrealizedPnl"),
            "timestamp": int(self.timestamp),
        }
        if self.marginUsed is not None:
            payload["marginUsed"] = _decimal_text(self.marginUsed, "marginUsed")
        if self.maintenanceMargin is not None:
            payload["maintenanceMargin"] = _decimal_text(self.maintenanceMargin, "maintenanceMargin")
        if self.feesTotal is not None:
            payload["feesTotal"] = _decimal_text(self.feesTotal, "feesTotal")
        if self.metadata is not None:
            payload["metadata"] = self.metadata
        _json_safe_recursive(payload)
        return payload

    @classmethod
    def from_simulation_core(cls, core: SimulationCore) -> "GTAccountStateDTO":
        account = core.get_account()
        instrument = GTInstrumentRefDTO.from_simulation_core(core)
        return cls(
            accountId=_require_non_empty_text(account.get("account_id"), "account_id"),
            venue=_require_non_empty_text(account.get("venue"), "venue"),
            currency=_require_non_empty_text(account.get("base_currency"), "currency"),
            equity=_decimal_text(account.get("equity"), "equity"),
            balance=_decimal_text(account.get("balance_total"), "balance"),
            availableBalance=_decimal_text(account.get("balance_free"), "availableBalance"),
            marginUsed=_decimal_text(account.get("balance_locked"), "marginUsed") if account.get("balance_locked") is not None else None,
            maintenanceMargin=None,
            realizedPnl=_decimal_text(account.get("realized_pnl"), "realizedPnl"),
            unrealizedPnl=_decimal_text(account.get("unrealized_pnl"), "unrealizedPnl"),
            feesTotal=_decimal_text(account.get("fees_total"), "feesTotal") if account.get("fees_total") is not None else None,
            timestamp=_ns_to_ms(account.get("timestamp")) or 0,
            metadata={"instrument": instrument.to_json_dict()} if False else None,
        )


@dataclass(frozen=True, slots=True)
class GTFillDTO:
    fillId: str
    clientOrderId: str
    venueOrderId: str | None
    instrument: GTInstrumentRefDTO
    side: str
    price: str
    quantity: str
    timestamp: int
    fee: str | None
    feeAsset: str | None
    liquidity: str | None

    def to_json_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "fillId": _require_non_empty_text(self.fillId, "fillId"),
            "clientOrderId": _require_non_empty_text(self.clientOrderId, "clientOrderId"),
            "instrument": self.instrument.to_json_dict(),
            "side": _require_non_empty_text(self.side, "side").upper(),
            "price": _decimal_text(self.price, "price"),
            "quantity": _decimal_text(self.quantity, "quantity"),
            "timestamp": int(self.timestamp),
        }
        if self.venueOrderId is not None:
            payload["venueOrderId"] = _require_non_empty_text(self.venueOrderId, "venueOrderId")
        if self.fee is not None:
            payload["fee"] = _decimal_text(self.fee, "fee")
        if self.feeAsset is not None:
            payload["feeAsset"] = _require_non_empty_text(self.feeAsset, "feeAsset")
        if self.liquidity is not None:
            payload["liquidity"] = _require_non_empty_text(self.liquidity, "liquidity").upper()
        _json_safe_recursive(payload)
        return payload

    @classmethod
    def from_simulation_snapshot(cls, core: SimulationCore, snapshot: Mapping[str, Any]) -> "GTFillDTO":
        return cls(
            fillId=_require_non_empty_text(snapshot.get("fill_id"), "fill_id"),
            clientOrderId=_require_non_empty_text(snapshot.get("client_order_id"), "client_order_id"),
            venueOrderId=snapshot.get("venue_order_id"),
            instrument=GTInstrumentRefDTO.from_simulation_core(core),
            side=_require_non_empty_text(snapshot.get("side"), "side").upper(),
            price=_decimal_text(snapshot.get("price"), "price"),
            quantity=_decimal_text(snapshot.get("quantity"), "quantity"),
            timestamp=_ns_to_ms(snapshot.get("timestamp")) or 0,
            fee=_decimal_text(snapshot["fee"], "fee") if snapshot.get("fee") is not None else None,
            feeAsset=snapshot.get("fee_asset"),
            liquidity=snapshot.get("liquidity").upper() if snapshot.get("liquidity") is not None else None,
        )


@dataclass(frozen=True, slots=True)
class GTExecutionEconomicsDTO:
    averageFillPrice: str | None = None
    fees: str | None = None
    makerQuantity: str | None = None
    takerQuantity: str | None = None
    partialFillCount: int | None = None
    executionStartedAt: int | None = None
    executionCompletedAt: int | None = None
    metadata: dict[str, Any] | None = None

    def to_json_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if self.averageFillPrice is not None:
            payload["averageFillPrice"] = _decimal_text(self.averageFillPrice, "averageFillPrice")
        if self.fees is not None:
            payload["fees"] = _decimal_text(self.fees, "fees")
        if self.makerQuantity is not None:
            payload["makerQuantity"] = _decimal_text(self.makerQuantity, "makerQuantity")
        if self.takerQuantity is not None:
            payload["takerQuantity"] = _decimal_text(self.takerQuantity, "takerQuantity")
        if self.partialFillCount is not None:
            payload["partialFillCount"] = int(self.partialFillCount)
        if self.executionStartedAt is not None:
            payload["executionStartedAt"] = int(self.executionStartedAt)
        if self.executionCompletedAt is not None:
            payload["executionCompletedAt"] = int(self.executionCompletedAt)
        if self.metadata is not None:
            payload["metadata"] = self.metadata
        _json_safe_recursive(payload)
        return payload

    @classmethod
    def from_simulation_core(cls, core: SimulationCore, order_id: str | Mapping[str, Any]) -> "GTExecutionEconomicsDTO":
        order = core.get_order(order_id)
        client_order_id = order["client_order_id"]
        assert core._cache is not None  # noqa: SLF001 - boundary owns mapping logic
        nautilus_order = core._cache.order(core._coerce_order_id(client_order_id))
        if nautilus_order is None:
            raise SimulationCoreError(f"unknown order id: {client_order_id}")

        average_fill_price = order.get("average_fill_price")
        fees = Decimal("0")
        maker_qty = Decimal("0")
        taker_qty = Decimal("0")
        partial_fill_count = 0
        execution_started_at = None
        execution_completed_at = None

        for event in nautilus_order.events:
            liquidity_side = getattr(event, "liquidity_side", None)
            last_qty = getattr(event, "last_qty", None)
            commission = getattr(event, "commission", None)
            ts_event = getattr(event, "ts_event", None)
            if last_qty is not None:
                qty_text = Decimal(str(last_qty.as_decimal() if hasattr(last_qty, "as_decimal") else last_qty))
                if str(getattr(liquidity_side, "name", "")).upper() == "MAKER":
                    maker_qty += qty_text
                elif str(getattr(liquidity_side, "name", "")).upper() == "TAKER":
                    taker_qty += qty_text
                if qty_text > 0:
                    partial_fill_count += 1
            if commission is not None:
                fees += Decimal(str(commission.as_decimal() if hasattr(commission, "as_decimal") else commission))
            if execution_started_at is None and ts_event is not None:
                execution_started_at = _ns_to_ms(ts_event)
            if ts_event is not None:
                execution_completed_at = _ns_to_ms(ts_event)

        return cls(
            averageFillPrice=_decimal_text(average_fill_price, "averageFillPrice") if average_fill_price is not None else None,
            fees=_decimal_text(fees, "fees") if fees != 0 else None,
            makerQuantity=_decimal_text(maker_qty, "makerQuantity") if maker_qty != 0 else None,
            takerQuantity=_decimal_text(taker_qty, "takerQuantity") if taker_qty != 0 else None,
            partialFillCount=partial_fill_count if partial_fill_count else None,
            executionStartedAt=execution_started_at,
            executionCompletedAt=execution_completed_at,
        )


@dataclass(frozen=True, slots=True)
class GTTradingEventEnvelopeDTO:
    schemaVersion: int
    eventId: str
    eventType: str
    occurredAt: int
    source: str
    payload: dict[str, Any]

    def to_json_dict(self) -> dict[str, Any]:
        payload = {
            "schemaVersion": int(self.schemaVersion),
            "eventId": _require_non_empty_text(self.eventId, "eventId"),
            "eventType": _require_non_empty_text(self.eventType, "eventType"),
            "occurredAt": int(self.occurredAt),
            "source": _require_non_empty_text(self.source, "source"),
            "payload": self.payload,
        }
        _json_safe_recursive(payload)
        return payload


@dataclass(slots=True)
class SimulationCoreJsonBoundary:
    core: SimulationCore

    def get_instrument(self) -> GTInstrumentRefDTO:
        return GTInstrumentRefDTO.from_simulation_core(self.core)

    def submit_order(self, payload: Mapping[str, Any] | GTOrderIntentDTO) -> GTOrderStateDTO:
        intent = payload if isinstance(payload, GTOrderIntentDTO) else GTOrderIntentDTO.from_json_dict(payload)
        if intent.timeInForce is not None and intent.timeInForce != "GTC":
            raise ContractBoundaryError("SimulationCore currently supports GTC only")
        if intent.orderType == "MARKET":
            order = self.core.submit_market(
                intent.side,
                intent.quantity,
                reduce_only=intent.reduceOnly,
                client_order_id=intent.clientOrderId,
            )
        elif intent.orderType == "LIMIT":
            if intent.metadata and intent.metadata.get("protectionType") == "TAKE_PROFIT":
                order = self.core.submit_take_profit_limit(intent.side, intent.quantity, intent.price, client_order_id=intent.clientOrderId)
            else:
                order = self.core.submit_limit(intent.side, intent.quantity, intent.price, reduce_only=intent.reduceOnly, post_only=intent.postOnly, client_order_id=intent.clientOrderId)
        elif intent.orderType == "STOP_MARKET":
            if intent.triggerPrice is None:
                raise ContractBoundaryError("STOP_MARKET requires triggerPrice")
            order = self.core.submit_stop_market(
                intent.side,
                intent.quantity,
                intent.triggerPrice,
                reduce_only=intent.reduceOnly is True,
                client_order_id=intent.clientOrderId,
            )
        else:
            raise ContractBoundaryError(f"unsupported order type for SimulationCore: {intent.orderType}")
        return GTOrderStateDTO.from_simulation_snapshot(self.core, order)

    def close_position(self, payload: Mapping[str, Any]) -> GTOrderStateDTO:
        instrument = payload.get("instrument")
        if not isinstance(instrument, Mapping):
            raise ContractBoundaryError("instrument is required")
        expected = GTInstrumentRefDTO.from_simulation_core(self.core).to_json_dict()
        received = GTInstrumentRefDTO.from_json_dict(instrument).to_json_dict()
        if received != expected:
            raise ContractBoundaryError("instrument does not match the active simulation instrument")
        position = self.core.get_position()
        if position is None or Decimal(str(position["quantity"])) <= 0:
            raise ContractBoundaryError("no open position")
        current = Decimal(str(position["quantity"]))
        raw_quantity = payload.get("quantity")
        quantity_text = str(position["quantity"]) if raw_quantity is None else _exact_decimal_text(raw_quantity, "quantity")
        quantity = Decimal(quantity_text)
        if quantity <= 0:
            raise ContractBoundaryError("quantity must be positive")
        if quantity > current:
            raise ContractBoundaryError("quantity exceeds open position")
        if quantity == current:
            protection_orders = [
                order for order in self.core.list_orders()
                if self._is_working_protection_for_position(order, position)
            ]
            for order in protection_orders:
                try:
                    self.cancel_order(order["client_order_id"])
                except Exception as exc:
                    raise ContractBoundaryError(
                        f"PROTECTION_CANCEL_FAILED: {order['client_order_id']}"
                    ) from exc
            remaining = [
                order for order in self.core.list_orders()
                if self._is_working_protection_for_position(order, position)
            ]
            if remaining:
                ids = ",".join(str(order["client_order_id"]) for order in remaining)
                raise ContractBoundaryError(f"PROTECTION_CANCEL_UNVERIFIED: {ids}")

            side = "SELL" if str(position["side"]).lower() == "long" else "BUY"
            try:
                return self.submit_order({
                    "clientOrderId": f"gt-close-{uuid4()}", "instrument": instrument, "side": side,
                    "orderType": "MARKET", "quantity": quantity_text, "timeInForce": "GTC",
                    "reduceOnly": True, "postOnly": False,
                })
            except Exception as exc:
                raise ContractBoundaryError("PROTECTIONS_CANCELED_CLOSE_FAILED") from exc

        side = "SELL" if str(position["side"]).lower() == "long" else "BUY"
        return self.submit_order({
            "clientOrderId": f"gt-close-{uuid4()}", "instrument": instrument, "side": side,
            "orderType": "MARKET", "quantity": quantity_text, "timeInForce": "GTC",
            "reduceOnly": True, "postOnly": False,
        })

    @staticmethod
    def _is_working_protection_for_position(
        order: Mapping[str, Any], position: Mapping[str, Any]
    ) -> bool:
        status = str(order.get("status", "")).upper()
        if status not in {
            "CREATED", "SUBMITTED", "ACCEPTED", "PARTIALLY_FILLED", "CANCEL_PENDING",
        }:
            return False
        if status == "PARTIALLY_FILLED":
            try:
                if Decimal(str(order.get("remaining_quantity", "0"))) <= 0:
                    return False
            except (InvalidOperation, ValueError):
                return False
        if str(order.get("instrument_id", "")) != str(position.get("instrument_id", "")):
            return False
        protections = {
            "GT_PROTECTION=STOP_LOSS": "STOP_LOSS",
            "GT_PROTECTION=TAKE_PROFIT": "TAKE_PROFIT",
        }
        return any(str(tag) in protections for tag in order.get("tags", []))

    def cancel_order(self, order_id: str | Mapping[str, Any]) -> GTOrderStateDTO:
        order = self.core.cancel(order_id)
        return GTOrderStateDTO.from_simulation_snapshot(self.core, order)

    def replace_order(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        """Cancel a working LIMIT and submit its remaining quantity at a new price.

        SimulationCore has no amend primitive.  Keep the two native order
        identities explicit instead of pretending the original was mutated.
        """
        original_id = _require_non_empty_text(payload.get("clientOrderId"), "clientOrderId")
        replacement_id = _require_non_empty_text(payload.get("replacementClientOrderId"), "replacementClientOrderId")
        price = _decimal_text(payload.get("limitPrice"), "limitPrice")
        original = self.get_order(original_id)
        if original.orderType not in {"LIMIT", "STOP_MARKET"}:
            raise ContractBoundaryError("only LIMIT and STOP_MARKET orders can be replaced")
        if original.status not in {"CREATED", "SUBMITTED", "ACCEPTED", "PARTIALLY_FILLED"}:
            raise ContractBoundaryError(f"order is not working: {original.status}")
        if Decimal(original.remainingQuantity) <= 0:
            raise ContractBoundaryError("working order has no remaining quantity")
        canceled = self.cancel_order(original_id)
        intent = GTOrderIntentDTO(
            clientOrderId=replacement_id,
            instrument=original.instrument,
            side=original.side,
            orderType="LIMIT" if original.orderType == "LIMIT" else "STOP_MARKET",
            quantity=original.remainingQuantity,
            price=price if original.orderType == "LIMIT" else None,
            triggerPrice=price if original.orderType == "STOP_MARKET" else None,
            timeInForce="GTC",
            reduceOnly=True if original.orderType == "STOP_MARKET" else None,
            postOnly=None,
            strategyId=None,
            playbookId=None,
            setupId=None,
            attachedOrders=None,
            metadata={"replacesClientOrderId": original_id, **({"protectionType": original.protectionType} if original.protectionType else {})},
        )
        replacement = self.submit_order(intent)
        return {
            "operation": "CANCEL_REPLACE",
            "originalOrder": canceled.to_json_dict(),
            "replacementOrder": replacement.to_json_dict(),
        }

    def get_order(self, order_id: str | Mapping[str, Any]) -> GTOrderStateDTO:
        return GTOrderStateDTO.from_simulation_snapshot(self.core, self.core.get_order(order_id))

    def list_orders(self) -> list[GTOrderStateDTO]:
        return [GTOrderStateDTO.from_simulation_snapshot(self.core, order) for order in self.core.list_orders()]

    def list_fills(self) -> list[GTFillDTO]:
        return [GTFillDTO.from_simulation_snapshot(self.core, fill) for fill in self.core.list_fills()]

    def get_position(self) -> GTPositionDTO:
        return GTPositionDTO.from_simulation_core(self.core)

    def get_account(self) -> GTAccountStateDTO:
        return GTAccountStateDTO.from_simulation_core(self.core)

    def get_execution_economics(self, order_id: str | Mapping[str, Any]) -> GTExecutionEconomicsDTO:
        return GTExecutionEconomicsDTO.from_simulation_core(self.core, order_id)

    def wrap_event(self, event_type: str, payload: Mapping[str, Any] | GTOrderStateDTO | GTPositionDTO | GTAccountStateDTO | GTExecutionEconomicsDTO, *, source: str = "nautilus-paper", occurred_at: int | None = None, event_id: str | None = None) -> GTTradingEventEnvelopeDTO:
        if event_type not in (_ALLOWED_ORDER_EVENT_TYPES | _ALLOWED_POSITION_EVENT_TYPES | _ALLOWED_ACCOUNT_EVENT_TYPES | _ALLOWED_EXECTYPE):
            raise ContractBoundaryError(f"unsupported event type: {event_type}")
        if isinstance(payload, (GTOrderStateDTO, GTPositionDTO, GTAccountStateDTO, GTExecutionEconomicsDTO)):
            payload_dict = payload.to_json_dict()
        else:
            payload_dict = dict(payload)
        _json_safe_recursive(payload_dict, "payload")
        return GTTradingEventEnvelopeDTO(
            schemaVersion=1,
            eventId=event_id or str(uuid4()),
            eventType=event_type,
            occurredAt=occurred_at if occurred_at is not None else _now_ms(),
            source=source,
            payload=payload_dict,
        )


def _map_nautilus_order_status(status: Any) -> str:
    normalized = str(status).strip().lower()
    try:
        return NAUTILUS_ORDER_STATUS_TO_GT_STATE[normalized]
    except KeyError as exc:
        raise ContractBoundaryError(f"unknown Nautilus order status: {status}") from exc


__all__ = [
    "ContractBoundaryError",
    "GTAccountStateDTO",
    "GTExecutionEconomicsDTO",
    "GTInstrumentRefDTO",
    "GTOrderAttachedLegDTO",
    "GTOrderIntentDTO",
    "GTOrderStateDTO",
    "GTPositionDTO",
    "GTTradingEventEnvelopeDTO",
    "NAUTILUS_ORDER_STATUS_TO_GT_STATE",
    "SimulationCoreJsonBoundary",
    "_json_safe_recursive",
]

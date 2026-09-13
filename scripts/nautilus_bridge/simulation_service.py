from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any, Mapping

try:
    from goodtrading.contracts import (
        ContractBoundaryError,
        SimulationCoreJsonBoundary,
    )
    from goodtrading.simulation_core import DEFAULT_SYMBOL, DEFAULT_VENUE, SimulationCore, SimulationCoreError
except ImportError:  # pragma: no cover - dev source-tree fallback
    from scripts.nautilus_bridge.contracts import (
        ContractBoundaryError,
        SimulationCoreJsonBoundary,
    )
    from scripts.nautilus_bridge.simulation_core import DEFAULT_SYMBOL, DEFAULT_VENUE, SimulationCore, SimulationCoreError

SIMULATION_PROTOCOL_VERSION = 1


@dataclass(frozen=True, slots=True)
class SimulationServiceError(Exception):
    code: str
    message: str
    details: Any | None = None

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.details is not None:
            payload["details"] = self.details
        return payload


APPROVED_MARKET_SNAPSHOT_SOURCE = {
    "venue": "BINANCE",
    "marketType": "perpetual",
    "symbol": "BTCUSDT",
}
APPROVED_MARKET_SNAPSHOT_INSTRUMENT = {
    "venue": "SIM",
    "marketType": "perpetual",
    "symbol": "BTCUSDT-PERP",
}
MARKET_SNAPSHOT_CONTROL_PLANE = "PRODUCTION_LOW_RATE_CONTROL_SNAPSHOT"


def _decimal_text(value: Any, field: str) -> str:
    if isinstance(value, str):
        text = value.strip()
        if not text:
            raise ContractBoundaryError(f"{field} is required")
        try:
            Decimal(text)
        except InvalidOperation as exc:
            raise ContractBoundaryError(f"{field} must be a finite decimal text") from exc
        return text
    if isinstance(value, (int, Decimal)):
        return str(value)
    if isinstance(value, float):
        if not (value == value and value not in (float("inf"), float("-inf"))):
            raise ContractBoundaryError(f"{field} must be a finite decimal")
        return str(value)
    raise ContractBoundaryError(f"{field} must be a decimal string or number")


def _require_snapshot_identity(snapshot: Mapping[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    source = snapshot.get("source")
    if not isinstance(source, Mapping):
        raise ContractBoundaryError("snapshot.source is required")
    simulation_instrument = snapshot.get("simulationInstrument")
    if not isinstance(simulation_instrument, Mapping):
        raise ContractBoundaryError("snapshot.simulationInstrument is required")

    source_identity = {
        "venue": str(source.get("venue", "")).strip(),
        "marketType": str(source.get("marketType", "")).strip(),
        "symbol": str(source.get("symbol", "")).strip(),
    }
    simulation_identity = {
        "venue": str(simulation_instrument.get("venue", "")).strip(),
        "marketType": str(simulation_instrument.get("marketType", "")).strip(),
        "symbol": str(simulation_instrument.get("symbol", "")).strip(),
    }

    if source_identity != APPROVED_MARKET_SNAPSHOT_SOURCE:
        raise SimulationServiceError(
            "market_source_mismatch",
            "unsupported source market for production snapshot",
            {"received": source_identity, "approved": APPROVED_MARKET_SNAPSHOT_SOURCE},
        )
    if simulation_identity != APPROVED_MARKET_SNAPSHOT_INSTRUMENT:
        raise SimulationServiceError(
            "market_source_mismatch",
            "unsupported simulation instrument for production snapshot",
            {"received": simulation_identity, "approved": APPROVED_MARKET_SNAPSHOT_INSTRUMENT},
        )
    return source_identity, simulation_identity


@dataclass(slots=True)
class SimulationService:
    """Owns one active SimulationCore and exposes JSON-safe operations.

    Lifecycle policy:
    - start(): idempotent; does not reset a running simulation.
    - stop(): idempotent; leaves the service stopped.
    - reset(): if running, discard and recreate a fresh deterministic core;
      if stopped, create and start a fresh simulation (least surprise for the
      protocol smoke).
    """

    _core: SimulationCore | None = None
    _boundary: SimulationCoreJsonBoundary | None = None
    _state: str = "STOPPED"

    def status(self) -> dict[str, Any]:
        result = {
            "state": self._state,
            "started": self._state == "RUNNING",
            "hasSimulation": self._core is not None,
            "simulationProtocolVersion": SIMULATION_PROTOCOL_VERSION,
        }
        if self._core is not None:
            quote = getattr(self._core, "_last_quote", None)
            if quote is not None:
                result["market"] = {
                    "instrument": DEFAULT_SYMBOL,
                    "venue": DEFAULT_VENUE,
                    "marketType": "perpetual",
                    "bestBid": str(quote.bid_price.as_decimal()),
                    "bestAsk": str(quote.ask_price.as_decimal()),
                    "updatedAt": int(quote.ts_event // 1_000_000),
                }
        return result

    def start(self) -> dict[str, Any]:
        if self._state == "RUNNING" and self._core is not None and self._boundary is not None:
            return {**self.status(), "alreadyRunning": True}
        self._create_and_start_core()
        return {**self.status(), "started": True}

    def stop(self) -> dict[str, Any]:
        if self._state == "STOPPED":
            return {**self.status(), "alreadyStopped": True}
        self._shutdown_core()
        return {**self.status(), "alreadyStopped": False}

    def reset(self) -> dict[str, Any]:
        if self._state == "RUNNING":
            self._shutdown_core()
        self._create_and_start_core()
        return {**self.status(), "reset": True}

    def shutdown(self) -> None:
        if self._state == "RUNNING":
            self._shutdown_core()

    def apply_stream_quote(self, payload: Mapping[str, Any] | dict[str, Any]) -> dict[str, Any]:
        boundary = self._require_running_boundary()
        try:
            bid = _decimal_text(payload.get("bestBidPrice"), "bestBidPrice")
            ask = _decimal_text(payload.get("bestAskPrice"), "bestAskPrice")
            bid_size = _decimal_text(payload.get("bestBidSize"), "bestBidSize")
            ask_size = _decimal_text(payload.get("bestAskSize"), "bestAskSize")
            source_timestamp_ms = int(payload["sourceTimestampMs"])
            local_applied_timestamp_ms = int(payload["localAppliedTimestampMs"])
            if Decimal(bid) <= 0 or Decimal(ask) <= 0 or Decimal(bid) >= Decimal(ask):
                raise ContractBoundaryError("stream quote bid/ask are invalid")
            if Decimal(bid_size) < 0 or Decimal(ask_size) < 0:
                raise ContractBoundaryError("stream quote sizes are invalid")
            if source_timestamp_ms <= 0 or local_applied_timestamp_ms <= 0:
                raise ContractBoundaryError("stream quote timestamps must be positive")
            boundary.core.set_market(
                bid,
                ask,
                bid_size=bid_size,
                ask_size=ask_size,
                timestamp_ns=source_timestamp_ms * 1_000_000,
            )
            return {
                "applied": True,
                "sequence": int(payload["sequence"]),
                "sourceTimestampMs": source_timestamp_ms,
                "localAppliedTimestampMs": local_applied_timestamp_ms,
                "instrument": APPROVED_MARKET_SNAPSHOT_INSTRUMENT,
            }
        except ContractBoundaryError as exc:
            raise SimulationServiceError("contract_validation_error", str(exc)) from exc
        except (SimulationCoreError, ValueError, KeyError) as exc:
            raise self._map_core_error(exc) if isinstance(exc, SimulationCoreError) else SimulationServiceError("contract_validation_error", str(exc))

    def submit_order(self, payload: Mapping[str, Any] | dict[str, Any]) -> dict[str, Any]:
        boundary = self._require_running_boundary()
        try:
            return boundary.submit_order(payload).to_json_dict()
        except ContractBoundaryError as exc:
            raise SimulationServiceError("contract_validation_error", str(exc)) from exc
        except SimulationCoreError as exc:
            raise self._map_core_error(exc) from exc
        except ValueError as exc:
            raise SimulationServiceError("contract_validation_error", str(exc)) from exc

    def close_position(self, payload: Mapping[str, Any] | dict[str, Any]) -> dict[str, Any]:
        boundary = self._require_running_boundary()
        try:
            return boundary.close_position(payload).to_json_dict()
        except ContractBoundaryError as exc:
            raise SimulationServiceError("contract_validation_error", str(exc)) from exc
        except SimulationCoreError as exc:
            raise self._map_core_error(exc) from exc

    def cancel_order(self, payload: str | Mapping[str, Any]) -> dict[str, Any]:
        boundary = self._require_running_boundary()
        try:
            return boundary.cancel_order(payload).to_json_dict()
        except ContractBoundaryError as exc:
            raise SimulationServiceError("contract_validation_error", str(exc)) from exc
        except SimulationCoreError as exc:
            raise self._map_core_error(exc) from exc

    def replace_order(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        boundary = self._require_running_boundary()
        try:
            return boundary.replace_order(payload)
        except ContractBoundaryError as exc:
            raise SimulationServiceError("order_invalid_state", str(exc)) from exc
        except SimulationCoreError as exc:
            raise self._map_core_error(exc) from exc
        except ValueError as exc:
            raise SimulationServiceError("contract_validation_error", str(exc)) from exc

    def get_order(self, payload: str | Mapping[str, Any]) -> dict[str, Any]:
        boundary = self._require_running_boundary()
        try:
            return boundary.get_order(payload).to_json_dict()
        except ContractBoundaryError as exc:
            raise SimulationServiceError("contract_validation_error", str(exc)) from exc
        except SimulationCoreError as exc:
            raise self._map_core_error(exc) from exc

    def list_orders(self) -> list[dict[str, Any]]:
        boundary = self._require_running_boundary()
        try:
            return [order.to_json_dict() for order in boundary.list_orders()]
        except SimulationCoreError as exc:
            raise self._map_core_error(exc) from exc

    def list_fills(self) -> list[dict[str, Any]]:
        boundary = self._require_running_boundary()
        try:
            return [fill.to_json_dict() for fill in boundary.list_fills()]
        except SimulationCoreError as exc:
            raise self._map_core_error(exc)

    def get_position(self) -> dict[str, Any]:
        boundary = self._require_running_boundary()
        try:
            return boundary.get_position().to_json_dict()
        except ContractBoundaryError as exc:
            raise SimulationServiceError("contract_validation_error", str(exc)) from exc
        except SimulationCoreError as exc:
            raise self._map_core_error(exc) from exc

    def get_account(self) -> dict[str, Any]:
        boundary = self._require_running_boundary()
        try:
            return boundary.get_account().to_json_dict()
        except ContractBoundaryError as exc:
            raise SimulationServiceError("contract_validation_error", str(exc)) from exc
        except SimulationCoreError as exc:
            raise self._map_core_error(exc) from exc

    def inject_quote(self, payload: Mapping[str, Any] | dict[str, Any]) -> dict[str, Any]:
        boundary = self._require_running_boundary()
        try:
            bid = payload.get("bid")
            ask = payload.get("ask")
            if bid is None or ask is None:
                raise ContractBoundaryError("bid and ask are required")
            bid_size = payload.get("bidSize", payload.get("bid_size", "10"))
            ask_size = payload.get("askSize", payload.get("ask_size", "10"))
            timestamp = payload.get("timestamp")
            boundary.core.set_market(
                bid,
                ask,
                bid_size=bid_size,
                ask_size=ask_size,
            )
            result = {
                "diagnosticOnly": True,
                "simulationProtocolVersion": SIMULATION_PROTOCOL_VERSION,
                "state": self._state,
                "quote": {
                    "bid": str(bid),
                    "ask": str(ask),
                    "bidSize": str(bid_size),
                    "askSize": str(ask_size),
                    "timestamp": int(timestamp) if timestamp is not None else None,
                },
            }
            return result
        except ContractBoundaryError as exc:
            raise SimulationServiceError("contract_validation_error", str(exc)) from exc
        except SimulationCoreError as exc:
            raise self._map_core_error(exc) from exc
        except ValueError as exc:
            raise SimulationServiceError("contract_validation_error", str(exc)) from exc

    def apply_market_snapshot(self, payload: Mapping[str, Any] | dict[str, Any]) -> dict[str, Any]:
        boundary = self._require_running_boundary()
        try:
            snapshot = payload.get("snapshot") if isinstance(payload, Mapping) else None
            if not isinstance(snapshot, Mapping):
                raise ContractBoundaryError("snapshot is required")
            source_identity, simulation_identity = _require_snapshot_identity(snapshot)
            bid = _decimal_text(snapshot.get("bid"), "bid")
            ask = _decimal_text(snapshot.get("ask"), "ask")
            bid_size = _decimal_text(snapshot.get("bidSize", snapshot.get("bid_size")), "bidSize")
            ask_size = _decimal_text(snapshot.get("askSize", snapshot.get("ask_size")), "askSize")
            timestamp_raw = snapshot.get("timestampMs", snapshot.get("timestamp_ms"))
            if timestamp_raw is None:
                raise ContractBoundaryError("timestampMs is required")
            timestamp_ms = int(timestamp_raw)
            if timestamp_ms <= 0:
                raise ContractBoundaryError("timestampMs must be positive")
            bid_value = Decimal(bid)
            ask_value = Decimal(ask)
            if bid_value <= 0 or ask_value <= 0 or bid_value > ask_value:
                raise SimulationServiceError(
                    "contract_validation_error",
                    "snapshot bid/ask are invalid",
                    {"bid": bid, "ask": ask},
                )
            boundary.core.set_market(
                bid,
                ask,
                bid_size=bid_size,
                ask_size=ask_size,
            )
            return {
                "applied": True,
                "controlPlane": MARKET_SNAPSHOT_CONTROL_PLANE,
                "sourceVenue": source_identity["venue"],
                "sourceMarketType": source_identity["marketType"],
                "sourceSymbol": source_identity["symbol"],
                "simulationVenue": simulation_identity["venue"],
                "simulationMarketType": simulation_identity["marketType"],
                "simulationSymbol": simulation_identity["symbol"],
                "timestampMs": timestamp_ms,
            }
        except ContractBoundaryError as exc:
            raise SimulationServiceError("contract_validation_error", str(exc)) from exc
        except SimulationCoreError as exc:
            raise self._map_core_error(exc) from exc
        except ValueError as exc:
            raise SimulationServiceError("contract_validation_error", str(exc)) from exc

    def _create_and_start_core(self) -> None:
        core = SimulationCore()
        core.start()
        self._core = core
        self._boundary = SimulationCoreJsonBoundary(core)
        self._state = "RUNNING"

    def _shutdown_core(self) -> None:
        if self._core is not None:
            self._core.shutdown()
        self._core = None
        self._boundary = None
        self._state = "STOPPED"

    def _require_running_boundary(self) -> SimulationCoreJsonBoundary:
        if self._state != "RUNNING" or self._boundary is None:
            raise SimulationServiceError("simulation_not_started", "simulation is not running")
        return self._boundary

    def _map_core_error(self, exc: SimulationCoreError) -> SimulationServiceError:
        message = str(exc)
        if "simulation not started" in message:
            return SimulationServiceError("simulation_not_started", message)
        if "unknown order id" in message:
            return SimulationServiceError("order_not_found", message)
        if "order already canceled" in message or "order already filled" in message:
            return SimulationServiceError("order_invalid_state", message)
        if "cancelled order vanished unexpectedly" in message:
            return SimulationServiceError("simulation_error", message)
        return SimulationServiceError("simulation_error", message)


__all__ = ["SIMULATION_PROTOCOL_VERSION", "SimulationService", "SimulationServiceError"]

#!/usr/bin/env python3
"""GoodTrading Nautilus JSONL daemon.

Protocol:
- stdin: one JSON request per line
- stdout: one JSON response per line
- stderr: human logs only
"""

from __future__ import annotations

import json
import os
import sys
import threading
import traceback
from typing import Any, Dict

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

PROTOCOL_VERSION = 1
EXPECTED_NAUTILUS_VERSION = "1.231.0"
SERVICE_NAME = "goodtrading-nautilus"
SIMULATION_SERVICE: Any | None = None
SimulationServiceError: type[Exception] = RuntimeError
QUOTE_STREAM: Any | None = None
STATE_LOCK = threading.RLock()


def log_stderr(message: str) -> None:
    print(f"[nautilus-daemon] {message}", file=sys.stderr, flush=True)


def write_response(payload: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n")
    sys.stdout.flush()


def error_payload(request_id: Any, code: str, message: str, details: Any | None = None) -> Dict[str, Any]:
    error: Dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return {"id": request_id, "ok": False, "error": error}


def success_payload(request_id: Any, result: Dict[str, Any]) -> Dict[str, Any]:
    return {"id": request_id, "ok": True, "result": result}


def simulation_service() -> Any:
    if SIMULATION_SERVICE is None:
        raise RuntimeError("simulation service is not initialized")
    return SIMULATION_SERVICE


def request_params(request: Dict[str, Any]) -> Dict[str, Any]:
    params = request.get("params")
    if params is None:
        return {key: value for key, value in request.items() if key not in {"id", "op"}}
    if not isinstance(params, dict):
        raise SimulationServiceError("invalid_request", "params must be a JSON object")
    return params


def protocol_metadata() -> Dict[str, Any]:
    import nautilus_trader

    if nautilus_trader.__version__ != EXPECTED_NAUTILUS_VERSION:
        raise RuntimeError(
            f"nautilus_trader version mismatch: expected {EXPECTED_NAUTILUS_VERSION}, got {nautilus_trader.__version__}"
        )

    return {
        "protocolVersion": PROTOCOL_VERSION,
        "nautilusVersion": nautilus_trader.__version__,
        "pythonVersion": sys.version.split()[0],
        "pid": os.getpid(),
    }


def handle_request(request: Dict[str, Any], metadata: Dict[str, Any]) -> Dict[str, Any]:
    request_id = request.get("id")
    op = request.get("op")

    if op == "health":
        return success_payload(
            request_id,
            {
                "status": "healthy",
                "service": SERVICE_NAME,
                **metadata,
            },
        )

    if op == "ping":
        return success_payload(request_id, {"pong": True})

    if op == "version":
        return success_payload(request_id, metadata)

    if op == "shutdown":
        stop_quote_stream()
        if SIMULATION_SERVICE is not None:
            SIMULATION_SERVICE.shutdown()
        return success_payload(request_id, {"shutdown": True})

    if op == "simulation.force_quote_disconnect_diagnostic":
        if SIMULATION_SERVICE is None:
            raise SimulationServiceError("simulation_unavailable", "simulation service is not initialized")
        if QUOTE_STREAM is None:
            raise SimulationServiceError("quote_stream_unavailable", "quote stream is not initialized")
        return success_payload(
            request_id,
            {"disconnected": QUOTE_STREAM.force_disconnect_diagnostic(), "diagnosticOnly": True},
        )

    if op == "simulation.status":
        result = simulation_service().status()
        result["quoteStream"] = QUOTE_STREAM.status() if QUOTE_STREAM is not None else {
            "configured": False,
            "connected": False,
            "sourceAvailable": False,
            "threadAlive": False,
            "framesReceived": 0,
            "decodeErrors": 0,
            "sequenceErrors": 0,
            "reconnectCount": 0,
            "lastSequence": None,
            "lastAppliedAt": None,
            "quoteAgeMs": None,
            "lastSourceTimestamp": None,
            "lastLocalAppliedTimestamp": None,
        }
        return success_payload(request_id, result)

    if op == "simulation.start":
        result = simulation_service().start()
        params = request_params(request)
        config = params.get("quoteStream")
        if isinstance(config, dict):
            start_quote_stream(config)
        return success_payload(request_id, result)

    if op == "simulation.stop":
        result = simulation_service().stop()
        stop_quote_stream()
        return success_payload(request_id, result)

    if op == "simulation.reset":
        stop_quote_stream()
        return success_payload(request_id, simulation_service().reset())

    if op == "simulation.inject_quote":
        return success_payload(request_id, simulation_service().inject_quote(request_params(request)))

    if op == "simulation.apply_market_snapshot":
        return success_payload(request_id, simulation_service().apply_market_snapshot(request_params(request)))

    if op == "simulation.submit_order":
        return success_payload(request_id, simulation_service().submit_order(request_params(request)))

    if op == "simulation.close_position":
        return success_payload(request_id, simulation_service().close_position(request_params(request)))

    if op == "simulation.cancel_order":
        params = request_params(request)
        if "clientOrderId" in params:
            order_id = params["clientOrderId"]
        else:
            order_id = params.get("client_order_id") or params.get("id")
        return success_payload(request_id, simulation_service().cancel_order(order_id))

    if op == "simulation.replace_order":
        return success_payload(request_id, simulation_service().replace_order(request_params(request)))

    if op == "simulation.get_order":
        params = request_params(request)
        if "clientOrderId" in params:
            order_id = params["clientOrderId"]
        else:
            order_id = params.get("client_order_id") or params.get("id")
        return success_payload(request_id, simulation_service().get_order(order_id))

    if op == "simulation.list_orders":
        return success_payload(request_id, simulation_service().list_orders())

    if op == "simulation.list_order_events":
        return success_payload(request_id, simulation_service().list_order_events())

    if op == "simulation.list_fills":
        return success_payload(request_id, simulation_service().list_fills())

    if op == "simulation.get_position":
        return success_payload(request_id, simulation_service().get_position())

    if op == "simulation.get_account":
        return success_payload(request_id, simulation_service().get_account())

    return error_payload(request_id, "unknown_op", f"unsupported op: {op!r}")


def stop_quote_stream() -> None:
    global QUOTE_STREAM
    stream, QUOTE_STREAM = QUOTE_STREAM, None
    if stream is not None:
        stream.stop()


def start_quote_stream(config: Dict[str, Any]) -> None:
    global QUOTE_STREAM
    stop_quote_stream()
    try:
        from goodtrading.quote_stream import QuoteStreamClient
    except ImportError:  # pragma: no cover - dev source-tree fallback
        try:
            from scripts.nautilus_bridge.quote_stream import QuoteStreamClient
        except ImportError:
            from quote_stream import QuoteStreamClient

    def apply_quote(payload: Dict[str, Any]) -> None:
        with STATE_LOCK:
            if SIMULATION_SERVICE is not None:
                SIMULATION_SERVICE.apply_stream_quote(payload)

    def mark_unavailable() -> None:
        log_stderr("quote stream unavailable")

    QUOTE_STREAM = QuoteStreamClient(config, apply_quote, mark_unavailable)
    QUOTE_STREAM.start()


def main() -> int:
    global SIMULATION_SERVICE, SimulationServiceError
    try:
        metadata = protocol_metadata()
    except Exception as exc:
        log_stderr(str(exc))
        traceback.print_exc(file=sys.stderr)
        return 1

    try:
        from goodtrading.simulation_service import SimulationService, SimulationServiceError as _SimulationServiceError
    except ImportError:  # pragma: no cover - dev source-tree fallback
        from scripts.nautilus_bridge.simulation_service import SimulationService, SimulationServiceError as _SimulationServiceError

    SIMULATION_SERVICE = SimulationService()
    SimulationServiceError = _SimulationServiceError

    log_stderr(
        f"started pid={metadata['pid']} protocol={PROTOCOL_VERSION} nautilus={metadata['nautilusVersion']} python={metadata['pythonVersion']}"
    )

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            write_response(error_payload(None, "invalid_json", "empty request line"))
            continue

        try:
            request = json.loads(line)
        except json.JSONDecodeError as exc:
            write_response(error_payload(None, "invalid_json", f"invalid JSON: {exc.msg}"))
            continue

        if not isinstance(request, dict):
            write_response(error_payload(None, "invalid_request", "request must be a JSON object"))
            continue

        try:
            with STATE_LOCK:
                response = handle_request(request, metadata)
        except SimulationServiceError as exc:
            response = error_payload(request.get("id"), exc.code, exc.message, exc.details)
        except Exception as exc:
            log_stderr(f"handler exception: {exc}")
            traceback.print_exc(file=sys.stderr)
            response = error_payload(request.get("id"), "internal_error", "handler failed")

        write_response(response)

        if request.get("op") == "shutdown":
            return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

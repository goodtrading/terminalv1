#!/usr/bin/env python3
"""GoodTrading Nautilus JSONL daemon.

Protocol:
- stdin: one JSON request per line
- stdout: one JSON response per line
- stderr: human logs only
"""

from __future__ import annotations

import json
import hashlib
import faulthandler
import importlib
import os
import sys
import threading
import time
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
STARTUP_STARTED_AT = time.monotonic()


def startup_trace(phase: str) -> None:
    if os.environ.get("GOODTRADING_NAUTILUS_STARTUP_TRACE") == "1":
        elapsed_ms = round((time.monotonic() - STARTUP_STARTED_AT) * 1000)
        log_stderr(f"startup phase={phase} elapsed_ms={elapsed_ms}")


def log_stderr(message: str) -> None:
    print(f"[nautilus-daemon] {message}", file=sys.stderr, flush=True)


def rpc_trace(message: str) -> None:
    if os.environ.get("GOODTRADING_NAUTILUS_RPC_TRACE") == "1":
        log_stderr(f"rpc {message}")


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
    startup_trace("nautilus_import_begin")
    import nautilus_trader
    startup_trace("nautilus_import_complete")

    if nautilus_trader.__version__ != EXPECTED_NAUTILUS_VERSION:
        raise RuntimeError(
            f"nautilus_trader version mismatch: expected {EXPECTED_NAUTILUS_VERSION}, got {nautilus_trader.__version__}"
        )

    runtime_modules: Dict[str, Dict[str, str]] = {}
    for name, module_name in {
        "daemon": __name__,
        "contracts": "goodtrading.contracts",
        "simulation_core": "goodtrading.simulation_core",
        "simulation_service": "goodtrading.simulation_service",
        "quote_stream": "goodtrading.quote_stream",
    }.items():
        startup_trace(f"module_import_begin:{name}")
        module = sys.modules.get(module_name)
        if module is None:
            try:
                module = importlib.import_module(module_name)
            except ModuleNotFoundError:
                module = importlib.import_module(module_name.replace("goodtrading", "scripts.nautilus_bridge"))
        startup_trace(f"module_import_complete:{name}")
        module_path = Path(module.__file__).resolve()
        digest = hashlib.sha256(module_path.read_bytes()).hexdigest()
        runtime_modules[name] = {"path": str(module_path), "sha256": digest}

    return {
        "protocolVersion": PROTOCOL_VERSION,
        "nautilusVersion": nautilus_trader.__version__,
        "pythonVersion": sys.version.split()[0],
        "pid": os.getpid(),
        "runtimeModules": runtime_modules,
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

    if op == "simulation.apply_replay_snapshot":
        return success_payload(request_id, simulation_service().apply_replay_snapshot(request_params(request)))

    if op == "simulation.apply_server_quote":
        return success_payload(request_id, simulation_service().apply_stream_quote(request_params(request)))

    if op == "simulation.mark_market_data_unavailable":
        reason = str(request_params(request).get("reason") or "provider_unavailable")[:120]
        simulation_service().mark_market_data_unavailable(reason)
        return success_payload(request_id, {"markedUnavailable": True, "reason": reason})

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

    if op == "simulation.reconcile_protections":
        return success_payload(request_id, simulation_service().reconcile_protections())

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
        with STATE_LOCK:
            if SIMULATION_SERVICE is not None:
                SIMULATION_SERVICE.mark_market_data_unavailable("quote_stream_unavailable")
        log_stderr("quote stream unavailable")

    QUOTE_STREAM = QuoteStreamClient(config, apply_quote, mark_unavailable)
    QUOTE_STREAM.start()


def main() -> int:
    global SIMULATION_SERVICE, SimulationServiceError
    startup_trace("main_begin")
    startup_trace_enabled = os.environ.get("GOODTRADING_NAUTILUS_STARTUP_TRACE") == "1"
    if startup_trace_enabled:
        faulthandler.dump_traceback_later(15, repeat=True, file=sys.stderr)
    try:
        metadata = protocol_metadata()
    except Exception as exc:
        log_stderr(str(exc))
        traceback.print_exc(file=sys.stderr)
        return 1

    startup_trace("metadata_complete")
    startup_trace("simulation_service_import_begin")
    try:
        from goodtrading.simulation_service import SimulationService, SimulationServiceError as _SimulationServiceError
    except ImportError:  # pragma: no cover - dev source-tree fallback
        from scripts.nautilus_bridge.simulation_service import SimulationService, SimulationServiceError as _SimulationServiceError

    startup_trace("simulation_service_import_complete")
    startup_trace("simulation_service_construct_begin")
    SIMULATION_SERVICE = SimulationService()
    startup_trace("simulation_service_construct_complete")
    if startup_trace_enabled:
        faulthandler.cancel_dump_traceback_later()
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

        request_id = request.get("id")
        op = request.get("op")
        received_at = time.monotonic()
        rpc_trace(f"received id={request_id} op={op} thread={threading.current_thread().name}:{threading.get_native_id()}")
        try:
            lock_started_at = time.monotonic()
            with STATE_LOCK:
                rpc_trace(f"lock_acquired id={request_id} op={op} wait_ms={round((time.monotonic() - lock_started_at) * 1000, 3)}")
                handler_started_at = time.monotonic()
                response = handle_request(request, metadata)
                rpc_trace(f"handler_complete id={request_id} op={op} elapsed_ms={round((time.monotonic() - handler_started_at) * 1000, 3)}")
        except SimulationServiceError as exc:
            response = error_payload(request.get("id"), exc.code, exc.message, exc.details)
            rpc_trace(f"handler_error id={request_id} op={op} code={exc.code} elapsed_ms={round((time.monotonic() - received_at) * 1000, 3)}")
        except Exception as exc:
            log_stderr(f"handler exception: {exc}")
            traceback.print_exc(file=sys.stderr)
            response = error_payload(request.get("id"), "internal_error", "handler failed")
            rpc_trace(f"handler_exception id={request_id} op={op} type={type(exc).__name__} elapsed_ms={round((time.monotonic() - received_at) * 1000, 3)}")

        write_started_at = time.monotonic()
        write_response(response)
        rpc_trace(f"response_flushed id={request_id} op={op} elapsed_ms={round((time.monotonic() - write_started_at) * 1000, 3)} total_ms={round((time.monotonic() - received_at) * 1000, 3)}")

        if request.get("op") == "shutdown":
            return 0

    return 0


def preflight() -> int:
    """Warm the packaged imports without starting a simulation or creating state."""
    startup_trace("preflight_begin")
    startup_trace_enabled = os.environ.get("GOODTRADING_NAUTILUS_STARTUP_TRACE") == "1"
    if startup_trace_enabled:
        faulthandler.dump_traceback_later(15, repeat=True, file=sys.stderr)
    try:
        metadata = protocol_metadata()
        startup_trace("preflight_service_import_begin")
        try:
            from goodtrading.simulation_service import SimulationService
        except ImportError:  # pragma: no cover - dev source-tree fallback
            from scripts.nautilus_bridge.simulation_service import SimulationService
        startup_trace("preflight_service_import_complete")
        service = SimulationService()
        service.shutdown()
        if startup_trace_enabled:
            faulthandler.cancel_dump_traceback_later()
        sys.stdout.write(json.dumps({"status": "ready", **metadata}, separators=(",", ":")) + "\n")
        sys.stdout.flush()
        return 0
    except Exception as exc:
        log_stderr(f"preflight failed: {exc}")
        traceback.print_exc(file=sys.stderr)
        if startup_trace_enabled:
            faulthandler.cancel_dump_traceback_later()
        return 1


if __name__ == "__main__":
    raise SystemExit(preflight() if sys.argv[1:] == ["--preflight"] else main())

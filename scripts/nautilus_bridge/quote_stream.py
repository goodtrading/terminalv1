from __future__ import annotations

import base64
import hashlib
import json
import os
import socket
import ssl
import struct
import threading
import time
from decimal import Decimal, InvalidOperation
from typing import Any, Callable
from urllib.parse import urlparse

MAGIC = b"GTQB"
HEADER_SIZE = 18
MAX_FRAME_BYTES = 64 * 1024
PROTOCOL_VERSION = 1
QUOTE_BBO = 1
QUOTE_SOURCE_UNAVAILABLE = 2
QUOTE_RECONNECT_CREDENTIAL = 3


def _read_exact(sock: socket.socket, size: int) -> bytes:
    chunks: list[bytes] = []
    remaining = size
    while remaining:
        chunk = sock.recv(remaining)
        if not chunk:
            raise EOFError("stream closed")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def decode_frame(frame: bytes) -> tuple[int, int, dict[str, Any]]:
    if len(frame) < HEADER_SIZE or len(frame) > MAX_FRAME_BYTES:
        raise ValueError("invalid quote frame length")
    if frame[:4] != MAGIC:
        raise ValueError("invalid quote frame magic")
    version, message_type = frame[4], frame[5]
    if version != PROTOCOL_VERSION:
        raise ValueError("unsupported quote protocol version")
    payload_length = struct.unpack_from("<I", frame, 6)[0]
    if payload_length != len(frame) - HEADER_SIZE:
        raise ValueError("quote payload length mismatch")
    sequence = struct.unpack_from("<Q", frame, 10)[0]
    try:
        payload = json.loads(frame[HEADER_SIZE:].decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("invalid quote payload") from exc
    if not isinstance(payload, dict):
        raise ValueError("quote payload must be an object")
    return message_type, sequence, payload


def _ws_frame(payload: bytes, opcode: int = 0x2) -> bytes:
    nonce = os.urandom(4)
    masked = bytes(value ^ nonce[index % 4] for index, value in enumerate(payload))
    size = len(masked)
    if size < 126:
        header = bytes([0x80 | opcode, 0x80 | size])
    elif size < 65536:
        header = bytes([0x80 | opcode, 0x80 | 126]) + struct.pack(">H", size)
    else:
        header = bytes([0x80 | opcode, 0x80 | 127]) + struct.pack(">Q", size)
    return header + nonce + masked


def _recv_ws_frame(sock: socket.socket) -> tuple[int, bytes]:
    first, second = _read_exact(sock, 2)
    if not first & 0x80:
        raise ValueError("fragmented websocket frames are unsupported")
    opcode = first & 0x0F
    length = second & 0x7F
    if length == 126:
        length = struct.unpack(">H", _read_exact(sock, 2))[0]
    elif length == 127:
        length = struct.unpack(">Q", _read_exact(sock, 8))[0]
    if length > MAX_FRAME_BYTES:
        raise ValueError("oversized websocket frame")
    if opcode >= 0x8 and (not first & 0x80 or length > 125):
        raise ValueError("invalid websocket control frame")
    mask = _read_exact(sock, 4) if second & 0x80 else b""
    payload = _read_exact(sock, length)
    if mask:
        payload = bytes(value ^ mask[index % 4] for index, value in enumerate(payload))
    return opcode, payload


class QuoteStreamClient:
    def __init__(self, config: dict[str, Any], on_quote: Callable[[dict[str, Any]], None], on_unavailable: Callable[[], None]):
        self._url = str(config.get("streamUrl", ""))
        self._token = str(config.get("capabilityToken", ""))
        self._reconnect_token: str | None = None
        self.reconnect_expires_at: int | None = None
        self._credential_lock = threading.Lock()
        self._socket_lock = threading.Lock()
        self._socket: socket.socket | None = None
        self._on_quote = on_quote
        self._on_unavailable = on_unavailable
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_sequence: int | None = None
        self._connected = False
        self._source_available = False
        self.decode_errors = 0
        self.sequence_errors = 0
        self.frames_received = 0
        self.reconnect_count = 0
        self.last_applied_at: int | None = None
        self.last_source_timestamp: int | None = None
        self.last_local_applied_timestamp: int | None = None

    def status(self) -> dict[str, Any]:
        now = int(time.time() * 1000)
        return {
            "configured": bool(self._url and self._token),
            "connected": self._connected,
            "sourceAvailable": self._source_available,
            "threadAlive": bool(self._thread and self._thread.is_alive()),
            "framesReceived": self.frames_received,
            "decodeErrors": self.decode_errors,
            "sequenceErrors": self.sequence_errors,
            "reconnectCount": self.reconnect_count,
            "lastSequence": self._last_sequence,
            "lastAppliedAt": self.last_applied_at,
            "quoteAgeMs": max(0, now - self.last_applied_at) if self.last_applied_at is not None else None,
            "lastSourceTimestamp": self.last_source_timestamp,
            "lastLocalAppliedTimestamp": self.last_local_applied_timestamp,
        }

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="gt-quote-stream", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)

    def _connect(self) -> socket.socket:
        parsed = urlparse(self._url)
        if parsed.scheme not in {"ws", "wss"} or not parsed.hostname or not self._token:
            raise ValueError("invalid quote stream configuration")
        port = parsed.port or (443 if parsed.scheme == "wss" else 80)
        raw = socket.create_connection((parsed.hostname, port), timeout=10)
        sock: socket.socket = raw
        if parsed.scheme == "wss":
            sock = ssl.create_default_context().wrap_socket(raw, server_hostname=parsed.hostname)
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        path = parsed.path or "/"
        if parsed.query:
            path += "?" + parsed.query
        request = (
            f"GET {path} HTTP/1.1\r\nHost: {parsed.hostname}:{port}\r\n"
            "Upgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n"
            f"Authorization: Bearer {self._current_token()}\r\n\r\n"
        ).encode("ascii")
        sock.sendall(request)
        response = bytearray()
        while b"\r\n\r\n" not in response and len(response) <= 8192:
            response.extend(_read_exact(sock, 1))
        if not response.startswith(b"HTTP/1.1 101"):
            sock.close()
            raise ConnectionError("quote stream handshake rejected")
        headers = response.decode("iso-8859-1").split("\r\n")
        received_accept = next((line.split(":", 1)[1].strip() for line in headers if line.lower().startswith("sec-websocket-accept:")), "")
        expected_accept = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode("ascii")).digest()).decode("ascii")
        if received_accept != expected_accept:
            sock.close()
            raise ConnectionError("quote stream handshake accept mismatch")
        self._last_sequence = None
        with self._socket_lock:
            self._socket = sock
        self._connected = True
        self._source_available = False
        return sock

    def force_disconnect_diagnostic(self) -> bool:
        """Close only the active socket; leave the worker lifecycle running."""
        with self._socket_lock:
            sock = self._socket
            if sock is None:
                return False
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            try:
                sock.close()
            except OSError:
                pass
            return True

    def _run(self) -> None:
        delay = 0.25
        while not self._stop.is_set():
            sock: socket.socket | None = None
            try:
                sock = self._connect()
                delay = 0.25
                while not self._stop.is_set():
                    opcode, payload = _recv_ws_frame(sock)
                    if opcode == 0x8:
                        raise EOFError("websocket close")
                    if opcode == 0x9:
                        sock.sendall(_ws_frame(payload, opcode=0xA))
                        continue
                    if opcode != 0x2:
                        continue
                    self.frames_received += 1
                    try:
                        message_type, sequence, body = decode_frame(payload)
                        if message_type == QUOTE_RECONNECT_CREDENTIAL:
                            self._store_reconnect_credential(body)
                            continue
                        if self._last_sequence is not None and sequence <= self._last_sequence:
                            self.sequence_errors += 1
                            continue
                        self._last_sequence = sequence
                        if message_type == QUOTE_SOURCE_UNAVAILABLE:
                            self._source_available = False
                            self._on_unavailable()
                            continue
                        if message_type != QUOTE_BBO:
                            raise ValueError("unsupported quote message type")
                        self._validate_quote(body)
                        self._on_quote(body)
                        applied_at = int(time.time() * 1000)
                        self._source_available = True
                        self.last_applied_at = applied_at
                        self.last_source_timestamp = int(body["sourceTimestampMs"])
                        self.last_local_applied_timestamp = int(body["localAppliedTimestampMs"])
                    except (ValueError, InvalidOperation, KeyError, TypeError):
                        self.decode_errors += 1
            except Exception:
                self._connected = False
                self._source_available = False
                self._on_unavailable()
                if self._stop.wait(delay):
                    break
                self.reconnect_count += 1
                delay = min(delay * 2, 5.0)
            finally:
                if sock is not None:
                    self._connected = False
                    with self._socket_lock:
                        if self._socket is sock:
                            self._socket = None
                    try:
                        sock.close()
                    except OSError:
                        pass

    def _current_token(self) -> str:
        with self._credential_lock:
            return self._reconnect_token or self._token

    def _store_reconnect_credential(self, body: dict[str, Any], now: int | None = None) -> None:
        token = body.get("reconnectToken")
        expires_at = body.get("expiresAt")
        issued_at = body.get("issuedAt")
        current_time = int(time.time() * 1000) if now is None else now
        if (not isinstance(token, str) or not token or
                not isinstance(expires_at, int) or expires_at <= current_time or
                not isinstance(issued_at, int) or issued_at >= expires_at or
                body.get("allowedInstrument") != "BTCUSDT-PERP" or
                body.get("allowedMarket") != "perpetual"):
            raise ValueError("invalid reconnect credential")
        with self._credential_lock:
            self._reconnect_token = token
            self.reconnect_expires_at = expires_at

    @staticmethod
    def _validate_quote(body: dict[str, Any]) -> None:
        required = ["bestBidPrice", "bestBidSize", "bestAskPrice", "bestAskSize", "sourceTimestampMs", "localAppliedTimestampMs"]
        if any(not isinstance(body.get(key), str) for key in required[:4]):
            raise ValueError("financial fields must be decimal strings")
        if body.get("source") != "binance" or body.get("market") != "perpetual" or body.get("symbol") != "BTCUSDT":
            raise ValueError("invalid quote source identity")
        bid = Decimal(body["bestBidPrice"])
        ask = Decimal(body["bestAskPrice"])
        bid_size = Decimal(body["bestBidSize"])
        ask_size = Decimal(body["bestAskSize"])
        if not all(value.is_finite() for value in (bid, ask, bid_size, ask_size)):
            raise ValueError("non-finite quote")
        if bid <= 0 or ask <= 0 or bid >= ask or bid_size < 0 or ask_size < 0:
            raise ValueError("invalid quote BBO")

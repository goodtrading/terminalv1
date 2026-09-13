from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

REPO_ROOT = Path(r"G:/Dev/tmp-release-commit")
RUNTIME_ROOT = REPO_ROOT / "build" / "n2c" / "runtime" / "nautilus-runtime"
PYTHON_EXE = RUNTIME_ROOT / "python.exe"
DAEMON_PY = RUNTIME_ROOT / "daemon.py"


def minimal_env() -> dict[str, str]:
    env = {}
    system_root = os.environ.get("SystemRoot") or os.environ.get("SYSTEMROOT") or r"C:\Windows"
    env["SystemRoot"] = system_root
    env["WINDIR"] = os.environ.get("WINDIR", system_root)
    env["TEMP"] = os.environ.get("TEMP", str(Path(os.environ.get("LOCALAPPDATA", r"C:\Users\nichl\AppData\Local")) / "Temp"))
    env["TMP"] = os.environ.get("TMP", env["TEMP"])
    env["PYTHONNOUSERSITE"] = "1"
    return env


def run_packaged_python(code: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(PYTHON_EXE), "-c", code],
        cwd=str(RUNTIME_ROOT),
        env=minimal_env(),
        text=True,
        capture_output=True,
        check=True,
    )


def run_packaged_daemon() -> dict[str, object]:
    code = r"""
import json
import subprocess
import sys

proc = subprocess.Popen(
    [sys.executable, r'''DAEMON_SCRIPT'''],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
)

assert proc.stdin is not None
assert proc.stdout is not None
assert proc.stderr is not None


def send(payload):
    proc.stdin.write(json.dumps(payload) + "\n")
    proc.stdin.flush()
    return json.loads(proc.stdout.readline())

health = send({"id": "health", "op": "health"})
ping = send({"id": "ping", "op": "ping"})
version = send({"id": "version", "op": "version"})
shutdown = send({"id": "shutdown", "op": "shutdown"})
proc.wait(timeout=10)
print(json.dumps({"health": health, "ping": ping, "version": version, "shutdown": shutdown}, sort_keys=True))
""".replace("DAEMON_SCRIPT", str(DAEMON_PY).replace("\\", "\\\\"))
    completed = run_packaged_python(code)
    return json.loads(completed.stdout.strip())


def main() -> int:
    if not PYTHON_EXE.exists():
        raise SystemExit(f"packaged python missing: {PYTHON_EXE}")

    bootstrap = run_packaged_python(
        r"""
import json
import pathlib
import sys
import goodtrading.simulation_core as simulation_core
from goodtrading.simulation_core import SimulationCore

runtime_root = pathlib.Path(r'''RUNTIME_ROOT''')
assert pathlib.Path(simulation_core.__file__).resolve().as_posix().startswith(runtime_root.as_posix())
assert 'tmp-release-commit/scripts/nautilus_bridge' not in pathlib.Path(simulation_core.__file__).resolve().as_posix()

core = SimulationCore()
core.start()
start_account = core.get_account()
core.set_market(99_999, 100_001)
buy = core.submit_market('buy', 1)
long_position = core.get_position()
assert long_position == core.get_position()
core.set_market(100_099, 100_101)
account_up = core.get_account()
assert account_up == core.get_account()
core.set_market(100_299, 100_301)
sell = core.submit_market('sell', 1)
flat_account = core.get_account()
assert flat_account == core.get_account()
core.reset()
reset_account = core.get_account()
core.set_market(99_999, 100_001)
limit = core.submit_limit('buy', 1, 99_900)
limit_working = len(core.get_orders()) == 1 and core.get_position() is None
core.set_market(99_899, 99_900)
limit_position = core.get_position()
core.reset()
core.set_market(99_999, 100_001)
working = core.submit_limit('buy', 1, 99_900)
canceled = core.cancel(working)
core.set_market(99_899, 99_900)
post_cancel_position = core.get_position()
core.reset()
core.set_market(99_999, 100_001)
core.submit_market('buy', 1)
core.set_market(100_299, 100_301)
flip = core.submit_market('sell', 2)
flip_position = core.get_position()
assert flip_position == core.get_position()
core.set_market(99_899, 99_901)
short_account = core.get_account()

print(json.dumps({
    'simulationCoreFile': str(pathlib.Path(simulation_core.__file__).resolve()),
    'nautilusVersion': __import__('nautilus_trader').__version__,
    'startAccount': start_account,
    'buy': buy,
    'longPosition': long_position,
    'accountUp': account_up,
    'sell': sell,
    'flatAccount': flat_account,
    'resetAccount': reset_account,
    'limit': limit,
    'limitWorking': limit_working,
    'limitPosition': limit_position,
    'working': working,
    'canceled': canceled,
    'postCancelPosition': post_cancel_position,
    'flip': flip,
    'flipPosition': flip_position,
    'shortAccount': short_account,
}, default=str, sort_keys=True))
""".replace("RUNTIME_ROOT", str(RUNTIME_ROOT).replace("\\", "\\\\"))
    )

    summary = json.loads(bootstrap.stdout.strip())
    daemon = run_packaged_daemon()

    def to_decimal(value: object) -> str:
        return str(value)

    assert summary["nautilusVersion"] == "1.231.0"
    assert summary["buy"]["status"] == "filled"
    assert summary["longPosition"]["side"] == "long"
    assert float(summary["accountUp"]["unrealized_pnl"]) > 0
    assert summary["sell"]["status"] == "filled"
    assert summary["flatAccount"]["unrealized_pnl"] == 0 or summary["flatAccount"]["unrealized_pnl"] == "0"
    assert float(summary["flatAccount"]["realized_pnl"]) > 0
    assert float(summary["flatAccount"]["fees_total"]) > 0
    assert summary["limit"]["status"] == "accepted"
    assert summary["limitWorking"] is True
    assert summary["limitPosition"]["side"] == "long"
    assert summary["canceled"]["status"] == "canceled"
    assert summary["postCancelPosition"] is None
    assert summary["flip"]["status"] == "filled"
    assert summary["flipPosition"]["side"] == "short"
    assert float(summary["shortAccount"]["unrealized_pnl"]) > 0

    assert daemon["health"]["ok"] is True
    assert daemon["ping"]["ok"] is True
    assert daemon["version"]["ok"] is True
    assert daemon["shutdown"]["ok"] is True

    print("PACKAGED_N3B=PASS")
    print("NAUTILUS_VERSION=1.231.0")
    print("MARKET_ORDER=FILLED")
    print("LONG_POSITION=PASS")
    print("UNREALIZED_PNL=PASS")
    print("REALIZED_PNL=PASS")
    print("FEES=PASS")
    print("LIMIT_WORKING=PASS")
    print("LIMIT_FILL=PASS")
    print("CANCEL=PASS")
    print("POST_CANCEL_NO_FILL=PASS")
    print("FLIP=PASS")
    print("SHORT_PNL=PASS")
    print("READ_IDEMPOTENCY=PASS")
    print(f"SIMULATION_CORE_FILE={summary['simulationCoreFile']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

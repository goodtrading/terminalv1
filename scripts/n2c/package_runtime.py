from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

DEFAULT_REPO_ROOT = Path(r"G:/Dev/tmp-release-commit")
DEFAULT_SOURCE_PYTHON = Path(r"C:/Users/nichl/AppData/Local/Programs/Python/Python312")
DEFAULT_SOURCE_SITE_PACKAGES = Path(r"G:/Dev/nautilus-env/Lib/site-packages")
DEFAULT_SOURCE_DAEMON = DEFAULT_REPO_ROOT / "scripts" / "nautilus_bridge" / "daemon.py"
DEFAULT_SOURCE_CONTRACTS = DEFAULT_REPO_ROOT / "scripts" / "nautilus_bridge" / "contracts.py"
DEFAULT_SOURCE_SIMULATION_CORE = DEFAULT_REPO_ROOT / "scripts" / "nautilus_bridge" / "simulation_core.py"
DEFAULT_SOURCE_SIMULATION_SERVICE = DEFAULT_REPO_ROOT / "scripts" / "nautilus_bridge" / "simulation_service.py"
DEFAULT_SOURCE_QUOTE_STREAM = DEFAULT_REPO_ROOT / "scripts" / "nautilus_bridge" / "quote_stream.py"
DEFAULT_TARGET_ROOT = DEFAULT_REPO_ROOT / "build" / "n2c" / "runtime" / "nautilus-runtime"
DEFAULT_MANIFEST_PATH = DEFAULT_TARGET_ROOT / "runtime-manifest.json"
DEFAULT_GOODTRADING_ROOT = DEFAULT_TARGET_ROOT / "goodtrading"
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a private Windows Python/Nautilus runtime")
    parser.add_argument("--sync-only", action="store_true", help="Refresh application modules and manifest in an existing runtime without replacing Python or dependencies")
    parser.add_argument("--source-python", type=Path, default=DEFAULT_SOURCE_PYTHON)
    parser.add_argument("--source-site-packages", type=Path, default=DEFAULT_SOURCE_SITE_PACKAGES)
    parser.add_argument("--source-daemon", type=Path, default=DEFAULT_SOURCE_DAEMON)
    parser.add_argument("--source-contracts", type=Path, default=DEFAULT_SOURCE_CONTRACTS)
    parser.add_argument("--source-simulation-core", type=Path, default=DEFAULT_SOURCE_SIMULATION_CORE)
    parser.add_argument("--source-simulation-service", type=Path, default=DEFAULT_SOURCE_SIMULATION_SERVICE)
    parser.add_argument("--source-quote-stream", type=Path, default=DEFAULT_SOURCE_QUOTE_STREAM)
    parser.add_argument("--target-root", type=Path, default=DEFAULT_TARGET_ROOT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST_PATH)
    return parser.parse_args()


def copytree(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(
        src,
        dst,
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "*.pyo"),
    )


def copy_file(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def write_text(target: Path, content: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def overlay_site_packages(source: Path, target_root: Path) -> None:
    target_site_packages = target_root / "Lib" / "site-packages"
    target_site_packages.mkdir(parents=True, exist_ok=True)
    shutil.copytree(
        source,
        target_site_packages,
        dirs_exist_ok=True,
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "*.pyo"),
    )


def overlay_goodtrading_files(
    source_daemon: Path,
    source_contracts: Path,
    source_simulation_core: Path,
    source_simulation_service: Path,
    source_quote_stream: Path,
    target_root: Path,
) -> dict[str, str]:
    goodtrading_root = target_root / "goodtrading"
    goodtrading_root.mkdir(parents=True, exist_ok=True)
    write_text(goodtrading_root / "__init__.py", '"""GoodTrading packaged runtime modules."""\n')
    daemon_target = goodtrading_root / "daemon.py"
    contracts_target = goodtrading_root / "contracts.py"
    simulation_core_target = goodtrading_root / "simulation_core.py"
    simulation_service_target = goodtrading_root / "simulation_service.py"
    copy_file(source_daemon, daemon_target)
    copy_file(source_contracts, contracts_target)
    copy_file(source_simulation_core, simulation_core_target)
    copy_file(DEFAULT_REPO_ROOT / "shared" / "trading" / "paperCostPolicy.json", goodtrading_root / "paperCostPolicy.json")
    copy_file(source_simulation_service, simulation_service_target)
    quote_stream_target = goodtrading_root / "quote_stream.py"
    copy_file(source_quote_stream, quote_stream_target)
    copy_file(source_daemon, target_root / "daemon.py")
    return {
        "goodtradingRoot": str(goodtrading_root),
        "daemonTarget": str(daemon_target),
        "contractsTarget": str(contracts_target),
        "simulationCoreTarget": str(simulation_core_target),
        "simulationServiceTarget": str(simulation_service_target),
        "quoteStreamTarget": str(quote_stream_target),
        "rootDaemonTarget": str(target_root / "daemon.py"),
    }


def runtime_stats(root: Path) -> dict[str, object]:
    file_count = 0
    total_bytes = 0
    top_level: dict[str, int] = {}
    for current_root, _, files in os.walk(root):
        current_root_path = Path(current_root)
        for file_name in files:
            file_path = current_root_path / file_name
            try:
                size = file_path.stat().st_size
            except FileNotFoundError:
                continue
            file_count += 1
            total_bytes += size
            try:
                relative = file_path.relative_to(root)
                top = relative.parts[0]
            except Exception:
                top = file_path.name
            top_level[top] = top_level.get(top, 0) + size
    major = [
        {"name": name, "bytes": size}
        for name, size in sorted(top_level.items(), key=lambda item: item[1], reverse=True)[:10]
    ]
    return {
        "fileCount": file_count,
        "totalBytes": total_bytes,
        "majorTopLevel": major,
    }


def maybe_python_version(python_exe: Path) -> str:
    try:
        output = subprocess.check_output([str(python_exe), "--version"], text=True, stderr=subprocess.STDOUT)
        return output.strip().replace("Python ", "")
    except Exception as exc:
        return f"ERROR: {exc}"


def maybe_nautilus_version(python_exe: Path) -> str:
    try:
        output = subprocess.check_output(
            [str(python_exe), "-c", "import nautilus_trader; print(nautilus_trader.__version__)"],
            text=True,
            stderr=subprocess.STDOUT,
        )
        return output.strip()
    except Exception as exc:
        return f"ERROR: {exc}"


def maybe_module_origin(python_exe: Path, runtime_root: Path, module_name: str) -> str:
    code = (
        "import importlib, sys; "
        "from pathlib import Path; "
        "runtime = Path(sys.executable).resolve().parent; "
        "sys.path.insert(0, str(runtime)); "
        f"mod = importlib.import_module({module_name!r}); "
        "print(mod.__file__)"
    )
    try:
        output = subprocess.check_output(
            [str(python_exe), "-c", code],
            text=True,
            stderr=subprocess.STDOUT,
            cwd=str(runtime_root),
        )
        return output.strip()
    except Exception as exc:
        return f"ERROR: {exc}"


def maybe_file_hash(path: Path) -> str:
    try:
        return sha256_file(path)
    except Exception as exc:
        return f"ERROR: {exc}"


def main() -> int:
    args = parse_args()
    args.target_root.parent.mkdir(parents=True, exist_ok=True)
    if args.sync_only:
        if not (args.target_root / "python.exe").is_file():
            raise SystemExit("--sync-only requires an existing runtime with python.exe")
    else:
        copytree(args.source_python, args.target_root)
        overlay_site_packages(args.source_site_packages, args.target_root)
    packaged_paths = overlay_goodtrading_files(
        args.source_daemon,
        args.source_contracts,
        args.source_simulation_core,
        args.source_simulation_service,
        args.source_quote_stream,
        args.target_root,
    )

    python_exe = args.target_root / "python.exe"
    root_daemon = args.target_root / "daemon.py"
    goodtrading_root = args.target_root / "goodtrading"
    manifest = {
        "schemaVersion": 3,
        "sourcePython": str(args.source_python),
        "sourceSitePackages": str(args.source_site_packages),
        "sourceDaemon": str(args.source_daemon),
        "sourceContracts": str(args.source_contracts),
        "sourceSimulationCore": str(args.source_simulation_core),
        "sourceSimulationService": str(args.source_simulation_service),
        "sourceQuoteStream": str(args.source_quote_stream),
        "targetRoot": str(args.target_root),
        "pythonVersion": maybe_python_version(python_exe) if python_exe.exists() else "missing",
        "nautilusVersion": maybe_nautilus_version(python_exe) if python_exe.exists() else "missing",
        "protocolVersion": 1,
        "simulationProtocolVersion": 1,
        "simulationCore": True,
        "simulationCorePath": maybe_module_origin(python_exe, args.target_root, "goodtrading.simulation_core") if python_exe.exists() else "missing",
        "contractsPath": maybe_module_origin(python_exe, args.target_root, "goodtrading.contracts") if python_exe.exists() else "missing",
        "simulationServicePath": maybe_module_origin(python_exe, args.target_root, "goodtrading.simulation_service") if python_exe.exists() else "missing",
        "daemonPath": maybe_module_origin(python_exe, args.target_root, "goodtrading.daemon") if python_exe.exists() else "missing",
        "rootDaemonPath": str(root_daemon),
        "goodtradingRoot": str(goodtrading_root),
        "daemonTarget": packaged_paths["daemonTarget"],
        "contractsTarget": packaged_paths["contractsTarget"],
        "simulationCoreTarget": packaged_paths["simulationCoreTarget"],
        "simulationServiceTarget": packaged_paths["simulationServiceTarget"],
        "moduleHashes": {
            "daemon": {
                "source": maybe_file_hash(args.source_daemon),
                "packaged": maybe_file_hash(Path(packaged_paths["daemonTarget"])),
            },
            "contracts": {
                "source": maybe_file_hash(args.source_contracts),
                "packaged": maybe_file_hash(Path(packaged_paths["contractsTarget"])),
            },
            "simulation_core": {
                "source": maybe_file_hash(args.source_simulation_core),
                "packaged": maybe_file_hash(Path(packaged_paths["simulationCoreTarget"])),
            },
            "simulation_service": {
                "source": maybe_file_hash(args.source_simulation_service),
                "packaged": maybe_file_hash(Path(packaged_paths["simulationServiceTarget"])),
            },
            "quote_stream": {
                "source": maybe_file_hash(args.source_quote_stream),
                "packaged": maybe_file_hash(Path(packaged_paths["quoteStreamTarget"])),
            },
        },
    }
    manifest.update(runtime_stats(args.target_root))
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

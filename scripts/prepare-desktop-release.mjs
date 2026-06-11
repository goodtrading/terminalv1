#!/usr/bin/env node
/**
 * Copies Tauri NSIS/MSI bundles into releases/desktop/ with stable filenames.
 *
 * Usage: node scripts/prepare-desktop-release.mjs
 * Requires: npm run build:desktop (or npm run release:desktop) completed first.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauriConfigPath = path.join(repoRoot, "src-tauri", "tauri.conf.json");
const releasesDir = path.join(repoRoot, "releases", "desktop");

function fail(message) {
  console.error(`[prepare-desktop-release] ${message}`);
  process.exit(1);
}

function readTauriVersion() {
  if (!fs.existsSync(tauriConfigPath)) {
    fail(`Tauri config not found: ${tauriConfigPath}`);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`Failed to parse ${tauriConfigPath}: ${message}`);
  }

  const version = String(config.version ?? "").trim();
  if (!version) {
    fail(`Missing "version" in ${tauriConfigPath}`);
  }

  return version;
}

function resolveBundleRoot() {
  const cargoTarget = process.env.CARGO_TARGET_DIR?.trim();
  if (cargoTarget) {
    return path.join(cargoTarget, "release", "bundle");
  }
  return path.join(repoRoot, "src-tauri", "target", "release", "bundle");
}

function listBundleFiles(subdir) {
  const dir = path.join(resolveBundleRoot(), subdir);
  if (!fs.existsSync(dir)) {
    return { dir, files: [] };
  }
  return { dir, files: fs.readdirSync(dir) };
}

function findNsisSetup(version) {
  const { dir, files } = listBundleFiles("nsis");
  const expectedName = `GoodTrading Terminal_${version}_x64-setup.exe`;

  if (files.includes(expectedName)) {
    return path.join(dir, expectedName);
  }

  const versionMatch = files.find(
    (name) =>
      name.endsWith("_x64-setup.exe") && name.includes(`_${version}_`),
  );
  if (versionMatch) {
    return path.join(dir, versionMatch);
  }

  const anySetup = files.find((name) => name.endsWith("_x64-setup.exe"));
  if (anySetup) {
    console.warn(
      `[prepare-desktop-release] warning: using ${anySetup} (expected ${expectedName})`,
    );
    return path.join(dir, anySetup);
  }

  fail(
    [
      "NSIS setup not found.",
      `Looked in: ${dir}`,
      `Expected file like: ${expectedName}`,
      files.length ? `Found: ${files.join(", ")}` : "Directory missing or empty.",
      "Run: npm run build:desktop",
    ].join("\n"),
  );
}

function findMsiInstaller(version) {
  const { dir, files } = listBundleFiles("msi");
  if (!files.length) return null;

  const versionMatch = files.find(
    (name) => name.endsWith(".msi") && name.includes(`_${version}_`),
  );
  if (versionMatch) return path.join(dir, versionMatch);

  const anyMsi = files.find((name) => name.endsWith(".msi"));
  return anyMsi ? path.join(dir, anyMsi) : null;
}

function copyArtifact(sourcePath, destFileName) {
  fs.mkdirSync(releasesDir, { recursive: true });
  const destPath = path.join(releasesDir, destFileName);
  fs.copyFileSync(sourcePath, destPath);
  const stats = fs.statSync(destPath);
  return { destPath, bytes: stats.size };
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function main() {
  const version = readTauriVersion();
  const setupBase = `GoodTrading-Terminal-${version}-x64`;

  console.log(`[prepare-desktop-release] version=${version}`);
  console.log(`[prepare-desktop-release] bundle root=${resolveBundleRoot()}`);

  const nsisSource = findNsisSetup(version);
  const setupDest = `${setupBase}-setup.exe`;
  const setup = copyArtifact(nsisSource, setupDest);

  console.log(`[prepare-desktop-release] NSIS source: ${nsisSource}`);
  console.log(
    `[prepare-desktop-release] NSIS output:  ${setup.destPath} (${formatBytes(setup.bytes)})`,
  );

  const msiSource = findMsiInstaller(version);
  if (msiSource) {
    const msiDest = `${setupBase}.msi`;
    const msi = copyArtifact(msiSource, msiDest);
    console.log(`[prepare-desktop-release] MSI source:  ${msiSource}`);
    console.log(
      `[prepare-desktop-release] MSI output:   ${msi.destPath} (${formatBytes(msi.bytes)})`,
    );
  } else {
    console.log("[prepare-desktop-release] MSI bundle not found (skipped).");
  }

  console.log("[prepare-desktop-release] done.");
}

main();

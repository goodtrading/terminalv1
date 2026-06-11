#!/usr/bin/env node
/**
 * Pre-release checks for GoodTrading Desktop.
 *
 * Usage: npm run doctor:desktop
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauriConfigPath = path.join(repoRoot, "src-tauri", "tauri.conf.json");
const packageJsonPath = path.join(repoRoot, "package.json");
const manifestPath = path.join(repoRoot, "client", "public", "desktop-update.json");
const releasesDir = path.join(repoRoot, "releases", "desktop");
const iconsDir = path.join(repoRoot, "src-tauri", "icons");
const releaseFlowDocPath = path.join(repoRoot, "docs", "desktop-release-flow.md");
const githubReleasePrefix =
  "github.com/goodtrading/terminalv1/releases/download/";

const REQUIRED_ICONS = [
  "icon.ico",
  "32x32.png",
  "128x128.png",
  "128x128@2x.png",
];

const REQUIRED_SCRIPTS = [
  "build:desktop",
  "release:desktop",
  "prepare:desktop-release",
  "print:desktop-release-command",
  "doctor:desktop",
];

/** @type {{ label: string; status: "pass" | "warn" | "fail"; detail?: string }[]} */
const checks = [];

function addCheck(label, status, detail) {
  checks.push({ label, status, detail });
}

function parseSemver(version) {
  const match = String(version)
    .trim()
    .match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function readTauriVersion() {
  if (!fs.existsSync(tauriConfigPath)) {
    addCheck("Tauri config found", "fail", `Missing ${tauriConfigPath}`);
    return null;
  }

  addCheck("Tauri config found", "pass");

  let config;
  try {
    config = readJson(tauriConfigPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addCheck("Desktop version found", "fail", `Invalid tauri.conf.json: ${message}`);
    return null;
  }

  const version = String(config.version ?? "").trim();
  if (!version) {
    addCheck("Desktop version found", "fail", 'Missing "version" in tauri.conf.json');
    return null;
  }

  addCheck("Desktop version found", "pass");
  return version;
}

function checkPackageVersion(currentVersion) {
  if (!fs.existsSync(packageJsonPath)) {
    addCheck("package.json version aligned", "warn", "package.json not found");
    return;
  }

  let pkg;
  try {
    pkg = readJson(packageJsonPath);
  } catch {
    addCheck("package.json version aligned", "warn", "Could not parse package.json");
    return;
  }

  const pkgVersion = String(pkg.version ?? "").trim();
  if (!pkgVersion) {
    addCheck("package.json version aligned", "warn", "package.json has no version field");
    return;
  }

  if (pkgVersion !== currentVersion) {
    addCheck(
      "package.json version aligned",
      "warn",
      `package.json=${pkgVersion}, tauri=${currentVersion}`,
    );
    return;
  }

  addCheck("package.json version aligned", "pass");
}

function checkInstaller(currentVersion) {
  const setupPath = path.join(
    releasesDir,
    `GoodTrading-Terminal-${currentVersion}-x64-setup.exe`,
  );

  if (!fs.existsSync(setupPath)) {
    addCheck(
      "NSIS setup found",
      "fail",
      `Missing ${setupPath}. Run: npm run release:desktop`,
    );
    return;
  }

  addCheck("NSIS setup found", "pass");

  const msiPath = path.join(
    releasesDir,
    `GoodTrading-Terminal-${currentVersion}-x64.msi`,
  );
  if (!fs.existsSync(msiPath)) {
    addCheck("MSI installer found", "warn", `Optional file missing: ${msiPath}`);
  } else {
    addCheck("MSI installer found", "pass");
  }
}

function validateManifestField(name, value, type, allowEmptyString = false) {
  if (value === undefined || value === null) {
    return `${name} is missing`;
  }
  if (type === "string") {
    if (typeof value !== "string") return `${name} must be a string`;
    if (!allowEmptyString && value.trim() === "") return `${name} is empty`;
    return null;
  }
  if (type === "boolean" && typeof value !== "boolean") {
    return `${name} must be a boolean`;
  }
  if (type === "array" && !Array.isArray(value)) {
    return `${name} must be an array`;
  }
  return null;
}

function checkManifest(currentVersion) {
  if (!fs.existsSync(manifestPath)) {
    addCheck("desktop-update.json valid", "fail", `Missing ${manifestPath}`);
    return;
  }

  let manifest;
  try {
    manifest = readJson(manifestPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addCheck("desktop-update.json valid", "fail", `Invalid JSON: ${message}`);
    return;
  }

  const fieldErrors = [
    validateManifestField("latestVersion", manifest.latestVersion, "string"),
    validateManifestField("minSupportedVersion", manifest.minSupportedVersion, "string"),
    validateManifestField("mandatory", manifest.mandatory, "boolean"),
    validateManifestField("downloadUrl", manifest.downloadUrl, "string", true),
    validateManifestField("releaseNotes", manifest.releaseNotes, "array"),
    validateManifestField("publishedAt", manifest.publishedAt, "string"),
  ].filter(Boolean);

  if (fieldErrors.length) {
    addCheck("desktop-update.json valid", "fail", fieldErrors.join("; "));
    return;
  }

  addCheck("desktop-update.json valid", "pass");

  const latestVersion = manifest.latestVersion.trim();
  const minSupportedVersion = manifest.minSupportedVersion.trim();
  const downloadUrl = manifest.downloadUrl.trim();

  const latestVsCurrent = compareSemver(latestVersion, currentVersion);
  if (latestVsCurrent === 1) {
    addCheck(
      "Manifest latestVersion vs app",
      "warn",
      "Manifest apunta a una versión mayor que la app actual",
    );
  } else {
    addCheck("Manifest latestVersion vs app", "pass");
  }

  if (latestVersion === currentVersion && downloadUrl === "") {
    addCheck(
      "downloadUrl configured",
      "warn",
      "downloadUrl vacío; OK si todavía no publicaste GitHub Release",
    );
  } else if (downloadUrl === "") {
    addCheck("downloadUrl configured", "warn", "downloadUrl vacío");
  } else {
    addCheck("downloadUrl configured", "pass");
    checkGitHubReleaseUrl(downloadUrl, latestVersion);
  }

  if (manifest.mandatory === true) {
    const minVsCurrent = compareSemver(minSupportedVersion, currentVersion);
    if (minVsCurrent === 1) {
      addCheck(
        "Mandatory update safety",
        "warn",
        "Esta build quedaría bloqueada por update obligatorio",
      );
    } else {
      addCheck("Mandatory update safety", "pass");
    }
  } else {
    addCheck("Mandatory update safety", "pass");
  }
}

function checkGitHubReleaseUrl(downloadUrl, latestVersion) {
  const issues = [];

  if (!downloadUrl.includes(githubReleasePrefix)) {
    issues.push(`Expected path segment: ${githubReleasePrefix}`);
  }

  const expectedTag = `v${latestVersion}`;
  if (!downloadUrl.includes(expectedTag)) {
    issues.push(`Expected tag segment: ${expectedTag}`);
  }

  const expectedFile = `GoodTrading-Terminal-${latestVersion}-x64-setup.exe`;
  if (!downloadUrl.includes(expectedFile)) {
    issues.push(`Expected filename: ${expectedFile}`);
  }

  if (issues.length) {
    addCheck("GitHub Release URL format", "warn", issues.join("; "));
  } else {
    addCheck("GitHub Release URL format", "pass");
  }
}

function checkIcons() {
  const missing = REQUIRED_ICONS.filter(
    (name) => !fs.existsSync(path.join(iconsDir, name)),
  );

  if (missing.length) {
    addCheck("Icons found", "fail", `Missing: ${missing.join(", ")}`);
    return;
  }

  addCheck("Icons found", "pass");
}

function checkScripts() {
  if (!fs.existsSync(packageJsonPath)) {
    addCheck("Release scripts found", "fail", "package.json not found");
    return;
  }

  let pkg;
  try {
    pkg = readJson(packageJsonPath);
  } catch {
    addCheck("Release scripts found", "fail", "Could not parse package.json");
    return;
  }

  const scripts = pkg.scripts ?? {};
  const missing = REQUIRED_SCRIPTS.filter((name) => !scripts[name]);

  if (missing.length) {
    addCheck("Release scripts found", "fail", `Missing scripts: ${missing.join(", ")}`);
    return;
  }

  addCheck("Release scripts found", "pass");
}

function checkReleaseDocs() {
  if (!fs.existsSync(releaseFlowDocPath)) {
    addCheck("Release flow docs found", "warn", `Missing ${releaseFlowDocPath}`);
    return;
  }

  addCheck("Release flow docs found", "pass");
}

function iconFor(status) {
  if (status === "pass") return "✅";
  if (status === "warn") return "⚠️";
  return "❌";
}

function printReport(currentVersion) {
  console.log("GoodTrading Desktop Release Doctor");
  console.log(`Version: ${currentVersion ?? "unknown"}`);
  console.log("");
  console.log("Checks:");

  for (const check of checks) {
    const suffix = check.detail ? ` — ${check.detail}` : "";
    console.log(`${iconFor(check.status)} ${check.label}${suffix}`);
  }

  const hasFail = checks.some((check) => check.status === "fail");
  const hasWarn = checks.some((check) => check.status === "warn");

  console.log("");
  console.log("Result:");
  if (hasFail) {
    console.log("FAILED");
    process.exit(1);
  }
  if (hasWarn) {
    console.log("READY WITH WARNINGS");
    process.exit(0);
  }
  console.log("READY");
  process.exit(0);
}

function main() {
  const currentVersion = readTauriVersion();

  if (currentVersion) {
    checkPackageVersion(currentVersion);
    checkInstaller(currentVersion);
    checkManifest(currentVersion);
  }

  checkIcons();
  checkScripts();
  checkReleaseDocs();
  printReport(currentVersion);
}

main();

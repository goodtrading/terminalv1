#!/usr/bin/env node
/**
 * Prints suggested `gh release create` command and expected asset URL.
 * Does NOT run gh — copy/paste only.
 *
 * Usage: node scripts/print-github-release-command.mjs
 *        npm run print:desktop-release-command
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauriConfigPath = path.join(repoRoot, "src-tauri", "tauri.conf.json");
const releasesDir = path.join(repoRoot, "releases", "desktop");
const githubRepo = process.env.GITHUB_REPO?.trim() || "goodtrading/terminalv1";

function fail(message) {
  console.error(`[print-github-release-command] ${message}`);
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

function main() {
  const version = readTauriVersion();
  const tag = `v${version}`;
  const setupFileName = `GoodTrading-Terminal-${version}-x64-setup.exe`;
  const msiFileName = `GoodTrading-Terminal-${version}-x64.msi`;
  const setupPath = path.join(releasesDir, setupFileName);
  const msiPath = path.join(releasesDir, msiFileName);
  const title = `GoodTrading Terminal ${tag}`;
  const assetUrl = `https://github.com/${githubRepo}/releases/download/${tag}/${setupFileName}`;

  const setupExists = fs.existsSync(setupPath);
  const msiExists = fs.existsSync(msiPath);

  console.log(`[print-github-release-command] version=${version}`);
  console.log(`[print-github-release-command] tag=${tag}`);
  console.log(`[print-github-release-command] setup=${setupPath}${setupExists ? "" : " (missing — run npm run release:desktop first)"}`);
  if (msiExists) {
    console.log(`[print-github-release-command] msi=${msiPath}`);
  }

  console.log("");
  console.log("--- gh release create (setup only) ---");
  console.log(
    [
      `gh release create ${tag} \\`,
      `  "${setupPath}" \\`,
      `  --repo ${githubRepo} \\`,
      `  --title "${title}" \\`,
      `  --notes "Initial desktop release"`,
    ].join("\n"),
  );

  if (msiExists) {
    console.log("");
    console.log("--- gh release create (setup + MSI) ---");
    console.log(
      [
        `gh release create ${tag} \\`,
        `  "${setupPath}" \\`,
        `  "${msiPath}" \\`,
        `  --repo ${githubRepo} \\`,
        `  --title "${title}" \\`,
        `  --notes "Initial desktop release"`,
      ].join("\n"),
    );
  } else {
    console.log("");
    console.log("--- optional MSI ---");
    console.log(
      `To attach MSI later: gh release upload ${tag} "${msiPath}" --repo ${githubRepo}`,
    );
  }

  console.log("");
  console.log("--- expected downloadUrl (desktop-update.json) ---");
  console.log(assetUrl);
  console.log("");
  console.log("[print-github-release-command] done.");
}

main();

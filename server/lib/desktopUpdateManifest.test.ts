import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDesktopUpdatePayload,
  normalizeDesktopUpdateManifest,
  parseDesktopReleaseNotes,
  parseDesktopUpdateMandatory,
} from "./desktopUpdateManifest.ts";

test("normalizeDesktopUpdateManifest accepts valid shape", () => {
  const result = normalizeDesktopUpdateManifest({
    latestVersion: "0.1.1",
    minSupportedVersion: "0.1.0",
    mandatory: "false",
    downloadUrl: "https://example.com/setup.exe",
    releaseNotes: ["One", "Two"],
    publishedAt: "2026-06-11T00:00:00.000Z",
  });

  assert.equal(result?.latestVersion, "0.1.1");
  assert.equal(result?.mandatory, false);
  assert.deepEqual(result?.releaseNotes, ["One", "Two"]);
});

test("parseDesktopReleaseNotes splits pipe and newline strings", () => {
  assert.deepEqual(parseDesktopReleaseNotes("A|B"), ["A", "B"]);
  assert.deepEqual(parseDesktopReleaseNotes("A\nB"), ["A", "B"]);
});

test("parseDesktopUpdateMandatory parses string booleans", () => {
  assert.equal(parseDesktopUpdateMandatory("true"), true);
  assert.equal(parseDesktopUpdateMandatory("false"), false);
});

test("buildDesktopUpdatePayload reads manifest from client/public", () => {
  const priorLatest = process.env.DESKTOP_LATEST_VERSION;
  delete process.env.DESKTOP_LATEST_VERSION;
  delete process.env.DESKTOP_MIN_SUPPORTED_VERSION;
  delete process.env.DESKTOP_UPDATE_MANDATORY;
  delete process.env.DESKTOP_UPDATE_DOWNLOAD_URL;
  delete process.env.DESKTOP_UPDATE_RELEASE_NOTES;
  delete process.env.DESKTOP_UPDATE_PUBLISHED_AT;

  try {
    const payload = buildDesktopUpdatePayload();
    assert.equal(payload.latestVersion, "0.1.0");
    assert.equal(payload.minSupportedVersion, "0.1.0");
    assert.equal(payload.mandatory, false);
  } finally {
    if (priorLatest !== undefined) {
      process.env.DESKTOP_LATEST_VERSION = priorLatest;
    }
  }
});

test("env vars override manifest fields", () => {
  const prior = {
    latest: process.env.DESKTOP_LATEST_VERSION,
    mandatory: process.env.DESKTOP_UPDATE_MANDATORY,
  };

  process.env.DESKTOP_LATEST_VERSION = "9.9.9";
  process.env.DESKTOP_UPDATE_MANDATORY = "true";

  try {
    const payload = buildDesktopUpdatePayload();
    assert.equal(payload.latestVersion, "9.9.9");
    assert.equal(payload.mandatory, true);
  } finally {
    if (prior.latest === undefined) delete process.env.DESKTOP_LATEST_VERSION;
    else process.env.DESKTOP_LATEST_VERSION = prior.latest;
    if (prior.mandatory === undefined) delete process.env.DESKTOP_UPDATE_MANDATORY;
    else process.env.DESKTOP_UPDATE_MANDATORY = prior.mandatory;
  }
});

test("invalid manifest shape returns null", () => {
  assert.equal(normalizeDesktopUpdateManifest({ latestVersion: "" }), null);
  assert.equal(normalizeDesktopUpdateManifest(null), null);
});

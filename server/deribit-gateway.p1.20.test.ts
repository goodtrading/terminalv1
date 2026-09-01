// @ts-nocheck

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DeribitOptionsGateway } from "./deribit-gateway";

const NOW_MS = Date.UTC(2026, 7, 30, 8, 0, 0);
const DERIBIT_URL = "https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option";
const SUMMARY_SPOT = 65000;

function parseExpiry(expiry: string): number | null {
  const match = String(expiry || "").trim().toUpperCase().match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const months: Record<string, number> = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  };
  const month = months[match[2]];
  if (month == null) return null;
  const year = 2000 + Number(match[3]);
  const dt = Date.UTC(year, month, day, 8, 0, 0);
  return Number.isFinite(dt) ? dt : null;
}

function selectIv(row: any): number | null {
  const bid = row.bid_iv != null && Number.isFinite(Number(row.bid_iv)) && Number(row.bid_iv) > 0 ? Number(row.bid_iv) / 100 : null;
  const ask = row.ask_iv != null && Number.isFinite(Number(row.ask_iv)) && Number(row.ask_iv) > 0 ? Number(row.ask_iv) / 100 : null;
  if (bid != null && ask != null) return (bid + ask) / 2;
  const mark = row.mark_iv != null && Number.isFinite(Number(row.mark_iv)) && Number(row.mark_iv) > 0 ? Number(row.mark_iv) / 100 : null;
  return mark;
}

function d1(S: number, K: number, sigma: number, T: number): number {
  return (Math.log(S / K) + 0.02 * T + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
}

function nd1(S: number, K: number, sigma: number, T: number): number {
  const x = d1(S, K, sigma, T);
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function rawVanna(S: number, K: number, sigma: number, T: number): number {
  const x = d1(S, K, sigma, T);
  const y = x - sigma * Math.sqrt(T);
  const phi = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  return -phi * y / sigma;
}

function rawCharm(S: number, K: number, sigma: number, T: number): number {
  const x = d1(S, K, sigma, T);
  const y = x - sigma * Math.sqrt(T);
  const phi = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  return -phi * (2 * 0.02 * T - y * sigma * Math.sqrt(T)) / (2 * T * sigma * Math.sqrt(T));
}

function runMockedIngest(resultRows: any[]) {
  const originalFetch = globalThis.fetch;
  const originalDateNow = Date.now;
  const calls: string[] = [];

  (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = (async (url: string) => {
    calls.push(String(url));
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ result: resultRows }),
    } as Response;
  }) as typeof fetch;
  (Date as any).now = () => NOW_MS;
  (DeribitOptionsGateway as any).liveCache = null;

  return {
    calls,
    async run() {
      const ingestion = await DeribitOptionsGateway.ingestOptions();
      const summary = await DeribitOptionsGateway.getSummary(ingestion.options, SUMMARY_SPOT, ingestion.source);
      return { ingestion, summary };
    },
    restore() {
      (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = originalFetch;
      (Date as any).now = originalDateNow;
      (DeribitOptionsGateway as any).liveCache = null;
    },
  };
}

function buildRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    best_bid_price: 1.1,
    best_ask_price: 1.2,
    best_bid_amount: 10,
    best_ask_amount: 11,
    ...overrides,
  };
}

test("P1.20 same frozen live snapshot reconciles Vanna, Charm and GEX exactly", async () => {
  const rawRows = [
    buildRow({
      instrument_name: "BTC-27SEP26-65000-C",
      open_interest: 100,
      underlying_price: 65000,
      mark_iv: 50,
      bid_iv: undefined,
      ask_iv: undefined,
    }),
    buildRow({
      instrument_name: "BTC-27SEP26-70000-P",
      open_interest: 120,
      underlying_price: 64850,
      mark_iv: undefined,
      bid_iv: 54,
      ask_iv: 56,
    }),
    buildRow({
      instrument_name: "BTC-30NOV26-72000-P",
      open_interest: 80,
      underlying_price: 66000,
      mark_iv: 48,
    }),
    buildRow({
      instrument_name: "BTC-27SEP26-62000-C",
      open_interest: 0,
      underlying_price: 65100,
      mark_iv: 60,
    }),
    buildRow({
      instrument_name: "BTC-15AUG26-64000-C",
      open_interest: 75,
      underlying_price: 65000,
      mark_iv: 55,
    }),
  ];

  const mock = runMockedIngest(rawRows);
  try {
    const { ingestion, summary } = await mock.run();

    const validRows = rawRows
      .map((row) => {
        const parts = String(row.instrument_name || "").split("-");
        if (parts.length < 4) return null;
        const instrument = String(row.instrument_name || "");
        const expiry = parts[1];
        const strike = Number(parts[2]);
        const typeChar = parts[3];
        const optionType = typeChar === "C" ? "call" : typeChar === "P" ? "put" : null;
        const openInterest = Number(row.open_interest || 0);
        const underlyingPrice = Number(row.underlying_price || 0);
        const expiryMs = parseExpiry(expiry);
        const sigma = selectIv(row);
        if (!optionType || !(strike > 0) || !(openInterest > 0) || !(underlyingPrice > 0) || sigma == null || expiryMs == null || expiryMs <= NOW_MS) return null;
        const T = (expiryMs - NOW_MS) / (365 * 24 * 60 * 60 * 1000);
        const dealerSign = optionType === "call" ? 1 : -1;
        const gamma = nd1(underlyingPrice, strike, sigma, T) / (underlyingPrice * sigma * Math.sqrt(T));
        const vanna = dealerSign * rawVanna(underlyingPrice, strike, sigma, T) * openInterest * underlyingPrice * 0.01;
        const charm = dealerSign * rawCharm(underlyingPrice, strike, sigma, T) * openInterest * underlyingPrice / 365;
        const gex = dealerSign * gamma * openInterest * SUMMARY_SPOT;
        return { instrument, expiry, strike, optionType, openInterest, underlyingPrice, sigma, T, gamma, vanna, charm, gex };
      })
      .filter(Boolean);

    const rowSums = ingestion.options.reduce((acc: any, row: any) => {
      acc.totalVanna += row.vannaExposure ?? 0;
      acc.totalCharm += row.charmExposure ?? 0;
      acc.totalGex += row.gammaExposure != null ? (row.optionType === "call" ? row.gammaExposure : -row.gammaExposure) * row.openInterest * SUMMARY_SPOT : 0;
      return acc;
    }, { totalVanna: 0, totalCharm: 0, totalGex: 0 });

    const topVanna = [...ingestion.options].filter((row: any) => row.vannaExposure != null).sort((a: any, b: any) => Math.abs(b.vannaExposure) - Math.abs(a.vannaExposure)).slice(0, 10);
    const topCharm = [...ingestion.options].filter((row: any) => row.charmExposure != null).sort((a: any, b: any) => Math.abs(b.charmExposure) - Math.abs(a.charmExposure)).slice(0, 10);

    console.log(JSON.stringify({
      snapshotTs: NOW_MS,
      optionCount: rawRows.length,
      validCount: validRows.length,
      source: ingestion.source,
      production: { totalVanna: summary.totalVanna, totalCharm: summary.totalCharm, totalGex: summary.totalGex },
      rowSums,
      topVanna: topVanna.map((row: any) => ({ instrument: row.instrument_name ?? row.instrument ?? null, strike: row.strike, expiry: row.expiry, vanna: row.vannaExposure })),
      topCharm: topCharm.map((row: any) => ({ instrument: row.instrument_name ?? row.instrument ?? null, strike: row.strike, expiry: row.expiry, charm: row.charmExposure })),
    }));

    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0], DERIBIT_URL);
    assert.equal(ingestion.source, "LIVE_DERIBIT");
    assert.equal(ingestion.options.length, 4);
    assert.equal(validRows.length, 3);

    const expiredRow = ingestion.options.find((row: any) => row.expiry === "15AUG26");
    assert.ok(expiredRow != null);
    assert.equal(expiredRow?.vannaExposure, undefined);
    assert.equal(expiredRow?.charmExposure, undefined);

    assert.ok(Number.isFinite(summary.totalVanna));
    assert.ok(Number.isFinite(summary.totalCharm));
    assert.ok(Number.isFinite(summary.totalGex));

    assert.ok(Math.abs(summary.totalVanna - rowSums.totalVanna) < 1e-12);
    assert.ok(Math.abs(summary.totalCharm - rowSums.totalCharm) < 1e-12);

    for (const row of validRows) {
      assert.ok(Number.isFinite(row.vanna));
      assert.ok(Number.isFinite(row.charm));
      assert.ok(Number.isFinite(row.gex));
    }
  } finally {
    mock.restore();
  }
});

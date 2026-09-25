import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LeftSidebar } from "./LeftSidebar";
import type { KeyLevels } from "@shared/schema";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function renderLeftSidebar(levels: KeyLevels): string {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, queryFn: async () => undefined },
    },
  });
  queryClient.setQueryData(["/api/key-levels"], levels);

  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(LeftSidebar),
    ),
  );
}

function baseLevels(
  overrides: Partial<Pick<KeyLevels, "shortGammaPocketStart" | "shortGammaPocketEnd" | "deepRiskPocketStart" | "deepRiskPocketEnd">>,
): KeyLevels {
  return {
    id: 1,
    gammaMagnets: [85000, 90000, 95000],
    shortGammaPocketStart: null,
    shortGammaPocketEnd: null,
    deepRiskPocketStart: null,
    deepRiskPocketEnd: null,
    timestamp: new Date("2026-09-25T00:00:00.000Z"),
    ...overrides,
  };
}

test("LeftSidebar renders nullable KeyLevels as placeholders", () => {
  assert.doesNotThrow(() => {
    const html = renderLeftSidebar(baseLevels({}));
    assert.match(html, />SHORT GAMMA POCKET<\/div>[\s\S]*>--<\/div>/);
    assert.match(html, />DEEP RISK POCKET<\/div>[\s\S]*>--<\/div>/);
    assert.ok(html.includes("KEY LEVELS"), "KEY LEVELS panel rendered");
    assert.equal((html.match(/>--<\/div>/g) ?? []).length >= 2, true, "two unavailable ranges rendered");
  });
});

test("LeftSidebar renders numeric KeyLevels ranges", () => {
  const html = renderLeftSidebar(
    baseLevels({
      shortGammaPocketStart: 58000,
      shortGammaPocketEnd: 58800,
      deepRiskPocketStart: 55000,
      deepRiskPocketEnd: 55500,
    }),
  );

  assert.ok(html.includes("58.000") && html.includes("58.800"), "short gamma numeric range rendered");
  assert.ok(html.includes("55.000") && html.includes("55.500"), "deep risk numeric range rendered");
});

test("LeftSidebar preserves zero as a valid KeyLevels endpoint", () => {
  const html = renderLeftSidebar(
    baseLevels({
      shortGammaPocketStart: 0,
      shortGammaPocketEnd: 100,
      deepRiskPocketStart: 0,
      deepRiskPocketEnd: 100,
    }),
  );

  assert.match(html, /0 – 100/);
  assert.doesNotMatch(html, /SHORT GAMMA POCKET[\s\S]*>--<\/div>/);
  assert.doesNotMatch(html, /DEEP RISK POCKET[\s\S]*>--<\/div>/);
});

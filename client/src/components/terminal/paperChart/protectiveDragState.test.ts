import assert from "node:assert/strict";
import test from "node:test";
import { createProtectiveDragState } from "./protectiveDragState";

test("SL abort restores original trigger price and cannot commit", () => {
  const drag = createProtectiveDragState();
  assert.equal(drag.start(76000), true);
  assert.equal(drag.preview(75500), true);
  assert.equal(drag.abort(), true);
  assert.equal(drag.getState(), "ABORTED");
  assert.equal(drag.getOriginalPrice(), 76000);
  assert.equal(drag.getPreviewPrice(), 76000);
  assert.equal(drag.commit(75000), null);
});

test("TP abort restores original limit price and cannot commit", () => {
  const drag = createProtectiveDragState();
  assert.equal(drag.start(77000), true);
  assert.equal(drag.preview(77500), true);
  assert.equal(drag.abort(), true);
  assert.equal(drag.getState(), "ABORTED");
  assert.equal(drag.getOriginalPrice(), 77000);
  assert.equal(drag.getPreviewPrice(), 77000);
  assert.equal(drag.commit(78000), null);
});

test("abort is exclusive and repeated abort does nothing", () => {
  const drag = createProtectiveDragState();
  drag.start(100);
  assert.equal(drag.abort(), true);
  assert.equal(drag.abort(), false);
  assert.equal(drag.commit(101), null);
  assert.equal(drag.getState(), "ABORTED");
});

test("normal pointer-up commit remains available before abort", () => {
  const drag = createProtectiveDragState();
  drag.start(100);
  drag.preview(101);
  assert.equal(drag.commit(101), 101);
  assert.equal(drag.getState(), "COMMITTED");
  assert.equal(drag.abort(), false);
});

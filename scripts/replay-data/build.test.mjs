// Chạy: node --test   (trong scripts/replay-data)
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";
import { packCsv } from "./build.mjs";

/** Giải .bin như frontend/src/features/replay/engine/bundle.ts. */
function decode({ n, scales, gz }) {
  const buf = zlib.gunzipSync(gz);
  const raw = new Int32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  const acc = scales.map(() => 0);
  return Array.from({ length: n }, (_, i) => scales.map((s, k) => ((acc[k] += raw[k * n + i]), k === 0 ? acc[k] * 60000 : acc[k] / s)));
}

function csv(rows) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "replay-data-")), "X.csv");
  fs.writeFileSync(file, `time,open,high,low,close,volume\n${rows.map((r) => r.join(",")).join("\n")}\n`);
  return file;
}

const T0 = 1792360800000;

test("CME volumes above 2147 contracts survive packing (no Int32 wrap)", () => {
  const rows = [[T0, 29227, 29361.25, 29226, 29349.75, 14405], [T0 + 60000, 29353.5, 29389.5, 29351.75, 29365.75, 117], [T0 + 120000, 29365.75, 29370, 29360, 29362.25, 2148]];
  const packed = packCsv(csv(rows), -Infinity);
  assert.equal(packed.inexact, 0);
  assert.equal(packed.scales[5], 1000);
  assert.deepEqual(decode(packed), rows);
});

test("small fractional Dukascopy volumes keep six decimals", () => {
  const rows = [[T0, 21500.125, 21501, 21499.5, 21500.25, 0.07788], [T0 + 60000, 21500.25, 21502, 21500, 21501.5, 0.642]];
  const packed = packCsv(csv(rows), -Infinity);
  assert.equal(packed.scales[5], 1e6);
  assert.deepEqual(decode(packed), rows);
});

test("a value that cannot fit Int32 at any scale stops the build instead of writing wrong data", () => {
  assert.throws(() => packCsv(csv([[T0, 1, 1, 1, 1, 3e9]]), -Infinity), /does not fit Int32/);
});

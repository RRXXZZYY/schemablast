import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { demoSnapshots } from "../dist/index.js";

const cli = path.resolve("dist/cli.js");
const run = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });

test("CLI reports version and writes demo HTML", () => {
  assert.equal(run(["--version"]).stdout.trim(), "0.1.0");
  const root = mkdtempSync(path.join(tmpdir(), "schemablast-demo-"));
  try {
    const out = path.join(root, "demo.html");
    const result = run(["demo", "--out", out]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(out, "utf8"), /Know the blast radius/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("CLI validates snapshots and fails strict breaking diffs", () => {
  const root = mkdtempSync(path.join(tmpdir(), "schemablast-cli-"));
  try {
    const { before, after } = demoSnapshots();
    const beforePath = path.join(root, "before.json");
    const afterPath = path.join(root, "after.json");
    writeFileSync(beforePath, JSON.stringify(before), "utf8");
    writeFileSync(afterPath, JSON.stringify(after), "utf8");
    const valid = run(["validate", beforePath]);
    assert.equal(valid.status, 0, valid.stderr);
    assert.match(valid.stdout, /Valid snapshot/);
    const diff = run(["diff", beforePath, afterPath, "--strict"]);
    assert.equal(diff.status, 1, diff.stderr);
    assert.match(diff.stdout, /SB003/);
    const sarif = run(["diff", beforePath, afterPath, "--format", "sarif"]);
    assert.equal(JSON.parse(sarif.stdout).version, "2.1.0");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("CLI rejects malformed input", () => {
  const root = mkdtempSync(path.join(tmpdir(), "schemablast-bad-"));
  try {
    const file = path.join(root, "bad.json");
    writeFileSync(file, "{}", "utf8");
    const result = run(["validate", file]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /schemaVersion/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDemoReport,
  demoSnapshots,
  diffSnapshots,
  normalizeSnapshot,
  parseSnapshot,
  renderHtml,
  renderSarif,
} from "../dist/index.js";

function snapshot(fields, edges = []) {
  return {
    schemaVersion: "1.0",
    name: "snapshot",
    nodes: [
      { id: "data.users", kind: "dataset", owner: "identity", primaryKey: ["id"], fields: { id: { type: "string", nullable: false }, ...fields } },
      { id: "model.active_users", kind: "model", owner: "analytics" },
      { id: "dashboard.growth", kind: "dashboard", owner: "growth" },
    ],
    edges: edges.length ? edges : [
      { from: "data.users", to: "model.active_users", fields: ["status"] },
      { from: "model.active_users", to: "dashboard.growth" },
    ],
  };
}

test("demo finds three breaking changes, one addition, and owner-aware impact", () => {
  const report = createDemoReport();
  assert.deepEqual(report.summary, {
    errors: 3,
    warnings: 0,
    notes: 1,
    changedDatasets: 1,
    impactedNodes: 4,
    impactedOwners: ["analytics", "finance", "risk", "risk-platform"],
  });
  assert.deepEqual(report.findings.map((item) => item.ruleId), ["SB003", "SB002", "SB005", "SB006"]);
});

test("field-aware lineage only follows consumers that read the changed field", () => {
  const before = snapshot({ status: { type: "string", nullable: false }, email: { type: "string", nullable: false } });
  const after = structuredClone(before);
  after.name = "after";
  delete after.nodes[0].fields.email;
  const report = diffSnapshots(before, after);
  assert.equal(report.findings[0].field, "email");
  assert.equal(report.impacts.length, 0);
});

test("lineage traversal is cycle-safe and keeps the shortest path", () => {
  const before = snapshot({ status: { type: "string", nullable: false } }, [
    { from: "data.users", to: "model.active_users", fields: ["status"] },
    { from: "model.active_users", to: "dashboard.growth" },
    { from: "dashboard.growth", to: "model.active_users" },
  ]);
  const after = structuredClone(before);
  after.name = "after";
  after.nodes[0].fields.status.type = "integer";
  const report = diffSnapshots(before, after);
  assert.deepEqual(report.impacts.map((item) => item.path), [
    ["data.users", "model.active_users"],
    ["data.users", "model.active_users", "dashboard.growth"],
  ]);
});

test("integer to number is informational and does not propagate blast radius", () => {
  const before = snapshot({ status: { type: "integer", nullable: false } });
  const after = structuredClone(before);
  after.nodes[0].fields.status.type = "number";
  const report = diffSnapshots(before, after);
  assert.equal(report.findings[0].severity, "note");
  assert.equal(report.impacts.length, 0);
});

test("becoming nullable is breaking while becoming non-nullable is informational", () => {
  const before = snapshot({ status: { type: "string", nullable: false } });
  const nullable = structuredClone(before);
  nullable.nodes[0].fields.status.nullable = true;
  assert.equal(diffSnapshots(before, nullable).findings[0].severity, "error");
  assert.equal(diffSnapshots(nullable, before).findings[0].severity, "note");
});

test("enum ordering is ignored, narrowing breaks, and widening is informational", () => {
  const before = snapshot({ status: { type: "string", nullable: false, enum: ["A", "B"] } });
  const reordered = structuredClone(before);
  reordered.nodes[0].fields.status.enum = ["B", "A"];
  assert.equal(diffSnapshots(before, reordered).findings.length, 0);
  const narrowed = structuredClone(before);
  narrowed.nodes[0].fields.status.enum = ["A"];
  assert.equal(diffSnapshots(before, narrowed).findings[0].severity, "error");
  const widened = structuredClone(before);
  widened.nodes[0].fields.status.enum = ["A", "B", "C"];
  assert.equal(diffSnapshots(before, widened).findings[0].severity, "note");
});

test("primary key changes affect every downstream branch", () => {
  const before = snapshot({ tenant_id: { type: "string", nullable: false }, status: { type: "string", nullable: false } });
  const after = structuredClone(before);
  after.nodes[0].primaryKey = ["id", "tenant_id"];
  const report = diffSnapshots(before, after);
  assert.equal(report.findings[0].ruleId, "SB009");
  assert.equal(report.impacts.length, 2);
});

test("dataset removal and addition are reported", () => {
  const before = snapshot({ status: { type: "string", nullable: false } });
  const removed = structuredClone(before);
  removed.nodes = removed.nodes.filter((item) => item.id !== "data.users");
  removed.edges = [];
  const removal = diffSnapshots(before, removed);
  assert.equal(removal.findings[0].ruleId, "SB001");
  assert.equal(removal.impacts.length, 2);
  const addition = diffSnapshots(removed, before);
  assert.equal(addition.findings[0].ruleId, "SB007");
  assert.equal(addition.impacts.length, 0);
});

test("snapshot validation rejects malformed graphs", () => {
  const valid = snapshot({ status: { type: "string", nullable: false } });
  assert.throws(() => normalizeSnapshot({ ...valid, schemaVersion: "2.0" }), /schemaVersion/);
  assert.throws(() => normalizeSnapshot({ ...valid, nodes: [...valid.nodes, valid.nodes[0]] }), /Duplicate node/);
  assert.throws(() => normalizeSnapshot({ ...valid, edges: [{ from: "missing", to: "data.users" }] }), /unknown node/);
  const badKey = structuredClone(valid);
  badKey.nodes[0].primaryKey = ["missing"];
  assert.throws(() => normalizeSnapshot(badKey), /Primary key/);
  assert.throws(() => parseSnapshot("not-json"), /valid JSON/);
});

test("finding IDs are stable across runs", () => {
  const { before, after } = demoSnapshots();
  assert.deepEqual(diffSnapshots(before, after).findings.map((item) => item.id), diffSnapshots(before, after).findings.map((item) => item.id));
  assert.match(diffSnapshots(before, after).findings[0].id, /^[a-f0-9]{16}$/);
});

test("SARIF registers all rules and emits logical contract locations", () => {
  const sarif = JSON.parse(renderSarif(createDemoReport()));
  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs[0].tool.driver.rules.length, 9);
  assert.match(sarif.runs[0].results[0].locations[0].logicalLocations[0].fullyQualifiedName, /^warehouse\.orders/);
});

test("standalone HTML escapes snapshot text and contains no remote assets", () => {
  const before = snapshot({ status: { type: "string", nullable: false } });
  const after = structuredClone(before);
  after.name = "<script>alert(1)</script>";
  after.nodes[0].fields.status.type = "integer";
  const html = renderHtml(diffSnapshots(before, after));
  assert.match(html, /^<!doctype html>/);
  assert.equal(html.includes("<script>alert(1)</script>"), false);
  assert.equal(/<(?:link|script|img)[^>]+(?:src|href)=["']https?:/i.test(html), false);
});

import { createHash } from "node:crypto";
import { normalizeSnapshot } from "./snapshot.js";
import type { BlastReport, ContractFinding, ContractNode, ContractSnapshot, ImpactPath, LineageEdge, Severity } from "./types.js";

function stableId(ruleId: string, dataset: string, field = ""): string {
  return createHash("sha256").update(`${ruleId}\n${dataset}\n${field}`).digest("hex").slice(0, 16);
}

function finding(ruleId: string, severity: Severity, title: string, message: string, dataset: string, field?: string, before?: unknown, after?: unknown): ContractFinding {
  return {
    id: stableId(ruleId, dataset, field),
    ruleId,
    severity,
    title,
    message,
    dataset,
    ...(field ? { field } : {}),
    ...(before !== undefined ? { before } : {}),
    ...(after !== undefined ? { after } : {}),
  };
}

function equalList(left: string[] | undefined, right: string[] | undefined): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

function equalSet(left: string[] | undefined, right: string[] | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.length === right.length && left.every((value) => right.includes(value));
}

function datasetFindings(before: ContractNode | undefined, after: ContractNode | undefined): ContractFinding[] {
  if (before && !after) return [finding("SB001", "error", "Dataset removed", `${before.id} no longer exists.`, before.id)];
  if (!before && after) return [finding("SB007", "note", "Dataset added", `${after.id} is new.`, after.id)];
  if (!before || !after) return [];
  const findings: ContractFinding[] = [];
  if (before.owner !== after.owner) findings.push(finding("SB008", "note", "Dataset owner changed", `${before.id} owner changed from ${before.owner} to ${after.owner}.`, before.id, undefined, before.owner, after.owner));
  if (!equalList(before.primaryKey, after.primaryKey)) findings.push(finding("SB009", "error", "Primary key changed", `${before.id} primary key changed.`, before.id, undefined, before.primaryKey ?? [], after.primaryKey ?? []));
  const beforeFields = before.fields ?? {};
  const afterFields = after.fields ?? {};
  const names = [...new Set([...Object.keys(beforeFields), ...Object.keys(afterFields)])].sort((a, b) => a.localeCompare(b));
  for (const name of names) {
    const oldField = beforeFields[name];
    const newField = afterFields[name];
    if (oldField && !newField) {
      findings.push(finding("SB002", "error", "Field removed", `${before.id}.${name} was removed.`, before.id, name, oldField, undefined));
      continue;
    }
    if (!oldField && newField) {
      findings.push(finding("SB006", "note", "Field added", `${before.id}.${name} was added.`, before.id, name, undefined, newField));
      continue;
    }
    if (!oldField || !newField) continue;
    if (oldField.type !== newField.type) {
      const widening = oldField.type === "integer" && newField.type === "number";
      findings.push(finding(
        "SB003",
        widening ? "note" : "error",
        widening ? "Numeric type widened" : "Field type changed",
        `${before.id}.${name} type changed from ${oldField.type} to ${newField.type}.`,
        before.id,
        name,
        oldField.type,
        newField.type,
      ));
    }
    if (oldField.nullable !== newField.nullable) {
      const weakened = !oldField.nullable && newField.nullable;
      findings.push(finding(
        "SB004",
        weakened ? "error" : "note",
        weakened ? "Field became nullable" : "Field became non-nullable",
        `${before.id}.${name} nullable changed from ${oldField.nullable} to ${newField.nullable}.`,
        before.id,
        name,
        oldField.nullable,
        newField.nullable,
      ));
    }
    const oldEnum = oldField.enum;
    const newEnum = newField.enum;
    if (!equalSet(oldEnum, newEnum)) {
      const oldSet = new Set(oldEnum ?? []);
      const newSet = new Set(newEnum ?? []);
      const narrowed = oldEnum === undefined ? newEnum !== undefined : newEnum !== undefined && [...oldSet].some((value) => !newSet.has(value));
      findings.push(finding(
        "SB005",
        narrowed ? "error" : "note",
        narrowed ? "Enum narrowed" : "Enum widened",
        `${before.id}.${name} allowed values changed.`,
        before.id,
        name,
        oldEnum ?? null,
        newEnum ?? null,
      ));
    }
  }
  return findings;
}

function graphUnion(before: ContractSnapshot, after: ContractSnapshot): { nodes: Map<string, ContractNode>; edges: LineageEdge[] } {
  const nodes = new Map<string, ContractNode>();
  for (const item of [...before.nodes, ...after.nodes]) nodes.set(item.id, item);
  const edges = new Map<string, LineageEdge>();
  for (const item of [...before.edges, ...after.edges]) {
    const key = `${item.from}\u0000${item.to}\u0000${(item.fields ?? []).join("\u0000")}`;
    edges.set(key, item);
  }
  return { nodes, edges: [...edges.values()] };
}

function traceImpacts(findings: ContractFinding[], before: ContractSnapshot, after: ContractSnapshot): ImpactPath[] {
  const graph = graphUnion(before, after);
  const outgoing = new Map<string, LineageEdge[]>();
  for (const edge of graph.edges) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge);
    outgoing.set(edge.from, list);
  }
  const impacts: ImpactPath[] = [];
  for (const change of findings.filter((item) => item.severity !== "note")) {
    const queue: Array<{ node: string; path: string[]; distance: number }> = [{ node: change.dataset, path: [change.dataset], distance: 0 }];
    const visited = new Set<string>([change.dataset]);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of outgoing.get(current.node) ?? []) {
        if (current.distance === 0 && change.field && edge.fields && !edge.fields.includes(change.field)) continue;
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);
        const path = [...current.path, edge.to];
        const node = graph.nodes.get(edge.to);
        if (!node) continue;
        impacts.push({ findingId: change.id, nodeId: node.id, kind: node.kind, owner: node.owner, distance: current.distance + 1, path });
        queue.push({ node: node.id, path, distance: current.distance + 1 });
      }
    }
  }
  return impacts.sort((left, right) => left.findingId.localeCompare(right.findingId) || left.distance - right.distance || left.nodeId.localeCompare(right.nodeId));
}

function severityOrder(value: Severity): number {
  return value === "error" ? 0 : value === "warning" ? 1 : 2;
}

export function diffSnapshots(beforeInput: ContractSnapshot, afterInput: ContractSnapshot): BlastReport {
  const before = normalizeSnapshot(beforeInput);
  const after = normalizeSnapshot(afterInput);
  const beforeDatasets = new Map(before.nodes.filter((item) => item.kind === "dataset").map((item) => [item.id, item]));
  const afterDatasets = new Map(after.nodes.filter((item) => item.kind === "dataset").map((item) => [item.id, item]));
  const ids = [...new Set([...beforeDatasets.keys(), ...afterDatasets.keys()])].sort((a, b) => a.localeCompare(b));
  const findings = ids.flatMap((id) => datasetFindings(beforeDatasets.get(id), afterDatasets.get(id)))
    .sort((left, right) => severityOrder(left.severity) - severityOrder(right.severity) || left.dataset.localeCompare(right.dataset) || (left.field ?? "").localeCompare(right.field ?? "") || left.ruleId.localeCompare(right.ruleId));
  const impacts = traceImpacts(findings, before, after);
  return {
    schemaVersion: "1.0",
    beforeName: before.name,
    afterName: after.name,
    findings,
    impacts,
    summary: {
      errors: findings.filter((item) => item.severity === "error").length,
      warnings: findings.filter((item) => item.severity === "warning").length,
      notes: findings.filter((item) => item.severity === "note").length,
      changedDatasets: new Set(findings.map((item) => item.dataset)).size,
      impactedNodes: new Set(impacts.map((item) => item.nodeId)).size,
      impactedOwners: [...new Set(impacts.map((item) => item.owner))].sort((a, b) => a.localeCompare(b)),
    },
  };
}

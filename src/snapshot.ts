import { readFileSync, statSync } from "node:fs";
import type { ContractNode, ContractSnapshot, FieldContract, LineageEdge, NodeKind } from "./types.js";

export const VERSION = "0.1.0";
export const MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024;
export const MAX_NODES = 5_000;
export const MAX_EDGES = 10_000;
export const MAX_FIELDS = 100_000;
const KINDS = new Set<NodeKind>(["dataset", "model", "job", "dashboard", "api", "feature", "report"]);

function object(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
}

function text(value: unknown, label: string, maximum = 200): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > maximum || /[\u0000-\u001f]/.test(value)) {
    throw new TypeError(`${label} must be a non-empty string up to ${maximum} characters without control characters.`);
  }
  return value;
}

function stringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  const output = value.map((item, index) => text(item, `${label}[${index}]`));
  if (new Set(output).size !== output.length) throw new TypeError(`${label} contains duplicates.`);
  return output;
}

function field(value: unknown, label: string): FieldContract {
  object(value, label);
  const type = text(value.type, `${label}.type`, 100);
  if (typeof value.nullable !== "boolean") throw new TypeError(`${label}.nullable must be boolean.`);
  const output: FieldContract = { type, nullable: value.nullable };
  if (value.enum !== undefined) output.enum = stringList(value.enum, `${label}.enum`);
  if (value.description !== undefined) output.description = text(value.description, `${label}.description`, 2_000);
  return output;
}

function node(value: unknown, index: number): ContractNode {
  object(value, `nodes[${index}]`);
  const kind = value.kind as NodeKind;
  if (!KINDS.has(kind)) throw new TypeError(`nodes[${index}].kind is unsupported.`);
  const output: ContractNode = {
    id: text(value.id, `nodes[${index}].id`),
    kind,
    owner: text(value.owner, `nodes[${index}].owner`),
  };
  if (value.description !== undefined) output.description = text(value.description, `nodes[${index}].description`, 2_000);
  if (value.fields !== undefined) {
    object(value.fields, `nodes[${index}].fields`);
    output.fields = {};
    for (const key of Object.keys(value.fields).sort((a, b) => a.localeCompare(b))) {
      text(key, `nodes[${index}].field name`);
      Object.defineProperty(output.fields, key, { value: field(value.fields[key], `nodes[${index}].fields.${key}`), enumerable: true, writable: true, configurable: true });
    }
  }
  if (value.primaryKey !== undefined) output.primaryKey = stringList(value.primaryKey, `nodes[${index}].primaryKey`);
  return output;
}

function edge(value: unknown, index: number): LineageEdge {
  object(value, `edges[${index}]`);
  const output: LineageEdge = {
    from: text(value.from, `edges[${index}].from`),
    to: text(value.to, `edges[${index}].to`),
  };
  if (value.fields !== undefined) output.fields = stringList(value.fields, `edges[${index}].fields`);
  return output;
}

export function normalizeSnapshot(value: unknown): ContractSnapshot {
  object(value, "Snapshot");
  if (value.schemaVersion !== "1.0") throw new TypeError("Unsupported snapshot schemaVersion; expected 1.0.");
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) throw new TypeError("Snapshot nodes and edges must be arrays.");
  if (value.nodes.length > MAX_NODES) throw new TypeError(`Snapshot exceeds ${MAX_NODES} nodes.`);
  if (value.edges.length > MAX_EDGES) throw new TypeError(`Snapshot exceeds ${MAX_EDGES} edges.`);
  const nodes = value.nodes.map(node);
  const ids = new Set<string>();
  let fields = 0;
  for (const item of nodes) {
    if (ids.has(item.id)) throw new TypeError(`Duplicate node id: ${item.id}`);
    ids.add(item.id);
    fields += Object.keys(item.fields ?? {}).length;
    if (item.primaryKey) {
      for (const key of item.primaryKey) {
        if (!item.fields?.[key]) throw new TypeError(`Primary key ${item.id}.${key} is not declared in fields.`);
      }
    }
  }
  if (fields > MAX_FIELDS) throw new TypeError(`Snapshot exceeds ${MAX_FIELDS} fields.`);
  const edges = value.edges.map(edge);
  const edgeKeys = new Set<string>();
  for (const item of edges) {
    if (!ids.has(item.from) || !ids.has(item.to)) throw new TypeError(`Lineage edge references an unknown node: ${item.from} -> ${item.to}`);
    const key = `${item.from}\u0000${item.to}\u0000${(item.fields ?? []).join("\u0000")}`;
    if (edgeKeys.has(key)) throw new TypeError(`Duplicate lineage edge: ${item.from} -> ${item.to}`);
    edgeKeys.add(key);
  }
  return { schemaVersion: "1.0", name: text(value.name, "Snapshot name"), nodes, edges };
}

export function parseSnapshot(content: string): ContractSnapshot {
  if (Buffer.byteLength(content) > MAX_SNAPSHOT_BYTES) throw new TypeError(`Snapshot exceeds ${MAX_SNAPSHOT_BYTES} bytes.`);
  let value: unknown;
  try { value = JSON.parse(content); } catch (error) {
    throw new TypeError(`Snapshot is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return normalizeSnapshot(value);
}

export function readSnapshot(filename: string): ContractSnapshot {
  if (statSync(filename).size > MAX_SNAPSHOT_BYTES) throw new TypeError(`Snapshot exceeds ${MAX_SNAPSHOT_BYTES} bytes.`);
  return parseSnapshot(readFileSync(filename, "utf8"));
}

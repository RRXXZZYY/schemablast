export type NodeKind = "dataset" | "model" | "job" | "dashboard" | "api" | "feature" | "report";
export type Severity = "error" | "warning" | "note";

export interface FieldContract {
  type: string;
  nullable: boolean;
  enum?: string[];
  description?: string;
}

export interface ContractNode {
  id: string;
  kind: NodeKind;
  owner: string;
  description?: string;
  fields?: Record<string, FieldContract>;
  primaryKey?: string[];
}

export interface LineageEdge {
  from: string;
  to: string;
  fields?: string[];
}

export interface ContractSnapshot {
  schemaVersion: "1.0";
  name: string;
  nodes: ContractNode[];
  edges: LineageEdge[];
}

export interface ContractFinding {
  id: string;
  ruleId: string;
  severity: Severity;
  title: string;
  message: string;
  dataset: string;
  field?: string;
  before?: unknown;
  after?: unknown;
}

export interface ImpactPath {
  findingId: string;
  nodeId: string;
  kind: NodeKind;
  owner: string;
  distance: number;
  path: string[];
}

export interface BlastReport {
  schemaVersion: "1.0";
  beforeName: string;
  afterName: string;
  findings: ContractFinding[];
  impacts: ImpactPath[];
  summary: {
    errors: number;
    warnings: number;
    notes: number;
    changedDatasets: number;
    impactedNodes: number;
    impactedOwners: string[];
  };
}

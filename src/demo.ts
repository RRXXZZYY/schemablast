import { diffSnapshots } from "./diff.js";
import type { BlastReport, ContractSnapshot } from "./types.js";

function commonNodes() {
  return [
    { id: "model.daily_revenue", kind: "model" as const, owner: "analytics" },
    { id: "dashboard.finance_overview", kind: "dashboard" as const, owner: "finance" },
    { id: "feature.customer_risk", kind: "feature" as const, owner: "risk" },
    { id: "api.risk_score", kind: "api" as const, owner: "risk-platform" },
    { id: "job.order_archive", kind: "job" as const, owner: "data-platform" },
  ];
}

function commonEdges() {
  return [
    { from: "warehouse.orders", to: "model.daily_revenue", fields: ["amount", "status", "created_at"] },
    { from: "model.daily_revenue", to: "dashboard.finance_overview" },
    { from: "warehouse.orders", to: "feature.customer_risk", fields: ["customer_id", "status"] },
    { from: "feature.customer_risk", to: "api.risk_score" },
    { from: "warehouse.orders", to: "job.order_archive", fields: ["created_at"] },
  ];
}

export function demoSnapshots(): { before: ContractSnapshot; after: ContractSnapshot } {
  const before: ContractSnapshot = {
    schemaVersion: "1.0",
    name: "main@baseline",
    nodes: [{
      id: "warehouse.orders",
      kind: "dataset",
      owner: "checkout",
      primaryKey: ["id"],
      fields: {
        id: { type: "string", nullable: false },
        customer_id: { type: "string", nullable: false },
        amount: { type: "number", nullable: false },
        status: { type: "string", nullable: false, enum: ["PENDING", "PAID", "REFUNDED"] },
        created_at: { type: "timestamp", nullable: false },
      },
    }, ...commonNodes()],
    edges: commonEdges(),
  };
  const after: ContractSnapshot = {
    schemaVersion: "1.0",
    name: "pull-request@candidate",
    nodes: [{
      id: "warehouse.orders",
      kind: "dataset",
      owner: "checkout",
      primaryKey: ["id"],
      fields: {
        id: { type: "string", nullable: false },
        amount: { type: "string", nullable: false },
        status: { type: "string", nullable: false, enum: ["PENDING", "PAID"] },
        created_at: { type: "timestamp", nullable: false },
        currency: { type: "string", nullable: true },
      },
    }, ...commonNodes()],
    edges: commonEdges(),
  };
  return { before, after };
}

export function createDemoReport(): BlastReport {
  const { before, after } = demoSnapshots();
  return diffSnapshots(before, after);
}

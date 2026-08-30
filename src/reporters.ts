import type { BlastReport, ContractFinding, ImpactPath, Severity } from "./types.js";

export function renderPretty(report: BlastReport): string {
  const lines = [
    `SchemaBlast: ${report.beforeName} → ${report.afterName}`,
    "────────────────────────────────────────────────────────────",
  ];
  if (report.findings.length === 0) lines.push("  ✓ No contract changes.");
  for (const item of report.findings) {
    const marker = item.severity === "error" ? "x" : item.severity === "warning" ? "!" : "i";
    const target = `${item.dataset}${item.field ? `.${item.field}` : ""}`;
    const impacts = report.impacts.filter((impact) => impact.findingId === item.id);
    lines.push(`  [${marker}] ${item.ruleId} ${item.title} · ${target}`);
    lines.push(`      ${item.message}`);
    if (impacts.length > 0) {
      lines.push(`      blast: ${impacts.length} node(s)`);
      for (const impact of impacts.slice(0, 4)) lines.push(`      ↳ ${impact.path.join(" → ")} · @${impact.owner}`);
      if (impacts.length > 4) lines.push(`      ↳ +${impacts.length - 4} more`);
    }
  }
  const s = report.summary;
  lines.push(`\n${s.errors} errors · ${s.warnings} warnings · ${s.notes} notes · ${s.impactedNodes} impacted nodes · ${s.impactedOwners.length} owners`);
  return `${lines.join("\n")}\n`;
}

export function renderJson(report: BlastReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

const RULES = [
  ["SB001", "dataset-removed", "A dataset was removed."],
  ["SB002", "field-removed", "A field was removed."],
  ["SB003", "type-changed", "A field type changed."],
  ["SB004", "nullability-changed", "Field nullability changed."],
  ["SB005", "enum-changed", "Allowed enum values changed."],
  ["SB006", "field-added", "A field was added."],
  ["SB007", "dataset-added", "A dataset was added."],
  ["SB008", "owner-changed", "Dataset ownership changed."],
  ["SB009", "primary-key-changed", "The primary key changed."],
] as const;

export function renderSarif(report: BlastReport): string {
  const document = {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{
      tool: { driver: {
        name: "SchemaBlast",
        version: "0.1.0",
        informationUri: "https://github.com/RRXXZZYY/schemablast",
        rules: RULES.map(([id, name, description]) => ({ id, name, shortDescription: { text: description } })),
      } },
      results: report.findings.map((item) => ({
        ruleId: item.ruleId,
        level: item.severity,
        message: { text: `${item.message} Impacted nodes: ${report.impacts.filter((impact) => impact.findingId === item.id).length}.` },
        locations: [{
          physicalLocation: { artifactLocation: { uri: "current.snapshot.json" } },
          logicalLocations: [{ fullyQualifiedName: `${item.dataset}${item.field ? `.${item.field}` : ""}` }],
        }],
        partialFingerprints: { schemablastFinding: item.id },
      })),
    }],
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

function escapeHtml(value: unknown): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function severityClass(severity: Severity): string {
  return severity === "error" ? "breaking" : severity === "warning" ? "risk" : "info";
}

function impactRows(impacts: ImpactPath[]): string {
  if (impacts.length === 0) return `<div class="no-impact">No downstream consumer path for this informational change.</div>`;
  return impacts.slice(0, 8).map((impact) => `<div class="impact"><div class="distance">${impact.distance}</div><div><strong>${escapeHtml(impact.nodeId)}</strong><small>${escapeHtml(impact.kind)} · @${escapeHtml(impact.owner)}</small><code>${impact.path.map(escapeHtml).join(" → ")}</code></div></div>`).join("");
}

function changeCard(item: ContractFinding, impacts: ImpactPath[]): string {
  const target = `${item.dataset}${item.field ? `.${item.field}` : ""}`;
  return `<article class="change ${severityClass(item.severity)}"><div class="change-head"><span class="rule">${item.ruleId}</span><span class="severity">${item.severity}</span><span class="count">${impacts.length} downstream</span></div><h3>${escapeHtml(item.title)}</h3><code class="target">${escapeHtml(target)}</code><p>${escapeHtml(item.message)}</p><div class="impact-list">${impactRows(impacts)}</div></article>`;
}

export function renderHtml(report: BlastReport): string {
  const breaking = report.findings.filter((item) => item.severity !== "note");
  const information = report.findings.filter((item) => item.severity === "note");
  const cards = [...breaking, ...information].map((item) => changeCard(item, report.impacts.filter((impact) => impact.findingId === item.id))).join("");
  const owners = report.summary.impactedOwners.length > 0
    ? report.summary.impactedOwners.map((owner) => `<span>@${escapeHtml(owner)}</span>`).join("")
    : `<span>none</span>`;
  const data = JSON.stringify(report).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>SchemaBlast · ${escapeHtml(report.beforeName)} vs ${escapeHtml(report.afterName)}</title><style>
:root{--bg:#090b10;--panel:#121722;--line:#2b3342;--text:#f4f6fa;--muted:#97a2b3;--red:#ff667a;--amber:#ffbd63;--blue:#70a6ff;--cyan:#55dacf;--purple:#a58aff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 86% 0,#22203d 0,transparent 31%),radial-gradient(circle at 4% 15%,#173439 0,transparent 27%),var(--bg);color:var(--text);font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:1180px;margin:auto;padding:52px 27px 76px}.eyebrow{color:var(--cyan);font:750 11px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.17em}header{display:grid;grid-template-columns:1fr 410px;gap:36px;align-items:end;margin-bottom:28px}h1{font-size:clamp(42px,6vw,72px);line-height:.95;letter-spacing:-.055em;margin:13px 0 15px}h1 span{color:var(--muted)}.subtitle{color:#b5bfcc;font-size:16px;max-width:650px}.summary{background:linear-gradient(145deg,#151b28,#0d1119);border:1px solid var(--line);border-radius:18px;padding:19px}.route{display:flex;align-items:center;gap:10px;color:var(--muted);font:11px ui-monospace,monospace}.route b{color:var(--text);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.route i{color:var(--cyan);font-style:normal;flex:0 0 auto}.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:15px}.summary-grid div{background:#090e15;border-radius:10px;padding:11px}.summary-grid b{display:block;font-size:24px}.summary-grid small{color:var(--muted);font-size:10px}.owner-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#0d121a;border:1px solid var(--line);border-radius:12px;padding:11px 13px;margin-bottom:16px}.owner-bar>small{color:var(--muted);font:700 10px ui-monospace,monospace;letter-spacing:.09em;margin-right:3px}.owner-bar span{background:#1a2331;color:#cbd6e5;border-radius:999px;padding:5px 9px;font:11px ui-monospace,monospace}.changes{display:grid;grid-template-columns:1fr 1fr;gap:13px}.change{background:rgba(18,23,34,.96);border:1px solid var(--line);border-top:3px solid var(--blue);border-radius:15px;padding:17px}.change.breaking{border-top-color:var(--red)}.change.risk{border-top-color:var(--amber)}.change-head{display:flex;align-items:center;gap:7px}.rule,.severity,.count{font:750 9px ui-monospace,monospace;letter-spacing:.09em;text-transform:uppercase;border-radius:999px;padding:4px 7px}.rule{background:#182941;color:var(--blue)}.severity{background:#35202a;color:var(--red)}.info .severity{background:#192c40;color:var(--blue)}.count{margin-left:auto;color:var(--muted);background:#0b1017}.change h3{font-size:19px;margin:12px 0 3px}.target{color:var(--cyan);font:12px ui-monospace,monospace}.change>p{color:var(--muted);margin:8px 0 13px}.impact-list{border-top:1px solid var(--line);padding-top:10px}.impact{display:grid;grid-template-columns:25px 1fr;gap:10px;padding:7px 0}.impact+.impact{border-top:1px solid #202735}.distance{width:23px;height:23px;border-radius:50%;display:grid;place-items:center;background:#28203c;color:var(--purple);font:bold 10px ui-monospace,monospace}.impact strong{display:block;font:700 12px ui-monospace,monospace}.impact small{display:block;color:var(--muted);font-size:10px}.impact code{display:block;color:#7f90a7;font:9px ui-monospace,monospace;margin-top:3px;overflow-wrap:anywhere}.no-impact{color:var(--muted);font-size:11px;padding:7px 0}footer{display:flex;justify-content:space-between;gap:15px;color:var(--muted);font-size:11px;margin-top:24px;padding-top:16px;border-top:1px solid var(--line)}@media(max-width:850px){header,.changes{grid-template-columns:1fr}.summary{max-width:none}main{padding:34px 16px 60px}}
</style></head><body><main><header><div><div class="eyebrow">DATA CONTRACTS WITH CONSEQUENCES</div><h1>Know the blast radius <span>before merge.</span></h1><div class="subtitle">Turn a schema diff into an owner-aware map of models, jobs, dashboards, features, and APIs that may need attention.</div></div><div class="summary"><div class="route"><b>${escapeHtml(report.beforeName)}</b><i>→</i><b>${escapeHtml(report.afterName)}</b></div><div class="summary-grid"><div><b>${report.summary.errors}</b><small>BREAKING</small></div><div><b>${report.summary.impactedNodes}</b><small>NODES</small></div><div><b>${report.summary.impactedOwners.length}</b><small>OWNERS</small></div></div></div></header><div class="owner-bar"><small>REVIEW ROUTE</small>${owners}</div><section class="changes">${cards || `<div class="no-impact">No contract changes.</div>`}</section><footer><span>Generated locally by SchemaBlast · explicit lineage only</span><span>${report.summary.changedDatasets} changed dataset(s) · schema ${report.schemaVersion}</span></footer></main><script type="application/json" id="schemablast-data">${data}</script></body></html>`;
}

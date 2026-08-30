#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createDemoReport } from "./demo.js";
import { diffSnapshots } from "./diff.js";
import { renderHtml, renderJson, renderPretty, renderSarif } from "./reporters.js";
import { readSnapshot, VERSION } from "./snapshot.js";
import type { BlastReport } from "./types.js";

type Command = "diff" | "validate" | "demo" | "help" | "version";
type Format = "pretty" | "json" | "html" | "sarif";

interface Args {
  command: Command;
  files: string[];
  format: Format;
  out?: string;
  strict: boolean;
}

function help(): string {
  return `SchemaBlast ${VERSION} — data contract compatibility plus lineage blast radius.

Usage:
  schemablast diff <before.json> <after.json> [options]
  schemablast validate <snapshot.json>
  schemablast demo [--out schemablast-demo.html]

Options:
  --format <type>  pretty, json, html, or sarif
  --out <file>     write output to a file
  --strict         exit 1 on errors or warnings
  -h, --help       show help
  -v, --version    show version
`;
}

function next(argv: string[], index: number): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${argv[index]} requires a value.`);
  return value;
}

function parse(argv: string[]): Args {
  if (argv.includes("--help") || argv.includes("-h")) return { command: "help", files: [], format: "pretty", strict: false };
  if (argv.includes("--version") || argv.includes("-v")) return { command: "version", files: [], format: "pretty", strict: false };
  const first = argv[0];
  const command: Command = first === "diff" || first === "validate" || first === "demo" ? first : "help";
  const files: string[] = [];
  let format: Format = command === "demo" ? "html" : "pretty";
  let out: string | undefined;
  let strict = false;
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--format") {
      const value = next(argv, index) as Format;
      if (!["pretty", "json", "html", "sarif"].includes(value)) throw new Error(`Unknown format: ${value}`);
      format = value; index += 1;
    } else if (arg === "--out") { out = next(argv, index); index += 1;
    } else if (arg === "--strict") strict = true;
    else if (arg?.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else if (arg) files.push(arg);
  }
  return { command, files, format, ...(out ? { out } : {}), strict };
}

function write(content: string, destination?: string): void {
  if (!destination || destination === "-") { process.stdout.write(content); return; }
  const absolute = path.resolve(destination);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
  process.stdout.write(`Wrote ${destination}\n`);
}

function render(report: BlastReport, format: Format): string {
  if (format === "json") return renderJson(report);
  if (format === "html") return renderHtml(report);
  if (format === "sarif") return renderSarif(report);
  return renderPretty(report);
}

export function main(argv = process.argv.slice(2)): number {
  try {
    const args = parse(argv);
    if (args.command === "help") { process.stdout.write(help()); return 0; }
    if (args.command === "version") { process.stdout.write(`${VERSION}\n`); return 0; }
    if (args.command === "demo") { write(render(createDemoReport(), args.format), args.out); return 0; }
    if (args.command === "validate") {
      if (args.files.length !== 1) throw new Error("validate requires one snapshot file.");
      const snapshot = readSnapshot(args.files[0]!);
      write(`Valid snapshot: ${snapshot.name} · ${snapshot.nodes.length} nodes · ${snapshot.edges.length} edges\n`, args.out);
      return 0;
    }
    if (args.files.length !== 2) throw new Error("diff requires before and after snapshot files.");
    const report = diffSnapshots(readSnapshot(args.files[0]!), readSnapshot(args.files[1]!));
    write(render(report, args.format), args.out);
    return args.strict && (report.summary.errors > 0 || report.summary.warnings > 0) ? 1 : 0;
  } catch (error) {
    process.stderr.write(`schemablast: ${error instanceof Error ? error.message : String(error)}\nRun "schemablast --help" for usage.\n`);
    return 2;
  }
}

process.exitCode = main();

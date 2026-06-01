import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildQualityCommandPlan,
  checkArchitectureBoundaries,
  checkFileSizeThreshold,
  checkGoFormatOutput,
  checkNoRuntimeTodoMarkers,
  checkRustFormatResult,
  collectSourceFiles,
  runQualityGate,
} from "./quality-gate.mjs";

describe("strict quality gate", () => {
  it("rejects oversized source files", () => {
    const files = [
      { path: "services/identity-access-gateway/internal/usecase/huge.go", text: "x\n".repeat(801) },
    ];

    const findings = checkFileSizeThreshold(files, { maxLines: 800 });

    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /huge\.go/);
  });

  it("rejects runtime TODO markers", () => {
    const files = [
      { path: "services/identity-access-gateway/internal/usecase/identity.go", text: "package usecase\n// TODO wire later\n" },
      { path: "docs/sdd/0001-example.md", text: "TODO in design text is not runtime code\n" },
    ];

    const findings = checkNoRuntimeTodoMarkers(files);

    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /identity\.go:2/);
  });

  it("rejects inner layer imports of HTTP, PostgreSQL, or adapter packages", () => {
    const files = [
      {
        path: "services/identity-access-gateway/internal/usecase/identity.go",
        text: `package usecase

import (
  "net/http"
  "ita-refactor/services/identity-access-gateway/internal/adapter/postgres"
)
`,
      },
    ];

    const findings = checkArchitectureBoundaries(files);

    assert.equal(findings.length, 2);
    assert.match(findings.map((finding) => finding.message).join("\n"), /net\/http/);
    assert.match(findings.map((finding) => finding.message).join("\n"), /internal\/adapter/);
  });

  it("plans tests, vet, contract audits, and connection budgets", () => {
    const plan = buildQualityCommandPlan();
    const commands = plan.map((command) => command.name);

    assert.deepEqual(commands, [
      "go vet",
      "cargo test",
      "identity session runtime audit",
      "identity access contract audit",
      "student app flow audit",
      "agent harness flow audit",
      "workflow plugin flow audit",
      "workflow plugin registry admission",
      "workflow plugin revision feedback",
      "AI worker job contract audit",
      "knowledge access policy audit",
      "AI worker job admission audit",
      "knowledge retrieval benchmark audit",
      "AI worker runtime dependency audit",
      "pgbouncer current performance profile audit",
      "conversation fanout decision audit",
      "conversation client trace attribution audit",
      "conversation transport profile decision audit",
      "conversation loadgen runtime decision audit",
      "root workflow coverage audit",
      "cross-module DB/queue diagnostics audit",
      "pgbouncer production headroom audit",
      "root SLO promotion review audit",
      "system capacity claim audit",
      "performance evidence registry audit",
      "direct-limited connection budget",
      "pgbouncer connection budget",
      "npm test",
    ]);
    const goVet = plan.find((command) => command.name === "go vet");
    assert(goVet.args.includes("./services/teaching-archive-gateway/..."));
  });

  it("rejects gofmt drift", () => {
    const findings = checkGoFormatOutput("services/identity-access-gateway/internal/usecase/identity.go\n");

    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /gofmt/);
  });

  it("rejects rustfmt drift", () => {
    const findings = checkRustFormatResult({ status: 1 });

    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /rustfmt/);
  });

  it("ignores Rust target build output during source collection", () => {
    const root = testRoot();
    mkdirSync(join(root, "services", "agent-harness", "target"), { recursive: true });
    mkdirSync(join(root, "services", "agent-harness", "src"), { recursive: true });
    writeFileSync(join(root, "services", "agent-harness", "target", "generated.rs"), "TODO generated\n");
    writeFileSync(join(root, "services", "agent-harness", "src", "lib.rs"), "pub fn ok() {}\n");

    const files = collectSourceFiles(root).map((file) => file.path);

    assert(files.includes("services/agent-harness/src/lib.rs"));
    assert(!files.includes("services/agent-harness/target/generated.rs"));
  });

  it("writes an in-progress quality context before running command checks", () => {
    const root = testRoot();
    const reportPath = join(root, "reports", "quality-gate.current.json");
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify({ status: "FAILED", allPassed: false })}\n`);

    const probe = [
      "const fs = require('node:fs');",
      "const report = JSON.parse(fs.readFileSync('reports/quality-gate.current.json', 'utf8'));",
      "if (process.env.ITA_QUALITY_GATE_IN_PROGRESS !== '1') process.exit(10);",
      "if (report.status !== 'IN_PROGRESS') process.exit(11);",
      "if (report.allPassed !== false) process.exit(12);",
      "if (report.staticChecks?.passed !== true) process.exit(13);",
    ].join("");

    const report = runQualityGate(root, {
      staticChecks: { passed: true, findings: [] },
      plan: [{ name: "in-progress quality context probe", command: process.execPath, args: ["-e", probe] }],
    });
    const written = JSON.parse(readFileSync(reportPath, "utf8"));

    assert.equal(report.allPassed, true);
    assert.equal(report.status, "PASSED");
    assert.equal(written.status, "PASSED");
    assert.equal(written.commandResults[0].passed, true);
  });
});

function testRoot() {
  const root = mkdtempSync(join(tmpdir(), "quality-gate-"));
  return root;
}

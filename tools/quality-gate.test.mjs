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
      "agent skill contract audit",
      "TeachingAgent read-only runtime SLO audit",
      "TeachingAgent read-only runtime adapter audit",
      "StudentTutorAgent read-only contract audit",
      "StudentTutorAgent read-only runtime SLO audit",
      "StudentTutorAgent read-only runtime adapter audit",
      "Student App AI Tutor request runtime audit",
      "Student App AI Tutor published learning action source audit",
      "Student App AI Tutor worker study packet input audit",
      "Student App AI Tutor model execution precheck runtime audit",
      "Student App AI Tutor controlled answer artifact runtime audit",
      "Student App AI Tutor worker claim runtime audit",
      "Student App AI Tutor result runtime audit",
      "Student App AI Tutor question-bank draft generation plan runtime audit",
      "Student App AI Tutor question-bank draft generation worker claim precheck runtime audit",
      "Student App AI Tutor question-bank draft generation worker claim runtime audit",
      "Student App AI Tutor question-bank draft generation input envelope runtime audit",
      "Student App AI Tutor question-bank draft generation model execution precheck runtime audit",
      "Student App AI Tutor question-bank draft generation controlled draft runtime audit",
      "Student App AI Tutor question-bank draft generation teacher review runtime audit",
      "Student App AI Tutor question-bank draft generation content storage commit runtime audit",
      "Student App AI Tutor question-bank draft generation content row verification runtime audit",
      "Student App AI Tutor question-bank draft visibility runtime audit",
      "Student App AI Tutor question-bank draft content precheck runtime audit",
      "Student App AI Tutor question-bank draft content read foundation audit",
      "Student App AI Tutor question-bank draft content student read verification runtime audit",
      "Student App AI Tutor question-bank draft answer submission foundation audit",
      "Student App AI Tutor question-bank draft answer submission verification runtime audit",
      "Student App AI Tutor question-bank draft answer scoring request foundation audit",
      "Student App AI Tutor question-bank draft answer scoring request verification runtime audit",
      "Student App AI Tutor question-bank draft answer scoring model execution precheck runtime audit",
      "Student App AI Tutor question-bank draft answer controlled scoring artifact runtime audit",
      "Student App AI Tutor question-bank draft answer scoring result persistence bridge runtime audit",
      "Student App AI Tutor question-bank draft answer scoring input foundation audit",
      "Student App AI Tutor question-bank draft answer scoring result foundation audit",
      "Student App AI Tutor question-bank draft answer scoring completion bridge audit",
      "Student App AI Tutor question-bank draft answer feedback publication precheck runtime audit",
      "Student App AI Tutor question-bank draft answer feedback generation model execution precheck runtime audit",
      "Student App AI Tutor question-bank draft answer feedback controlled draft runtime audit",
      "Student App AI Tutor question-bank draft answer reviewed feedback artifact controlled draft source runtime audit",
      "Student App AI Tutor question-bank draft answer feedback publication approval controlled draft source runtime audit",
      "Student App AI Tutor question-bank draft answer feedback delivery envelope controlled draft source runtime audit",
      "Student App AI Tutor question-bank draft answer feedback archive persistence command controlled draft source runtime audit",
      "Student App AI Tutor question-bank draft answer feedback archive storage commit controlled draft source runtime audit",
      "Student App AI Tutor question-bank draft answer feedback archive row verification controlled draft source runtime audit",
      "Student App AI Tutor question-bank draft answer reviewed feedback artifact runtime audit",
      "Student App AI Tutor question-bank draft answer feedback publication approval runtime audit",
      "Student App AI Tutor question-bank draft answer feedback delivery envelope runtime audit",
      "Student App AI Tutor question-bank draft answer feedback archive persistence command runtime audit",
      "Student App AI Tutor question-bank draft answer feedback archive storage commit runtime audit",
      "Student App AI Tutor question-bank draft answer feedback archive row verification runtime audit",
      "ResearchAgent read-only contract audit",
      "ResearchAgent read-only runtime adapter audit",
      "Research deep_research intent runtime audit",
      "Research deep_research worker lifecycle audit",
      "Research deep_research retrieval plan audit",
      "Research deep_research retrieval execution audit",
      "Research deep_research reasoning synthesis audit",
      "Research deep_research final answer review audit",
      "Research deep_research finalization audit",
      "Research deep_research render preview audit",
      "Research deep_research publication precheck audit",
      "Research deep_research teacher delivery audit",
      "Research deep_research student visibility review audit",
      "Research deep_research student delivery audit",
      "Research deep_research student archive persistence audit",
      "Research deep_research student archive projection review audit",
      "Research deep_research student archive projection audit",
      "Research deep_research student archive storage precommit audit",
      "Research deep_research student archive storage commit audit",
      "Research deep_research student archive row verification audit",
      "workflow plugin flow audit",
      "workflow plugin registry admission",
      "workflow plugin revision feedback",
      "workflow plugin runtime SLO audit",
      "Workflow plugin draft intent runtime audit",
      "Workflow plugin sandbox result runtime audit",
      "Workflow plugin human approval runtime audit",
      "Workflow plugin registry admission runtime audit",
      "Workflow plugin execution isolation runtime audit",
      "Workflow plugin publication disabled runtime audit",
      "Workflow plugin management disabled view audit",
      "Workflow plugin management audit detail audit",
      "Workflow plugin management read-only list audit",
      "AI worker job contract audit",
      "knowledge access policy audit",
      "AI worker job admission audit",
      "knowledge retrieval benchmark audit",
      "ResearchAgent read-only runtime SLO audit",
      "Agent read-only runtime dispatcher audit",
      "Agent read-only API runtime audit",
      "Agent controlled write-intent gateway audit",
      "Teaching quiz draft intent runtime audit",
      "Teaching archive material draft intent runtime audit",
      "Teaching archive material draft human review runtime audit",
      "Teaching archive material draft storage precommit runtime audit",
      "Teaching archive material draft storage commit runtime audit",
      "Teaching archive material draft storage row verification runtime audit",
      "Teaching archive material draft student product read runtime audit",
      "Teaching archive material publication precheck runtime audit",
      "Teaching archive material publication approval runtime audit",
      "Teaching archive material publication delivery runtime audit",
      "Teaching archive material publication persistence command runtime audit",
      "Teaching archive material publication storage commit runtime audit",
      "Teaching archive material publication row verification runtime audit",
      "Teaching archive material publication student app read runtime audit",
      "Teaching archive material publication projection hardening runtime audit",
      "Teaching archive material published search foundation runtime audit",
      "Teaching archive material published detail metadata read runtime audit",
      "Teaching archive material published content preview precheck runtime audit",
      "Teaching archive material published content preview read foundation audit",
      "Teaching archive material published content preview render envelope audit",
      "Teaching archive material published study packet audit",
      "Teaching archive material published learning actions audit",
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

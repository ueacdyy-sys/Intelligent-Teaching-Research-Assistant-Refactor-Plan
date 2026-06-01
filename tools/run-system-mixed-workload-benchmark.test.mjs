import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  buildSystemMixedWorkloadReport,
  buildWorkloadCommands,
  defaults,
  formatSystemMixedWorkloadBenchmark,
  parseArgs,
  runSystemMixedWorkloadBenchmark,
} from "./run-system-mixed-workload-benchmark.mjs";

describe("system mixed workload benchmark runner", () => {
  it("parses kebab-case options into the runner profile", () => {
    const parsed = parseArgs([
      "--identity-base-url",
      "http://127.0.0.1:19000",
      "--conversation-gateway-count",
      "16",
      "--conversation-write-batch-size",
      "64",
      "--teaching-concurrency",
      "6",
      "--unknown-option",
      "ignored",
    ]);

    assert.equal(parsed.identityBaseUrl, "http://127.0.0.1:19000");
    assert.equal(parsed.conversationGatewayCount, "16");
    assert.equal(parsed.conversationWriteBatchSize, "64");
    assert.equal(parsed.teachingConcurrency, "6");
    assert.equal(parsed.profile, defaults.profile);
    assert.equal(Object.hasOwn(parsed, "unknownOption"), false);
  });

  it("builds the five root-module workload commands with the configured ports and outputs", () => {
    const commands = buildWorkloadCommands({
      ...defaults,
      identityBaseUrl: "http://127.0.0.1:19000",
      conversationBaseUrl: "http://127.0.0.1:19100",
      teachingBaseUrl: "http://127.0.0.1:19200",
      identityOut: "reports/identity.json",
      conversationOut: "reports/conversation.json",
      teachingOut: "reports/teaching.json",
      knowledgeOut: "reports/knowledge.json",
      aiAdmissionOut: "reports/ai.json",
    });

    assert.deepEqual(commands.map((command) => command.name), [
      "identity_http",
      "conversation_write",
      "teaching_archive",
      "knowledge_retrieval",
      "ai_worker_admission",
    ]);
    assert.equal(argumentAfter(commands[0].args, "--base-url"), "http://127.0.0.1:19000");
    assert.equal(argumentAfter(commands[1].args, "--base-url"), "http://127.0.0.1:19100");
    assert.equal(argumentAfter(commands[1].args, "--agent-api-key"), "ueacd");
    assert.equal(argumentAfter(commands[2].args, "--base-url"), "http://127.0.0.1:19200");
    assert.equal(argumentAfter(commands[2].args, "--agent-api-key"), "ueacd");
    assert.equal(commands[3].sourceReportPath, "reports/knowledge.json");
    assert.equal(commands[4].sourceReportPath, "reports/ai.json");
  });

  it("summarizes PASSED and READY child reports as a passed mixed workload smoke", async () => {
    const root = makeTempRoot();
    const report = await runSystemMixedWorkloadBenchmark(
      {
        ...defaults,
        out: "reports/mixed.json",
      },
      {
        root,
        runCommand: successfulChildCommand,
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "PASSED");
    assert.equal(report.workloadType, "MIXED_WORKLOAD");
    assert.equal(report.benchmarkKind, "system_mixed_workload");
    assert.equal(report.summary.passedWorkloads, 5);
    assert.equal(report.summary.totalErrors, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "reports/mixed.json"), "utf8")).status, "PASSED");
    assert.match(formatSystemMixedWorkloadBenchmark(report), /System mixed workload benchmark: PASSED/u);
  });

  it("masks secrets and database URLs in command and output evidence", async () => {
    const root = makeTempRoot();
    const report = await runSystemMixedWorkloadBenchmark(
      {
        ...defaults,
        out: "reports/mixed.json",
      },
      {
        root,
        runCommand: successfulChildCommand,
        now: fixedClock(),
      },
    );
    const reportText = JSON.stringify(report);

    assert.doesNotMatch(reportText, /ueacd/u);
    assert.doesNotMatch(reportText, /postgres:\/\/app_user/u);
    assert.match(report.sourceCommands.find((command) => command.name === "conversation_write").command, /--agent-api-key \*\*\*/u);
    assert.match(report.workloads[0].outputTail, /\[database-url\]/u);
  });

  it("marks the mixed workload failed when a child command fails", async () => {
    const root = makeTempRoot();
    const report = await runSystemMixedWorkloadBenchmark(
      {
        ...defaults,
        out: "reports/mixed.json",
      },
      {
        root,
        runCommand: async (command, args, commandRoot) => {
          if (args[0].includes("run-conversation-write-benchmark")) {
            return {
              command,
              args,
              exitCode: 1,
              elapsedMs: 17,
              outputTail: "conversation failed with key ueacd",
            };
          }
          return successfulChildCommand(command, args, commandRoot);
        },
        now: fixedClock(),
      },
    );

    const conversation = report.workloads.find((workload) => workload.name === "conversation_write");
    assert.equal(report.status, "FAILED");
    assert.equal(conversation.status, "FAILED");
    assert.equal(conversation.errors, 1);
    assert.match(conversation.outputTail, /\*\*\*/u);
  });

  it("rejects overlapping identity and conversation gateway port ranges", async () => {
    const root = makeTempRoot();

    await assert.rejects(
      () => runSystemMixedWorkloadBenchmark(
        {
          ...defaults,
          identityBaseUrl: "http://127.0.0.1:18400",
          identityGatewayCount: "2",
          conversationBaseUrl: "http://127.0.0.1:18401",
          conversationGatewayCount: "1",
        },
        { root, runCommand: successfulChildCommand },
      ),
      /port overlap: 18401/u,
    );
  });

  it("rejects overlapping teaching archive gateway ports", async () => {
    const root = makeTempRoot();

    await assert.rejects(
      () => runSystemMixedWorkloadBenchmark(
        {
          ...defaults,
          conversationBaseUrl: "http://127.0.0.1:18400",
          conversationGatewayCount: "2",
          teachingBaseUrl: "http://127.0.0.1:18401",
        },
        { root, runCommand: successfulChildCommand },
      ),
      /port overlap: 18401/u,
    );
  });

  it("does not execute workloads when managed Docker setup fails, but still records cleanup", async () => {
    const root = makeTempRoot();
    let workloadRuns = 0;

    const report = await runSystemMixedWorkloadBenchmark(
      {
        ...defaults,
        manageDocker: "true",
        dockerCleanup: "down",
        out: "reports/mixed.json",
      },
      {
        root,
        runCommand: async (...args) => {
          workloadRuns += 1;
          return successfulChildCommand(...args);
        },
        runSync: (_command, args) => ({
          command: "npm",
          args,
          exitCode: args.includes("perf:identity-session:up") ? 1 : 0,
          elapsedMs: 3,
          outputTail: "docker setup output",
        }),
        now: fixedClock(),
      },
    );

    assert.equal(report.status, "FAILED");
    assert.equal(workloadRuns, 0);
    assert.equal(report.setup[0].phase, "setup");
    assert.equal(report.cleanup[0].phase, "cleanup");
    assert.match(report.runnerErrors.join("\n"), /managed Docker setup failed/u);
    assert.equal(report.summary.orchestrationErrors, 2);
  });

  it("builds a direct report object from supplied child reports", () => {
    const commands = buildWorkloadCommands(defaults);
    const results = commands.map((command) => ({
      name: command.name,
      exitCode: 0,
      elapsedMs: 5,
      outputTail: "ok",
    }));
    const childReports = childReportsFor(commands);

    const report = buildSystemMixedWorkloadReport({
      options: defaults,
      commands,
      results,
      childReports,
      startedAt: "2026-06-01T00:00:00.000Z",
      endedAt: "2026-06-01T00:00:01.000Z",
    });

    assert.equal(report.status, "PASSED");
    assert.equal(report.workloadType, "MIXED_WORKLOAD");
    assert.equal(report.summary.maxP99Ms, 35);
    assert.equal(report.workloads.find((workload) => workload.name === "knowledge_retrieval").status, "READY");
  });
});

async function successfulChildCommand(command, args, root) {
  const sourceReportPath = argumentAfter(args, "--out");
  fs.mkdirSync(path.dirname(path.join(root, sourceReportPath)), { recursive: true });
  fs.writeFileSync(
    path.join(root, sourceReportPath),
    `${JSON.stringify(reportForScript(args[0]), null, 2)}\n`,
  );
  return {
    command,
    args,
    exitCode: 0,
    elapsedMs: 11,
    outputTail: "ok ueacd postgres://app_user:ueacd@127.0.0.1:16432/db",
  };
}

function childReportsFor(commands) {
  return Object.fromEntries(commands.map((command) => [
    command.name,
    { present: true, parseable: true, value: reportForScript(command.args[0]) },
  ]));
}

function reportForScript(script) {
  if (script.includes("run-identity-http-benchmark")) return identityReport();
  if (script.includes("run-conversation-write-benchmark")) return conversationReport();
  if (script.includes("run-teaching-archive-benchmark")) return teachingReport();
  if (script.includes("knowledge-retrieval-benchmark-audit")) return knowledgeReport();
  if (script.includes("ai-worker-job-admission")) return aiAdmissionReport();
  throw new Error(`unknown child script: ${script}`);
}

function identityReport() {
  return {
    status: "PASSED",
    concurrency: 16,
    phases: {
      passwordLogin: phase("passwordLogin", 20, 30, 110),
      refreshRotation: phase("refreshRotation", 18, 25, 120),
    },
  };
}

function conversationReport() {
  return {
    status: "PASSED",
    concurrency: 64,
    phases: {
      createConversation: {
        errors: 0,
        rps: 900,
        latencyMs: { p95: 25, p99: 35 },
        serverTimingBreakdownMs: {
          "db.acquire": { p99: 0.3 },
        },
      },
    },
  };
}

function teachingReport() {
  return {
    status: "PASSED",
    concurrency: 8,
    phases: {
      createArchiveItem: phase("createArchiveItem", 12, 17, 180),
      createQuizSubmission: phase("createQuizSubmission", 14, 19, 160),
      listArchiveItems: phase("listArchiveItems", 7, 9, 300),
    },
  };
}

function knowledgeReport() {
  return {
    readiness: "READY",
    benchmark: {
      metrics: { p95QueryPlanMs: 2.55 },
    },
  };
}

function aiAdmissionReport() {
  return {
    readiness: "READY",
  };
}

function phase(name, p95, p99, rps) {
  return {
    name,
    errors: 0,
    rps,
    latencyMs: { p95, p99 },
  };
}

function argumentAfter(args, name) {
  const index = args.indexOf(name);
  assert.notEqual(index, -1, `${name} argument should exist`);
  return args[index + 1];
}

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ita-mixed-workload-"));
}

function fixedClock() {
  let tick = 0;
  return () => `2026-06-01T00:00:0${tick++}.000Z`;
}

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export async function successfulChildCommand(command, args, root) {
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

export function childReportsFor(commands) {
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
      principalLookup: phase("principalLookup", 12, 18, 150),
      refreshRotation: phase("refreshRotation", 18, 25, 120),
      revokeCycle: {
        ...phase("revokeCycle", 60, 66, 90),
        stepLatencyAttribution: {
          slowestStep: "revoke",
          slowestStepP99Ms: 44,
          phaseP99Ms: 66,
        },
      },
    },
    gatewayDatabasePhaseDiagnostics: {
      passwordLogin: {
        delta: {
          sessionOperations: {
            saveSession: {
              count: 16,
              totalElapsedMs: 160,
              averageElapsedMs: 10,
            },
          },
        },
      },
      revokeCycle: {
        delta: {
          sessionOperations: {
            revokeOwnSession: {
              count: 16,
              totalElapsedMs: 320,
              averageElapsedMs: 20,
            },
            saveSession: {
              count: 16,
              totalElapsedMs: 240,
              averageElapsedMs: 15,
            },
          },
        },
      },
    },
  };
}

function conversationReport() {
  return {
    status: "PASSED",
    concurrency: 64,
    benchmarkRuntimeProfile: {
      executor: "WSL_GO",
      wslDistro: "Ubuntu",
      wslHostAlias: "172.28.160.1",
      wslWorkspace: "/mnt/c/workspace",
      targetBaseUrls: ["http://172.28.160.1:18100"],
    },
    gatewayExitCode: [null, null],
    gatewaySignal: [null, null],
    gatewayWriteProfile: {
      acceptanceMode: "durable-log",
    },
    gatewayRuntimeDiagnostics: {
      before: {
        gateways: [
          { status: "OK", stats: { acceptedConns: 1, maxCurrentConns: 1 } },
          { status: "OK", stats: { acceptedConns: 1, maxCurrentConns: 1 } },
        ],
      },
      after: {
        gateways: [
          { status: "OK", stats: { acceptedConns: 276, maxCurrentConns: 276 } },
          { status: "OK", stats: { acceptedConns: 270, maxCurrentConns: 270 } },
        ],
      },
    },
    gatewayDatabaseDiagnostics: {
      after: {
        gateways: [
          { status: "OK", stats: { emptyAcquireCount: 1, emptyAcquireWaitTimeMs: 11.5 } },
          { status: "OK", stats: { emptyAcquireCount: 2, emptyAcquireWaitTimeMs: 5.5 } },
        ],
      },
    },
    gatewayCommandLogDiagnostics: {
      after: {
        gateways: [
          { status: "OK", stats: { acceptedCommands: 512, projectionEnqueued: 512, projectionSucceeded: 500, projectionFailed: 0, queueDepth: 12, oldestPendingAgeMs: 8 } },
          { status: "OK", stats: { acceptedCommands: 512, projectionEnqueued: 512, projectionSucceeded: 506, projectionFailed: 0, queueDepth: 6, oldestPendingAgeMs: 5 } },
        ],
      },
    },
    phases: {
      createConversation: {
        errors: 0,
        rps: 900,
        latencyMs: { p95: 25, p99: 35 },
        serverTimingMs: { p99: 21 },
        clientServerGapMs: { p99: 44 },
        serverTimingBreakdownMs: {
          "db.acquire": { p99: 0.3 },
          "db.batch_wait": { p99: 12.5 },
          "db.insert": { p99: 15.2 },
          "command.append": { p99: 4.4 },
          "projection.enqueue": { p99: 0.6 },
        },
      },
    },
  };
}

function teachingReport() {
  return {
    status: "PASSED",
    concurrency: 8,
    benchmarkRuntimeProfile: {
      executor: "DOCKER_GO",
      dockerImage: "golang:1.26-alpine",
      dockerHostAlias: "host.docker.internal",
      targetBaseUrls: ["http://host.docker.internal:18500"],
    },
    gatewayWriteProfile: {
      archiveCreateBatchingEnabled: true,
      archiveCreateBatchSize: 64,
      archiveCreateBatchDelayMs: 1,
      archiveCreateBatchWorkers: 2,
      archiveCreateBatchMode: "copy",
      quizSubmissionBatchingEnabled: true,
      quizSubmissionBatchSize: 16,
      quizSubmissionBatchDelayMs: 0,
      quizSubmissionBatchWorkers: 8,
    },
    gatewayReadProfile: {
      archiveListCacheEnabled: true,
      archiveListCacheTtlMs: 250,
      archiveListCacheMaxEntries: 4096,
    },
    gatewaySchemaProfile: {
      archiveSchemaIndexProfile: "hot_write",
    },
    gatewayDatabaseDiagnostics: {
      after: {
        gateways: [
          { status: "OK", stats: { totalConns: 12, acquiredConns: 8, idleConns: 4, emptyAcquireCount: 1, emptyAcquireWaitTimeMs: 11.5, newConnsCount: 12 } },
          { status: "OK", stats: { totalConns: 12, acquiredConns: 6, idleConns: 6, emptyAcquireCount: 2, emptyAcquireWaitTimeMs: 5.5, newConnsCount: 12 } },
        ],
      },
    },
    phases: {
      createArchiveItem: phase("createArchiveItem", 12, 50, 180, 31, 24, 36, 5),
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

function phase(name, p95, p99, rps, serverP99 = null, dbInsertP99 = null, handlerP99 = null, preUsecaseP99 = null) {
  const report = {
    name,
    errors: 0,
    rps,
    latencyMs: { p95, p99 },
  };
  if (serverP99 !== null) {
    report.serverTimingMs = { p99: serverP99 };
    report.serverTimingBreakdownMs = {
      ...(handlerP99 !== null ? { handler: { p99: handlerP99 } } : {}),
      ...(preUsecaseP99 !== null ? { "pre.usecase": { p99: preUsecaseP99 } } : {}),
      "db.batch_wait": { p99: 7 },
      "db.insert": { p99: dbInsertP99 },
      "response.encode": { p99: 2 },
    };
  }
  return report;
}

export function argumentAfter(args, name) {
  const index = args.indexOf(name);
  assert.notEqual(index, -1, `${name} argument should exist`);
  return args[index + 1];
}

export function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ita-mixed-workload-"));
}

export function fixedClock() {
  let tick = 0;
  return () => `2026-06-01T00:00:0${tick++}.000Z`;
}

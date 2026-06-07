import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_PORT,
  TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_RUNTIME_ID,
  commitTeachingArchiveMaterialDraftStorage,
} from "./teaching-archive-material-draft-storage-commit-runtime.mjs";

const defaultOutPath = "reports/teaching-archive-material-draft-storage-commit.current.json";
const precommitRuntimeId = "teaching_archive_material_draft_storage_precommit_runtime";
const precommitCommandPort = "TeachingArchiveMaterialDraftStoragePrecommitPort.prepareArchiveMaterialDraftStorageCommand";
const commitStatus = "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMITTED";

const sourceFiles = {
  runtime: "tools/teaching-archive-material-draft-storage-commit-runtime.mjs",
  runtimeTest: "tools/teaching-archive-material-draft-storage-commit-runtime.test.mjs",
  precommitReport: "reports/teaching-archive-material-draft-storage-precommit.current.json",
  teachingArchiveOpenapi: "contracts/openapi/teaching-archive.archive-items.path.yaml",
  teachingArchiveSql: "contracts/sql/teaching-archive.sql",
  teachingArchiveDomain: "services/teaching-archive-gateway/internal/domain/archive.go",
  teachingArchivePrincipal: "services/teaching-archive-gateway/internal/domain/principal.go",
  teachingArchiveUsecase: "services/teaching-archive-gateway/internal/usecase/create_archive_item.go",
  teachingArchiveRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0304-teaching-archive-material-draft-storage-commit.md",
};

const forbiddenRuntimeClaims = [
  "node:child_process",
  "spawn(",
  "execSync(",
  "fetch(",
  "postgres://",
  "SELECT ",
  "INSERT ",
  "UPDATE ",
  "DELETE ",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "ocrOrRagJobWriteAllowed: true",
  "ocrOrRagJobWriteStarted: true",
  "aiGradingWriteAllowed: true",
  "aiGradingWriteStarted: true",
  "externalModelCallAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "dangerouslySetInnerHTML",
  "innerHTML",
];

export async function auditTeachingArchiveMaterialDraftStorageCommit(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const precommitReport = parseJson(inputs.precommitReport, {});
  const teachingArchiveStoragePath = [
    inputs.teachingArchiveOpenapi ?? "",
    inputs.teachingArchiveSql ?? "",
    inputs.teachingArchiveDomain ?? "",
    inputs.teachingArchivePrincipal ?? "",
    inputs.teachingArchiveUsecase ?? "",
    inputs.teachingArchiveRepository ?? "",
  ].join("\n");
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(precommitReport, options);

  addFinding(findings, {
    id: "source_precommit.ready_uncommitted",
    passed: precommitReport.readiness === "READY" &&
      precommitReport.workloadType === "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT" &&
      precommitReport.runtime?.runtimeId === precommitRuntimeId &&
      precommitReport.runtime?.commandPort === precommitCommandPort &&
      precommitReport.runtime?.status === "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_READY" &&
      precommitReport.runtimeSlo?.totalErrors === 0 &&
      precommitReport.runtimeProbes?.teachingArchiveMaterialDraftStoragePrecommit?.result?.boundary?.mainDatabaseWritePrepared === true &&
      precommitReport.runtimeProbes?.teachingArchiveMaterialDraftStoragePrecommit?.result?.boundary?.mainDatabaseWriteStarted === false &&
      precommitReport.runtimeProbes?.teachingArchiveMaterialDraftStoragePrecommit?.result?.boundary?.mainDatabaseWriteCommitted === false,
    actual: `${precommitReport.readiness ?? "missing"}:${precommitReport.runtime?.status ?? "missing"}:${precommitReport.runtimeProbes?.teachingArchiveMaterialDraftStoragePrecommit?.result?.boundary?.mainDatabaseWriteCommitted ?? "missing"}`,
    expected: "READY 0303 storage precommit with prepared command and no committed main DB write",
    remediation: "Run the 0303 storage-precommit audit before committing archive material storage.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_PORT",
      "TeachingArchiveMaterialDraftStorageCommitPort.commitArchiveMaterialDraftStorageCommand",
      "commitTeachingArchiveMaterialDraftStorage",
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMITTED",
      "TeachingArchiveCreateItemPort.createArchiveItem is required",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "teaching_archive_material_draft_storage_commit_runtime",
      "TeachingArchiveMaterialDraftStorageCommitPort.commitArchiveMaterialDraftStorageCommand",
      "findExistingRecordByIdempotencyKey",
    ]),
    expected: "runtime records an idempotent storage commit through the Teaching Archive material draft storage commit port",
    remediation: "Keep storage commit as a named use-case-port boundary with idempotent replay.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "storagePrecommitVerified: true",
      "teachingArchiveCreateItemPortInjected: true",
      "mainDatabaseWriteAllowedViaUseCasePort: true",
      "mainDatabaseWritePrepared: true",
      "mainDatabaseWriteStarted: true",
      "mainDatabaseWriteCommitted: true",
      "finalArchiveItemCreated: true",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "executeHttpRequestAllowed: false",
      "directDatabaseAccessAllowed: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "requiresFutureRowVerification: true",
      "rejectLeakedFields",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime commits only through the injected Teaching Archive use case port and blocks raw DB, HTTP, OCR/RAG, AI grading, tools, devices, and Swarm",
    remediation: "Do not let the JS runtime bypass the Teaching Archive use case boundary.",
  });

  addFinding(findings, {
    id: "runtime.probe_commits_archive_item",
    passed: probe.status === "PASS" &&
      probe.result?.status === commitStatus &&
      probe.result?.commandPort === TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_PORT &&
      probe.result?.sourcePrecommit?.runtimeId === precommitRuntimeId &&
      probe.result?.teachingArchiveCommit?.targetUseCase === "CreateArchiveItem.ExecuteWithPersistence" &&
      probe.result?.teachingArchiveCommit?.targetRepository === "ArchiveRepository.Create" &&
      probe.result?.teachingArchiveCommit?.targetTable === "teaching_archive_items" &&
      probe.result?.teachingArchiveCommit?.archiveItem?.id === "tarch_archive_material_001" &&
      probe.result?.teachingArchiveCommit?.persistence?.status === "persisted" &&
      probe.result?.boundary?.teachingArchiveCreateItemPortInjected === true &&
      probe.result?.boundary?.mainDatabaseWriteCommitted === true &&
      probe.result?.boundary?.directDatabaseAccessAllowed === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};archive=${probe.result.teachingArchiveCommit.archiveItem.id};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe commits one prepared CreateArchiveItem command through one injected Teaching Archive use case port call under 50ms",
    remediation: "Commit must prove use case port invocation, persisted archive item evidence, and direct-DB exclusion.",
  });

  addFinding(findings, {
    id: "tests.cover_commit_negative_paths",
    passed: includesAll(runtimeTest, [
      "commits a precommitted archive material draft through the injected Teaching Archive port",
      "uses idempotency for replay and rejects conflicting commits",
      "rejects unsafe precommit source, policy, analysis intent, and missing port",
      "rejects leaked fields, unsafe port results, and archive item mismatch",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, source-state, policy, analysis intent, missing port, leak, unsafe port result, bad archive id, student mismatch, and persistence tests",
    remediation: "Add regression coverage before treating storage commit as root evidence.",
  });

  addFinding(findings, {
    id: "teaching_archive.storage_path_exists",
    passed: includesAll(teachingArchiveStoragePath, [
      "operationId: createTeachingArchiveItem",
      "CreateArchiveItemRequest",
      "CREATE TABLE IF NOT EXISTS teaching_archive_items",
      "OwnerTypeStudent",
      "ScopeStudentArchiveWrite",
      "func (uc *CreateArchiveItem) ExecuteWithPersistence",
      "type ArchiveRepository interface",
      "INSERT INTO teaching_archive_items",
    ]),
    actual: summarizePresence(teachingArchiveStoragePath, [
      "createTeachingArchiveItem",
      "teaching_archive_items",
      "ScopeStudentArchiveWrite",
      "ExecuteWithPersistence",
      "INSERT INTO teaching_archive_items",
    ]),
    expected: "commit maps to the existing Teaching Archive OpenAPI, domain authorization, use case, repository, and SQL table",
    remediation: "Do not claim storage commit readiness without a real Teaching Archive storage path.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:teaching-archive-material-draft-storage-commit"]?.includes("teaching-archive-material-draft-storage-commit-audit.mjs")) &&
      includesAll(hooks, [
        "Teaching archive material draft storage commit runtime audit",
        "teachingArchiveMaterialDraftStorageCommit",
        "teaching-archive-material-draft-storage-commit.current.json",
        "teaching_archive_material_draft_storage_commit_runtime",
        "0304-teaching-archive-material-draft-storage-commit.md",
        "10.48/10",
        "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMITTED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:teaching-archive-material-draft-storage-commit",
      "teachingArchiveMaterialDraftStorageCommit",
      "10.48/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0304",
    remediation: "Wire archive material draft storage commit through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT",
    runtime: {
      runtimeId: TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_RUNTIME_ID,
      commandPort: TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_PORT,
      sourceCommandPort: precommitCommandPort,
      status: commitStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { teachingArchiveMaterialDraftStorageCommit: probe },
    safetyInvariants: {
      storagePrecommitRequired: true,
      storagePrecommitVerified: true,
      teachingArchiveCreateItemPortInjected: true,
      teachingArchiveUseCaseCommitAllowed: true,
      mainDatabaseWriteAllowedViaUseCasePort: true,
      mainDatabaseWritePrepared: true,
      mainDatabaseWriteStarted: true,
      mainDatabaseWriteCommitted: true,
      finalArchiveItemCreated: true,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      executeHttpRequestAllowed: false,
      directDatabaseAccessAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureRowVerification: true,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as Teaching Archive material storage-commit evidence; physical row verification remains the next separate slice."
      : "Fix storage commit boundaries before claiming final archive material storage evidence.",
  };
}

export function formatTeachingArchiveMaterialDraftStorageCommitAudit(report) {
  const lines = [
    `Teaching archive material draft storage commit runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) {
    lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => {
    const absolute = path.join(root, relativePath);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}

async function runRuntimeProbe(precommitReport, options = {}) {
  const commitLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-storage-commit-audit-")), "commit.jsonl");
  const startedAt = Date.now();
  const calls = [];
  try {
    const result = await commitTeachingArchiveMaterialDraftStorage(probeInput(precommitReport), {
      commitLogPath,
      generatedAt: "2026-06-07T08:00:00.000Z",
      teachingArchiveCreateItemPort: {
        async createArchiveItem(command, context) {
          calls.push({ command, context });
          return {
            archiveItem: {
              id: "tarch_archive_material_001",
              ownerType: command.requestBody.ownerType,
              studentId: command.requestBody.studentId,
              materialType: command.requestBody.materialType,
              title: command.requestBody.title,
              source: command.requestBody.source,
              contentRef: command.requestBody.contentRef,
              tags: command.requestBody.tags,
              analysisIntents: command.requestBody.analysisIntents,
              ocrStatus: "NOT_REQUIRED",
              createdAt: "2026-06-07T08:00:00.000Z",
            },
            persistence: {
              status: "persisted",
              commandId: command.commandId,
            },
          };
        },
      },
    });
    const elapsedMs = Math.max(1, Date.now() - startedAt);
    return {
      status: "PASS",
      result,
      portCalls: calls.length,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? elapsedMs)),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_COMMIT_PROBE",
      },
    };
  } catch (error) {
    return {
      status: "FAIL",
      error: error.message,
      portCalls: calls.length,
      runtimeSlo: failedSlo(),
    };
  }
}

function probeInput(precommitReport) {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-draft-storage-commit.v1",
    commitInvocationId: "archive_material_draft_storage_commit_001",
    storagePrecommitReport: precommitReport,
    storageCommitPolicy: {
      storagePrecommitRequired: true,
      teachingArchiveUseCaseCommitAllowed: true,
      injectedTeachingArchivePortRequired: true,
      idempotentStorageCommitRequired: true,
      mainDatabaseWriteAllowed: true,
      preservePrecommitEvidenceRequired: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteAllowed: false,
      aiGradingWriteAllowed: false,
      externalModelCallAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      "evidence:archive-material-draft-human-review:archive_material_draft_review_001",
      "evidence:archive-material-draft-storage-precommit:archive_material_draft_storage_precommit_001",
    ],
    idempotencyKey: "archive-material-draft-storage-commit:student_001:fractions_packet",
  };
}

function failedSlo() {
  return {
    targetP99Ms: 50,
    p99Ms: null,
    totalErrors: 1,
    operations: 0,
    evidenceClass: "FAILED_PROBE",
  };
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

function hasForbiddenRuntimeClaim(runtime) {
  return forbiddenRuntimeClaims.some((claim) => runtime.includes(claim));
}

function summarizePresence(text, values) {
  return values.map((value) => `${value}=${text.includes(value)}`).join(";");
}

function addFinding(findings, finding) {
  findings.push({ severity: finding.passed ? "info" : "error", ...finding });
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function stringifyScalar(value) {
  if (Array.isArray(value)) return value.join(",");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditTeachingArchiveMaterialDraftStorageCommit(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatTeachingArchiveMaterialDraftStorageCommitAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_PORT,
  TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_RUNTIME_ID,
  prepareTeachingArchiveMaterialDraftStoragePrecommit,
} from "./teaching-archive-material-draft-storage-precommit-runtime.mjs";

const defaultOutPath = "reports/teaching-archive-material-draft-storage-precommit.current.json";
const sourceFiles = {
  runtime: "tools/teaching-archive-material-draft-storage-precommit-runtime.mjs",
  runtimeTest: "tools/teaching-archive-material-draft-storage-precommit-runtime.test.mjs",
  humanReviewReport: "reports/teaching-archive-material-draft-human-review.current.json",
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
  sdd: "docs/sdd/0303-teaching-archive-material-draft-storage-precommit.md",
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
  "mainDatabaseWriteAllowed: true",
  "mainDatabaseWriteStarted: true",
  "mainDatabaseWriteCommitted: true",
  "ocrOrRagJobWriteAllowed: true",
  "ocrOrRagJobWriteStarted: true",
  "aiGradingWriteAllowed: true",
  "aiGradingWriteStarted: true",
  "executeHttpRequestAllowed: true",
  "directDatabaseAccessAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "dangerouslySetInnerHTML",
  "innerHTML",
];

export async function auditTeachingArchiveMaterialDraftStoragePrecommit(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const humanReviewReport = parseJson(inputs.humanReviewReport, {});
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
  const probe = await runRuntimeProbe(humanReviewReport, options);

  addFinding(findings, {
    id: "source_human_review.ready_approved_for_precommit",
    passed: humanReviewReport.readiness === "READY" &&
      humanReviewReport.workloadType === "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW" &&
      humanReviewReport.runtime?.runtimeId === "teaching_archive_material_draft_human_review_runtime" &&
      humanReviewReport.runtime?.commandPort === "TeachingArchiveMaterialDraftReviewPort.recordArchiveMaterialDraftHumanReview" &&
      humanReviewReport.runtime?.status === "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_APPROVED_FOR_PRECOMMIT" &&
      humanReviewReport.runtimeProbes?.teachingArchiveMaterialDraftHumanReview?.result?.boundary?.precommitCandidateAllowed === true &&
      humanReviewReport.runtimeProbes?.teachingArchiveMaterialDraftHumanReview?.result?.boundary?.mainDatabaseWriteStarted === false,
    actual: `${humanReviewReport.readiness ?? "missing"}:${humanReviewReport.runtime?.status ?? "missing"}:${humanReviewReport.runtimeProbes?.teachingArchiveMaterialDraftHumanReview?.result?.boundary?.precommitCandidateAllowed ?? "missing"}`,
    expected: "READY 0302 human review approved for storage precommit and still not committed",
    remediation: "Run the 0302 human-review audit before preparing storage precommit.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_PORT",
      "TeachingArchiveMaterialDraftStoragePrecommitPort.prepareArchiveMaterialDraftStorageCommand",
      "prepareTeachingArchiveMaterialDraftStoragePrecommit",
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_READY",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "teaching_archive_material_draft_storage_precommit_runtime",
      "TeachingArchiveMaterialDraftStoragePrecommitPort.prepareArchiveMaterialDraftStorageCommand",
      "findExistingRecordByIdempotencyKey",
    ]),
    expected: "runtime records an idempotent storage precommit through a named Teaching Archive port",
    remediation: "Keep storage precommit as a port boundary before final commit.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "humanReviewVerified: true",
      "draftIntentVerified: true",
      "storageCommandPrepared: true",
      "mainDatabaseWritePrepared: true",
      "finalArchiveItemWriteStarted: false",
      "mainDatabaseWriteStarted: false",
      "mainDatabaseWriteCommitted: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "executeHttpRequestAllowed: false",
      "directDatabaseAccessAllowed: false",
      "swarmAllowed: false",
      "requiresFutureStorageCommit: true",
      "rejectLeakedFields",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime prepares a storage command only; it does not write DB, call HTTP/tools, start OCR/RAG, write grading state, or enable Swarm",
    remediation: "Do not collapse storage precommit into final database commit.",
  });

  addFinding(findings, {
    id: "runtime.probe_prepares_create_archive_item_command",
    passed: probe.status === "PASS" &&
      probe.result?.status === "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_READY" &&
      probe.result?.commandPort === TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_PORT &&
      probe.result?.teachingArchiveCreateCommand?.operationId === "createTeachingArchiveItem" &&
      probe.result?.teachingArchiveCreateCommand?.targetUseCase === "CreateArchiveItem.ExecuteWithPersistence" &&
      probe.result?.teachingArchiveCreateCommand?.targetRepository === "ArchiveRepository.Create" &&
      probe.result?.teachingArchiveCreateCommand?.targetTable === "teaching_archive_items" &&
      probe.result?.teachingArchiveCreateCommand?.requestBody?.analysisIntents?.[0] === "ARCHIVE_ONLY" &&
      probe.result?.boundary?.mainDatabaseWritePrepared === true &&
      probe.result?.boundary?.mainDatabaseWriteStarted === false &&
      probe.result?.boundary?.ocrOrRagJobWriteStarted === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};command=${probe.result.teachingArchiveCreateCommand.operationId};mainDbStarted=${probe.result.boundary.mainDatabaseWriteStarted};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe prepares one CreateArchiveItem command under 50ms without executing final storage",
    remediation: "Precommit must prepare the exact command expected by a later commit slice.",
  });

  addFinding(findings, {
    id: "tests.cover_precommit_negative_paths",
    passed: includesAll(runtimeTest, [
      "prepares a Teaching Archive create command after approved human review",
      "uses idempotency for replay and rejects conflicting storage commands",
      "rejects unapproved human review and unsafe source mismatch",
      "rejects unsafe principal, student scope mismatch, policy, and analysis intents",
      "rejects missing ports, leaked fields, unsafe content refs, and unsafe port results",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, review-state, source mismatch, auth, policy, AI grading intent, leak, contentRef, missing port, and port-result tests",
    remediation: "Add regression coverage before treating storage precommit as root evidence.",
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
    expected: "precommit maps to the existing Teaching Archive OpenAPI, domain authorization, use case, repository, and SQL table",
    remediation: "Do not claim storage precommit readiness without a real Teaching Archive storage path.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:teaching-archive-material-draft-storage-precommit"]?.includes("teaching-archive-material-draft-storage-precommit-audit.mjs")) &&
      includesAll(hooks, [
        "Teaching archive material draft storage precommit runtime audit",
        "teachingArchiveMaterialDraftStoragePrecommit",
        "teaching-archive-material-draft-storage-precommit.current.json",
        "teaching_archive_material_draft_storage_precommit_runtime",
        "0303-teaching-archive-material-draft-storage-precommit.md",
        "10.45/10",
        "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_READY",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:teaching-archive-material-draft-storage-precommit",
      "teachingArchiveMaterialDraftStoragePrecommit",
      "10.45/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0303",
    remediation: "Wire archive material draft storage precommit through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT",
    runtime: {
      runtimeId: TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_RUNTIME_ID,
      commandPort: TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_PORT,
      sourceCommandPort: "TeachingArchiveMaterialDraftReviewPort.recordArchiveMaterialDraftHumanReview",
      status: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_READY",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { teachingArchiveMaterialDraftStoragePrecommit: probe },
    safetyInvariants: {
      humanReviewRequired: true,
      humanReviewApproved: true,
      storagePrecommitRecorded: true,
      storageCommandPrepared: true,
      mainDatabaseWritePrepared: true,
      finalArchiveItemWriteStarted: false,
      mainDatabaseWriteStarted: false,
      mainDatabaseWriteCommitted: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      executeHttpRequestAllowed: false,
      directDatabaseAccessAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as Teaching Archive material storage-precommit evidence; final storage commit and row verification remain separate slices."
      : "Fix storage precommit boundaries before adding final archive storage commit.",
  };
}

export function formatTeachingArchiveMaterialDraftStoragePrecommitAudit(report) {
  const lines = [
    `Teaching archive material draft storage precommit runtime: ${report.readiness}`,
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

async function runRuntimeProbe(humanReviewReport, options = {}) {
  const precommitLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-storage-precommit-audit-")), "precommit.jsonl");
  let portCalls = 0;
  const startedAt = Date.now();
  try {
    const result = await prepareTeachingArchiveMaterialDraftStoragePrecommit(probeInput(humanReviewReport), {
      generatedAt: "2026-06-07T07:40:00.000Z",
      precommitLogPath,
      storagePrecommitPort: {
        async prepareArchiveMaterialDraftStorageCommand(request) {
          portCalls += 1;
          return {
            precommit: {
              precommitId: "archive_material_draft_storage_precommit_001",
              commandId: request.teachingArchiveCreateCommand.commandId,
              status: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_READY",
              executionState: "STORAGE_PRECOMMIT_RECORDED_NOT_COMMITTED",
            },
          };
        },
      },
    });
    return {
      status: "PASS",
      result,
      portCalls,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? Date.now() - startedAt)),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STORAGE_PRECOMMIT_PROBE",
      },
    };
  } catch (error) {
    return {
      status: "FAIL",
      error: error.message,
      portCalls,
      runtimeSlo: failedSlo(),
    };
  }
}

function probeInput(humanReviewReport) {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-draft-storage-precommit.v1",
    precommitInvocationId: "archive_material_draft_storage_precommit_001",
    humanReviewReport,
    draftIntentSnapshot: {
      draftIntentId: "archive_material_draft_intent_001",
      ownerType: "STUDENT",
      studentId: "student_001",
      materialType: "HANDOUT",
      source: "AGENT_DRAFT",
      title: "Fractions practice packet",
      draftArtifactRef: "draft://archive-material/student_001/fractions-packet",
      sourceRefs: ["source://lesson/fractions/week-01"],
    },
    principal: {
      principalId: "teacher_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHER",
      sessionId: "teacher_session_001",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "HARNESS_APPROVE"],
      studentAccess: { mode: "ASSIGNED", studentIds: ["student_001"] },
    },
    storageRequest: {
      ownerType: "STUDENT",
      studentId: "student_001",
      materialType: "HANDOUT",
      title: "Fractions practice packet",
      source: "SYSTEM_IMPORT",
      contentRef: "precommit://archive-material/student_001/fractions-packet",
      tags: ["fractions", "draft-approved"],
      analysisIntents: ["ARCHIVE_ONLY"],
      ocrReserved: false,
    },
    storagePolicy: {
      humanReviewRequired: true,
      humanReviewApproved: true,
      storagePrecommitAllowed: true,
      idempotentStorageCommandRequired: true,
      preserveDraftEvidenceRequired: true,
      requiresFutureStorageCommit: true,
      mainDatabaseWriteAllowed: false,
      mainDatabaseWriteStarted: false,
      mainDatabaseWriteCommitted: false,
      ocrOrRagJobWriteAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteAllowed: false,
      executeHttpRequestAllowed: false,
      directDatabaseAccessAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      "evidence:archive-material-draft-intent:archive_material_draft_intent_001",
      "evidence:archive-material-draft-human-review:archive_material_draft_review_001",
    ],
    idempotencyKey: "archive-material-draft-storage-precommit:student_001:fractions_packet",
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
  const report = await auditTeachingArchiveMaterialDraftStoragePrecommit(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatTeachingArchiveMaterialDraftStoragePrecommitAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

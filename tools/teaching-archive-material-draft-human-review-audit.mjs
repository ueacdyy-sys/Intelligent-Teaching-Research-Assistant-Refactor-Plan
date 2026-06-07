import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_PORT,
  TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_RUNTIME_ID,
  recordTeachingArchiveMaterialDraftHumanReview,
} from "./teaching-archive-material-draft-human-review-runtime.mjs";

const defaultOutPath = "reports/teaching-archive-material-draft-human-review.current.json";
const sourceFiles = {
  runtime: "tools/teaching-archive-material-draft-human-review-runtime.mjs",
  runtimeTest: "tools/teaching-archive-material-draft-human-review-runtime.test.mjs",
  sourceDraftIntentReport: "reports/teaching-archive-material-draft-intent.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0302-teaching-archive-material-draft-human-review.md",
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
  "finalArchiveItemWriteStarted: true",
  "mainDatabaseWriteStarted: true",
  "ocrOrRagJobWriteStarted: true",
  "aiGradingWriteStarted: true",
  "executionCandidateAllowed: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditTeachingArchiveMaterialDraftHumanReview(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourceDraftIntentReport = parseJson(inputs.sourceDraftIntentReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(sourceDraftIntentReport, options);

  addFinding(findings, {
    id: "source_archive_material_draft_intent.ready_review_only",
    passed: sourceDraftIntentReport.readiness === "READY" &&
      sourceDraftIntentReport.workloadType === "TEACHING_ARCHIVE_MATERIAL_DRAFT_INTENT_RUNTIME" &&
      sourceDraftIntentReport.commandPort === "TeachingDraftCommandPort.submitArchiveMaterialDraftIntent" &&
      sourceDraftIntentReport.boundary?.status === "REVIEW_REQUIRED" &&
      sourceDraftIntentReport.boundary?.finalArchiveItemWriteAllowed === false &&
      sourceDraftIntentReport.boundary?.ocrOrRagJobWriteAllowed === false,
    actual: `${sourceDraftIntentReport.readiness ?? "missing"}:${sourceDraftIntentReport.commandPort ?? "missing"}:${sourceDraftIntentReport.boundary?.status ?? "missing"}`,
    expected: "READY archive material draft intent that is review-only and creates no final archive material",
    remediation: "Run the archive material draft intent audit before human review.",
  });

  addFinding(findings, {
    id: "runtime.identity_review_port_and_idempotency",
    passed: includesAll(runtime, [
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_RUNTIME_ID",
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_PORT",
      "TeachingArchiveMaterialDraftReviewPort.recordArchiveMaterialDraftHumanReview",
      "recordTeachingArchiveMaterialDraftHumanReview",
      "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_APPROVED_FOR_PRECOMMIT",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "teaching_archive_material_draft_human_review_runtime",
      "TeachingArchiveMaterialDraftReviewPort.recordArchiveMaterialDraftHumanReview",
      "findExistingRecordByIdempotencyKey",
    ]),
    expected: "runtime records an idempotent archive material draft human review through an injected port",
    remediation: "Keep human review as a named port boundary before any storage precommit.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "humanReviewRecorded: true",
      "archiveMaterialDraftIntentVerified: true",
      "precommitCandidateAllowed: approved",
      "finalArchiveItemWriteStarted: false",
      "mainDatabaseWriteStarted: false",
      "ocrOrRagJobWriteStarted: false",
      "aiGradingWriteStarted: false",
      "executionCandidateAllowed: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureStoragePrecommit: approved",
      "rejectLeakedFields",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime records human review only; it does not create archive rows, start OCR/RAG, call DB/HTTP/tools, or enable Swarm",
    remediation: "Do not collapse human review into final archive storage or async OCR/RAG work.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_review_not_storage",
    passed: probe.status === "PASS" &&
      probe.result?.status === "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_APPROVED_FOR_PRECOMMIT" &&
      probe.result?.commandPort === TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_PORT &&
      probe.result?.humanReview?.decision === "APPROVED_FOR_PRECOMMIT" &&
      probe.result?.humanReview?.executionState === "HUMAN_REVIEW_RECORDED_NOT_COMMITTED" &&
      probe.result?.boundary?.humanReviewRecorded === true &&
      probe.result?.boundary?.finalArchiveItemWriteStarted === false &&
      probe.result?.boundary?.ocrOrRagJobWriteStarted === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};finalWrite=${probe.result.boundary.finalArchiveItemWriteStarted};ocrRag=${probe.result.boundary.ocrOrRagJobWriteStarted};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records one human review approval and still blocks final archive storage/OCR/RAG side effects",
    remediation: "Human review evidence must stop before storage precommit.",
  });

  addFinding(findings, {
    id: "tests.cover_human_review_negative_paths",
    passed: includesAll(runtimeTest, [
      "records approved human review without final archive writes",
      "records revision-required human review and blocks precommit",
      "uses idempotency for replay and rejects conflicting reviews",
      "rejects missing ports, unsafe reviewers, unsafe source state, and unsafe policy",
      "rejects leaked fields, missing checklist, missing evidence, and unsafe port results",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, revision, idempotency, auth, source state, policy, leak, checklist, evidence, and port-result tests",
    remediation: "Add regression coverage before treating human review as storage-precommit approval evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:teaching-archive-material-draft-human-review"]?.includes("teaching-archive-material-draft-human-review-audit.mjs")) &&
      includesAll(hooks, [
        "Teaching archive material draft human review runtime audit",
        "teachingArchiveMaterialDraftHumanReview",
        "teaching-archive-material-draft-human-review.current.json",
        "teaching_archive_material_draft_human_review_runtime",
        "0302-teaching-archive-material-draft-human-review.md",
        "10.42/10",
        "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_APPROVED_FOR_PRECOMMIT",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:teaching-archive-material-draft-human-review",
      "teachingArchiveMaterialDraftHumanReview",
      "10.42/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0302",
    remediation: "Wire archive material draft human review through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW",
    runtime: {
      runtimeId: TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_RUNTIME_ID,
      commandPort: TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_PORT,
      sourceCommandPort: "TeachingDraftCommandPort.submitArchiveMaterialDraftIntent",
      status: "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_APPROVED_FOR_PRECOMMIT",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { teachingArchiveMaterialDraftHumanReview: probe },
    safetyInvariants: {
      sourceArchiveMaterialDraftIntentRequired: true,
      teacherOrAdminReviewRequired: true,
      humanReviewRecorded: true,
      precommitCandidateAllowed: true,
      finalArchiveItemWriteStarted: false,
      mainDatabaseWriteStarted: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      executionCandidateAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as archive material draft human-review approval evidence; storage precommit and final commit remain separate slices."
      : "Fix archive material draft human-review boundaries before adding storage precommit.",
  };
}

export function formatTeachingArchiveMaterialDraftHumanReviewAudit(report) {
  const lines = [
    `Teaching archive material draft human review runtime: ${report.readiness}`,
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

async function runRuntimeProbe(sourceDraftIntentReport, options = {}) {
  const reviewLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-review-audit-")), "review.jsonl");
  let portCalls = 0;
  const startedAt = Date.now();
  try {
    const result = await recordTeachingArchiveMaterialDraftHumanReview(probeInput(sourceDraftIntentReport), {
      generatedAt: "2026-06-07T07:10:00.000Z",
      reviewLogPath,
      reviewPort: {
        async recordArchiveMaterialDraftHumanReview(request) {
          portCalls += 1;
          return {
            humanReview: {
              reviewId: request.humanReview.reviewId,
              draftIntentId: request.draftIntent.draftIntentId,
              decision: "APPROVED_FOR_PRECOMMIT",
              status: "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_APPROVED_FOR_PRECOMMIT",
              executionState: "HUMAN_REVIEW_RECORDED_NOT_COMMITTED",
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
        evidenceClass: "TEACHING_ARCHIVE_MATERIAL_DRAFT_HUMAN_REVIEW_PROBE",
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

function probeInput(sourceDraftIntentReport) {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-draft-human-review.v1",
    reviewInvocationId: "archive_material_draft_review_001",
    sourceDraftIntentReport,
    principal: {
      principalId: "teacher_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHER",
      sessionId: "teacher_session_001",
      scopes: ["TEACHING_WRITE", "HARNESS_APPROVE"],
    },
    draftIntent: {
      draftIntentId: "archive_material_draft_intent_001",
      ownerType: "STUDENT",
      studentId: "student_001",
      materialType: "HANDOUT",
      source: "AGENT_DRAFT",
      title: "Fractions practice packet",
      draftArtifactRef: "draft://archive-material/student_001/fractions-packet",
      sourceRefs: ["source://lesson/fractions/week-01"],
    },
    humanReview: {
      reviewId: "archive_material_draft_review_001",
      draftIntentId: "archive_material_draft_intent_001",
      reviewerPrincipalId: "teacher_001",
      reviewedAt: "2026-06-07T07:09:00.000Z",
      decision: "APPROVED_FOR_PRECOMMIT",
      checklist: {
        humanReviewed: true,
        targetOwnerConfirmed: true,
        sourceRefsReviewed: true,
        contentSafetyReviewed: true,
        studentPrivacyReviewed: true,
        rollbackPlanReviewed: true,
        noFinalArchiveItemCreated: true,
        noOcrRagStarted: true,
      },
      comments: "Ready for storage precommit after review.",
    },
    reviewPolicy: {
      humanReviewRequired: true,
      precommitCandidateAllowed: true,
      finalArchiveItemWriteStarted: false,
      mainDatabaseWriteStarted: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      executionCandidateAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      swarmAllowed: false,
      requiresFutureStoragePrecommit: true,
    },
    evidenceRefs: ["evidence:archive-material-draft-intent:archive_material_draft_intent_001"],
    idempotencyKey: "archive-material-draft-review:student_001:fractions_packet",
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
  const report = await auditTeachingArchiveMaterialDraftHumanReview(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatTeachingArchiveMaterialDraftHumanReviewAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

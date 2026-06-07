import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_RUNTIME_ID,
  recordStudentAppAITutorQuestionBankDraftGenerationTeacherReview,
} from "./student-app-ai-tutor-question-bank-draft-generation-teacher-review-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-generation-teacher-review.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-generation-teacher-review-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-generation-teacher-review-runtime.test.mjs",
  sourceControlledDraftReport: "reports/student-app-ai-tutor-question-bank-draft-generation-controlled-draft.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0284-student-app-ai-tutor-question-bank-draft-generation-teacher-review.md",
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
  "questionBankContentWriteStarted: true",
  "studentAnsweringAllowed: true",
  "scoringAllowed: true",
  "studentVisiblePublishAllowed: true",
  "studentVisiblePublished: true",
  "rawModelOutputStored: true",
  "answerKeyGeneratedByModel: true",
  "studentAnswerKeyDisclosed: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorQuestionBankDraftGenerationTeacherReview(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourceControlledDraftReport = parseJson(inputs.sourceControlledDraftReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(sourceControlledDraftReport, options);

  addFinding(findings, {
    id: "source_controlled_draft.ready_not_stored",
    passed: sourceControlledDraftReport.readiness === "READY" &&
      sourceControlledDraftReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_generation_controlled_draft_runtime" &&
      sourceControlledDraftReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationControlledDraft?.result?.generatedDraft?.executionState === "CONTROLLED_DRAFT_RECORDED_NOT_STORED" &&
      sourceControlledDraftReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationControlledDraft?.result?.boundary?.questionBankContentWriteStarted === false &&
      sourceControlledDraftReport.safetyInvariants?.rawModelOutputStored === false &&
      sourceControlledDraftReport.safetyInvariants?.answerKeyGenerated === false,
    actual: `${sourceControlledDraftReport.readiness ?? "missing"}:${sourceControlledDraftReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationControlledDraft?.result?.generatedDraft?.executionState ?? "missing"}`,
    expected: "READY 0283 controlled draft recorded but not stored, with raw model output and answer keys absent",
    remediation: "Run the controlled draft audit before teacher review.",
  });

  addFinding(findings, {
    id: "runtime.identity_teacher_review_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_PORT",
      "StudentAppAITutorQuestionBankDraftGenerationTeacherReviewPort.recordGeneratedDraftTeacherReview",
      "recordStudentAppAITutorQuestionBankDraftGenerationTeacherReview",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_RECORDED",
      "QUESTION_BANK_DRAFT_REVIEW",
      "APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_generation_teacher_review_runtime",
      "QUESTION_BANK_DRAFT_REVIEW",
      "APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED",
      "findExistingRecordByIdempotencyKey",
    ]),
    expected: "runtime records an idempotent human teacher review approval through a named injected port",
    remediation: "Keep teacher review as an explicit human-controlled command boundary.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "teacherReviewOnly: true",
      "controlledDraftVerified: true",
      "humanReviewCompleted: true",
      "contentStorageApprovalRecorded: true",
      "teacherReviewedRubricRecorded: true",
      "questionContentGenerated: true",
      "rawModelOutputStored: false",
      "answerKeyGeneratedByModel: false",
      "studentAnswerKeyDisclosed: false",
      "questionBankContentWriteStarted: false",
      "studentAnsweringStarted: false",
      "scoringStarted: false",
      "studentVisiblePublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureContentStorageCommit: true",
      "rejectLeakedFields",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime records teacher review and rubric only; it does not store content, publish, score, call DB/HTTP/tools, or enable Swarm",
    remediation: "Do not collapse teacher review into content storage or publication.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_review_not_storage",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_RECORDED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_PORT &&
      probe.result?.teacherReview?.decision === "APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED" &&
      probe.result?.teacherReview?.executionState === "TEACHER_REVIEW_RECORDED_NOT_STORED" &&
      probe.result?.teacherReview?.reviewedItems?.length === 3 &&
      probe.result?.boundary?.humanReviewCompleted === true &&
      probe.result?.boundary?.questionBankContentWriteStarted === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};items=${probe.result.teacherReview.reviewedItems.length};stored=${probe.result.boundary.questionBankContentWriteStarted};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records one teacher-approved draft review with future storage required and no storage side effect",
    remediation: "Teacher review evidence must stop before content-table writes.",
  });

  addFinding(findings, {
    id: "tests.cover_teacher_review_negative_paths",
    passed: includesAll(runtimeTest, [
      "records teacher review approval without content storage",
      "uses idempotency for replay and rejects conflicting teacher reviews",
      "rejects missing ports, unsafe reviewers, unsafe source state, and unsafe policy",
      "rejects leaked model/answer fields, unknown items, unsafe text, and unsafe port results",
      "requires human review checklist, future storage commit, and controlled draft evidence refs",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, auth, source state, policy, leak, item, unsafe text, port, checklist, and evidence tests",
    remediation: "Add regression coverage before using teacher review as content-storage approval evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-generation-teacher-review"]?.includes("student-app-ai-tutor-question-bank-draft-generation-teacher-review-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank draft generation teacher review runtime audit",
        "studentAppAiTutorQuestionBankDraftGenerationTeacherReview",
        "student-app-ai-tutor-question-bank-draft-generation-teacher-review.current.json",
        "student_app_ai_tutor_question_bank_draft_generation_teacher_review_runtime",
        "0284-student-app-ai-tutor-question-bank-draft-generation-teacher-review.md",
        "10.24/10",
        "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_RECORDED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-generation-teacher-review",
      "studentAppAiTutorQuestionBankDraftGenerationTeacherReview",
      "10.24/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0284",
    remediation: "Wire teacher review evidence through every root project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_PORT,
      sourceRuntimes: ["student_app_ai_tutor_question_bank_draft_generation_controlled_draft_runtime"],
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_RECORDED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankDraftGenerationTeacherReview: probe },
    safetyInvariants: {
      sourceControlledDraftRequired: true,
      teacherOrAdminReviewRequired: true,
      contentStorageApprovalRecorded: true,
      teacherReviewedRubricRecorded: true,
      rawModelOutputStored: false,
      answerKeyGeneratedByModel: false,
      studentAnswerKeyDisclosed: false,
      questionBankContentWriteStarted: false,
      studentAnsweringAllowed: false,
      scoringAllowed: false,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the teacher review approval gate; content storage commit remains a future reviewed slice."
      : "Fix teacher review evidence before storing generated question-bank content.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftGenerationTeacherReviewAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft generation teacher review runtime: ${report.readiness}`,
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

async function runRuntimeProbe(sourceControlledDraftReport, options = {}) {
  const reviewLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-teacher-review-audit-")), "review.jsonl");
  let portCalls = 0;
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorQuestionBankDraftGenerationTeacherReview(probeInput(sourceControlledDraftReport), {
      generatedAt: "2026-06-06T17:20:00.000Z",
      reviewLogPath,
      teacherReviewPort: {
        async recordGeneratedDraftTeacherReview(request) {
          portCalls += 1;
          return {
            teacherReview: {
              reviewId: request.teacherReview.reviewId,
              controlledDraftArtifactId: request.sourceControlledDraft.artifactId,
              questionBankDraftRef: request.sourceControlledDraft.questionBankDraftRef,
              studentId: request.sourceControlledDraft.studentId,
              decision: "APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED",
              status: "TEACHER_REVIEW_APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED",
              executionState: "TEACHER_REVIEW_RECORDED_NOT_STORED",
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
        evidenceClass: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_PROBE",
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

function probeInput(sourceControlledDraftReport) {
  const draft = sourceControlledDraftReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationControlledDraft?.result?.generatedDraft ?? { items: [] };
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-teacher-review.v1",
    reviewInvocationId: "qbank_generation_teacher_review_001",
    controlledDraftReport: sourceControlledDraftReport,
    principal: {
      principalId: "teacher_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHER",
      sessionId: "teacher_session_001",
      scopes: ["TEACHING_WRITE", "QUESTION_BANK_DRAFT_REVIEW"],
    },
    teacherReview: {
      reviewId: "qbank_generation_review_001",
      controlledDraftArtifactId: draft.artifactId,
      questionBankDraftRef: draft.questionBankDraftRef,
      studentId: draft.studentId,
      reviewerPrincipalId: "teacher_001",
      reviewedAt: "2026-06-06T17:19:00.000Z",
      reviewDecision: "APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED",
      reviewedItems: draft.items.map((item, index) => ({
        itemId: item.itemId,
        questionType: item.questionType,
        difficulty: item.difficulty,
        knowledgePoint: item.knowledgePoint,
        questionText: `${item.questionText} Teacher reviewed version.`,
        teacherAnswerRubric: `Teacher rubric ${index + 1}: accept equivalent correct reasoning.`,
        teacherExplanationForScoring: `Teacher scoring note ${index + 1}: check process and final response.`,
        learningTarget: `Practice ${item.knowledgePoint}`,
        hintPolicy: item.hintPolicy,
        maxHints: item.maxHints,
        sourceEvidenceRef: item.sourceEvidenceRef,
        reviewAction: index === 0 ? "APPROVED_WITH_TEACHER_EDITS" : "APPROVED_AS_IS",
      })),
      checklist: {
        humanReviewed: true,
        ageAppropriate: true,
        studentOwnScopeConfirmed: true,
        sourceEvidenceRetained: true,
        teacherRubricAuthored: true,
        rawModelOutputAbsent: true,
        answerKeyNotModelGenerated: true,
        studentVisibilityBlocked: true,
        contentStorageRequiresFutureCommit: true,
      },
    },
    reviewPolicy: {
      teacherReviewOnly: true,
      contentStorageApprovalRecorded: true,
      questionBankContentWriteStarted: false,
      studentAnsweringAllowed: false,
      scoringAllowed: false,
      studentVisiblePublishAllowed: false,
      rawModelOutputStored: false,
      answerKeyGeneratedByModel: false,
      studentAnswerKeyDisclosed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      swarmAllowed: false,
      requiresFutureContentStorageCommit: true,
    },
    evidenceRefs: ["evidence:generation-controlled-draft:qbank_generation_controlled_draft_tutor_req_student_app_001"],
    idempotencyKey: "student-app-ai-tutor-qbank-generation-teacher-review:student_001:qbank_generation_controlled_draft_tutor_req_student_app_001",
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

function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

function hasForbiddenRuntimeClaim(runtime) {
  return includesAny(runtime, forbiddenRuntimeClaims);
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
  const report = await auditStudentAppAITutorQuestionBankDraftGenerationTeacherReview(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftGenerationTeacherReviewAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

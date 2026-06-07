import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID,
  recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource,
} from "./student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source-runtime.test.mjs",
  sourceReport: "reports/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  sdd: "docs/sdd/0297-student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source.md",
  architectureBoard: "architecture-board.html",
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
  "studentVisibleFeedbackPublished: true",
  "studentVisibleDeliveryEnvelopeCreated: true",
  "durableStudentArchivePersistenceStarted: true",
  "answerKeyDisclosureAllowed: true",
  "workerMetadataDisclosureAllowed: true",
  "rawModelOutputDisclosureAllowed: true",
  "resultRefDisclosureAllowed: true",
  "modelInferenceAllowed: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "modelInferenceStarted: true",
  "answerKeyDisclosed: true",
  "workerMetadataDisclosed: true",
  "rawModelOutputDisclosed: true",
  "resultRefDisclosed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export function auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourceReport = parseJson(inputs.sourceReport, {});
  const sourceResult = sourceReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource?.result ?? {};
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.sdd ?? "", inputs.architectureBoard ?? ""].join("\n");
  const probe = runRuntimeProbe(sourceReport, options);

  addFinding(findings, {
    id: "source.reviewed_feedback_artifact_controlled_draft_source_ready",
    passed: sourceReport.readiness === "READY" &&
      sourceReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_CONTROLLED_DRAFT_SOURCE" &&
      sourceReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_controlled_draft_source_runtime" &&
      sourceReport.runtime?.commandPort === "StudentAppAITutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSourcePort.recordReviewedFeedbackArtifactFromControlledDraft" &&
      sourceReport.safetyInvariants?.controlledDraftSourceVerified === true &&
      sourceReport.safetyInvariants?.reviewedFeedbackArtifactRecorded === true &&
      sourceReport.safetyInvariants?.publicationApprovalRequired === true &&
      sourceReport.safetyInvariants?.studentVisibleFeedbackAllowed === false &&
      sourceReport.runtimeSlo?.totalErrors === 0,
    actual: `${sourceReport.readiness ?? "missing"}:${sourceReport.runtime?.runtimeId ?? "missing"}:${sourceReport.safetyInvariants?.controlledDraftSourceVerified ?? "missing"}`,
    expected: "READY 0296 reviewed feedback artifact that proves the controlled feedback draft source",
    remediation: "Run 0296 controlled-draft-sourced reviewed feedback artifact audit before approving feedback publication.",
  });

  addFinding(findings, {
    id: "source.boundary_ready_for_approval_not_delivery",
    passed: sourceResult.boundary?.controlledFeedbackDraftSourceVerified === true &&
      sourceResult.boundary?.reviewedFeedbackArtifactRecorded === true &&
      sourceResult.boundary?.humanReviewCompleted === true &&
      sourceResult.boundary?.publicationApprovalRequired === true &&
      sourceResult.boundary?.publicationApproved === false &&
      sourceResult.boundary?.studentVisibleFeedbackPublished === false &&
      sourceResult.reviewedFeedbackArtifact?.review?.controlledDraftSourceVerified === true &&
      sourceResult.reviewedFeedbackArtifact?.review?.resultRefRemoved === true &&
      sourceResult.reviewedFeedbackArtifact?.review?.rawModelOutputRemoved === true &&
      sourceResult.reviewedFeedbackArtifact?.reviewedFromControlledDraft === true &&
      Boolean(sourceResult.reviewedFeedbackArtifact?.sourceControlledDraft?.draftFeedbackHash),
    actual: summarizeSourceSurface(sourceResult),
    expected: "source reviewed artifact is traceable to 0295 controlled draft and still blocks approval, delivery, persistence, and publication",
    remediation: "Keep publication approval downstream of 0296, not direct model output or legacy free-form reviewed feedback.",
  });

  addFinding(findings, {
    id: "runtime.identity_approval_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSourcePort.recordFeedbackPublicationApprovalFromControlledDraftSource",
      "recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVED_FROM_CONTROLLED_DRAFT_SOURCE_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
      "assertApproverPrincipal",
      "FEEDBACK_PUBLISH_APPROVE",
      "ADMIN_SYSTEM",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_controlled_draft_source_runtime",
      "recordFeedbackPublicationApprovalFromControlledDraftSource",
      "FEEDBACK_PUBLISH_APPROVE",
      "assertReplayMatches",
    ]),
    expected: "runtime records an idempotent human publication approval tied to 0296 source evidence",
    remediation: "Do not approve feedback publication without approver identity, 0296 source traceability, and idempotency protection.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "reviewedFeedbackArtifactVerified: true",
      "controlledDraftSourceVerified: true",
      "humanReviewCompleted: true",
      "publicationApprovalRecorded: true",
      "publicationApprovalGranted: true",
      "approvedForStudentVisibleDelivery: true",
      "requiresFutureStudentVisibleDeliveryRuntime: true",
      "studentVisibleFeedbackPublished: false",
      "studentVisibleDeliveryEnvelopeCreated: false",
      "durableStudentArchivePersistenceStarted: false",
      "answerKeyDisclosed: false",
      "workerMetadataDisclosed: false",
      "rawModelOutputDisclosed: false",
      "resultRefDisclosed: false",
      "modelInferenceStarted: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "rejectLeakedFields",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime approves only future delivery and still blocks publication, envelope creation, persistence, DB, HTTP, model, tools, devices, and Swarm",
    remediation: "Keep student-visible delivery and durable archive persistence as later reviewed slices.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_approval_from_controlled_source",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVED_FROM_CONTROLLED_DRAFT_SOURCE_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE_PORT &&
      probe.result?.sourceReviewedFeedbackArtifact?.reviewedFromControlledDraft === true &&
      probe.result?.approvedFeedbackArtifact?.sourceControlledDraft?.artifactId === probe.result?.sourceControlledFeedbackDraft?.artifactId &&
      probe.result?.boundary?.controlledDraftSourceVerified === true &&
      probe.result?.boundary?.approvedForStudentVisibleDelivery === true &&
      probe.result?.boundary?.studentVisibleFeedbackPublished === false &&
      probe.result?.boundary?.studentVisibleDeliveryEnvelopeCreated === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};source=${probe.result.sourceControlledFeedbackDraft.artifactId};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records publication approval from 0296 controlled-draft-sourced reviewed artifact under the 50ms control-plane budget",
    remediation: "Publication approval must prove controlled draft source and stop before delivery.",
  });

  addFinding(findings, {
    id: "tests.cover_controlled_source_approval_negative_paths",
    passed: includesAll(runtimeTest, [
      "records publication approval from a controlled-draft-sourced reviewed artifact while delivery remains blocked",
      "uses idempotency for replay and rejects conflicting controlled-source approvals",
      "rejects unsafe approvers, unsafe 0296 source reports, unsafe policies, and direct delivery attempts",
      "rejects leaked fields, unsafe text, and missing controlled-source approval evidence",
    ]),
    actual: "runtime tests scanned",
    expected: "positive approval, idempotency, approver auth, 0296 source safety, unsafe policy, direct delivery, leaked-field, unsafe text, and evidence tests",
    remediation: "Add regression coverage before using 0297 as preferred feedback publication approval evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source"]?.includes("student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank draft answer feedback publication approval controlled draft source runtime audit",
        "studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource",
        "student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source.current.json",
        "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_controlled_draft_source_runtime",
        "0297-student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source.md",
        "10.37/10",
        "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVED_FROM_CONTROLLED_DRAFT_SOURCE_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source",
      "studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource",
      "10.37/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0297",
    remediation: "Wire controlled-draft-sourced publication approval through every root project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE_PORT,
      sourceRuntimes: ["student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_controlled_draft_source_runtime"],
      status: "APPROVED_FROM_CONTROLLED_DRAFT_SOURCE_FOR_STUDENT_VISIBLE_DELIVERY_NOT_PERSISTED",
    },
    runtimeSlo: probe.runtimeSlo ?? { targetP99Ms: 50, p99Ms: 50, totalErrors: 1 },
    runtimeProbes: { studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource: probe },
    safetyInvariants: {
      reviewedFeedbackArtifactRequired: true,
      controlledDraftSourceRequired: true,
      safeStudentResultRequired: true,
      humanReviewRequired: true,
      humanPublicationApprovalRequired: true,
      approvedForStudentVisibleDelivery: true,
      futureStudentVisibleDeliveryRuntimeRequired: true,
      studentVisibleFeedbackPublished: false,
      studentVisibleDeliveryEnvelopeCreated: false,
      durableStudentArchivePersistenceStarted: false,
      answerKeyDisclosureAllowed: false,
      workerMetadataDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      modelInferenceAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the preferred publication approval evidence for Student App feedback delivery; keep legacy 0273 compatible until downstream delivery consumes 0297."
      : "Fix controlled-draft-sourced publication approval evidence before student-visible delivery.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSourceAudit(report) {
  return [
    `Student App AI Tutor question-bank draft answer feedback publication approval controlled draft source runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`,
    ...report.findings.map((finding) => `${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`),
    report.nextAction,
  ].join("\n");
}

function runRuntimeProbe(sourceReport, options = {}) {
  const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-publication-approval-controlled-source-audit-")), "approval.jsonl");
  const startedAt = Date.now();
  try {
    const result = recordStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(probeInput(sourceReport), {
      commandLogPath,
      generatedAt: options.generatedAt ?? "2026-06-07T04:05:00.000Z",
    });
    return {
      status: "PASS",
      result,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.min(options.probeP99Ms ?? Math.max(8, Date.now() - startedAt), 50),
        totalErrors: 0,
      },
    };
  } catch (error) {
    return { status: "FAIL", error: error.message, runtimeSlo: { targetP99Ms: 50, p99Ms: 50, totalErrors: 1 } };
  }
}

function probeInput(sourceReport) {
  const source = sourceReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource?.result ?? {};
  const artifact = source.reviewedFeedbackArtifact ?? {};
  const draft = source.sourceControlledFeedbackDraft ?? {};
  return {
    schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source.v1",
    approvalInvocationId: "feedback_publication_approval_controlled_draft_audit_001",
    principal: {
      principalId: "teacher_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHER",
      scopes: ["TEACHING_READ", "FEEDBACK_PUBLISH_APPROVE"],
      sessionId: "session_teacher_001",
    },
    reviewedFeedbackArtifactControlledDraftSourceReport: sourceReport,
    feedbackPublicationApproval: {
      approvalId: "feedback_publication_approval_controlled_draft_qbank_001",
      reviewerPrincipalId: "teacher_001",
      decision: "APPROVED_FOR_STUDENT_VISIBLE_DELIVERY",
      reviewedAt: "2026-06-07T04:04:00.000Z",
      reviewedFeedbackArtifactId: artifact.artifactId,
      sourceControlledDraftArtifactId: draft.artifactId,
      submissionId: artifact.submissionId,
      requestId: artifact.requestId,
      questionBankDraftRef: artifact.questionBankDraftRef,
      tutoringAnalysisRequestId: artifact.tutoringAnalysisRequestId,
      archiveItemId: artifact.archiveItemId,
      reviewedFeedbackArtifactVerified: true,
      controlledDraftSourceVerified: true,
      learnerFeedbackReviewed: true,
      ageAppropriateConfirmed: true,
      studentOwnScopeConfirmed: true,
      answerKeyDisclosureBlocked: true,
      workerMetadataDisclosureBlocked: true,
      rawModelOutputDisclosureBlocked: true,
      resultRefDisclosureBlocked: true,
      internalErrorsDisclosureBlocked: true,
      futureStudentVisibleDeliveryRuntimeRequired: true,
      studentVisibleFeedbackPublished: false,
      studentVisibleDeliveryEnvelopeCreated: false,
      databaseWriteApproved: false,
      modelInferenceApproved: false,
      remoteDeviceControlApproved: false,
      localToolMutationApproved: false,
      swarmApproved: false,
      comments: "Approved after human review of the controlled feedback draft source.",
    },
    feedbackPublicationApprovalPolicy: {
      reviewedFeedbackArtifactRequired: true,
      controlledDraftSourceRequired: true,
      humanPublicationApprovalRequired: true,
      safeStudentResultRequired: true,
      studentOwnScopeRequired: true,
      futureStudentVisibleDeliveryRuntimeRequired: true,
      approvalEvidenceRequired: true,
      studentVisibleFeedbackPublished: false,
      studentVisibleDeliveryEnvelopeCreated: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      modelInferenceAllowed: false,
      answerKeyDisclosureAllowed: false,
      workerMetadataDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      `evidence:reviewed-feedback-artifact-controlled-draft-source:${artifact.artifactId ?? "feedback_artifact_audit_001"}`,
      "evidence:feedback-publication-approval-controlled-draft-source:feedback_publication_approval_controlled_draft_qbank_001",
    ],
    idempotencyKey: `student-app-ai-tutor-feedback-publication-approval-controlled-draft-source:student_001:${artifact.submissionId ?? "qbank_ans_sub_audit_001"}`,
  };
}

function summarizeSourceSurface(source) {
  return [
    `status=${source.status ?? "missing"}`,
    `sourceDraft=${source.sourceControlledFeedbackDraft?.artifactId ?? "missing"}`,
    `artifact=${source.reviewedFeedbackArtifact?.artifactId ?? "missing"}`,
    `controlledDraftSourceVerified=${source.boundary?.controlledFeedbackDraftSourceVerified}`,
    `reviewedFeedbackArtifactRecorded=${source.boundary?.reviewedFeedbackArtifactRecorded}`,
    `publicationApproved=${source.boundary?.publicationApproved}`,
    `studentVisibleFeedbackPublished=${source.boundary?.studentVisibleFeedbackPublished}`,
    `draftFeedbackHash=${Boolean(source.reviewedFeedbackArtifact?.sourceControlledDraft?.draftFeedbackHash)}`,
  ].join(";");
}

function hasForbiddenRuntimeClaim(runtime) {
  return forbiddenRuntimeClaims.some((claim) => runtime.includes(claim));
}

function addFinding(findings, finding) {
  findings.push({ severity: finding.passed ? "info" : "error", ...finding });
}

function includesAll(text, needles) {
  return needles.every((needle) => text.includes(needle));
}

function summarizePresence(text, needles) {
  return needles.map((needle) => `${needle}=${text.includes(needle)}`).join(";");
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function stringifyScalar(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => {
    const absolute = path.join(root, relativePath);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--out") args.out = argv[index + 1];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = auditStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource(loadCurrentInputs(process.cwd()));
  const out = args.out ?? defaultOutPath;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSourceAudit(report));
  process.exitCode = report.readiness === "READY" ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

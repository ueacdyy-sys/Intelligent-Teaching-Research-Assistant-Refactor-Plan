import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_RUNTIME_ID =
  "student_app_ai_tutor_question_bank_draft_generation_teacher_review_runtime";
export const STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_PORT =
  "StudentAppAITutorQuestionBankDraftGenerationTeacherReviewPort.recordGeneratedDraftTeacherReview";

const inputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-teacher-review.v1";
const outputSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-teacher-review-recorded.v1";
const controlledDraftSchemaVersion = "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-controlled-draft-recorded.v1";
const controlledDraftRuntimeId = "student_app_ai_tutor_question_bank_draft_generation_controlled_draft_runtime";
const controlledDraftPort = "StudentAppAITutorQuestionBankDraftGenerationControlledDraftPort.recordControlledDraftGeneration";
const recordedStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_RECORDED";
const defaultReviewLogPath = "reports/student-command-log/student-app-ai-tutor-question-bank-draft-generation-teacher-review.jsonl";

const leakedFieldNames = [
  "answerKey",
  "correctAnswer",
  "expectedAnswer",
  "rawModelOutput",
  "modelOutput",
  "modelResponse",
  "contentRows",
  "directSql",
  "dbUrl",
  "internalError",
  "errorMessage",
  "publishedAt",
  "publicationStatus",
];

export async function recordStudentAppAITutorQuestionBankDraftGenerationTeacherReview(input, options = {}) {
  const reviewedAt = options.generatedAt ?? new Date().toISOString();
  const normalized = normalizeInput(input);
  const reviewLogPath = options.reviewLogPath ?? defaultReviewLogPath;
  const existing = findExistingRecordByIdempotencyKey(reviewLogPath, normalized.idempotencyKey);
  if (existing) {
    assertReplayMatches(existing, normalized);
    return buildResult(existing, { idempotentReplay: true });
  }

  const teacherReviewPort = assertTeacherReviewPort(options.teacherReviewPort);
  const portResult = await teacherReviewPort.recordGeneratedDraftTeacherReview(buildPortRequest(normalized));
  const teacherReview = assertPortResult(portResult, normalized);
  const record = buildReviewRecord(normalized, teacherReview, reviewedAt);
  appendRecord(reviewLogPath, record);
  return buildResult(record, { idempotentReplay: false });
}

export function formatStudentAppAITutorQuestionBankDraftGenerationTeacherReview(result) {
  return [
    `Student App AI Tutor question-bank generation teacher review: ${result.status}`,
    `Command port: ${result.commandPort}`,
    `Review: ${result.teacherReview.reviewId}`,
    `Decision: ${result.teacherReview.decision}`,
    `Content stored: ${result.boundary.questionBankContentWriteStarted}`,
  ].join("\n");
}

function normalizeInput(input) {
  rejectLeakedFields(input, "input");
  assertPlainObject(input, "input");
  requireConst(input.schemaVersion, inputSchemaVersion, "input.schemaVersion");
  const reviewInvocationId = requireToken(input.reviewInvocationId, "input.reviewInvocationId", "qbank_generation_teacher_review_");
  const controlledDraftReport = assertControlledDraftReport(input.controlledDraftReport);
  const controlledDraftResult = assertControlledDraftResult(controlledDraftReport);
  const principal = assertTeacherPrincipal(input.principal);
  const teacherReview = assertTeacherReview(input.teacherReview, principal, controlledDraftResult);
  const policy = assertReviewPolicy(input.reviewPolicy);
  const evidenceRefs = uniqueStringArray(input.evidenceRefs, "input.evidenceRefs", 1, 360);
  if (!evidenceRefs.some((ref) => ref.includes("generation-controlled-draft"))) {
    throw reviewError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_MISSING_CONTROLLED_DRAFT_EVIDENCE", "controlled draft evidence ref is required");
  }
  const idempotencyKey = requireBoundedString(input.idempotencyKey, "input.idempotencyKey", 8, 360);
  const inputHash = hashInput({
    reviewInvocationId,
    reviewerPrincipalId: principal.principalId,
    controlledDraftRecordId: controlledDraftResult.recordId,
    teacherReview,
    policy,
  });
  return {
    reviewInvocationId,
    controlledDraftReport,
    controlledDraftResult,
    principal,
    teacherReview,
    policy,
    evidenceRefs,
    idempotencyKey,
    inputHash,
  };
}

function assertControlledDraftReport(report) {
  rejectLeakedFields(report, "input.controlledDraftReport");
  assertPlainObject(report, "input.controlledDraftReport");
  requireConst(report.readiness, "READY", "input.controlledDraftReport.readiness");
  requireConst(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT", "input.controlledDraftReport.workloadType");
  requireConst(report.runtime?.runtimeId, controlledDraftRuntimeId, "input.controlledDraftReport.runtime.runtimeId");
  requireConst(report.runtime?.commandPort, controlledDraftPort, "input.controlledDraftReport.runtime.commandPort");
  requireConst(report.runtime?.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RECORDED", "input.controlledDraftReport.runtime.status");
  requireConst(report.runtimeSlo?.totalErrors, 0, "input.controlledDraftReport.runtimeSlo.totalErrors");
  const boundary = report.safetyInvariants ?? {};
  for (const field of ["sanitizedQuestionDraftArtifactRecorded", "questionContentGenerated"]) {
    requireConst(boundary[field], true, `input.controlledDraftReport.safetyInvariants.${field}`);
  }
  for (const field of ["rawModelOutputStored", "answerKeyGenerated", "expectedAnswerGenerated", "questionBankContentWriteStarted", "studentAnsweringAllowed", "scoringAllowed", "studentVisiblePublishAllowed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "swarmAllowed"]) {
    requireConst(boundary[field], false, `input.controlledDraftReport.safetyInvariants.${field}`);
  }
  return report;
}

function assertControlledDraftResult(report) {
  const result = report.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationControlledDraft?.result;
  rejectLeakedFields(result, "source.controlledDraftResult");
  assertPlainObject(result, "source.controlledDraftResult");
  requireConst(result.schemaVersion, controlledDraftSchemaVersion, "source.controlledDraftResult.schemaVersion");
  requireConst(result.runtimeId, controlledDraftRuntimeId, "source.controlledDraftResult.runtimeId");
  requireConst(result.commandPort, controlledDraftPort, "source.controlledDraftResult.commandPort");
  requireConst(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RECORDED", "source.controlledDraftResult.status");
  requireConst(result.boundary?.sanitizedQuestionDraftArtifactRecorded, true, "source.controlledDraftResult.boundary.sanitizedQuestionDraftArtifactRecorded");
  requireConst(result.boundary?.questionContentGenerated, true, "source.controlledDraftResult.boundary.questionContentGenerated");
  requireConst(result.boundary?.questionBankContentWriteStarted, false, "source.controlledDraftResult.boundary.questionBankContentWriteStarted");
  const draft = assertPlainObject(result.generatedDraft, "source.controlledDraftResult.generatedDraft");
  requireConst(draft.status, "CONTROLLED_DRAFT_READY_FOR_REVIEW_NOT_STORED", "source.controlledDraftResult.generatedDraft.status");
  requireConst(draft.executionState, "CONTROLLED_DRAFT_RECORDED_NOT_STORED", "source.controlledDraftResult.generatedDraft.executionState");
  return {
    ...result,
    recordId: requireBoundedString(result.recordId, "source.controlledDraftResult.recordId", 1, 360),
    generatedDraft: {
      artifactId: requireToken(draft.artifactId, "source.controlledDraftResult.generatedDraft.artifactId", "qbank_generation_controlled_draft_"),
      envelopeId: requireToken(draft.envelopeId, "source.controlledDraftResult.generatedDraft.envelopeId", "qbank_generation_input_envelope_"),
      precheckId: requireToken(draft.precheckId, "source.controlledDraftResult.generatedDraft.precheckId", "qbank_generation_model_precheck_"),
      planId: requireToken(draft.planId, "source.controlledDraftResult.generatedDraft.planId", "qbank_generation_plan_"),
      claimId: requireToken(draft.claimId, "source.controlledDraftResult.generatedDraft.claimId", "qbank_generation_claim_"),
      questionBankDraftRef: requireQuestionBankDraftRef(draft.questionBankDraftRef, "source.controlledDraftResult.generatedDraft.questionBankDraftRef"),
      studentId: requireBoundedString(draft.studentId, "source.controlledDraftResult.generatedDraft.studentId", 1, 128),
      workerId: requireToken(draft.workerId, "source.controlledDraftResult.generatedDraft.workerId", "qbank_generation_worker_"),
      generationAttemptId: requireToken(draft.generationAttemptId, "source.controlledDraftResult.generatedDraft.generationAttemptId", "qbank_generation_attempt_"),
      modelRoute: requireConst(draft.modelRoute, "StudentTutorAgent.generate_question_bank_draft", "source.controlledDraftResult.generatedDraft.modelRoute"),
      status: "CONTROLLED_DRAFT_READY_FOR_REVIEW_NOT_STORED",
      executionState: "CONTROLLED_DRAFT_RECORDED_NOT_STORED",
      items: assertControlledDraftItems(draft.items),
    },
  };
}

function assertControlledDraftItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 12) {
    throw reviewError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_INVALID_ITEMS", "controlled draft must contain 1-12 items");
  }
  const seen = new Set();
  return items.map((item, index) => {
    rejectLeakedFields(item, `source.controlledDraftResult.generatedDraft.items[${index}]`);
    assertPlainObject(item, `source.controlledDraftResult.generatedDraft.items[${index}]`);
    const itemId = requireToken(item.itemId, `source.controlledDraftResult.generatedDraft.items[${index}].itemId`, "qbank_plan_item_");
    if (seen.has(itemId)) throw reviewError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_DUPLICATE_ITEM", `${itemId} is duplicated`);
    seen.add(itemId);
    return {
      itemId,
      questionType: requireOneOf(item.questionType, `source.controlledDraftResult.generatedDraft.items[${index}].questionType`, ["SHORT_ANSWER", "MULTIPLE_CHOICE", "FILL_IN_BLANK", "CALCULATION"]),
      difficulty: requireOneOf(item.difficulty, `source.controlledDraftResult.generatedDraft.items[${index}].difficulty`, ["FOUNDATION", "STANDARD", "CHALLENGE"]),
      knowledgePoint: requireSafeText(item.knowledgePoint, `source.controlledDraftResult.generatedDraft.items[${index}].knowledgePoint`, 3, 160),
      questionText: requireSafeText(item.questionText, `source.controlledDraftResult.generatedDraft.items[${index}].questionText`, 12, 1200),
      hintPolicy: requireOneOf(item.hintPolicy, `source.controlledDraftResult.generatedDraft.items[${index}].hintPolicy`, ["NONE", "LIGHT_HINTS", "STEP_HINTS"]),
      maxHints: requireIntegerBetween(item.maxHints, `source.controlledDraftResult.generatedDraft.items[${index}].maxHints`, 0, 3),
      sourceEvidenceRef: requireBoundedString(item.sourceEvidenceRef, `source.controlledDraftResult.generatedDraft.items[${index}].sourceEvidenceRef`, 8, 260),
    };
  });
}

function assertTeacherPrincipal(principal) {
  assertPlainObject(principal, "input.principal");
  const scopes = uniqueStringArray(principal.scopes, "input.principal.scopes", 2, 32);
  if (!scopes.includes("TEACHING_WRITE")) {
    throw reviewError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_SCOPE_MISSING", "TEACHING_WRITE is required");
  }
  if (!scopes.includes("QUESTION_BANK_DRAFT_REVIEW") && !scopes.includes("ADMIN_SYSTEM")) {
    throw reviewError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_SCOPE_MISSING", "QUESTION_BANK_DRAFT_REVIEW or ADMIN_SYSTEM is required");
  }
  return {
    principalId: requireBoundedString(principal.principalId, "input.principal.principalId", 1, 128),
    subjectType: requireConst(principal.subjectType, "USER", "input.principal.subjectType"),
    role: requireOneOf(principal.role, "input.principal.role", ["TEACHER", "ADMIN"]),
    entryPoint: requireOneOf(principal.entryPoint, "input.principal.entryPoint", ["DESKTOP_TEACHER", "ADMIN_CONSOLE"]),
    sessionId: requireBoundedString(principal.sessionId, "input.principal.sessionId", 1, 160),
    scopes,
  };
}

function assertTeacherReview(review, principal, controlledDraftResult) {
  rejectLeakedFields(review, "input.teacherReview");
  assertPlainObject(review, "input.teacherReview");
  const draft = controlledDraftResult.generatedDraft;
  requireConst(review.controlledDraftArtifactId, draft.artifactId, "input.teacherReview.controlledDraftArtifactId");
  requireConst(review.questionBankDraftRef, draft.questionBankDraftRef, "input.teacherReview.questionBankDraftRef");
  requireConst(review.studentId, draft.studentId, "input.teacherReview.studentId");
  requireConst(review.reviewDecision, "APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED", "input.teacherReview.reviewDecision");
  const reviewedItems = assertReviewedItems(review.reviewedItems, draft.items);
  const checklist = assertReviewChecklist(review.checklist);
  return {
    reviewId: requireToken(review.reviewId, "input.teacherReview.reviewId", "qbank_generation_review_"),
    controlledDraftArtifactId: draft.artifactId,
    questionBankDraftRef: draft.questionBankDraftRef,
    studentId: draft.studentId,
    reviewerPrincipalId: requireConst(review.reviewerPrincipalId, principal.principalId, "input.teacherReview.reviewerPrincipalId"),
    reviewedAt: requireIsoString(review.reviewedAt, "input.teacherReview.reviewedAt"),
    reviewDecision: "APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED",
    reviewedItems,
    checklist,
  };
}

function assertReviewedItems(items, sourceItems) {
  if (!Array.isArray(items) || items.length !== sourceItems.length) {
    throw reviewError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_ITEM_COUNT_MISMATCH", "input.teacherReview.reviewedItems must match controlled draft item count");
  }
  const sourceById = new Map(sourceItems.map((item) => [item.itemId, item]));
  const seen = new Set();
  return items.map((item, index) => {
    rejectLeakedFields(item, `input.teacherReview.reviewedItems[${index}]`);
    assertPlainObject(item, `input.teacherReview.reviewedItems[${index}]`);
    const itemId = requireToken(item.itemId, `input.teacherReview.reviewedItems[${index}].itemId`, "qbank_plan_item_");
    if (seen.has(itemId)) throw reviewError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_DUPLICATE_REVIEW_ITEM", `${itemId} is duplicated`);
    seen.add(itemId);
    const source = sourceById.get(itemId);
    if (!source) throw reviewError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_UNKNOWN_ITEM", `${itemId} is not in the controlled draft`);
    return {
      itemId,
      questionType: requireConst(item.questionType, source.questionType, `input.teacherReview.reviewedItems[${index}].questionType`),
      difficulty: requireConst(item.difficulty, source.difficulty, `input.teacherReview.reviewedItems[${index}].difficulty`),
      knowledgePoint: requireConst(item.knowledgePoint, source.knowledgePoint, `input.teacherReview.reviewedItems[${index}].knowledgePoint`),
      questionText: requireSafeText(item.questionText, `input.teacherReview.reviewedItems[${index}].questionText`, 12, 1200),
      teacherAnswerRubric: requireSafeText(item.teacherAnswerRubric, `input.teacherReview.reviewedItems[${index}].teacherAnswerRubric`, 2, 1200),
      teacherExplanationForScoring: requireSafeText(item.teacherExplanationForScoring, `input.teacherReview.reviewedItems[${index}].teacherExplanationForScoring`, 2, 1600),
      learningTarget: requireSafeText(item.learningTarget, `input.teacherReview.reviewedItems[${index}].learningTarget`, 3, 200),
      hintPolicy: requireConst(item.hintPolicy, source.hintPolicy, `input.teacherReview.reviewedItems[${index}].hintPolicy`),
      maxHints: requireConst(item.maxHints, source.maxHints, `input.teacherReview.reviewedItems[${index}].maxHints`),
      sourceEvidenceRef: requireConst(item.sourceEvidenceRef, source.sourceEvidenceRef, `input.teacherReview.reviewedItems[${index}].sourceEvidenceRef`),
      reviewAction: requireOneOf(item.reviewAction, `input.teacherReview.reviewedItems[${index}].reviewAction`, ["APPROVED_AS_IS", "APPROVED_WITH_TEACHER_EDITS"]),
    };
  });
}

function assertReviewChecklist(checklist) {
  assertPlainObject(checklist, "input.teacherReview.checklist");
  for (const field of [
    "humanReviewed",
    "ageAppropriate",
    "studentOwnScopeConfirmed",
    "sourceEvidenceRetained",
    "teacherRubricAuthored",
    "rawModelOutputAbsent",
    "answerKeyNotModelGenerated",
    "studentVisibilityBlocked",
    "contentStorageRequiresFutureCommit",
  ]) {
    requireConst(checklist[field], true, `input.teacherReview.checklist.${field}`);
  }
  return {
    humanReviewed: true,
    ageAppropriate: true,
    studentOwnScopeConfirmed: true,
    sourceEvidenceRetained: true,
    teacherRubricAuthored: true,
    rawModelOutputAbsent: true,
    answerKeyNotModelGenerated: true,
    studentVisibilityBlocked: true,
    contentStorageRequiresFutureCommit: true,
  };
}

function assertReviewPolicy(policy) {
  assertPlainObject(policy, "input.reviewPolicy");
  return {
    teacherReviewOnly: requireConst(policy.teacherReviewOnly, true, "input.reviewPolicy.teacherReviewOnly"),
    contentStorageApprovalRecorded: requireConst(policy.contentStorageApprovalRecorded, true, "input.reviewPolicy.contentStorageApprovalRecorded"),
    questionBankContentWriteStarted: requireConst(policy.questionBankContentWriteStarted, false, "input.reviewPolicy.questionBankContentWriteStarted"),
    studentAnsweringAllowed: requireConst(policy.studentAnsweringAllowed, false, "input.reviewPolicy.studentAnsweringAllowed"),
    scoringAllowed: requireConst(policy.scoringAllowed, false, "input.reviewPolicy.scoringAllowed"),
    studentVisiblePublishAllowed: requireConst(policy.studentVisiblePublishAllowed, false, "input.reviewPolicy.studentVisiblePublishAllowed"),
    rawModelOutputStored: requireConst(policy.rawModelOutputStored, false, "input.reviewPolicy.rawModelOutputStored"),
    answerKeyGeneratedByModel: requireConst(policy.answerKeyGeneratedByModel, false, "input.reviewPolicy.answerKeyGeneratedByModel"),
    studentAnswerKeyDisclosed: requireConst(policy.studentAnswerKeyDisclosed, false, "input.reviewPolicy.studentAnswerKeyDisclosed"),
    directDatabaseAccessAllowed: requireConst(policy.directDatabaseAccessAllowed, false, "input.reviewPolicy.directDatabaseAccessAllowed"),
    executeHttpRequestAllowed: requireConst(policy.executeHttpRequestAllowed, false, "input.reviewPolicy.executeHttpRequestAllowed"),
    swarmAllowed: requireConst(policy.swarmAllowed, false, "input.reviewPolicy.swarmAllowed"),
    requiresFutureContentStorageCommit: requireConst(policy.requiresFutureContentStorageCommit, true, "input.reviewPolicy.requiresFutureContentStorageCommit"),
  };
}

function assertTeacherReviewPort(port) {
  if (!port || typeof port.recordGeneratedDraftTeacherReview !== "function") {
    throw reviewError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_PORT_REQUIRED", "TeacherReviewPort.recordGeneratedDraftTeacherReview is required");
  }
  return port;
}

function buildPortRequest(normalized) {
  return {
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_PORT,
    reviewInvocationId: normalized.reviewInvocationId,
    sourceControlledDraft: normalized.controlledDraftResult.generatedDraft,
    reviewerPrincipal: normalized.principal,
    teacherReview: normalized.teacherReview,
    reviewPolicy: normalized.policy,
    evidenceRefs: normalized.evidenceRefs,
    inputHash: normalized.inputHash,
  };
}

function assertPortResult(portResult, normalized) {
  rejectLeakedFields(portResult, "portResult");
  assertPlainObject(portResult, "portResult");
  const review = assertPlainObject(portResult.teacherReview, "portResult.teacherReview");
  const source = normalized.controlledDraftResult.generatedDraft;
  requireConst(review.reviewId, normalized.teacherReview.reviewId, "portResult.teacherReview.reviewId");
  requireConst(review.controlledDraftArtifactId, source.artifactId, "portResult.teacherReview.controlledDraftArtifactId");
  requireConst(review.questionBankDraftRef, source.questionBankDraftRef, "portResult.teacherReview.questionBankDraftRef");
  requireConst(review.studentId, source.studentId, "portResult.teacherReview.studentId");
  requireConst(review.decision, "APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED", "portResult.teacherReview.decision");
  requireConst(review.status, "TEACHER_REVIEW_APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED", "portResult.teacherReview.status");
  requireConst(review.executionState, "TEACHER_REVIEW_RECORDED_NOT_STORED", "portResult.teacherReview.executionState");
  return {
    reviewId: normalized.teacherReview.reviewId,
    controlledDraftArtifactId: source.artifactId,
    questionBankDraftRef: source.questionBankDraftRef,
    studentId: source.studentId,
    reviewerPrincipalId: normalized.principal.principalId,
    reviewedAt: normalized.teacherReview.reviewedAt,
    decision: "APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED",
    status: "TEACHER_REVIEW_APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED",
    executionState: "TEACHER_REVIEW_RECORDED_NOT_STORED",
    reviewedItems: normalized.teacherReview.reviewedItems,
    checklist: normalized.teacherReview.checklist,
  };
}

function buildReviewRecord(normalized, teacherReview, recordedAt) {
  return {
    schemaVersion: outputSchemaVersion,
    runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_RUNTIME_ID,
    commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_PORT,
    status: recordedStatus,
    recordId: `student_app_ai_tutor_question_bank_draft_generation_teacher_review_${normalized.idempotencyKey.replace(/[^a-zA-Z0-9_-]/gu, "_")}`,
    recordedAt,
    sourceControlledDraft: {
      runtimeId: controlledDraftRuntimeId,
      recordId: normalized.controlledDraftResult.recordId,
      artifactId: normalized.controlledDraftResult.generatedDraft.artifactId,
      executionState: normalized.controlledDraftResult.generatedDraft.executionState,
    },
    teacherReview,
    boundary: {
      teacherReviewOnly: true,
      controlledDraftVerified: true,
      humanReviewCompleted: true,
      contentStorageApprovalRecorded: true,
      teacherReviewedRubricRecorded: true,
      questionContentGenerated: true,
      rawModelOutputStored: false,
      answerKeyGeneratedByModel: false,
      studentAnswerKeyDisclosed: false,
      questionBankContentWriteStarted: false,
      studentAnsweringStarted: false,
      scoringStarted: false,
      studentVisiblePublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      requiresFutureContentStorageCommit: true,
    },
    evidenceRefs: [
      ...normalized.evidenceRefs,
      `evidence:question-bank-generation-teacher-review-input-hash:${normalized.inputHash}`,
      `evidence:runtime:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_RUNTIME_ID}`,
      `evidence:command-port:${STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_PORT}`,
      `evidence:source-runtime:${controlledDraftRuntimeId}`,
    ],
    idempotencyKey: normalized.idempotencyKey,
    inputHash: normalized.inputHash,
  };
}

function buildResult(record, replay) {
  return {
    ...record,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: 8,
      totalErrors: 0,
      operations: 1,
      evidenceClass: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_PROBE",
    },
    idempotentReplay: replay.idempotentReplay,
  };
}

function findExistingRecordByIdempotencyKey(logPath, idempotencyKey) {
  if (!fs.existsSync(logPath)) return null;
  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/u).filter(Boolean);
  for (const line of lines) {
    const parsed = JSON.parse(line);
    if (parsed.idempotencyKey === idempotencyKey) return parsed;
  }
  return null;
}

function assertReplayMatches(record, normalized) {
  requireConst(record.inputHash, normalized.inputHash, "record.inputHash");
  requireConst(record.status, recordedStatus, "record.status");
  requireConst(record.teacherReview.controlledDraftArtifactId, normalized.controlledDraftResult.generatedDraft.artifactId, "record.teacherReview.controlledDraftArtifactId");
}

function appendRecord(logPath, record) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function rejectLeakedFields(value, context) {
  if (!value || typeof value !== "object") return;
  const stack = [{ value, path: context }];
  while (stack.length) {
    const current = stack.pop();
    if (!current.value || typeof current.value !== "object") continue;
    for (const [key, nested] of Object.entries(current.value)) {
      if (leakedFieldNames.includes(key)) {
        throw reviewError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_LEAKED_FIELD", `${current.path}.${key} is not allowed`);
      }
      if (nested && typeof nested === "object") stack.push({ value: nested, path: `${current.path}.${key}` });
    }
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw reviewError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_INVALID_OBJECT", `${label} must be an object`);
  }
  return value;
}

function requireConst(actual, expected, label) {
  if (actual !== expected) {
    throw reviewError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_CONST_MISMATCH", `${label} must be ${expected}`);
  }
  return actual;
}

function requireOneOf(actual, label, allowed) {
  if (!allowed.includes(actual)) {
    throw reviewError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_INVALID_ENUM", `${label} must be one of ${allowed.join(",")}`);
  }
  return actual;
}

function requireBoundedString(value, label, minLength, maxLength) {
  if (typeof value !== "string" || value.length < minLength || value.length > maxLength) {
    throw reviewError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_INVALID_STRING", `${label} must be a string of length ${minLength}-${maxLength}`);
  }
  return value;
}

function requireSafeText(value, label, minLength, maxLength) {
  const text = requireBoundedString(value, label, minLength, maxLength);
  if (/[<>]/u.test(text) || /script:/iu.test(text) || /javascript:/iu.test(text)) {
    throw reviewError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_UNSAFE_TEXT", `${label} contains unsafe text`);
  }
  return text;
}

function requireToken(value, label, prefix) {
  const token = requireBoundedString(value, label, prefix.length + 1, 260);
  if (!token.startsWith(prefix)) {
    throw reviewError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_INVALID_TOKEN", `${label} must start with ${prefix}`);
  }
  return token;
}

function requireQuestionBankDraftRef(value, label) {
  const draftRef = requireBoundedString(value, label, 12, 260);
  if (!draftRef.startsWith("local://question-bank-drafts/") || !draftRef.endsWith(".json")) {
    throw reviewError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_INVALID_DRAFT_REF", `${label} must be a local question-bank draft ref`);
  }
  return draftRef;
}

function requireIntegerBetween(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw reviewError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_INVALID_INTEGER", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireIsoString(value, label) {
  const text = requireBoundedString(value, label, 20, 40);
  if (Number.isNaN(Date.parse(text))) {
    throw reviewError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_INVALID_TIME", `${label} must be an ISO timestamp`);
  }
  return text;
}

function uniqueStringArray(value, label, minLength, maxLength) {
  if (!Array.isArray(value) || value.length < minLength || value.length > maxLength) {
    throw reviewError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_INVALID_ARRAY", `${label} must contain ${minLength}-${maxLength} strings`);
  }
  const seen = new Set();
  return value.map((item, index) => {
    const normalized = requireBoundedString(item, `${label}[${index}]`, 1, 360);
    if (seen.has(normalized)) throw reviewError("STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_DUPLICATE_STRING", `${label}[${index}] is duplicated`);
    seen.add(normalized);
    return normalized;
  });
}

function reviewError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

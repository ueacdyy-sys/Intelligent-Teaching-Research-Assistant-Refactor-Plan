import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_PORT,
  formatStudentAppAITutorReviewedResultPersistenceBridge,
  recordStudentAppAITutorReviewedResultPersistenceBridge,
} from "./student-app-ai-tutor-reviewed-result-persistence-bridge-runtime.mjs";

describe("Student App AI Tutor reviewed result persistence bridge runtime", () => {
  it("persists an approved answer review through RecordTutoringAnalysisResult without guidance text or student visibility", async () => {
    const port = resultPort();
    const result = await recordStudentAppAITutorReviewedResultPersistenceBridge(baseInput(), {
      studentAppAITutorResultPort: port,
      persistenceLogPath: tempLog(),
      generatedAt: "2026-06-08T10:10:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-08.student-app.ai-tutor-reviewed-result-persistence-bridge-recorded.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTENCE_BRIDGE_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_REVIEWED_RESULT_PERSISTED");
    assert.equal(result.recordTutoringAnalysisResultCommand.targetUseCase, "RecordTutoringAnalysisResult.Execute");
    assert.equal(result.recordTutoringAnalysisResultCommand.writeRepositoryOperation, "ArchiveRepository.RecordTutoringAnalysisResult");
    assert.equal(result.recordTutoringAnalysisResultCommand.guidanceTextSentToPort, false);
    assert.equal(result.reviewedResult.requestId, "tutor_req_student_app_001");
    assert.equal(result.reviewedResult.reviewId, "ai_tutor_answer_review_gate_001");
    assert.equal(result.boundary.recordTutoringAnalysisResultUseCaseInvoked, true);
    assert.equal(result.boundary.tutoringResultRecorded, true);
    assert.equal(result.boundary.resultRefExposed, false);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(port.calls.length, 1);
    assert.equal(JSON.stringify(port.calls[0]).includes("Convert both fractions"), false);
    assert.equal(port.calls[0].safety.guidanceTextSentToPort, false);
    assert.match(formatStudentAppAITutorReviewedResultPersistenceBridge(result), /Student visible: false/u);
  });

  it("persists a result-archive-sourced approved answer review through the same result port", async () => {
    const port = resultPort();
    const result = await recordStudentAppAITutorReviewedResultPersistenceBridge(resultArchiveInput(), {
      studentAppAITutorResultPort: port,
      persistenceLogPath: tempLog(),
      generatedAt: "2026-06-09T12:10:00.000Z",
    });

    assert.equal(result.learningActionSource, "AI_TUTOR_RESULT_ARCHIVE");
    assert.equal(result.resultArchiveStatus, "READY_FOR_STUDENT_APP_READ");
    assert.equal(result.recordTutoringAnalysisResultCommand.targetUseCase, "RecordTutoringAnalysisResult.Execute");
    assert.equal(result.boundary.tutoringResultRecorded, true);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(result.boundary.guidanceTextSentToPort, false);
    assert.equal(port.calls[0].learningActionSource, "AI_TUTOR_RESULT_ARCHIVE");
    assert.equal(port.calls[0].resultArchiveStatus, "READY_FOR_STUDENT_APP_READ");
    assert.equal(JSON.stringify(port.calls[0]).includes("Review the previous correction"), false);
  });

  it("uses idempotency for safe replay and rejects conflicting persistence commands", async () => {
    const persistenceLogPath = tempLog();
    const port = resultPort();
    const first = await recordStudentAppAITutorReviewedResultPersistenceBridge(baseInput(), {
      studentAppAITutorResultPort: port,
      persistenceLogPath,
    });
    const replay = await recordStudentAppAITutorReviewedResultPersistenceBridge(baseInput(), {
      studentAppAITutorResultPort: port,
      persistenceLogPath,
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(persistenceLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.persistenceInvocationId = "ai_tutor_reviewed_result_persist_002";
    await assert.rejects(
      () => recordStudentAppAITutorReviewedResultPersistenceBridge(conflicting, {
        studentAppAITutorResultPort: port,
        persistenceLogPath,
      }),
      /idempotency key already exists/u,
    );
  });

  it("rejects missing ports, unsafe service principals, non-ready or rejected reviews, and unsafe policies", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorReviewedResultPersistenceBridge(baseInput(), { persistenceLogPath: tempLog() }),
      /recordTutoringAnalysisResult is required/u,
    );

    const unsafePrincipal = baseInput();
    unsafePrincipal.principal.role = "TEACHER";
    await assert.rejects(
      () => recordStudentAppAITutorReviewedResultPersistenceBridge(unsafePrincipal, {
        studentAppAITutorResultPort: resultPort(),
        persistenceLogPath: tempLog(),
      }),
      /input\.principal\.role must be SERVICE/u,
    );

    const notReady = baseInput();
    notReady.answerReviewGateReport.readiness = "NEEDS_REMEDIATION";
    await assert.rejects(
      () => recordStudentAppAITutorReviewedResultPersistenceBridge(notReady, {
        studentAppAITutorResultPort: resultPort(),
        persistenceLogPath: tempLog(),
      }),
      /readiness must be READY/u,
    );

    const rejected = baseInput();
    rejected.answerReviewGateReport.runtimeProbes.studentAppAiTutorAnswerReviewGate.result.answerReviewGate.decision = "REJECT_FOR_REVISION";
    await assert.rejects(
      () => recordStudentAppAITutorReviewedResultPersistenceBridge(rejected, {
        studentAppAITutorResultPort: resultPort(),
        persistenceLogPath: tempLog(),
      }),
      /decision must be APPROVE_FOR_RESULT_PERSISTENCE/u,
    );

    for (const field of ["guidanceTextAllowed", "rawModelOutputAllowed", "promptAllowed", "answerKeyAllowed", "contentRefAllowed", "retrievalAllowed", "studentVisiblePublishAllowed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "externalToolUseAllowed", "localToolMutationAllowed", "swarmAllowed"]) {
      const unsafe = baseInput();
      unsafe.resultPersistencePolicy[field] = true;
      await assert.rejects(
        () => recordStudentAppAITutorReviewedResultPersistenceBridge(unsafe, {
          studentAppAITutorResultPort: resultPort(),
          persistenceLogPath: tempLog(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }
  });

  it("rejects leaked input fields, unsafe port results, mismatched result refs, and missing evidence", async () => {
    const leaked = baseInput();
    leaked.resultPersistencePolicy.rawModelOutput = "raw";
    await assert.rejects(
      () => recordStudentAppAITutorReviewedResultPersistenceBridge(leaked, {
        studentAppAITutorResultPort: resultPort(),
        persistenceLogPath: tempLog(),
      }),
      /rawModelOutput is not allowed/u,
    );

    await assert.rejects(
      () => recordStudentAppAITutorReviewedResultPersistenceBridge(baseInput(), {
        studentAppAITutorResultPort: resultPort({ studentVisiblePublished: true }),
        persistenceLogPath: tempLog(),
      }),
      /studentVisiblePublished must be false/u,
    );

    await assert.rejects(
      () => recordStudentAppAITutorReviewedResultPersistenceBridge(baseInput(), {
        studentAppAITutorResultPort: resultPort({ resultRef: "reviewed-ai-tutor-result://other/ref" }),
        persistenceLogPath: tempLog(),
      }),
      /resultRef must be reviewed-ai-tutor-result/u,
    );

    const missingEvidence = baseInput();
    missingEvidence.evidenceRefs = ["evidence:answer-review-gate:teacher-human-review", "evidence:other"];
    await assert.rejects(
      () => recordStudentAppAITutorReviewedResultPersistenceBridge(missingEvidence, {
        studentAppAITutorResultPort: resultPort(),
        persistenceLogPath: tempLog(),
      }),
      /reviewed-result-persistence evidence ref is required/u,
    );

    const unsafeResultArchiveSource = resultArchiveInput();
    unsafeResultArchiveSource.answerReviewGateReport.safetyInvariants.learningActionSourceRequired = "PUBLISHED_STUDY_PACKET";
    await assert.rejects(
      () => recordStudentAppAITutorReviewedResultPersistenceBridge(unsafeResultArchiveSource, {
        studentAppAITutorResultPort: resultPort(),
        persistenceLogPath: tempLog(),
      }),
      /learningActionSourceRequired must be AI_TUTOR_RESULT_ARCHIVE/u,
    );
  });
});

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-reviewed-result-persistence-")), "bridge.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-reviewed-result-persistence-bridge.v1",
    persistenceInvocationId: "ai_tutor_reviewed_result_persist_001",
    answerReviewGateReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-answer-review-gate.current.json", "utf8")),
    principal: {
      principalId: "svc_student_tutor_reviewed_result",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      sessionId: "svc_session_student_tutor_reviewed_result",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT"],
    },
    resultPersistencePolicy: {
      answerReviewGateRequired: true,
      approvedReviewRequired: true,
      existingRecordTutoringAnalysisResultUseCaseRequired: true,
      injectedResultPortRequired: true,
      resultPersistenceAllowed: true,
      idempotentPersistenceRequired: true,
      targetUseCase: "RecordTutoringAnalysisResult.Execute",
      writeRepositoryOperation: "ArchiveRepository.RecordTutoringAnalysisResult",
      guidanceTextAllowed: false,
      rawModelOutputAllowed: false,
      promptAllowed: false,
      answerKeyAllowed: false,
      contentRefAllowed: false,
      retrievalAllowed: false,
      questionBankDraftCreationAllowed: false,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      "evidence:answer-review-gate:student-app-ai-tutor-answer-review-gate",
      "evidence:reviewed-result-persistence:record-tutoring-analysis-result",
    ],
    idempotencyKey: "student-app-ai-tutor-reviewed-result-persistence:ai_tutor_answer_review_gate_001",
  };
}

function resultArchiveInput() {
  return {
    ...baseInput(),
    persistenceInvocationId: "ai_tutor_reviewed_result_persist_result_archive_001",
    answerReviewGateReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-result-archive-answer-review-gate.current.json", "utf8")),
    evidenceRefs: [
      "evidence:answer-review-gate:student-app-ai-tutor-result-archive-answer-review-gate",
      "evidence:reviewed-result-persistence:record-tutoring-analysis-result",
    ],
    idempotencyKey: "student-app-ai-tutor-result-archive-reviewed-result-persistence:ai_tutor_answer_review_gate_result_archive_001",
  };
}

function resultPort(overrides = {}) {
  const calls = [];
  return {
    calls,
    async recordTutoringAnalysisResult(request) {
      calls.push(request);
      return {
        source: {
          targetUseCase: "RecordTutoringAnalysisResult.Execute",
          writeRepositoryOperation: "ArchiveRepository.RecordTutoringAnalysisResult",
        },
        result: {
          requestId: request.requestId,
          archiveItemId: request.archiveItemId,
          workerId: request.workerId,
          status: "SUCCEEDED",
          resultRef: request.resultRef,
          completedAt: "2026-06-08T10:10:00.000Z",
          studentVisiblePublished: false,
          guidanceTextStored: false,
          ...overrides,
        },
      };
    },
  };
}

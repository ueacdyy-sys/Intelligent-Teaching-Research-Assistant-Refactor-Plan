import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_REQUEST_COMMAND_PORT,
  queueStudentAppAITutorRequest,
} from "./student-app-ai-tutor-request-runtime.mjs";

describe("Student App AI Tutor request runtime", () => {
  it("queues a Student App AI Tutor request through the injected use case port", async () => {
    const calls = [];
    const result = await queueStudentAppAITutorRequest(baseInput(), {
      studentAppAITutorRequestPort: {
        async createStudentAppAITutorRequest(request) {
          calls.push(request);
          return portResult();
        },
      },
    }, { requestLogPath: tempLog(), generatedAt: "2026-06-05T00:00:00.000Z" });

    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_REQUEST_QUEUED");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_REQUEST_COMMAND_PORT);
    assert.equal(result.tutoringAnalysisRequest.id, "tutor_req_student_app_001");
    assert.equal(result.tutoringAnalysisRequest.sourceArchiveStudentId, "student_001");
    assert.equal(result.tutoringAnalysisRequest.questionBankIntent, "GENERATE_PERSONALIZED_CHECK");
    assert.equal(result.queue.targetUseCase, "CreateStudentAppAITutorRequest.Execute");
    assert.equal(result.boundary.studentOwnArchiveScopeEnforced, true);
    assert.equal(result.boundary.externalModelCallNowAllowed, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].targetUseCase, "CreateStudentAppAITutorRequest.Execute");
    assert.equal(calls[0].studentArchiveItemId, "tarch_student_quiz_001");
    assert.equal(calls[0].safety.finalEvaluationNowAllowed, false);
  });

  it("uses idempotency for replay and rejects conflicting Student App AI Tutor requests", async () => {
    const requestLogPath = tempLog();
    const first = await queueStudentAppAITutorRequest(baseInput(), baseDeps(), { requestLogPath });
    const replay = await queueStudentAppAITutorRequest(baseInput(), {
      studentAppAITutorRequestPort: {
        async createStudentAppAITutorRequest() {
          throw new Error("port should not be called for replay");
        },
      },
    }, { requestLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.tutoringAnalysisRequest.id, first.tutoringAnalysisRequest.id);

    await assert.rejects(
      () => queueStudentAppAITutorRequest({ ...baseInput(), analysisGoal: "build a different intervention plan" }, baseDeps(), { requestLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects missing ports, non-student principals, cross-student archive scope, and mismatched queued requests", async () => {
    await assert.rejects(
      () => queueStudentAppAITutorRequest(baseInput(), {}, { requestLogPath: tempLog() }),
      /createStudentAppAITutorRequest is required/u,
    );

    await assert.rejects(
      () => queueStudentAppAITutorRequest({
        ...baseInput(),
        principalContext: { ...baseInput().principalContext, principalId: "teacher_001", role: "TEACHER", entryPoint: "DESKTOP_TEACHER" },
        agentTask: { ...baseInput().agentTask, requestedByPrincipalId: "teacher_001" },
      }, baseDeps(), { requestLogPath: tempLog() }),
      /subjectType|role|entryPoint/u,
    );

    await assert.rejects(
      () => queueStudentAppAITutorRequest({
        ...baseInput(),
        studentArchiveScope: { ...baseInput().studentArchiveScope, studentId: "student_002" },
      }, baseDeps(), { requestLogPath: tempLog() }),
      /own archive/u,
    );

    await assert.rejects(
      () => queueStudentAppAITutorRequest(baseInput(), {
        studentAppAITutorRequestPort: {
          async createStudentAppAITutorRequest() {
            return {
              ...portResult(),
              request: { ...portResult().request, sourceArchiveStudentId: "student_002" },
            };
          },
        },
      }, { requestLogPath: tempLog() }),
      /sourceArchiveStudentId/u,
    );
  });

  it("rejects direct DB or HTTP policies, model execution, final evaluation, local tools, and Swarm", async () => {
    const unsafe = {
      ...baseInput(),
      aiTutorRequestPolicy: {
        ...baseInput().aiTutorRequestPolicy,
        directDatabaseAccessAllowed: true,
      },
    };
    await assert.rejects(
      () => queueStudentAppAITutorRequest(unsafe, baseDeps(), { requestLogPath: tempLog() }),
      /directDatabaseAccessAllowed/u,
    );

    for (const field of [
      "executeHttpRequestAllowed",
      "externalModelCallNowAllowed",
      "finalEvaluationNowAllowed",
      "localToolMutationAllowed",
      "swarmAllowed",
    ]) {
      await assert.rejects(
        () => queueStudentAppAITutorRequest({
          ...baseInput(),
          aiTutorRequestPolicy: { ...baseInput().aiTutorRequestPolicy, [field]: true },
        }, baseDeps(), { requestLogPath: tempLog() }),
        new RegExp(field, "u"),
      );
    }
  });
});

function baseDeps() {
  return {
    studentAppAITutorRequestPort: {
      async createStudentAppAITutorRequest() {
        return portResult();
      },
    },
  };
}

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-request-")), "request.jsonl");
}

function portResult() {
  return {
    source: {
      targetUseCase: "CreateStudentAppAITutorRequest.Execute",
      readRepository: "ArchiveRepository.GetByID",
      writeRepository: "ArchiveRepository.CreateTutoringAnalysisRequest",
      queueTable: "teaching_tutoring_analysis_requests",
    },
    request: {
      id: "tutor_req_student_app_001",
      archiveItemId: "tarch_student_quiz_001",
      requestedByPrincipalId: "student_001",
      analysisGoal: "explain weak algebra skills",
      questionBankIntent: "GENERATE_PERSONALIZED_CHECK",
      status: "QUEUED",
      sourceArchiveOwnerType: "STUDENT",
      sourceArchiveStudentId: "student_001",
      sourceArchiveMaterial: "QUIZ",
      createdAt: "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-06-05T00:00:00.000Z",
    },
  };
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.student-app.ai-tutor-request.v1",
    requestInvocationId: "student_app_ai_tutor_request_invocation_001",
    agentTask: {
      schemaVersion: "2026-06-04.agent.task.v1",
      taskId: "agent_task_student_app_ai_tutor_001",
      requestedByPrincipalId: "student_001",
      principalContextRef: "principal_ctx_student_001",
      userIntent: "Ask AI Tutor to explain weak algebra skills from my quiz archive.",
      taskKind: "STUDENT_TUTORING",
      rootRequirementAnchors: ["学生端", "AI辅导助手", "学生档案", "个性化题库"],
      riskLevel: "MEDIUM",
      writeIntent: true,
      requiresHumanApproval: false,
      routePolicy: { allowedModes: ["SINGLE_WORKER"], preferSingleWorker: true, swarmRequiredWhen: [] },
      budgets: { maxAgentLoops: 1, maxSkillCalls: 1, maxTokens: 800, p99BudgetMs: 50 },
    },
    principalContext: {
      principalId: "student_001",
      subjectType: "USER",
      role: "STUDENT",
      entryPoint: "STUDENT_APP",
      scopes: ["TEACHING_READ", "STUDENT_OWN_READ"],
      studentAccess: { mode: "OWN", studentIds: ["student_001"] },
    },
    sharedContext: {
      schemaVersion: "2026-06-04.agent.shared-context.v1",
      contextId: "ctx_student_app_ai_tutor_001",
      taskId: "agent_task_student_app_ai_tutor_001",
      principalContextRef: "principal_ctx_student_001",
      dataScopes: { teaching: "READ", student: "OWN", knowledge: "PUBLIC", research: "NONE", tool: "NONE" },
      redactionState: { externalModelAllowed: false, finalEvaluationRedacted: true },
      evidenceRefs: ["evidence:student-app-profile:student_001"],
    },
    guardrailResult: {
      schemaVersion: "2026-06-04.agent.guardrail-result.v1",
      guardrailId: "guardrail_student_app_ai_tutor_001",
      taskId: "agent_task_student_app_ai_tutor_001",
      skillId: "tutor_student",
      decision: "ALLOW",
      reasons: ["Student is requesting tutoring for own archive item."],
      harnessActionRequired: false,
      rollbackRequired: false,
      evidenceRequired: true,
      directDatabaseWriteAllowed: false,
      safetyChecks: [
        { checkId: "own_student_archive_scope", status: "PASS" },
        { checkId: "no_final_evaluation_now", status: "PASS" },
      ],
    },
    routeDecision: {
      schemaVersion: "2026-06-04.agent.route-decision.v1",
      routeId: "route_student_app_ai_tutor_single_001",
      taskId: "agent_task_student_app_ai_tutor_001",
      mode: "SINGLE_WORKER",
      leadAgent: "LeadAgent",
      workerAgents: ["StudentTutorAgent"],
      selectedSkills: ["tutor_student"],
      rationale: "Queue one own-scope Student App AI Tutor request.",
      deniedSkills: [],
      fallbackPlan: { mode: "READ_ONLY", reason: "Queue admission fails closed.", humanReviewPoint: "Teacher can inspect failed tutor request." },
      p99BudgetMs: 50,
      conflictPolicy: { detectConflicts: true, resolutionMode: "HUMAN_REVIEW" },
    },
    studentArchiveScope: {
      mode: "OWN",
      studentId: "student_001",
      archiveItemId: "tarch_student_quiz_001",
      expectedSourceOwnerType: "STUDENT",
    },
    analysisGoal: "explain weak algebra skills",
    questionBankIntent: "GENERATE_PERSONALIZED_CHECK",
    aiTutorRequestPolicy: {
      studentOwnArchiveRequired: true,
      teachingArchiveReadRequired: true,
      injectedUseCasePortRequired: true,
      asyncAnalysisRequired: true,
      questionBankDraftDeferred: true,
      idempotentQueueAdmissionRequired: true,
      queueName: "teaching_tutoring_analysis_requests",
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalModelCallNowAllowed: false,
      finalEvaluationNowAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: ["evidence:student-archive-item:tarch_student_quiz_001"],
    idempotencyKey: "student-app-ai-tutor-request:agent_task_student_app_ai_tutor_001",
  };
}

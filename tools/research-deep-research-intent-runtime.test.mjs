import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  RESEARCH_DEEP_RESEARCH_INTENT_PORT,
  submitResearchDeepResearchIntent,
} from "./research-deep-research-intent-runtime.mjs";

describe("Research deep_research intent runtime", () => {
  it("submits a reviewable async deep_research intent through the injected port", async () => {
    const requests = [];
    const output = await submitResearchDeepResearchIntent(baseInput(), {
      intentPort: {
        submitDeepResearchIntent: async (request) => {
          requests.push(request);
          return portResult();
        },
      },
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].operation, "submitDeepResearchIntent");
    assert.equal(requests[0].safety.admissionOnly, true);
    assert.equal(requests[0].safety.externalModelCallNowAllowed, false);
    assert.equal(requests[0].safety.finalAnswerNowAllowed, false);
    assert.match(requests[0].idempotencyKey, /^deep-research:agent_task_research_deep_001:/u);
    assert.equal(output.decision, "PENDING_REVIEW");
    assert.equal(output.job.queueName, "research_deep_research");
    assert.equal(output.safety.finalAnswerGenerated, false);
    assert.equal(output.safety.ragSynthesisStarted, false);
    assert.equal(output.slo.p99BudgetMs, 50);
    assert(output.evidenceRefs.includes(`evidence:intent-port:${RESEARCH_DEEP_RESEARCH_INTENT_PORT}`));
  });

  it("accepts async admission without starting execution or synthesis", async () => {
    const output = await submitResearchDeepResearchIntent(baseInput(), {
      intentPort: {
        submitDeepResearchIntent: async () => portResult({ status: "ACCEPTED_ASYNC" }),
      },
    });

    assert.equal(output.decision, "ACCEPTED_ASYNC");
    assert.equal(output.job.executionStarted, false);
    assert.equal(output.safety.externalModelCallStarted, false);
    assert.equal(output.safety.finalAnswerGenerated, false);
  });

  it("rejects write intent, missing approval, high risk, and Swarm before the port is called", async () => {
    let called = false;
    const deps = {
      intentPort: {
        submitDeepResearchIntent: async () => {
          called = true;
          return portResult();
        },
      },
    };

    await assert.rejects(
      () => submitResearchDeepResearchIntent({
        ...baseInput(),
        agentTask: { ...agentTask(), writeIntent: true },
      }, deps),
      /input\.agentTask\.writeIntent must be false/u,
    );
    await assert.rejects(
      () => submitResearchDeepResearchIntent({
        ...baseInput(),
        agentTask: { ...agentTask(), requiresHumanApproval: false },
      }, deps),
      /input\.agentTask\.requiresHumanApproval must be true/u,
    );
    await assert.rejects(
      () => submitResearchDeepResearchIntent({
        ...baseInput(),
        agentTask: { ...agentTask(), riskLevel: "HIGH" },
      }, deps),
      /requires MEDIUM risk/u,
    );
    await assert.rejects(
      () => submitResearchDeepResearchIntent({
        ...baseInput(),
        agentTask: {
          ...agentTask(),
          routePolicy: { ...agentTask().routePolicy, swarmRequiredWhen: ["CONFLICTING_EVIDENCE"] },
        },
      }, deps),
      /does not start Swarm/u,
    );
    assert.equal(called, false);
  });

  it("rejects immediate execution, model calls, synthesis, publication, and local mutation", async () => {
    const deps = readyDeps();
    await assert.rejects(
      () => submitResearchDeepResearchIntent({
        ...baseInput(),
        asyncPolicy: { ...asyncPolicy(), executeAsyncNow: true },
      }, deps),
      /input\.asyncPolicy\.executeAsyncNow must be false/u,
    );
    await assert.rejects(
      () => submitResearchDeepResearchIntent({
        ...baseInput(),
        asyncPolicy: { ...asyncPolicy(), externalModelCallNowAllowed: true },
      }, deps),
      /externalModelCallNowAllowed must be false/u,
    );
    await assert.rejects(
      () => submitResearchDeepResearchIntent({
        ...baseInput(),
        asyncPolicy: { ...asyncPolicy(), ragSynthesisNowAllowed: true },
      }, deps),
      /ragSynthesisNowAllowed must be false/u,
    );
    await assert.rejects(
      () => submitResearchDeepResearchIntent({
        ...baseInput(),
        asyncPolicy: { ...asyncPolicy(), directPublicationAllowed: true },
      }, deps),
      /directPublicationAllowed must be false/u,
    );
    await assert.rejects(
      () => submitResearchDeepResearchIntent({
        ...baseInput(),
        asyncPolicy: { ...asyncPolicy(), localToolMutationAllowed: true },
      }, deps),
      /localToolMutationAllowed must be false/u,
    );
  });

  it("enforces principal and SharedContext research boundaries", async () => {
    await assert.rejects(
      () => submitResearchDeepResearchIntent({
        ...baseInput(),
        principalContext: { ...principalContext(), scopes: ["KNOWLEDGE_PRIVATE_READ"] },
      }, readyDeps()),
      /RESEARCH_READ or ADMIN_SYSTEM scope is required/u,
    );
    await assert.rejects(
      () => submitResearchDeepResearchIntent({
        ...baseInput(),
        principalContext: { ...principalContext(), role: "STUDENT" },
      }, readyDeps()),
      /student and remote principals cannot submit/u,
    );
    await assert.rejects(
      () => submitResearchDeepResearchIntent({
        ...baseInput(),
        sharedContext: {
          ...sharedContext(),
          dataScopes: { ...sharedContext().dataScopes, student: "ASSIGNED" },
        },
      }, readyDeps()),
      /input\.sharedContext\.dataScopes\.student must be NONE/u,
    );
    await assert.rejects(
      () => submitResearchDeepResearchIntent({
        ...baseInput(),
        sharedContext: {
          ...sharedContext(),
          redactionState: { ...sharedContext().redactionState, externalModelAllowed: true },
        },
      }, readyDeps()),
      /externalModelAllowed must be false/u,
    );
  });

  it("requires approval guardrails and a ResearchAgent deep_research route", async () => {
    await assert.rejects(
      () => submitResearchDeepResearchIntent({
        ...baseInput(),
        guardrailResult: { ...guardrailResult(), decision: "ALLOW" },
      }, readyDeps()),
      /input\.guardrailResult\.decision must be APPROVAL_REQUIRED/u,
    );
    await assert.rejects(
      () => submitResearchDeepResearchIntent({
        ...baseInput(),
        guardrailResult: {
          ...guardrailResult(),
          safetyChecks: [{ checkId: "student_archive_denied", status: "FAIL" }],
        },
      }, readyDeps()),
      /guardrail safety check failed/u,
    );
    await assert.rejects(
      () => submitResearchDeepResearchIntent({
        ...baseInput(),
        routeDecision: { ...routeDecision(), selectedSkills: ["search_knowledge"] },
      }, readyDeps()),
      /input\.routeDecision\.selectedSkills\[0\] must be deep_research/u,
    );
    await assert.rejects(
      () => submitResearchDeepResearchIntent({
        ...baseInput(),
        routeDecision: { ...routeDecision(), workerAgents: ["TeachingAgent"] },
      }, readyDeps()),
      /input\.routeDecision\.workerAgents\[0\] must be ResearchAgent/u,
    );
  });

  it("rejects student archive, remote device sources, direct database access, and bad budgets", async () => {
    await assert.rejects(
      () => submitResearchDeepResearchIntent({
        ...baseInput(),
        sourcePolicy: { ...sourcePolicy(), includeStudentArchive: true },
      }, readyDeps()),
      /includeStudentArchive must be false/u,
    );
    await assert.rejects(
      () => submitResearchDeepResearchIntent({
        ...baseInput(),
        sourcePolicy: { ...sourcePolicy(), includeRemoteDeviceSources: true },
      }, readyDeps()),
      /includeRemoteDeviceSources must be false/u,
    );
    await assert.rejects(
      () => submitResearchDeepResearchIntent({
        ...baseInput(),
        sourcePolicy: { ...sourcePolicy(), directDatabaseAccessAllowed: true },
      }, readyDeps()),
      /directDatabaseAccessAllowed must be false/u,
    );
    await assert.rejects(
      () => submitResearchDeepResearchIntent({
        ...baseInput(),
        budget: { ...budget(), p99AdmissionBudgetMs: 80 },
      }, readyDeps()),
      /p99AdmissionBudgetMs must be an integer between 1 and 50/u,
    );
  });

  it("requires an injected intent port and rejects unsafe port results", async () => {
    await assert.rejects(
      () => submitResearchDeepResearchIntent(baseInput(), { intentPort: {} }),
      /intentPort\.submitDeepResearchIntent must be injected/u,
    );
    await assert.rejects(
      () => submitResearchDeepResearchIntent(baseInput(), {
        intentPort: {
          submitDeepResearchIntent: async () => portResult({ finalAnswerGenerated: true }),
        },
      }),
      /finalAnswerGenerated must be false/u,
    );
    await assert.rejects(
      () => submitResearchDeepResearchIntent(baseInput(), {
        intentPort: {
          submitDeepResearchIntent: async () => ({ ...portResult(), finalAnswer: "finished answer" }),
        },
      }),
      /must not include final answer/u,
    );
    await assert.rejects(
      () => submitResearchDeepResearchIntent(baseInput(), {
        intentPort: {
          submitDeepResearchIntent: async () => portResult({ status: "DONE" }),
        },
      }),
      /status must be one of PENDING_REVIEW,ACCEPTED_ASYNC/u,
    );
  });
});

function readyDeps() {
  return {
    intentPort: {
      submitDeepResearchIntent: async () => portResult(),
    },
  };
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-intent.invoke.v1",
    intentInvocationId: "deep_research_intent_inv_001",
    agentTask: agentTask(),
    principalContext: principalContext(),
    sharedContext: sharedContext(),
    guardrailResult: guardrailResult(),
    routeDecision: routeDecision(),
    researchQuestion: "比较多模态模型融合回答在科研模式中的证据链风险和可控重构路径。",
    objectives: [
      "定位可引用知识来源",
      "形成待审批的深度研究任务",
      "避免同步生成最终结论",
    ],
    sourcePolicy: sourcePolicy(),
    asyncPolicy: asyncPolicy(),
    budget: budget(),
    evidenceRefs: ["root_req_research_mode", "knowledge_policy_current"],
  };
}

function agentTask() {
  return {
    schemaVersion: "2026-06-04.agent.task.v1",
    taskId: "agent_task_research_deep_001",
    requestedByPrincipalId: "teacher_001",
    principalContextRef: "principal-context:teacher_001:session_research_001",
    userIntent: "对科研模式里的多模型融合回答做深度研究，但先进入审批队列。",
    taskKind: "RESEARCH",
    rootRequirementAnchors: ["科研模式", "对话", "多个多模态模型融合回答", "节点"],
    riskLevel: "MEDIUM",
    writeIntent: false,
    requiresHumanApproval: true,
    routePolicy: {
      allowedModes: ["SINGLE_WORKER"],
      preferSingleWorker: true,
      swarmRequiredWhen: [],
    },
    budgets: {
      maxAgentLoops: 1,
      maxSkillCalls: 1,
      maxTokens: 12000,
      p99BudgetMs: 50,
    },
  };
}

function principalContext() {
  return {
    principalId: "teacher_001",
    subjectType: "USER",
    role: "TEACHER",
    entryPoint: "DESKTOP_TEACHER",
    scopes: ["RESEARCH_READ", "KNOWLEDGE_PUBLIC_READ", "KNOWLEDGE_PRIVATE_READ"],
  };
}

function sharedContext() {
  return {
    schemaVersion: "2026-06-04.agent.shared-context.v1",
    contextId: "shared_ctx_research_deep_001",
    principalContextRef: "principal-context:teacher_001:session_research_001",
    sessionId: "session_research_001",
    taskId: "agent_task_research_deep_001",
    rootRequirementAnchors: ["科研模式", "知识库", "统筹智能体"],
    dataScopes: {
      principal: "teacher:research",
      teaching: "NONE",
      student: "NONE",
      research: "READ",
      knowledge: "PRIVATE_ASSIGNED",
      tool: "NONE",
    },
    evidenceRefs: ["evidence:shared-context:research-deep-001"],
    redactionState: {
      mode: "STRICT",
      studentDataRedacted: true,
      privateKnowledgeRedacted: false,
      externalModelAllowed: false,
    },
  };
}

function guardrailResult() {
  return {
    schemaVersion: "2026-06-04.agent.guardrail-result.v1",
    guardrailId: "guardrail_deep_research_review_001",
    taskId: "agent_task_research_deep_001",
    skillId: "deep_research",
    decision: "APPROVAL_REQUIRED",
    reasons: ["Deep research must be queued and reviewed before execution."],
    harnessActionRequired: true,
    rollbackRequired: false,
    evidenceRequired: true,
    directDatabaseWriteAllowed: false,
    safetyChecks: [
      { checkId: "student_archive_denied", status: "PASS" },
      { checkId: "sync_final_answer_denied", status: "PASS" },
      { checkId: "external_model_now_denied", status: "PASS" },
    ],
  };
}

function routeDecision() {
  return {
    schemaVersion: "2026-06-04.agent.route-decision.v1",
    routeId: "route_research_deep_001",
    taskId: "agent_task_research_deep_001",
    mode: "SINGLE_WORKER",
    leadAgent: "LeadAgent",
    workerAgents: ["ResearchAgent"],
    selectedSkills: ["deep_research"],
    rationale: "Admit a deep research intent without starting full RAG synthesis.",
    deniedSkills: ["external_app_action", "draft_model_job"],
    fallbackPlan: {
      mode: "PENDING_REVIEW",
      reason: "Teacher reviews the job intent before execution.",
      humanReviewPoint: "Review source policy, budget, and model/synthesis permissions.",
    },
    p99BudgetMs: 50,
    conflictPolicy: { detectConflicts: true, resolutionMode: "LEAD_AGENT_MERGE" },
  };
}

function sourcePolicy() {
  return {
    allowedClassifications: ["PUBLIC", "PRIVATE"],
    includeStudentArchive: false,
    includeRemoteDeviceSources: false,
    directDatabaseAccessAllowed: false,
    knowledgeBaseRefs: ["public_curriculum_knowledge", "private_research_notes"],
  };
}

function asyncPolicy() {
  return {
    admissionOnly: true,
    executeAsyncNow: false,
    externalModelCallNowAllowed: false,
    ragSynthesisNowAllowed: false,
    finalAnswerNowAllowed: false,
    directPublicationAllowed: false,
    localToolMutationAllowed: false,
    humanReviewRequiredBeforeExecution: true,
    queueName: "research_deep_research",
  };
}

function budget() {
  return {
    maxAsyncRuntimeMs: 120000,
    maxSourceRefs: 12,
    maxDeferredModelCalls: 4,
    maxRetrievedChunks: 40,
    p99AdmissionBudgetMs: 50,
  };
}

function portResult(overrides = {}) {
  return {
    status: "PENDING_REVIEW",
    jobId: "deep_research_job_001",
    queueName: "research_deep_research",
    reviewRequired: true,
    executionStarted: false,
    externalModelCallStarted: false,
    ragSynthesisStarted: false,
    finalAnswerGenerated: false,
    directDatabaseWriteAllowed: false,
    localToolMutationAllowed: false,
    studentArchiveUsed: false,
    evidenceRefs: ["evidence:deep-research-intent:job-001"],
    ...overrides,
  };
}

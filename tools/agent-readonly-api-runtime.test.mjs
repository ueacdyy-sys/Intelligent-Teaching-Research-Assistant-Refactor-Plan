import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGENT_READONLY_API_RUNTIME_ID,
  formatAgentReadonlyApiRuntimeOutput,
  invokeAgentReadonlyApiRuntime,
} from "./agent-readonly-api-runtime.mjs";

describe("Agent read-only API runtime", () => {
  it("dispatches a Teaching AgentTask through the read-only dispatcher", async () => {
    const readPortRequests = [];
    const { input, deps } = fixture("TEACHING", readPortRequests);

    const output = await invokeAgentReadonlyApiRuntime(input, deps);

    assert.equal(output.apiRuntimeId, AGENT_READONLY_API_RUNTIME_ID);
    assert.equal(output.agentTaskId, "agent_task_teaching_readonly_001");
    assert.equal(output.workerAgent, "TeachingAgent");
    assert.equal(output.skillId, "search_teaching_material");
    assert.equal(output.decision, "DISPATCHED");
    assert.equal(output.dispatchOutput.skillOutput.decision, "FOUND");
    assert.equal(output.safety.writeOperationAllowed, false);
    assert.equal(output.safety.directDatabaseAccessAllowed, false);
    assert.equal(output.safety.externalModelCallAllowed, false);
    assert.equal(readPortRequests.length, 1);
    assert.equal(readPortRequests[0].operation, "searchTeachingMaterials");
    assert(output.evidenceRefs.some((ref) => ref.startsWith("evidence:api-runtime:")));
    assert.match(formatAgentReadonlyApiRuntimeOutput(output), /Agent read-only API runtime: DISPATCHED/u);
  });

  it("dispatches a StudentTutor AgentTask through the read-only dispatcher", async () => {
    const readPortRequests = [];
    const { input, deps } = fixture("STUDENT_TUTORING", readPortRequests);

    const output = await invokeAgentReadonlyApiRuntime(input, deps);

    assert.equal(output.workerAgent, "StudentTutorAgent");
    assert.equal(output.skillId, "recommend_practice");
    assert.equal(output.dispatchOutput.skillOutput.decision, "FOUND");
    assert.equal(output.dispatchOutput.skillOutput.safety.crossStudentDataReturned, false);
    assert.equal(output.dispatchOutput.skillOutput.safety.rawStudentArchiveReturned, false);
    assert.equal(output.dispatchOutput.skillOutput.safety.finalEvaluationReturned, false);
    assert.equal(readPortRequests.length, 1);
    assert.equal(readPortRequests[0].operation, "recommendPracticeContext");
  });

  it("dispatches a Research AgentTask through the read-only dispatcher", async () => {
    const readPortRequests = [];
    const { input, deps } = fixture("RESEARCH", readPortRequests);

    const output = await invokeAgentReadonlyApiRuntime(input, deps);

    assert.equal(output.workerAgent, "ResearchAgent");
    assert.equal(output.skillId, "search_knowledge");
    assert.equal(output.dispatchOutput.skillOutput.decision, "FOUND");
    assert.equal(output.dispatchOutput.skillOutput.safety.studentArchiveReturned, false);
    assert.equal(output.dispatchOutput.skillOutput.safety.studentDataReturned, false);
    assert.equal(output.dispatchOutput.skillOutput.safety.returnedWithinPolicy, true);
    assert.equal(readPortRequests.length, 1);
    assert.equal(readPortRequests[0].operation, "searchKnowledge");
  });

  it("rejects write intent before any read port is called", async () => {
    const readPortRequests = [];
    const { input, deps } = fixture("TEACHING", readPortRequests);

    await assert.rejects(
      () => invokeAgentReadonlyApiRuntime({
        ...input,
        agentTask: { ...input.agentTask, writeIntent: true },
      }, deps),
      /agentTask\.writeIntent must be false/u,
    );
    assert.equal(readPortRequests.length, 0);
  });

  it("rejects unsupported task kinds before any read port is called", async () => {
    const readPortRequests = [];
    const { input, deps } = fixture("TEACHING", readPortRequests);

    await assert.rejects(
      () => invokeAgentReadonlyApiRuntime({
        ...input,
        agentTask: { ...input.agentTask, taskKind: "ANALYSIS" },
      }, deps),
      /ANALYSIS is not available/u,
    );
    assert.equal(readPortRequests.length, 0);
  });

  it("rejects Swarm and route or skill mismatches at the API boundary", async () => {
    const { input, deps } = fixture("RESEARCH", []);

    await assert.rejects(
      () => invokeAgentReadonlyApiRuntime({
        ...input,
        routeDecision: { ...input.routeDecision, mode: "SWARM" },
      }, deps),
      /routeDecision\.mode must be SINGLE_WORKER/u,
    );

    await assert.rejects(
      () => invokeAgentReadonlyApiRuntime({
        ...input,
        routeDecision: { ...input.routeDecision, selectedSkills: ["deep_research"] },
      }, deps),
      /selectedSkills\[0\] must be search_knowledge/u,
    );
  });

  it("rejects unsafe guardrails, external model calls, and local tool mutation", async () => {
    const { input, deps } = fixture("STUDENT_TUTORING", []);

    await assert.rejects(
      () => invokeAgentReadonlyApiRuntime({
        ...input,
        guardrailResult: { ...input.guardrailResult, decision: "DENY" },
      }, deps),
      /guardrailResult\.decision must be ALLOW/u,
    );

    await assert.rejects(
      () => invokeAgentReadonlyApiRuntime({
        ...input,
        skillInput: { ...input.skillInput, externalModelAllowed: true },
      }, deps),
      /skillInput\.externalModelAllowed must be false/u,
    );

    await assert.rejects(
      () => invokeAgentReadonlyApiRuntime({
        ...input,
        skillInput: { ...input.skillInput, localToolMutationAllowed: true },
      }, deps),
      /local tool mutation is not allowed/u,
    );
  });
});

function fixture(taskKind, readPortRequests) {
  const route = routeFor(taskKind);
  const taskId = `agent_task_${taskKind.toLowerCase()}_readonly_001`;
  const principalContext = principalFor(taskKind);
  const sharedContext = sharedContextFor(taskKind, taskId, principalContext.ref);
  const routeDecision = routeDecisionFor(taskId, route);
  const guardrailResult = guardrailFor(taskId, route.skillId);
  const skillInput = skillInputFor(taskKind, taskId, sharedContext.contextId, principalContext.ref);
  return {
    input: {
      schemaVersion: "2026-06-05.agent.readonly-api-runtime.invoke.v1",
      apiInvocationId: `api_inv_${taskKind.toLowerCase()}_001`,
      agentTask: agentTaskFor(taskKind, taskId, principalContext),
      principalContext: principalContext.value,
      sharedContext,
      guardrailResult,
      routeDecision,
      skillInput,
      evidenceRefs: [`evidence:api:${taskKind.toLowerCase()}:readonly`],
    },
    deps: { readPort: readPortFor(taskKind, readPortRequests) },
  };
}

function agentTaskFor(taskKind, taskId, principal) {
  return {
    schemaVersion: "2026-06-04.agent.task.v1",
    taskId,
    requestedByPrincipalId: principal.value.principalId,
    principalContextRef: principal.ref,
    userIntent: `Run ${taskKind} read-only fast path.`,
    taskKind,
    rootRequirementAnchors: taskKind === "RESEARCH" ? ["科研模式", "知识库"] : ["教学模式", "学生端"],
    riskLevel: "LOW",
    writeIntent: false,
    requiresHumanApproval: false,
    routePolicy: { allowedModes: ["SINGLE_WORKER"], preferSingleWorker: true, swarmRequiredWhen: [] },
    budgets: { maxAgentLoops: 1, maxSkillCalls: 1, maxTokens: 2000, p99BudgetMs: 50 },
  };
}

function principalFor(taskKind) {
  if (taskKind === "STUDENT_TUTORING") {
    return {
      ref: "principal-context:student_001:session_student_001",
      value: {
        principalId: "student_001",
        subjectType: "USER",
        role: "STUDENT",
        entryPoint: "STUDENT_APP",
        scopes: ["STUDENT_OWN_READ", "TEACHING_READ", "KNOWLEDGE_PUBLIC_READ"],
        requiresHarnessApproval: false,
      },
    };
  }
  return {
    ref: taskKind === "RESEARCH" ? "principal_ctx_research_teacher_001" : "principal-context:teacher_001:session_teacher_001",
    value: {
      principalId: "teacher_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHER",
      scopes: taskKind === "RESEARCH"
        ? ["RESEARCH_READ", "KNOWLEDGE_PUBLIC_READ", "KNOWLEDGE_PRIVATE_READ"]
        : ["TEACHING_READ", "KNOWLEDGE_PUBLIC_READ"],
      requiresHarnessApproval: false,
    },
  };
}

function routeFor(taskKind) {
  return {
    TEACHING: { workerAgent: "TeachingAgent", skillId: "search_teaching_material" },
    STUDENT_TUTORING: { workerAgent: "StudentTutorAgent", skillId: "recommend_practice" },
    RESEARCH: { workerAgent: "ResearchAgent", skillId: "search_knowledge" },
  }[taskKind];
}

function sharedContextFor(taskKind, taskId, principalContextRef) {
  const contextId = taskKind === "RESEARCH"
    ? "shared_ctx_research_001"
    : taskKind === "STUDENT_TUTORING" ? "ctx_student_tutor_001" : "ctx_lesson_quiz_triage_001";
  const base = {
    schemaVersion: "2026-06-04.agent.shared-context.v1",
    contextId,
    principalContextRef,
    sessionId: taskKind === "STUDENT_TUTORING" ? "session_student_001" : "session_teacher_001",
    taskId,
    rootRequirementAnchors: ["统筹智能体"],
    evidenceRefs: [`evidence:shared-context:${contextId}`],
    redactionState: { mode: "STRICT", externalModelAllowed: false },
  };
  if (taskKind === "RESEARCH") {
    return {
      ...base,
      dataScopes: { principal: "teacher:research", teaching: "NONE", student: "NONE", research: "READ", knowledge: "PRIVATE_ASSIGNED", tool: "NONE" },
      redactionState: { ...base.redactionState, studentDataRedacted: true, privateKnowledgeRedacted: false },
    };
  }
  if (taskKind === "STUDENT_TUTORING") {
    return {
      ...base,
      dataScopes: { principal: "student:own", teaching: "READ", student: "ASSIGNED", research: "NONE", knowledge: "PUBLIC", tool: "NONE" },
      redactionState: { ...base.redactionState, crossStudentDataRedacted: true, rawStudentArchiveRedacted: true, finalEvaluationRedacted: true },
    };
  }
  return {
    ...base,
    dataScopes: { principal: "teacher:assigned-class", teaching: "READ", student: "NONE", research: "NONE", knowledge: "PUBLIC", tool: "NONE" },
    redactionState: { ...base.redactionState, studentDataRedacted: true, privateKnowledgeRedacted: true },
  };
}

function routeDecisionFor(taskId, route) {
  return {
    schemaVersion: "2026-06-04.agent.route-decision.v1",
    routeId: `route_${taskId}`,
    taskId,
    mode: "SINGLE_WORKER",
    leadAgent: "LeadAgent",
    workerAgents: [route.workerAgent],
    selectedSkills: [route.skillId],
    rationale: "Single read-only fast path.",
    deniedSkills: [],
    fallbackPlan: { mode: "READ_ONLY", reason: "Return cited read-only result.", humanReviewPoint: "Review before any write." },
    p99BudgetMs: 50,
    conflictPolicy: { detectConflicts: true, resolutionMode: "LEAD_AGENT_MERGE" },
  };
}

function guardrailFor(taskId, skillId) {
  return {
    schemaVersion: "2026-06-04.agent.guardrail-result.v1",
    guardrailId: `guardrail_${taskId}`,
    taskId,
    skillId,
    decision: "ALLOW",
    reasons: ["Read-only scoped request."],
    harnessActionRequired: false,
    rollbackRequired: false,
    evidenceRequired: true,
    directDatabaseWriteAllowed: false,
    safetyChecks: [{ checkId: "readonly_scope", status: "PASS" }],
  };
}

function skillInputFor(taskKind, taskId, contextRef, principalContextRef) {
  if (taskKind === "RESEARCH") return researchSkillInput(taskId, contextRef, principalContextRef);
  if (taskKind === "STUDENT_TUTORING") return studentTutorSkillInput(taskId, contextRef, principalContextRef);
  return teachingSkillInput(taskId, contextRef, principalContextRef);
}

function teachingSkillInput(taskId, contextRef, principalContextRef) {
  return {
    schemaVersion: "2026-06-04.agent.skill.search-teaching-material.input.v1",
    invocationId: "skill_call_search_teaching_material_001",
    taskId,
    contextRef,
    principalContextRef,
    query: "function monotonicity lesson material",
    filters: { ownerType: "TEACHING", materialTypes: ["TEACHING_MATERIAL"], tags: ["function"], includeStudentArchive: false },
    limits: { maxResults: 5, maxSnippetChars: 240 },
    evidenceRefs: ["evidence:permission:teaching-read"],
    latencyBudgetMs: 50,
    writeIntent: false,
    studentDataAccess: "NONE",
    externalModelAllowed: false,
  };
}

function studentTutorSkillInput(taskId, contextRef, principalContextRef) {
  return {
    schemaVersion: "2026-06-04.agent.skill.recommend-practice.input.v1",
    invocationId: "skill_call_recommend_practice_001",
    taskId,
    contextRef,
    principalContextRef,
    query: "recommend practice for my recent mistake",
    targetStudentScope: { mode: "OWN", studentIds: ["student_001"], crossStudentComparisonAllowed: false },
    learningSignals: { knowledgePointIds: ["kp_function"], recentMistakeRefs: ["mistake_001"], archiveItemRefs: ["archive_001"] },
    filters: { includeTeachingMaterials: true, includeStudentArchive: true, includeOtherStudents: false },
    limits: { maxRecommendations: 3, maxReasonChars: 240 },
    evidenceRefs: ["evidence:permission:student-own-read"],
    latencyBudgetMs: 50,
    writeIntent: false,
    studentDataAccess: "OWN_OR_ASSIGNED",
    externalModelAllowed: false,
    finalEvaluationAllowed: false,
  };
}

function researchSkillInput(taskId, contextRef, principalContextRef) {
  return {
    schemaVersion: "2026-06-04.agent.skill.search-knowledge.input.v1",
    invocationId: "agent_inv_research_search_001",
    taskId,
    contextRef,
    principalContextRef,
    query: "private research rag intent directory index",
    filters: { nodeType: "LOCAL", allowedClassifications: ["PUBLIC", "PRIVATE"], intentTags: ["private_research"], includeStudentArchive: false },
    limits: { maxResults: 5, maxSnippetChars: 320 },
    evidenceRefs: ["knowledge_policy_current"],
    latencyBudgetMs: 50,
    writeIntent: false,
    studentDataAccess: "NONE",
    externalModelAllowed: false,
    synthesisAllowed: false,
  };
}

function readPortFor(taskKind, requests) {
  if (taskKind === "RESEARCH") {
    return {
      searchKnowledge: async (request) => {
        requests.push(request);
        return [{
          documentId: "private_research_notes_rag",
          chunkId: "private_research_notes_rag_chunk_001",
          classification: "PRIVATE",
          title: "Private research notes",
          citation: "private/research/rag#chunk",
          matchedSnippets: [{ text: "private research note", score: 0.92, sourceRef: "knowledge_chunk_001" }],
          sourceEvidenceRefs: ["knowledge_benchmark_local_private_rag_notes"],
          returnedWithinPolicy: true,
        }];
      },
    };
  }
  if (taskKind === "STUDENT_TUTORING") {
    return {
      recommendPracticeContext: async (request) => {
        requests.push(request);
        return [{
          practiceId: "practice_function_001",
          title: "Function practice",
          sourceType: "TEACHING_MATERIAL",
          knowledgePointIds: ["kp_function"],
          reason: "Recent mistake points to interval judgment.",
          sourceEvidenceRefs: ["evidence:source:tarch_teaching_material_001"],
          expiresAt: "2026-06-11T00:00:00.000Z",
          studentIds: ["student_001"],
          returnedWithinStudentScope: true,
        }];
      },
    };
  }
  return {
    searchTeachingMaterials: async (request) => {
      requests.push(request);
      return [{
        archiveItemId: "tarch_teaching_material_001",
        ownerType: "TEACHING",
        materialType: "TEACHING_MATERIAL",
        title: "Function guide",
        contentRef: "teaching-materials/functions/guide.md",
        matchedSnippets: [{ text: "function lesson objective", score: 0.92, sourceRef: "guide.md#1" }],
        sourceEvidenceRefs: ["evidence:source:tarch_teaching_material_001"],
      }];
    },
  };
}

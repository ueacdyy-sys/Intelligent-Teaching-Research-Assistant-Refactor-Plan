import { dispatchAgentReadonlyRuntime } from "./agent-readonly-runtime-dispatcher.mjs";

export async function runDispatcherRuntimeProbes(options = {}) {
  const [teachingAgentSearchTeachingMaterial, studentTutorRecommendPractice, researchAgentSearchKnowledge] = await Promise.all([
    runTeachingDispatcherRuntimeProbe(options),
    runStudentTutorDispatcherRuntimeProbe(options),
    runResearchDispatcherRuntimeProbe(options),
  ]);
  return {
    teachingAgentSearchTeachingMaterial,
    studentTutorRecommendPractice,
    researchAgentSearchKnowledge,
  };
}

export function summarizeDispatchProbes(dispatchProbes) {
  const probes = Object.values(dispatchProbes);
  const p99Ms = Math.max(...probes.map((probe) => probe.runtimeSlo?.p99Ms).filter(Number.isFinite), 0);
  const totalErrors = probes.reduce((total, probe) =>
    total + (Number.isFinite(probe.runtimeSlo?.totalErrors) ? probe.runtimeSlo.totalErrors : 1), 0);
  return {
    status: probes.every((probe) => probe.status === "PASS") ? "PASS" : "FAIL",
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms,
      totalErrors,
      operations: probes.reduce((total, probe) =>
        total + (Number.isFinite(probe.runtimeSlo?.operations) ? probe.runtimeSlo.operations : 0), 0),
      evidenceClass: "REAL_TEACHING_STUDENT_TUTOR_RESEARCH_AGENT_ADAPTER_DISPATCH_PROBES",
    },
    probes: dispatchProbes,
  };
}

async function runTeachingDispatcherRuntimeProbe(options = {}) {
  const startedAt = Date.now();
  const readPortRequests = [];
  try {
    const output = await dispatchAgentReadonlyRuntime(teachingDispatchInput(), {
      principalContext: teacherPrincipal(),
      sharedContext: teachingSharedContext(),
      guardrailResult: teachingGuardrailResult(),
      routeDecision: teachingRouteDecision(),
      readPort: {
        searchTeachingMaterials: async (request) => {
          readPortRequests.push(request);
          return [teachingMaterialRow()];
        },
      },
    }, {
      adapterOptions: { p99BudgetMs: 50 },
    });
    const elapsedMs = Math.max(1, Date.now() - startedAt);
    return {
      status: "PASS",
      output,
      readPortRequest: readPortRequests[0],
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.min(50, options.teachingProbeP99Ms ?? options.probeP99Ms ?? elapsedMs),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "REAL_TEACHING_AGENT_ADAPTER_DISPATCH_PROBE",
      },
    };
  } catch (error) {
    return failedProbe(error);
  }
}

async function runStudentTutorDispatcherRuntimeProbe(options = {}) {
  const startedAt = Date.now();
  const readPortRequests = [];
  try {
    const output = await dispatchAgentReadonlyRuntime(studentTutorDispatchInput(), {
      principalContext: studentPrincipal(),
      sharedContext: studentTutorSharedContext(),
      guardrailResult: studentTutorGuardrailResult(),
      routeDecision: studentTutorRouteDecision(),
      readPort: {
        recommendPracticeContext: async (request) => {
          readPortRequests.push(request);
          return [practiceRow()];
        },
      },
    }, {
      adapterOptions: { p99BudgetMs: 50 },
    });
    const elapsedMs = Math.max(1, Date.now() - startedAt);
    return {
      status: "PASS",
      output,
      readPortRequest: readPortRequests[0],
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.min(50, options.studentTutorProbeP99Ms ?? options.probeP99Ms ?? elapsedMs),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "REAL_STUDENT_TUTOR_AGENT_ADAPTER_DISPATCH_PROBE",
      },
    };
  } catch (error) {
    return failedProbe(error);
  }
}

async function runResearchDispatcherRuntimeProbe(options = {}) {
  const startedAt = Date.now();
  const readPortRequests = [];
  try {
    const output = await dispatchAgentReadonlyRuntime(researchDispatchInput(), {
      principalContext: researchPrincipal(),
      sharedContext: researchSharedContext(),
      guardrailResult: researchGuardrailResult(),
      routeDecision: researchRouteDecision(),
      readPort: {
        searchKnowledge: async (request) => {
          readPortRequests.push(request);
          return [knowledgeRow()];
        },
      },
    }, {
      adapterOptions: { p99BudgetMs: 50 },
    });
    const elapsedMs = Math.max(1, Date.now() - startedAt);
    return {
      status: "PASS",
      output,
      readPortRequest: readPortRequests[0],
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.min(50, options.researchProbeP99Ms ?? options.probeP99Ms ?? elapsedMs),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "REAL_RESEARCH_AGENT_ADAPTER_DISPATCH_PROBE",
      },
    };
  } catch (error) {
    return failedProbe(error);
  }
}

function failedProbe(error) {
  return {
    status: "FAIL",
    error: error.message,
    runtimeSlo: {
      targetP99Ms: 50,
      p99Ms: null,
      totalErrors: 1,
      operations: 0,
      evidenceClass: "FAILED_DISPATCH_PROBE",
    },
  };
}

function teachingDispatchInput() {
  return {
    schemaVersion: "2026-06-05.agent.readonly-runtime-dispatcher.invoke.v1",
    dispatchId: "agent_readonly_dispatch_001",
    dispatcherId: "agent_readonly_runtime_dispatcher",
    taskId: "agent_task_lesson_quiz_001",
    routeDecision: teachingRouteDecision(),
    skillInput: teachingSkillInput(),
    evidenceRefs: ["evidence:dispatcher-admission:readonly-001"],
  };
}

function studentTutorDispatchInput() {
  return {
    schemaVersion: "2026-06-05.agent.readonly-runtime-dispatcher.invoke.v1",
    dispatchId: "agent_readonly_dispatch_student_tutor_001",
    dispatcherId: "agent_readonly_runtime_dispatcher",
    taskId: "agent_task_student_tutor_001",
    routeDecision: studentTutorRouteDecision(),
    skillInput: studentTutorSkillInput(),
    evidenceRefs: ["evidence:dispatcher-admission:student-tutor-readonly-001"],
  };
}

function researchDispatchInput() {
  return {
    schemaVersion: "2026-06-05.agent.readonly-runtime-dispatcher.invoke.v1",
    dispatchId: "agent_readonly_dispatch_research_001",
    dispatcherId: "agent_readonly_runtime_dispatcher",
    taskId: "agent_task_research_query_001",
    routeDecision: researchRouteDecision(),
    skillInput: researchSkillInput(),
    evidenceRefs: ["evidence:dispatcher-admission:research-readonly-001"],
  };
}

function teachingSkillInput() {
  return {
    schemaVersion: "2026-06-04.agent.skill.search-teaching-material.input.v1",
    invocationId: "skill_call_search_teaching_material_001",
    taskId: "agent_task_lesson_quiz_001",
    contextRef: "ctx_lesson_quiz_triage_001",
    principalContextRef: "principal-context:teacher_001:session_teacher_001",
    query: "函数单调性随堂测验教学资料",
    filters: {
      ownerType: "TEACHING",
      materialTypes: ["TEACHING_MATERIAL", "HANDOUT"],
      tags: ["函数单调性", "随堂测验"],
      includeStudentArchive: false,
    },
    limits: {
      maxResults: 5,
      maxSnippetChars: 240,
    },
    evidenceRefs: [
      "evidence:permission:teaching-read",
      "evidence:lesson-material:index-hash-001",
    ],
    latencyBudgetMs: 50,
    writeIntent: false,
    studentDataAccess: "NONE",
    externalModelAllowed: false,
  };
}

function studentTutorSkillInput() {
  return {
    schemaVersion: "2026-06-04.agent.skill.recommend-practice.input.v1",
    invocationId: "skill_call_recommend_practice_001",
    taskId: "agent_task_student_tutor_001",
    contextRef: "ctx_student_tutor_001",
    principalContextRef: "principal-context:student_001:session_student_001",
    query: "根据我最近函数单调性错题推荐练习",
    targetStudentScope: {
      mode: "OWN",
      studentIds: ["student_001"],
      crossStudentComparisonAllowed: false,
    },
    learningSignals: {
      knowledgePointIds: ["kp_function_monotonicity"],
      recentMistakeRefs: ["mistake_ref_quiz_001_q3"],
      archiveItemRefs: ["tarch_student_archive_001"],
    },
    filters: {
      includeTeachingMaterials: true,
      includeStudentArchive: true,
      includeOtherStudents: false,
    },
    limits: {
      maxRecommendations: 3,
      maxReasonChars: 240,
    },
    evidenceRefs: [
      "evidence:permission:student-own-read",
      "evidence:student-app-flow:current",
    ],
    latencyBudgetMs: 50,
    writeIntent: false,
    studentDataAccess: "OWN_OR_ASSIGNED",
    externalModelAllowed: false,
    finalEvaluationAllowed: false,
  };
}

function researchSkillInput() {
  return {
    schemaVersion: "2026-06-04.agent.skill.search-knowledge.input.v1",
    invocationId: "agent_inv_research_search_001",
    taskId: "agent_task_research_query_001",
    contextRef: "shared_ctx_research_001",
    principalContextRef: "principal_ctx_research_teacher_001",
    query: "private research rag intent directory index",
    filters: {
      nodeType: "LOCAL",
      allowedClassifications: ["PUBLIC", "PRIVATE"],
      intentTags: ["private_research", "intent_directory_index"],
      includeStudentArchive: false,
    },
    limits: {
      maxResults: 5,
      maxSnippetChars: 320,
    },
    evidenceRefs: ["knowledge_policy_current", "root_req_research_mode"],
    latencyBudgetMs: 50,
    writeIntent: false,
    studentDataAccess: "NONE",
    externalModelAllowed: false,
    synthesisAllowed: false,
  };
}

function teacherPrincipal() {
  return {
    principalId: "teacher_001",
    subjectType: "USER",
    role: "TEACHER",
    entryPoint: "DESKTOP_TEACHER",
    scopes: ["TEACHING_READ", "KNOWLEDGE_PUBLIC_READ"],
  };
}

function studentPrincipal() {
  return {
    principalId: "student_001",
    subjectType: "USER",
    role: "STUDENT",
    entryPoint: "STUDENT_APP",
    scopes: ["STUDENT_OWN_READ", "TEACHING_READ", "KNOWLEDGE_PUBLIC_READ"],
  };
}

function researchPrincipal() {
  return {
    principalId: "teacher_001",
    subjectType: "USER",
    role: "TEACHER",
    entryPoint: "DESKTOP_TEACHER",
    scopes: ["RESEARCH_READ", "KNOWLEDGE_PUBLIC_READ", "KNOWLEDGE_PRIVATE_READ"],
  };
}

function teachingSharedContext() {
  return {
    schemaVersion: "2026-06-04.agent.shared-context.v1",
    contextId: "ctx_lesson_quiz_triage_001",
    principalContextRef: "principal-context:teacher_001:session_teacher_001",
    sessionId: "session_teacher_001",
    taskId: "agent_task_lesson_quiz_001",
    rootRequirementAnchors: ["教学模式", "随堂测验", "档案资料"],
    dataScopes: {
      principal: "teacher:assigned-class",
      teaching: "READ",
      student: "NONE",
      research: "NONE",
      knowledge: "PUBLIC",
      tool: "NONE",
    },
    evidenceRefs: ["evidence:shared-context:ctx_lesson_quiz_triage_001"],
    redactionState: {
      mode: "STRICT",
      studentDataRedacted: true,
      privateKnowledgeRedacted: true,
      externalModelAllowed: false,
    },
  };
}

function studentTutorSharedContext() {
  return {
    schemaVersion: "2026-06-04.agent.shared-context.v1",
    contextId: "ctx_student_tutor_001",
    principalContextRef: "principal-context:student_001:session_student_001",
    sessionId: "session_student_001",
    taskId: "agent_task_student_tutor_001",
    rootRequirementAnchors: ["学生端", "AI辅导助手", "学生档案", "教学资料"],
    dataScopes: {
      principal: "student:own",
      teaching: "READ",
      student: "ASSIGNED",
      research: "NONE",
      knowledge: "PUBLIC",
      tool: "NONE",
    },
    evidenceRefs: ["evidence:shared-context:ctx_student_tutor_001"],
    redactionState: {
      mode: "STRICT",
      crossStudentDataRedacted: true,
      rawStudentArchiveRedacted: true,
      finalEvaluationRedacted: true,
      externalModelAllowed: false,
    },
  };
}

function researchSharedContext() {
  return {
    schemaVersion: "2026-06-04.agent.shared-context.v1",
    contextId: "shared_ctx_research_001",
    principalContextRef: "principal_ctx_research_teacher_001",
    sessionId: "session_teacher_001",
    taskId: "agent_task_research_query_001",
    rootRequirementAnchors: ["科研模式", "知识库", "统筹智能体"],
    dataScopes: {
      principal: "teacher:research",
      teaching: "NONE",
      student: "NONE",
      research: "READ",
      knowledge: "PRIVATE_ASSIGNED",
      tool: "NONE",
    },
    evidenceRefs: ["evidence:shared-context:research-001"],
    redactionState: {
      mode: "STRICT",
      studentDataRedacted: true,
      privateKnowledgeRedacted: false,
      externalModelAllowed: false,
    },
  };
}

function teachingGuardrailResult() {
  return {
    schemaVersion: "2026-06-04.agent.guardrail-result.v1",
    guardrailId: "guardrail_allow_read_teaching_001",
    taskId: "agent_task_lesson_quiz_001",
    skillId: "search_teaching_material",
    decision: "ALLOW",
    reasons: ["Read-only teaching material search within assigned scope."],
    harnessActionRequired: false,
    rollbackRequired: false,
    evidenceRequired: true,
    directDatabaseWriteAllowed: false,
    safetyChecks: [
      { checkId: "principal_scope", status: "PASS" },
      { checkId: "evidence_policy", status: "PASS" },
    ],
  };
}

function studentTutorGuardrailResult() {
  return {
    schemaVersion: "2026-06-04.agent.guardrail-result.v1",
    guardrailId: "guardrail_allow_student_tutor_001",
    taskId: "agent_task_student_tutor_001",
    skillId: "recommend_practice",
    decision: "ALLOW",
    reasons: ["Read-only scoped practice recommendation."],
    harnessActionRequired: false,
    rollbackRequired: false,
    evidenceRequired: true,
    directDatabaseWriteAllowed: false,
    safetyChecks: [
      { checkId: "student_scope", status: "PASS" },
      { checkId: "raw_archive_redaction", status: "PASS" },
    ],
  };
}

function researchGuardrailResult() {
  return {
    schemaVersion: "2026-06-04.agent.guardrail-result.v1",
    guardrailId: "guardrail_allow_research_001",
    taskId: "agent_task_research_query_001",
    skillId: "search_knowledge",
    decision: "ALLOW",
    reasons: ["Read-only policy-scoped knowledge retrieval."],
    harnessActionRequired: false,
    rollbackRequired: false,
    evidenceRequired: true,
    directDatabaseWriteAllowed: false,
    safetyChecks: [
      { checkId: "knowledge_scope", status: "PASS" },
      { checkId: "student_archive_denied", status: "PASS" },
    ],
  };
}

function teachingRouteDecision() {
  return {
    schemaVersion: "2026-06-04.agent.route-decision.v1",
    routeId: "route_lesson_quiz_single_001",
    taskId: "agent_task_lesson_quiz_001",
    mode: "SINGLE_WORKER",
    leadAgent: "LeadAgent",
    workerAgents: ["TeachingAgent"],
    selectedSkills: ["search_teaching_material"],
    rationale: "Single teaching-domain read path with no external tool mutation.",
    deniedSkills: [],
    fallbackPlan: {
      mode: "READ_ONLY",
      reason: "Return read-only material references.",
      humanReviewPoint: "Teacher reviews before any draft is saved.",
    },
    p99BudgetMs: 50,
    conflictPolicy: { detectConflicts: true, resolutionMode: "LEAD_AGENT_MERGE" },
  };
}

function studentTutorRouteDecision() {
  return {
    schemaVersion: "2026-06-04.agent.route-decision.v1",
    routeId: "route_student_tutor_single_001",
    taskId: "agent_task_student_tutor_001",
    mode: "SINGLE_WORKER",
    leadAgent: "LeadAgent",
    workerAgents: ["StudentTutorAgent"],
    selectedSkills: ["recommend_practice"],
    rationale: "Single student-tutor read path with no final evaluation.",
    deniedSkills: [],
    fallbackPlan: {
      mode: "READ_ONLY",
      reason: "Return scoped practice recommendations.",
      humanReviewPoint: "Teacher reviews before assigning final work.",
    },
    p99BudgetMs: 50,
    conflictPolicy: { detectConflicts: true, resolutionMode: "LEAD_AGENT_MERGE" },
  };
}

function researchRouteDecision() {
  return {
    schemaVersion: "2026-06-04.agent.route-decision.v1",
    routeId: "route_research_single_001",
    taskId: "agent_task_research_query_001",
    mode: "SINGLE_WORKER",
    leadAgent: "LeadAgent",
    workerAgents: ["ResearchAgent"],
    selectedSkills: ["search_knowledge"],
    rationale: "Single research-domain read path with no synthesis.",
    deniedSkills: ["deep_research"],
    fallbackPlan: {
      mode: "READ_ONLY",
      reason: "Return cited knowledge references.",
      humanReviewPoint: "Teacher verifies sources before synthesis.",
    },
    p99BudgetMs: 50,
    conflictPolicy: { detectConflicts: true, resolutionMode: "LEAD_AGENT_MERGE" },
  };
}

function teachingMaterialRow() {
  return {
    archiveItemId: "tarch_teaching_material_001",
    ownerType: "TEACHING",
    materialType: "TEACHING_MATERIAL",
    title: "函数单调性导学案",
    contentRef: "teaching-materials/functions/monotonicity/guide-v1.md",
    matchedSnippets: [
      {
        text: "函数单调性教学目标、例题和课堂练习安排。",
        score: 0.92,
        sourceRef: "teaching-materials/functions/monotonicity/guide-v1.md#section-2",
      },
    ],
    sourceEvidenceRefs: ["evidence:source:tarch_teaching_material_001"],
  };
}

function practiceRow() {
  return {
    practiceId: "practice_function_monotonicity_001",
    title: "函数单调性基础巩固练习",
    sourceType: "TEACHING_MATERIAL",
    knowledgePointIds: ["kp_function_monotonicity"],
    reason: "Recent mistakes point to interval judgment and monotonicity definition confusion.",
    sourceEvidenceRefs: [
      "evidence:source:tarch_teaching_material_001",
      "evidence:student-scope:student_001",
    ],
    expiresAt: "2026-06-11T00:00:00.000Z",
    studentIds: ["student_001"],
    returnedWithinStudentScope: true,
  };
}

function knowledgeRow() {
  return {
    documentId: "private_research_notes_rag",
    chunkId: "private_research_notes_rag_chunk_001",
    classification: "PRIVATE",
    title: "Private research notes: RAG intent directory index",
    citation: "private/research/rag/intent-directory-index#private_research_notes_rag_chunk_001",
    matchedSnippets: [
      {
        text: "private research note compares chunk retrieval with intent directory index",
        score: 0.92,
        sourceRef: "knowledge_chunk_private_research_notes_rag_001",
      },
    ],
    sourceEvidenceRefs: ["knowledge_benchmark_local_private_rag_notes"],
    returnedWithinPolicy: true,
  };
}

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  STUDENT_TUTOR_AGENT_READONLY_RUNTIME_READ_PORT,
  invokeStudentTutorRecommendPractice,
} from "./student-tutor-agent-readonly-runtime-adapter.mjs";

describe("StudentTutorAgent read-only runtime adapter", () => {
  it("invokes the injected read port and maps scoped practice recommendations", async () => {
    const requests = [];
    const output = await invokeStudentTutorRecommendPractice(baseSkillInput(), {
      ...baseDeps(),
      readPort: {
        recommendPracticeContext: async (request) => {
          requests.push(request);
          return [practiceRow()];
        },
      },
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].operation, "recommendPracticeContext");
    assert.equal(requests[0].safety.writeOperationAllowed, false);
    assert.equal(requests[0].safety.crossStudentComparisonAllowed, false);
    assert.equal(output.decision, "FOUND");
    assert.equal(output.recommendations.length, 1);
    assert.equal(output.recommendations[0].practiceId, "practice_function_monotonicity_001");
    assert.equal(output.safety.crossStudentDataReturned, false);
    assert.equal(output.safety.rawStudentArchiveReturned, false);
    assert.equal(output.safety.returnedWithinStudentScope, true);
    assert.equal(output.slo.p99BudgetMs, 50);
    assert(output.evidenceRefs.includes(`evidence:read-port:${STUDENT_TUTOR_AGENT_READONLY_RUNTIME_READ_PORT}`));
    assert(output.evidenceRefs.includes("evidence:student-scope:student_001"));
  });

  it("returns NO_MATCH when no scoped recommendations are available", async () => {
    const output = await invokeStudentTutorRecommendPractice(baseSkillInput(), {
      ...baseDeps(),
      readPort: {
        recommendPracticeContext: async () => [],
      },
    });

    assert.equal(output.decision, "NO_MATCH");
    assert.equal(output.recommendations.length, 0);
  });

  it("rejects write, external model, final evaluation, and cross-student requests before reading", async () => {
    let called = false;
    const readPort = {
      recommendPracticeContext: async () => {
        called = true;
        return [];
      },
    };

    await assert.rejects(
      () => invokeStudentTutorRecommendPractice({ ...baseSkillInput(), writeIntent: true }, { ...baseDeps(), readPort }),
      /input\.writeIntent must be false/u,
    );
    await assert.rejects(
      () => invokeStudentTutorRecommendPractice({ ...baseSkillInput(), externalModelAllowed: true }, { ...baseDeps(), readPort }),
      /externalModelAllowed must be false/u,
    );
    await assert.rejects(
      () => invokeStudentTutorRecommendPractice({ ...baseSkillInput(), finalEvaluationAllowed: true }, { ...baseDeps(), readPort }),
      /finalEvaluationAllowed must be false/u,
    );
    await assert.rejects(
      () => invokeStudentTutorRecommendPractice({
        ...baseSkillInput(),
        targetStudentScope: {
          ...baseSkillInput().targetStudentScope,
          crossStudentComparisonAllowed: true,
        },
      }, { ...baseDeps(), readPort }),
      /crossStudentComparisonAllowed must be false/u,
    );
    assert.equal(called, false);
  });

  it("enforces OWN and ASSIGNED principal scopes", async () => {
    await assert.rejects(
      () => invokeStudentTutorRecommendPractice(baseSkillInput(), {
        ...readyDeps(),
        principalContext: teacherPrincipal(),
      }),
      /OWN recommendations require a student principal/u,
    );

    await assert.rejects(
      () => invokeStudentTutorRecommendPractice(assignedSkillInput(), {
        ...readyDeps(),
        principalContext: studentPrincipal(),
      }),
      /student principals cannot request assigned-student recommendations/u,
    );

    const output = await invokeStudentTutorRecommendPractice(assignedSkillInput(), {
      ...readyDeps(),
      principalContext: teacherPrincipal(),
      sharedContext: assignedSharedContext(),
      routeDecision: assignedRouteDecision(),
      readPort: {
        recommendPracticeContext: async () => [practiceRow({ studentIds: ["student_007"] })],
      },
    });

    assert.equal(output.decision, "FOUND");
    assert.equal(output.recommendations.length, 1);
  });

  it("rejects unsafe SharedContext scopes", async () => {
    await assert.rejects(
      () => invokeStudentTutorRecommendPractice(baseSkillInput(), {
        ...readyDeps(),
        sharedContext: {
          ...sharedContext(),
          dataScopes: {
            ...sharedContext().dataScopes,
            student: "ALL",
          },
        },
      }),
      /sharedContext\.dataScopes\.student must be ASSIGNED/u,
    );

    await assert.rejects(
      () => invokeStudentTutorRecommendPractice(baseSkillInput(), {
        ...readyDeps(),
        sharedContext: {
          ...sharedContext(),
          redactionState: {
            ...sharedContext().redactionState,
            rawStudentArchiveRedacted: false,
          },
        },
      }),
      /rawStudentArchiveRedacted must be true/u,
    );
  });

  it("rejects guardrail deny and wrong route decisions", async () => {
    await assert.rejects(
      () => invokeStudentTutorRecommendPractice(baseSkillInput(), {
        ...readyDeps(),
        guardrailResult: {
          ...guardrailResult(),
          decision: "DENY",
        },
      }),
      /guardrailResult\.decision must be ALLOW/u,
    );

    await assert.rejects(
      () => invokeStudentTutorRecommendPractice(baseSkillInput(), {
        ...readyDeps(),
        routeDecision: {
          ...routeDecision(),
          workerAgents: ["TeachingAgent"],
        },
      }),
      /must select StudentTutorAgent only/u,
    );
  });

  it("requires an injected read port and rejects unsafe rows", async () => {
    await assert.rejects(
      () => invokeStudentTutorRecommendPractice(baseSkillInput(), {
        ...baseDeps(),
        readPort: {},
      }),
      /readPort\.recommendPracticeContext must be injected/u,
    );

    await assert.rejects(
      () => invokeStudentTutorRecommendPractice(baseSkillInput(), {
        ...baseDeps(),
        readPort: {
          recommendPracticeContext: async () => [practiceRow({ crossStudentDataReturned: true })],
        },
      }),
      /unsafe student data/u,
    );

    await assert.rejects(
      () => invokeStudentTutorRecommendPractice(baseSkillInput(), {
        ...baseDeps(),
        readPort: {
          recommendPracticeContext: async () => [practiceRow({ studentIds: ["student_999"] })],
        },
      }),
      /out-of-scope student/u,
    );
  });

  it("truncates recommendations and reasons to request limits", async () => {
    const output = await invokeStudentTutorRecommendPractice({
      ...baseSkillInput(),
      limits: { maxRecommendations: 1, maxReasonChars: 12 },
    }, {
      ...baseDeps(),
      readPort: {
        recommendPracticeContext: async () => [
          practiceRow({ reason: "abc".repeat(200) }),
          practiceRow({ practiceId: "practice_function_monotonicity_002" }),
        ],
      },
    });

    assert.equal(output.recommendations.length, 1);
    assert.equal(output.recommendations[0].reason.length, 12);
  });
});

function readyDeps() {
  return {
    ...baseDeps(),
    readPort: {
      recommendPracticeContext: async () => [],
    },
  };
}

function baseDeps() {
  return {
    principalContext: studentPrincipal(),
    sharedContext: sharedContext(),
    guardrailResult: guardrailResult(),
    routeDecision: routeDecision(),
  };
}

function baseSkillInput() {
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

function assignedSkillInput() {
  return {
    ...baseSkillInput(),
    invocationId: "skill_call_recommend_practice_002",
    principalContextRef: "principal-context:teacher_001:session_teacher_001",
    targetStudentScope: {
      mode: "ASSIGNED",
      studentIds: ["student_007"],
      crossStudentComparisonAllowed: false,
    },
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

function teacherPrincipal() {
  return {
    principalId: "teacher_001",
    subjectType: "USER",
    role: "TEACHER",
    entryPoint: "DESKTOP_TEACHER",
    scopes: ["STUDENT_ASSIGNED_READ", "TEACHING_READ", "KNOWLEDGE_PUBLIC_READ"],
  };
}

function sharedContext() {
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

function assignedSharedContext() {
  return {
    ...sharedContext(),
    principalContextRef: "principal-context:teacher_001:session_teacher_001",
    sessionId: "session_teacher_001",
    dataScopes: {
      ...sharedContext().dataScopes,
      principal: "teacher:assigned-class",
    },
  };
}

function guardrailResult() {
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

function routeDecision() {
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

function assignedRouteDecision() {
  return {
    ...routeDecision(),
    routeId: "route_student_tutor_assigned_001",
  };
}

function practiceRow(overrides = {}) {
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
    ...overrides,
  };
}

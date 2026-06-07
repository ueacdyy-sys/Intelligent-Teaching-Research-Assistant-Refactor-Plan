import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TEACHING_AGENT_READONLY_RUNTIME_READ_PORT,
  invokeTeachingAgentSearchTeachingMaterial,
} from "./teaching-agent-readonly-runtime-adapter.mjs";

describe("TeachingAgent read-only runtime adapter", () => {
  it("invokes the injected read port and maps teaching material results", async () => {
    const requests = [];
    const output = await invokeTeachingAgentSearchTeachingMaterial(baseSkillInput(), {
      ...baseDeps(),
      readPort: {
        searchTeachingMaterials: async (request) => {
          requests.push(request);
          return [teachingMaterialRow()];
        },
      },
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].operation, "searchTeachingMaterials");
    assert.equal(requests[0].safety.directDatabaseAccessAllowed, false);
    assert.equal(requests[0].safety.writeOperationAllowed, false);
    assert.equal(output.decision, "FOUND");
    assert.equal(output.items.length, 1);
    assert.equal(output.items[0].ownerType, "TEACHING");
    assert.equal(output.items[0].matchedSnippets[0].text, "函数单调性教学目标、例题和课堂练习安排。");
    assert.equal(output.safety.directDatabaseWriteAllowed, false);
    assert.equal(output.safety.studentDataReturned, false);
    assert.equal(output.safety.externalModelUsed, false);
    assert.equal(output.slo.p99BudgetMs, 50);
    assert.equal(output.slo.runtimeEvidenceClass, "CONTRACT_ONLY");
    assert(output.evidenceRefs.includes(`evidence:read-port:${TEACHING_AGENT_READONLY_RUNTIME_READ_PORT}`));
    assert(output.evidenceRefs.some((ref) => ref.startsWith("evidence:input-hash:")));
  });

  it("returns NO_MATCH when the read port finds no teaching materials", async () => {
    const output = await invokeTeachingAgentSearchTeachingMaterial(baseSkillInput(), {
      ...baseDeps(),
      readPort: {
        searchTeachingMaterials: async () => [],
      },
    });

    assert.equal(output.decision, "NO_MATCH");
    assert.equal(output.items.length, 0);
    assert.match(output.summary, /No teaching materials/u);
  });

  it("rejects write intent before the read port is called", async () => {
    let called = false;

    await assert.rejects(
      () => invokeTeachingAgentSearchTeachingMaterial({
        ...baseSkillInput(),
        writeIntent: true,
      }, {
        ...baseDeps(),
        readPort: {
          searchTeachingMaterials: async () => {
            called = true;
            return [];
          },
        },
      }),
      /input\.writeIntent must be false/u,
    );
    assert.equal(called, false);
  });

  it("rejects student archive and external model requests", async () => {
    await assert.rejects(
      () => invokeTeachingAgentSearchTeachingMaterial({
        ...baseSkillInput(),
        filters: {
          ...baseSkillInput().filters,
          includeStudentArchive: true,
        },
      }, readyDeps()),
      /includeStudentArchive must be false/u,
    );

    await assert.rejects(
      () => invokeTeachingAgentSearchTeachingMaterial({
        ...baseSkillInput(),
        externalModelAllowed: true,
      }, readyDeps()),
      /externalModelAllowed must be false/u,
    );
  });

  it("rejects student and remote principals", async () => {
    await assert.rejects(
      () => invokeTeachingAgentSearchTeachingMaterial(baseSkillInput(), {
        ...readyDeps(),
        principalContext: {
          ...teacherPrincipal(),
          role: "STUDENT",
          subjectType: "USER",
          entryPoint: "STUDENT_APP",
          scopes: ["STUDENT_OWN_READ"],
        },
      }),
      /students and remote channels/u,
    );

    await assert.rejects(
      () => invokeTeachingAgentSearchTeachingMaterial(baseSkillInput(), {
        ...readyDeps(),
        principalContext: {
          ...teacherPrincipal(),
          subjectType: "REMOTE_CHANNEL",
          role: "REMOTE_OPERATOR",
          entryPoint: "REMOTE_SOCIAL",
        },
      }),
      /students and remote channels/u,
    );
  });

  it("rejects unsafe SharedContext scopes", async () => {
    await assert.rejects(
      () => invokeTeachingAgentSearchTeachingMaterial(baseSkillInput(), {
        ...readyDeps(),
        sharedContext: {
          ...sharedContext(),
          dataScopes: {
            ...sharedContext().dataScopes,
            student: "ASSIGNED",
          },
        },
      }),
      /sharedContext\.dataScopes\.student must be NONE/u,
    );

    await assert.rejects(
      () => invokeTeachingAgentSearchTeachingMaterial(baseSkillInput(), {
        ...readyDeps(),
        sharedContext: {
          ...sharedContext(),
          dataScopes: {
            ...sharedContext().dataScopes,
            knowledge: "PRIVATE_ASSIGNED",
          },
        },
      }),
      /sharedContext\.dataScopes\.knowledge must be PUBLIC/u,
    );
  });

  it("rejects guardrail deny and failing safety checks", async () => {
    await assert.rejects(
      () => invokeTeachingAgentSearchTeachingMaterial(baseSkillInput(), {
        ...readyDeps(),
        guardrailResult: {
          ...guardrailResult(),
          decision: "DENY",
        },
      }),
      /guardrailResult\.decision must be ALLOW/u,
    );

    await assert.rejects(
      () => invokeTeachingAgentSearchTeachingMaterial(baseSkillInput(), {
        ...readyDeps(),
        guardrailResult: {
          ...guardrailResult(),
          safetyChecks: [{ checkId: "student_scope", status: "FAIL" }],
        },
      }),
      /guardrail safety check failed/u,
    );
  });

  it("rejects swarm routes and wrong worker or skill routes", async () => {
    await assert.rejects(
      () => invokeTeachingAgentSearchTeachingMaterial(baseSkillInput(), {
        ...readyDeps(),
        routeDecision: {
          ...routeDecision(),
          mode: "SWARM",
        },
      }),
      /routeDecision\.mode must be SINGLE_WORKER/u,
    );

    await assert.rejects(
      () => invokeTeachingAgentSearchTeachingMaterial(baseSkillInput(), {
        ...readyDeps(),
        routeDecision: {
          ...routeDecision(),
          workerAgents: ["ResearchAgent"],
        },
      }),
      /must select TeachingAgent only/u,
    );

    await assert.rejects(
      () => invokeTeachingAgentSearchTeachingMaterial(baseSkillInput(), {
        ...readyDeps(),
        routeDecision: {
          ...routeDecision(),
          selectedSkills: ["search_knowledge"],
        },
      }),
      /must select search_teaching_material only/u,
    );
  });

  it("requires an injected read port and rejects unsafe read port rows", async () => {
    await assert.rejects(
      () => invokeTeachingAgentSearchTeachingMaterial(baseSkillInput(), {
        ...baseDeps(),
        readPort: {},
      }),
      /readPort\.searchTeachingMaterials must be injected/u,
    );

    await assert.rejects(
      () => invokeTeachingAgentSearchTeachingMaterial(baseSkillInput(), {
        ...baseDeps(),
        readPort: {
          searchTeachingMaterials: async () => [{
            ...teachingMaterialRow(),
            ownerType: "STUDENT",
          }],
        },
      }),
      /ownerType must be TEACHING/u,
    );

    await assert.rejects(
      () => invokeTeachingAgentSearchTeachingMaterial(baseSkillInput(), {
        ...baseDeps(),
        readPort: {
          searchTeachingMaterials: async () => [{
            ...teachingMaterialRow(),
            studentDataReturned: true,
          }],
        },
      }),
      /unsafe data/u,
    );
  });

  it("truncates results and snippets to request limits", async () => {
    const longText = "abc".repeat(200);
    const output = await invokeTeachingAgentSearchTeachingMaterial({
      ...baseSkillInput(),
      limits: { maxResults: 1, maxSnippetChars: 12 },
    }, {
      ...baseDeps(),
      readPort: {
        searchTeachingMaterials: async () => [
          teachingMaterialRow({ matchedSnippets: [{ text: longText, score: 1.5, sourceRef: "source#a" }] }),
          teachingMaterialRow({ archiveItemId: "tarch_teaching_material_002" }),
        ],
      },
    });

    assert.equal(output.items.length, 1);
    assert.equal(output.items[0].matchedSnippets[0].text.length, 12);
    assert.equal(output.items[0].matchedSnippets[0].score, 1);
  });
});

function readyDeps() {
  return {
    ...baseDeps(),
    readPort: {
      searchTeachingMaterials: async () => [],
    },
  };
}

function baseDeps() {
  return {
    principalContext: teacherPrincipal(),
    sharedContext: sharedContext(),
    guardrailResult: guardrailResult(),
    routeDecision: routeDecision(),
  };
}

function baseSkillInput() {
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

function teacherPrincipal() {
  return {
    principalId: "teacher_001",
    subjectType: "USER",
    role: "TEACHER",
    entryPoint: "DESKTOP_TEACHER",
    scopes: ["TEACHING_READ", "KNOWLEDGE_PUBLIC_READ"],
  };
}

function sharedContext() {
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

function guardrailResult() {
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

function routeDecision() {
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

function teachingMaterialRow(overrides = {}) {
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
    ...overrides,
  };
}

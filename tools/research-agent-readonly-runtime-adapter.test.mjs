import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  RESEARCH_AGENT_READONLY_RUNTIME_READ_PORT,
  invokeResearchAgentSearchKnowledge,
} from "./research-agent-readonly-runtime-adapter.mjs";

describe("ResearchAgent read-only runtime adapter", () => {
  it("invokes the injected read port and maps policy-scoped knowledge results", async () => {
    const requests = [];
    const output = await invokeResearchAgentSearchKnowledge(baseSkillInput(), {
      ...baseDeps(),
      readPort: {
        searchKnowledge: async (request) => {
          requests.push(request);
          return [knowledgeRow()];
        },
      },
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].operation, "searchKnowledge");
    assert.equal(requests[0].safety.writeOperationAllowed, false);
    assert.equal(requests[0].safety.studentArchiveAllowed, false);
    assert.equal(output.decision, "FOUND");
    assert.equal(output.items.length, 1);
    assert.equal(output.items[0].classification, "PRIVATE");
    assert.equal(output.safety.studentArchiveReturned, false);
    assert.equal(output.safety.studentDataReturned, false);
    assert.equal(output.safety.returnedWithinPolicy, true);
    assert.equal(output.slo.p99BudgetMs, 50);
    assert(output.evidenceRefs.includes(`evidence:read-port:${RESEARCH_AGENT_READONLY_RUNTIME_READ_PORT}`));
  });

  it("returns NO_MATCH when no policy-scoped knowledge results are available", async () => {
    const output = await invokeResearchAgentSearchKnowledge(baseSkillInput(), {
      ...baseDeps(),
      readPort: {
        searchKnowledge: async () => [],
      },
    });

    assert.equal(output.decision, "NO_MATCH");
    assert.equal(output.items.length, 0);
  });

  it("rejects write, student archive, external model, and synthesis requests before reading", async () => {
    let called = false;
    const readPort = {
      searchKnowledge: async () => {
        called = true;
        return [];
      },
    };

    await assert.rejects(
      () => invokeResearchAgentSearchKnowledge({ ...baseSkillInput(), writeIntent: true }, { ...baseDeps(), readPort }),
      /input\.writeIntent must be false/u,
    );
    await assert.rejects(
      () => invokeResearchAgentSearchKnowledge({
        ...baseSkillInput(),
        filters: { ...baseSkillInput().filters, includeStudentArchive: true },
      }, { ...baseDeps(), readPort }),
      /includeStudentArchive must be false/u,
    );
    await assert.rejects(
      () => invokeResearchAgentSearchKnowledge({ ...baseSkillInput(), externalModelAllowed: true }, { ...baseDeps(), readPort }),
      /externalModelAllowed must be false/u,
    );
    await assert.rejects(
      () => invokeResearchAgentSearchKnowledge({ ...baseSkillInput(), synthesisAllowed: true }, { ...baseDeps(), readPort }),
      /synthesisAllowed must be false/u,
    );
    assert.equal(called, false);
  });

  it("enforces research, private knowledge, and remote device principal scopes", async () => {
    await assert.rejects(
      () => invokeResearchAgentSearchKnowledge(baseSkillInput(), {
        ...readyDeps(),
        principalContext: { ...teacherPrincipal(), scopes: ["KNOWLEDGE_PRIVATE_READ", "KNOWLEDGE_PUBLIC_READ"] },
      }),
      /RESEARCH_READ or ADMIN_SYSTEM scope is required/u,
    );
    await assert.rejects(
      () => invokeResearchAgentSearchKnowledge(baseSkillInput(), {
        ...readyDeps(),
        principalContext: { ...teacherPrincipal(), scopes: ["RESEARCH_READ", "KNOWLEDGE_PUBLIC_READ"] },
      }),
      /knowledge private read scope is required/u,
    );
    await assert.rejects(
      () => invokeResearchAgentSearchKnowledge(remoteDeviceSkillInput(), {
        ...readyDeps(),
        principalContext: teacherPrincipal(),
        sharedContext: remoteSharedContext(),
        routeDecision: remoteRouteDecision(),
      }),
      /remote device read scope is required/u,
    );

    const output = await invokeResearchAgentSearchKnowledge(remoteDeviceSkillInput(), {
      ...readyDeps(),
      principalContext: {
        ...teacherPrincipal(),
        scopes: ["RESEARCH_READ", "KNOWLEDGE_PRIVATE_READ", "REMOTE_DEVICE_READ"],
      },
      sharedContext: remoteSharedContext(),
      routeDecision: remoteRouteDecision(),
      readPort: {
        searchKnowledge: async () => [knowledgeRow({ classification: "REMOTE_DEVICE_OWNED" })],
      },
    });

    assert.equal(output.decision, "FOUND");
    assert.equal(output.items[0].classification, "REMOTE_DEVICE_OWNED");
  });

  it("rejects unsafe SharedContext scopes", async () => {
    await assert.rejects(
      () => invokeResearchAgentSearchKnowledge(baseSkillInput(), {
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
      () => invokeResearchAgentSearchKnowledge(baseSkillInput(), {
        ...readyDeps(),
        sharedContext: {
          ...sharedContext(),
          dataScopes: {
            ...sharedContext().dataScopes,
            tool: "READ_ONLY",
          },
        },
      }),
      /sharedContext\.dataScopes\.tool must be NONE/u,
    );
  });

  it("rejects guardrail deny and wrong route decisions", async () => {
    await assert.rejects(
      () => invokeResearchAgentSearchKnowledge(baseSkillInput(), {
        ...readyDeps(),
        guardrailResult: {
          ...guardrailResult(),
          decision: "DENY",
        },
      }),
      /guardrailResult\.decision must be ALLOW/u,
    );

    await assert.rejects(
      () => invokeResearchAgentSearchKnowledge(baseSkillInput(), {
        ...readyDeps(),
        routeDecision: {
          ...routeDecision(),
          selectedSkills: ["deep_research"],
        },
      }),
      /must select search_knowledge only/u,
    );
  });

  it("requires an injected read port and rejects unsafe rows", async () => {
    await assert.rejects(
      () => invokeResearchAgentSearchKnowledge(baseSkillInput(), {
        ...baseDeps(),
        readPort: {},
      }),
      /readPort\.searchKnowledge must be injected/u,
    );

    await assert.rejects(
      () => invokeResearchAgentSearchKnowledge(baseSkillInput(), {
        ...baseDeps(),
        readPort: {
          searchKnowledge: async () => [knowledgeRow({ studentDataReturned: true })],
        },
      }),
      /unsafe write, student, model, tool, or policy state/u,
    );

    await assert.rejects(
      () => invokeResearchAgentSearchKnowledge(baseSkillInput(), {
        ...baseDeps(),
        readPort: {
          searchKnowledge: async () => [knowledgeRow({ classification: "REMOTE_DEVICE_OWNED" })],
        },
      }),
      /out-of-policy classification/u,
    );
  });

  it("truncates results and snippets to request limits", async () => {
    const output = await invokeResearchAgentSearchKnowledge({
      ...baseSkillInput(),
      limits: { maxResults: 1, maxSnippetChars: 12 },
    }, {
      ...baseDeps(),
      readPort: {
        searchKnowledge: async () => [
          knowledgeRow({ matchedSnippets: [{ text: "abc".repeat(200), score: 0.9, sourceRef: "source_long" }] }),
          knowledgeRow({ documentId: "private_research_notes_second", chunkId: "chunk_second" }),
        ],
      },
    });

    assert.equal(output.items.length, 1);
    assert.equal(output.items[0].matchedSnippets[0].text.length, 12);
  });
});

function readyDeps() {
  return {
    ...baseDeps(),
    readPort: {
      searchKnowledge: async () => [],
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

function remoteDeviceSkillInput() {
  return {
    ...baseSkillInput(),
    invocationId: "agent_inv_research_remote_001",
    filters: {
      nodeType: "REMOTE_DEVICE",
      allowedClassifications: ["REMOTE_DEVICE_OWNED"],
      intentTags: ["remote_owned_notes"],
      includeStudentArchive: false,
    },
  };
}

function teacherPrincipal() {
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
    contextId: "shared_ctx_research_001",
    principalContextRef: "principal_ctx_research_teacher_001",
    sessionId: "session_teacher_001",
    taskId: "agent_task_research_query_001",
    rootRequirementAnchors: ["research_mode", "knowledge_base", "agent_harness"],
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

function remoteSharedContext() {
  return {
    ...sharedContext(),
    evidenceRefs: ["evidence:shared-context:research-remote-001"],
  };
}

function guardrailResult() {
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

function routeDecision() {
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

function remoteRouteDecision() {
  return {
    ...routeDecision(),
    routeId: "route_research_remote_single_001",
  };
}

function knowledgeRow(overrides = {}) {
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
    ...overrides,
  };
}

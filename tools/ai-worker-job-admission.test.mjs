import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  admitAiWorkerJobs,
  auditAiWorkerJobAdmission,
  formatAiWorkerJobAdmissionAudit,
} from "./ai-worker-job-admission.mjs";

const root = process.cwd();

function loadCurrentInputs() {
  return {
    examples: loadJson("contracts/ai-worker/ai-worker-job.examples.json"),
    knowledgePolicy: loadJson("contracts/knowledge/knowledge-access-policy.current.json"),
  };
}

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe("AI worker job admission", () => {
  it("allows all current valid worker job examples", () => {
    const result = admitAiWorkerJobs({
      ...loadCurrentInputs(),
      generatedAt: "2026-05-30T15:00:00Z",
    });

    assert.equal(result.decision, "ALLOW_DISPATCH");
    assert.equal(result.admissions.length, loadCurrentInputs().examples.jobs.length);
    assert(result.admissions.every((admission) => admission.decision === "ALLOW_DISPATCH"));
  });

  it("preserves decision identity and source policy context", () => {
    const result = admitAiWorkerJobs({
      ...loadCurrentInputs(),
      generatedAt: "2026-05-30T15:00:00Z",
    });
    const admission = result.admissions.find((item) => item.jobId === "ai_worker_job_public_rag_cloud_001");

    assert.equal(admission.jobId, "ai_worker_job_public_rag_cloud_001");
    assert.equal(admission.nodeType, "CLOUD");
    assert.equal(admission.capabilityKind, "RAG_RETRIEVAL");
    assert.equal(admission.sourcePolicyVersion, "2026-05-30.knowledge.access-policy.v1");
    assert.deepEqual(admission.reasons, ["allowed by knowledge access policy"]);
  });

  it("blocks cloud jobs requesting private knowledge", () => {
    const inputs = loadCurrentInputs();
    const examples = clone(inputs.examples);
    examples.jobs = [{
      ...clone(examples.jobs[0]),
      jobId: "ai_worker_job_invalid_cloud_private",
      nodeType: "CLOUD",
      dataAccess: {
        knowledgeScope: "PRIVATE",
        studentDataScope: "NONE",
        sourceLocation: "LOCAL_PRIVATE_KNOWLEDGE",
      },
    }];

    const result = admitAiWorkerJobs({ ...inputs, examples });

    assert.equal(result.decision, "BLOCK_DISPATCH");
    assert(result.admissions[0].reasons.includes("node CLOUD cannot access local classification PRIVATE"));
  });

  it("blocks cloud jobs requesting student archive data", () => {
    const inputs = loadCurrentInputs();
    const examples = clone(inputs.examples);
    examples.jobs = [{
      ...clone(examples.jobs[0]),
      jobId: "ai_worker_job_invalid_cloud_student_archive",
      nodeType: "CLOUD",
      dataAccess: {
        knowledgeScope: "NONE",
        studentDataScope: "OWN",
        sourceLocation: "LOCAL_STUDENT_ARCHIVE",
      },
    }];

    const result = admitAiWorkerJobs({ ...inputs, examples });

    assert.equal(result.decision, "BLOCK_DISPATCH");
    assert(result.admissions[0].reasons.includes("node CLOUD cannot access local classification STUDENT_ARCHIVE"));
  });

  it("blocks remote-device jobs requesting this machine's local knowledge", () => {
    const inputs = loadCurrentInputs();
    const examples = clone(inputs.examples);
    examples.jobs = [{
      ...clone(examples.jobs[0]),
      jobId: "ai_worker_job_invalid_remote_local_public",
      nodeType: "REMOTE_DEVICE",
      dataAccess: {
        knowledgeScope: "PUBLIC",
        studentDataScope: "NONE",
        sourceLocation: "PUBLIC_KNOWLEDGE",
      },
    }];

    const result = admitAiWorkerJobs({ ...inputs, examples });

    assert.equal(result.decision, "BLOCK_DISPATCH");
    assert(result.admissions[0].reasons.includes("node REMOTE_DEVICE cannot access this machine's local knowledge"));
  });

  it("blocks jobs that try to add baseline runtime dependencies", () => {
    const inputs = loadCurrentInputs();
    const examples = clone(inputs.examples);
    examples.jobs = [{ ...clone(examples.jobs[0]), baselineRuntimeDependencyAllowed: true }];

    const result = admitAiWorkerJobs({ ...inputs, examples });

    assert.equal(result.decision, "BLOCK_DISPATCH");
    assert(result.admissions[0].reasons.includes("baseline runtime dependencies are not allowed"));
  });

  it("blocks jobs that try direct main database writes", () => {
    const inputs = loadCurrentInputs();
    const examples = clone(inputs.examples);
    examples.jobs = [{ ...clone(examples.jobs[0]), directMainDatabaseWriteAllowed: true }];

    const result = admitAiWorkerJobs({ ...inputs, examples });

    assert.equal(result.decision, "BLOCK_DISPATCH");
    assert(result.admissions[0].reasons.includes("direct main database writes are not allowed"));
  });

  it("passes the current admission audit", () => {
    const report = auditAiWorkerJobAdmission(loadCurrentInputs());

    assert.equal(report.readiness, "READY");
    assert.match(formatAiWorkerJobAdmissionAudit(report), /AI Worker job admission: READY/);
  });
});

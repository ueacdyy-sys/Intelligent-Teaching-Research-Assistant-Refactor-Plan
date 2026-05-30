import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditAiWorkerJobContracts,
  formatAiWorkerJobAudit,
} from "./ai-worker-job-audit.mjs";

const root = process.cwd();

function loadCurrentInputs() {
  return {
    jobSchema: loadJson("contracts/ai-worker/ai-worker-job.schema.json"),
    resultSchema: loadJson("contracts/ai-worker/ai-worker-result.schema.json"),
    examples: loadJson("contracts/ai-worker/ai-worker-job.examples.json"),
    resultExample: loadJson("contracts/ai-worker/ai-worker-result.example.json"),
  };
}

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe("AI worker job contract audit", () => {
  it("passes the current isolated worker job contracts", () => {
    const report = auditAiWorkerJobContracts(loadCurrentInputs());

    assert.equal(report.readiness, "READY");
    assert.match(formatAiWorkerJobAudit(report), /AI Worker job: READY/);
  });

  it("fails when worker jobs can become baseline runtime dependencies", () => {
    const inputs = loadCurrentInputs();
    const jobSchema = clone(inputs.jobSchema);
    jobSchema.properties.baselineRuntimeDependencyAllowed.const = true;

    const report = auditAiWorkerJobContracts({ ...inputs, jobSchema });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "job.no_baseline_dependency").passed, false);
  });

  it("fails when a required worker capability is missing", () => {
    const inputs = loadCurrentInputs();
    const jobSchema = clone(inputs.jobSchema);
    jobSchema.properties.capabilityKind.enum = ["RAG_RETRIEVAL", "OCR_RECOGNITION"];

    const report = auditAiWorkerJobContracts({ ...inputs, jobSchema });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "job.capability_vocab").passed, false);
  });

  it("fails when worker results can write directly to the main database", () => {
    const inputs = loadCurrentInputs();
    const resultSchema = clone(inputs.resultSchema);
    resultSchema.properties.directMainDatabaseWriteAttempted.const = true;

    const report = auditAiWorkerJobContracts({ ...inputs, resultSchema });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "result.no_direct_db_write").passed, false);
  });

  it("fails when a cloud worker job requests private knowledge", () => {
    const inputs = loadCurrentInputs();
    const examples = clone(inputs.examples);
    examples.jobs.push({
      ...clone(examples.jobs[0]),
      jobId: "ai_worker_job_invalid_cloud_private",
      nodeType: "CLOUD",
      dataAccess: {
        knowledgeScope: "PRIVATE",
        studentDataScope: "NONE",
        sourceLocation: "LOCAL_PRIVATE_KNOWLEDGE",
      },
    });

    const report = auditAiWorkerJobContracts({ ...inputs, examples });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "examples.cloud_public_only").passed, false);
  });

  it("fails when the public cloud RAG example is missing", () => {
    const inputs = loadCurrentInputs();
    const examples = clone(inputs.examples);
    examples.jobs = examples.jobs.filter((job) => job.nodeType !== "CLOUD");

    const report = auditAiWorkerJobContracts({ ...inputs, examples });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "examples.cloud_public_rag_present").passed, false);
  });

  it("fails when a remote-device worker job reads local private data", () => {
    const inputs = loadCurrentInputs();
    const examples = clone(inputs.examples);
    examples.jobs.push({
      ...clone(examples.jobs[0]),
      jobId: "ai_worker_job_invalid_remote_local_archive",
      nodeType: "REMOTE_DEVICE",
      dataAccess: {
        knowledgeScope: "NONE",
        studentDataScope: "OWN",
        sourceLocation: "LOCAL_STUDENT_ARCHIVE",
      },
    });

    const report = auditAiWorkerJobContracts({ ...inputs, examples });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "examples.remote_no_local_private").passed, false);
  });
});

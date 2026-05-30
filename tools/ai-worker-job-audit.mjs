import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const AI_WORKER_FILES = {
  jobSchema: "contracts/ai-worker/ai-worker-job.schema.json",
  resultSchema: "contracts/ai-worker/ai-worker-result.schema.json",
  examples: "contracts/ai-worker/ai-worker-job.examples.json",
  resultExample: "contracts/ai-worker/ai-worker-result.example.json",
};

const REQUIRED_CAPABILITIES = ["RAG_RETRIEVAL", "OCR_RECOGNITION", "FINE_TUNING"];
const LOCAL_PRIVATE_LOCATIONS = ["LOCAL_PRIVATE_KNOWLEDGE", "LOCAL_STUDENT_ARCHIVE"];

export function auditAiWorkerJobContracts(inputs) {
  const findings = [];
  const jobSchema = inputs.jobSchema ?? {};
  const resultSchema = inputs.resultSchema ?? {};
  const examples = inputs.examples ?? {};
  const resultExample = inputs.resultExample ?? {};
  const jobs = Array.isArray(examples.jobs) ? examples.jobs : [];

  addFinding(findings, {
    id: "job.capability_vocab",
    passed: hasAll(enumValues(jobSchema, "capabilityKind"), REQUIRED_CAPABILITIES),
    actual: enumValues(jobSchema, "capabilityKind").join(","),
    expected: REQUIRED_CAPABILITIES.join(","),
    remediation: "AI worker jobs must cover RAG retrieval, OCR recognition, and fine-tuning as isolated worker capabilities.",
  });

  addFinding(findings, {
    id: "job.python_worker_owner",
    passed: jobSchema.properties?.executionOwner?.const === "PYTHON_WORKER" &&
      requiredFields(jobSchema).includes("executionOwner"),
    actual: jobSchema.properties?.executionOwner?.const,
    expected: "PYTHON_WORKER",
    remediation: "RAG/OCR/training work must stay behind the Python worker boundary.",
  });

  addFinding(findings, {
    id: "job.no_baseline_dependency",
    passed: jobSchema.properties?.baselineRuntimeDependencyAllowed?.const === false &&
      requiredFields(jobSchema).includes("baselineRuntimeDependencyAllowed"),
    actual: jobSchema.properties?.baselineRuntimeDependencyAllowed?.const,
    expected: false,
    remediation: "AI worker jobs must not make model, OCR, RAG, or training packages baseline runtime dependencies.",
  });

  addFinding(findings, {
    id: "job.no_direct_db_write",
    passed: jobSchema.properties?.directMainDatabaseWriteAllowed?.const === false &&
      requiredFields(jobSchema).includes("directMainDatabaseWriteAllowed"),
    actual: jobSchema.properties?.directMainDatabaseWriteAllowed?.const,
    expected: false,
    remediation: "Workers must return artifacts through the boundary rather than writing directly to the main database.",
  });

  addFinding(findings, {
    id: "job.boundary_fields",
    passed: hasAll(requiredFields(jobSchema), ["nodeType", "dataAccess", "inputRefs", "outputPolicy"]),
    actual: requiredFields(jobSchema).join(","),
    expected: "nodeType,dataAccess,inputRefs,outputPolicy",
    remediation: "Worker jobs must declare node type, data access, inputs, and output policy.",
  });

  addFinding(findings, {
    id: "result.no_direct_db_write",
    passed: resultSchema.properties?.directMainDatabaseWriteAttempted?.const === false &&
      requiredFields(resultSchema).includes("directMainDatabaseWriteAttempted"),
    actual: resultSchema.properties?.directMainDatabaseWriteAttempted?.const,
    expected: false,
    remediation: "Worker results must prove that no direct main database write was attempted.",
  });

  const artifactItem = resultSchema.properties?.artifactRefs?.items ?? {};
  addFinding(findings, {
    id: "result.no_inline_private_payload",
    passed: artifactItem.properties?.privatePayloadInline?.const === false &&
      requiredFields(artifactItem).includes("privatePayloadInline"),
    actual: artifactItem.properties?.privatePayloadInline?.const,
    expected: false,
    remediation: "Worker results must return artifact references, not inline private payloads.",
  });

  addFinding(findings, {
    id: "examples.worker_isolation",
    passed: jobs.length > 0 && jobs.every(isIsolatedWorkerJob),
    actual: summarizeJobIsolation(jobs),
    expected: "all examples PYTHON_WORKER baseline=false directDb=false",
    remediation: "Every example job must stay behind the isolated worker boundary.",
  });

  addFinding(findings, {
    id: "examples.required_capabilities",
    passed: hasAll(jobs.map((job) => job.capabilityKind), REQUIRED_CAPABILITIES),
    actual: [...new Set(jobs.map((job) => job.capabilityKind))].join(","),
    expected: REQUIRED_CAPABILITIES.join(","),
    remediation: "Examples must cover RAG retrieval, OCR recognition, and fine-tuning.",
  });

  addFinding(findings, {
    id: "examples.cloud_public_only",
    passed: jobs.every((job) => job.nodeType !== "CLOUD" || cloudJobIsPublicOnly(job)),
    actual: summarizeUnsafeJobs(jobs.filter((job) => job.nodeType === "CLOUD" && !cloudJobIsPublicOnly(job))),
    expected: "cloud jobs only use PUBLIC_KNOWLEDGE and no student data",
    remediation: "Cloud workers must not receive private knowledge or student archive data.",
  });

  addFinding(findings, {
    id: "examples.cloud_public_rag_present",
    passed: jobs.some((job) => job.nodeType === "CLOUD" &&
      job.capabilityKind === "RAG_RETRIEVAL" &&
      cloudJobIsPublicOnly(job)),
    actual: summarizeCloudExamples(jobs),
    expected: "at least one cloud RAG job over PUBLIC_KNOWLEDGE",
    remediation: "Examples must prove that cloud RAG remains limited to public knowledge.",
  });

  addFinding(findings, {
    id: "examples.remote_no_local_private",
    passed: jobs.every((job) => job.nodeType !== "REMOTE_DEVICE" || remoteJobAvoidsLocalPrivate(job)),
    actual: summarizeUnsafeJobs(jobs.filter((job) => job.nodeType === "REMOTE_DEVICE" && !remoteJobAvoidsLocalPrivate(job))),
    expected: "remote-device jobs do not use local private knowledge or local student archives",
    remediation: "Remote-device workers may use their own knowledge, not this machine's private knowledge base or student archive.",
  });

  addFinding(findings, {
    id: "examples.local_private_paths",
    passed: jobs.some((job) => job.nodeType === "LOCAL" && job.dataAccess?.knowledgeScope === "PRIVATE") &&
      jobs.some((job) => job.nodeType === "LOCAL" && job.capabilityKind === "OCR_RECOGNITION") &&
      jobs.some((job) => job.nodeType === "LOCAL" && job.capabilityKind === "FINE_TUNING"),
    actual: summarizeLocalExamples(jobs),
    expected: "local private RAG, local OCR, and local fine-tuning examples",
    remediation: "Local worker examples must prove the private-data paths stay local.",
  });

  addFinding(findings, {
    id: "result.example_artifact_boundary",
    passed: resultExample.directMainDatabaseWriteAttempted === false &&
      Array.isArray(resultExample.artifactRefs) &&
      resultExample.artifactRefs.every((artifact) => artifact.privatePayloadInline === false),
    actual: summarizeResultExample(resultExample),
    expected: "directDb=false and all privatePayloadInline=false",
    remediation: "Result example must demonstrate artifact references only.",
  });

  return {
    generatedAt: new Date().toISOString(),
    readiness: findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION",
    findings,
  };
}

export function formatAiWorkerJobAudit(report) {
  const lines = [
    `AI Worker job: ${report.readiness}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) {
    lines.push(
      `- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`,
    );
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  return lines.join("\n");
}

function loadCurrentInputs(root) {
  return Object.fromEntries(
    Object.entries(AI_WORKER_FILES).map(([key, relativePath]) => [
      key,
      JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8")),
    ]),
  );
}

function addFinding(findings, finding) {
  findings.push({
    id: finding.id,
    passed: Boolean(finding.passed),
    severity: finding.passed ? "info" : "error",
    actual: finding.actual ?? null,
    expected: finding.expected,
    remediation: finding.remediation,
  });
}

function requiredFields(schema) {
  return Array.isArray(schema.required) ? schema.required : [];
}

function enumValues(schema, propertyName) {
  const values = schema.properties?.[propertyName]?.enum;
  return Array.isArray(values) ? values : [];
}

function hasAll(values, required) {
  return required.every((value) => values.includes(value));
}

function isIsolatedWorkerJob(job) {
  return job.executionOwner === "PYTHON_WORKER" &&
    job.baselineRuntimeDependencyAllowed === false &&
    job.directMainDatabaseWriteAllowed === false;
}

function cloudJobIsPublicOnly(job) {
  return job.dataAccess?.knowledgeScope !== "PRIVATE" &&
    job.dataAccess?.studentDataScope === "NONE" &&
    job.dataAccess?.sourceLocation === "PUBLIC_KNOWLEDGE";
}

function remoteJobAvoidsLocalPrivate(job) {
  return !LOCAL_PRIVATE_LOCATIONS.includes(job.dataAccess?.sourceLocation);
}

function summarizeJobIsolation(jobs) {
  if (jobs.length === 0) return "no jobs";
  return jobs
    .map((job) => `${job.jobId}:${job.executionOwner}:baseline=${job.baselineRuntimeDependencyAllowed}:directDb=${job.directMainDatabaseWriteAllowed}`)
    .join(";");
}

function summarizeUnsafeJobs(jobs) {
  if (jobs.length === 0) return "none";
  return jobs
    .map((job) => `${job.jobId}:${job.nodeType}:${job.dataAccess?.knowledgeScope}:${job.dataAccess?.studentDataScope}:${job.dataAccess?.sourceLocation}`)
    .join(";");
}

function summarizeCloudExamples(jobs) {
  const cloudJobs = jobs.filter((job) => job.nodeType === "CLOUD");
  if (cloudJobs.length === 0) return "none";
  return cloudJobs
    .map((job) => `${job.jobId}:${job.capabilityKind}:${job.dataAccess?.knowledgeScope}:${job.dataAccess?.sourceLocation}`)
    .join(";");
}

function summarizeLocalExamples(jobs) {
  return jobs
    .filter((job) => job.nodeType === "LOCAL")
    .map((job) => `${job.jobId}:${job.capabilityKind}:${job.dataAccess?.knowledgeScope}:${job.dataAccess?.sourceLocation}`)
    .join(";");
}

function summarizeResultExample(resultExample) {
  const inlineCount = Array.isArray(resultExample.artifactRefs)
    ? resultExample.artifactRefs.filter((artifact) => artifact.privatePayloadInline !== false).length
    : "missing";
  return `directDb=${stringifyScalar(resultExample.directMainDatabaseWriteAttempted)} inlinePrivateArtifacts=${inlineCount}`;
}

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  return {
    outPath: outIndex === -1 ? undefined : argv[outIndex + 1],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = auditAiWorkerJobContracts(loadCurrentInputs(process.cwd()));
    if (args.outPath) {
      fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
      fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(formatAiWorkerJobAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

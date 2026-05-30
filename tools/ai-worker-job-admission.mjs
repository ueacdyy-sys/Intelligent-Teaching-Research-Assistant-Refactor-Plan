import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ADMISSION_SCHEMA_VERSION = "2026-05-30.ai-worker.admission.v1";
const AI_WORKER_ADMISSION_FILES = {
  examples: "contracts/ai-worker/ai-worker-job.examples.json",
  knowledgePolicy: "contracts/knowledge/knowledge-access-policy.current.json",
};

const SOURCE_LOCATION_CLASSIFICATION = {
  PUBLIC_KNOWLEDGE: {
    classification: "PUBLIC",
    ownership: "LOCAL_MACHINE",
  },
  LOCAL_PRIVATE_KNOWLEDGE: {
    classification: "PRIVATE",
    ownership: "LOCAL_MACHINE",
  },
  LOCAL_STUDENT_ARCHIVE: {
    classification: "STUDENT_ARCHIVE",
    ownership: "LOCAL_MACHINE",
  },
  REMOTE_DEVICE_OWNED_KNOWLEDGE: {
    classification: "REMOTE_DEVICE_OWNED",
    ownership: "REMOTE_DEVICE_OWNED",
  },
};

export function admitAiWorkerJobs(input) {
  const examples = input.examples ?? {};
  const knowledgePolicy = input.knowledgePolicy ?? {};
  const jobs = Array.isArray(examples.jobs) ? examples.jobs : [];
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const sourcePolicyVersion = knowledgePolicy.schemaVersion ?? "unknown";
  const admissions = jobs.map((job) => admitAiWorkerJob(job, knowledgePolicy, sourcePolicyVersion));

  return {
    schemaVersion: ADMISSION_SCHEMA_VERSION,
    generatedAt,
    sourcePolicyVersion,
    decision: admissions.every((admission) => admission.decision === "ALLOW_DISPATCH")
      ? "ALLOW_DISPATCH"
      : "BLOCK_DISPATCH",
    admissions,
  };
}

export function auditAiWorkerJobAdmission(inputs) {
  const findings = [];
  const examples = inputs.examples ?? {};
  const knowledgePolicy = inputs.knowledgePolicy ?? {};
  const jobs = Array.isArray(examples.jobs) ? examples.jobs : [];
  const admission = admitAiWorkerJobs(inputs);

  addFinding(findings, {
    id: "admission.current_jobs_allowed",
    passed: jobs.length > 0 && admission.decision === "ALLOW_DISPATCH",
    actual: summarizeAdmissions(admission.admissions),
    expected: "all current AI worker job examples ALLOW_DISPATCH",
    remediation: "Current worker examples must be admissible before later queue dispatch work can rely on them.",
  });

  addFinding(findings, {
    id: "admission.identity_preserved",
    passed: admission.admissions.every(hasDecisionIdentity),
    actual: summarizeDecisionIdentity(admission.admissions),
    expected: "jobId,nodeType,capabilityKind preserved in every admission",
    remediation: "Admission decisions must retain enough identity for audit and queue dispatch logs.",
  });

  addFinding(findings, {
    id: "admission.policy_version_preserved",
    passed: admission.admissions.length > 0 &&
      admission.admissions.every((item) => item.sourcePolicyVersion === knowledgePolicy.schemaVersion),
    actual: unique(admission.admissions.map((item) => item.sourcePolicyVersion)).join(","),
    expected: knowledgePolicy.schemaVersion,
    remediation: "Admission decisions must record the source knowledge policy version.",
  });

  addFinding(findings, {
    id: "admission.no_baseline_runtime_dependency",
    passed: jobs.every((job) => job.baselineRuntimeDependencyAllowed === false),
    actual: summarizeDependencyFlags(jobs),
    expected: "baselineRuntimeDependencyAllowed=false for every job",
    remediation: "OCR, RAG, model, and training packages must stay outside the baseline runtime.",
  });

  addFinding(findings, {
    id: "admission.no_direct_db_write",
    passed: jobs.every((job) => job.directMainDatabaseWriteAllowed === false),
    actual: summarizeDirectWriteFlags(jobs),
    expected: "directMainDatabaseWriteAllowed=false for every job",
    remediation: "Workers must return artifacts through the boundary instead of writing directly to the main database.",
  });

  addFinding(findings, {
    id: "admission.cloud_public_only",
    passed: jobs
      .filter((job) => job.nodeType === "CLOUD")
      .every((job) => job.dataAccess?.sourceLocation === "PUBLIC_KNOWLEDGE" &&
        job.dataAccess?.studentDataScope === "NONE"),
    actual: summarizeNodeSources(jobs, "CLOUD"),
    expected: "CLOUD jobs use PUBLIC_KNOWLEDGE with studentDataScope=NONE",
    remediation: "Cloud jobs must not receive private knowledge or student archive data.",
  });

  addFinding(findings, {
    id: "admission.remote_device_owned_only",
    passed: jobs
      .filter((job) => job.nodeType === "REMOTE_DEVICE")
      .every((job) => job.dataAccess?.sourceLocation === "REMOTE_DEVICE_OWNED_KNOWLEDGE"),
    actual: summarizeNodeSources(jobs, "REMOTE_DEVICE"),
    expected: "REMOTE_DEVICE jobs use REMOTE_DEVICE_OWNED_KNOWLEDGE only",
    remediation: "Remote-device jobs may use their own knowledge, not this machine's local knowledge stores.",
  });

  return {
    generatedAt: new Date().toISOString(),
    readiness: findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION",
    admission,
    findings,
  };
}

export function formatAiWorkerJobAdmissionAudit(report) {
  const lines = [
    `AI Worker job admission: ${report.readiness}`,
    "",
    `Dispatch decision: ${report.admission.decision}`,
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

function admitAiWorkerJob(job, knowledgePolicy, sourcePolicyVersion) {
  const source = classifySourceLocation(job.dataAccess?.sourceLocation);
  const nodePolicy = policyFor(knowledgePolicy.nodePolicies ?? [], job.nodeType);
  const reasons = [
    ...workerBoundaryReasons(job),
    ...policyReasons(job, source, nodePolicy),
    ...dataAccessConsistencyReasons(job, source),
  ];

  return {
    jobId: job.jobId ?? "",
    nodeType: job.nodeType ?? "",
    capabilityKind: job.capabilityKind ?? "",
    decision: reasons.length === 0 ? "ALLOW_DISPATCH" : "BLOCK_DISPATCH",
    reasons: reasons.length === 0 ? ["allowed by knowledge access policy"] : unique(reasons),
    sourcePolicyVersion,
    dataAccess: {
      sourceLocation: job.dataAccess?.sourceLocation ?? "",
      classification: source?.classification ?? "UNKNOWN",
      ownership: source?.ownership ?? "UNKNOWN",
    },
  };
}

function workerBoundaryReasons(job) {
  const reasons = [];
  if (job.executionOwner !== "PYTHON_WORKER") {
    reasons.push("execution owner must be PYTHON_WORKER");
  }
  if (job.baselineRuntimeDependencyAllowed !== false) {
    reasons.push("baseline runtime dependencies are not allowed");
  }
  if (job.directMainDatabaseWriteAllowed !== false) {
    reasons.push("direct main database writes are not allowed");
  }
  return reasons;
}

function policyReasons(job, source, nodePolicy) {
  if (!nodePolicy) return [`missing node policy for ${stringifyScalar(job.nodeType)}`];
  if (!source) return [`unknown source location ${stringifyScalar(job.dataAccess?.sourceLocation)}`];

  if (source.ownership === "LOCAL_MACHINE") {
    return localKnowledgeReasons(job.nodeType, source.classification, nodePolicy);
  }
  if (!(nodePolicy.allowedRemoteClassifications ?? []).includes(source.classification)) {
    return [`node ${job.nodeType} cannot access remote classification ${source.classification}`];
  }
  return [];
}

function localKnowledgeReasons(nodeType, classification, nodePolicy) {
  const reasons = [];
  if (nodePolicy.localMachineKnowledgeAccessAllowed === false) {
    reasons.push(`node ${nodeType} cannot access this machine's local knowledge`);
  }
  if (!(nodePolicy.allowedLocalClassifications ?? []).includes(classification)) {
    reasons.push(`node ${nodeType} cannot access local classification ${classification}`);
  }
  return reasons;
}

function dataAccessConsistencyReasons(job, source) {
  if (!source) return [];
  const dataAccess = job.dataAccess ?? {};
  if (source.classification === "PUBLIC" && dataAccess.knowledgeScope !== "PUBLIC") {
    return ["PUBLIC_KNOWLEDGE requires knowledgeScope=PUBLIC"];
  }
  if (source.classification === "PRIVATE" && dataAccess.knowledgeScope !== "PRIVATE") {
    return ["LOCAL_PRIVATE_KNOWLEDGE requires knowledgeScope=PRIVATE"];
  }
  if (source.classification === "STUDENT_ARCHIVE" && dataAccess.studentDataScope === "NONE") {
    return ["LOCAL_STUDENT_ARCHIVE requires studentDataScope beyond NONE"];
  }
  if (source.classification !== "STUDENT_ARCHIVE" && dataAccess.studentDataScope !== "NONE") {
    return [`${dataAccess.sourceLocation} requires studentDataScope=NONE`];
  }
  return [];
}

function classifySourceLocation(sourceLocation) {
  return SOURCE_LOCATION_CLASSIFICATION[sourceLocation];
}

function policyFor(nodePolicies, nodeType) {
  return nodePolicies.find((nodePolicy) => nodePolicy.nodeType === nodeType);
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

function hasDecisionIdentity(admission) {
  return Boolean(admission.jobId && admission.nodeType && admission.capabilityKind);
}

function summarizeAdmissions(admissions) {
  if (admissions.length === 0) return "no admissions";
  return admissions
    .map((item) => `${item.jobId}:${item.decision}`)
    .join(";");
}

function summarizeDecisionIdentity(admissions) {
  if (admissions.length === 0) return "no admissions";
  return admissions
    .map((item) => `${item.jobId}:${item.nodeType}:${item.capabilityKind}`)
    .join(";");
}

function summarizeDependencyFlags(jobs) {
  if (jobs.length === 0) return "no jobs";
  return jobs
    .map((job) => `${job.jobId}:baseline=${job.baselineRuntimeDependencyAllowed}`)
    .join(";");
}

function summarizeDirectWriteFlags(jobs) {
  if (jobs.length === 0) return "no jobs";
  return jobs
    .map((job) => `${job.jobId}:directDb=${job.directMainDatabaseWriteAllowed}`)
    .join(";");
}

function summarizeNodeSources(jobs, nodeType) {
  const scopedJobs = jobs.filter((job) => job.nodeType === nodeType);
  if (scopedJobs.length === 0) return "none";
  return scopedJobs
    .map((job) => `${job.jobId}:${job.dataAccess?.sourceLocation}:student=${job.dataAccess?.studentDataScope}`)
    .join(";");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
}

function loadCurrentInputs(root) {
  return Object.fromEntries(
    Object.entries(AI_WORKER_ADMISSION_FILES).map(([key, relativePath]) => [
      key,
      JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8")),
    ]),
  );
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
    const report = auditAiWorkerJobAdmission(loadCurrentInputs(process.cwd()));
    if (args.outPath) {
      fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
      fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(formatAiWorkerJobAdmissionAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

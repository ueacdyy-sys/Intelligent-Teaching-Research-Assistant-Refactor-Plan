import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const KNOWLEDGE_FILES = {
  schema: "contracts/knowledge/knowledge-access-policy.schema.json",
  policy: "contracts/knowledge/knowledge-access-policy.current.json",
};

const LOCAL_CLASSIFICATIONS = ["PUBLIC", "PRIVATE", "STUDENT_ARCHIVE"];
const REQUIRED_RETRIEVAL_STRATEGIES = ["CHUNK_VECTOR", "INTENT_DIRECTORY_INDEX", "HYBRID"];

export function auditKnowledgeAccessPolicy(inputs) {
  const findings = [];
  const schema = inputs.schema ?? {};
  const policy = inputs.policy ?? {};
  const partitions = Array.isArray(policy.partitions) ? policy.partitions : [];
  const nodePolicies = Array.isArray(policy.nodePolicies) ? policy.nodePolicies : [];
  const retrievalPolicy = policy.retrievalPolicy ?? {};

  addFinding(findings, {
    id: "partitions.required_classifications",
    passed: hasAll(partitions.map((partition) => partition.classification), [
      ...LOCAL_CLASSIFICATIONS,
      "REMOTE_DEVICE_OWNED",
    ]),
    actual: unique(partitions.map((partition) => partition.classification)).join(","),
    expected: "PUBLIC,PRIVATE,STUDENT_ARCHIVE,REMOTE_DEVICE_OWNED",
    remediation: "Knowledge policy must model local public/private/student stores and remote-owned knowledge.",
  });

  addFinding(findings, {
    id: "partitions.local_physical_isolation",
    passed: localPartitions(partitions).every((partition) => partition.physicalIsolation === "DEDICATED") &&
      hasDistinctStorageBoundaries(localPartitions(partitions)),
    actual: summarizePartitions(localPartitions(partitions)),
    expected: "local PUBLIC/PRIVATE/STUDENT_ARCHIVE each DEDICATED with distinct stores",
    remediation: "Local public, private, and student archive knowledge must stay physically isolated.",
  });

  addFinding(findings, {
    id: "nodes.cloud_public_only",
    passed: arrayEqual(policyFor(nodePolicies, "CLOUD")?.allowedLocalClassifications ?? [], ["PUBLIC"]) &&
      (policyFor(nodePolicies, "CLOUD")?.maxLocalKnowledgeScope === "PUBLIC"),
    actual: summarizeNodePolicy(policyFor(nodePolicies, "CLOUD")),
    expected: "allowedLocalClassifications=PUBLIC maxLocalKnowledgeScope=PUBLIC",
    remediation: "Cloud nodes may only access public local knowledge.",
  });

  addFinding(findings, {
    id: "nodes.local_public_private_student",
    passed: hasAll(policyFor(nodePolicies, "LOCAL")?.allowedLocalClassifications ?? [], LOCAL_CLASSIFICATIONS) &&
      policyFor(nodePolicies, "LOCAL")?.maxLocalKnowledgeScope === "PRIVATE",
    actual: summarizeNodePolicy(policyFor(nodePolicies, "LOCAL")),
    expected: "LOCAL can access PUBLIC,PRIVATE,STUDENT_ARCHIVE",
    remediation: "Local nodes must retain access to local public, private, and student archive knowledge.",
  });

  addFinding(findings, {
    id: "nodes.remote_no_local_knowledge",
    passed: (policyFor(nodePolicies, "REMOTE_DEVICE")?.allowedLocalClassifications ?? []).length === 0 &&
      policyFor(nodePolicies, "REMOTE_DEVICE")?.localMachineKnowledgeAccessAllowed === false &&
      policyFor(nodePolicies, "REMOTE_DEVICE")?.maxLocalKnowledgeScope === "NONE",
    actual: summarizeNodePolicy(policyFor(nodePolicies, "REMOTE_DEVICE")),
    expected: "REMOTE_DEVICE has no local classifications and local access=false",
    remediation: "Remote-device nodes must not access this machine's knowledge base.",
  });

  addFinding(findings, {
    id: "nodes.remote_owned_only",
    passed: arrayEqual(policyFor(nodePolicies, "REMOTE_DEVICE")?.allowedRemoteClassifications ?? [], ["REMOTE_DEVICE_OWNED"]),
    actual: (policyFor(nodePolicies, "REMOTE_DEVICE")?.allowedRemoteClassifications ?? []).join(","),
    expected: "REMOTE_DEVICE_OWNED",
    remediation: "Remote-device nodes may only use knowledge owned by that remote device.",
  });

  const supportedStrategyEnum = schema.properties?.retrievalPolicy?.properties?.supportedStrategies?.items?.enum ?? [];
  addFinding(findings, {
    id: "retrieval.strategy_vocab",
    passed: hasAll(supportedStrategyEnum, REQUIRED_RETRIEVAL_STRATEGIES),
    actual: supportedStrategyEnum.join(","),
    expected: REQUIRED_RETRIEVAL_STRATEGIES.join(","),
    remediation: "Retrieval policy must support chunk vector, directory intent, and hybrid strategies.",
  });

  addFinding(findings, {
    id: "retrieval.current_hybrid",
    passed: retrievalPolicy.defaultStrategy === "HYBRID" &&
      retrievalPolicy.chunkingRetained === true &&
      retrievalPolicy.directoryIntentIndexEnabled === true,
    actual: summarizeRetrievalPolicy(retrievalPolicy),
    expected: "default=HYBRID chunkingRetained=true directoryIntentIndexEnabled=true",
    remediation: "Current retrieval must keep chunking while enabling directory-intent indexing.",
  });

  addFinding(findings, {
    id: "retrieval.performance_budget_present",
    passed: Number.isInteger(retrievalPolicy.queryPlanBudget?.targetP95Ms) &&
      retrievalPolicy.queryPlanBudget.targetP95Ms > 0 &&
      Number.isInteger(retrievalPolicy.queryPlanBudget?.maxDirectoryCandidates) &&
      Number.isInteger(retrievalPolicy.queryPlanBudget?.maxChunkCandidates),
    actual: summarizeBudget(retrievalPolicy.queryPlanBudget),
    expected: "targetP95Ms, maxDirectoryCandidates, maxChunkCandidates",
    remediation: "Retrieval policy needs an explicit budget before later benchmarks can prove performance.",
  });

  return {
    generatedAt: new Date().toISOString(),
    readiness: findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION",
    findings,
  };
}

export function formatKnowledgeAccessPolicyAudit(report) {
  const lines = [
    `Knowledge access policy: ${report.readiness}`,
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
    Object.entries(KNOWLEDGE_FILES).map(([key, relativePath]) => [
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

function localPartitions(partitions) {
  return partitions.filter((partition) => LOCAL_CLASSIFICATIONS.includes(partition.classification));
}

function hasDistinctStorageBoundaries(partitions) {
  return new Set(partitions.map((partition) => partition.storageBoundary)).size === LOCAL_CLASSIFICATIONS.length;
}

function policyFor(nodePolicies, nodeType) {
  return nodePolicies.find((nodePolicy) => nodePolicy.nodeType === nodeType);
}

function hasAll(values, required) {
  return required.every((value) => values.includes(value));
}

function arrayEqual(left, right) {
  return left.length === right.length && right.every((value) => left.includes(value));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function summarizePartitions(partitions) {
  if (partitions.length === 0) return "none";
  return partitions
    .map((partition) => `${partition.classification}:${partition.storageBoundary}:${partition.physicalIsolation}`)
    .join(";");
}

function summarizeNodePolicy(nodePolicy) {
  if (!nodePolicy) return "missing";
  return [
    `local=${(nodePolicy.allowedLocalClassifications ?? []).join(",")}`,
    `remote=${(nodePolicy.allowedRemoteClassifications ?? []).join(",")}`,
    `max=${nodePolicy.maxLocalKnowledgeScope}`,
    `localAccess=${nodePolicy.localMachineKnowledgeAccessAllowed}`,
  ].join(" ");
}

function summarizeRetrievalPolicy(retrievalPolicy) {
  return [
    `default=${stringifyScalar(retrievalPolicy.defaultStrategy)}`,
    `chunkingRetained=${stringifyScalar(retrievalPolicy.chunkingRetained)}`,
    `directoryIntentIndexEnabled=${stringifyScalar(retrievalPolicy.directoryIntentIndexEnabled)}`,
  ].join(" ");
}

function summarizeBudget(budget) {
  if (!budget) return "missing";
  return `targetP95Ms=${stringifyScalar(budget.targetP95Ms)} maxDirectoryCandidates=${stringifyScalar(budget.maxDirectoryCandidates)} maxChunkCandidates=${stringifyScalar(budget.maxChunkCandidates)}`;
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
    const report = auditKnowledgeAccessPolicy(loadCurrentInputs(process.cwd()));
    if (args.outPath) {
      fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
      fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(formatKnowledgeAccessPolicyAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

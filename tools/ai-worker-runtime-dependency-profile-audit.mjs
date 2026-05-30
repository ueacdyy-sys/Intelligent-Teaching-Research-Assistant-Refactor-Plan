import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PROFILE_PATH = "contracts/ai-worker/ai-worker-runtime-dependency-profile.current.json";
const REQUIRED_CAPABILITIES = ["RAG_RETRIEVAL", "OCR_RECOGNITION", "FINE_TUNING"];

export function auditAiWorkerRuntimeDependencyProfile(inputs) {
  const profile = inputs.profile ?? {};
  const sourceManifests = inputs.sourceManifests ?? {};
  const baselineManifests = Array.isArray(profile.baselineManifests) ? profile.baselineManifests : [];
  const optionalWorkerBundles = Array.isArray(profile.optionalWorkerBundles) ? profile.optionalWorkerBundles : [];
  const dependencies = collectBaselineDependencies(baselineManifests, sourceManifests);
  const forbiddenPackages = normalizedSet([
    ...(profile.forbiddenBaselinePackages ?? []),
    ...optionalWorkerPackages(optionalWorkerBundles),
  ]);
  const findings = [];

  addFinding(findings, {
    id: "baseline.manifests_present",
    passed: baselineManifests.length > 0 &&
      baselineManifests.every((manifest) => hasReadableManifest(sourceManifests, manifest.path)),
    actual: summarizeManifestPresence(baselineManifests, sourceManifests),
    expected: "all baseline manifests present and readable",
    remediation: "Runtime dependency audit must read every baseline manifest before claiming worker isolation.",
  });

  const forbiddenHits = dependencies.filter((dependency) => forbiddenPackages.has(normalizeName(dependency.name)));
  addFinding(findings, {
    id: "baseline.no_forbidden_ai_packages",
    passed: forbiddenHits.length === 0,
    actual: summarizeDependencies(forbiddenHits),
    expected: "no model/OCR/RAG/vector/training package in baseline manifests",
    remediation: "Move AI packages into optional Python worker environments instead of baseline runtime manifests.",
  });

  addFinding(findings, {
    id: "profile.required_capability_bundles",
    passed: hasAll(optionalWorkerBundles.map((bundle) => bundle.capabilityKind), REQUIRED_CAPABILITIES),
    actual: unique(optionalWorkerBundles.map((bundle) => bundle.capabilityKind)).join(","),
    expected: REQUIRED_CAPABILITIES.join(","),
    remediation: "Optional worker dependency bundles must cover RAG retrieval, OCR recognition, and fine-tuning.",
  });

  addFinding(findings, {
    id: "profile.worker_boundary",
    passed: optionalWorkerBundles.length > 0 && optionalWorkerBundles.every(isOptionalPythonWorkerBundle),
    actual: summarizeBundles(optionalWorkerBundles),
    expected: "all bundles PYTHON_WORKER OPTIONAL_WORKER_ENV baseline=false",
    remediation: "AI worker dependencies must remain optional Python-worker dependencies, never baseline runtime dependencies.",
  });

  const optionalHits = dependencies.filter((dependency) =>
    normalizedSet(optionalWorkerPackages(optionalWorkerBundles)).has(normalizeName(dependency.name)));
  addFinding(findings, {
    id: "baseline.optional_packages_absent",
    passed: optionalHits.length === 0,
    actual: summarizeDependencies(optionalHits),
    expected: "optional worker package names absent from baseline manifests",
    remediation: "Optional worker packages must be declared only as profile metadata until an isolated worker environment exists.",
  });

  return {
    generatedAt: new Date().toISOString(),
    readiness: findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION",
    baselineDependencies: dependencies,
    findings,
  };
}

export function formatAiWorkerRuntimeDependencyProfileAudit(report) {
  const lines = [
    `AI Worker runtime dependencies: ${report.readiness}`,
    "",
    `Baseline dependencies scanned: ${report.baselineDependencies.length}`,
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

function collectBaselineDependencies(baselineManifests, sourceManifests) {
  return baselineManifests.flatMap((manifest) => {
    const text = sourceManifests[manifest.path];
    if (typeof text !== "string") return [];
    if (manifest.runtime === "NODE_BASELINE") return parseNodeDependencies(manifest.path, text);
    if (manifest.runtime === "GO_BASELINE") return parseGoDependencies(manifest.path, text);
    if (manifest.runtime === "RUST_BASELINE") return parseCargoDependencies(manifest.path, text);
    return [];
  });
}

function parseNodeDependencies(manifestPath, text) {
  const manifest = JSON.parse(text);
  const dependencySections = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
  return dependencySections.flatMap((section) =>
    Object.keys(manifest[section] ?? {}).map((name) => ({
      name,
      manifestPath,
      runtime: "NODE_BASELINE",
      section,
    })),
  );
}

function parseGoDependencies(manifestPath, text) {
  const dependencies = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line === "require (" || line === ")" || line.startsWith("//")) continue;
    const singleRequire = line.match(/^require\s+([^\s]+)\s+v[^\s]+/);
    const blockRequire = line.match(/^([^\s]+)\s+v[^\s]+/);
    const name = singleRequire?.[1] ?? blockRequire?.[1];
    if (!name) continue;
    dependencies.push({
      name,
      manifestPath,
      runtime: "GO_BASELINE",
      section: "require",
    });
  }
  return dependencies;
}

function parseCargoDependencies(manifestPath, text) {
  const dependencies = [];
  let inDependencies = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (/^\[dependencies\]$/.test(line)) {
      inDependencies = true;
      continue;
    }
    if (/^\[/.test(line)) {
      inDependencies = false;
      continue;
    }
    if (!inDependencies) continue;
    const match = line.match(/^([A-Za-z0-9_-]+)\s*=/);
    if (!match) continue;
    dependencies.push({
      name: match[1],
      manifestPath,
      runtime: "RUST_BASELINE",
      section: "dependencies",
    });
  }
  return dependencies;
}

function isOptionalPythonWorkerBundle(bundle) {
  return bundle.executionOwner === "PYTHON_WORKER" &&
    bundle.installMode === "OPTIONAL_WORKER_ENV" &&
    bundle.baselineRuntimeDependencyAllowed === false;
}

function optionalWorkerPackages(optionalWorkerBundles) {
  return optionalWorkerBundles.flatMap((bundle) =>
    (bundle.packages ?? []).map((pkg) => pkg.packageName),
  );
}

function hasReadableManifest(sourceManifests, manifestPath) {
  return typeof sourceManifests[manifestPath] === "string" && sourceManifests[manifestPath].trim().length > 0;
}

function summarizeManifestPresence(baselineManifests, sourceManifests) {
  if (baselineManifests.length === 0) return "none";
  return baselineManifests
    .map((manifest) => `${manifest.path}:${hasReadableManifest(sourceManifests, manifest.path) ? "present" : "missing"}`)
    .join(";");
}

function summarizeDependencies(dependencies) {
  if (dependencies.length === 0) return "none";
  return dependencies
    .map((dependency) => `${dependency.manifestPath}:${dependency.name}`)
    .join(";");
}

function summarizeBundles(optionalWorkerBundles) {
  if (optionalWorkerBundles.length === 0) return "none";
  return optionalWorkerBundles
    .map((bundle) => `${bundle.bundleId}:${bundle.capabilityKind}:${bundle.executionOwner}:${bundle.installMode}:baseline=${bundle.baselineRuntimeDependencyAllowed}`)
    .join(";");
}

function normalizedSet(values) {
  return new Set(values.map(normalizeName));
}

function normalizeName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function hasAll(values, required) {
  return required.every((value) => values.includes(value));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
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

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
}

function loadCurrentInputs(root) {
  const profile = JSON.parse(fs.readFileSync(path.join(root, PROFILE_PATH), "utf8"));
  return {
    profile,
    sourceManifests: Object.fromEntries(
      profile.baselineManifests.map((manifest) => [
        manifest.path,
        fs.readFileSync(path.join(root, manifest.path), "utf8"),
      ]),
    ),
  };
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
    const report = auditAiWorkerRuntimeDependencyProfile(loadCurrentInputs(process.cwd()));
    if (args.outPath) {
      fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
      fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(formatAiWorkerRuntimeDependencyProfileAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

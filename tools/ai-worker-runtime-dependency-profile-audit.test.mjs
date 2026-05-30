import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditAiWorkerRuntimeDependencyProfile,
  formatAiWorkerRuntimeDependencyProfileAudit,
} from "./ai-worker-runtime-dependency-profile-audit.mjs";

const root = process.cwd();

function loadCurrentInputs() {
  const profile = loadJson("contracts/ai-worker/ai-worker-runtime-dependency-profile.current.json");
  return {
    profile,
    sourceManifests: loadSourceManifests(profile),
  };
}

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function loadSourceManifests(profile) {
  return Object.fromEntries(
    profile.baselineManifests.map((manifest) => [
      manifest.path,
      fs.readFileSync(path.join(root, manifest.path), "utf8"),
    ]),
  );
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe("AI worker runtime dependency profile audit", () => {
  it("passes the current baseline dependency profile", () => {
    const report = auditAiWorkerRuntimeDependencyProfile(loadCurrentInputs());

    assert.equal(report.readiness, "READY");
    assert.match(formatAiWorkerRuntimeDependencyProfileAudit(report), /AI Worker runtime dependencies: READY/);
  });

  it("fails when a forbidden AI package appears in package.json", () => {
    const inputs = loadCurrentInputs();
    const packageJson = JSON.parse(inputs.sourceManifests["package.json"]);
    packageJson.dependencies = { ...(packageJson.dependencies ?? {}), "sentence-transformers": "^3.0.0" };

    const report = auditAiWorkerRuntimeDependencyProfile({
      ...inputs,
      sourceManifests: {
        ...inputs.sourceManifests,
        "package.json": `${JSON.stringify(packageJson, null, 2)}\n`,
      },
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "baseline.no_forbidden_ai_packages").passed, false);
  });

  it("fails when an optional worker capability bundle is missing", () => {
    const inputs = loadCurrentInputs();
    const profile = clone(inputs.profile);
    profile.optionalWorkerBundles = profile.optionalWorkerBundles.filter((bundle) => bundle.capabilityKind !== "FINE_TUNING");

    const report = auditAiWorkerRuntimeDependencyProfile({ ...inputs, profile });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "profile.required_capability_bundles").passed, false);
  });

  it("fails when a worker bundle is not owned by the Python worker", () => {
    const inputs = loadCurrentInputs();
    const profile = clone(inputs.profile);
    profile.optionalWorkerBundles[0].executionOwner = "BASELINE_RUNTIME";

    const report = auditAiWorkerRuntimeDependencyProfile({ ...inputs, profile });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "profile.worker_boundary").passed, false);
  });

  it("fails when a worker package is allowed into baseline", () => {
    const inputs = loadCurrentInputs();
    const profile = clone(inputs.profile);
    profile.optionalWorkerBundles[0].baselineRuntimeDependencyAllowed = true;

    const report = auditAiWorkerRuntimeDependencyProfile({ ...inputs, profile });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "profile.worker_boundary").passed, false);
  });
});

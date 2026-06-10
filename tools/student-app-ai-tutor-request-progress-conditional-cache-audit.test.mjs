import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorRequestProgressConditionalCache } from "./student-app-ai-tutor-request-progress-conditional-cache-audit.mjs";

describe("Student App AI Tutor request progress conditional cache audit", () => {
  it("passes when Student App progress reads support private conditional validators", () => {
    const report = auditStudentAppAITutorRequestProgressConditionalCache(validInputs(), {
      generatedAt: "2026-06-10T18:20:00.000Z",
      probeP99Ms: 4,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_request_progress_conditional_cache");
    assert.equal(report.runtimeProbes.studentAppAiTutorRequestProgressConditionalCache.conditionalStatus, 304);
    assert.equal(report.conditionalCachePolicy.cacheControl, "private, no-cache");
    assert.equal(report.safetyInvariants.responseBodyOn304Allowed, false);
    assert.equal(report.safetyInvariants.writePathChanged, false);
  });

  it("fails when the source 0358 evidence is not ready", () => {
    const inputs = validInputs();
    inputs.source0358Report = JSON.stringify({ readiness: "NEEDS_REMEDIATION" });

    const report = auditStudentAppAITutorRequestProgressConditionalCache(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0358_refresh_policy_ready").passed, false);
  });

  it("fails when HTTP handlers skip private conditional JSON", () => {
    const inputs = validInputs();
    inputs.progressHandler = inputs.progressHandler.replaceAll("writePrivateConditionalJSON", "writeJSON");

    const report = auditStudentAppAITutorRequestProgressConditionalCache(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "http_progress_uses_private_conditional_response").passed, false);
  });

  it("fails when OpenAPI omits 304 conditional responses", () => {
    const inputs = validInputs();
    inputs.listOpenapiPath = inputs.listOpenapiPath.replaceAll("'304':", "'204':");
    inputs.detailOpenapiPath = inputs.detailOpenapiPath.replaceAll("'304':", "'204':");

    const report = auditStudentAppAITutorRequestProgressConditionalCache(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "openapi_documents_private_conditional_cache").passed, false);
  });

  it("fails when the 0359 evidence hooks are missing", () => {
    const inputs = validInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll(
      "studentAppAiTutorRequestProgressConditionalCache",
      "studentAppAiTutorRequestProgressRefreshPolicy",
    );
    inputs.architectureBoard = "12.10/10";

    const report = auditStudentAppAITutorRequestProgressConditionalCache(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0359").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    source0358Report: "reports/student-app-ai-tutor-request-progress-refresh-policy.current.json",
    serverCodec: "services/teaching-archive-gateway/internal/adapter/httpapi/server_codec.go",
    progressHandler: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_requests.go",
    httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_progress_test.go",
    listOpenapiPath: "contracts/openapi/teaching-archive.student-app-ai-tutor-requests.path.yaml",
    detailOpenapiPath: "contracts/openapi/teaching-archive.student-app-ai-tutor-request.path.yaml",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0359-student-app-ai-tutor-request-progress-conditional-cache.md",
  }).map(([key, relativePath]) => [
    key,
    fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : "",
  ]));
}

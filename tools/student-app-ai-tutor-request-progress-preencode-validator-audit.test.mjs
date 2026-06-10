import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorRequestProgressPreencodeValidator } from "./student-app-ai-tutor-request-progress-preencode-validator-audit.mjs";

describe("Student App AI Tutor request progress pre-encode validator audit", () => {
  it("passes when progress reads skip payload construction on matching validators", () => {
    const report = auditStudentAppAITutorRequestProgressPreencodeValidator(validInputs(), {
      generatedAt: "2026-06-10T19:20:00.000Z",
      probeP99Ms: 3,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_request_progress_preencode_validator");
    assert.equal(report.runtimeProbes.studentAppAiTutorRequestProgressPreencodeValidator.payloadFactoryCallsOn304, 0);
    assert.equal(report.safetyInvariants.jsonEncodingOn304Allowed, false);
    assert.equal(report.safetyInvariants.databaseReadEliminationClaimAllowed, false);
  });

  it("fails when the source 0359 evidence is not ready", () => {
    const inputs = validInputs();
    inputs.source0359Report = JSON.stringify({ readiness: "NEEDS_REMEDIATION" });

    const report = auditStudentAppAITutorRequestProgressPreencodeValidator(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0359_conditional_cache_ready").passed, false);
  });

  it("fails when handlers do not use the precomputed validator helper", () => {
    const inputs = validInputs();
    inputs.progressHandler = inputs.progressHandler.replaceAll("writePrivateConditionalJSONWithETag", "writePrivateConditionalJSON");

    const report = auditStudentAppAITutorRequestProgressPreencodeValidator(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "http_304_checks_validator_before_payload_encoding").passed, false);
  });

  it("fails when visible fields are missing from the validator seed", () => {
    const inputs = validInputs();
    inputs.progressValidator = inputs.progressValidator.replaceAll("card.PrimaryAction.TargetURL", "card.PrimaryAction.TargetEndpoint");

    const report = auditStudentAppAITutorRequestProgressPreencodeValidator(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "validator_covers_visible_progress_representation").passed, false);
  });

  it("fails when 0360 evidence hooks are missing", () => {
    const inputs = validInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll(
      "studentAppAiTutorRequestProgressPreencodeValidator",
      "studentAppAiTutorRequestProgressConditionalCache",
    );
    inputs.architectureBoard = "12.13/10";

    const report = auditStudentAppAITutorRequestProgressPreencodeValidator(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0360").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    source0359Report: "reports/student-app-ai-tutor-request-progress-conditional-cache.current.json",
    serverCodec: "services/teaching-archive-gateway/internal/adapter/httpapi/server_codec.go",
    progressHandler: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_requests.go",
    progressPresenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
    progressValidator: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_progress_validator.go",
    progressValidatorTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_progress_validator_test.go",
    httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_progress_test.go",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0360-student-app-ai-tutor-request-progress-preencode-validator.md",
  }).map(([key, relativePath]) => [
    key,
    fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : "",
  ]));
}

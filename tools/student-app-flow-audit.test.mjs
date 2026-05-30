import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditStudentAppFlowContracts,
  formatStudentAppFlowAudit,
} from "./student-app-flow-audit.mjs";

const root = process.cwd();

function loadCurrentInputs() {
  return {
    identityOpenapiText: fs.readFileSync(path.join(root, "contracts/openapi/identity-access.yaml"), "utf8"),
    teachingOpenapiText: fs.readFileSync(path.join(root, "contracts/openapi/teaching-archive.yaml"), "utf8"),
    teachingPathFiles: Object.fromEntries([
      "teaching-archive.student-app-teaching-materials.path.yaml",
      "teaching-archive.student-app-archive-items.path.yaml",
      "teaching-archive.student-app-ai-tutor-requests.path.yaml",
      "teaching-archive.student-app-quiz-submissions.path.yaml",
      "teaching-archive.student-app-quiz-scan-submissions.path.yaml",
      "teaching-archive.student-app-question-bank-drafts.path.yaml",
    ].map((file) => [
      file,
      fs.readFileSync(path.join(root, "contracts/openapi", file), "utf8"),
    ])),
  };
}

describe("student app flow audit", () => {
  it("passes the current Student App contract flow", () => {
    const report = auditStudentAppFlowContracts(loadCurrentInputs());

    assert.equal(report.readiness, "READY");
    assert.match(formatStudentAppFlowAudit(report), /Student App flow: READY/);
  });

  it("fails when the Student App profile path is missing", () => {
    const inputs = loadCurrentInputs();
    const report = auditStudentAppFlowContracts({
      ...inputs,
      identityOpenapiText: inputs.identityOpenapiText.replace("/v1/student-app/profile:", "/v1/student-app/profile-missing:"),
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "identity.path.get./v1/student-app/profile").passed, false);
  });

  it("fails when the mobile profile leaks internal authorization fields", () => {
    const inputs = loadCurrentInputs();
    const report = auditStudentAppFlowContracts({
      ...inputs,
      identityOpenapiText: inputs.identityOpenapiText.replace("sessionId:", "scopes:\n          type: array\n        sessionId:"),
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "identity.profile.no_internal_fields").passed, false);
  });

  it("fails when the Student App scan-answer path is missing", () => {
    const inputs = loadCurrentInputs();
    const report = auditStudentAppFlowContracts({
      ...inputs,
      teachingOpenapiText: inputs.teachingOpenapiText.replace(
        "/v1/student-app/quiz-scan-submissions:",
        "/v1/student-app/quiz-scan-missing:",
      ),
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(
      report.findings.find((finding) => finding.id === "teaching.path./v1/student-app/quiz-scan-submissions").passed,
      false,
    );
  });
});

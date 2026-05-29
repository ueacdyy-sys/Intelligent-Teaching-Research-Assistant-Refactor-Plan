import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditIdentityAccessContract,
  formatIdentityAccessContractAudit,
} from "./identity-access-contract-audit.mjs";

const root = process.cwd();

function loadCurrentInputs() {
  return {
    openapiText: fs.readFileSync(path.join(root, "contracts/openapi/identity-access.yaml"), "utf8"),
    principalSchema: JSON.parse(
      fs.readFileSync(path.join(root, "contracts/auth/principal-context.schema.json"), "utf8"),
    ),
    accessMatrix: JSON.parse(
      fs.readFileSync(path.join(root, "contracts/auth/access-matrix.json"), "utf8"),
    ),
  };
}

describe("identity access contract audit", () => {
  it("passes the current identity access contracts", () => {
    const report = auditIdentityAccessContract(loadCurrentInputs());

    assert.equal(report.readiness, "READY");
    assert.match(formatIdentityAccessContractAudit(report), /Identity access contract: READY/);
  });

  it("fails when the remote command grant endpoint is missing", () => {
    const inputs = loadCurrentInputs();
    const report = auditIdentityAccessContract({
      ...inputs,
      openapiText: inputs.openapiText.replace("/v1/identity/remote-command-grants:", "/v1/identity/remote-command-missing:"),
    });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(
      report.findings.find((finding) => finding.id === "openapi.path.post./v1/identity/remote-command-grants").passed,
      false,
    );
  });

  it("fails when student access receives private knowledge scope", () => {
    const inputs = loadCurrentInputs();
    const accessMatrix = structuredClone(inputs.accessMatrix);
    const student = accessMatrix.profiles.find((profile) => profile.name === "student-app");
    student.scopes.push("KNOWLEDGE_PRIVATE_READ");

    const report = auditIdentityAccessContract({ ...inputs, accessMatrix });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(
      report.findings.find((finding) => finding.id === "matrix.student.no_private_knowledge_scope").passed,
      false,
    );
  });

  it("fails when remote social grants can directly control local devices", () => {
    const inputs = loadCurrentInputs();
    const accessMatrix = structuredClone(inputs.accessMatrix);
    const remote = accessMatrix.profiles.find((profile) => profile.name === "remote-social-command");
    remote.scopes.push("DEVICE_LOCAL_CONTROL");
    remote.requiresHarnessApproval = false;

    const report = auditIdentityAccessContract({ ...inputs, accessMatrix });

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(
      report.findings.find((finding) => finding.id === "matrix.remote.no_local_control_scope").passed,
      false,
    );
    assert.equal(
      report.findings.find((finding) => finding.id === "matrix.remote.requires_harness_approval").passed,
      false,
    );
  });
});

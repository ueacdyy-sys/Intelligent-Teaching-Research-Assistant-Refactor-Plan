import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorResultStudentArchivePersistenceCommand,
  formatStudentAppAITutorResultStudentArchivePersistenceCommandAudit,
} from "./student-app-ai-tutor-result-student-archive-persistence-command-audit.mjs";

describe("Student App AI Tutor result student archive persistence command audit", () => {
  it("passes when archive persistence command consumes the 0329 delivery envelope and safe guidance", () => {
    const report = auditStudentAppAITutorResultStudentArchivePersistenceCommand(validInputs(), {
      generatedAt: "2026-06-08T12:10:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_student_archive_persistence_command_runtime");
    assert.equal(report.safetyInvariants.studentArchivePersistenceCommandRecorded, true);
    assert.equal(report.safetyInvariants.durableStudentArchiveCommitStarted, false);
    assert.equal(report.runtimeProbes.studentAppAiTutorResultStudentArchivePersistenceCommand.result.studentArchivePersistenceCommand.commitState, "NOT_COMMITTED_TO_STUDENT_ARCHIVE");
    assert.match(formatStudentAppAITutorResultStudentArchivePersistenceCommandAudit(report), /archive persistence command runtime: READY/u);
  });

  it("fails when the 0329 delivery envelope is not ready", () => {
    const inputs = validInputs();
    const delivery = JSON.parse(inputs.deliveryEnvelopeReport);
    delivery.readiness = "NEEDS_REMEDIATION";
    inputs.deliveryEnvelopeReport = JSON.stringify(delivery);

    const report = auditStudentAppAITutorResultStudentArchivePersistenceCommand(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0329_student_delivery_envelope_ready").passed, false);
  });

  it("fails when controlled guidance no longer matches the delivery envelope hash", () => {
    const inputs = validInputs();
    const artifact = JSON.parse(inputs.controlledAnswerArtifactReport);
    artifact.runtimeProbes.studentAppAiTutorControlledAnswerArtifact.result.controlledAnswerArtifact.guidanceSections[0].text = "Changed safe guidance.";
    inputs.controlledAnswerArtifactReport = JSON.stringify(artifact);

    const report = auditStudentAppAITutorResultStudentArchivePersistenceCommand(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0325_safe_guidance_hash_matches_delivery_envelope").passed, false);
  });

  it("fails when runtime claims durable commit, unsafe execution, or leaked fields", () => {
    const inputs = validInputs();
    inputs.runtime += "\ndurableStudentArchiveCommitStarted: true\nstudentArchivePersisted: true\nmodelInferenceAllowed: true\ninnerHTML\n";

    const report = auditStudentAppAITutorResultStudentArchivePersistenceCommand(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.command_without_commit_or_unsafe_execution").passed, false);
  });

  it("fails when negative runtime tests or project hooks omit 0330", () => {
    const missingTests = validInputs();
    missingTests.runtimeTest = "records an append-only AI Tutor result archive persistence command without durable commit";
    let report = auditStudentAppAITutorResultStudentArchivePersistenceCommand(missingTests);
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_archive_persistence_negative_paths").passed, false);

    const missingHooks = validInputs();
    missingHooks.qualityGate = "";
    missingHooks.architectureBoard = "11.23/10";
    report = auditStudentAppAITutorResultStudentArchivePersistenceCommand(missingHooks);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_and_board_track_runtime").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    runtime: "tools/student-app-ai-tutor-result-student-archive-persistence-command-runtime.mjs",
    runtimeTest: "tools/student-app-ai-tutor-result-student-archive-persistence-command-runtime.test.mjs",
    deliveryEnvelopeReport: "reports/student-app-ai-tutor-result-student-delivery-envelope.current.json",
    controlledAnswerArtifactReport: "reports/student-app-ai-tutor-controlled-answer-artifact.current.json",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0330-student-app-ai-tutor-result-student-archive-persistence-command.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}

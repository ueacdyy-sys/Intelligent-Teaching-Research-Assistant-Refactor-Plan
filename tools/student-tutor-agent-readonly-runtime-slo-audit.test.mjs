import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentTutorAgentReadonlyRuntimeSlo,
  formatStudentTutorAgentReadonlyRuntimeSloAudit,
} from "./student-tutor-agent-readonly-runtime-slo-audit.mjs";

describe("StudentTutorAgent read-only runtime SLO audit", () => {
  it("passes when contracts, Student App, and scoped read evidence are under 50ms", () => {
    const report = auditStudentTutorAgentReadonlyRuntimeSlo(currentInputs(), {
      generatedAt: "2026-06-04T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_TUTOR_AGENT_READONLY_RUNTIME_SLO");
    assert.equal(report.runtimeSlo.sourcePhase, "studentAppScopedTeachingArchiveRead");
    assert.equal(report.runtimeSlo.p95Ms, 11);
    assert.equal(report.runtimeSlo.p99Ms, 11);
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.match(formatStudentTutorAgentReadonlyRuntimeSloAudit(report), /StudentTutorAgent read-only runtime SLO: READY/u);
  });

  it("fails when the contract report is not ready", () => {
    const inputs = currentInputs();
    inputs.contractReport.summary.studentTutorReadOnlyAdapter.readPortReady = false;

    const report = auditStudentTutorAgentReadonlyRuntimeSlo(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "contract.adapter_ready").passed, false);
  });

  it("fails when Student App flow is not ready", () => {
    const inputs = currentInputs();
    inputs.studentAppReport.readiness = "NEEDS_REMEDIATION";

    const report = auditStudentTutorAgentReadonlyRuntimeSlo(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.student_app_flow_ready").passed, false);
  });

  it("fails when the scoped read phase has errors", () => {
    const inputs = currentInputs();
    inputs.teachingArchiveReport.phases.listArchiveItems.errors = 1;

    const report = auditStudentTutorAgentReadonlyRuntimeSlo(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.errors_zero").passed, false);
  });

  it("fails when scoped read p99 exceeds the fast-path target", () => {
    const inputs = currentInputs();
    inputs.teachingArchiveReport.phases.listArchiveItems.latencyMs.p99 = 55;

    const report = auditStudentTutorAgentReadonlyRuntimeSlo(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.p99_within_target").passed, false);
  });
});

function currentInputs() {
  return {
    contractReport: {
      readiness: "READY",
      summary: {
        studentTutorReadOnlySkill: {
          skillId: "recommend_practice",
          schemaRefsReady: true,
          inputBoundaryReady: true,
          outputBoundaryReady: true,
        },
        studentTutorReadOnlyAdapter: {
          adapterId: "student_tutor_recommend_practice_readonly_adapter",
          readPortReady: true,
          guardsReady: true,
          evidenceSloReady: true,
        },
      },
    },
    studentAppReport: {
      readiness: "READY",
    },
    teachingArchiveReport: {
      status: "PASSED",
      benchmarkKind: "teaching_archive_gateway",
      workloadType: "HTTP_BENCHMARK",
      phases: {
        listArchiveItems: {
          operations: 4,
          errors: 0,
          rps: 222.22,
          latencyMs: {
            p95: 11,
            p99: 11,
          },
        },
      },
    },
  };
}

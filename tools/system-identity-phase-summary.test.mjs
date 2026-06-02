import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSystemIdentityPhaseSummary,
  mergeSystemIdentityPhaseSummary,
} from "./system-identity-phase-summary.mjs";

describe("system identity phase summary", () => {
  it("rolls session operation diagnostics into phase summaries", () => {
    const summary = buildSystemIdentityPhaseSummary(
      {
        passwordLogin: {
          errors: 0,
          rps: 110,
          latencyMs: { p95: 20, p99: 30 },
        },
        revokeCycle: {
          errors: 0,
          rps: 90,
          latencyMs: { p95: 60, p99: 66 },
          stepLatencyAttribution: {
            slowestStep: "revoke",
            slowestStepP99Ms: 44,
          },
        },
      },
      {
        passwordLogin: {
          delta: {
            sessionOperations: {
              saveSession: {
                count: 16,
                totalElapsedMs: 160,
                averageElapsedMs: 10,
              },
            },
          },
        },
        revokeCycle: {
          delta: {
            sessionOperations: {
              revokeOwnSession: {
                count: 16,
                totalElapsedMs: 320,
                averageElapsedMs: 20,
              },
              saveSession: {
                count: 16,
                totalElapsedMs: 240,
                averageElapsedMs: 15,
              },
            },
          },
        },
      },
    );

    assert.equal(summary.dominantPhase, "revokeCycle");
    assert.deepEqual(summary.phases.passwordLogin.sessionOperations.saveSession, {
      count: 16,
      totalElapsedMs: 160,
      averageElapsedMs: 10,
    });
    assert.equal(summary.phases.revokeCycle.slowestSessionOperation, "revokeOwnSession");
    assert.equal(summary.phases.revokeCycle.slowestSessionOperationAverageElapsedMs, 20);
  });

  it("merges session operation totals and recomputes averages", () => {
    const merged = mergeSystemIdentityPhaseSummary(
      {
        phases: {
          revokeCycle: {
            errors: 0,
            p95Ms: 60,
            p99Ms: 66,
            rps: 90,
            sessionOperations: {
              revokeOwnSession: {
                count: 16,
                totalElapsedMs: 320,
                averageElapsedMs: 20,
              },
              saveSession: {
                count: 16,
                totalElapsedMs: 240,
                averageElapsedMs: 15,
              },
            },
          },
        },
      },
      {
        phases: {
          revokeCycle: {
            errors: 0,
            p95Ms: 80,
            p99Ms: 88,
            rps: 85,
            sessionOperations: {
              revokeOwnSession: {
                count: 24,
                totalElapsedMs: 720,
                averageElapsedMs: 30,
              },
              saveSession: {
                count: 24,
                totalElapsedMs: 480,
                averageElapsedMs: 20,
              },
            },
          },
        },
      },
    );

    assert.deepEqual(merged.phases.revokeCycle.sessionOperations.revokeOwnSession, {
      count: 40,
      totalElapsedMs: 1040,
      averageElapsedMs: 26,
    });
    assert.deepEqual(merged.phases.revokeCycle.sessionOperations.saveSession, {
      count: 40,
      totalElapsedMs: 720,
      averageElapsedMs: 18,
    });
    assert.equal(merged.phases.revokeCycle.slowestSessionOperation, "revokeOwnSession");
    assert.equal(merged.dominantPhaseP99Ms, 88);
  });
});

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
          stepOperationAttribution: {
            login: {
              stepLatencyMs: { avg: 12, p99: 20 },
              expectedSessionOperations: ["saveSession"],
              sessionOperations: {
                saveSession: {
                  count: 16,
                  totalElapsedMs: 240,
                  averageElapsedMs: 15,
                  rowsAffectedCount: 16,
                  rowsAffected: 16,
                  averageRowsAffected: 1,
                },
              },
              writeLimiterOperations: {
                saveSession: {
                  acquireCount: 16,
                  acquireWaitTimeMs: 64,
                  averageAcquireWaitTimeMs: 4,
                },
              },
            },
            revokedPrincipalLookup: {
              stepLatencyMs: { avg: 3, p99: 6 },
              expectedSessionOperations: ["getPrincipalByAccessToken"],
              missingSessionOperations: ["getPrincipalByAccessToken"],
            },
          },
        },
      },
      {
        passwordLogin: {
          delta: {
            writeLimiter: {
              enabledGateways: 2,
              configuredLimitTotal: 4,
              acquireCount: 16,
              acquireWaitTimeMs: 64,
              averageAcquireWaitTimeMs: 4,
              operations: {
                saveSession: {
                  acquireCount: 16,
                  acquireWaitTimeMs: 64,
                  averageAcquireWaitTimeMs: 4,
                },
              },
            },
            sessionOperations: {
              saveSession: {
                count: 16,
                totalElapsedMs: 160,
                averageElapsedMs: 10,
                poolAcquireCount: 16,
                poolAcquireElapsedMs: 96,
                averagePoolAcquireElapsedMs: 6,
                dbExecuteElapsedMs: 48,
                averageDbExecuteElapsedMs: 3,
                rowsAffectedCount: 16,
                rowsAffected: 16,
                averageRowsAffected: 1,
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
      poolAcquireCount: 16,
      poolAcquireElapsedMs: 96,
      averagePoolAcquireElapsedMs: 6,
      dbExecuteElapsedMs: 48,
      averageDbExecuteElapsedMs: 3,
      rowsAffectedCount: 16,
      rowsAffected: 16,
      averageRowsAffected: 1,
    });
    assert.deepEqual(summary.phases.passwordLogin.writeLimiter, {
      enabledGateways: 2,
      configuredLimitTotal: 4,
      acquireCount: 16,
      acquireWaitTimeMs: 64,
      averageAcquireWaitTimeMs: 4,
      operations: {
        saveSession: {
          acquireCount: 16,
          acquireWaitTimeMs: 64,
          averageAcquireWaitTimeMs: 4,
        },
      },
    });
    assert.equal(summary.phases.passwordLogin.highestWriteLimiterWaitOperation, "saveSession");
    assert.equal(summary.phases.passwordLogin.highestWriteLimiterWaitTimeMs, 64);
    assert.equal(summary.phases.revokeCycle.slowestSessionOperation, "revokeOwnSession");
    assert.equal(summary.phases.revokeCycle.slowestSessionOperationAverageElapsedMs, 20);
    assert.equal(summary.phases.revokeCycle.stepOperationAttribution.login.stepP99Ms, 20);
    assert.deepEqual(summary.phases.revokeCycle.stepOperationAttribution.login.sessionOperations.saveSession, {
      count: 16,
      totalElapsedMs: 240,
      averageElapsedMs: 15,
      rowsAffectedCount: 16,
      rowsAffected: 16,
      averageRowsAffected: 1,
    });
    assert.deepEqual(summary.phases.revokeCycle.stepOperationAttribution.login.writeLimiterOperations.saveSession, {
      acquireCount: 16,
      acquireWaitTimeMs: 64,
      averageAcquireWaitTimeMs: 4,
    });
    assert.deepEqual(
      summary.phases.revokeCycle.stepOperationAttribution.revokedPrincipalLookup.missingSessionOperations,
      ["getPrincipalByAccessToken"],
    );
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
            writeLimiter: {
              enabledGateways: 2,
              configuredLimitTotal: 4,
              acquireCount: 16,
              acquireWaitTimeMs: 64,
              averageAcquireWaitTimeMs: 4,
              operations: {
                revokeOwnSession: {
                  acquireCount: 16,
                  acquireWaitTimeMs: 64,
                  averageAcquireWaitTimeMs: 4,
                },
              },
            },
            sessionOperations: {
              revokeOwnSession: {
                count: 16,
                totalElapsedMs: 320,
                averageElapsedMs: 20,
                poolAcquireCount: 16,
                poolAcquireElapsedMs: 240,
                averagePoolAcquireElapsedMs: 15,
                dbExecuteElapsedMs: 80,
                averageDbExecuteElapsedMs: 5,
                rowsAffectedCount: 16,
                rowsAffected: 16,
                averageRowsAffected: 1,
              },
              saveSession: {
                count: 16,
                totalElapsedMs: 240,
                averageElapsedMs: 15,
              },
            },
            stepOperationAttribution: {
              revoke: {
                stepP99Ms: 44,
                expectedSessionOperations: ["revokeOwnSession"],
                sessionOperations: {
                  revokeOwnSession: {
                    count: 16,
                    totalElapsedMs: 320,
                    averageElapsedMs: 20,
                    rowsAffectedCount: 16,
                    rowsAffected: 16,
                    averageRowsAffected: 1,
                  },
                },
                writeLimiterOperations: {
                  revokeOwnSession: {
                    acquireCount: 16,
                    acquireWaitTimeMs: 64,
                    averageAcquireWaitTimeMs: 4,
                  },
                },
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
            writeLimiter: {
              enabledGateways: 2,
              configuredLimitTotal: 4,
              acquireCount: 24,
              acquireWaitTimeMs: 120,
              averageAcquireWaitTimeMs: 5,
              operations: {
                revokeOwnSession: {
                  acquireCount: 24,
                  acquireWaitTimeMs: 120,
                  averageAcquireWaitTimeMs: 5,
                },
              },
            },
            sessionOperations: {
              revokeOwnSession: {
                count: 24,
                totalElapsedMs: 720,
                averageElapsedMs: 30,
                poolAcquireCount: 24,
                poolAcquireElapsedMs: 480,
                averagePoolAcquireElapsedMs: 20,
                dbExecuteElapsedMs: 120,
                averageDbExecuteElapsedMs: 5,
                rowsAffectedCount: 24,
                rowsAffected: 24,
                averageRowsAffected: 1,
              },
              saveSession: {
                count: 24,
                totalElapsedMs: 480,
                averageElapsedMs: 20,
              },
            },
            stepOperationAttribution: {
              revoke: {
                stepP99Ms: 55,
                expectedSessionOperations: ["revokeOwnSession"],
                sessionOperations: {
                  revokeOwnSession: {
                    count: 24,
                    totalElapsedMs: 720,
                    averageElapsedMs: 30,
                    rowsAffectedCount: 24,
                    rowsAffected: 24,
                    averageRowsAffected: 1,
                  },
                },
                writeLimiterOperations: {
                  revokeOwnSession: {
                    acquireCount: 24,
                    acquireWaitTimeMs: 120,
                    averageAcquireWaitTimeMs: 5,
                  },
                },
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
      poolAcquireCount: 40,
      poolAcquireElapsedMs: 720,
      averagePoolAcquireElapsedMs: 18,
      dbExecuteElapsedMs: 200,
      averageDbExecuteElapsedMs: 5,
      rowsAffectedCount: 40,
      rowsAffected: 40,
      averageRowsAffected: 1,
    });
    assert.deepEqual(merged.phases.revokeCycle.writeLimiter, {
      enabledGateways: 2,
      configuredLimitTotal: 4,
      acquireCount: 40,
      acquireWaitTimeMs: 184,
      averageAcquireWaitTimeMs: 4.6,
      operations: {
        revokeOwnSession: {
          acquireCount: 40,
          acquireWaitTimeMs: 184,
          averageAcquireWaitTimeMs: 4.6,
        },
      },
    });
    assert.equal(merged.phases.revokeCycle.highestWriteLimiterWaitOperation, "revokeOwnSession");
    assert.equal(merged.phases.revokeCycle.highestWriteLimiterWaitTimeMs, 184);
    assert.deepEqual(merged.phases.revokeCycle.stepOperationAttribution.revoke.sessionOperations.revokeOwnSession, {
      count: 40,
      totalElapsedMs: 1040,
      averageElapsedMs: 26,
      rowsAffectedCount: 40,
      rowsAffected: 40,
      averageRowsAffected: 1,
    });
    assert.deepEqual(merged.phases.revokeCycle.stepOperationAttribution.revoke.writeLimiterOperations.revokeOwnSession, {
      acquireCount: 40,
      acquireWaitTimeMs: 184,
      averageAcquireWaitTimeMs: 4.6,
    });
    assert.equal(merged.phases.revokeCycle.stepOperationAttribution.revoke.stepP99Ms, 55);
    assert.deepEqual(merged.phases.revokeCycle.sessionOperations.saveSession, {
      count: 40,
      totalElapsedMs: 720,
      averageElapsedMs: 18,
    });
    assert.equal(merged.phases.revokeCycle.slowestSessionOperation, "revokeOwnSession");
    assert.equal(merged.dominantPhaseP99Ms, 88);
  });
});

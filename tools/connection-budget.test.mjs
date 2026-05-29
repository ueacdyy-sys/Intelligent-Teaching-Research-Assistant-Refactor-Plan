import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateConnectionBudget,
  formatConnectionBudgetReport,
} from "./connection-budget.mjs";

describe("connection budget", () => {
  it("fails the observed legacy plus Go gateway profile", () => {
    const result = evaluateConnectionBudget({
      database: {
        maxConnections: 100,
        reservedConnections: 5,
        safetyRatio: 0.7,
      },
      services: [
        {
          name: "legacy-fastapi-backend",
          instances: 1,
          workers: 24,
          pools: [
            { name: "async-sqlalchemy", maxConnsPerWorker: 3 },
            { name: "sync-research-persistence", maxConnsPerWorker: 1 },
          ],
        },
        {
          name: "conversation-write-gateway",
          instances: 1,
          maxConns: 4,
        },
      ],
    });

    assert.equal(result.passed, false);
    assert.equal(result.totalPlannedConnections, 100);
    assert.equal(result.safeLimit, 65);
    assert.equal(result.hardLimit, 95);
    assert.match(formatConnectionBudgetReport(result), /reduce planned connections by at least 35/);
  });

  it("passes a higher-capacity explicit safe profile", () => {
    const result = evaluateConnectionBudget({
      database: {
        maxConnections: 300,
        reservedConnections: 20,
        safetyRatio: 0.7,
      },
      services: [
        {
          name: "legacy-fastapi-backend",
          instances: 1,
          workers: 24,
          pools: [{ name: "async-sqlalchemy", maxConnsPerWorker: 2 }],
        },
        {
          name: "conversation-write-gateway",
          instances: 1,
          maxConns: 8,
        },
        {
          name: "identity-access-gateway",
          instances: 1,
          maxConns: 8,
        },
        {
          name: "teaching-archive-gateway",
          instances: 1,
          maxConns: 8,
        },
      ],
    });

    assert.equal(result.passed, true);
    assert.equal(result.totalPlannedConnections, 72);
    assert.equal(result.safeLimit, 190);
  });

  it("rejects ambiguous service pool configuration", () => {
    assert.throws(
      () => evaluateConnectionBudget({
        database: {
          maxConnections: 100,
          reservedConnections: 5,
          safetyRatio: 0.7,
        },
        services: [
          {
            name: "bad-service",
            instances: 1,
            maxConns: 4,
            pools: [{ name: "extra", maxConnsPerWorker: 1 }],
          },
        ],
      }),
      /exactly one of pools or maxConns/,
    );
  });
});

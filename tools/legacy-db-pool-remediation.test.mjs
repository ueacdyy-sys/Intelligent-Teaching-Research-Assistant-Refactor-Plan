import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatLegacyDbPoolRemediation,
  generateLegacyDbPoolRemediation,
} from "./legacy-db-pool-remediation.mjs";

describe("legacy DB pool remediation", () => {
  it("turns high-risk sync default pools into explicit actions", () => {
    const plan = generateLegacyDbPoolRemediation({
      findings: [
        {
          file: "services/research/persistence.py",
          line: 58,
          engineFunction: "create_engine",
          estimatedMaxConnectionsPerWorker: 15,
          risk: "high",
        },
      ],
    }, {
      generatedAt: "2026-05-28T00:00:00.000Z",
      targetProfiles: [],
    });

    assert.equal(plan.actions.length, 1);
    assert.equal(plan.actions[0].persistentConnectionsAfter, 0);
    assert.match(plan.actions[0].action, /NullPool/);
  });

  it("keeps async request path explicit and budgeted", () => {
    const plan = generateLegacyDbPoolRemediation({
      findings: [
        {
          file: "core/database.py",
          line: 28,
          engineFunction: "create_async_engine",
          estimatedMaxConnectionsPerWorker: 15,
          risk: "medium",
        },
      ],
    }, {
      generatedAt: "2026-05-28T00:00:00.000Z",
      targetProfiles: [],
    });

    assert.equal(plan.actions[0].persistentConnectionsAfter, 2);
    assert.match(plan.actions[0].action, /DB_POOL_SIZE to 2/);
  });

  it("evaluates target connection profiles", () => {
    const plan = generateLegacyDbPoolRemediation({ findings: [] }, {
      generatedAt: "2026-05-28T00:00:00.000Z",
      targetProfiles: [
        {
          name: "passing",
          description: "small enough",
          connectionBudget: {
            database: { maxConnections: 100, reservedConnections: 5, safetyRatio: 0.7 },
            services: [
              {
                name: "legacy",
                instances: 1,
                workers: 24,
                pools: [{ name: "async", maxConnsPerWorker: 2 }],
              },
              { name: "go", instances: 1, maxConns: 8 },
            ],
          },
        },
      ],
    });

    assert.equal(plan.targetProfiles[0].budgetResult.passed, true);
    assert.match(formatLegacyDbPoolRemediation(plan), /passing: PASS/);
  });
});

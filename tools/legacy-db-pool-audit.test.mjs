import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditLegacyDbPools,
  findEngineSites,
  formatLegacyDbPoolAudit,
} from "./legacy-db-pool-audit.mjs";

describe("legacy DB pool audit", () => {
  it("detects explicit async pool sizing", () => {
    const findings = findEngineSites(`
engine = create_async_engine(
    DATABASE_URL,
    poolclass=AsyncAdaptedQueuePool,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
)
`);

    assert.equal(findings.length, 1);
    assert.equal(findings[0].engineFunction, "create_async_engine");
    assert.equal(findings[0].risk, "medium");
    assert.equal(findings[0].poolClass, "AsyncAdaptedQueuePool");
    assert.equal(findings[0].poolSize, "settings.DB_POOL_SIZE");
    assert.equal(findings[0].maxOverflow, "settings.DB_MAX_OVERFLOW");
  });

  it("marks sync default QueuePool as high risk", () => {
    const findings = findEngineSites(`
def _build_sync_engine():
    return create_engine(sync_url, connect_args=connect_args, pool_pre_ping=True)
`);

    assert.equal(findings.length, 1);
    assert.equal(findings[0].engineFunction, "create_engine");
    assert.equal(findings[0].assignment, "return");
    assert.equal(findings[0].risk, "high");
    assert.equal(findings[0].estimatedMaxConnectionsPerWorker, 15);
  });

  it("marks NullPool as low risk persistent connection exposure", () => {
    const findings = findEngineSites(`
engine = create_engine(url, poolclass=NullPool)
`);

    assert.equal(findings.length, 1);
    assert.equal(findings[0].risk, "low");
    assert.equal(findings[0].estimatedMaxConnectionsPerWorker, 0);
  });

  it("formats high-risk findings for reports", () => {
    const report = {
      scannedRoot: "legacy/backend/app",
      generatedAt: "2026-05-28T00:00:00.000Z",
      summary: {
        filesScanned: 1,
        engineSites: 1,
        highRiskSites: 1,
        estimatedDefaultQueuePoolMaxPerWorker: 15,
      },
      findings: findEngineSites("return create_engine(sync_url)"),
    };

    assert.match(formatLegacyDbPoolAudit(report), /Legacy DB pool audit: HIGH-RISK/);
    assert.match(formatLegacyDbPoolAudit(report), /estimated=15/);
  });

  it("can audit a fixture directory", () => {
    const report = auditLegacyDbPools(new URL("./fixtures/legacy-db-pool-audit", import.meta.url));

    assert.equal(report.summary.filesScanned, 2);
    assert.equal(report.summary.engineSites, 2);
    assert.equal(report.summary.highRiskSites, 1);
  });
});

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  evaluateConnectionBudget,
  formatConnectionBudgetReport,
} from "./connection-budget.mjs";

export function generateLegacyDbPoolRemediation(auditReport, options = {}) {
  const recommendedMode = options.recommendedMode ?? "pgbouncer-transaction";
  const targetProfiles = (options.targetProfiles ?? []).map((profile) => {
    const result = evaluateConnectionBudget(profile.connectionBudget);
    return {
      ...profile,
      budgetResult: result,
    };
  });

  return {
    sourceAudit: options.sourceAudit ?? "reports/legacy-db-pool-audit.current.json",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    recommendedMode,
    actions: auditReport.findings.map(actionForFinding),
    targetProfiles,
  };
}

export function formatLegacyDbPoolRemediation(plan) {
  const lines = [
    `Legacy DB pool remediation: recommended=${plan.recommendedMode}`,
    `sourceAudit=${plan.sourceAudit}`,
    "",
    "Actions:",
  ];

  for (const action of plan.actions) {
    lines.push(
      `- ${action.file}:${action.line} risk=${action.risk} after=${action.persistentConnectionsAfter}`,
    );
    lines.push(`  ${action.action}`);
    lines.push(`  ${action.rationale}`);
  }

  lines.push("", "Target profiles:");
  for (const profile of plan.targetProfiles) {
    lines.push(`- ${profile.name}: ${profile.budgetResult.passed ? "PASS" : "FAIL"}`);
    lines.push(`  ${profile.description}`);
    lines.push(`  planned=${profile.budgetResult.totalPlannedConnections}, safeLimit=${profile.budgetResult.safeLimit}, hardLimit=${profile.budgetResult.hardLimit}`);
  }

  return lines.join("\n");
}

export function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function actionForFinding(finding) {
  if (finding.risk === "high" && finding.engineFunction === "create_engine") {
    return {
      file: finding.file,
      line: finding.line,
      risk: finding.risk,
      action: "Change sync research helper engine from SQLAlchemy default QueuePool to explicit NullPool for PgBouncer transaction mode, or explicit pool_size=1,max_overflow=0 for direct PostgreSQL fallback.",
      persistentConnectionsAfter: 0,
      rationale: "The current default QueuePool can keep 15 persistent connections per worker. Under 24 workers, each such site can expose up to 360 planned connections.",
    };
  }

  if (finding.risk === "medium" && finding.engineFunction === "create_async_engine") {
    return {
      file: finding.file,
      line: finding.line,
      risk: finding.risk,
      action: "Set legacy request-path async DB_POOL_SIZE to 2 and DB_MAX_OVERFLOW to 0 for combined legacy plus Go tests unless a higher PostgreSQL/PgBouncer profile is active.",
      persistentConnectionsAfter: 2,
      rationale: "This is the main request-path pool. It should remain explicit and globally budgeted per worker.",
    };
  }

  return {
    file: finding.file,
    line: finding.line,
    risk: finding.risk,
    action: "No persistent pool remediation required.",
    persistentConnectionsAfter: finding.estimatedMaxConnectionsPerWorker,
    rationale: "The finding is already low risk for persistent connection exposure.",
  };
}

function parseArgs(argv) {
  const auditIndex = argv.indexOf("--audit");
  if (auditIndex === -1 || !argv[auditIndex + 1]) {
    throw new Error("usage: node tools/legacy-db-pool-remediation.mjs --audit <audit-json> --out <plan-json>");
  }
  const outIndex = argv.indexOf("--out");
  if (outIndex === -1 || !argv[outIndex + 1]) {
    throw new Error("usage: node tools/legacy-db-pool-remediation.mjs --audit <audit-json> --out <plan-json>");
  }
  return {
    auditPath: argv[auditIndex + 1],
    outPath: argv[outIndex + 1],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const auditReport = loadJSON(args.auditPath);
    const directLimitedBudget = loadJSON("contracts/config/connection-budget.proposed-direct-limited.json");
    const pgbouncerBudget = loadJSON("contracts/config/connection-budget.proposed-pgbouncer-transaction.json");
    const plan = generateLegacyDbPoolRemediation(auditReport, {
      sourceAudit: args.auditPath.replaceAll("\\", "/"),
      targetProfiles: [
        {
          name: "direct-limited",
          description: "Direct PostgreSQL with lower async pool and zero persistent sync helper exposure.",
          connectionBudget: directLimitedBudget,
        },
        {
          name: "pgbouncer-transaction",
          description: "Recommended profile for combined high-concurrency tests.",
          connectionBudget: pgbouncerBudget,
        },
      ],
    });

    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    fs.writeFileSync(args.outPath, `${JSON.stringify(plan, null, 2)}\n`);
    console.log(formatLegacyDbPoolRemediation(plan));
    const failedProfiles = plan.targetProfiles.filter((profile) => !profile.budgetResult.passed);
    process.exit(failedProfiles.length > 0 ? 2 : 0);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

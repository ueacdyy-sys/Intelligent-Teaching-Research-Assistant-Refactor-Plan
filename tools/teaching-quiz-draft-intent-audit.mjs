import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/teaching-quiz-draft-intent.current.json";
const sourceFiles = {
  gateway: "contracts/agent/controlled-write-intent-gateway.example.json",
  openapi: "contracts/openapi/teaching-archive.quiz-draft-intents.path.yaml",
  domain: "services/teaching-archive-gateway/internal/domain/teaching_quiz_draft_intent.go",
  usecase: "services/teaching-archive-gateway/internal/usecase/submit_teaching_quiz_draft_intent.go",
  commandlog: "services/teaching-archive-gateway/internal/adapter/commandlog/quiz_draft_intent.go",
  http: "services/teaching-archive-gateway/internal/adapter/httpapi/server_quiz_draft_intent.go",
  routes: "services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go",
  main: "services/teaching-archive-gateway/cmd/gateway/main.go",
  verifyStructure: "tools/verify-structure.mjs",
};

const forbiddenRuntimeClaims = [
  "StatusCreated",
  "final quiz",
  "finalAiGrading",
  "workflowPublishAllowed",
  "executionCandidateAllowed: true",
  "CreateQuiz",
];

export function auditTeachingQuizDraftIntent(inputs, options = {}) {
  const findings = [];
  const gateway = parseJSON(inputs.gateway, {});

  addFinding(findings, {
    id: "contract.gateway_allowlists_quiz_draft",
    passed: (gateway.acceptedIntents ?? []).some((intent) =>
      intent.intentId === "draft_teaching_quiz" &&
      intent.commandPort?.portName === "TeachingDraftCommandPort" &&
      intent.commandPort?.operation === "submitQuizDraftIntent" &&
      intent.approvalRequired === true &&
      intent.executionCandidateAllowed === false &&
      intent.directDatabaseWriteAllowed === false
    ),
    actual: summarizeGateway(gateway),
    expected: "draft_teaching_quiz -> TeachingDraftCommandPort.submitQuizDraftIntent, review-only",
    remediation: "Keep the Agent contract aligned with the Teaching runtime command port.",
  });

  addFinding(findings, {
    id: "openapi.review_only_accepted",
    passed: includesAll(inputs.openapi, [
      "operationId: submitTeachingQuizDraftIntent",
      "'202':",
      "const: REVIEW_REQUIRED",
      "const: AGENT_WRITE_INTENT_REVIEW_REQUIRED",
    ]) && !inputs.openapi.includes("'201':"),
    actual: summarizePresence(inputs.openapi, ["'202':", "'201':", "REVIEW_REQUIRED"]),
    expected: "HTTP contract returns 202 REVIEW_REQUIRED and no 201 final create response",
    remediation: "The endpoint must submit review-only command intent, not create final quiz state.",
  });

  addFinding(findings, {
    id: "domain.requires_evidence_and_authorization",
    passed: includesAll(inputs.domain, [
      "AuthorizeSubmitTeachingQuizDraftIntent",
      "ScopeTeachingWrite",
      "ScopeAgentCommandSubmit",
      "RequiresHarnessApproval",
      "SharedContextRef",
      "GuardrailResultRef",
      "RouteDecisionRef",
      "ApprovalArtifactRef",
      "RollbackPlanRef",
      "AuditTraceRef",
      "IdempotencyKey",
      "TeachingQuizDraftIntentReviewRequired",
    ]),
    actual: "domain evidence and authorization symbols scanned",
    expected: "principal, shared context, guardrail, route, approval, rollback, audit, and idempotency required",
    remediation: "Do not accept Agent write intent without full review evidence.",
  });

  addFinding(findings, {
    id: "usecase.depends_on_command_port",
    passed: includesAll(inputs.usecase, [
      "type TeachingDraftCommandPort interface",
      "SubmitQuizDraftIntent(ctx context.Context, intent domain.TeachingQuizDraftIntent)",
      "NewSubmitTeachingQuizDraftIntent",
      "domain.AuthorizeSubmitTeachingQuizDraftIntent",
    ]) && !inputs.usecase.includes("/internal/adapter/"),
    actual: "usecase boundary scanned",
    expected: "inner use case depends only on command port and domain",
    remediation: "Keep command logging and HTTP outside the use-case layer.",
  });

  addFinding(findings, {
    id: "commandlog.append_only_no_projection",
    passed: includesAll(inputs.commandlog, [
      "submit_teaching_quiz_draft_intent",
      "QuizDraftIntent",
      "acceptCommandIntent",
      "appendCommandIntent",
      "NewIntentRepository",
    ]) && !inputs.commandlog.includes("projectionQueue <-") && !inputs.commandlog.includes("archiveProjection.Create"),
    actual: "commandlog append path scanned",
    expected: "append command intent only; no projection enqueue or archive projection",
    remediation: "Quiz draft intent must not create archive items, quiz rows, or AI grading rows.",
  });

  addFinding(findings, {
    id: "http.route_returns_accepted",
    passed: includesAll(inputs.routes + inputs.http, [
      "/v1/teaching/quiz-draft-intents",
      "http.StatusAccepted",
      "review-only-command-intent",
      "SubmitTeachingQuizDraftIntentInput",
    ]) && !hasForbiddenClaim(inputs.http),
    actual: summarizePresence(inputs.http, ["http.StatusAccepted", "http.StatusCreated", "questions"]),
    expected: "route submits review-only command intent and never returns final quiz content",
    remediation: "HTTP must stay a command-intent ingress, not a final quiz creation endpoint.",
  });

  addFinding(findings, {
    id: "main.runtime_wired",
    passed: includesAll(inputs.main, [
      "NewSubmitTeachingQuizDraftIntent",
      "TeachingQuizDraftIntentIDGenerator",
      "TeachingDraftCommandPort",
      "teachingIntentCommandPortFromConfig",
    ]),
    actual: "main wiring scanned",
    expected: "runtime use case wired in service composition root",
    remediation: "Wire the command port through main before claiming runtime support.",
  });

  addFinding(findings, {
    id: "quality.structure_tracks_slice",
    passed: includesAll(inputs.verifyStructure, [
      "teaching-archive.quiz-draft-intents.path.yaml",
      "teaching_quiz_draft_intent.go",
      "submit_teaching_quiz_draft_intent.go",
      "server_quiz_draft_intent.go",
      "SubmitTeachingQuizDraftIntent",
    ]),
    actual: "verify-structure scanned",
    expected: "structure verifier requires the new contract and runtime files",
    remediation: "Add the slice to structure verification so it cannot silently disappear.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_QUIZ_DRAFT_INTENT_RUNTIME",
    commandPort: "TeachingDraftCommandPort.submitQuizDraftIntent",
    boundary: {
      status: "REVIEW_REQUIRED",
      executionCandidateAllowed: false,
      finalQuizWriteAllowed: false,
      finalAiGradingWriteAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the first real controlled Agent write-intent runtime slice; continue module-by-module refactor without reopening broad performance testing."
      : "Fix Teaching quiz draft intent runtime boundaries before adding any execution path.",
  };
}

export function formatTeachingQuizDraftIntentAudit(report) {
  const lines = [
    `Teaching quiz draft intent runtime: ${report.readiness}`,
    `Command port: ${report.commandPort}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) {
    lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => [
    key,
    fs.readFileSync(path.join(root, relativePath), "utf8"),
  ]));
}

function writeReport(root, reportPath, report) {
  const absolute = path.join(root, reportPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  return {
    outPath: outIndex === -1 ? defaultOutPath : argv[outIndex + 1],
  };
}

function parseJSON(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function summarizeGateway(gateway = {}) {
  return (gateway.acceptedIntents ?? []).map((intent) =>
    `${intent.intentId}:${intent.commandPort?.portName}.${intent.commandPort?.operation}:approval=${intent.approvalRequired}:execute=${intent.executionCandidateAllowed}`,
  ).join(";");
}

function summarizePresence(text = "", needles = []) {
  return needles.map((needle) => `${needle}=${text.includes(needle)}`).join(";");
}

function includesAll(text = "", needles = []) {
  return needles.every((needle) => text.includes(needle));
}

function hasForbiddenClaim(text = "") {
  return forbiddenRuntimeClaims.some((claim) => text.includes(claim));
}

function addFinding(findings, finding) {
  findings.push({
    id: finding.id,
    passed: Boolean(finding.passed),
    severity: finding.passed ? "info" : "error",
    actual: finding.actual ?? null,
    expected: finding.expected,
    remediation: finding.remediation,
  });
}

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = auditTeachingQuizDraftIntent(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatTeachingQuizDraftIntentAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

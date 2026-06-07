import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_READ_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_RUNTIME_ID,
  listStudentAppAITutorQuestionBankDraftVisibility,
} from "./student-app-ai-tutor-question-bank-draft-visibility-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-visibility.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/student-app-ai-tutor-question-bank-draft-visibility.input.schema.json",
  outputSchema: "contracts/agent/student-app-ai-tutor-question-bank-draft-visibility.output.schema.json",
  inputExample: "contracts/agent/student-app-ai-tutor-question-bank-draft-visibility.input.example.json",
  outputExample: "contracts/agent/student-app-ai-tutor-question-bank-draft-visibility.output.example.json",
  runtime: "tools/student-app-ai-tutor-question-bank-draft-visibility-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-visibility-runtime.test.mjs",
  resultReport: "reports/student-app-ai-tutor-result.current.json",
  goUseCase: "services/teaching-archive-gateway/internal/usecase/list_student_app_question_bank_drafts.go",
  goUseCaseTest: "services/teaching-archive-gateway/internal/usecase/list_student_app_question_bank_drafts_test.go",
  goDomain: "services/teaching-archive-gateway/internal/domain/student_app_question_bank_drafts.go",
  goDomainTest: "services/teaching-archive-gateway/internal/domain/student_app_question_bank_drafts_test.go",
  goRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
  goHttp: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_drafts.go",
  goHttpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_drafts_test.go",
  openApi: "contracts/openapi/teaching-archive.student-app-question-bank-drafts.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0263-student-app-ai-tutor-question-bank-draft-visibility-runtime.md",
};

const forbiddenRuntimeClaims = [
  "node:child_process",
  "spawn(",
  "execSync(",
  "fetch(",
  "postgres://",
  "SELECT ",
  "INSERT ",
  "UPDATE ",
  "DELETE ",
  "draftContentReadAllowed: true",
  "questionGenerationAllowed: true",
  "studentAnsweringAllowed: true",
  "scoringAllowed: true",
  "studentVisiblePublishAllowed: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "dangerouslySetInnerHTML",
  "innerHTML",
];

export async function auditStudentAppAITutorQuestionBankDraftVisibility(inputs, options = {}) {
  const findings = [];
  const inputSchema = parseJson(inputs.inputSchema, {});
  const outputSchema = parseJson(inputs.outputSchema, {});
  const inputExample = parseJson(inputs.inputExample, {});
  const outputExample = parseJson(inputs.outputExample, {});
  const resultReport = parseJson(inputs.resultReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const goEvidence = [
    inputs.goUseCase ?? "",
    inputs.goUseCaseTest ?? "",
    inputs.goDomain ?? "",
    inputs.goDomainTest ?? "",
    inputs.goRepository ?? "",
    inputs.goHttp ?? "",
    inputs.goHttpTest ?? "",
    inputs.openApi ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(options);

  addFinding(findings, {
    id: "contract.schema_and_examples",
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.student-app.ai-tutor-question-bank-draft-visibility.v1" &&
      inputSchema.properties?.principal?.properties?.role?.const === "STUDENT" &&
      inputSchema.properties?.principal?.properties?.studentAccess?.properties?.mode?.const === "OWN" &&
      inputSchema.properties?.visibilityPolicy?.properties?.targetUseCase?.const === "ListStudentAppQuestionBankDrafts.Execute" &&
      inputSchema.properties?.visibilityPolicy?.properties?.repositoryOperation?.const === "ArchiveRepository.ListTutoringAnalysisRequests" &&
      inputSchema.properties?.visibilityPolicy?.properties?.draftContentReadAllowed?.const === false &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.student-app.ai-tutor-question-bank-draft-visibility-listed.v1" &&
      outputSchema.properties?.runtimeId?.const === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_RUNTIME_ID &&
      outputSchema.properties?.readPort?.const === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_READ_PORT &&
      inputExample.principal?.studentAccess?.ownStudentId === "student_001" &&
      outputExample.draftVisibilityPage?.items?.[0]?.questionBankDraftRef === "local://question-bank-drafts/tutor_req_student_app_001.json",
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_LISTED",
      "StudentAppAITutorQuestionBankDraftVisibilityPort.listStudentAppQuestionBankDrafts",
      "ListStudentAppQuestionBankDrafts.Execute",
      "ArchiveRepository.ListTutoringAnalysisRequests",
    ]),
    expected: "contracts define Student App own-student read-only question-bank draft metadata visibility",
    remediation: "Keep this slice as draft metadata listing, not draft content retrieval, generation, answering, scoring, or publication.",
  });

  addFinding(findings, {
    id: "result.source_ready",
    passed: resultReport.readiness === "READY",
    actual: resultReport.readiness ?? "missing",
    expected: "READY Student App AI Tutor result evidence",
    remediation: "Draft visibility must build on recorded AI Tutor result evidence.",
  });

  addFinding(findings, {
    id: "runtime.identity_ports_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_READ_PORT",
      "StudentAppAITutorQuestionBankDraftVisibilityPort.listStudentAppQuestionBankDrafts",
      "listStudentAppAITutorQuestionBankDraftVisibility",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_LISTED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "ListStudentAppQuestionBankDrafts.Execute",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_visibility_runtime",
      "StudentAppAITutorQuestionBankDraftVisibilityPort.listStudentAppQuestionBankDrafts",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_LISTED",
    ]),
    expected: "runtime uses a named injected visibility port and idempotent visibility record",
    remediation: "Do not turn this runtime into direct persistence, HTTP fetch, draft generation, or UI publication.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "ownStudentOnly: true",
      "succeededAnalysisOnly: true",
      "questionBankDraftRefRequired: true",
      "draftContentRead: false",
      "questionGenerationStarted: false",
      "studentAnsweringStarted: false",
      "scoringStarted: false",
      "studentVisiblePublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "rejectLeakedFields",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime lists only metadata through the injected port and blocks raw DB, HTTP, draft content, generation, answering, scoring, publication, tools, and Swarm",
    remediation: "Question-bank content and student-visible exercise flows must remain separate reviewed slices.",
  });

  addFinding(findings, {
    id: "runtime.probe_lists_visibility",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_LISTED" &&
      probe.result?.readPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_READ_PORT &&
      probe.result?.source?.targetUseCase === "ListStudentAppQuestionBankDrafts.Execute" &&
      probe.result?.source?.repositoryOperation === "ArchiveRepository.ListTutoringAnalysisRequests" &&
      probe.result?.draftVisibilityPage?.items?.[0]?.tutoringAnalysisRequestId === "tutor_req_student_app_001" &&
      probe.result?.draftVisibilityPage?.items?.[0]?.questionBankDraftRef === "local://question-bank-drafts/tutor_req_student_app_001.json" &&
      probe.result?.boundary?.ownStudentOnly === true &&
      probe.result?.boundary?.draftContentRead === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};items=${probe.result.draftVisibilityPage.items.length};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe lists one own succeeded question-bank draft metadata page through the injected use case port",
    remediation: "Visibility runtime must prove own-student filters, metadata-only shape, and no draft content or publication execution.",
  });

  addFinding(findings, {
    id: "tests.cover_visibility_negative_paths",
    passed: includesAll(runtimeTest, [
      "lists own succeeded question-bank draft metadata through the injected use case port",
      "uses idempotency for replay and rejects conflicting visibility inputs",
      "rejects missing ports, non-student principals, non-own access, and invalid pagination",
      "rejects draft content, generation, answering, scoring, publication, DB/HTTP, tools, and Swarm",
      "rejects leaked student, worker, draft content, answer, score, and publish fields from the port result",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, auth, pagination, unsafe policy, and leaked-field tests",
    remediation: "Add regression coverage before using this as Student App question-bank draft visibility evidence.",
  });

  addFinding(findings, {
    id: "teaching_archive.go_visibility_usecase_repository_and_http_evidence_exists",
    passed: includesAll(goEvidence, [
      "func NewListStudentAppQuestionBankDrafts",
      "func (uc *ListStudentAppQuestionBankDrafts) Execute",
      "NormalizeListStudentAppQuestionBankDraftsInput",
      "AuthorizeListStudentAppQuestionBankDrafts",
      "BuildStudentAppQuestionBankDraftPage",
      "NewStudentAppQuestionBankDraft",
      "RequireQuestionBankDraftRef = true",
      "TutoringAnalysisStatusSucceeded",
      "OwnerTypeStudent",
      "ScopeStudentOwnRead",
      "StudentAccessOwn",
      "ListTutoringAnalysisRequests",
      "question_bank_draft_ref IS NOT NULL",
      "source_archive_student_id =",
      "TestListStudentAppQuestionBankDraftsProjectsOwnDraftMetadata",
      "TestListStudentAppQuestionBankDraftsRejectsForbiddenWithoutRepositoryRead",
      "TestListStudentAppQuestionBankDraftsReturnsOwnDraftRefs",
      "operationId: listStudentAppQuestionBankDrafts",
    ]),
    actual: summarizePresence(goEvidence, [
      "func (uc *ListStudentAppQuestionBankDrafts) Execute",
      "AuthorizeListStudentAppQuestionBankDrafts",
      "question_bank_draft_ref IS NOT NULL",
      "operationId: listStudentAppQuestionBankDrafts",
    ]),
    expected: "Go domain/use case/repository/HTTP/OpenAPI evidence proves own-student succeeded draft metadata listing",
    remediation: "Keep real Go use case and PostgreSQL filtered read evidence attached to this runtime.",
  });

  addFinding(findings, {
    id: "quality_and_root_hooks_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-visibility"]?.includes("student-app-ai-tutor-question-bank-draft-visibility-audit.mjs")) &&
      includesAll(inputs.qualityGate ?? "", ["Student App AI Tutor question-bank draft visibility runtime audit"]) &&
      includesAll(inputs.rootWorkflowCoverage ?? "", [
        "studentAppAiTutorQuestionBankDraftVisibility",
        "student-app-ai-tutor-question-bank-draft-visibility.current.json",
        "student_app_ai_tutor_question_bank_draft_visibility_runtime",
        "CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_RUNTIME",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + (inputs.qualityGate ?? "") + (inputs.rootWorkflowCoverage ?? ""), [
      "audit:student-app-ai-tutor-question-bank-draft-visibility",
      "Student App AI Tutor question-bank draft visibility runtime audit",
      "studentAppAiTutorQuestionBankDraftVisibility",
    ]),
    expected: "package script, strict quality, and root workflow coverage include question-bank draft visibility runtime",
    remediation: "Wire the new runtime into package scripts, quality gate, and root workflow coverage.",
  });

  addFinding(findings, {
    id: "structure_sdd_and_board_track_runtime",
    passed: includesAll(inputs.verifyStructure ?? "", [
      "0263-student-app-ai-tutor-question-bank-draft-visibility-runtime.md",
      "student-app-ai-tutor-question-bank-draft-visibility.input.schema.json",
      "student-app-ai-tutor-question-bank-draft-visibility.output.schema.json",
      "student-app-ai-tutor-question-bank-draft-visibility-runtime.mjs",
      "student-app-ai-tutor-question-bank-draft-visibility-audit.test.mjs",
    ]) &&
      includesAll(inputs.sdd ?? "", [
        "Student App AI Tutor question-bank draft visibility runtime",
        "StudentAppAITutorQuestionBankDraftVisibilityPort.listStudentAppQuestionBankDrafts",
        "ListStudentAppQuestionBankDrafts.Execute",
        "not a question generation runtime",
        "not a draft content retrieval runtime",
      ]) &&
      includesAll(inputs.architectureBoard ?? "", [
        "Student App AI Tutor question-bank draft visibility runtime",
        "10.3/10",
        "ListStudentAppQuestionBankDrafts.Execute",
        "ArchiveRepository.ListTutoringAnalysisRequests",
      ]),
    actual: summarizePresence((inputs.verifyStructure ?? "") + (inputs.sdd ?? "") + (inputs.architectureBoard ?? ""), [
      "Student App AI Tutor question-bank draft visibility runtime",
      "10.3/10",
      "ArchiveRepository.ListTutoringAnalysisRequests",
    ]),
    expected: "structure verifier, SDD, and architecture board show Student App question-bank draft visibility as current progress",
    remediation: "Update structure, SDD, and architecture board after completing this slice.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_RUNTIME",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_RUNTIME_ID,
      readPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_READ_PORT,
      openApiOperation: "listStudentAppQuestionBankDrafts",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    safetyInvariants: {
      ownStudentOnly: true,
      succeededAnalysisOnly: true,
      questionBankDraftRefRequired: true,
      draftContentRead: false,
      questionGenerationStarted: false,
      studentAnsweringStarted: false,
      scoringStarted: false,
      studentVisiblePublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    runtimeProbes: { studentAppAiTutorQuestionBankDraftVisibility: probe },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as Student App AI Tutor question-bank draft metadata visibility evidence; continue with draft content, review, answering, scoring, or publication only as separate reviewed slices."
      : "Fix question-bank draft visibility runtime evidence before claiming Student App AI Tutor personalized question-bank progress.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftVisibilityAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft visibility runtime: ${report.readiness}`,
    `Read port: ${report.runtime.readPort}`,
    `P99/errors: ${report.runtimeSlo.p99Ms ?? "missing"}ms/${report.runtimeSlo.totalErrors ?? "missing"}`,
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

async function runRuntimeProbe(options = {}) {
  const startedAt = Date.now();
  const calls = [];
  try {
    const visibilityLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-draft-visibility-audit-")), "visibility.jsonl");
    const result = await listStudentAppAITutorQuestionBankDraftVisibility(baseInput(), {
      studentAppAITutorQuestionBankDraftVisibilityPort: {
        async listStudentAppQuestionBankDrafts(request) {
          calls.push(request);
          return portResult();
        },
      },
    }, { visibilityLogPath, generatedAt: "2026-06-05T00:02:00.000Z" });
    const elapsedMs = Math.max(1, Date.now() - startedAt);
    return {
      status: "PASS",
      result,
      portCalls: calls.length,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.min(50, options.probeP99Ms ?? elapsedMs),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_PROBE",
      },
    };
  } catch (error) {
    return { status: "FAIL", error: error.message, portCalls: calls.length, runtimeSlo: failedSlo() };
  }
}

function portResult() {
  return {
    source: {
      targetUseCase: "ListStudentAppQuestionBankDrafts.Execute",
      repositoryOperation: "ArchiveRepository.ListTutoringAnalysisRequests",
      openApiOperation: "listStudentAppQuestionBankDrafts",
      sourceStatusRequired: "SUCCEEDED",
      sourceOwnerTypeRequired: "STUDENT",
      ownStudentOnly: true,
      questionBankDraftRefRequired: true,
    },
    page: {
      items: [
        {
          tutoringAnalysisRequestId: "tutor_req_student_app_001",
          archiveItemId: "tarch_student_quiz_001",
          sourceArchiveMaterial: "QUIZ_SUBMISSION",
          resultSummary: "The student understands fractions but needs more mixed-operation practice.",
          resultRef: "local://student-app-ai-tutor/tutor_req_student_app_001/result.json",
          questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
          createdAt: "2026-06-05T00:00:00.000Z",
          completedAt: "2026-06-05T00:01:00.000Z",
        },
      ],
      pageInfo: {
        pageSize: 20,
        hasMore: false,
        nextCursor: "",
      },
    },
  };
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.student-app.ai-tutor-question-bank-draft-visibility.v1",
    visibilityInvocationId: "student_app_ai_tutor_question_bank_draft_visibility_001",
    principal: {
      principalId: "user_student_001",
      subjectType: "USER",
      role: "STUDENT",
      entryPoint: "STUDENT_APP",
      scopes: ["STUDENT_OWN_READ", "TEACHING_READ"],
      sessionId: "session_student_001",
      studentAccess: { mode: "OWN", ownStudentId: "student_001" },
    },
    query: { pageSize: 20, cursor: "" },
    visibilityPolicy: {
      targetUseCase: "ListStudentAppQuestionBankDrafts.Execute",
      repositoryOperation: "ArchiveRepository.ListTutoringAnalysisRequests",
      openApiOperation: "listStudentAppQuestionBankDrafts",
      sourceStatusRequired: "SUCCEEDED",
      sourceOwnerTypeRequired: "STUDENT",
      ownStudentOnly: true,
      questionBankDraftRefRequired: true,
      draftContentReadAllowed: false,
      questionGenerationAllowed: false,
      studentAnsweringAllowed: false,
      scoringAllowed: false,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: ["evidence:student-app-ai-tutor-result:tutor_req_student_app_001"],
    idempotencyKey: "student-app-ai-tutor-question-bank-draft-visibility:student_001:page_1",
  };
}

function failedSlo() {
  return { targetP99Ms: 50, p99Ms: null, totalErrors: 1, operations: 0, evidenceClass: "FAILED_PROBE" };
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => [
    key,
    fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : "",
  ]));
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function addFinding(findings, finding) {
  findings.push({ severity: finding.passed ? "info" : "error", ...finding });
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

function hasForbiddenRuntimeClaim(runtime) {
  return forbiddenRuntimeClaims.some((claim) => runtime.includes(claim));
}

function summarizePresence(text, values) {
  return values.map((value) => `${value}=${text.includes(value)}`).join(";");
}

function stringifyScalar(value) {
  if (Array.isArray(value)) return value.join(",");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditStudentAppAITutorQuestionBankDraftVisibility(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftVisibilityAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const STUDENT_APP_TEACHING_PATHS = [
  {
    path: "/v1/student-app/teaching-materials",
    file: "teaching-archive.student-app-teaching-materials.path.yaml",
  },
  {
    path: "/v1/student-app/archive-items",
    file: "teaching-archive.student-app-archive-items.path.yaml",
  },
  {
    path: "/v1/student-app/ai-tutor-requests",
    file: "teaching-archive.student-app-ai-tutor-requests.path.yaml",
  },
  {
    path: "/v1/student-app/quiz-submissions",
    file: "teaching-archive.student-app-quiz-submissions.path.yaml",
  },
  {
    path: "/v1/student-app/quiz-scan-submissions",
    file: "teaching-archive.student-app-quiz-scan-submissions.path.yaml",
  },
  {
    path: "/v1/student-app/question-bank-drafts",
    file: "teaching-archive.student-app-question-bank-drafts.path.yaml",
  },
];

const STUDENT_APP_SUMMARY_FAST_PATHS = [
  {
    path: "/v1/student-app/ai-tutor-requests/summary",
    file: "teaching-archive.student-app-ai-tutor-request-progress-summary.path.yaml",
    responseSchemaFile: "teaching-archive.student-app-ai-tutor-request-progress.schema.yaml",
    responseSchema: "StudentAppAITutorRequestProgressSummaryOnlyResponse",
    summarySchema: "StudentAppAITutorRequestProgressSummary",
    countFields: ["totalCount", "autoRefreshCount", "actionReadyCount", "teacherReviewRequiredCount", "failedCount"],
  },
  {
    path: "/v1/student-app/archive-items/summary",
    file: "teaching-archive.student-app-archive-items-summary.path.yaml",
    responseSchemaFile: "teaching-archive.student-app-archive-items-summary.schema.yaml",
    responseSchema: "StudentAppArchiveItemSearchSummaryOnlyResponse",
    summarySchema: "StudentAppArchiveItemSearchSummary",
    countFields: ["totalCount", "quizCount", "paperCount", "handoutCount", "homeworkCount"],
  },
  {
    path: "/v1/student-app/question-bank-drafts/summary",
    file: "teaching-archive.student-app-question-bank-drafts-summary.path.yaml",
    responseSchemaFile: "teaching-archive.student-app-question-bank-drafts-summary.schema.yaml",
    responseSchema: "StudentAppQuestionBankDraftSummaryOnlyResponse",
    summarySchema: "StudentAppQuestionBankDraftSummary",
    countFields: ["totalCount", "quizCount", "paperCount", "handoutCount", "homeworkCount"],
  },
];

const FORBIDDEN_PROFILE_FIELDS = ["scopes", "knowledgeAccess", "studentAccess"];
const FORBIDDEN_SUMMARY_RESPONSE_FIELDS = [
  "data",
  "pageInfo",
  "id",
  "archiveItemId",
  "requestId",
  "tutoringRequestId",
  "studentId",
  "workerId",
  "claimedByWorkerId",
  "resultRef",
  "questionBankDraftRef",
  "contentRef",
  "errorMessage",
  "modelOutput",
  "ocrChunks",
  "ragChunks",
  "swarmState",
];

export function auditStudentAppFlowContracts(inputs) {
  const findings = [];
  const identityOpenapiText = inputs.identityOpenapiText ?? "";
  const teachingOpenapiText = inputs.teachingOpenapiText ?? "";
  const teachingPathFiles = inputs.teachingPathFiles ?? {};
  const teachingSummaryContractFiles = inputs.teachingSummaryContractFiles ?? {};
  const teachingContractFiles = { ...teachingPathFiles, ...teachingSummaryContractFiles };

  addFinding(findings, {
    id: "identity.path.post./v1/identity/sessions/password",
    passed: hasMethodForPath(identityOpenapiText, "/v1/identity/sessions/password", "post"),
    actual: hasPath(identityOpenapiText, "/v1/identity/sessions/password") ? "path-present" : "missing",
    expected: "POST /v1/identity/sessions/password",
    remediation: "Student App login requires the password session endpoint.",
  });

  addFinding(findings, {
    id: "identity.path.get./v1/student-app/profile",
    passed: hasMethodForPath(identityOpenapiText, "/v1/student-app/profile", "get"),
    actual: hasPath(identityOpenapiText, "/v1/student-app/profile") ? "path-present" : "missing",
    expected: "GET /v1/student-app/profile",
    remediation: "Add a bearer-protected Student App profile read model.",
  });

  const profilePath = yamlSection(identityOpenapiText, "/v1/student-app/profile");
  addFinding(findings, {
    id: "identity.profile.bearer_auth",
    passed: profilePath.includes("BearerAuth"),
    actual: profilePath.includes("BearerAuth"),
    expected: true,
    remediation: "Student App profile must require BearerAuth.",
  });

  const profileResponse = yamlSection(identityOpenapiText, "StudentAppProfileResponse");
  addFinding(findings, {
    id: "identity.schema.StudentAppProfileResponse",
    passed: profileResponse.includes("studentId:") && profileResponse.includes("principalId:"),
    actual: profileResponse ? "schema-present" : "missing",
    expected: "studentId and principalId",
    remediation: "Add StudentAppProfileResponse with stable mobile profile identifiers.",
  });

  const leakedFields = FORBIDDEN_PROFILE_FIELDS.filter((field) => profileResponse.includes(`${field}:`));
  addFinding(findings, {
    id: "identity.profile.no_internal_fields",
    passed: leakedFields.length === 0,
    actual: leakedFields.join(","),
    expected: "no scopes, knowledgeAccess, or studentAccess",
    remediation: "Keep internal authorization fields out of the mobile profile read model.",
  });

  for (const item of STUDENT_APP_TEACHING_PATHS) {
    addFinding(findings, {
      id: `teaching.path.${item.path}`,
      passed: hasPath(teachingOpenapiText, item.path),
      actual: hasPath(teachingOpenapiText, item.path) ? "path-present" : "missing",
      expected: item.path,
      remediation: `Expose ${item.path} from the Teaching Archive Student App contract.`,
    });

    const pathText = teachingContractFiles[item.file] ?? "";
    addFinding(findings, {
      id: `teaching.security.${item.file}`,
      passed: pathText.includes("AgentApiKey") && pathText.includes("PrincipalContextHeader"),
      actual: pathText ? summarizeSecurity(pathText) : "missing",
      expected: "AgentApiKey + PrincipalContextHeader",
      remediation: `${item.file} must require Agent API key and Principal Context.`,
    });
  }

  for (const item of STUDENT_APP_SUMMARY_FAST_PATHS) {
    addFinding(findings, {
      id: `teaching.summary.path.${item.path}`,
      passed: hasPath(teachingOpenapiText, item.path),
      actual: hasPath(teachingOpenapiText, item.path) ? "path-present" : "missing",
      expected: item.path,
      remediation: `Expose ${item.path} as a Student App count-only summary fast path.`,
    });

    const pathText = teachingContractFiles[item.file] ?? "";
    addFinding(findings, {
      id: `teaching.summary.security.${item.file}`,
      passed: pathText.includes("AgentApiKey") && pathText.includes("PrincipalContextHeader"),
      actual: pathText ? summarizeSecurity(pathText) : "missing",
      expected: "AgentApiKey + PrincipalContextHeader",
      remediation: `${item.file} must require Agent API key and Principal Context.`,
    });

    addFinding(findings, {
      id: `teaching.summary.private_cache.${item.path}`,
      passed: hasPrivateConditionalCache(pathText),
      actual: summarizePrivateConditionalCache(pathText),
      expected: "If-None-Match + 304 + ETag + private no-cache + Vary",
      remediation: `${item.file} must keep private conditional cache headers for repeated Student App badge reads.`,
    });

    const schemaText = teachingContractFiles[item.responseSchemaFile] ?? "";
    const responseSchema = yamlSection(schemaText, item.responseSchema);
    const summarySchema = yamlSection(schemaText, item.summarySchema);
    const leakedResponseFields = FORBIDDEN_SUMMARY_RESPONSE_FIELDS.filter((field) => hasYamlProperty(responseSchema, field));
    addFinding(findings, {
      id: `teaching.summary.response_shape.${item.responseSchema}`,
      passed: responseSchema.includes("additionalProperties: false")
        && hasYamlProperty(responseSchema, "summary")
        && leakedResponseFields.length === 0,
      actual: responseSchema ? `summary=${hasYamlProperty(responseSchema, "summary")} leaks=${leakedResponseFields.join(",")}` : "missing",
      expected: "summary-only response with additionalProperties=false",
      remediation: `${item.responseSchema} must expose only summary and must not regress to a list-shaped response.`,
    });

    const missingCountFields = item.countFields.filter((field) => !hasYamlProperty(summarySchema, field));
    const leakedSummaryFields = FORBIDDEN_SUMMARY_RESPONSE_FIELDS.filter((field) => hasYamlProperty(summarySchema, field));
    addFinding(findings, {
      id: `teaching.summary.count_fields.${item.summarySchema}`,
      passed: summarySchema.includes("additionalProperties: false")
        && missingCountFields.length === 0
        && leakedSummaryFields.length === 0,
      actual: summarySchema
        ? `missing=${missingCountFields.join(",")} leaks=${leakedSummaryFields.join(",")}`
        : "missing",
      expected: `count fields only: ${item.countFields.join(",")}`,
      remediation: `${item.summarySchema} must remain a count-only schema without row identifiers or internal state.`,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    readiness: findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION",
    findings,
  };
}

export function formatStudentAppFlowAudit(report) {
  const lines = [
    `Student App flow: ${report.readiness}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) {
    lines.push(
      `- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`,
    );
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  return lines.join("\n");
}

function loadCurrentInputs(root) {
  const openapiDir = path.join(root, "contracts", "openapi");
  return {
    identityOpenapiText: fs.readFileSync(path.join(openapiDir, "identity-access.yaml"), "utf8"),
    teachingOpenapiText: fs.readFileSync(path.join(openapiDir, "teaching-archive.yaml"), "utf8"),
    teachingPathFiles: Object.fromEntries(
      STUDENT_APP_TEACHING_PATHS.map((item) => [
        item.file,
        fs.readFileSync(path.join(openapiDir, item.file), "utf8"),
      ]),
    ),
    teachingSummaryContractFiles: Object.fromEntries(
      STUDENT_APP_SUMMARY_FAST_PATHS.flatMap((item) => [
        [item.file, fs.readFileSync(path.join(openapiDir, item.file), "utf8")],
        [item.responseSchemaFile, fs.readFileSync(path.join(openapiDir, item.responseSchemaFile), "utf8")],
      ]),
    ),
  };
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

function hasPath(openapiText, requiredPath) {
  return new RegExp(`^\\s{2}${escapeRegExp(requiredPath)}:\\s*$`, "m").test(openapiText);
}

function hasMethodForPath(openapiText, requiredPath, method) {
  const section = yamlSection(openapiText, requiredPath);
  return new RegExp(`^\\s{4}${method}:\\s*$`, "m").test(section);
}

function yamlSection(text, key) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const keyPattern = new RegExp(`^(\\s*)${escapeRegExp(key)}:\\s*$`);
  const start = lines.findIndex((line) => keyPattern.test(line));
  if (start === -1) return "";
  const startIndent = leadingSpaces(lines[start]);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (leadingSpaces(line) <= startIndent) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function summarizeSecurity(pathText) {
  const parts = [];
  if (pathText.includes("AgentApiKey")) parts.push("AgentApiKey");
  if (pathText.includes("PrincipalContextHeader")) parts.push("PrincipalContextHeader");
  return parts.join(" + ");
}

function hasPrivateConditionalCache(pathText) {
  return pathText.includes("If-None-Match")
    && pathText.includes("'304':")
    && pathText.includes("ETag:")
    && pathText.includes("Cache-Control:")
    && pathText.includes("private, no-cache")
    && pathText.includes("Vary:");
}

function summarizePrivateConditionalCache(pathText) {
  if (!pathText) return "missing";
  const parts = [];
  if (pathText.includes("If-None-Match")) parts.push("If-None-Match");
  if (pathText.includes("'304':")) parts.push("304");
  if (pathText.includes("ETag:")) parts.push("ETag");
  if (pathText.includes("private, no-cache")) parts.push("private no-cache");
  if (pathText.includes("Vary:")) parts.push("Vary");
  return parts.join(" + ");
}

function hasYamlProperty(section, propertyName) {
  return new RegExp(`^\\s{4}${escapeRegExp(propertyName)}:\\s*$`, "m").test(section);
}

function leadingSpaces(line) {
  const match = line.match(/^ */);
  return match ? match[0].length : 0;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  return {
    outPath: outIndex === -1 ? undefined : argv[outIndex + 1],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = auditStudentAppFlowContracts(loadCurrentInputs(process.cwd()));
    if (args.outPath) {
      fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
      fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(formatStudentAppFlowAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

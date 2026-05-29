import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_PATHS = [
  { path: "/v1/identity/sessions/password", method: "post" },
  { path: "/v1/identity/sessions/wechat", method: "post" },
  { path: "/v1/identity/sessions/wechat/callback", method: "post" },
  { path: "/v1/identity/sessions/refresh", method: "post" },
  { path: "/v1/identity/sessions/{sessionId}", method: "delete" },
  { path: "/v1/identity/principal", method: "get" },
  { path: "/v1/identity/remote-command-grants", method: "post" },
];

const REQUIRED_PRINCIPAL_FIELDS = [
  "principalId",
  "subjectType",
  "role",
  "entryPoint",
  "scopes",
  "knowledgeAccess",
  "studentAccess",
  "requiresHarnessApproval",
  "sessionId",
  "issuedAt",
  "expiresAt",
];

const REQUIRED_ROLES = ["TEACHER", "STUDENT", "ADMIN", "REMOTE_OPERATOR", "SERVICE"];
const REQUIRED_ENTRY_POINTS = [
  "DESKTOP_TEACHER",
  "DESKTOP_RESEARCH",
  "STUDENT_APP",
  "REMOTE_SOCIAL",
  "AGENT_INTERNAL",
];
const REQUIRED_SCOPES = [
  "IDENTITY_READ",
  "TEACHING_READ",
  "TEACHING_WRITE",
  "RESEARCH_READ",
  "RESEARCH_WRITE",
  "STUDENT_OWN_READ",
  "STUDENT_OWN_WRITE",
  "STUDENT_ASSIGNED_READ",
  "STUDENT_ARCHIVE_WRITE",
  "KNOWLEDGE_PUBLIC_READ",
  "KNOWLEDGE_PRIVATE_READ",
  "AGENT_COMMAND_SUBMIT",
  "HARNESS_APPROVE",
  "DEVICE_LOCAL_CONTROL",
  "ADMIN_SYSTEM",
];

const REQUIRED_PROFILES = [
  "teacher-desktop",
  "research-desktop",
  "student-app",
  "remote-social-command",
  "admin-desktop",
];

export function auditIdentityAccessContract(inputs) {
  const openapiText = inputs.openapiText;
  const principalSchema = inputs.principalSchema;
  const accessMatrix = inputs.accessMatrix;
  const findings = [];

  addFinding(findings, {
    id: "openapi.version",
    passed: /openapi:\s*3\.1\.0/.test(openapiText),
    actual: matchFirst(openapiText, /openapi:\s*([^\n]+)/),
    expected: "3.1.0",
    remediation: "Keep identity-access.yaml on OpenAPI 3.1.0.",
  });

  for (const required of REQUIRED_PATHS) {
    addFinding(findings, {
      id: `openapi.path.${required.method}.${required.path}`,
      passed: hasMethodForPath(openapiText, required.path, required.method),
      actual: hasPath(openapiText, required.path) ? "path-present" : "missing",
      expected: `${required.method.toUpperCase()} ${required.path}`,
      remediation: `Add ${required.method.toUpperCase()} ${required.path} to the identity contract.`,
    });
  }

  for (const schemaName of [
    "PasswordSessionRequest",
    "SessionResponse",
    "PrincipalContext",
    "RemoteCommandGrantRequest",
    "RemoteCommandGrantResponse",
    "ErrorResponse",
  ]) {
    addFinding(findings, {
      id: `openapi.schema.${schemaName}`,
      passed: hasYamlKey(openapiText, schemaName),
      actual: hasYamlKey(openapiText, schemaName),
      expected: true,
      remediation: `Add components.schemas.${schemaName} to identity-access.yaml.`,
    });
  }

  addFinding(findings, {
    id: "openapi.session_response.principal_context",
    passed: yamlSection(openapiText, "SessionResponse").includes("#/components/schemas/PrincipalContext"),
    actual: yamlSection(openapiText, "SessionResponse").includes("#/components/schemas/PrincipalContext"),
    expected: true,
    remediation: "SessionResponse must embed PrincipalContext so clients receive scopes with tokens.",
  });
  addFinding(findings, {
    id: "openapi.remote_grant.principal_context",
    passed: yamlSection(openapiText, "RemoteCommandGrantResponse").includes("#/components/schemas/PrincipalContext"),
    actual: yamlSection(openapiText, "RemoteCommandGrantResponse").includes("#/components/schemas/PrincipalContext"),
    expected: true,
    remediation: "RemoteCommandGrantResponse must include PrincipalContext for Agent Harness policy.",
  });
  addFinding(findings, {
    id: "openapi.security.bearer",
    passed: openapiText.includes("BearerAuth:"),
    actual: openapiText.includes("BearerAuth:"),
    expected: true,
    remediation: "Add BearerAuth security scheme.",
  });
  addFinding(findings, {
    id: "openapi.security.channel_signature",
    passed: openapiText.includes("ChannelSignature:"),
    actual: openapiText.includes("ChannelSignature:"),
    expected: true,
    remediation: "Add ChannelSignature security scheme for mobile/social command grants.",
  });

  const principalRequired = principalSchema.required ?? [];
  for (const field of REQUIRED_PRINCIPAL_FIELDS) {
    addFinding(findings, {
      id: `principal.required.${field}`,
      passed: principalRequired.includes(field),
      actual: principalRequired.includes(field),
      expected: true,
      remediation: `PrincipalContext requires ${field}.`,
    });
  }

  const principalRoleEnum = principalSchema.properties?.role?.enum ?? [];
  for (const role of REQUIRED_ROLES) {
    addFinding(findings, {
      id: `principal.role.${role}`,
      passed: principalRoleEnum.includes(role),
      actual: principalRoleEnum.join(","),
      expected: role,
      remediation: `PrincipalContext role enum must include ${role}.`,
    });
  }

  const entryPointEnum = principalSchema.properties?.entryPoint?.enum ?? [];
  for (const entryPoint of REQUIRED_ENTRY_POINTS) {
    addFinding(findings, {
      id: `principal.entry_point.${entryPoint}`,
      passed: entryPointEnum.includes(entryPoint),
      actual: entryPointEnum.join(","),
      expected: entryPoint,
      remediation: `PrincipalContext entryPoint enum must include ${entryPoint}.`,
    });
  }

  const scopeEnum = principalSchema.properties?.scopes?.items?.enum ?? [];
  for (const scope of REQUIRED_SCOPES) {
    addFinding(findings, {
      id: `principal.scope.${scope}`,
      passed: scopeEnum.includes(scope),
      actual: scopeEnum.includes(scope),
      expected: true,
      remediation: `PrincipalContext scopes enum must include ${scope}.`,
    });
  }

  const profiles = new Map((accessMatrix.profiles ?? []).map((profile) => [profile.name, profile]));
  for (const name of REQUIRED_PROFILES) {
    addFinding(findings, {
      id: `matrix.profile.${name}`,
      passed: profiles.has(name),
      actual: profiles.has(name),
      expected: true,
      remediation: `Add access matrix profile ${name}.`,
    });
  }

  for (const profile of accessMatrix.profiles ?? []) {
    const unknownScopes = (profile.scopes ?? []).filter((scope) => !scopeEnum.includes(scope));
    addFinding(findings, {
      id: `matrix.${profile.name}.known_scopes`,
      passed: unknownScopes.length === 0,
      actual: unknownScopes.join(","),
      expected: "all scopes declared in PrincipalContext",
      remediation: `Remove unknown scopes from access matrix profile ${profile.name}.`,
    });
  }

  const studentProfile = profiles.get("student-app");
  addFinding(findings, {
    id: "matrix.student.no_private_knowledge_scope",
    passed: studentProfile ? !(studentProfile.scopes ?? []).includes("KNOWLEDGE_PRIVATE_READ") : false,
    actual: studentProfile?.scopes ?? null,
    expected: "no KNOWLEDGE_PRIVATE_READ",
    remediation: "Student app must use STUDENT_OWN_READ/WRITE and public knowledge, not global private knowledge.",
  });
  addFinding(findings, {
    id: "matrix.student.own_student_access",
    passed: studentProfile?.studentAccess?.mode === "OWN",
    actual: studentProfile?.studentAccess?.mode,
    expected: "OWN",
    remediation: "Student app can only read/write its own archive.",
  });
  addFinding(findings, {
    id: "matrix.student.private_knowledge_none",
    passed: studentProfile?.knowledgeAccess?.private === "NONE",
    actual: studentProfile?.knowledgeAccess?.private,
    expected: "NONE",
    remediation: "Student app must not receive private knowledge access by default.",
  });

  const remoteProfile = profiles.get("remote-social-command");
  addFinding(findings, {
    id: "matrix.remote.requires_harness_approval",
    passed: remoteProfile?.requiresHarnessApproval === true,
    actual: remoteProfile?.requiresHarnessApproval,
    expected: true,
    remediation: "Remote social command grants must require Harness approval before execution.",
  });
  addFinding(findings, {
    id: "matrix.remote.no_local_control_scope",
    passed: remoteProfile ? !(remoteProfile.scopes ?? []).includes("DEVICE_LOCAL_CONTROL") : false,
    actual: remoteProfile?.scopes ?? null,
    expected: "no DEVICE_LOCAL_CONTROL",
    remediation: "Remote social entry can submit commands but must not directly control local devices.",
  });
  addFinding(findings, {
    id: "matrix.remote.command_submit_scope",
    passed: remoteProfile ? (remoteProfile.scopes ?? []).includes("AGENT_COMMAND_SUBMIT") : false,
    actual: remoteProfile?.scopes ?? null,
    expected: "AGENT_COMMAND_SUBMIT",
    remediation: "Remote social entry needs AGENT_COMMAND_SUBMIT so commands can enter the Harness queue.",
  });

  const adminProfile = profiles.get("admin-desktop");
  addFinding(findings, {
    id: "matrix.admin.can_approve_harness",
    passed: adminProfile ? (adminProfile.scopes ?? []).includes("HARNESS_APPROVE") : false,
    actual: adminProfile?.scopes ?? null,
    expected: "HARNESS_APPROVE",
    remediation: "Admin profile must include HARNESS_APPROVE for high-risk Agent Harness actions.",
  });

  return {
    generatedAt: new Date().toISOString(),
    readiness: findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION",
    findings,
  };
}

export function formatIdentityAccessContractAudit(report) {
  const lines = [
    `Identity access contract: ${report.readiness}`,
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

export function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function hasYamlKey(openapiText, key) {
  return new RegExp(`^\\s{4}${escapeRegExp(key)}:\\s*$`, "m").test(openapiText)
    || new RegExp(`^\\s{2}${escapeRegExp(key)}:\\s*$`, "m").test(openapiText);
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

function leadingSpaces(line) {
  const match = line.match(/^ */);
  return match ? match[0].length : 0;
}

function matchFirst(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1].trim() : undefined;
}

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.join(",")}]`;
  return String(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseArgs(argv) {
  const openapiIndex = argv.indexOf("--openapi");
  const principalIndex = argv.indexOf("--principal-schema");
  const matrixIndex = argv.indexOf("--access-matrix");
  const outIndex = argv.indexOf("--out");
  return {
    openapiPath: openapiIndex === -1 ? undefined : argv[openapiIndex + 1],
    principalSchemaPath: principalIndex === -1 ? undefined : argv[principalIndex + 1],
    accessMatrixPath: matrixIndex === -1 ? undefined : argv[matrixIndex + 1],
    outPath: outIndex === -1 ? undefined : argv[outIndex + 1],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (!args.openapiPath || !args.principalSchemaPath || !args.accessMatrixPath) {
      throw new Error("usage: node tools/identity-access-contract-audit.mjs --openapi <yaml> --principal-schema <json> --access-matrix <json> [--out <report-json>]");
    }
    const report = auditIdentityAccessContract({
      openapiText: fs.readFileSync(args.openapiPath, "utf8"),
      principalSchema: loadJSON(args.principalSchemaPath),
      accessMatrix: loadJSON(args.accessMatrixPath),
    });
    if (args.outPath) {
      fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
      fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(formatIdentityAccessContractAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

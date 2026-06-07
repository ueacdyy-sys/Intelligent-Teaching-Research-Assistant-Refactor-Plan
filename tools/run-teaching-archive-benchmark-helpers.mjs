import {
  maskSensitive,
  maxFinite,
  minFinite,
  numberOrNull,
  numberOrZero,
  parseInteger,
  round,
} from "./benchmark-runner-utils.mjs";
import { gatewayBaseUrl } from "./teaching-archive-benchmark-gateway-runtime.mjs";

export function phaseErrors(phases) {
  return Object.values(phases).reduce((total, phase) => total + phase.errors, 0);
}

export function addRuntimeDiagnosticsToReport(report, diagnostics = {}) {
  const enriched = { ...report };
  if (diagnostics.gatewayDatabaseDiagnostics) enriched.gatewayDatabaseDiagnostics = diagnostics.gatewayDatabaseDiagnostics;
  if (diagnostics.gatewayCommandLogDiagnostics) enriched.gatewayCommandLogDiagnostics = diagnostics.gatewayCommandLogDiagnostics;
  if (diagnostics.pgbouncerDiagnostics) enriched.pgbouncerDiagnostics = diagnostics.pgbouncerDiagnostics;
  if (diagnostics.postgresDiagnostics) enriched.postgresDiagnostics = diagnostics.postgresDiagnostics;
  return enriched;
}

export function addDiagnosticsSnapshot(current, name, snapshot) {
  if (!snapshot) return current;
  return {
    ...(current ?? {}),
    [name]: snapshot,
  };
}

export async function stopDiagnosticsTimeline(timeline) {
  if (!timeline) return undefined;
  return timeline.stop();
}

export function principalHeader(principal) {
  return Buffer.from(JSON.stringify(principal)).toString("base64url");
}

export function teacherPrincipal(now = new Date()) {
  return {
    principalId: "teacher_perf",
    subjectType: "USER",
    role: "TEACHER",
    entryPoint: "DESKTOP_TEACHER",
    scopes: ["TEACHING_READ", "TEACHING_WRITE", "STUDENT_ASSIGNED_READ", "STUDENT_ARCHIVE_WRITE"],
    knowledgeAccess: { public: true, private: "ASSIGNED" },
    studentAccess: { mode: "ASSIGNED", studentIds: ["student_perf"] },
    requiresHarnessApproval: false,
    sessionId: "sess_teacher_perf",
    issuedAt: new Date(now.getTime() - 60000).toISOString(),
    expiresAt: new Date(now.getTime() + 3600000).toISOString(),
  };
}

export function studentPrincipal(now = new Date()) {
  return {
    principalId: "student_perf",
    subjectType: "USER",
    role: "STUDENT",
    entryPoint: "STUDENT_APP",
    scopes: ["TEACHING_READ", "STUDENT_OWN_READ", "STUDENT_OWN_WRITE"],
    knowledgeAccess: { public: true, private: "NONE" },
    studentAccess: { mode: "OWN", studentIds: ["student_perf"] },
    requiresHarnessApproval: false,
    sessionId: "sess_student_perf",
    issuedAt: new Date(now.getTime() - 60000).toISOString(),
    expiresAt: new Date(now.getTime() + 3600000).toISOString(),
  };
}

export async function runCreateArchiveItemPhase(options, fetchFn) {
  const items = [];
  const phase = await runPhase(options, "createArchiveItem", async (index) => {
    const response = await requestJson(fetchFn, `${gatewayBaseUrl(options, index)}/v1/teaching/archive-items`, {
      method: "POST",
      headers: requestHeaders(options.agentApiKey, teacherPrincipal()),
      body: JSON.stringify({
        ownerType: "TEACHING",
        materialType: "QUIZ",
        title: `Mixed workload quiz ${Date.now()} ${index}`,
        source: "TEACHER_UPLOAD",
        contentRef: `local://perf/teaching/quizzes/${Date.now()}-${index}.json`,
        tags: ["performance", "mixed-workload"],
        analysisIntents: ["AI_GRADING", "ARCHIVE_ONLY"],
      }),
    }, options);
    items.push(response.body.id);
    return response;
  });
  return { ...phase, items };
}

export async function runCreateQuizSubmissionPhase(options, fetchFn, archiveItemIds) {
  if (archiveItemIds.length === 0) {
    return {
      operations: parseInteger(options.operations),
      errors: parseInteger(options.operations),
      firstError: "createArchiveItem produced no archive item ids",
      latencies: [],
      durationMs: 0,
    };
  }
  return runPhase(options, "createQuizSubmission", async (index) => {
    const archiveItemId = archiveItemIds[index % archiveItemIds.length];
    return requestJson(fetchFn, `${gatewayBaseUrl(options, index)}/v1/teaching/archive-items/${archiveItemId}/quiz-submissions`, {
      method: "POST",
      headers: requestHeaders(options.agentApiKey, studentPrincipal()),
      body: JSON.stringify({
        answerRef: `local://perf/student_perf/answers/${Date.now()}-${index}.json`,
      }),
    }, options);
  });
}

export async function runListArchiveItemsPhase(options, fetchFn) {
  return runPhase(options, "listArchiveItems", async (index) => {
    return requestJson(
      fetchFn,
      `${gatewayBaseUrl(options, index)}/v1/teaching/archive-items?ownerType=TEACHING&materialType=QUIZ&pageSize=10`,
      {
        method: "GET",
        headers: requestHeaders(options.agentApiKey, teacherPrincipal()),
      },
      options,
    );
  });
}

export function summarizePhase(phase) {
  const report = {
    operations: phase.operations,
    errors: phase.errors,
    firstError: phase.firstError || undefined,
    rps: phase.durationMs > 0 ? round((phase.operations - phase.errors) / (phase.durationMs / 1000), 2) : 0,
    latencyMs: summarizeLatencies(phase.latencies),
  };
  const serverTimingBreakdown = observedTimings(phase.serverTimings ?? []);
  if (Object.keys(serverTimingBreakdown).length > 0) {
    report.serverTimingBreakdownMs = {};
    report.serverTimingBreakdownSamples = {};
    for (const [name, values] of Object.entries(serverTimingBreakdown)) {
      report.serverTimingBreakdownMs[name] = summarizeLatencies(values);
      report.serverTimingBreakdownSamples[name] = values.length;
    }
    if (serverTimingBreakdown.app?.length > 0) {
      report.serverTimingMs = summarizeLatencies(serverTimingBreakdown.app);
      report.serverTimingSamples = serverTimingBreakdown.app.length;
    }
  }
  return report;
}

export function summarizeBenchmark(phases) {
  const values = Object.values(phases);
  return {
    totalErrors: values.reduce((total, phase) => total + numberOrZero(phase.errors), 0),
    maxP95Ms: maxFinite(values.map((phase) => numberOrNull(phase.latencyMs?.p95))),
    maxP99Ms: maxFinite(values.map((phase) => numberOrNull(phase.latencyMs?.p99))),
    minRps: minFinite(values.map((phase) => numberOrNull(phase.rps))),
  };
}

async function runPhase(options, _name, operation) {
  const totalOperations = parseInteger(options.operations);
  const concurrency = parseInteger(options.concurrency);
  const latencies = [];
  const serverTimings = [];
  let nextIndex = 0;
  let errors = 0;
  let firstError = "";
  const startedAt = Date.now();

  async function worker() {
    while (nextIndex < totalOperations) {
      const index = nextIndex;
      nextIndex += 1;
      const operationStartedAt = Date.now();
      try {
        const result = await operation(index);
        if (result?.serverTimings && Object.keys(result.serverTimings).length > 0) {
          serverTimings.push(result.serverTimings);
        }
      } catch (error) {
        errors += 1;
        if (!firstError) firstError = maskSensitive(error instanceof Error ? error.message : String(error));
      } finally {
        latencies.push(Date.now() - operationStartedAt);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, totalOperations) }, () => worker()));
  return {
    operations: totalOperations,
    errors,
    firstError,
    latencies,
    serverTimings,
    durationMs: Date.now() - startedAt,
  };
}

async function requestJson(fetchFn, url, init, options) {
  const response = await fetchFn(url, {
    ...init,
    signal: AbortSignal.timeout(parseInteger(options.timeoutMs)),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init.method} ${url} failed ${response.status}: ${text}`);
  }
  return {
    body: text.trim() ? JSON.parse(text) : {},
    serverTimings: parseServerTimingDurations(response.headers?.get?.("Server-Timing") ?? ""),
  };
}

function requestHeaders(agentApiKey, principal) {
  return {
    "Content-Type": "application/json",
    "X-Agent-Api-Key": agentApiKey,
    "X-Principal-Context": principalHeader(principal),
  };
}

function observedTimings(values) {
  const observed = {};
  for (const metrics of values) {
    for (const [name, durationMs] of Object.entries(metrics)) {
      if (!Number.isFinite(durationMs)) continue;
      observed[name] ??= [];
      observed[name].push(durationMs);
    }
  }
  return observed;
}

function parseServerTimingDurations(value) {
  const timings = {};
  for (const part of value.split(",")) {
    const [rawName, ...attributes] = part.trim().split(";");
    const name = rawName.trim();
    if (!name) continue;
    const durationAttribute = attributes.find((attribute) => attribute.trim().startsWith("dur="));
    if (!durationAttribute) continue;
    const durationMs = Number.parseFloat(durationAttribute.trim().slice("dur=".length));
    if (Number.isFinite(durationMs)) timings[name] = durationMs;
  }
  return timings;
}

function summarizeLatencies(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return { min: null, p50: null, p95: null, p99: null, max: null };
  return {
    min: sorted[0],
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.at(-1),
  };
}

function percentile(sorted, percentileValue) {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
  return sorted[index];
}

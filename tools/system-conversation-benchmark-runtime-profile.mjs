export function systemConversationBenchmarkRuntime(options) {
  const runtime = String(options.conversationBenchmarkRuntime ?? "").toLowerCase();
  if (["local", "docker", "wsl"].includes(runtime)) return runtime;
  throw new Error("conversation-benchmark-runtime must be local, docker, or wsl");
}

export function buildSystemConversationBenchmarkRuntimeProfile(options) {
  const runtime = systemConversationBenchmarkRuntime(options);
  return {
    runtime,
    executor: systemConversationBenchmarkRuntimeExecutor(runtime),
    dockerImage: runtime === "docker" ? options.conversationBenchmarkDockerImage : null,
    dockerHostAlias: runtime === "docker" ? options.conversationBenchmarkDockerHost : null,
    wslDistro: runtime === "wsl" ? options.conversationBenchmarkWslDistro : null,
    wslHostAlias: runtime === "wsl" ? options.conversationBenchmarkWslHost : null,
    wslWorkspace: runtime === "wsl" ? optionOrFallback(options.conversationBenchmarkWslWorkspace, null) : null,
  };
}

function systemConversationBenchmarkRuntimeExecutor(runtime) {
  if (runtime === "docker") return "DOCKER_GO";
  if (runtime === "wsl") return "WSL_GO";
  return "LOCAL_GO";
}

function optionOrFallback(value, fallback) {
  return String(value ?? "").trim() === "" ? fallback : value;
}

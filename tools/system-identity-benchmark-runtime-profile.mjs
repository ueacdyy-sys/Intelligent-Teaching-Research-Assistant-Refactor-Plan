export function systemIdentityBenchmarkRuntime(options) {
  const runtime = String(options.identityBenchmarkRuntime ?? "").toLowerCase();
  if (["local", "docker", "wsl"].includes(runtime)) return runtime;
  throw new Error("identity-benchmark-runtime must be local, docker, or wsl");
}

export function buildSystemIdentityBenchmarkRuntimeProfile(options) {
  const runtime = systemIdentityBenchmarkRuntime(options);
  return {
    runtime,
    executor: systemIdentityBenchmarkRuntimeExecutor(runtime),
    dockerImage: runtime === "docker" ? options.identityBenchmarkDockerImage : null,
    dockerHostAlias: runtime === "docker" ? options.identityBenchmarkDockerHost : null,
    wslDistro: runtime === "wsl" ? options.identityBenchmarkWslDistro : null,
    wslHostAlias: runtime === "wsl" ? options.identityBenchmarkWslHost : null,
    wslWorkspace: runtime === "wsl" ? optionOrFallback(options.identityBenchmarkWslWorkspace, null) : null,
  };
}

export function systemIdentityBenchmarkRuntimeArgs(options) {
  return [
    "--benchmark-runtime",
    systemIdentityBenchmarkRuntime(options),
    "--benchmark-docker-image",
    options.identityBenchmarkDockerImage,
    "--benchmark-docker-host",
    options.identityBenchmarkDockerHost,
    "--benchmark-wsl-distro",
    options.identityBenchmarkWslDistro,
    "--benchmark-wsl-host",
    options.identityBenchmarkWslHost,
    "--benchmark-wsl-workspace",
    options.identityBenchmarkWslWorkspace,
  ];
}

function systemIdentityBenchmarkRuntimeExecutor(runtime) {
  if (runtime === "docker") return "DOCKER_GO";
  if (runtime === "wsl") return "WSL_GO";
  return "LOCAL_GO";
}

function optionOrFallback(value, fallback) {
  return String(value ?? "").trim() === "" ? fallback : value;
}

export function systemIdentityBenchmarkRuntime(options) {
  const runtime = String(options.identityBenchmarkRuntime ?? "").toLowerCase();
  if (["local", "docker"].includes(runtime)) return runtime;
  throw new Error("identity-benchmark-runtime must be local or docker");
}

export function buildSystemIdentityBenchmarkRuntimeProfile(options) {
  const runtime = systemIdentityBenchmarkRuntime(options);
  return {
    runtime,
    executor: runtime === "docker" ? "DOCKER_GO" : "LOCAL_GO",
    dockerImage: runtime === "docker" ? options.identityBenchmarkDockerImage : null,
    dockerHostAlias: runtime === "docker" ? options.identityBenchmarkDockerHost : null,
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
  ];
}

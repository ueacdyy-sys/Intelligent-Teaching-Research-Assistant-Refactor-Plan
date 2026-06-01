export const benchmarkRuntimeDefaults = {
  benchmarkRuntime: "local",
  benchmarkDockerImage: "golang:1.26-alpine",
  benchmarkDockerHost: "host.docker.internal",
  benchmarkWslDistro: "Ubuntu",
  benchmarkWslHost: "host.docker.internal",
  benchmarkWslWorkspace: "",
};

export function applyBenchmarkRuntimeArg(parsed, key, value) {
  if (key === "--benchmark-runtime") parsed.benchmarkRuntime = value;
  else if (key === "--benchmark-docker-image") parsed.benchmarkDockerImage = value;
  else if (key === "--benchmark-docker-host") parsed.benchmarkDockerHost = value;
  else if (key === "--benchmark-wsl-distro") parsed.benchmarkWslDistro = value;
  else if (key === "--benchmark-wsl-host") parsed.benchmarkWslHost = value;
  else if (key === "--benchmark-wsl-workspace") parsed.benchmarkWslWorkspace = value;
  else return false;
  return true;
}

export function buildBenchmarkRuntimeCommand(options, goArgs, root = process.cwd()) {
  const runtime = benchmarkRuntime(options);
  if (runtime === "local") return ["go", ...goArgs];
  if (runtime === "wsl") return buildWslBenchmarkCommand(options, goArgs, root);
  return [
    "docker",
    "run",
    "--rm",
    "-v",
    `${root}:/workspace`,
    "-w",
    "/workspace",
    options.benchmarkDockerImage,
    "go",
    ...goArgs,
  ];
}

export function benchmarkRuntimeProfile(options, baseUrls, maskURL = (value) => value) {
  const runtime = benchmarkRuntime(options);
  const targetBaseUrls = benchmarkTargetBaseUrls(options, baseUrls).map(maskURL);
  if (runtime === "docker") {
    return {
      executor: "DOCKER_GO",
      dockerImage: options.benchmarkDockerImage,
      dockerHostAlias: options.benchmarkDockerHost,
      targetBaseUrls,
    };
  }
  if (runtime === "wsl") {
    return {
      executor: "WSL_GO",
      wslDistro: options.benchmarkWslDistro,
      wslHostAlias: options.benchmarkWslHost,
      wslWorkspace: benchmarkWslWorkspace(options, process.cwd()),
      targetBaseUrls,
    };
  }
  return {
    executor: "LOCAL_GO",
    dockerImage: null,
    dockerHostAlias: null,
    targetBaseUrls,
  };
}

export function benchmarkTargetBaseUrls(options, baseUrls) {
  const runtime = benchmarkRuntime(options);
  if (runtime === "docker") {
    return baseUrls.map((baseUrl) => hostReachableBaseUrl(baseUrl, options.benchmarkDockerHost));
  }
  if (runtime === "wsl") {
    return baseUrls.map((baseUrl) => hostReachableBaseUrl(baseUrl, options.benchmarkWslHost));
  }
  return baseUrls.map(trimURL);
}

function buildWslBenchmarkCommand(options, goArgs, root) {
  const workspace = benchmarkWslWorkspace(options, root);
  return [
    "wsl.exe",
    "-d",
    options.benchmarkWslDistro,
    "--",
    "bash",
    "-lc",
    `cd ${shellQuote(workspace)} && go ${goArgs.map(shellQuote).join(" ")}`,
  ];
}

function benchmarkWslWorkspace(options, root) {
  const configured = String(options.benchmarkWslWorkspace ?? "").trim();
  if (configured) return configured;
  return windowsPathToWslPath(root);
}

function windowsPathToWslPath(value) {
  const pathValue = String(value).replaceAll("\\", "/");
  const driveMatch = /^([A-Za-z]):\/(.*)$/u.exec(pathValue);
  if (!driveMatch) return pathValue;
  return `/mnt/${driveMatch[1].toLowerCase()}/${driveMatch[2]}`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function hostReachableBaseUrl(value, hostAlias) {
  const parsed = new URL(value);
  if (["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    parsed.hostname = hostAlias;
  }
  return trimURL(parsed.toString());
}

function benchmarkRuntime(options) {
  const runtime = String(options.benchmarkRuntime ?? "").toLowerCase();
  if (runtime === "docker" || runtime === "wsl") return runtime;
  return "local";
}

function trimURL(value) {
  return String(value).replace(/\/$/u, "");
}

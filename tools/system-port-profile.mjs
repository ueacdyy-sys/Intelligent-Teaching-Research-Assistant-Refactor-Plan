export function portRange(urlText, count, name) {
  const start = portFromUrl(urlText, name);
  return portSequence(start, count, name);
}

export function portSequence(startPort, count, name) {
  const start = portFromValue(startPort, name);
  return Array.from({ length: count }, (_entry, index) => start + index);
}

function portFromValue(value, name) {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`${name} must include an explicit positive port`);
  }
  return port;
}

function portFromUrl(urlText, name) {
  try {
    const url = new URL(urlText);
    const port = Number.parseInt(url.port, 10);
    if (!Number.isInteger(port) || port <= 0) throw new Error("missing explicit positive port");
    return port;
  } catch (error) {
    throw new Error(`${name} must include an explicit positive port: ${error.message}`);
  }
}

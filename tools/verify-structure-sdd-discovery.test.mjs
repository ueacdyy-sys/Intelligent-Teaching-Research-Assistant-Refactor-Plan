import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  discoverSddDocuments,
  verifySddDocuments,
} from "./verify-structure.mjs";

function tempRoot(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

function writeSdd(root, file, body) {
  const sddDir = path.join(root, "docs", "sdd");
  fs.mkdirSync(sddDir, { recursive: true });
  fs.writeFileSync(path.join(sddDir, file), body);
}

function traceSdd() {
  return [
    "# SDD 0000: Root Requirements Trace",
    "",
    "## Authoritative Source",
    "root",
    "",
    "## Product Capabilities",
    "capabilities",
    "",
    "## Non-Negotiable Invariants",
    "invariants",
    "",
  ].join("\n");
}

function implementationSdd(title, contractHeading = "## Contracts") {
  return [
    `# ${title}`,
    "",
    "## Problem",
    "problem",
    "",
    "## Scope",
    "scope",
    "",
    contractHeading,
    "contracts",
    "",
    "## Acceptance Criteria",
    "acceptance",
    "",
    "## Rollback",
    "rollback",
    "",
  ].join("\n");
}

describe("verify-structure SDD discovery", () => {
  it("discovers SDD documents in numeric order", () => {
    const root = tempRoot("verify-sdd-discover");
    writeSdd(root, "0001-first.md", implementationSdd("SDD 0001: First", "## Contract"));
    writeSdd(root, "0000-root.md", traceSdd());

    const docs = discoverSddDocuments(root);

    assert.deepEqual(docs.map((doc) => doc.id), ["0000", "0001"]);
  });

  it("reports numeric gaps", () => {
    const root = tempRoot("verify-sdd-gap");
    writeSdd(root, "0000-root.md", traceSdd());
    writeSdd(root, "0002-missing-one.md", implementationSdd("SDD 0002: Missing One"));

    const findings = verifySddDocuments(root);

    assert(findings.some((finding) => finding.message.includes("missing SDD 0001")));
  });

  it("accepts SDD 0000 trace headings and implementation Contract variants", () => {
    const root = tempRoot("verify-sdd-headings");
    writeSdd(root, "0000-root.md", traceSdd());
    writeSdd(root, "0001-first.md", implementationSdd("SDD 0001: First", "## Contract"));
    writeSdd(root, "0002-second.md", implementationSdd("SDD 0002: Second", "## Contracts"));

    const findings = verifySddDocuments(root);

    assert.deepEqual(findings, []);
  });

  it("reports implementation SDDs missing rollback headings", () => {
    const root = tempRoot("verify-sdd-missing-rollback");
    writeSdd(root, "0000-root.md", traceSdd());
    writeSdd(
      root,
      "0001-no-rollback.md",
      implementationSdd("SDD 0001: No Rollback").replace("## Rollback", "## Removed"),
    );

    const findings = verifySddDocuments(root);

    assert(findings.some((finding) => finding.message.includes("SDD 0001 missing heading: ## Rollback")));
  });
});

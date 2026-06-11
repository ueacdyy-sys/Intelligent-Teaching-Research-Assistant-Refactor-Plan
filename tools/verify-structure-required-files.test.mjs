import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import { requiredCoreFiles } from "./verify-structure-required-files.mjs";

describe("verify-structure required core files registry", () => {
  it("keeps the extracted registry unique and normalized", () => {
    assert(requiredCoreFiles.length > 300);
    assert.equal(new Set(requiredCoreFiles).size, requiredCoreFiles.length);
    assert(requiredCoreFiles.every((file) => !file.startsWith("/") && !file.includes("\\")));
  });

  it("keeps the verifier registry slice under structure verification", () => {
    assert(requiredCoreFiles.includes("docs/sdd/0365-structure-verifier-required-file-registry.md"));
    assert(requiredCoreFiles.includes("tools/verify-structure-required-files.mjs"));
    assert(requiredCoreFiles.includes("tools/verify-structure-required-files.test.mjs"));
  });

  it("keeps the legacy static audit hook in sync with the registry", () => {
    const verifierSource = fs.readFileSync(new URL("./verify-structure.mjs", import.meta.url), "utf8");

    for (const file of requiredCoreFiles) {
      assert(verifierSource.includes(file), `verify-structure static audit hook missing ${file}`);
    }
  });
});

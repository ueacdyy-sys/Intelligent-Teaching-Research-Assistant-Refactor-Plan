import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const contractPath = path.join("contracts", "sql", "teaching-archive.sql");

describe("Teaching Archive SQL contract", () => {
  it("drops redundant archive item write indexes while retaining covered page indexes", () => {
    const sql = fs.readFileSync(contractPath, "utf8");

    for (const indexName of [
      "idx_teaching_archive_items_student_created",
      "idx_teaching_archive_items_owner_created",
      "idx_teaching_archive_items_material_created",
    ]) {
      assert(
        sql.includes(`DROP INDEX IF EXISTS ${indexName}`),
        `SQL contract must drop redundant write-amplifying index ${indexName}`,
      );
      assert(
        !sql.includes(`CREATE INDEX IF NOT EXISTS ${indexName}`),
        `SQL contract must not recreate redundant write-amplifying index ${indexName}`,
      );
    }

    for (const indexName of [
      "idx_teaching_archive_items_created_page",
      "idx_teaching_archive_items_student_page",
      "idx_teaching_archive_items_owner_page",
      "idx_teaching_archive_items_material_page",
    ]) {
      assert(
        sql.includes(`CREATE INDEX IF NOT EXISTS ${indexName}`),
        `SQL contract must retain covered page index ${indexName}`,
      );
    }
  });
});

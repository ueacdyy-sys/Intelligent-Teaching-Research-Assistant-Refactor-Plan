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

  it("documents the hot_write archive item index profile for write-pressure runs", () => {
    const sql = fs.readFileSync(contractPath, "utf8");
    const hotWriteSection = profileSection(sql, "hot_write");

    assert.match(sql, /archive_item_index_profile: full/u);
    assert.match(hotWriteSection, /TEACHING_ARCHIVE_SCHEMA_INDEX_PROFILE=hot_write/u);

    for (const indexName of [
      "idx_teaching_archive_items_created_page",
      "idx_teaching_archive_items_owner_page",
      "idx_teaching_archive_items_material_page",
    ]) {
      assert(
        hotWriteSection.includes(`DROP INDEX IF EXISTS ${indexName}`),
        `hot_write profile must drop write-amplifying index ${indexName}`,
      );
    }

    for (const indexName of [
      "idx_teaching_archive_items_student_page",
      "idx_teaching_archive_items_owner_material_page",
    ]) {
      assert(
        hotWriteSection.includes(`CREATE INDEX IF NOT EXISTS ${indexName}`),
        `hot_write profile must retain hot query index ${indexName}`,
      );
    }
  });

  it("defines the student app publication projection table and lookup indexes", () => {
    const sql = fs.readFileSync(contractPath, "utf8");

    for (const fragment of [
      "CREATE TABLE IF NOT EXISTS teaching_archive_publications",
      "publication_id TEXT PRIMARY KEY",
      "publication_state TEXT NOT NULL",
      "visibility_state TEXT NOT NULL",
      "channel TEXT NOT NULL",
      "scope_type TEXT NOT NULL",
      "student_id TEXT NOT NULL",
      "archive_item_id TEXT NOT NULL REFERENCES teaching_archive_items(id)",
      "idx_teaching_archive_publications_student_app_visible_lookup",
      "idx_teaching_archive_publications_student_app_visible_page",
      "publication_state = 'COMMITTED_TO_PUBLICATION_STORE'",
      "visibility_state = 'STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED'",
      "channel = 'STUDENT_APP'",
    ]) {
      assert(sql.includes(fragment), `SQL contract missing publication projection fragment: ${fragment}`);
    }
  });
});

function profileSection(sql, profileName) {
  const start = sql.indexOf(`archive_item_index_profile: ${profileName}`);
  assert.notEqual(start, -1, `missing ${profileName} profile start`);
  const end = sql.indexOf(`end archive_item_index_profile: ${profileName}`, start);
  assert.notEqual(end, -1, `missing ${profileName} profile end`);
  return sql.slice(start, end);
}

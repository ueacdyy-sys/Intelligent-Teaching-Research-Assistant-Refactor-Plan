CREATE TABLE IF NOT EXISTS teaching_archive_items (
    id TEXT PRIMARY KEY,
    owner_type TEXT NOT NULL,
    student_id TEXT,
    material_type TEXT NOT NULL,
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    content_ref TEXT NOT NULL,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    analysis_intents JSONB NOT NULL DEFAULT '[]'::jsonb,
    ocr_status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_student_created
    ON teaching_archive_items (student_id, created_at DESC)
    WHERE student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_owner_created
    ON teaching_archive_items (owner_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_material_created
    ON teaching_archive_items (material_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_created_page
    ON teaching_archive_items (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_student_page
    ON teaching_archive_items (student_id, created_at DESC, id DESC)
    WHERE student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_owner_page
    ON teaching_archive_items (owner_type, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_material_page
    ON teaching_archive_items (material_type, created_at DESC, id DESC);

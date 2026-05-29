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

CREATE TABLE IF NOT EXISTS teaching_tutoring_analysis_requests (
    id TEXT PRIMARY KEY,
    archive_item_id TEXT NOT NULL REFERENCES teaching_archive_items(id),
    requested_by_principal_id TEXT NOT NULL,
    analysis_goal TEXT NOT NULL,
    question_bank_intent TEXT NOT NULL,
    status TEXT NOT NULL,
    source_archive_owner_type TEXT NOT NULL,
    source_archive_student_id TEXT,
    source_archive_material TEXT NOT NULL,
    result_summary TEXT,
    result_ref TEXT,
    question_bank_draft_ref TEXT,
    error_code TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

ALTER TABLE teaching_tutoring_analysis_requests
    ADD COLUMN IF NOT EXISTS result_summary TEXT;

ALTER TABLE teaching_tutoring_analysis_requests
    ADD COLUMN IF NOT EXISTS result_ref TEXT;

ALTER TABLE teaching_tutoring_analysis_requests
    ADD COLUMN IF NOT EXISTS question_bank_draft_ref TEXT;

ALTER TABLE teaching_tutoring_analysis_requests
    ADD COLUMN IF NOT EXISTS error_code TEXT;

ALTER TABLE teaching_tutoring_analysis_requests
    ADD COLUMN IF NOT EXISTS error_message TEXT;

ALTER TABLE teaching_tutoring_analysis_requests
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE teaching_tutoring_analysis_requests
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_archive_created
    ON teaching_tutoring_analysis_requests (archive_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_principal_created
    ON teaching_tutoring_analysis_requests (requested_by_principal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_status_created
    ON teaching_tutoring_analysis_requests (status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_source_owner_created
    ON teaching_tutoring_analysis_requests (source_archive_owner_type, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_source_student_created
    ON teaching_tutoring_analysis_requests (source_archive_student_id, created_at DESC, id DESC)
    WHERE source_archive_student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_created_page
    ON teaching_tutoring_analysis_requests (created_at DESC, id DESC);

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

DROP INDEX IF EXISTS idx_teaching_archive_items_student_created;

DROP INDEX IF EXISTS idx_teaching_archive_items_owner_created;

DROP INDEX IF EXISTS idx_teaching_archive_items_material_created;

-- archive_item_index_profile: full
-- Default compatibility profile. It keeps all covered archive item page
-- indexes for broad manual SQL setup and exploratory query shapes.
CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_created_page
    ON teaching_archive_items (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_student_page
    ON teaching_archive_items (student_id, created_at DESC, id DESC)
    WHERE student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_owner_page
    ON teaching_archive_items (owner_type, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_material_page
    ON teaching_archive_items (material_type, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_owner_material_page
    ON teaching_archive_items (owner_type, material_type, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_student_material_search_scope
    ON teaching_archive_items (student_id, material_type, created_at DESC, id DESC)
    WHERE owner_type = 'STUDENT'
        AND student_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS teaching_archive_publications (
    publication_id TEXT PRIMARY KEY,
    publication_state TEXT NOT NULL,
    visibility_state TEXT NOT NULL,
    channel TEXT NOT NULL,
    scope_type TEXT NOT NULL,
    student_id TEXT NOT NULL,
    archive_item_id TEXT NOT NULL REFERENCES teaching_archive_items(id),
    material_type TEXT NOT NULL,
    title TEXT NOT NULL,
    content_ref TEXT NOT NULL,
    approval_record_id TEXT NOT NULL,
    approval_id TEXT NOT NULL,
    publication_candidate_id TEXT NOT NULL,
    committed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teaching_archive_publications_student_app_visible_lookup
    ON teaching_archive_publications (archive_item_id, student_id)
    WHERE scope_type = 'STUDENT_OWN_ARCHIVE'
        AND publication_state = 'COMMITTED_TO_PUBLICATION_STORE'
        AND visibility_state = 'STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED'
        AND channel = 'STUDENT_APP';

CREATE INDEX IF NOT EXISTS idx_teaching_archive_publications_student_app_visible_page
    ON teaching_archive_publications (student_id, material_type, committed_at DESC, publication_id DESC)
    WHERE scope_type = 'STUDENT_OWN_ARCHIVE'
        AND publication_state = 'COMMITTED_TO_PUBLICATION_STORE'
        AND visibility_state = 'STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED'
        AND channel = 'STUDENT_APP';

-- archive_item_index_profile: hot_write
-- Production write-pressure profile used by TEACHING_ARCHIVE_SCHEMA_INDEX_PROFILE=hot_write.
-- Apply these profile statements instead of the broader full-profile page
-- indexes when createArchiveItem latency is limited by index write
-- amplification. The student and owner+material indexes stay because they
-- cover the hot scoped list queries used by teacher/student archive views.
--
-- DROP INDEX IF EXISTS idx_teaching_archive_items_created_page;
-- DROP INDEX IF EXISTS idx_teaching_archive_items_owner_page;
-- DROP INDEX IF EXISTS idx_teaching_archive_items_material_page;
-- DROP INDEX IF EXISTS idx_teaching_archive_items_student_material_search_scope;
-- CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_student_page
--     ON teaching_archive_items (student_id, created_at DESC, id DESC)
--     WHERE student_id IS NOT NULL;
-- CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_owner_material_page
--     ON teaching_archive_items (owner_type, material_type, created_at DESC, id DESC);
-- end archive_item_index_profile: hot_write

CREATE TABLE IF NOT EXISTS teaching_quiz_submissions (
    id TEXT PRIMARY KEY,
    quiz_archive_item_id TEXT NOT NULL REFERENCES teaching_archive_items(id),
    student_id TEXT NOT NULL,
    submitted_by_principal_id TEXT NOT NULL,
    answer_ref TEXT NOT NULL,
    status TEXT NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_teaching_quiz_submissions_quiz_submitted
    ON teaching_quiz_submissions (quiz_archive_item_id, submitted_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_quiz_submissions_student_submitted
    ON teaching_quiz_submissions (student_id, submitted_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS teaching_attendance_sessions (
    id TEXT PRIMARY KEY,
    session_type TEXT NOT NULL,
    class_name TEXT,
    expected_student_count INTEGER NOT NULL,
    present_count INTEGER NOT NULL,
    absent_count INTEGER NOT NULL,
    late_count INTEGER NOT NULL,
    config_ref TEXT,
    status TEXT NOT NULL,
    created_by_principal_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_teaching_attendance_sessions_class_created
    ON teaching_attendance_sessions (class_name, created_at DESC, id DESC)
    WHERE class_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_teaching_attendance_sessions_status_created
    ON teaching_attendance_sessions (status, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS teaching_attendance_records (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES teaching_attendance_sessions(id),
    student_id TEXT NOT NULL,
    status TEXT NOT NULL,
    recorded_by_principal_id TEXT NOT NULL,
    sign_time TIMESTAMPTZ,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_teaching_attendance_records_session_created
    ON teaching_attendance_records (session_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_attendance_records_student_created
    ON teaching_attendance_records (student_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS teaching_ai_grading_requests (
    id TEXT PRIMARY KEY,
    archive_item_id TEXT NOT NULL REFERENCES teaching_archive_items(id),
    requested_by_principal_id TEXT NOT NULL,
    grading_instructions TEXT NOT NULL,
    rubric_ref TEXT,
    status TEXT NOT NULL,
    source_archive_owner_type TEXT NOT NULL,
    source_archive_student_id TEXT,
    source_archive_content_ref TEXT NOT NULL,
    source_quiz_submission_id TEXT,
    source_answer_ref TEXT,
    source_question_bank_draft_ref TEXT,
    source_question_bank_answer_submission_id TEXT,
    source_archive_material TEXT NOT NULL,
    source_archive_ocr_status TEXT NOT NULL,
    score_summary TEXT,
    result_ref TEXT,
    error_code TEXT,
    error_message TEXT,
    claimed_by_worker_id TEXT,
    claim_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE teaching_ai_grading_requests
    ADD COLUMN IF NOT EXISTS source_archive_content_ref TEXT;

UPDATE teaching_ai_grading_requests AS request
    SET source_archive_content_ref = item.content_ref
    FROM teaching_archive_items AS item
    WHERE request.archive_item_id = item.id
        AND (request.source_archive_content_ref IS NULL OR request.source_archive_content_ref = '');

ALTER TABLE teaching_ai_grading_requests
    ALTER COLUMN source_archive_content_ref SET NOT NULL;

ALTER TABLE teaching_ai_grading_requests
    ADD COLUMN IF NOT EXISTS source_quiz_submission_id TEXT;

ALTER TABLE teaching_ai_grading_requests
    ADD COLUMN IF NOT EXISTS source_answer_ref TEXT;

ALTER TABLE teaching_ai_grading_requests
    ADD COLUMN IF NOT EXISTS source_question_bank_draft_ref TEXT;

ALTER TABLE teaching_ai_grading_requests
    ADD COLUMN IF NOT EXISTS source_question_bank_answer_submission_id TEXT;

ALTER TABLE teaching_ai_grading_requests
    ADD COLUMN IF NOT EXISTS score_summary TEXT;

ALTER TABLE teaching_ai_grading_requests
    ADD COLUMN IF NOT EXISTS result_ref TEXT;

ALTER TABLE teaching_ai_grading_requests
    ADD COLUMN IF NOT EXISTS error_code TEXT;

ALTER TABLE teaching_ai_grading_requests
    ADD COLUMN IF NOT EXISTS error_message TEXT;

ALTER TABLE teaching_ai_grading_requests
    ADD COLUMN IF NOT EXISTS claimed_by_worker_id TEXT;

ALTER TABLE teaching_ai_grading_requests
    ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ;

ALTER TABLE teaching_ai_grading_requests
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_archive_created
    ON teaching_ai_grading_requests (archive_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_archive_page
    ON teaching_ai_grading_requests (archive_item_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_status_created
    ON teaching_ai_grading_requests (status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_source_owner_created
    ON teaching_ai_grading_requests (source_archive_owner_type, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_source_student_created
    ON teaching_ai_grading_requests (source_archive_student_id, created_at DESC, id DESC)
    WHERE source_archive_student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_qbank_answer_student_created
    ON teaching_ai_grading_requests (source_question_bank_answer_submission_id, source_archive_student_id, created_at DESC, id DESC)
    WHERE source_question_bank_answer_submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_created_page
    ON teaching_ai_grading_requests (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_claim_eligible
    ON teaching_ai_grading_requests (status, claim_expires_at, created_at, id);

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
    claimed_by_worker_id TEXT,
    claim_expires_at TIMESTAMPTZ,
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
    ADD COLUMN IF NOT EXISTS claimed_by_worker_id TEXT;

ALTER TABLE teaching_tutoring_analysis_requests
    ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ;

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

CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_claim_eligible
    ON teaching_tutoring_analysis_requests (status, claim_expires_at, created_at, id);

CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_source_owner_created
    ON teaching_tutoring_analysis_requests (source_archive_owner_type, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_source_student_created
    ON teaching_tutoring_analysis_requests (source_archive_student_id, created_at DESC, id DESC)
    WHERE source_archive_student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_created_page
    ON teaching_tutoring_analysis_requests (created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS teaching_question_bank_draft_contents (
    question_bank_draft_ref TEXT PRIMARY KEY,
    tutoring_analysis_request_id TEXT NOT NULL REFERENCES teaching_tutoring_analysis_requests(id),
    archive_item_id TEXT NOT NULL REFERENCES teaching_archive_items(id),
    student_id TEXT NOT NULL,
    status TEXT NOT NULL,
    source_archive_material TEXT NOT NULL,
    result_summary TEXT NOT NULL,
    question_items JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_teaching_question_bank_draft_contents_student_updated
    ON teaching_question_bank_draft_contents (student_id, updated_at DESC, question_bank_draft_ref);

CREATE INDEX IF NOT EXISTS idx_teaching_question_bank_draft_contents_request
    ON teaching_question_bank_draft_contents (tutoring_analysis_request_id);

CREATE TABLE IF NOT EXISTS teaching_question_bank_draft_answer_submissions (
    id TEXT PRIMARY KEY,
    question_bank_draft_ref TEXT NOT NULL REFERENCES teaching_question_bank_draft_contents(question_bank_draft_ref),
    tutoring_analysis_request_id TEXT NOT NULL REFERENCES teaching_tutoring_analysis_requests(id),
    archive_item_id TEXT NOT NULL REFERENCES teaching_archive_items(id),
    student_id TEXT NOT NULL,
    submitted_by_principal_id TEXT NOT NULL,
    status TEXT NOT NULL,
    answers JSONB NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_teaching_question_bank_draft_answer_submissions_student_submitted
    ON teaching_question_bank_draft_answer_submissions (student_id, submitted_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_teaching_question_bank_draft_answer_submissions_draft_submitted
    ON teaching_question_bank_draft_answer_submissions (question_bank_draft_ref, submitted_at DESC, id DESC);

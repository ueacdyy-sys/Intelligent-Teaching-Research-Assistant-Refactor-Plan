package postgres

import "context"

func EnsureSchema(ctx context.Context, db DB) error {
	for _, statement := range schemaStatements {
		if _, err := db.Exec(ctx, statement); err != nil {
			return err
		}
	}
	return nil
}

var schemaStatements = []string{
	`CREATE TABLE IF NOT EXISTS teaching_archive_items (
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
	)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_student_created
		ON teaching_archive_items (student_id, created_at DESC)
		WHERE student_id IS NOT NULL`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_owner_created
		ON teaching_archive_items (owner_type, created_at DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_material_created
		ON teaching_archive_items (material_type, created_at DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_created_page
		ON teaching_archive_items (created_at DESC, id DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_student_page
		ON teaching_archive_items (student_id, created_at DESC, id DESC)
		WHERE student_id IS NOT NULL`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_owner_page
		ON teaching_archive_items (owner_type, created_at DESC, id DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_archive_items_material_page
		ON teaching_archive_items (material_type, created_at DESC, id DESC)`,
	`CREATE TABLE IF NOT EXISTS teaching_quiz_submissions (
		id TEXT PRIMARY KEY,
		quiz_archive_item_id TEXT NOT NULL REFERENCES teaching_archive_items(id),
		student_id TEXT NOT NULL,
		submitted_by_principal_id TEXT NOT NULL,
		answer_ref TEXT NOT NULL,
		status TEXT NOT NULL,
		submitted_at TIMESTAMPTZ NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_quiz_submissions_quiz_submitted
		ON teaching_quiz_submissions (quiz_archive_item_id, submitted_at DESC, id DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_quiz_submissions_student_submitted
		ON teaching_quiz_submissions (student_id, submitted_at DESC, id DESC)`,
	`CREATE TABLE IF NOT EXISTS teaching_attendance_sessions (
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
	)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_attendance_sessions_class_created
		ON teaching_attendance_sessions (class_name, created_at DESC, id DESC)
		WHERE class_name IS NOT NULL`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_attendance_sessions_status_created
		ON teaching_attendance_sessions (status, created_at DESC, id DESC)`,
	`CREATE TABLE IF NOT EXISTS teaching_attendance_records (
		id TEXT PRIMARY KEY,
		session_id TEXT NOT NULL REFERENCES teaching_attendance_sessions(id),
		student_id TEXT NOT NULL,
		status TEXT NOT NULL,
		recorded_by_principal_id TEXT NOT NULL,
		sign_time TIMESTAMPTZ,
		note TEXT,
		created_at TIMESTAMPTZ NOT NULL,
		UNIQUE (session_id, student_id)
	)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_attendance_records_session_created
		ON teaching_attendance_records (session_id, created_at DESC, id DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_attendance_records_student_created
		ON teaching_attendance_records (student_id, created_at DESC, id DESC)`,
	`CREATE TABLE IF NOT EXISTS teaching_ai_grading_requests (
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
	)`,
	`ALTER TABLE teaching_ai_grading_requests
		ADD COLUMN IF NOT EXISTS source_archive_content_ref TEXT`,
	`UPDATE teaching_ai_grading_requests AS request
		SET source_archive_content_ref = item.content_ref
		FROM teaching_archive_items AS item
		WHERE request.archive_item_id = item.id
			AND (request.source_archive_content_ref IS NULL OR request.source_archive_content_ref = '')`,
	`ALTER TABLE teaching_ai_grading_requests
		ALTER COLUMN source_archive_content_ref SET NOT NULL`,
	`ALTER TABLE teaching_ai_grading_requests
		ADD COLUMN IF NOT EXISTS source_quiz_submission_id TEXT`,
	`ALTER TABLE teaching_ai_grading_requests
		ADD COLUMN IF NOT EXISTS source_answer_ref TEXT`,
	`ALTER TABLE teaching_ai_grading_requests
		ADD COLUMN IF NOT EXISTS score_summary TEXT`,
	`ALTER TABLE teaching_ai_grading_requests
		ADD COLUMN IF NOT EXISTS result_ref TEXT`,
	`ALTER TABLE teaching_ai_grading_requests
		ADD COLUMN IF NOT EXISTS error_code TEXT`,
	`ALTER TABLE teaching_ai_grading_requests
		ADD COLUMN IF NOT EXISTS error_message TEXT`,
	`ALTER TABLE teaching_ai_grading_requests
		ADD COLUMN IF NOT EXISTS claimed_by_worker_id TEXT`,
	`ALTER TABLE teaching_ai_grading_requests
		ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ`,
	`ALTER TABLE teaching_ai_grading_requests
		ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_archive_created
		ON teaching_ai_grading_requests (archive_item_id, created_at DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_archive_page
		ON teaching_ai_grading_requests (archive_item_id, created_at DESC, id DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_status_created
		ON teaching_ai_grading_requests (status, created_at DESC, id DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_source_owner_created
		ON teaching_ai_grading_requests (source_archive_owner_type, created_at DESC, id DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_source_student_created
		ON teaching_ai_grading_requests (source_archive_student_id, created_at DESC, id DESC)
		WHERE source_archive_student_id IS NOT NULL`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_created_page
		ON teaching_ai_grading_requests (created_at DESC, id DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_ai_grading_requests_claim_eligible
		ON teaching_ai_grading_requests (status, claim_expires_at, created_at, id)`,
	`CREATE TABLE IF NOT EXISTS teaching_tutoring_analysis_requests (
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
	)`,
	`ALTER TABLE teaching_tutoring_analysis_requests
		ADD COLUMN IF NOT EXISTS result_summary TEXT`,
	`ALTER TABLE teaching_tutoring_analysis_requests
		ADD COLUMN IF NOT EXISTS result_ref TEXT`,
	`ALTER TABLE teaching_tutoring_analysis_requests
		ADD COLUMN IF NOT EXISTS question_bank_draft_ref TEXT`,
	`ALTER TABLE teaching_tutoring_analysis_requests
		ADD COLUMN IF NOT EXISTS error_code TEXT`,
	`ALTER TABLE teaching_tutoring_analysis_requests
		ADD COLUMN IF NOT EXISTS error_message TEXT`,
	`ALTER TABLE teaching_tutoring_analysis_requests
		ADD COLUMN IF NOT EXISTS claimed_by_worker_id TEXT`,
	`ALTER TABLE teaching_tutoring_analysis_requests
		ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ`,
	`ALTER TABLE teaching_tutoring_analysis_requests
		ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`,
	`ALTER TABLE teaching_tutoring_analysis_requests
		ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_archive_created
		ON teaching_tutoring_analysis_requests (archive_item_id, created_at DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_principal_created
		ON teaching_tutoring_analysis_requests (requested_by_principal_id, created_at DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_status_created
		ON teaching_tutoring_analysis_requests (status, created_at DESC, id DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_claim_eligible
		ON teaching_tutoring_analysis_requests (status, claim_expires_at, created_at, id)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_source_owner_created
		ON teaching_tutoring_analysis_requests (source_archive_owner_type, created_at DESC, id DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_source_student_created
		ON teaching_tutoring_analysis_requests (source_archive_student_id, created_at DESC, id DESC)
		WHERE source_archive_student_id IS NOT NULL`,
	`CREATE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_created_page
		ON teaching_tutoring_analysis_requests (created_at DESC, id DESC)`,
}

package postgres

import (
	"context"
	"encoding/json"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (r *ArchiveRepository) SaveQuestionBankDraftContent(
	ctx context.Context,
	content domain.QuestionBankDraftContent,
) error {
	normalized, err := domain.NormalizeQuestionBankDraftContent(content)
	if err != nil {
		return err
	}
	items, err := json.Marshal(normalized.Items)
	if err != nil {
		return err
	}
	_, err = r.db.Exec(ctx, `
		INSERT INTO teaching_question_bank_draft_contents (
			question_bank_draft_ref,
			tutoring_analysis_request_id,
			archive_item_id,
			student_id,
			status,
			source_archive_material,
			result_summary,
			question_items,
			created_at,
			updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
		ON CONFLICT (question_bank_draft_ref) DO UPDATE
		SET
			tutoring_analysis_request_id = EXCLUDED.tutoring_analysis_request_id,
			archive_item_id = EXCLUDED.archive_item_id,
			student_id = EXCLUDED.student_id,
			status = EXCLUDED.status,
			source_archive_material = EXCLUDED.source_archive_material,
			result_summary = EXCLUDED.result_summary,
			question_items = EXCLUDED.question_items,
			updated_at = EXCLUDED.updated_at
	`,
		normalized.QuestionBankDraftRef,
		normalized.TutoringAnalysisRequestID,
		normalized.ArchiveItemID,
		normalized.StudentID,
		normalized.Status,
		normalized.SourceArchiveMaterial,
		normalized.ResultSummary,
		items,
		normalized.CreatedAt,
		normalized.UpdatedAt,
	)
	return err
}

func (r *ArchiveRepository) GetQuestionBankDraftContentForStudent(
	ctx context.Context,
	draftRef string,
	studentID string,
) (domain.QuestionBankDraftContent, bool, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			question_bank_draft_ref,
			tutoring_analysis_request_id,
			archive_item_id,
			student_id,
			status,
			source_archive_material,
			result_summary,
			question_items,
			created_at,
			updated_at
		FROM teaching_question_bank_draft_contents
		WHERE question_bank_draft_ref = $1
			AND student_id = $2
		LIMIT 1
	`, draftRef, studentID)
	if err != nil {
		return domain.QuestionBankDraftContent{}, false, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return domain.QuestionBankDraftContent{}, false, err
		}
		return domain.QuestionBankDraftContent{}, false, nil
	}
	content, err := scanQuestionBankDraftContent(rows)
	if err != nil {
		return domain.QuestionBankDraftContent{}, false, err
	}
	if err := rows.Err(); err != nil {
		return domain.QuestionBankDraftContent{}, false, err
	}
	return content, true, nil
}

func scanQuestionBankDraftContent(rows Rows) (domain.QuestionBankDraftContent, error) {
	var (
		content  domain.QuestionBankDraftContent
		status   string
		material string
		items    []byte
	)
	if err := rows.Scan(
		&content.QuestionBankDraftRef,
		&content.TutoringAnalysisRequestID,
		&content.ArchiveItemID,
		&content.StudentID,
		&status,
		&material,
		&content.ResultSummary,
		&items,
		&content.CreatedAt,
		&content.UpdatedAt,
	); err != nil {
		return domain.QuestionBankDraftContent{}, err
	}
	content.Status = domain.QuestionBankDraftContentStatus(status)
	content.SourceArchiveMaterial = domain.MaterialType(material)
	if err := json.Unmarshal(items, &content.Items); err != nil {
		return domain.QuestionBankDraftContent{}, err
	}
	return domain.NormalizeQuestionBankDraftContent(content)
}

package postgres

import (
	"context"
	"encoding/json"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func (r *ArchiveRepository) SubmitQuestionBankDraftAnswerSubmission(
	ctx context.Context,
	submission domain.QuestionBankDraftAnswerSubmission,
) (usecase.WritePersistenceOutcome, error) {
	answers, err := json.Marshal(submission.Answers)
	if err != nil {
		return usecase.WritePersistenceOutcome{}, err
	}
	insertStart := time.Now()
	_, err = r.db.Exec(ctx, `
		INSERT INTO teaching_question_bank_draft_answer_submissions (
			id,
			question_bank_draft_ref,
			tutoring_analysis_request_id,
			archive_item_id,
			student_id,
			submitted_by_principal_id,
			status,
			answers,
			submitted_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
	`,
		submission.ID,
		submission.QuestionBankDraftRef,
		submission.TutoringAnalysisRequestID,
		submission.ArchiveItemID,
		submission.StudentID,
		submission.SubmittedByPrincipalID,
		submission.Status,
		answers,
		submission.SubmittedAt,
	)
	recordDBInsertTiming(ctx, observableDuration(time.Since(insertStart)))
	if err != nil {
		return usecase.WritePersistenceOutcome{}, err
	}
	return usecase.PersistedWriteOutcome(), nil
}

func (r *ArchiveRepository) GetQuestionBankDraftAnswerSubmissionForStudent(
	ctx context.Context,
	submissionID string,
	studentID string,
) (domain.QuestionBankDraftAnswerSubmission, bool, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			id,
			question_bank_draft_ref,
			tutoring_analysis_request_id,
			archive_item_id,
			student_id,
			submitted_by_principal_id,
			status,
			answers,
			submitted_at
		FROM teaching_question_bank_draft_answer_submissions
		WHERE id = $1
			AND student_id = $2
		LIMIT 1
	`, submissionID, studentID)
	if err != nil {
		return domain.QuestionBankDraftAnswerSubmission{}, false, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return domain.QuestionBankDraftAnswerSubmission{}, false, err
		}
		return domain.QuestionBankDraftAnswerSubmission{}, false, nil
	}
	submission, err := scanQuestionBankDraftAnswerSubmission(rows)
	if err != nil {
		return domain.QuestionBankDraftAnswerSubmission{}, false, err
	}
	if err := rows.Err(); err != nil {
		return domain.QuestionBankDraftAnswerSubmission{}, false, err
	}
	return submission, true, nil
}

func scanQuestionBankDraftAnswerSubmission(rows Rows) (domain.QuestionBankDraftAnswerSubmission, error) {
	var (
		submission domain.QuestionBankDraftAnswerSubmission
		status     string
		answers    []byte
	)
	if err := rows.Scan(
		&submission.ID,
		&submission.QuestionBankDraftRef,
		&submission.TutoringAnalysisRequestID,
		&submission.ArchiveItemID,
		&submission.StudentID,
		&submission.SubmittedByPrincipalID,
		&status,
		&answers,
		&submission.SubmittedAt,
	); err != nil {
		return domain.QuestionBankDraftAnswerSubmission{}, err
	}
	submission.Status = domain.QuestionBankDraftAnswerSubmissionStatus(status)
	if err := json.Unmarshal(answers, &submission.Answers); err != nil {
		return domain.QuestionBankDraftAnswerSubmission{}, err
	}
	if _, err := domain.NormalizeQuestionBankDraftAnswerSubmissionID(submission.ID); err != nil {
		return domain.QuestionBankDraftAnswerSubmission{}, err
	}
	if _, err := domain.NormalizeQuestionBankDraftRef(submission.QuestionBankDraftRef); err != nil {
		return domain.QuestionBankDraftAnswerSubmission{}, err
	}
	return submission, nil
}

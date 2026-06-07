package postgres

import (
	"context"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func (r *ArchiveRepository) CreateQuizSubmission(
	ctx context.Context,
	submission domain.QuizSubmission,
) (usecase.WritePersistenceOutcome, error) {
	insertStart := time.Now()
	_, err := r.db.Exec(ctx, `
		INSERT INTO teaching_quiz_submissions (
			id,
			quiz_archive_item_id,
			student_id,
			submitted_by_principal_id,
			answer_ref,
			status,
			submitted_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
	`,
		submission.ID,
		submission.QuizArchiveItemID,
		submission.StudentID,
		submission.SubmittedByPrincipalID,
		submission.AnswerRef,
		submission.Status,
		submission.SubmittedAt,
	)
	recordDBInsertTiming(ctx, observableDuration(time.Since(insertStart)))
	if err != nil {
		return usecase.WritePersistenceOutcome{}, err
	}
	return usecase.PersistedWriteOutcome(), nil
}

func (r *ArchiveRepository) CreateQuizSubmissionForExistingTeachingQuiz(
	ctx context.Context,
	submission domain.QuizSubmission,
) (bool, usecase.WritePersistenceOutcome, error) {
	insertStart := time.Now()
	tag, err := r.db.Exec(ctx, `
		INSERT INTO teaching_quiz_submissions (
			id,
			quiz_archive_item_id,
			student_id,
			submitted_by_principal_id,
			answer_ref,
			status,
			submitted_at
		)
		SELECT
			$1,
			item.id,
			$3,
			$4,
			$5,
			$6,
			$7
		FROM teaching_archive_items AS item
		WHERE item.id = $2
			AND item.owner_type = $8
			AND item.material_type = $9
	`,
		submission.ID,
		submission.QuizArchiveItemID,
		submission.StudentID,
		submission.SubmittedByPrincipalID,
		submission.AnswerRef,
		submission.Status,
		submission.SubmittedAt,
		domain.OwnerTypeTeaching,
		domain.MaterialTypeQuiz,
	)
	recordDBInsertTiming(ctx, observableDuration(time.Since(insertStart)))
	if err != nil {
		return false, usecase.WritePersistenceOutcome{}, err
	}
	if tag.RowsAffected() == 0 {
		return false, usecase.WritePersistenceOutcome{}, nil
	}
	return true, usecase.PersistedWriteOutcome(), nil
}

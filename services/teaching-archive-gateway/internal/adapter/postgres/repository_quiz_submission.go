package postgres

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (r *ArchiveRepository) CreateQuizSubmission(
	ctx context.Context,
	submission domain.QuizSubmission,
) error {
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
	return err
}

func (r *ArchiveRepository) CreateQuizSubmissionForExistingTeachingQuiz(
	ctx context.Context,
	submission domain.QuizSubmission,
) (bool, error) {
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
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

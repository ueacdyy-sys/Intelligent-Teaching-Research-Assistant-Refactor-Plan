package postgres

import (
	"context"
	"fmt"
	"strings"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (r *ArchiveRepository) ListQuizSubmissions(
	ctx context.Context,
	query domain.QuizSubmissionQuery,
) ([]domain.QuizSubmission, error) {
	args := make([]any, 0, 6)
	clauses := []string{"quiz_archive_item_id = " + nextArg(&args, query.QuizArchiveItemID)}

	if query.StudentID != "" {
		clauses = append(clauses, "student_id = "+nextArg(&args, query.StudentID))
	}
	if len(query.StudentIDs) > 0 {
		clauses = append(clauses, "student_id = ANY("+nextArg(&args, query.StudentIDs)+")")
	}
	if query.Cursor != nil {
		submittedAtArg := nextArg(&args, query.Cursor.SubmittedAt)
		idArg := nextArg(&args, query.Cursor.ID)
		clauses = append(clauses, fmt.Sprintf("(submitted_at, id) < (%s, %s)", submittedAtArg, idArg))
	}
	limitArg := nextArg(&args, query.FetchLimit)

	rows, err := r.db.Query(ctx, `
		SELECT
			id,
			quiz_archive_item_id,
			student_id,
			submitted_by_principal_id,
			answer_ref,
			status,
			submitted_at
		FROM teaching_quiz_submissions
		WHERE `+strings.Join(clauses, " AND ")+`
		ORDER BY submitted_at DESC, id DESC
		LIMIT `+limitArg,
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	submissions := make([]domain.QuizSubmission, 0, query.FetchLimit)
	for rows.Next() {
		submission, err := scanQuizSubmission(rows)
		if err != nil {
			return nil, err
		}
		submissions = append(submissions, submission)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return submissions, nil
}

func scanQuizSubmission(rows Rows) (domain.QuizSubmission, error) {
	var submission domain.QuizSubmission
	var status string
	if err := rows.Scan(
		&submission.ID,
		&submission.QuizArchiveItemID,
		&submission.StudentID,
		&submission.SubmittedByPrincipalID,
		&submission.AnswerRef,
		&status,
		&submission.SubmittedAt,
	); err != nil {
		return domain.QuizSubmission{}, err
	}
	submission.Status = domain.QuizSubmissionStatus(status)
	return submission, nil
}

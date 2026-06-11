package postgres

import (
	"context"
	"encoding/json"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (r *ArchiveRepository) GetLatestQuestionBankDraftAnswerFeedbackArchiveSnapshotForStudent(
	ctx context.Context,
	submissionID string,
	studentID string,
) (domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot, bool, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			snapshot.feedback_archive_item_id,
			snapshot.submission_id,
			snapshot.student_id,
			snapshot.request_id,
			snapshot.question_bank_draft_ref,
			snapshot.tutoring_analysis_request_id,
			snapshot.source_archive_item_id,
			snapshot.score_summary,
			snapshot.learner_feedback,
			snapshot.safe_learner_feedback_only,
			snapshot.reviewed_at,
			snapshot.archived_at,
			snapshot.updated_at
		FROM teaching_question_bank_draft_answer_feedback_archive_snapshots AS snapshot
		WHERE snapshot.submission_id = $1
			AND snapshot.student_id = $2
			AND snapshot.safe_learner_feedback_only = TRUE
		ORDER BY snapshot.archived_at DESC, snapshot.feedback_archive_item_id DESC
		LIMIT 1
	`, submissionID, studentID)
	if err != nil {
		return domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, false, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, false, err
		}
		return domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, false, nil
	}
	snapshot, err := scanQuestionBankDraftAnswerFeedbackArchiveSnapshot(rows)
	if err != nil {
		return domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, false, err
	}
	if err := rows.Err(); err != nil {
		return domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, false, err
	}
	return snapshot, true, nil
}

func (r *ArchiveRepository) GetQuestionBankDraftAnswerFeedbackArchiveSnapshotByFeedbackArchiveItemForStudent(
	ctx context.Context,
	feedbackArchiveItemID string,
	studentID string,
) (domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot, bool, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			snapshot.feedback_archive_item_id,
			snapshot.submission_id,
			snapshot.student_id,
			snapshot.request_id,
			snapshot.question_bank_draft_ref,
			snapshot.tutoring_analysis_request_id,
			snapshot.source_archive_item_id,
			snapshot.score_summary,
			snapshot.learner_feedback,
			snapshot.safe_learner_feedback_only,
			snapshot.reviewed_at,
			snapshot.archived_at,
			snapshot.updated_at
		FROM teaching_question_bank_draft_answer_feedback_archive_snapshots AS snapshot
		WHERE snapshot.feedback_archive_item_id = $1
			AND snapshot.student_id = $2
			AND snapshot.safe_learner_feedback_only = TRUE
		LIMIT 1
	`, feedbackArchiveItemID, studentID)
	if err != nil {
		return domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, false, err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, false, err
		}
		return domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, false, nil
	}
	snapshot, err := scanQuestionBankDraftAnswerFeedbackArchiveSnapshot(rows)
	if err != nil {
		return domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, false, err
	}
	if err := rows.Err(); err != nil {
		return domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, false, err
	}
	return snapshot, true, nil
}

func scanQuestionBankDraftAnswerFeedbackArchiveSnapshot(
	rows Rows,
) (domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot, error) {
	var (
		snapshot        domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot
		learnerFeedback []byte
	)
	if err := rows.Scan(
		&snapshot.FeedbackArchiveItemID,
		&snapshot.SubmissionID,
		&snapshot.StudentID,
		&snapshot.RequestID,
		&snapshot.QuestionBankDraftRef,
		&snapshot.TutoringAnalysisRequestID,
		&snapshot.SourceArchiveItemID,
		&snapshot.ScoreSummary,
		&learnerFeedback,
		&snapshot.SafeLearnerFeedbackOnly,
		&snapshot.ReviewedAt,
		&snapshot.ArchivedAt,
		&snapshot.UpdatedAt,
	); err != nil {
		return domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, err
	}
	if err := json.Unmarshal(learnerFeedback, &snapshot.LearnerFeedback); err != nil {
		return domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, err
	}
	return domain.NormalizeQuestionBankDraftAnswerFeedbackArchiveSnapshot(snapshot)
}

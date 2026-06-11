package httpapi_test

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (f *fakeRepository) GetLatestQuestionBankDraftAnswerFeedbackArchiveSnapshotForStudent(
	_ context.Context,
	submissionID string,
	studentID string,
) (domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot, bool, error) {
	var latest domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot
	for _, snapshot := range f.questionBankDraftAnswerFeedbackSnapshots {
		if snapshot.SubmissionID != submissionID ||
			snapshot.StudentID != studentID ||
			!snapshot.SafeLearnerFeedbackOnly {
			continue
		}
		if latest.SubmissionID == "" ||
			snapshot.ArchivedAt.After(latest.ArchivedAt) ||
			(snapshot.ArchivedAt.Equal(latest.ArchivedAt) && snapshot.FeedbackArchiveItemID > latest.FeedbackArchiveItemID) {
			latest = snapshot
		}
	}
	return latest, latest.SubmissionID != "", nil
}

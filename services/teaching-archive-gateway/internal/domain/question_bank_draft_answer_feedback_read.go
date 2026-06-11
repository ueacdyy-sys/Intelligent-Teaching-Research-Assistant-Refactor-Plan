package domain

import (
	"strings"
	"time"
)

const (
	maxQuestionBankDraftAnswerFeedbackNextSteps           = 8
	maxQuestionBankDraftAnswerFeedbackMisconceptionTags   = 12
	maxQuestionBankDraftAnswerFeedbackPracticeSuggestions = 8
	maxQuestionBankDraftAnswerFeedbackTagLength           = 80
)

type StudentAppQuestionBankDraftAnswerFeedbackStatus string

const (
	StudentAppQuestionBankDraftAnswerFeedbackStatusReady StudentAppQuestionBankDraftAnswerFeedbackStatus = "READY_FOR_STUDENT_APP_READ"
)

type ReadStudentAppQuestionBankDraftAnswerFeedbackInput struct {
	Principal    PrincipalContext
	SubmissionID string
}

type NormalizedReadStudentAppQuestionBankDraftAnswerFeedbackInput struct {
	Principal    PrincipalContext
	SubmissionID string
	StudentID    string
}

type QuestionBankDraftAnswerLearnerFeedback struct {
	Summary             string
	Encouragement       string
	NextSteps           []string
	MisconceptionTags   []string
	PracticeSuggestions []string
}

type QuestionBankDraftAnswerFeedbackArchiveSnapshot struct {
	FeedbackArchiveItemID     string
	SubmissionID              string
	StudentID                 string
	RequestID                 string
	QuestionBankDraftRef      string
	TutoringAnalysisRequestID string
	SourceArchiveItemID       string
	ScoreSummary              string
	LearnerFeedback           QuestionBankDraftAnswerLearnerFeedback
	SafeLearnerFeedbackOnly   bool
	ReviewedAt                time.Time
	ArchivedAt                time.Time
	UpdatedAt                 time.Time
}

type QuestionBankDraftAnswerFeedbackCard struct {
	SubmissionID              string
	RequestID                 string
	QuestionBankDraftRef      string
	TutoringAnalysisRequestID string
	ArchiveItemID             string
	FeedbackArchiveItemID     string
	Status                    StudentAppQuestionBankDraftAnswerFeedbackStatus
	MaterialType              MaterialType
	Title                     string
	Source                    Source
	Tags                      []string
	AnalysisIntents           []AnalysisIntent
	OCRStatus                 OCRStatus
	ScoreSummary              string
	LearnerFeedback           QuestionBankDraftAnswerLearnerFeedback
	ReviewedAt                time.Time
	ArchivedAt                time.Time
	UpdatedAt                 time.Time
}

func NormalizeReadStudentAppQuestionBankDraftAnswerFeedbackInput(
	input ReadStudentAppQuestionBankDraftAnswerFeedbackInput,
) (NormalizedReadStudentAppQuestionBankDraftAnswerFeedbackInput, error) {
	if err := AuthorizeListStudentAppQuestionBankDrafts(input.Principal); err != nil {
		return NormalizedReadStudentAppQuestionBankDraftAnswerFeedbackInput{}, err
	}
	submissionID, err := NormalizeQuestionBankDraftAnswerSubmissionID(input.SubmissionID)
	if err != nil {
		return NormalizedReadStudentAppQuestionBankDraftAnswerFeedbackInput{}, err
	}
	studentID := primaryOwnStudentID(input.Principal)
	if studentID == "" {
		return NormalizedReadStudentAppQuestionBankDraftAnswerFeedbackInput{}, ErrForbidden
	}
	return NormalizedReadStudentAppQuestionBankDraftAnswerFeedbackInput{
		Principal:    input.Principal,
		SubmissionID: submissionID,
		StudentID:    studentID,
	}, nil
}

func NormalizeQuestionBankDraftAnswerFeedbackArchiveSnapshot(
	snapshot QuestionBankDraftAnswerFeedbackArchiveSnapshot,
) (QuestionBankDraftAnswerFeedbackArchiveSnapshot, error) {
	feedbackArchiveItemID, err := NormalizeArchiveItemID(snapshot.FeedbackArchiveItemID)
	if err != nil {
		return QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, err
	}
	submissionID, err := NormalizeQuestionBankDraftAnswerSubmissionID(snapshot.SubmissionID)
	if err != nil {
		return QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, err
	}
	studentID, err := normalizeRequiredText(snapshot.StudentID, maxArchiveStudentIDLength, "studentId")
	if err != nil {
		return QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, err
	}
	requestID, err := NormalizeAIGradingRequestID(snapshot.RequestID)
	if err != nil {
		return QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, err
	}
	draftRef, err := NormalizeQuestionBankDraftRef(snapshot.QuestionBankDraftRef)
	if err != nil {
		return QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, err
	}
	tutoringRequestID, err := NormalizeTutoringAnalysisRequestID(snapshot.TutoringAnalysisRequestID)
	if err != nil {
		return QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, err
	}
	sourceArchiveItemID, err := NormalizeArchiveItemID(snapshot.SourceArchiveItemID)
	if err != nil {
		return QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, err
	}
	scoreSummary, err := normalizeSafePreviewText(
		snapshot.ScoreSummary,
		maxArchiveMaterialContentPreviewSectionText,
		"scoreSummary",
	)
	if err != nil {
		return QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, err
	}
	learnerFeedback, err := normalizeQuestionBankDraftAnswerLearnerFeedback(snapshot.LearnerFeedback)
	if err != nil {
		return QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, err
	}
	if !snapshot.SafeLearnerFeedbackOnly {
		return QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, ErrForbidden
	}
	reviewedAt, err := normalizeQuestionBankDraftAnswerFeedbackTime(snapshot.ReviewedAt, "reviewedAt")
	if err != nil {
		return QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, err
	}
	archivedAt, err := normalizeQuestionBankDraftAnswerFeedbackTime(snapshot.ArchivedAt, "archivedAt")
	if err != nil {
		return QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, err
	}
	updatedAt, err := normalizeQuestionBankDraftAnswerFeedbackTime(snapshot.UpdatedAt, "updatedAt")
	if err != nil {
		return QuestionBankDraftAnswerFeedbackArchiveSnapshot{}, err
	}
	return QuestionBankDraftAnswerFeedbackArchiveSnapshot{
		FeedbackArchiveItemID:     feedbackArchiveItemID,
		SubmissionID:              submissionID,
		StudentID:                 studentID,
		RequestID:                 requestID,
		QuestionBankDraftRef:      draftRef,
		TutoringAnalysisRequestID: tutoringRequestID,
		SourceArchiveItemID:       sourceArchiveItemID,
		ScoreSummary:              scoreSummary,
		LearnerFeedback:           learnerFeedback,
		SafeLearnerFeedbackOnly:   true,
		ReviewedAt:                reviewedAt,
		ArchivedAt:                archivedAt,
		UpdatedAt:                 updatedAt,
	}, nil
}

func BuildStudentAppQuestionBankDraftAnswerFeedbackCard(
	input NormalizedReadStudentAppQuestionBankDraftAnswerFeedbackInput,
	submission QuestionBankDraftAnswerSubmission,
	feedbackArchiveItem ArchiveItem,
	snapshot QuestionBankDraftAnswerFeedbackArchiveSnapshot,
) (QuestionBankDraftAnswerFeedbackCard, error) {
	if submission.ID != input.SubmissionID || submission.StudentID != input.StudentID {
		return QuestionBankDraftAnswerFeedbackCard{}, ErrForbidden
	}
	normalized, err := NormalizeQuestionBankDraftAnswerFeedbackArchiveSnapshot(snapshot)
	if err != nil {
		return QuestionBankDraftAnswerFeedbackCard{}, err
	}
	if err := validateQuestionBankDraftAnswerFeedbackLineage(input, submission, normalized); err != nil {
		return QuestionBankDraftAnswerFeedbackCard{}, err
	}
	if err := ValidateStudentAppQuestionBankDraftAnswerFeedbackArchiveItem(input, feedbackArchiveItem, normalized); err != nil {
		return QuestionBankDraftAnswerFeedbackCard{}, err
	}
	title, err := normalizeSafePreviewText(feedbackArchiveItem.Title, maxArchiveTitleLength, "title")
	if err != nil {
		return QuestionBankDraftAnswerFeedbackCard{}, err
	}
	return QuestionBankDraftAnswerFeedbackCard{
		SubmissionID:              normalized.SubmissionID,
		RequestID:                 normalized.RequestID,
		QuestionBankDraftRef:      normalized.QuestionBankDraftRef,
		TutoringAnalysisRequestID: normalized.TutoringAnalysisRequestID,
		ArchiveItemID:             normalized.SourceArchiveItemID,
		FeedbackArchiveItemID:     normalized.FeedbackArchiveItemID,
		Status:                    StudentAppQuestionBankDraftAnswerFeedbackStatusReady,
		MaterialType:              feedbackArchiveItem.MaterialType,
		Title:                     title,
		Source:                    feedbackArchiveItem.Source,
		Tags:                      feedbackArchiveItem.Tags,
		AnalysisIntents:           feedbackArchiveItem.AnalysisIntents,
		OCRStatus:                 feedbackArchiveItem.OCRStatus,
		ScoreSummary:              normalized.ScoreSummary,
		LearnerFeedback:           normalized.LearnerFeedback,
		ReviewedAt:                normalized.ReviewedAt,
		ArchivedAt:                normalized.ArchivedAt,
		UpdatedAt:                 normalized.UpdatedAt,
	}, nil
}

func ValidateStudentAppQuestionBankDraftAnswerFeedbackArchiveItem(
	input NormalizedReadStudentAppQuestionBankDraftAnswerFeedbackInput,
	item ArchiveItem,
	snapshot QuestionBankDraftAnswerFeedbackArchiveSnapshot,
) error {
	if item.ID != snapshot.FeedbackArchiveItemID ||
		item.OwnerType != OwnerTypeStudent ||
		item.StudentID != input.StudentID ||
		item.MaterialType != MaterialTypeHomework ||
		item.Source != SourceSystemImport ||
		item.OCRStatus != OCRStatusNotRequired ||
		!hasAllTags(item.Tags, "student_app_ai_tutor", "feedback", "question_bank", "archive_commit") ||
		!hasAnalysisIntent(item.AnalysisIntents, AnalysisIntentTutoring) ||
		!hasAnalysisIntent(item.AnalysisIntents, AnalysisIntentArchiveOnly) {
		return ErrForbidden
	}
	if _, err := NormalizeArchiveItemID(item.ID); err != nil {
		return err
	}
	if !isStudentAppQuestionBankDraftAnswerFeedbackArchiveContentRef(item.ContentRef) {
		return ErrForbidden
	}
	return nil
}

func validateQuestionBankDraftAnswerFeedbackLineage(
	input NormalizedReadStudentAppQuestionBankDraftAnswerFeedbackInput,
	submission QuestionBankDraftAnswerSubmission,
	snapshot QuestionBankDraftAnswerFeedbackArchiveSnapshot,
) error {
	if snapshot.SubmissionID != input.SubmissionID ||
		snapshot.StudentID != input.StudentID ||
		snapshot.QuestionBankDraftRef != submission.QuestionBankDraftRef ||
		snapshot.TutoringAnalysisRequestID != submission.TutoringAnalysisRequestID ||
		snapshot.SourceArchiveItemID != submission.ArchiveItemID {
		return ErrForbidden
	}
	return nil
}

func normalizeQuestionBankDraftAnswerLearnerFeedback(
	feedback QuestionBankDraftAnswerLearnerFeedback,
) (QuestionBankDraftAnswerLearnerFeedback, error) {
	summary, err := normalizeSafePreviewText(
		feedback.Summary,
		maxArchiveMaterialContentPreviewSectionText,
		"learnerFeedback.summary",
	)
	if err != nil {
		return QuestionBankDraftAnswerLearnerFeedback{}, err
	}
	encouragement, err := normalizeSafePreviewText(
		feedback.Encouragement,
		maxArchiveMaterialContentPreviewSectionText,
		"learnerFeedback.encouragement",
	)
	if err != nil {
		return QuestionBankDraftAnswerLearnerFeedback{}, err
	}
	nextSteps, err := normalizeQuestionBankDraftAnswerFeedbackSafeTextArray(
		feedback.NextSteps,
		maxQuestionBankDraftAnswerFeedbackNextSteps,
		maxArchiveMaterialContentPreviewSectionText,
		"learnerFeedback.nextSteps",
		true,
	)
	if err != nil {
		return QuestionBankDraftAnswerLearnerFeedback{}, err
	}
	misconceptionTags, err := normalizeQuestionBankDraftAnswerFeedbackSafeTextArray(
		feedback.MisconceptionTags,
		maxQuestionBankDraftAnswerFeedbackMisconceptionTags,
		maxQuestionBankDraftAnswerFeedbackTagLength,
		"learnerFeedback.misconceptionTags",
		false,
	)
	if err != nil {
		return QuestionBankDraftAnswerLearnerFeedback{}, err
	}
	practiceSuggestions, err := normalizeQuestionBankDraftAnswerFeedbackSafeTextArray(
		feedback.PracticeSuggestions,
		maxQuestionBankDraftAnswerFeedbackPracticeSuggestions,
		maxArchiveMaterialContentPreviewSectionText,
		"learnerFeedback.practiceSuggestions",
		false,
	)
	if err != nil {
		return QuestionBankDraftAnswerLearnerFeedback{}, err
	}
	return QuestionBankDraftAnswerLearnerFeedback{
		Summary:             summary,
		Encouragement:       encouragement,
		NextSteps:           nextSteps,
		MisconceptionTags:   misconceptionTags,
		PracticeSuggestions: practiceSuggestions,
	}, nil
}

func normalizeQuestionBankDraftAnswerFeedbackSafeTextArray(
	values []string,
	maxItems int,
	maxLength int,
	field string,
	required bool,
) ([]string, error) {
	if required && len(values) == 0 {
		return nil, validationError(field + " must contain at least one item")
	}
	if len(values) > maxItems {
		return nil, validationError(field + " contains too many items")
	}
	normalized := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		text, err := normalizeSafePreviewText(value, maxLength, field)
		if err != nil {
			return nil, err
		}
		if _, ok := seen[text]; ok {
			return nil, validationError(field + " contains duplicate items")
		}
		seen[text] = struct{}{}
		normalized = append(normalized, text)
	}
	return normalized, nil
}

func normalizeQuestionBankDraftAnswerFeedbackTime(value time.Time, field string) (time.Time, error) {
	if value.IsZero() {
		return time.Time{}, validationError(field + " is required")
	}
	return value.UTC(), nil
}

func isStudentAppQuestionBankDraftAnswerFeedbackArchiveContentRef(value string) bool {
	for _, prefix := range []string{
		"student-ai-tutor-feedback-archive:",
		"student-ai-tutor-feedback-archive-controlled-draft-source:",
	} {
		if strings.HasPrefix(value, prefix) && len(value) > len(prefix) {
			return true
		}
	}
	return false
}

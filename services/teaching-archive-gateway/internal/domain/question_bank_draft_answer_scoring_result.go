package domain

import "time"

type ReadStudentAppQuestionBankDraftAnswerScoringResultInput struct {
	Principal    PrincipalContext
	SubmissionID string
}

type NormalizedReadStudentAppQuestionBankDraftAnswerScoringResultInput struct {
	Principal    PrincipalContext
	SubmissionID string
	StudentID    string
}

type QuestionBankDraftAnswerScoringResult struct {
	SubmissionID              string
	RequestID                 string
	QuestionBankDraftRef      string
	TutoringAnalysisRequestID string
	ArchiveItemID             string
	Status                    AIGradingStatus
	ScoreSummary              string
	ErrorCode                 string
	RequestedAt               time.Time
	CompletedAt               time.Time
	UpdatedAt                 time.Time
}

func NormalizeReadStudentAppQuestionBankDraftAnswerScoringResultInput(
	input ReadStudentAppQuestionBankDraftAnswerScoringResultInput,
) (NormalizedReadStudentAppQuestionBankDraftAnswerScoringResultInput, error) {
	if err := AuthorizeListStudentAppQuestionBankDrafts(input.Principal); err != nil {
		return NormalizedReadStudentAppQuestionBankDraftAnswerScoringResultInput{}, err
	}
	submissionID, err := NormalizeQuestionBankDraftAnswerSubmissionID(input.SubmissionID)
	if err != nil {
		return NormalizedReadStudentAppQuestionBankDraftAnswerScoringResultInput{}, err
	}
	studentID := primaryOwnStudentID(input.Principal)
	if studentID == "" {
		return NormalizedReadStudentAppQuestionBankDraftAnswerScoringResultInput{}, ErrForbidden
	}
	return NormalizedReadStudentAppQuestionBankDraftAnswerScoringResultInput{
		Principal:    input.Principal,
		SubmissionID: submissionID,
		StudentID:    studentID,
	}, nil
}

func BuildStudentAppQuestionBankDraftAnswerScoringResult(
	input NormalizedReadStudentAppQuestionBankDraftAnswerScoringResultInput,
	submission QuestionBankDraftAnswerSubmission,
	request AIGradingRequest,
) (QuestionBankDraftAnswerScoringResult, error) {
	if submission.ID != input.SubmissionID || submission.StudentID != input.StudentID {
		return QuestionBankDraftAnswerScoringResult{}, ErrForbidden
	}
	if err := validateStudentAppQuestionBankDraftAnswerScoringResultSource(submission, request); err != nil {
		return QuestionBankDraftAnswerScoringResult{}, err
	}
	result := QuestionBankDraftAnswerScoringResult{
		SubmissionID:              submission.ID,
		RequestID:                 request.ID,
		QuestionBankDraftRef:      submission.QuestionBankDraftRef,
		TutoringAnalysisRequestID: submission.TutoringAnalysisRequestID,
		ArchiveItemID:             submission.ArchiveItemID,
		Status:                    request.Status,
		RequestedAt:               request.CreatedAt.UTC(),
		UpdatedAt:                 request.UpdatedAt.UTC(),
	}
	if request.Status == AIGradingStatusSucceeded {
		result.ScoreSummary = request.ScoreSummary
		result.CompletedAt = request.CompletedAt.UTC()
	}
	if request.Status == AIGradingStatusFailed {
		result.ErrorCode = request.ErrorCode
		result.CompletedAt = request.CompletedAt.UTC()
	}
	return result, nil
}

func validateStudentAppQuestionBankDraftAnswerScoringResultSource(
	submission QuestionBankDraftAnswerSubmission,
	request AIGradingRequest,
) error {
	if request.SourceArchiveOwnerType != OwnerTypeStudent ||
		request.SourceArchiveStudentID != submission.StudentID ||
		request.SourceQuestionBankDraftRef != submission.QuestionBankDraftRef ||
		request.SourceArchiveContentRef != submission.QuestionBankDraftRef ||
		request.SourceQuestionBankAnswerSubmissionID != submission.ID ||
		request.ArchiveItemID != submission.ArchiveItemID {
		return validationError("ai grading request does not match question bank answer submission")
	}
	if _, err := NormalizeAIGradingRequestID(request.ID); err != nil {
		return err
	}
	if _, err := NormalizeQuestionBankDraftRef(request.SourceQuestionBankDraftRef); err != nil {
		return err
	}
	switch request.Status {
	case AIGradingStatusQueued, AIGradingStatusInProgress:
		if request.ScoreSummary != "" || request.ResultRef != "" || request.ErrorCode != "" || request.ErrorMessage != "" || !request.CompletedAt.IsZero() {
			return validationError("pending ai grading result contains terminal fields")
		}
	case AIGradingStatusSucceeded:
		if request.ScoreSummary == "" || request.ResultRef == "" || request.CompletedAt.IsZero() {
			return validationError("succeeded ai grading result is incomplete")
		}
	case AIGradingStatusFailed:
		if request.ErrorMessage == "" || request.CompletedAt.IsZero() {
			return validationError("failed ai grading result is incomplete")
		}
	default:
		return validationError("ai grading request status is unsupported")
	}
	return nil
}

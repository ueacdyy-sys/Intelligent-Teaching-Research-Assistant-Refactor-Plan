package domain

import "time"

type ReadQuestionBankDraftAnswerScoringInputInput struct {
	Principal PrincipalContext
	RequestID string
	WorkerID  string
}

type NormalizedReadQuestionBankDraftAnswerScoringInputInput struct {
	Principal PrincipalContext
	RequestID string
	WorkerID  string
}

type QuestionBankDraftAnswerScoringInput struct {
	RequestID                            string
	ArchiveItemID                        string
	GradingInstructions                  string
	RubricRef                            string
	Status                               AIGradingStatus
	WorkerID                             string
	ClaimExpiresAt                       time.Time
	SourceArchiveStudentID               string
	SourceQuestionBankDraftRef           string
	SourceQuestionBankAnswerSubmissionID string
	SourceArchiveMaterial                MaterialType
	TutoringAnalysisRequestID            string
	Items                                []QuestionBankDraftAnswerScoringInputItem
}

type QuestionBankDraftAnswerScoringInputItem struct {
	ItemID         string
	QuestionText   string
	AnswerText     string
	ExpectedAnswer string
	Explanation    string
	LearningTarget string
}

func NormalizeReadQuestionBankDraftAnswerScoringInputInput(
	input ReadQuestionBankDraftAnswerScoringInputInput,
) (NormalizedReadQuestionBankDraftAnswerScoringInputInput, error) {
	if err := AuthorizeRecordAIGradingResult(input.Principal); err != nil {
		return NormalizedReadQuestionBankDraftAnswerScoringInputInput{}, err
	}
	requestID, err := NormalizeAIGradingRequestID(input.RequestID)
	if err != nil {
		return NormalizedReadQuestionBankDraftAnswerScoringInputInput{}, err
	}
	workerID, err := normalizeRequiredText(input.WorkerID, maxAIGradingWorkerIDLength, "workerId")
	if err != nil {
		return NormalizedReadQuestionBankDraftAnswerScoringInputInput{}, err
	}
	return NormalizedReadQuestionBankDraftAnswerScoringInputInput{
		Principal: input.Principal,
		RequestID: requestID,
		WorkerID:  workerID,
	}, nil
}

func ValidateQuestionBankDraftAnswerScoringInputRequest(
	input NormalizedReadQuestionBankDraftAnswerScoringInputInput,
	request AIGradingRequest,
	now time.Time,
) error {
	if request.ID != input.RequestID {
		return validationError("requestId does not match ai grading request")
	}
	if !canRecordAIGradingResult(request, input.WorkerID, now.UTC()) {
		return ErrConflict
	}
	if request.SourceArchiveOwnerType != OwnerTypeStudent ||
		request.SourceArchiveStudentID == "" ||
		request.SourceQuestionBankDraftRef == "" ||
		request.SourceQuestionBankAnswerSubmissionID == "" ||
		request.SourceArchiveContentRef != request.SourceQuestionBankDraftRef {
		return validationError("ai grading request is not a question bank draft answer scoring request")
	}
	if _, err := NormalizeQuestionBankDraftRef(request.SourceQuestionBankDraftRef); err != nil {
		return err
	}
	if _, err := NormalizeQuestionBankDraftAnswerSubmissionID(request.SourceQuestionBankAnswerSubmissionID); err != nil {
		return err
	}
	return nil
}

func BuildQuestionBankDraftAnswerScoringInput(
	input NormalizedReadQuestionBankDraftAnswerScoringInputInput,
	request AIGradingRequest,
	submission QuestionBankDraftAnswerSubmission,
	content QuestionBankDraftContent,
	now time.Time,
) (QuestionBankDraftAnswerScoringInput, error) {
	if err := ValidateQuestionBankDraftAnswerScoringInputRequest(input, request, now); err != nil {
		return QuestionBankDraftAnswerScoringInput{}, err
	}
	normalizedContent, err := NormalizeQuestionBankDraftContent(content)
	if err != nil {
		return QuestionBankDraftAnswerScoringInput{}, err
	}
	answers, err := normalizeQuestionBankDraftSubmittedAnswers(submission.Answers)
	if err != nil {
		return QuestionBankDraftAnswerScoringInput{}, err
	}
	if err := validateQuestionBankDraftAnswerScoringLinkage(request, submission, normalizedContent); err != nil {
		return QuestionBankDraftAnswerScoringInput{}, err
	}
	if err := validateSubmittedAnswersAgainstDraft(answers, normalizedContent); err != nil {
		return QuestionBankDraftAnswerScoringInput{}, err
	}
	items := make([]QuestionBankDraftAnswerScoringInputItem, 0, len(answers))
	draftItems := map[string]QuestionBankDraftItem{}
	for _, item := range normalizedContent.Items {
		draftItems[item.ID] = item
	}
	for _, answer := range answers {
		item := draftItems[answer.ItemID]
		items = append(items, QuestionBankDraftAnswerScoringInputItem{
			ItemID:         item.ID,
			QuestionText:   item.QuestionText,
			AnswerText:     answer.AnswerText,
			ExpectedAnswer: item.ExpectedAnswer,
			Explanation:    item.Explanation,
			LearningTarget: item.LearningTarget,
		})
	}
	return QuestionBankDraftAnswerScoringInput{
		RequestID:                            request.ID,
		ArchiveItemID:                        request.ArchiveItemID,
		GradingInstructions:                  request.GradingInstructions,
		RubricRef:                            request.RubricRef,
		Status:                               request.Status,
		WorkerID:                             input.WorkerID,
		ClaimExpiresAt:                       request.ClaimExpiresAt.UTC(),
		SourceArchiveStudentID:               request.SourceArchiveStudentID,
		SourceQuestionBankDraftRef:           request.SourceQuestionBankDraftRef,
		SourceQuestionBankAnswerSubmissionID: request.SourceQuestionBankAnswerSubmissionID,
		SourceArchiveMaterial:                request.SourceArchiveMaterial,
		TutoringAnalysisRequestID:            normalizedContent.TutoringAnalysisRequestID,
		Items:                                items,
	}, nil
}

func validateQuestionBankDraftAnswerScoringLinkage(
	request AIGradingRequest,
	submission QuestionBankDraftAnswerSubmission,
	content QuestionBankDraftContent,
) error {
	if submission.ID != request.SourceQuestionBankAnswerSubmissionID ||
		submission.QuestionBankDraftRef != request.SourceQuestionBankDraftRef ||
		submission.StudentID != request.SourceArchiveStudentID ||
		submission.ArchiveItemID != request.ArchiveItemID ||
		submission.Status != QuestionBankDraftAnswerSubmissionStatusSubmitted {
		return validationError("question bank answer submission does not match ai grading request")
	}
	if content.QuestionBankDraftRef != request.SourceQuestionBankDraftRef ||
		content.StudentID != request.SourceArchiveStudentID ||
		content.ArchiveItemID != request.ArchiveItemID ||
		content.TutoringAnalysisRequestID != submission.TutoringAnalysisRequestID ||
		content.SourceArchiveMaterial != request.SourceArchiveMaterial {
		return validationError("question bank draft content does not match ai grading request")
	}
	return nil
}

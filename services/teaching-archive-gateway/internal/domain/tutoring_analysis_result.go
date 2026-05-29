package domain

import (
	"strings"
	"time"
	"unicode/utf8"
)

const (
	maxTutoringAnalysisResultSummaryLength = 2000
	maxTutoringAnalysisResultRefLength     = 1000
	maxTutoringAnalysisErrorCodeLength     = 64
	maxTutoringAnalysisErrorMessageLength  = 1000
	maxTutoringAnalysisRequestIDLength     = 200
)

type RecordTutoringAnalysisResultInput struct {
	Principal            PrincipalContext
	RequestID            string
	WorkerID             string
	Status               TutoringAnalysisStatus
	ResultSummary        string
	ResultRef            string
	QuestionBankDraftRef string
	ErrorCode            string
	ErrorMessage         string
}

func ApplyTutoringAnalysisResult(
	request TutoringAnalysisRequest,
	input RecordTutoringAnalysisResultInput,
	completedAt time.Time,
) (TutoringAnalysisRequest, error) {
	if err := AuthorizeRecordTutoringAnalysisResult(input.Principal); err != nil {
		return TutoringAnalysisRequest{}, err
	}

	normalized, err := NormalizeRecordTutoringAnalysisResultInput(request, input)
	if err != nil {
		return TutoringAnalysisRequest{}, err
	}
	if request.Status == TutoringAnalysisStatusSucceeded || request.Status == TutoringAnalysisStatusFailed {
		return TutoringAnalysisRequest{}, ErrConflict
	}
	if !canRecordTutoringAnalysisResult(request, normalized.WorkerID, completedAt.UTC()) {
		return TutoringAnalysisRequest{}, ErrConflict
	}

	updated := request
	updated.Status = normalized.Status
	updated.ResultSummary = normalized.ResultSummary
	updated.ResultRef = normalized.ResultRef
	updated.QuestionBankDraftRef = normalized.QuestionBankDraftRef
	updated.ErrorCode = normalized.ErrorCode
	updated.ErrorMessage = normalized.ErrorMessage
	updated.CompletedAt = completedAt.UTC()
	updated.UpdatedAt = completedAt.UTC()
	return updated, nil
}

func NormalizeRecordTutoringAnalysisResultInput(
	request TutoringAnalysisRequest,
	input RecordTutoringAnalysisResultInput,
) (RecordTutoringAnalysisResultInput, error) {
	requestID, err := NormalizeTutoringAnalysisRequestID(input.RequestID)
	if err != nil {
		return RecordTutoringAnalysisResultInput{}, err
	}
	if request.ID != "" && request.ID != requestID {
		return RecordTutoringAnalysisResultInput{}, validationError("requestId does not match tutoring analysis request")
	}
	workerID, err := normalizeRequiredText(input.WorkerID, maxTutoringAnalysisWorkerIDLength, "workerId")
	if err != nil {
		return RecordTutoringAnalysisResultInput{}, err
	}
	input.WorkerID = workerID

	switch input.Status {
	case TutoringAnalysisStatusSucceeded:
		return normalizeSuccessfulTutoringAnalysisResult(input, requestID, request.QuestionBankIntent)
	case TutoringAnalysisStatusFailed:
		return normalizeFailedTutoringAnalysisResult(input, requestID)
	default:
		return RecordTutoringAnalysisResultInput{}, validationError("status must be SUCCEEDED or FAILED")
	}
}

func AuthorizeRecordTutoringAnalysisResult(principal PrincipalContext) error {
	if err := ValidatePrincipalContext(principal); err != nil {
		return err
	}
	if principal.SubjectType == SubjectService &&
		principal.Role == RoleService &&
		principal.EntryPoint == EntryPointAgentInternal &&
		hasScope(principal, ScopeTeachingWrite) {
		return nil
	}
	return ErrForbidden
}

func canRecordTutoringAnalysisResult(request TutoringAnalysisRequest, workerID string, now time.Time) bool {
	return request.Status == TutoringAnalysisStatusInProgress &&
		request.ClaimedByWorkerID == workerID &&
		!request.ClaimExpiresAt.IsZero() &&
		request.ClaimExpiresAt.After(now.UTC())
}

func NormalizeTutoringAnalysisRequestID(value string) (string, error) {
	normalized, err := normalizeRequiredText(value, maxTutoringAnalysisRequestIDLength, "requestId")
	if err != nil {
		return "", err
	}
	if !strings.HasPrefix(normalized, "tutor_req_") {
		return "", validationError("requestId must use tutor_req_ prefix")
	}
	return normalized, nil
}

func normalizeSuccessfulTutoringAnalysisResult(
	input RecordTutoringAnalysisResultInput,
	requestID string,
	intent QuestionBankIntent,
) (RecordTutoringAnalysisResultInput, error) {
	if strings.TrimSpace(input.ErrorCode) != "" || strings.TrimSpace(input.ErrorMessage) != "" {
		return RecordTutoringAnalysisResultInput{}, validationError("error fields require FAILED status")
	}
	resultSummary, err := normalizeRequiredText(
		input.ResultSummary,
		maxTutoringAnalysisResultSummaryLength,
		"resultSummary",
	)
	if err != nil {
		return RecordTutoringAnalysisResultInput{}, err
	}
	resultRef, err := normalizeRequiredText(input.ResultRef, maxTutoringAnalysisResultRefLength, "resultRef")
	if err != nil {
		return RecordTutoringAnalysisResultInput{}, err
	}
	questionBankDraftRef, err := normalizeOptionalText(
		input.QuestionBankDraftRef,
		maxTutoringAnalysisResultRefLength,
		"questionBankDraftRef",
	)
	if err != nil {
		return RecordTutoringAnalysisResultInput{}, err
	}
	if questionBankDraftRef != "" && intent != QuestionBankIntentGeneratePersonalizedCheck {
		return RecordTutoringAnalysisResultInput{}, validationError("questionBankDraftRef requires personalized check intent")
	}

	return RecordTutoringAnalysisResultInput{
		Principal:            input.Principal,
		RequestID:            requestID,
		WorkerID:             input.WorkerID,
		Status:               TutoringAnalysisStatusSucceeded,
		ResultSummary:        resultSummary,
		ResultRef:            resultRef,
		QuestionBankDraftRef: questionBankDraftRef,
	}, nil
}

func normalizeFailedTutoringAnalysisResult(
	input RecordTutoringAnalysisResultInput,
	requestID string,
) (RecordTutoringAnalysisResultInput, error) {
	if strings.TrimSpace(input.ResultSummary) != "" ||
		strings.TrimSpace(input.ResultRef) != "" ||
		strings.TrimSpace(input.QuestionBankDraftRef) != "" {
		return RecordTutoringAnalysisResultInput{}, validationError("result fields require SUCCEEDED status")
	}
	errorMessage, err := normalizeRequiredText(
		input.ErrorMessage,
		maxTutoringAnalysisErrorMessageLength,
		"errorMessage",
	)
	if err != nil {
		return RecordTutoringAnalysisResultInput{}, err
	}
	errorCode, err := normalizeOptionalText(input.ErrorCode, maxTutoringAnalysisErrorCodeLength, "errorCode")
	if err != nil {
		return RecordTutoringAnalysisResultInput{}, err
	}

	return RecordTutoringAnalysisResultInput{
		Principal:    input.Principal,
		RequestID:    requestID,
		WorkerID:     input.WorkerID,
		Status:       TutoringAnalysisStatusFailed,
		ErrorCode:    errorCode,
		ErrorMessage: errorMessage,
	}, nil
}

func normalizeOptionalText(value string, maxLength int, field string) (string, error) {
	normalized := strings.TrimSpace(value)
	if normalized == "" {
		return "", nil
	}
	if utf8.RuneCountInString(normalized) > maxLength {
		return "", validationError(field + " is too long")
	}
	return normalized, nil
}

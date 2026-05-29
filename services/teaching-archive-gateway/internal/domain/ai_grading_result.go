package domain

import (
	"strings"
	"time"
)

const (
	maxAIGradingScoreSummaryLength = 2000
	maxAIGradingResultRefLength    = 1000
	maxAIGradingErrorCodeLength    = 64
	maxAIGradingErrorMessageLength = 1000
	maxAIGradingRequestIDLength    = 200
)

type RecordAIGradingResultInput struct {
	Principal    PrincipalContext
	RequestID    string
	WorkerID     string
	Status       AIGradingStatus
	ScoreSummary string
	ResultRef    string
	ErrorCode    string
	ErrorMessage string
}

func ApplyAIGradingResult(
	request AIGradingRequest,
	input RecordAIGradingResultInput,
	completedAt time.Time,
) (AIGradingRequest, error) {
	if err := AuthorizeRecordAIGradingResult(input.Principal); err != nil {
		return AIGradingRequest{}, err
	}

	normalized, err := NormalizeRecordAIGradingResultInput(request, input)
	if err != nil {
		return AIGradingRequest{}, err
	}
	if request.Status == AIGradingStatusSucceeded || request.Status == AIGradingStatusFailed {
		return AIGradingRequest{}, ErrConflict
	}
	if !canRecordAIGradingResult(request, normalized.WorkerID, completedAt.UTC()) {
		return AIGradingRequest{}, ErrConflict
	}

	updated := request
	updated.Status = normalized.Status
	updated.ScoreSummary = normalized.ScoreSummary
	updated.ResultRef = normalized.ResultRef
	updated.ErrorCode = normalized.ErrorCode
	updated.ErrorMessage = normalized.ErrorMessage
	updated.CompletedAt = completedAt.UTC()
	updated.UpdatedAt = completedAt.UTC()
	return updated, nil
}

func NormalizeRecordAIGradingResultInput(
	request AIGradingRequest,
	input RecordAIGradingResultInput,
) (RecordAIGradingResultInput, error) {
	requestID, err := NormalizeAIGradingRequestID(input.RequestID)
	if err != nil {
		return RecordAIGradingResultInput{}, err
	}
	if request.ID != "" && request.ID != requestID {
		return RecordAIGradingResultInput{}, validationError("requestId does not match ai grading request")
	}
	workerID, err := normalizeRequiredText(input.WorkerID, maxAIGradingWorkerIDLength, "workerId")
	if err != nil {
		return RecordAIGradingResultInput{}, err
	}
	input.WorkerID = workerID

	switch input.Status {
	case AIGradingStatusSucceeded:
		return normalizeSuccessfulAIGradingResult(input, requestID)
	case AIGradingStatusFailed:
		return normalizeFailedAIGradingResult(input, requestID)
	default:
		return RecordAIGradingResultInput{}, validationError("status must be SUCCEEDED or FAILED")
	}
}

func AuthorizeRecordAIGradingResult(principal PrincipalContext) error {
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

func NormalizeAIGradingRequestID(value string) (string, error) {
	normalized, err := normalizeRequiredText(value, maxAIGradingRequestIDLength, "requestId")
	if err != nil {
		return "", err
	}
	if !strings.HasPrefix(normalized, "grading_req_") {
		return "", validationError("requestId must use grading_req_ prefix")
	}
	return normalized, nil
}

func canRecordAIGradingResult(request AIGradingRequest, workerID string, now time.Time) bool {
	return request.Status == AIGradingStatusInProgress &&
		request.ClaimedByWorkerID == workerID &&
		!request.ClaimExpiresAt.IsZero() &&
		request.ClaimExpiresAt.After(now.UTC())
}

func normalizeSuccessfulAIGradingResult(
	input RecordAIGradingResultInput,
	requestID string,
) (RecordAIGradingResultInput, error) {
	if strings.TrimSpace(input.ErrorCode) != "" || strings.TrimSpace(input.ErrorMessage) != "" {
		return RecordAIGradingResultInput{}, validationError("error fields require FAILED status")
	}
	scoreSummary, err := normalizeRequiredText(
		input.ScoreSummary,
		maxAIGradingScoreSummaryLength,
		"scoreSummary",
	)
	if err != nil {
		return RecordAIGradingResultInput{}, err
	}
	resultRef, err := normalizeRequiredText(input.ResultRef, maxAIGradingResultRefLength, "resultRef")
	if err != nil {
		return RecordAIGradingResultInput{}, err
	}

	return RecordAIGradingResultInput{
		Principal:    input.Principal,
		RequestID:    requestID,
		WorkerID:     input.WorkerID,
		Status:       AIGradingStatusSucceeded,
		ScoreSummary: scoreSummary,
		ResultRef:    resultRef,
	}, nil
}

func normalizeFailedAIGradingResult(
	input RecordAIGradingResultInput,
	requestID string,
) (RecordAIGradingResultInput, error) {
	if strings.TrimSpace(input.ScoreSummary) != "" || strings.TrimSpace(input.ResultRef) != "" {
		return RecordAIGradingResultInput{}, validationError("result fields require SUCCEEDED status")
	}
	errorMessage, err := normalizeRequiredText(
		input.ErrorMessage,
		maxAIGradingErrorMessageLength,
		"errorMessage",
	)
	if err != nil {
		return RecordAIGradingResultInput{}, err
	}
	errorCode, err := normalizeOptionalText(input.ErrorCode, maxAIGradingErrorCodeLength, "errorCode")
	if err != nil {
		return RecordAIGradingResultInput{}, err
	}

	return RecordAIGradingResultInput{
		Principal:    input.Principal,
		RequestID:    requestID,
		WorkerID:     input.WorkerID,
		Status:       AIGradingStatusFailed,
		ErrorCode:    errorCode,
		ErrorMessage: errorMessage,
	}, nil
}

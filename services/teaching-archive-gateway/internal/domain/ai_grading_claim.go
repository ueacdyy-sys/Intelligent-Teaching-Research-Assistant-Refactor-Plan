package domain

import "time"

const (
	defaultAIGradingClaimLeaseSeconds = 300
	minAIGradingClaimLeaseSeconds     = 30
	maxAIGradingClaimLeaseSeconds     = 3600
	maxAIGradingWorkerIDLength        = 128
)

type ClaimAIGradingRequestInput struct {
	Principal    PrincipalContext
	WorkerID     string
	LeaseSeconds int
}

func ApplyAIGradingClaim(
	request AIGradingRequest,
	input ClaimAIGradingRequestInput,
	claimedAt time.Time,
) (AIGradingRequest, error) {
	if err := AuthorizeClaimAIGradingRequest(input.Principal); err != nil {
		return AIGradingRequest{}, err
	}
	normalized, err := NormalizeClaimAIGradingRequestInput(input)
	if err != nil {
		return AIGradingRequest{}, err
	}
	if !canClaimAIGradingRequest(request, claimedAt.UTC()) {
		return AIGradingRequest{}, ErrConflict
	}

	updated := request
	updated.Status = AIGradingStatusInProgress
	updated.ClaimedByWorkerID = normalized.WorkerID
	updated.ClaimExpiresAt = claimedAt.UTC().Add(time.Duration(normalized.LeaseSeconds) * time.Second)
	updated.UpdatedAt = claimedAt.UTC()
	return updated, nil
}

func NormalizeClaimAIGradingRequestInput(
	input ClaimAIGradingRequestInput,
) (ClaimAIGradingRequestInput, error) {
	workerID, err := normalizeRequiredText(input.WorkerID, maxAIGradingWorkerIDLength, "workerId")
	if err != nil {
		return ClaimAIGradingRequestInput{}, err
	}

	leaseSeconds := input.LeaseSeconds
	if leaseSeconds == 0 {
		leaseSeconds = defaultAIGradingClaimLeaseSeconds
	}
	if leaseSeconds < minAIGradingClaimLeaseSeconds ||
		leaseSeconds > maxAIGradingClaimLeaseSeconds {
		return ClaimAIGradingRequestInput{}, validationError("leaseSeconds must be between 30 and 3600")
	}

	return ClaimAIGradingRequestInput{
		Principal:    input.Principal,
		WorkerID:     workerID,
		LeaseSeconds: leaseSeconds,
	}, nil
}

func AuthorizeClaimAIGradingRequest(principal PrincipalContext) error {
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

func canClaimAIGradingRequest(request AIGradingRequest, now time.Time) bool {
	switch request.Status {
	case AIGradingStatusQueued:
		return true
	case AIGradingStatusInProgress:
		return !request.ClaimExpiresAt.IsZero() && !request.ClaimExpiresAt.After(now.UTC())
	default:
		return false
	}
}

func BuildAIGradingClaimLease(
	input ClaimAIGradingRequestInput,
	claimedAt time.Time,
) (ClaimAIGradingRequestInput, time.Time, error) {
	normalized, err := NormalizeClaimAIGradingRequestInput(input)
	if err != nil {
		return ClaimAIGradingRequestInput{}, time.Time{}, err
	}
	return normalized, claimedAt.UTC().Add(time.Duration(normalized.LeaseSeconds) * time.Second), nil
}

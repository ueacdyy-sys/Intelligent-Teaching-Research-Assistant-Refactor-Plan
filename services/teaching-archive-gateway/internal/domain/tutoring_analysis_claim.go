package domain

import "time"

const (
	defaultTutoringAnalysisClaimLeaseSeconds = 300
	minTutoringAnalysisClaimLeaseSeconds     = 30
	maxTutoringAnalysisClaimLeaseSeconds     = 3600
	maxTutoringAnalysisWorkerIDLength        = 128
)

type ClaimTutoringAnalysisRequestInput struct {
	Principal    PrincipalContext
	WorkerID     string
	LeaseSeconds int
}

func ApplyTutoringAnalysisClaim(
	request TutoringAnalysisRequest,
	input ClaimTutoringAnalysisRequestInput,
	claimedAt time.Time,
) (TutoringAnalysisRequest, error) {
	if err := AuthorizeClaimTutoringAnalysisRequest(input.Principal); err != nil {
		return TutoringAnalysisRequest{}, err
	}
	normalized, err := NormalizeClaimTutoringAnalysisRequestInput(input)
	if err != nil {
		return TutoringAnalysisRequest{}, err
	}
	if !canClaimTutoringAnalysisRequest(request, claimedAt.UTC()) {
		return TutoringAnalysisRequest{}, ErrConflict
	}

	updated := request
	updated.Status = TutoringAnalysisStatusInProgress
	updated.ClaimedByWorkerID = normalized.WorkerID
	updated.ClaimExpiresAt = claimedAt.UTC().Add(time.Duration(normalized.LeaseSeconds) * time.Second)
	updated.UpdatedAt = claimedAt.UTC()
	return updated, nil
}

func NormalizeClaimTutoringAnalysisRequestInput(
	input ClaimTutoringAnalysisRequestInput,
) (ClaimTutoringAnalysisRequestInput, error) {
	workerID, err := normalizeRequiredText(input.WorkerID, maxTutoringAnalysisWorkerIDLength, "workerId")
	if err != nil {
		return ClaimTutoringAnalysisRequestInput{}, err
	}

	leaseSeconds := input.LeaseSeconds
	if leaseSeconds == 0 {
		leaseSeconds = defaultTutoringAnalysisClaimLeaseSeconds
	}
	if leaseSeconds < minTutoringAnalysisClaimLeaseSeconds ||
		leaseSeconds > maxTutoringAnalysisClaimLeaseSeconds {
		return ClaimTutoringAnalysisRequestInput{}, validationError("leaseSeconds must be between 30 and 3600")
	}

	return ClaimTutoringAnalysisRequestInput{
		Principal:    input.Principal,
		WorkerID:     workerID,
		LeaseSeconds: leaseSeconds,
	}, nil
}

func AuthorizeClaimTutoringAnalysisRequest(principal PrincipalContext) error {
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

func canClaimTutoringAnalysisRequest(request TutoringAnalysisRequest, now time.Time) bool {
	switch request.Status {
	case TutoringAnalysisStatusQueued:
		return true
	case TutoringAnalysisStatusInProgress:
		return !request.ClaimExpiresAt.IsZero() && !request.ClaimExpiresAt.After(now.UTC())
	default:
		return false
	}
}

func BuildTutoringAnalysisClaimLease(
	input ClaimTutoringAnalysisRequestInput,
	claimedAt time.Time,
) (ClaimTutoringAnalysisRequestInput, time.Time, error) {
	normalized, err := NormalizeClaimTutoringAnalysisRequestInput(input)
	if err != nil {
		return ClaimTutoringAnalysisRequestInput{}, time.Time{}, err
	}
	return normalized, claimedAt.UTC().Add(time.Duration(normalized.LeaseSeconds) * time.Second), nil
}

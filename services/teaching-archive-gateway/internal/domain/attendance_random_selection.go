package domain

import (
	"math"
	"strings"
)

const (
	defaultAttendanceRandomSelectionCount = 1
	maxAttendanceRandomSelectionCount     = 1000
	maxAttendanceSelectionCandidates      = 10000
	maxAttendanceSelectionNameLength      = 128
	maxAttendanceSelectionWeight          = 100
)

type AttendanceRandomSource interface {
	Float64() float64
}

type AttendanceSelectionCandidate struct {
	StudentID         string
	DisplayName       string
	AttendanceCount   int
	AbsenceCount      int
	LateCount         int
	RollcallWeight    float64
	HasRollcallWeight bool
}

type AttendanceRandomSelectionInput struct {
	Principal         PrincipalContext
	SessionID         string
	Count             int
	ExcludePresent    bool
	HasExcludePresent bool
	Weighted          bool
	HasWeighted       bool
	Candidates        []AttendanceSelectionCandidate
}

type AttendanceRandomSelection struct {
	SessionID      string
	RequestedCount int
	EligibleCount  int
	ExcludePresent bool
	Weighted       bool
	Selected       []AttendanceSelectedStudent
}

type AttendanceSelectedStudent struct {
	StudentID            string
	DisplayName          string
	SelectionWeight      float64
	SelectionProbability float64
}

type weightedAttendanceCandidate struct {
	candidate AttendanceSelectionCandidate
	weight    float64
}

func SelectAttendanceRandomStudents(
	session AttendanceSession,
	input AttendanceRandomSelectionInput,
	presentStudentIDs map[string]struct{},
	random AttendanceRandomSource,
) (AttendanceRandomSelection, error) {
	normalized, err := NormalizeAttendanceRandomSelectionInput(input)
	if err != nil {
		return AttendanceRandomSelection{}, err
	}
	if session.ID != normalized.SessionID {
		return AttendanceRandomSelection{}, validationError("sessionId does not match attendance session")
	}
	if session.Status != AttendanceSessionStatusActive {
		return AttendanceRandomSelection{}, ErrAttendanceSessionNotActive
	}
	if random == nil {
		return AttendanceRandomSelection{}, validationError("random source is required")
	}

	eligible := eligibleAttendanceSelectionCandidates(normalized, presentStudentIDs)
	selected := selectWeightedAttendanceCandidates(eligible, normalized.Count, random)
	return AttendanceRandomSelection{
		SessionID:      normalized.SessionID,
		RequestedCount: normalized.Count,
		EligibleCount:  len(eligible),
		ExcludePresent: normalized.ExcludePresent,
		Weighted:       normalized.Weighted,
		Selected:       selected,
	}, nil
}

func NormalizeAttendanceRandomSelectionInput(
	input AttendanceRandomSelectionInput,
) (AttendanceRandomSelectionInput, error) {
	if err := AuthorizeAttendanceRandomSelection(input.Principal); err != nil {
		return AttendanceRandomSelectionInput{}, err
	}
	sessionID, err := NormalizeAttendanceSessionID(input.SessionID)
	if err != nil {
		return AttendanceRandomSelectionInput{}, err
	}
	count := input.Count
	if count == 0 {
		count = defaultAttendanceRandomSelectionCount
	}
	if count < 1 || count > maxAttendanceRandomSelectionCount {
		return AttendanceRandomSelectionInput{}, validationError("count must be between 1 and 1000")
	}
	if len(input.Candidates) > maxAttendanceSelectionCandidates {
		return AttendanceRandomSelectionInput{}, validationError("candidates contains too many students")
	}

	candidates, err := normalizeAttendanceSelectionCandidates(input.Principal, input.Candidates)
	if err != nil {
		return AttendanceRandomSelectionInput{}, err
	}

	weighted := true
	if input.HasWeighted {
		weighted = input.Weighted
	}
	excludePresent := true
	if input.HasExcludePresent {
		excludePresent = input.ExcludePresent
	}

	return AttendanceRandomSelectionInput{
		Principal:         input.Principal,
		SessionID:         sessionID,
		Count:             count,
		ExcludePresent:    excludePresent,
		HasExcludePresent: true,
		Weighted:          weighted,
		HasWeighted:       true,
		Candidates:        candidates,
	}, nil
}

func AuthorizeAttendanceRandomSelection(principal PrincipalContext) error {
	if err := ValidatePrincipalContext(principal); err != nil {
		return err
	}
	if err := requireScope(principal, ScopeTeachingWrite); err != nil {
		return err
	}
	if principal.SubjectType != SubjectUser || principal.EntryPoint != EntryPointDesktopTeacher {
		return ErrForbidden
	}
	if principal.Role == RoleTeacher || principal.Role == RoleAdmin {
		return nil
	}
	return ErrForbidden
}

func normalizeAttendanceSelectionCandidates(
	principal PrincipalContext,
	candidates []AttendanceSelectionCandidate,
) ([]AttendanceSelectionCandidate, error) {
	normalized := make([]AttendanceSelectionCandidate, 0, len(candidates))
	seen := map[string]struct{}{}
	for _, candidate := range candidates {
		studentID, err := normalizeRequiredText(candidate.StudentID, maxArchiveStudentIDLength, "studentId")
		if err != nil {
			return nil, err
		}
		if !hasAssignedStudentAccess(principal, studentID) {
			return nil, ErrForbidden
		}
		if _, ok := seen[studentID]; ok {
			return nil, validationError("candidate studentId is duplicated")
		}
		seen[studentID] = struct{}{}

		displayName, err := normalizeOptionalText(candidate.DisplayName, maxAttendanceSelectionNameLength, "displayName")
		if err != nil {
			return nil, err
		}
		if candidate.AttendanceCount < 0 || candidate.AbsenceCount < 0 || candidate.LateCount < 0 {
			return nil, validationError("attendance counts must be non-negative")
		}
		rollcallWeight := 1.0
		if candidate.HasRollcallWeight {
			if candidate.RollcallWeight <= 0 || candidate.RollcallWeight > maxAttendanceSelectionWeight {
				return nil, validationError("rollcallWeight must be between 0 and 100")
			}
			rollcallWeight = candidate.RollcallWeight
		}

		normalized = append(normalized, AttendanceSelectionCandidate{
			StudentID:         studentID,
			DisplayName:       displayName,
			AttendanceCount:   candidate.AttendanceCount,
			AbsenceCount:      candidate.AbsenceCount,
			LateCount:         candidate.LateCount,
			RollcallWeight:    rollcallWeight,
			HasRollcallWeight: true,
		})
	}
	return normalized, nil
}

func eligibleAttendanceSelectionCandidates(
	input AttendanceRandomSelectionInput,
	presentStudentIDs map[string]struct{},
) []weightedAttendanceCandidate {
	eligible := make([]weightedAttendanceCandidate, 0, len(input.Candidates))
	for _, candidate := range input.Candidates {
		if input.ExcludePresent {
			if _, ok := presentStudentIDs[candidate.StudentID]; ok {
				continue
			}
		}
		weight := 1.0
		if input.Weighted {
			weight = attendanceSelectionWeight(candidate)
		}
		eligible = append(eligible, weightedAttendanceCandidate{candidate: candidate, weight: weight})
	}
	return eligible
}

func attendanceSelectionWeight(candidate AttendanceSelectionCandidate) float64 {
	total := candidate.AttendanceCount + candidate.AbsenceCount + candidate.LateCount
	baseWeight := 1.0
	if total > 0 {
		baseWeight = math.Max(0.1, 2.0-(float64(candidate.AttendanceCount)/float64(total)))
	}
	return baseWeight * candidate.RollcallWeight
}

func selectWeightedAttendanceCandidates(
	eligible []weightedAttendanceCandidate,
	count int,
	random AttendanceRandomSource,
) []AttendanceSelectedStudent {
	remaining := append([]weightedAttendanceCandidate(nil), eligible...)
	selected := make([]AttendanceSelectedStudent, 0, minInt(count, len(remaining)))
	for len(selected) < count && len(remaining) > 0 {
		index, totalWeight := pickAttendanceSelectionIndex(remaining, random.Float64())
		chosen := remaining[index]
		selected = append(selected, AttendanceSelectedStudent{
			StudentID:            chosen.candidate.StudentID,
			DisplayName:          chosen.candidate.DisplayName,
			SelectionWeight:      chosen.weight,
			SelectionProbability: chosen.weight / totalWeight,
		})
		remaining = append(remaining[:index], remaining[index+1:]...)
	}
	return selected
}

func pickAttendanceSelectionIndex(candidates []weightedAttendanceCandidate, randomValue float64) (int, float64) {
	totalWeight := 0.0
	for _, candidate := range candidates {
		totalWeight += candidate.weight
	}
	if totalWeight <= 0 {
		return 0, 1
	}

	randomValue = math.Max(0, math.Min(math.Nextafter(1, 0), randomValue))
	threshold := randomValue * totalWeight
	cumulative := 0.0
	for index, candidate := range candidates {
		cumulative += candidate.weight
		if threshold <= cumulative {
			return index, totalWeight
		}
	}
	return len(candidates) - 1, totalWeight
}

func BuildAttendancePresentStudentSet(studentIDs []string) map[string]struct{} {
	present := make(map[string]struct{}, len(studentIDs))
	for _, studentID := range studentIDs {
		studentID = strings.TrimSpace(studentID)
		if studentID == "" {
			continue
		}
		present[studentID] = struct{}{}
	}
	return present
}

func minInt(left int, right int) int {
	if left < right {
		return left
	}
	return right
}

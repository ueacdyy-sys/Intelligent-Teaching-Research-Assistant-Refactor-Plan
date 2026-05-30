package domain_test

import (
	"errors"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestSelectAttendanceRandomStudentsUsesLegacyWeightsWithoutReplacement(t *testing.T) {
	selection, err := domain.SelectAttendanceRandomStudents(
		activeAttendanceSession(),
		domain.AttendanceRandomSelectionInput{
			Principal: teacherPrincipal(),
			SessionID: " att_sess_domain ",
			Count:     2,
			Candidates: []domain.AttendanceSelectionCandidate{
				{StudentID: "student_001", DisplayName: "A", AttendanceCount: 10, RollcallWeight: 1, HasRollcallWeight: true},
				{StudentID: "student_002", DisplayName: "B", AbsenceCount: 2, RollcallWeight: 1, HasRollcallWeight: true},
				{StudentID: "student_003", DisplayName: "C", RollcallWeight: 3, HasRollcallWeight: true},
			},
		},
		nil,
		&fixedRandomFloats{values: []float64{0.99, 0.8}},
	)
	if err != nil {
		t.Fatalf("SelectAttendanceRandomStudents returned error: %v", err)
	}

	if selection.SessionID != "att_sess_domain" {
		t.Fatalf("SessionID = %q", selection.SessionID)
	}
	if selection.EligibleCount != 3 {
		t.Fatalf("EligibleCount = %d", selection.EligibleCount)
	}
	if len(selection.Selected) != 2 {
		t.Fatalf("selected = %#v", selection.Selected)
	}
	if selection.Selected[0].StudentID != "student_003" || selection.Selected[1].StudentID != "student_002" {
		t.Fatalf("selected order = %#v", selection.Selected)
	}
	if selection.Selected[0].SelectionWeight != 3 {
		t.Fatalf("student_003 weight = %v", selection.Selected[0].SelectionWeight)
	}
}

func TestSelectAttendanceRandomStudentsExcludesPresentStudents(t *testing.T) {
	selection, err := domain.SelectAttendanceRandomStudents(
		activeAttendanceSession(),
		domain.AttendanceRandomSelectionInput{
			Principal: teacherPrincipal(),
			SessionID: "att_sess_domain",
			Count:     2,
			Candidates: []domain.AttendanceSelectionCandidate{
				{StudentID: "student_001"},
				{StudentID: "student_002"},
			},
		},
		map[string]struct{}{"student_001": {}},
		&fixedRandomFloats{values: []float64{0}},
	)
	if err != nil {
		t.Fatalf("SelectAttendanceRandomStudents returned error: %v", err)
	}
	if selection.EligibleCount != 1 || len(selection.Selected) != 1 {
		t.Fatalf("selection = %#v", selection)
	}
	if selection.Selected[0].StudentID != "student_002" {
		t.Fatalf("selected = %#v", selection.Selected)
	}
}

func TestSelectAttendanceRandomStudentsDefaultsCountAndFlags(t *testing.T) {
	selection, err := domain.SelectAttendanceRandomStudents(
		activeAttendanceSession(),
		domain.AttendanceRandomSelectionInput{
			Principal:  teacherPrincipal(),
			SessionID:  "att_sess_domain",
			Candidates: []domain.AttendanceSelectionCandidate{{StudentID: "student_001"}},
		},
		nil,
		&fixedRandomFloats{values: []float64{0}},
	)
	if err != nil {
		t.Fatalf("SelectAttendanceRandomStudents returned error: %v", err)
	}
	if selection.RequestedCount != 1 || !selection.ExcludePresent || !selection.Weighted {
		t.Fatalf("defaults = %#v", selection)
	}
}

func TestSelectAttendanceRandomStudentsRejectsBadCountAndDuplicateCandidates(t *testing.T) {
	for name, input := range map[string]domain.AttendanceRandomSelectionInput{
		"bad count": {
			Principal:  teacherPrincipal(),
			SessionID:  "att_sess_domain",
			Count:      -1,
			Candidates: []domain.AttendanceSelectionCandidate{{StudentID: "student_001"}},
		},
		"duplicate": {
			Principal: teacherPrincipal(),
			SessionID: "att_sess_domain",
			Candidates: []domain.AttendanceSelectionCandidate{
				{StudentID: "student_001"},
				{StudentID: " student_001 "},
			},
		},
	} {
		_, err := domain.SelectAttendanceRandomStudents(activeAttendanceSession(), input, nil, &fixedRandomFloats{})
		if !errors.Is(err, domain.ErrValidation) {
			t.Fatalf("%s error = %v, want ErrValidation", name, err)
		}
	}
}

func TestAuthorizeAttendanceRandomSelectionRejectsStudentAndService(t *testing.T) {
	for name, principal := range map[string]domain.PrincipalContext{
		"student": studentPrincipal("student_001"),
		"service": servicePrincipal(),
	} {
		err := domain.AuthorizeAttendanceRandomSelection(principal)
		if !errors.Is(err, domain.ErrForbidden) {
			t.Fatalf("%s error = %v, want ErrForbidden", name, err)
		}
	}
}

func TestSelectAttendanceRandomStudentsRejectsUnassignedCandidate(t *testing.T) {
	_, err := domain.SelectAttendanceRandomStudents(
		activeAttendanceSession(),
		domain.AttendanceRandomSelectionInput{
			Principal: teacherPrincipalAssignedForRandom("student_001"),
			SessionID: "att_sess_domain",
			Candidates: []domain.AttendanceSelectionCandidate{
				{StudentID: "student_002"},
			},
		},
		nil,
		&fixedRandomFloats{},
	)
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

type fixedRandomFloats struct {
	values []float64
	index  int
}

func (f *fixedRandomFloats) Float64() float64 {
	if len(f.values) == 0 {
		return 0
	}
	if f.index >= len(f.values) {
		return f.values[len(f.values)-1]
	}
	value := f.values[f.index]
	f.index++
	return value
}

func teacherPrincipalAssignedForRandom(studentIDs ...string) domain.PrincipalContext {
	principal := teacherPrincipal()
	principal.StudentAccess.StudentIDs = append([]string(nil), studentIDs...)
	return principal
}

package domain_test

import (
	"errors"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNormalizeListStudentAppArchiveItemsScopesOwnStudentArchive(t *testing.T) {
	query, err := domain.NormalizeListStudentAppArchiveItemsInput(domain.ListStudentAppArchiveItemsInput{
		Principal:    studentPrincipal("student_001"),
		MaterialType: domain.MaterialTypeHandout,
		Query:        "  fractions   packet  ",
		PageSize:     25,
	})
	if err != nil {
		t.Fatalf("NormalizeListStudentAppArchiveItemsInput returned error: %v", err)
	}
	if query.OwnerType != domain.OwnerTypeStudent {
		t.Fatalf("OwnerType = %q", query.OwnerType)
	}
	if query.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", query.StudentID)
	}
	if query.MaterialType != domain.MaterialTypeHandout {
		t.Fatalf("MaterialType = %q", query.MaterialType)
	}
	if query.SearchText != "fractions packet" {
		t.Fatalf("SearchText = %q", query.SearchText)
	}
	if query.FetchLimit != 26 {
		t.Fatalf("FetchLimit = %d", query.FetchLimit)
	}
}

func TestNormalizeListStudentAppArchiveItemsRejectsUnsafeQuery(t *testing.T) {
	for name, query := range map[string]string{
		"too long":         "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"control char":     "fractions\npacket",
		"control tab char": "fractions\tpacket",
	} {
		t.Run(name, func(t *testing.T) {
			_, err := domain.NormalizeListStudentAppArchiveItemsInput(domain.ListStudentAppArchiveItemsInput{
				Principal: studentPrincipal("student_001"),
				Query:     query,
			})
			if !errors.Is(err, domain.ErrValidation) {
				t.Fatalf("error = %v, want ErrValidation", err)
			}
		})
	}
}

func TestNormalizeListStudentAppArchiveItemsRejectsTeachingMaterialFilter(t *testing.T) {
	_, err := domain.NormalizeListStudentAppArchiveItemsInput(domain.ListStudentAppArchiveItemsInput{
		Principal:    studentPrincipal("student_001"),
		MaterialType: domain.MaterialTypeTeachingMaterial,
	})
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestNormalizeListStudentAppArchiveItemsRejectsNonStudentAppPrincipals(t *testing.T) {
	studentWithoutOwnRead := studentPrincipal("student_001")
	studentWithoutOwnRead.Scopes = []domain.Scope{domain.ScopeTeachingRead}

	for name, principal := range map[string]domain.PrincipalContext{
		"teacher desktop":  teacherPrincipal(),
		"remote social":    remoteSocialPrincipal(),
		"service":          servicePrincipal(),
		"missing own read": studentWithoutOwnRead,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := domain.NormalizeListStudentAppArchiveItemsInput(domain.ListStudentAppArchiveItemsInput{
				Principal: principal,
			})
			if !errors.Is(err, domain.ErrForbidden) {
				t.Fatalf("error = %v, want ErrForbidden", err)
			}
		})
	}
}

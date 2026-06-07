package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestListStudentAppArchiveItemsScopesOwnStudentBeforePublishedProjectionRead(t *testing.T) {
	reader := &fakeReader{
		items: []domain.ArchiveItem{
			archiveItem("tarch_own", "student_001", time.Date(2026, 5, 30, 11, 0, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewListStudentAppArchiveItems(reader)

	page, err := uc.Execute(context.Background(), domain.ListStudentAppArchiveItemsInput{
		Principal:    studentPrincipal("student_001"),
		MaterialType: domain.MaterialTypeQuiz,
		PageSize:     10,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if reader.reads != 0 {
		t.Fatalf("generic reads = %d, want 0", reader.reads)
	}
	if reader.publishedReads != 1 {
		t.Fatalf("published reads = %d, want 1", reader.publishedReads)
	}
	if reader.publishedQuery.OwnerType != domain.OwnerTypeStudent {
		t.Fatalf("OwnerType = %q", reader.publishedQuery.OwnerType)
	}
	if reader.publishedQuery.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", reader.publishedQuery.StudentID)
	}
	if reader.publishedQuery.MaterialType != domain.MaterialTypeQuiz {
		t.Fatalf("MaterialType = %q", reader.publishedQuery.MaterialType)
	}
	if len(page.Items) != 1 {
		t.Fatalf("items = %d", len(page.Items))
	}
}

func TestListStudentAppArchiveItemsRejectsForbiddenWithoutRepositoryRead(t *testing.T) {
	reader := &fakeReader{}
	uc := usecase.NewListStudentAppArchiveItems(reader)

	_, err := uc.Execute(context.Background(), domain.ListStudentAppArchiveItemsInput{
		Principal: remotePrincipal(),
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if reader.reads != 0 {
		t.Fatalf("generic reads = %d", reader.reads)
	}
	if reader.publishedReads != 0 {
		t.Fatalf("published reads = %d", reader.publishedReads)
	}
}

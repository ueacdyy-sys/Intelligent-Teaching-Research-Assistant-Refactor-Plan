package usecase_test

import (
	"context"
	"errors"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestReadStudentAppArchiveItemSearchSummaryScopesOwnStudentBeforeCount(t *testing.T) {
	reader := &fakeReader{
		materialTypeCounts: map[domain.MaterialType]int{
			domain.MaterialTypeQuiz:     1,
			domain.MaterialTypeHandout:  2,
			domain.MaterialTypeHomework: 1,
		},
	}
	uc := usecase.NewReadStudentAppArchiveItemSearchSummary(reader)

	summary, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemSearchSummaryInput{
		Principal:    studentPrincipal("student_001"),
		MaterialType: domain.MaterialTypeHandout,
		Query:        "fractions",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if reader.materialTypeCountReads != 1 || reader.publishedReads != 0 || reader.reads != 0 {
		t.Fatalf("count/list reads = %d/%d/%d", reader.materialTypeCountReads, reader.publishedReads, reader.reads)
	}
	if reader.materialTypeCountQuery.OwnerType != domain.OwnerTypeStudent ||
		reader.materialTypeCountQuery.StudentID != "student_001" ||
		reader.materialTypeCountQuery.MaterialType != domain.MaterialTypeHandout ||
		reader.materialTypeCountQuery.SearchText != "fractions" ||
		reader.materialTypeCountQuery.FetchLimit != 0 {
		t.Fatalf("query = %#v", reader.materialTypeCountQuery)
	}
	if summary.TotalCount != 4 ||
		summary.QuizCount != 1 ||
		summary.HandoutCount != 2 ||
		summary.HomeworkCount != 1 {
		t.Fatalf("summary = %#v", summary)
	}
}

func TestReadStudentAppArchiveItemSearchSummaryRejectsForbiddenBeforeCount(t *testing.T) {
	reader := &fakeReader{}
	uc := usecase.NewReadStudentAppArchiveItemSearchSummary(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemSearchSummaryInput{
		Principal: remotePrincipal(),
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if reader.materialTypeCountReads != 0 || reader.publishedReads != 0 || reader.reads != 0 {
		t.Fatalf("count/list reads = %d/%d/%d", reader.materialTypeCountReads, reader.publishedReads, reader.reads)
	}
}

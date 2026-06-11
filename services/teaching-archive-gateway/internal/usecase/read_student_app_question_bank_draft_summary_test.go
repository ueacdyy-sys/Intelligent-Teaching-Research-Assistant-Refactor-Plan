package usecase_test

import (
	"context"
	"errors"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestReadStudentAppQuestionBankDraftSummaryScopesOwnDraftsBeforeCount(t *testing.T) {
	reader := &fakeStudentAppQuestionBankDraftSummaryReader{
		counts: map[domain.MaterialType]int{
			domain.MaterialTypeQuiz:    2,
			domain.MaterialTypeHandout: 1,
		},
	}
	uc := usecase.NewReadStudentAppQuestionBankDraftSummary(reader)

	summary, err := uc.Execute(context.Background(), domain.ReadStudentAppQuestionBankDraftSummaryInput{
		Principal: studentPrincipal("student_001"),
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if reader.countReads != 1 {
		t.Fatalf("countReads = %d, want 1", reader.countReads)
	}
	if reader.query.Status != domain.TutoringAnalysisStatusSucceeded ||
		reader.query.SourceArchiveOwnerType != domain.OwnerTypeStudent ||
		reader.query.StudentID != "student_001" ||
		!reader.query.RequireQuestionBankDraftRef {
		t.Fatalf("query = %#v", reader.query)
	}
	if summary.TotalCount != 3 ||
		summary.QuizCount != 2 ||
		summary.HandoutCount != 1 {
		t.Fatalf("summary = %#v", summary)
	}
}

func TestReadStudentAppQuestionBankDraftSummaryRejectsForbiddenBeforeCount(t *testing.T) {
	reader := &fakeStudentAppQuestionBankDraftSummaryReader{}
	uc := usecase.NewReadStudentAppQuestionBankDraftSummary(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppQuestionBankDraftSummaryInput{
		Principal: remotePrincipal(),
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if reader.countReads != 0 {
		t.Fatalf("countReads = %d", reader.countReads)
	}
}

type fakeStudentAppQuestionBankDraftSummaryReader struct {
	counts     map[domain.MaterialType]int
	query      domain.TutoringAnalysisRequestQuery
	countReads int
}

func (f *fakeStudentAppQuestionBankDraftSummaryReader) CountQuestionBankDraftsBySourceMaterial(
	_ context.Context,
	query domain.TutoringAnalysisRequestQuery,
) (map[domain.MaterialType]int, error) {
	f.countReads++
	f.query = query
	return f.counts, nil
}

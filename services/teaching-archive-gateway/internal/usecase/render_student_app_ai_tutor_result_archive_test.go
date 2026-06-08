package usecase_test

import (
	"context"
	"errors"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestRenderStudentAppAITutorResultArchiveUsesSafeCardReader(t *testing.T) {
	reader := &fakeAITutorResultArchiveCardReader{card: aiTutorResultArchiveCard()}
	uc := usecase.NewRenderStudentAppAITutorResultArchive(reader)

	rendered, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_student_ai_tutor_result_001",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if reader.reads != 1 ||
		rendered.RenderFormat != domain.StudentAppAITutorResultArchiveRenderFormatSafeTextBlocks ||
		len(rendered.Blocks) != 3 {
		t.Fatalf("reads=%d rendered=%#v", reader.reads, rendered)
	}
}

func TestRenderStudentAppAITutorResultArchivePropagatesReaderBoundaryErrors(t *testing.T) {
	reader := &fakeAITutorResultArchiveCardReader{err: domain.ErrForbidden}
	uc := usecase.NewRenderStudentAppAITutorResultArchive(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemInput{
		Principal:     teacherPrincipal(),
		ArchiveItemID: "tarch_student_ai_tutor_result_001",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

type fakeAITutorResultArchiveCardReader struct {
	card  domain.StudentAppAITutorResultArchiveCard
	err   error
	reads int
}

func (f *fakeAITutorResultArchiveCardReader) Execute(
	_ context.Context,
	_ domain.ReadStudentAppArchiveItemInput,
) (domain.StudentAppAITutorResultArchiveCard, error) {
	f.reads++
	return f.card, f.err
}

func aiTutorResultArchiveCard() domain.StudentAppAITutorResultArchiveCard {
	card, err := domain.BuildStudentAppAITutorResultArchiveCard(
		normalizedAITutorResultArchiveInput("tarch_student_ai_tutor_result_001", "student_001"),
		aiTutorResultArchiveItem("tarch_student_ai_tutor_result_001", "student_001"),
		aiTutorResultArchiveSnapshot("tarch_student_ai_tutor_result_001", "student_001"),
	)
	if err != nil {
		panic(err)
	}
	return card
}

func normalizedAITutorResultArchiveInput(
	archiveItemID string,
	studentID string,
) domain.NormalizedReadStudentAppArchiveItemInput {
	return domain.NormalizedReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal(studentID),
		ArchiveItemID: archiveItemID,
		StudentID:     studentID,
	}
}

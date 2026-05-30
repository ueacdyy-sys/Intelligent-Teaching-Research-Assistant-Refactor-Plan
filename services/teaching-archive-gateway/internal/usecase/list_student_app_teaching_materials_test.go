package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestListStudentAppTeachingMaterialsScopesQueryBeforeRepository(t *testing.T) {
	reader := &fakeReader{
		items: []domain.ArchiveItem{
			studentAppTeachingMaterial("tarch_teaching_material_2", time.Date(2026, 5, 30, 10, 2, 0, 0, time.UTC)),
			studentAppTeachingMaterial("tarch_teaching_material_1", time.Date(2026, 5, 30, 10, 1, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewListStudentAppTeachingMaterials(reader)

	page, err := uc.Execute(context.Background(), domain.ListStudentAppTeachingMaterialsInput{
		Principal: studentPrincipal("student_001"),
		PageSize:  1,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if reader.query.OwnerType != domain.OwnerTypeTeaching {
		t.Fatalf("OwnerType = %q", reader.query.OwnerType)
	}
	if reader.query.MaterialType != domain.MaterialTypeTeachingMaterial {
		t.Fatalf("MaterialType = %q", reader.query.MaterialType)
	}
	if reader.query.StudentID != "" || len(reader.query.StudentIDs) != 0 {
		t.Fatalf("student filters = %q %#v", reader.query.StudentID, reader.query.StudentIDs)
	}
	if len(page.Items) != 1 || !page.PageInfo.HasMore {
		t.Fatalf("page = %#v", page)
	}
}

func TestListStudentAppTeachingMaterialsRejectsInvalidPaginationBeforeRepository(t *testing.T) {
	reader := &fakeReader{}
	uc := usecase.NewListStudentAppTeachingMaterials(reader)

	_, err := uc.Execute(context.Background(), domain.ListStudentAppTeachingMaterialsInput{
		Principal: studentPrincipal("student_001"),
		PageSize:  101,
	})
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
	if reader.reads != 0 {
		t.Fatalf("reader reads = %d", reader.reads)
	}
}

func studentAppTeachingMaterial(id string, createdAt time.Time) domain.ArchiveItem {
	return domain.ArchiveItem{
		ID:              id,
		OwnerType:       domain.OwnerTypeTeaching,
		MaterialType:    domain.MaterialTypeTeachingMaterial,
		Title:           "Lesson Material",
		Source:          domain.SourceTeacherUpload,
		ContentRef:      "local://teaching/materials/lesson.pdf",
		Tags:            []string{"lesson"},
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly},
		OCRStatus:       domain.OCRStatusNotRequired,
		CreatedAt:       createdAt,
	}
}

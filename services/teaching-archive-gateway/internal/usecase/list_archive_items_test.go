package usecase_test

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestListArchiveItemsNormalizesFiltersAndBuildsNextCursor(t *testing.T) {
	reader := &fakeReader{
		items: []domain.ArchiveItem{
			archiveItem("tarch_3", "student_001", time.Date(2026, 5, 29, 10, 3, 0, 0, time.UTC)),
			archiveItem("tarch_2", "student_001", time.Date(2026, 5, 29, 10, 2, 0, 0, time.UTC)),
			archiveItem("tarch_1", "student_001", time.Date(2026, 5, 29, 10, 1, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewListArchiveItems(reader)

	page, err := uc.Execute(context.Background(), domain.ListArchiveItemsInput{
		Principal:    teacherPrincipal(),
		OwnerType:    domain.OwnerTypeStudent,
		StudentID:    " student_001 ",
		MaterialType: domain.MaterialTypeQuiz,
		PageSize:     2,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if reader.query.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", reader.query.StudentID)
	}
	if reader.query.FetchLimit != 3 {
		t.Fatalf("FetchLimit = %d", reader.query.FetchLimit)
	}
	if len(page.Items) != 2 {
		t.Fatalf("items = %d", len(page.Items))
	}
	if !page.PageInfo.HasMore || page.PageInfo.NextCursor == "" {
		t.Fatalf("pageInfo = %#v", page.PageInfo)
	}
}

func TestListArchiveItemsDecodesCursor(t *testing.T) {
	cursor, err := domain.EncodeArchiveCursor(archiveItem(
		"tarch_2",
		"student_001",
		time.Date(2026, 5, 29, 10, 2, 0, 0, time.UTC),
	))
	if err != nil {
		t.Fatalf("EncodeArchiveCursor error: %v", err)
	}
	reader := &fakeReader{}
	uc := usecase.NewListArchiveItems(reader)

	if _, err := uc.Execute(context.Background(), domain.ListArchiveItemsInput{Principal: teacherPrincipal(), Cursor: cursor}); err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if reader.query.Cursor == nil || reader.query.Cursor.ID != "tarch_2" {
		t.Fatalf("cursor = %#v", reader.query.Cursor)
	}
}

func TestListArchiveItemsRejectsInvalidPageSizeAndCursor(t *testing.T) {
	uc := usecase.NewListArchiveItems(&fakeReader{})

	_, pageSizeErr := uc.Execute(context.Background(), domain.ListArchiveItemsInput{Principal: teacherPrincipal(), PageSize: 101})
	if !errors.Is(pageSizeErr, domain.ErrValidation) {
		t.Fatalf("pageSize error = %v, want ErrValidation", pageSizeErr)
	}

	_, cursorErr := uc.Execute(context.Background(), domain.ListArchiveItemsInput{Principal: teacherPrincipal(), Cursor: "not-a-cursor"})
	if !errors.Is(cursorErr, domain.ErrValidation) {
		t.Fatalf("cursor error = %v, want ErrValidation", cursorErr)
	}
}

func TestListArchiveItemsScopesStudentOwnQueryBeforeRepository(t *testing.T) {
	reader := &fakeReader{}
	uc := usecase.NewListArchiveItems(reader)

	_, err := uc.Execute(context.Background(), domain.ListArchiveItemsInput{
		Principal: studentPrincipal("student_001"),
		OwnerType: domain.OwnerTypeStudent,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if reader.query.StudentID != "student_001" {
		t.Fatalf("StudentID = %q, want student_001", reader.query.StudentID)
	}
}

func TestListArchiveItemsScopesAssignedStudentIDsBeforeRepository(t *testing.T) {
	reader := &fakeReader{}
	uc := usecase.NewListArchiveItems(reader)

	_, err := uc.Execute(context.Background(), domain.ListArchiveItemsInput{
		Principal: teacherPrincipalWithStudents("student_001", "student_002"),
		OwnerType: domain.OwnerTypeStudent,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if !reflect.DeepEqual(reader.query.StudentIDs, []string{"student_001", "student_002"}) {
		t.Fatalf("StudentIDs = %#v", reader.query.StudentIDs)
	}
}

func TestListArchiveItemsRejectsRemoteSocialPrincipal(t *testing.T) {
	reader := &fakeReader{}
	uc := usecase.NewListArchiveItems(reader)

	_, err := uc.Execute(context.Background(), domain.ListArchiveItemsInput{
		Principal: remotePrincipal(),
		OwnerType: domain.OwnerTypeTeaching,
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if reader.reads != 0 {
		t.Fatalf("reader reads = %d", reader.reads)
	}
}

func TestListArchiveItemsPreventsStudentReadingOtherArchive(t *testing.T) {
	reader := &fakeReader{}
	uc := usecase.NewListArchiveItems(reader)

	_, err := uc.Execute(context.Background(), domain.ListArchiveItemsInput{
		Principal: studentPrincipal("student_001"),
		OwnerType: domain.OwnerTypeStudent,
		StudentID: "student_002",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if reader.reads != 0 {
		t.Fatalf("reader reads = %d", reader.reads)
	}
}

type fakeReader struct {
	query                     domain.ArchiveItemQuery
	publishedQuery            domain.ArchiveItemQuery
	item                      domain.ArchiveItem
	items                     []domain.ArchiveItem
	ok                        bool
	reads                     int
	publishedReads            int
	genericGetReads           int
	publishedGetReads         int
	contentPreview            domain.PublishedArchiveMaterialContentPreview
	contentPreviewOK          bool
	contentPreviewReads       int
	contentPreviewArchiveID   string
	contentPreviewStudentID   string
	publishedGetArchiveItemID string
	publishedGetStudentID     string
}

func (f *fakeReader) List(_ context.Context, query domain.ArchiveItemQuery) ([]domain.ArchiveItem, error) {
	f.query = query
	f.reads++
	return f.items, nil
}

func (f *fakeReader) ListPublishedForStudentApp(_ context.Context, query domain.ArchiveItemQuery) ([]domain.ArchiveItem, error) {
	f.publishedQuery = query
	f.publishedReads++
	return f.items, nil
}

func (f *fakeReader) GetByID(_ context.Context, id string) (domain.ArchiveItem, bool, error) {
	f.genericGetReads++
	for _, item := range f.items {
		if item.ID == id {
			return item, true, nil
		}
	}
	return f.item, f.ok, nil
}

func (f *fakeReader) GetPublishedForStudentApp(
	_ context.Context,
	archiveItemID string,
	studentID string,
) (domain.ArchiveItem, bool, error) {
	f.publishedGetReads++
	f.publishedGetArchiveItemID = archiveItemID
	f.publishedGetStudentID = studentID
	return f.item, f.ok, nil
}

func (f *fakeReader) GetPublishedContentPreviewForStudentApp(
	_ context.Context,
	archiveItemID string,
	studentID string,
) (domain.PublishedArchiveMaterialContentPreview, bool, error) {
	f.contentPreviewReads++
	f.contentPreviewArchiveID = archiveItemID
	f.contentPreviewStudentID = studentID
	return f.contentPreview, f.contentPreviewOK, nil
}

func archiveItem(id string, studentID string, createdAt time.Time) domain.ArchiveItem {
	return domain.ArchiveItem{
		ID:              id,
		OwnerType:       domain.OwnerTypeStudent,
		StudentID:       studentID,
		MaterialType:    domain.MaterialTypeQuiz,
		Title:           "Quiz",
		Source:          domain.SourceTeacherUpload,
		ContentRef:      "local://archive/student/quiz.pdf",
		Tags:            []string{"math"},
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentTutoring},
		OCRStatus:       domain.OCRStatusNotRequired,
		CreatedAt:       createdAt,
	}
}

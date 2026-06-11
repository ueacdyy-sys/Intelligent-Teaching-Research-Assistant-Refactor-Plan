package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestCreateTutoringAnalysisRequestAllowsStudentOwnArchive(t *testing.T) {
	repo := &fakeTutoringRepository{
		items: map[string]domain.ArchiveItem{
			"tarch_student": archiveItem("tarch_student", "student_001", time.Date(2026, 5, 29, 10, 0, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewCreateTutoringAnalysisRequest(repo, fixedIDs{id: "tutor_req_fixed"}, fixedClock{})

	got, err := uc.Execute(context.Background(), domain.CreateTutoringAnalysisRequestInput{
		Principal:          studentPrincipal("student_001"),
		ArchiveItemID:      "tarch_student",
		AnalysisGoal:       "find weak skills",
		QuestionBankIntent: domain.QuestionBankIntentGeneratePersonalizedCheck,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if got.ID != "tutor_req_fixed" {
		t.Fatalf("ID = %q", got.ID)
	}
	if got.RequestedByPrincipalID != "student_001" {
		t.Fatalf("RequestedByPrincipalID = %q", got.RequestedByPrincipalID)
	}
	if repo.creates != 1 {
		t.Fatalf("creates = %d", repo.creates)
	}
}

func TestCreateTutoringAnalysisRequestRejectsOtherStudentArchive(t *testing.T) {
	repo := &fakeTutoringRepository{
		items: map[string]domain.ArchiveItem{
			"tarch_other": archiveItem("tarch_other", "student_002", time.Date(2026, 5, 29, 10, 0, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewCreateTutoringAnalysisRequest(repo, fixedIDs{id: "tutor_req_fixed"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateTutoringAnalysisRequestInput{
		Principal:          studentPrincipal("student_001"),
		ArchiveItemID:      "tarch_other",
		AnalysisGoal:       "find weak skills",
		QuestionBankIntent: domain.QuestionBankIntentGeneratePersonalizedCheck,
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.creates != 0 {
		t.Fatalf("creates = %d", repo.creates)
	}
}

func TestCreateTutoringAnalysisRequestRejectsRemotePrincipal(t *testing.T) {
	repo := &fakeTutoringRepository{
		items: map[string]domain.ArchiveItem{
			"tarch_teaching": {
				ID:           "tarch_teaching",
				OwnerType:    domain.OwnerTypeTeaching,
				MaterialType: domain.MaterialTypeTeachingMaterial,
				CreatedAt:    time.Date(2026, 5, 29, 10, 0, 0, 0, time.UTC),
			},
		},
	}
	uc := usecase.NewCreateTutoringAnalysisRequest(repo, fixedIDs{id: "tutor_req_fixed"}, fixedClock{})

	_, err := uc.Execute(context.Background(), domain.CreateTutoringAnalysisRequestInput{
		Principal:          remotePrincipal(),
		ArchiveItemID:      "tarch_teaching",
		AnalysisGoal:       "prepare tutoring",
		QuestionBankIntent: domain.QuestionBankIntentGeneratePersonalizedCheck,
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if repo.creates != 0 {
		t.Fatalf("creates = %d", repo.creates)
	}
}

type fakeTutoringRepository struct {
	items                             map[string]domain.ArchiveItem
	creates                           int
	createdRequest                    domain.TutoringAnalysisRequest
	genericGetReads                   int
	publishedItem                     domain.ArchiveItem
	publishedOK                       bool
	publishedGetReads                 int
	contentPreview                    domain.PublishedArchiveMaterialContentPreview
	contentPreviewOK                  bool
	contentPreviewReads               int
	resultArchiveSnapshot             domain.StudentAppAITutorResultArchiveSnapshot
	resultArchiveSnapshotOK           bool
	resultArchiveSnapshotReads        int
	questionBankFeedbackSnapshot      domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot
	questionBankFeedbackSnapshotOK    bool
	questionBankFeedbackSnapshotReads int
	questionBankSubmission            domain.QuestionBankDraftAnswerSubmission
	questionBankSubmissionOK          bool
	questionBankSubmissionReads       int
	pendingResultArchiveFollowUp      domain.TutoringAnalysisRequest
	pendingResultArchiveFollowUpOK    bool
	pendingResultArchiveFollowUpReads int
}

func (f *fakeTutoringRepository) GetByID(_ context.Context, id string) (domain.ArchiveItem, bool, error) {
	f.genericGetReads++
	item, ok := f.items[id]
	return item, ok, nil
}

func (f *fakeTutoringRepository) GetPublishedForStudentApp(
	_ context.Context,
	_ string,
	_ string,
) (domain.ArchiveItem, bool, error) {
	f.publishedGetReads++
	return f.publishedItem, f.publishedOK, nil
}

func (f *fakeTutoringRepository) GetPublishedContentPreviewForStudentApp(
	_ context.Context,
	_ string,
	_ string,
) (domain.PublishedArchiveMaterialContentPreview, bool, error) {
	f.contentPreviewReads++
	return f.contentPreview, f.contentPreviewOK, nil
}

func (f *fakeTutoringRepository) GetStudentAppAITutorResultArchiveSnapshot(
	_ context.Context,
	_ string,
	_ string,
) (domain.StudentAppAITutorResultArchiveSnapshot, bool, error) {
	f.resultArchiveSnapshotReads++
	return f.resultArchiveSnapshot, f.resultArchiveSnapshotOK, nil
}

func (f *fakeTutoringRepository) GetQuestionBankDraftAnswerFeedbackArchiveSnapshotByFeedbackArchiveItemForStudent(
	_ context.Context,
	_ string,
	_ string,
) (domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot, bool, error) {
	f.questionBankFeedbackSnapshotReads++
	return f.questionBankFeedbackSnapshot, f.questionBankFeedbackSnapshotOK, nil
}

func (f *fakeTutoringRepository) GetQuestionBankDraftAnswerSubmissionForStudent(
	_ context.Context,
	_ string,
	_ string,
) (domain.QuestionBankDraftAnswerSubmission, bool, error) {
	f.questionBankSubmissionReads++
	return f.questionBankSubmission, f.questionBankSubmissionOK, nil
}

func (f *fakeTutoringRepository) CreateTutoringAnalysisRequest(
	_ context.Context,
	request domain.TutoringAnalysisRequest,
) error {
	f.creates++
	f.createdRequest = request
	return nil
}

func (f *fakeTutoringRepository) FindPendingStudentAppAITutorResultArchiveFollowUpRequest(
	_ context.Context,
	query domain.StudentAppAITutorResultArchiveFollowUpPendingRequestQuery,
) (domain.TutoringAnalysisRequest, bool, error) {
	f.pendingResultArchiveFollowUpReads++
	if !f.pendingResultArchiveFollowUpOK ||
		f.pendingResultArchiveFollowUp.ArchiveItemID != query.ArchiveItemID ||
		f.pendingResultArchiveFollowUp.RequestedByPrincipalID != query.RequestedByPrincipalID ||
		f.pendingResultArchiveFollowUp.QuestionBankIntent != query.QuestionBankIntent ||
		f.pendingResultArchiveFollowUp.FollowUpDepth != query.FollowUpDepth ||
		f.pendingResultArchiveFollowUp.SourceArchiveStudentID != query.StudentID ||
		domain.TutoringAnalysisRequestLearningActionSource(f.pendingResultArchiveFollowUp) != domain.StudentAppAITutorLearningActionSourceResultArchive ||
		!domain.IsPendingTutoringAnalysisStatus(f.pendingResultArchiveFollowUp.Status) {
		return domain.TutoringAnalysisRequest{}, false, nil
	}
	return f.pendingResultArchiveFollowUp, true, nil
}

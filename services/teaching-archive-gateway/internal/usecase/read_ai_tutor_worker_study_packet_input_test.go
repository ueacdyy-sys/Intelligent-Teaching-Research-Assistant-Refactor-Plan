package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestReadAITutorWorkerStudyPacketInputUsesClaimedRequestAndPublishedStudyPacket(t *testing.T) {
	now := time.Date(2026, 6, 8, 10, 0, 0, 0, time.UTC)
	repo := &fakeAITutorWorkerStudyPacketRepository{
		request:        claimedTutoringRequestForWorkerInput(now),
		requestOK:      true,
		publishedItem:  archiveItem("tarch_archive_material_001", "student_001", now.Add(-10*time.Minute)),
		publishedOK:    true,
		contentPreview: contentPreviewFixture("tarch_archive_material_001", "student_001"),
		previewOK:      true,
	}
	repo.publishedItem.Title = "Fractions practice packet"
	repo.publishedItem.MaterialType = domain.MaterialTypeHandout
	repo.contentPreview.Title = "Fractions practice packet"
	repo.contentPreview.MaterialType = domain.MaterialTypeHandout
	uc := usecase.NewReadAITutorWorkerStudyPacketInput(repo, fixedClock{now: now})

	input, err := uc.Execute(context.Background(), domain.ReadAITutorWorkerStudyPacketInputInput{
		Principal: servicePrincipal(),
		RequestID: "tutor_req_worker_input",
		WorkerID:  "worker_student_tutor_01",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if input.RequestID != "tutor_req_worker_input" ||
		input.PacketStatus != domain.StudentAppArchiveItemStudyPacketStatusReady ||
		len(input.Blocks) != 1 {
		t.Fatalf("input = %#v", input)
	}
	if repo.requestReads != 1 || repo.publishedReads != 1 || repo.previewReads != 1 {
		t.Fatalf("reads request:%d published:%d preview:%d", repo.requestReads, repo.publishedReads, repo.previewReads)
	}
	if repo.genericGetReads != 0 {
		t.Fatalf("generic GetByID reads = %d", repo.genericGetReads)
	}
}

func TestReadAITutorWorkerStudyPacketInputRejectsWrongWorkerBeforePublishedReads(t *testing.T) {
	now := time.Date(2026, 6, 8, 10, 0, 0, 0, time.UTC)
	repo := &fakeAITutorWorkerStudyPacketRepository{
		request:   claimedTutoringRequestForWorkerInput(now),
		requestOK: true,
	}
	uc := usecase.NewReadAITutorWorkerStudyPacketInput(repo, fixedClock{now: now})

	_, err := uc.Execute(context.Background(), domain.ReadAITutorWorkerStudyPacketInputInput{
		Principal: servicePrincipal(),
		RequestID: "tutor_req_worker_input",
		WorkerID:  "worker_other",
	})
	if !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("error = %v, want ErrConflict", err)
	}
	if repo.publishedReads != 0 || repo.previewReads != 0 {
		t.Fatalf("unexpected published reads detail:%d preview:%d", repo.publishedReads, repo.previewReads)
	}
}

func TestReadAITutorWorkerStudyPacketInputRejectsExpiredLeaseBeforePublishedReads(t *testing.T) {
	now := time.Date(2026, 6, 8, 10, 0, 0, 0, time.UTC)
	request := claimedTutoringRequestForWorkerInput(now)
	request.ClaimExpiresAt = now.Add(-time.Second)
	repo := &fakeAITutorWorkerStudyPacketRepository{
		request:   request,
		requestOK: true,
	}
	uc := usecase.NewReadAITutorWorkerStudyPacketInput(repo, fixedClock{now: now})

	_, err := uc.Execute(context.Background(), domain.ReadAITutorWorkerStudyPacketInputInput{
		Principal: servicePrincipal(),
		RequestID: "tutor_req_worker_input",
		WorkerID:  "worker_student_tutor_01",
	})
	if !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("error = %v, want ErrConflict", err)
	}
	if repo.publishedReads != 0 || repo.previewReads != 0 {
		t.Fatalf("unexpected published reads detail:%d preview:%d", repo.publishedReads, repo.previewReads)
	}
}

type fakeAITutorWorkerStudyPacketRepository struct {
	request         domain.TutoringAnalysisRequest
	requestOK       bool
	requestReads    int
	publishedItem   domain.ArchiveItem
	publishedOK     bool
	publishedReads  int
	contentPreview  domain.PublishedArchiveMaterialContentPreview
	previewOK       bool
	previewReads    int
	genericGetReads int
}

func (f *fakeAITutorWorkerStudyPacketRepository) GetTutoringAnalysisRequestByID(
	_ context.Context,
	_ string,
) (domain.TutoringAnalysisRequest, bool, error) {
	f.requestReads++
	return f.request, f.requestOK, nil
}

func (f *fakeAITutorWorkerStudyPacketRepository) GetPublishedForStudentApp(
	_ context.Context,
	_ string,
	_ string,
) (domain.ArchiveItem, bool, error) {
	f.publishedReads++
	return f.publishedItem, f.publishedOK, nil
}

func (f *fakeAITutorWorkerStudyPacketRepository) GetPublishedContentPreviewForStudentApp(
	_ context.Context,
	_ string,
	_ string,
) (domain.PublishedArchiveMaterialContentPreview, bool, error) {
	f.previewReads++
	return f.contentPreview, f.previewOK, nil
}

func (f *fakeAITutorWorkerStudyPacketRepository) GetByID(
	_ context.Context,
	_ string,
) (domain.ArchiveItem, bool, error) {
	f.genericGetReads++
	return domain.ArchiveItem{}, false, nil
}

func claimedTutoringRequestForWorkerInput(now time.Time) domain.TutoringAnalysisRequest {
	request := tutoringRequest("tutor_req_worker_input", "tarch_archive_material_001", "student_001", now.Add(-10*time.Minute))
	request.AnalysisGoal = "generate personalized practice"
	request.QuestionBankIntent = domain.QuestionBankIntentGeneratePersonalizedCheck
	request.Status = domain.TutoringAnalysisStatusInProgress
	request.SourceArchiveOwnerType = domain.OwnerTypeStudent
	request.SourceArchiveMaterial = domain.MaterialTypeHandout
	request.ClaimedByWorkerID = "worker_student_tutor_01"
	request.ClaimExpiresAt = now.Add(5 * time.Minute)
	return request
}

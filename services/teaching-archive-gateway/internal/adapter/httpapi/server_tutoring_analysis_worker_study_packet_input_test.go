package httpapi_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/httpapi"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestReadAITutorWorkerStudyPacketInputReturnsSafeWorkerPackage(t *testing.T) {
	handler := newTestHandlerWithAITutorWorkerStudyPacketInput()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/tutoring-analysis-requests/tutor_req_http_worker_input/ai-tutor-study-packet-input",
		bytes.NewBufferString(`{"workerId":" worker_student_tutor_01 "}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, servicePrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"requestId":"tutor_req_http_worker_input"`),
		[]byte(`"questionBankIntent":"GENERATE_PERSONALIZED_CHECK"`),
		[]byte(`"packetStatus":"READY"`),
		[]byte(`"renderFormat":"SAFE_TEXT_BLOCKS"`),
		[]byte(`"blockType":"SECTION"`),
		[]byte(`"text":"Practice equivalent fractions and common denominators."`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`contentRef`),
		[]byte(`contentPreview`),
		[]byte(`rawContent`),
		[]byte(`prompt`),
		[]byte(`ragChunks`),
		[]byte(`expectedAnswer`),
		[]byte(`rawModelOutput`),
		[]byte(`resultRef`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestReadAITutorWorkerStudyPacketInputRejectsTeacherPrincipal(t *testing.T) {
	handler := newTestHandlerWithAITutorWorkerStudyPacketInput()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/tutoring-analysis-requests/tutor_req_http_worker_input/ai-tutor-study-packet-input",
		bytes.NewBufferString(`{"workerId":"worker_student_tutor_01"}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, teacherPrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func newTestHandlerWithAITutorWorkerStudyPacketInput() http.Handler {
	now := time.Date(2026, 6, 8, 10, 0, 0, 0, time.UTC)
	tutoringRequest := tutoringAnalysisRequest(
		"tutor_req_http_worker_input",
		"tarch_archive_material_001",
		"student_001",
		now.Add(-10*time.Minute),
	)
	tutoringRequest.AnalysisGoal = "generate personalized practice"
	tutoringRequest.QuestionBankIntent = domain.QuestionBankIntentGeneratePersonalizedCheck
	tutoringRequest.Status = domain.TutoringAnalysisStatusInProgress
	tutoringRequest.SourceArchiveMaterial = domain.MaterialTypeHandout
	tutoringRequest.ClaimedByWorkerID = "worker_student_tutor_01"
	tutoringRequest.ClaimExpiresAt = now.Add(5 * time.Minute)
	item := archiveItem("tarch_archive_material_001", "student_001", now.Add(-10*time.Minute))
	item.Title = "Fractions practice packet"
	item.MaterialType = domain.MaterialTypeHandout
	store := &fakeRepository{
		items: []domain.ArchiveItem{item},
		requests: []domain.TutoringAnalysisRequest{
			tutoringRequest,
		},
		publishedArchiveItemIDs: map[string]bool{
			"tarch_archive_material_001": true,
		},
		contentPreviews: []domain.PublishedArchiveMaterialContentPreview{
			publishedArchiveItemContentPreviewHTTPFixture("tarch_archive_material_001", "student_001"),
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		ReadAITutorWorkerStudyPacketInput: usecase.NewReadAITutorWorkerStudyPacketInput(store, fixedClock{now: now}),
		AgentAPIKey:                       "ueacd",
	}).Handler()
}

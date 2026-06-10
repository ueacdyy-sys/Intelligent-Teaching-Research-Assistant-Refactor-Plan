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

func TestListStudentAppAITutorRequestsReturnsSafeProgressTimeline(t *testing.T) {
	requests := []domain.TutoringAnalysisRequest{
		{
			ID:                     "tutor_req_progress_001",
			ArchiveItemID:          "tarch_student_ai_tutor_result_001",
			RequestedByPrincipalID: "student_001",
			AnalysisGoal:           "continue guided practice",
			QuestionBankIntent:     domain.QuestionBankIntentGeneratePersonalizedCheck,
			Status:                 domain.TutoringAnalysisStatusSucceeded,
			LearningActionSource:   domain.StudentAppAITutorLearningActionSourceResultArchive,
			FollowUpDepth:          2,
			SourceArchiveOwnerType: domain.OwnerTypeStudent,
			SourceArchiveStudentID: "student_001",
			SourceArchiveMaterial:  domain.MaterialTypeHomework,
			ResultSummary:          "Reviewed guidance is ready",
			ResultRef:              "local://internal/tutor-result.json",
			ErrorMessage:           "internal worker trace should not leak",
			ClaimedByWorkerID:      "worker_internal_001",
			CreatedAt:              time.Date(2026, 6, 10, 10, 0, 0, 0, time.UTC),
			CompletedAt:            time.Date(2026, 6, 10, 10, 4, 0, 0, time.UTC),
			UpdatedAt:              time.Date(2026, 6, 10, 10, 4, 0, 0, time.UTC),
		},
	}
	handler := newTestHandlerWithStudentAppAITutorProgressRequests(requests)
	request := httptest.NewRequest(http.MethodGet, "/v1/student-app/ai-tutor-requests", http.NoBody)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"id":"tutor_req_progress_001"`),
		[]byte(`"progressStage":"RESULT_READY"`),
		[]byte(`"nextStudentAction":"VIEW_AI_TUTOR_RESULT_ARCHIVE"`),
		[]byte(`"learningActionSource":"AI_TUTOR_RESULT_ARCHIVE"`),
		[]byte(`"followUpDepth":2`),
		[]byte(`"timeline"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`resultRef`),
		[]byte(`local://internal`),
		[]byte(`claimedByWorkerId`),
		[]byte(`worker_internal_001`),
		[]byte(`errorMessage`),
		[]byte(`internal worker trace`),
		[]byte(`requestedByPrincipalId`),
		[]byte(`sourceArchiveStudentId`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func newTestHandlerWithStudentAppAITutorProgressRequests(
	requests []domain.TutoringAnalysisRequest,
) http.Handler {
	store := &fakeRepository{
		requests: append([]domain.TutoringAnalysisRequest(nil), requests...),
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		ListStudentAppAITutorRequests: usecase.NewListStudentAppAITutorRequests(store),
		AgentAPIKey:                   "ueacd",
	}).Handler()
}

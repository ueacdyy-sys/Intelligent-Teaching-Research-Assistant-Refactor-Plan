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
		[]byte(`"primaryAction":{"actionType":"VIEW_AI_TUTOR_RESULT_ARCHIVE","state":"AVAILABLE","targetEndpoint":"/v1/student-app/archive-items/tarch_student_ai_tutor_result_001/ai-tutor-result/rendered","targetUrl":"/v1/student-app/archive-items/tarch_student_ai_tutor_result_001/ai-tutor-result/rendered","method":"GET","archiveItemId":"tarch_student_ai_tutor_result_001"}`),
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

func TestReadStudentAppAITutorRequestProgressReturnsSafeDetail(t *testing.T) {
	requests := []domain.TutoringAnalysisRequest{
		{
			ID:                     "tutor_req_progress_detail",
			ArchiveItemID:          "tarch_student_ai_tutor_result_detail",
			RequestedByPrincipalID: "student_001",
			AnalysisGoal:           "review my weak knowledge points",
			QuestionBankIntent:     domain.QuestionBankIntentGeneratePersonalizedCheck,
			Status:                 domain.TutoringAnalysisStatusSucceeded,
			LearningActionSource:   domain.StudentAppAITutorLearningActionSourceResultArchive,
			FollowUpDepth:          1,
			SourceArchiveOwnerType: domain.OwnerTypeStudent,
			SourceArchiveStudentID: "student_001",
			SourceArchiveMaterial:  domain.MaterialTypeHomework,
			ResultSummary:          "Reviewed detail is ready",
			ResultRef:              "local://internal/tutor-result-detail.json",
			ErrorMessage:           "internal detail trace should not leak",
			ClaimedByWorkerID:      "worker_internal_detail",
			CreatedAt:              time.Date(2026, 6, 10, 11, 0, 0, 0, time.UTC),
			CompletedAt:            time.Date(2026, 6, 10, 11, 4, 0, 0, time.UTC),
			UpdatedAt:              time.Date(2026, 6, 10, 11, 4, 0, 0, time.UTC),
		},
	}
	handler := newTestHandlerWithStudentAppAITutorProgressRequests(requests)
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/ai-tutor-requests/tutor_req_progress_detail",
		http.NoBody,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"id":"tutor_req_progress_detail"`),
		[]byte(`"archiveItemId":"tarch_student_ai_tutor_result_detail"`),
		[]byte(`"progressStage":"RESULT_READY"`),
		[]byte(`"nextStudentAction":"VIEW_AI_TUTOR_RESULT_ARCHIVE"`),
		[]byte(`"primaryAction":{"actionType":"VIEW_AI_TUTOR_RESULT_ARCHIVE","state":"AVAILABLE","targetEndpoint":"/v1/student-app/archive-items/tarch_student_ai_tutor_result_detail/ai-tutor-result/rendered","targetUrl":"/v1/student-app/archive-items/tarch_student_ai_tutor_result_detail/ai-tutor-result/rendered","method":"GET","archiveItemId":"tarch_student_ai_tutor_result_detail"}`),
		[]byte(`"safeStatusMessage":"Reviewed AI tutor result is ready."`),
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
		[]byte(`worker_internal_detail`),
		[]byte(`errorMessage`),
		[]byte(`internal detail trace`),
		[]byte(`requestedByPrincipalId`),
		[]byte(`sourceArchiveStudentId`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestReadStudentAppAITutorRequestProgressHidesCrossStudentRequest(t *testing.T) {
	handler := newTestHandlerWithStudentAppAITutorProgressRequests([]domain.TutoringAnalysisRequest{
		tutoringAnalysisRequest(
			"tutor_req_progress_other",
			"tarch_student_ai_tutor_result_other",
			"student_002",
			time.Date(2026, 6, 10, 11, 10, 0, 0, time.UTC),
		),
	})
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/ai-tutor-requests/tutor_req_progress_other",
		http.NoBody,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if bytes.Contains(response.Body.Bytes(), []byte("student_002")) ||
		bytes.Contains(response.Body.Bytes(), []byte("tarch_student_ai_tutor_result_other")) {
		t.Fatalf("body leaked cross-student details: %s", response.Body.String())
	}
}

func newTestHandlerWithStudentAppAITutorProgressRequests(
	requests []domain.TutoringAnalysisRequest,
) http.Handler {
	store := &fakeRepository{
		requests: append([]domain.TutoringAnalysisRequest(nil), requests...),
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		ListStudentAppAITutorRequests:        usecase.NewListStudentAppAITutorRequests(store),
		ReadStudentAppAITutorRequestProgress: usecase.NewReadStudentAppAITutorRequestProgress(store),
		AgentAPIKey:                          "ueacd",
	}).Handler()
}

package httpapi_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
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
		[]byte(`"refreshPolicy":{"autoRefresh":false,"refreshAfterMs":0,"reason":"ACTION_READY"}`),
		[]byte(`"learningActionSource":"AI_TUTOR_RESULT_ARCHIVE"`),
		[]byte(`"followUpDepth":2`),
		[]byte(`"timeline"`),
		[]byte(`"summary":{"totalCount":1,"autoRefreshCount":0,"actionReadyCount":1,"teacherReviewRequiredCount":0,"failedCount":0}`),
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
	assertPrivateConditionalProgressHeaders(t, response)

	conditionalRequest := httptest.NewRequest(http.MethodGet, "/v1/student-app/ai-tutor-requests", http.NoBody)
	conditionalRequest.Header.Set("X-Agent-Api-Key", "ueacd")
	conditionalRequest.Header.Set("If-None-Match", response.Header().Get("ETag"))
	setPrincipalHeader(t, conditionalRequest, studentPrincipal("student_001"))

	conditionalResponse := httptest.NewRecorder()
	handler.ServeHTTP(conditionalResponse, conditionalRequest)

	if conditionalResponse.Code != http.StatusNotModified {
		t.Fatalf("conditional status = %d, body = %s", conditionalResponse.Code, conditionalResponse.Body.String())
	}
	if conditionalResponse.Body.Len() != 0 {
		t.Fatalf("conditional body = %s, want empty", conditionalResponse.Body.String())
	}
	if conditionalResponse.Header().Get("ETag") != response.Header().Get("ETag") {
		t.Fatalf("conditional ETag = %q, want %q", conditionalResponse.Header().Get("ETag"), response.Header().Get("ETag"))
	}
}

func TestListStudentAppAITutorRequestsReturnsSafeProgressSummary(t *testing.T) {
	baseTime := time.Date(2026, 6, 10, 12, 0, 0, 0, time.UTC)
	requests := []domain.TutoringAnalysisRequest{
		progressRequestWithStatus(
			"tutor_req_progress_summary_queued",
			"tarch_progress_summary_queued",
			domain.TutoringAnalysisStatusQueued,
			baseTime,
		),
		progressRequestWithStatus(
			"tutor_req_progress_summary_working",
			"tarch_progress_summary_working",
			domain.TutoringAnalysisStatusInProgress,
			baseTime.Add(time.Minute),
		),
		progressRequestWithStatus(
			"tutor_req_progress_summary_result",
			"tarch_progress_summary_result",
			domain.TutoringAnalysisStatusSucceeded,
			baseTime.Add(2*time.Minute),
		),
		progressRequestWithQuestionBankDraft(
			"tutor_req_progress_summary_qbank",
			"tarch_progress_summary_qbank",
			baseTime.Add(3*time.Minute),
		),
		progressRequestWithStatus(
			"tutor_req_progress_summary_failed",
			"tarch_progress_summary_failed",
			domain.TutoringAnalysisStatusFailed,
			baseTime.Add(4*time.Minute),
		),
	}
	handler := newTestHandlerWithStudentAppAITutorProgressRequests(requests)
	request := httptest.NewRequest(http.MethodGet, "/v1/student-app/ai-tutor-requests?pageSize=10", http.NoBody)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	summaryFragment := []byte(
		`"summary":{"totalCount":5,"autoRefreshCount":2,"actionReadyCount":2,"teacherReviewRequiredCount":1,"failedCount":1}`,
	)
	if !bytes.Contains(response.Body.Bytes(), summaryFragment) {
		t.Fatalf("body missing summary %s in %s", summaryFragment, response.Body.String())
	}
	for _, leaked := range [][]byte{
		[]byte(`resultRef`),
		[]byte(`errorMessage`),
		[]byte(`claimedByWorkerId`),
		[]byte(`worker_internal_summary`),
		[]byte(`local://internal`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestListStudentAppAITutorRequestsFiltersSafeProgressView(t *testing.T) {
	baseTime := time.Date(2026, 6, 10, 12, 30, 0, 0, time.UTC)
	requests := []domain.TutoringAnalysisRequest{
		progressRequestWithStatus(
			"tutor_req_progress_filter_queued",
			"tarch_progress_filter_queued",
			domain.TutoringAnalysisStatusQueued,
			baseTime,
		),
		progressRequestWithStatus(
			"tutor_req_progress_filter_working",
			"tarch_progress_filter_working",
			domain.TutoringAnalysisStatusInProgress,
			baseTime.Add(time.Minute),
		),
		progressRequestWithStatus(
			"tutor_req_progress_filter_ready",
			"tarch_progress_filter_ready",
			domain.TutoringAnalysisStatusSucceeded,
			baseTime.Add(2*time.Minute),
		),
		progressRequestWithStatus(
			"tutor_req_progress_filter_failed",
			"tarch_progress_filter_failed",
			domain.TutoringAnalysisStatusFailed,
			baseTime.Add(3*time.Minute),
		),
	}
	handler := newTestHandlerWithStudentAppAITutorProgressRequests(requests)
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/ai-tutor-requests?progressView=AUTO_REFRESH&pageSize=10",
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
		[]byte(`"id":"tutor_req_progress_filter_queued"`),
		[]byte(`"id":"tutor_req_progress_filter_working"`),
		[]byte(`"summary":{"totalCount":2,"autoRefreshCount":2,"actionReadyCount":0,"teacherReviewRequiredCount":0,"failedCount":0}`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, excluded := range [][]byte{
		[]byte(`tutor_req_progress_filter_ready`),
		[]byte(`tutor_req_progress_filter_failed`),
		[]byte(`local://internal`),
		[]byte(`worker_internal_summary`),
	} {
		if bytes.Contains(response.Body.Bytes(), excluded) {
			t.Fatalf("body included excluded fragment %s in %s", excluded, response.Body.String())
		}
	}
	assertPrivateConditionalProgressHeaders(t, response)
}

func TestListStudentAppAITutorRequestsRejectsAmbiguousProgressFilters(t *testing.T) {
	handler := newTestHandlerWithStudentAppAITutorProgressRequests(nil)
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/ai-tutor-requests?status=QUEUED&progressView=AUTO_REFRESH",
		http.NoBody,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
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
		[]byte(`"refreshPolicy":{"autoRefresh":false,"refreshAfterMs":0,"reason":"ACTION_READY"}`),
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
	assertPrivateConditionalProgressHeaders(t, response)

	conditionalRequest := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/ai-tutor-requests/tutor_req_progress_detail",
		http.NoBody,
	)
	conditionalRequest.Header.Set("X-Agent-Api-Key", "ueacd")
	conditionalRequest.Header.Set("If-None-Match", response.Header().Get("ETag"))
	setPrincipalHeader(t, conditionalRequest, studentPrincipal("student_001"))

	conditionalResponse := httptest.NewRecorder()
	handler.ServeHTTP(conditionalResponse, conditionalRequest)

	if conditionalResponse.Code != http.StatusNotModified {
		t.Fatalf("conditional status = %d, body = %s", conditionalResponse.Code, conditionalResponse.Body.String())
	}
	if conditionalResponse.Body.Len() != 0 {
		t.Fatalf("conditional body = %s, want empty", conditionalResponse.Body.String())
	}
	if conditionalResponse.Header().Get("ETag") != response.Header().Get("ETag") {
		t.Fatalf("conditional ETag = %q, want %q", conditionalResponse.Header().Get("ETag"), response.Header().Get("ETag"))
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

func progressRequestWithStatus(
	id string,
	archiveItemID string,
	status domain.TutoringAnalysisStatus,
	createdAt time.Time,
) domain.TutoringAnalysisRequest {
	request := tutoringAnalysisRequest(id, archiveItemID, "student_001", createdAt)
	request.Status = status
	request.LearningActionSource = domain.StudentAppAITutorLearningActionSourceResultArchive
	request.FollowUpDepth = 1
	request.UpdatedAt = createdAt
	request.ClaimedByWorkerID = "worker_internal_summary"
	request.ErrorMessage = "local://internal/worker-trace"
	if status == domain.TutoringAnalysisStatusSucceeded || status == domain.TutoringAnalysisStatusFailed {
		request.CompletedAt = createdAt.Add(4 * time.Minute)
		request.UpdatedAt = request.CompletedAt
	}
	if status == domain.TutoringAnalysisStatusSucceeded {
		request.ResultSummary = "Reviewed guidance is ready"
		request.ResultRef = "local://internal/" + id + "/result.json"
	}
	return request
}

func progressRequestWithQuestionBankDraft(
	id string,
	archiveItemID string,
	createdAt time.Time,
) domain.TutoringAnalysisRequest {
	request := progressRequestWithStatus(id, archiveItemID, domain.TutoringAnalysisStatusSucceeded, createdAt)
	request.QuestionBankDraftRef = "local://question-bank-drafts/" + id + ".json"
	return request
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

func assertPrivateConditionalProgressHeaders(t *testing.T, response *httptest.ResponseRecorder) {
	t.Helper()
	etag := response.Header().Get("ETag")
	if etag == "" || !strings.HasPrefix(etag, `"sha256-`) || !strings.HasSuffix(etag, `"`) {
		t.Fatalf("ETag = %q, want quoted sha256 tag", etag)
	}
	if response.Header().Get("Cache-Control") != "private, no-cache" {
		t.Fatalf("Cache-Control = %q", response.Header().Get("Cache-Control"))
	}
	vary := response.Header().Get("Vary")
	if !strings.Contains(vary, "X-Principal-Context") || !strings.Contains(vary, "X-Agent-Api-Key") {
		t.Fatalf("Vary = %q, want principal and api key", vary)
	}
}

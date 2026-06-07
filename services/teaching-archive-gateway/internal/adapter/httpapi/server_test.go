package httpapi_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestCreateArchiveItemReturnsCreatedResponse(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/archive-items",
		bytes.NewBufferString(`{"ownerType":"STUDENT","studentId":"student_001","materialType":"QUIZ","title":" Week 3 Quiz ","source":"TEACHER_UPLOAD","contentRef":"local://archive/student_001/quiz_001.pdf","tags":["math","quiz"],"analysisIntents":["TUTORING","AI_GRADING"],"ocrReserved":true}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, teacherPrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}

	var body map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("response JSON: %v", err)
	}
	if body["id"] != "tarch_http" {
		t.Fatalf("id = %v", body["id"])
	}
	if body["title"] != "Week 3 Quiz" {
		t.Fatalf("title = %v", body["title"])
	}
	if body["ocrStatus"] != "RESERVED" {
		t.Fatalf("ocrStatus = %v", body["ocrStatus"])
	}
}

func TestCreateArchiveItemReturnsServerTiming(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/archive-items",
		bytes.NewBufferString(`{"ownerType":"STUDENT","studentId":"student_001","materialType":"QUIZ","title":"Week 3 Quiz","source":"TEACHER_UPLOAD","contentRef":"local://archive/student_001/quiz_001.pdf","analysisIntents":["TUTORING"]}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, teacherPrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	timing := response.Header().Get("Server-Timing")
	if !strings.Contains(timing, "handler;dur=") {
		t.Fatalf("Server-Timing = %q, want handler duration", timing)
	}
	if !strings.Contains(timing, "pre.usecase;dur=") {
		t.Fatalf("Server-Timing = %q, want pre.usecase duration", timing)
	}
	if !strings.Contains(timing, "app;dur=") {
		t.Fatalf("Server-Timing = %q, want app duration", timing)
	}
	if !strings.Contains(timing, "db.batch_wait;dur=") {
		t.Fatalf("Server-Timing = %q, want db.batch_wait duration", timing)
	}
	if !strings.Contains(timing, "db.insert;dur=") {
		t.Fatalf("Server-Timing = %q, want db.insert duration", timing)
	}
	if !strings.Contains(timing, "db.acquire;dur=") {
		t.Fatalf("Server-Timing = %q, want db.acquire duration", timing)
	}
	if !strings.Contains(timing, "db.exec;dur=") {
		t.Fatalf("Server-Timing = %q, want db.exec duration", timing)
	}
	if !strings.Contains(timing, "response.encode;dur=") {
		t.Fatalf("Server-Timing = %q, want response.encode duration", timing)
	}
	if response.Header().Get("Content-Length") == "" {
		t.Fatalf("Content-Length header is empty")
	}
}

func TestCreateArchiveItemRequiresAgentAPIKey(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/archive-items",
		bytes.NewBufferString(`{"ownerType":"TEACHING","materialType":"TEACHING_MATERIAL","title":"Lesson","source":"TEACHER_UPLOAD","contentRef":"local://archive/teaching/lesson.pdf","analysisIntents":["ARCHIVE_ONLY"]}`),
	)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestCreateArchiveItemRequiresPrincipalContext(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/archive-items",
		bytes.NewBufferString(`{"ownerType":"TEACHING","materialType":"TEACHING_MATERIAL","title":"Lesson","source":"TEACHER_UPLOAD","contentRef":"local://archive/teaching/lesson.pdf","analysisIntents":["ARCHIVE_ONLY"]}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestCreateArchiveItemRejectsForbiddenPrincipal(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/archive-items",
		bytes.NewBufferString(`{"ownerType":"TEACHING","materialType":"TEACHING_MATERIAL","title":"Lesson","source":"TEACHER_UPLOAD","contentRef":"local://archive/teaching/lesson.pdf","analysisIntents":["ARCHIVE_ONLY"]}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, remotePrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestCreateArchiveItemReturnsValidationError(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/archive-items",
		bytes.NewBufferString(`{"ownerType":"STUDENT","materialType":"HOMEWORK","title":"Homework","source":"STUDENT_UPLOAD","contentRef":"local://archive/student/homework.pdf","analysisIntents":["TUTORING"]}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, teacherPrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte("VALIDATION_ERROR")) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func TestCreateArchiveItemRejectsUnknownFields(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/archive-items",
		bytes.NewBufferString(`{"ownerType":"TEACHING","materialType":"TEACHING_MATERIAL","title":"Lesson","source":"TEACHER_UPLOAD","contentRef":"local://archive/teaching/lesson.pdf","analysisIntents":["ARCHIVE_ONLY"],"unexpected":true}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, teacherPrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestListArchiveItemsReturnsPaginatedResponse(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/teaching/archive-items?ownerType=STUDENT&studentId=student_001&pageSize=2",
		nil,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, teacherPrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"data"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"hasMore":true`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"nextCursor"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	timing := response.Header().Get("Server-Timing")
	if !strings.Contains(timing, "handler;dur=") {
		t.Fatalf("Server-Timing = %q, want handler duration", timing)
	}
	if !strings.Contains(timing, "pre.usecase;dur=") {
		t.Fatalf("Server-Timing = %q, want pre.usecase duration", timing)
	}
	if !strings.Contains(timing, "app;dur=") {
		t.Fatalf("Server-Timing = %q, want app duration", timing)
	}
	if !strings.Contains(timing, "db.acquire;dur=") {
		t.Fatalf("Server-Timing = %q, want db.acquire duration", timing)
	}
	if !strings.Contains(timing, "db.query;dur=") {
		t.Fatalf("Server-Timing = %q, want db.query duration", timing)
	}
	if !strings.Contains(timing, "response.encode;dur=") {
		t.Fatalf("Server-Timing = %q, want response.encode duration", timing)
	}
	if response.Header().Get("Content-Length") == "" {
		t.Fatalf("Content-Length header is empty")
	}
}

func TestListArchiveItemsScopesStudentPrincipalToOwnArchive(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/teaching/archive-items?ownerType=STUDENT&pageSize=10",
		nil,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if bytes.Contains(response.Body.Bytes(), []byte("student_002")) {
		t.Fatalf("student_002 leaked in body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte("student_001")) {
		t.Fatalf("student_001 missing in body = %s", response.Body.String())
	}
}

func TestListArchiveItemsRequiresAgentAPIKey(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(http.MethodGet, "/v1/teaching/archive-items", nil)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestListArchiveItemsRequiresPrincipalContext(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(http.MethodGet, "/v1/teaching/archive-items", nil)
	request.Header.Set("X-Agent-Api-Key", "ueacd")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestListArchiveItemsReturnsValidationError(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(http.MethodGet, "/v1/teaching/archive-items?pageSize=101", nil)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, teacherPrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte("VALIDATION_ERROR")) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func TestCreateTutoringAnalysisRequestReturnsCreatedResponse(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/archive-items/tarch_http_3/tutoring-analysis-requests",
		bytes.NewBufferString(`{"analysisGoal":" find weak skills ","questionBankIntent":"GENERATE_PERSONALIZED_CHECK"}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"id":"tutor_req_http"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"status":"QUEUED"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func TestCreateTutoringAnalysisRequestRejectsForbiddenPrincipal(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/archive-items/tarch_http_other/tutoring-analysis-requests",
		bytes.NewBufferString(`{"analysisGoal":" find weak skills ","questionBankIntent":"GENERATE_PERSONALIZED_CHECK"}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestListTutoringAnalysisRequestsReturnsPaginatedResponse(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/teaching/tutoring-analysis-requests?sourceArchiveOwnerType=STUDENT&pageSize=2",
		nil,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, teacherPrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"data"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"hasMore":true`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func TestListTutoringAnalysisRequestsScopesStudentPrincipalToOwnRequests(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/teaching/tutoring-analysis-requests?sourceArchiveOwnerType=STUDENT&pageSize=10",
		nil,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if bytes.Contains(response.Body.Bytes(), []byte("student_002")) {
		t.Fatalf("student_002 leaked in body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte("student_001")) {
		t.Fatalf("student_001 missing in body = %s", response.Body.String())
	}
}

func TestRecordTutoringAnalysisResultReturnsUpdatedResponse(t *testing.T) {
	handler := newTestHandlerWithRequests([]domain.TutoringAnalysisRequest{
		claimedTutoringAnalysisRequest("tutor_req_http_3", "tarch_http_3", "student_001", time.Date(2026, 5, 29, 8, 40, 0, 0, time.UTC)),
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/tutoring-analysis-requests/tutor_req_http_3/worker-result",
		bytes.NewBufferString(`{"status":"SUCCEEDED","workerId":"worker_teaching_ai_01","resultSummary":" mastered fractions ","resultRef":"local://analysis/tutor_req_http_3/result.json","questionBankDraftRef":"local://question-bank-drafts/tutor_req_http_3.json"}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, servicePrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"status":"SUCCEEDED"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"resultSummary":"mastered fractions"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"completedAt"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func TestClaimTutoringAnalysisRequestReturnsWorkerClaim(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/tutoring-analysis-requests/worker-claims",
		bytes.NewBufferString(`{"workerId":" worker_teaching_ai_01 ","leaseSeconds":120}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, servicePrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"status":"IN_PROGRESS"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"claimedByWorkerId":"worker_teaching_ai_01"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"claimExpiresAt"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func TestClaimTutoringAnalysisRequestReturnsNoContentWhenQueueEmpty(t *testing.T) {
	handler := newTestHandlerWithRequests([]domain.TutoringAnalysisRequest{
		completedTutoringAnalysisRequest("tutor_req_http_done", "tarch_http_3", "student_001", time.Date(2026, 5, 29, 10, 3, 0, 0, time.UTC)),
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/tutoring-analysis-requests/worker-claims",
		bytes.NewBufferString(`{"workerId":"worker_teaching_ai_01","leaseSeconds":120}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, servicePrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if response.Body.Len() != 0 {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func TestRecordTutoringAnalysisResultRejectsTeacherPrincipal(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/tutoring-analysis-requests/tutor_req_http_3/worker-result",
		bytes.NewBufferString(`{"status":"SUCCEEDED","resultSummary":"summary","resultRef":"local://analysis/tutor_req_http_3/result.json"}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, teacherPrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

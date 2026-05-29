package httpapi_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/httpapi"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
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

func newTestHandler() http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			archiveItem("tarch_http_3", "student_001", time.Date(2026, 5, 29, 10, 3, 0, 0, time.UTC)),
			archiveItem("tarch_http_other", "student_002", time.Date(2026, 5, 29, 10, 2, 30, 0, time.UTC)),
			archiveItem("tarch_http_2", "student_001", time.Date(2026, 5, 29, 10, 2, 0, 0, time.UTC)),
			archiveItem("tarch_http_1", "student_001", time.Date(2026, 5, 29, 10, 1, 0, 0, time.UTC)),
		},
		requests: []domain.TutoringAnalysisRequest{
			tutoringAnalysisRequest("tutor_req_http_3", "tarch_http_3", "student_001", time.Date(2026, 5, 29, 10, 3, 0, 0, time.UTC)),
			tutoringAnalysisRequest("tutor_req_http_other", "tarch_http_other", "student_002", time.Date(2026, 5, 29, 10, 2, 30, 0, time.UTC)),
			tutoringAnalysisRequest("tutor_req_http_2", "tarch_http_2", "student_001", time.Date(2026, 5, 29, 10, 2, 0, 0, time.UTC)),
			tutoringAnalysisRequest("tutor_req_http_1", "tarch_http_1", "student_001", time.Date(2026, 5, 29, 10, 1, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewCreateArchiveItem(
		store,
		fixedIDs{id: "tarch_http"},
		fixedClock{now: time.Date(2026, 5, 29, 8, 0, 0, 0, time.UTC)},
	)
	list := usecase.NewListArchiveItems(store)
	createAIGradingRequest := usecase.NewCreateAIGradingRequest(
		store,
		fixedIDs{id: "grading_req_http"},
		fixedClock{now: time.Date(2026, 5, 29, 8, 20, 0, 0, time.UTC)},
	)
	listTutoringRequests := usecase.NewListTutoringAnalysisRequests(store)
	createTutoringRequest := usecase.NewCreateTutoringAnalysisRequest(
		store,
		fixedIDs{id: "tutor_req_http"},
		fixedClock{now: time.Date(2026, 5, 29, 8, 30, 0, 0, time.UTC)},
	)
	recordTutoringResult := usecase.NewRecordTutoringAnalysisResult(
		store,
		fixedClock{now: time.Date(2026, 5, 29, 8, 45, 0, 0, time.UTC)},
	)
	claimTutoringRequest := usecase.NewClaimTutoringAnalysisRequest(
		store,
		fixedClock{now: time.Date(2026, 5, 29, 8, 40, 0, 0, time.UTC)},
	)
	return httpapi.NewServer(
		uc,
		list,
		createAIGradingRequest,
		createTutoringRequest,
		listTutoringRequests,
		claimTutoringRequest,
		recordTutoringResult,
		"ueacd",
	).Handler()
}

func newTestHandlerWithRequests(requests []domain.TutoringAnalysisRequest) http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			archiveItem("tarch_http_3", "student_001", time.Date(2026, 5, 29, 10, 3, 0, 0, time.UTC)),
			archiveItem("tarch_http_other", "student_002", time.Date(2026, 5, 29, 10, 2, 30, 0, time.UTC)),
			archiveItem("tarch_http_2", "student_001", time.Date(2026, 5, 29, 10, 2, 0, 0, time.UTC)),
			archiveItem("tarch_http_1", "student_001", time.Date(2026, 5, 29, 10, 1, 0, 0, time.UTC)),
		},
		requests: append([]domain.TutoringAnalysisRequest(nil), requests...),
	}
	uc := usecase.NewCreateArchiveItem(
		store,
		fixedIDs{id: "tarch_http"},
		fixedClock{now: time.Date(2026, 5, 29, 8, 0, 0, 0, time.UTC)},
	)
	list := usecase.NewListArchiveItems(store)
	createAIGradingRequest := usecase.NewCreateAIGradingRequest(
		store,
		fixedIDs{id: "grading_req_http"},
		fixedClock{now: time.Date(2026, 5, 29, 8, 20, 0, 0, time.UTC)},
	)
	listTutoringRequests := usecase.NewListTutoringAnalysisRequests(store)
	createTutoringRequest := usecase.NewCreateTutoringAnalysisRequest(
		store,
		fixedIDs{id: "tutor_req_http"},
		fixedClock{now: time.Date(2026, 5, 29, 8, 30, 0, 0, time.UTC)},
	)
	recordTutoringResult := usecase.NewRecordTutoringAnalysisResult(
		store,
		fixedClock{now: time.Date(2026, 5, 29, 8, 45, 0, 0, time.UTC)},
	)
	claimTutoringRequest := usecase.NewClaimTutoringAnalysisRequest(
		store,
		fixedClock{now: time.Date(2026, 5, 29, 8, 40, 0, 0, time.UTC)},
	)
	return httpapi.NewServer(
		uc,
		list,
		createAIGradingRequest,
		createTutoringRequest,
		listTutoringRequests,
		claimTutoringRequest,
		recordTutoringResult,
		"ueacd",
	).Handler()
}

func setPrincipalHeader(t *testing.T, request *http.Request, principal domain.PrincipalContext) {
	t.Helper()
	payload, err := json.Marshal(principal)
	if err != nil {
		t.Fatalf("principal JSON: %v", err)
	}
	request.Header.Set("X-Principal-Context", base64.RawURLEncoding.EncodeToString(payload))
}

func teacherPrincipal() domain.PrincipalContext {
	return domain.PrincipalContext{
		PrincipalID: "teacher_001",
		SubjectType: domain.SubjectUser,
		Role:        domain.RoleTeacher,
		EntryPoint:  domain.EntryPointDesktopTeacher,
		Scopes: []domain.Scope{
			domain.ScopeTeachingRead,
			domain.ScopeTeachingWrite,
			domain.ScopeStudentAssignedRead,
			domain.ScopeStudentArchiveWrite,
		},
		KnowledgeAccess: domain.KnowledgeAccess{Public: true, Private: domain.PrivateAccessAssigned},
		StudentAccess:   domain.StudentAccess{Mode: domain.StudentAccessAssigned},
		SessionID:       "sess_teacher",
		IssuedAt:        time.Now().Add(-time.Minute).UTC(),
		ExpiresAt:       time.Now().Add(time.Hour).UTC(),
	}
}

func studentPrincipal(studentID string) domain.PrincipalContext {
	return domain.PrincipalContext{
		PrincipalID: studentID,
		SubjectType: domain.SubjectUser,
		Role:        domain.RoleStudent,
		EntryPoint:  domain.EntryPointStudentApp,
		Scopes: []domain.Scope{
			domain.ScopeTeachingRead,
			domain.ScopeStudentOwnRead,
			domain.ScopeStudentOwnWrite,
		},
		KnowledgeAccess: domain.KnowledgeAccess{Public: true, Private: domain.PrivateAccessNone},
		StudentAccess: domain.StudentAccess{
			Mode:       domain.StudentAccessOwn,
			StudentIDs: []string{studentID},
		},
		SessionID: "sess_student",
		IssuedAt:  time.Now().Add(-time.Minute).UTC(),
		ExpiresAt: time.Now().Add(time.Hour).UTC(),
	}
}

func remotePrincipal() domain.PrincipalContext {
	return domain.PrincipalContext{
		PrincipalID:     "remote:WECHAT:openid",
		SubjectType:     domain.SubjectRemoteChannel,
		Role:            domain.RoleRemoteOperator,
		EntryPoint:      domain.EntryPointRemoteSocial,
		Scopes:          []domain.Scope{domain.ScopeAgentCommandSubmit},
		KnowledgeAccess: domain.KnowledgeAccess{Private: domain.PrivateAccessNone},
		StudentAccess: domain.StudentAccess{
			Mode: domain.StudentAccessNone,
		},
		RequiresHarnessApproval: true,
		SessionID:               "grant_remote",
		IssuedAt:                time.Now().Add(-time.Minute).UTC(),
		ExpiresAt:               time.Now().Add(time.Hour).UTC(),
	}
}

func servicePrincipal() domain.PrincipalContext {
	return domain.PrincipalContext{
		PrincipalID:     "svc_tutoring_worker",
		SubjectType:     domain.SubjectService,
		Role:            domain.RoleService,
		EntryPoint:      domain.EntryPointAgentInternal,
		Scopes:          []domain.Scope{domain.ScopeTeachingRead, domain.ScopeTeachingWrite},
		KnowledgeAccess: domain.KnowledgeAccess{Public: true, Private: domain.PrivateAccessNone},
		StudentAccess:   domain.StudentAccess{Mode: domain.StudentAccessNone},
		SessionID:       "svc_session",
		IssuedAt:        time.Now().Add(-time.Minute).UTC(),
		ExpiresAt:       time.Now().Add(time.Hour).UTC(),
	}
}

type fakeRepository struct {
	items           []domain.ArchiveItem
	requests        []domain.TutoringAnalysisRequest
	gradingRequests []domain.AIGradingRequest
}

func (f *fakeRepository) Create(_ context.Context, _ domain.ArchiveItem) error {
	return nil
}

func (f *fakeRepository) List(_ context.Context, query domain.ArchiveItemQuery) ([]domain.ArchiveItem, error) {
	items := make([]domain.ArchiveItem, 0, len(f.items))
	for _, item := range f.items {
		if query.OwnerType != "" && item.OwnerType != query.OwnerType {
			continue
		}
		if query.StudentID != "" && item.StudentID != query.StudentID {
			continue
		}
		if len(query.StudentIDs) > 0 && !containsString(query.StudentIDs, item.StudentID) {
			continue
		}
		if query.MaterialType != "" && item.MaterialType != query.MaterialType {
			continue
		}
		items = append(items, item)
		if query.FetchLimit > 0 && len(items) >= query.FetchLimit {
			break
		}
	}
	return items, nil
}

func (f *fakeRepository) GetByID(_ context.Context, id string) (domain.ArchiveItem, bool, error) {
	for _, item := range f.items {
		if item.ID == id {
			return item, true, nil
		}
	}
	return domain.ArchiveItem{}, false, nil
}

func (f *fakeRepository) CreateTutoringAnalysisRequest(_ context.Context, request domain.TutoringAnalysisRequest) error {
	f.requests = append(f.requests, request)
	return nil
}

func (f *fakeRepository) CreateAIGradingRequest(_ context.Context, request domain.AIGradingRequest) error {
	f.gradingRequests = append(f.gradingRequests, request)
	return nil
}

func (f *fakeRepository) ListTutoringAnalysisRequests(
	_ context.Context,
	query domain.TutoringAnalysisRequestQuery,
) ([]domain.TutoringAnalysisRequest, error) {
	requests := make([]domain.TutoringAnalysisRequest, 0, len(f.requests))
	for _, request := range f.requests {
		if query.Status != "" && request.Status != query.Status {
			continue
		}
		if query.ArchiveItemID != "" && request.ArchiveItemID != query.ArchiveItemID {
			continue
		}
		if query.SourceArchiveOwnerType != "" && request.SourceArchiveOwnerType != query.SourceArchiveOwnerType {
			continue
		}
		if query.StudentID != "" && request.SourceArchiveStudentID != query.StudentID {
			continue
		}
		if len(query.StudentIDs) > 0 && !containsString(query.StudentIDs, request.SourceArchiveStudentID) {
			continue
		}
		requests = append(requests, request)
		if query.FetchLimit > 0 && len(requests) >= query.FetchLimit {
			break
		}
	}
	return requests, nil
}

func (f *fakeRepository) GetTutoringAnalysisRequestByID(
	_ context.Context,
	id string,
) (domain.TutoringAnalysisRequest, bool, error) {
	for _, request := range f.requests {
		if request.ID == id {
			return request, true, nil
		}
	}
	return domain.TutoringAnalysisRequest{}, false, nil
}

func (f *fakeRepository) ClaimNextTutoringAnalysisRequest(
	_ context.Context,
	input domain.ClaimTutoringAnalysisRequestInput,
	now time.Time,
) (domain.TutoringAnalysisRequest, bool, error) {
	for index, request := range f.requests {
		claimed, err := domain.ApplyTutoringAnalysisClaim(request, input, now)
		if err == nil {
			f.requests[index] = claimed
			return claimed, true, nil
		}
		if !errors.Is(err, domain.ErrConflict) {
			return domain.TutoringAnalysisRequest{}, false, err
		}
	}
	return domain.TutoringAnalysisRequest{}, false, nil
}

func (f *fakeRepository) RecordTutoringAnalysisResult(
	_ context.Context,
	updated domain.TutoringAnalysisRequest,
) error {
	for index, request := range f.requests {
		if request.ID == updated.ID {
			f.requests[index] = updated
			return nil
		}
	}
	f.requests = append(f.requests, updated)
	return nil
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func tutoringAnalysisRequest(id string, archiveItemID string, studentID string, createdAt time.Time) domain.TutoringAnalysisRequest {
	return domain.TutoringAnalysisRequest{
		ID:                     id,
		ArchiveItemID:          archiveItemID,
		RequestedByPrincipalID: studentID,
		AnalysisGoal:           "find weak skills",
		QuestionBankIntent:     domain.QuestionBankIntentGeneratePersonalizedCheck,
		Status:                 domain.TutoringAnalysisStatusQueued,
		SourceArchiveOwnerType: domain.OwnerTypeStudent,
		SourceArchiveStudentID: studentID,
		SourceArchiveMaterial:  domain.MaterialTypeQuiz,
		CreatedAt:              createdAt,
	}
}

func completedTutoringAnalysisRequest(id string, archiveItemID string, studentID string, createdAt time.Time) domain.TutoringAnalysisRequest {
	request := tutoringAnalysisRequest(id, archiveItemID, studentID, createdAt)
	request.Status = domain.TutoringAnalysisStatusSucceeded
	request.ResultSummary = "completed"
	request.ResultRef = "local://analysis/" + id + "/result.json"
	request.CompletedAt = createdAt.Add(time.Hour)
	request.UpdatedAt = request.CompletedAt
	return request
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
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentTutoring, domain.AnalysisIntentAIGrading},
		OCRStatus:       domain.OCRStatusReserved,
		CreatedAt:       createdAt,
	}
}

type fixedIDs struct {
	id string
}

func (f fixedIDs) NewID() string {
	return f.id
}

type fixedClock struct {
	now time.Time
}

func (f fixedClock) Now() time.Time {
	return f.now
}

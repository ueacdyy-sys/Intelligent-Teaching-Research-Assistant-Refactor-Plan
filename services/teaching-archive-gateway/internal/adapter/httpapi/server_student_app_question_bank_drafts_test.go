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

func TestListStudentAppQuestionBankDraftsReturnsOwnDraftRefs(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDrafts()
	request := httptest.NewRequest(http.MethodGet, "/v1/student-app/question-bank-drafts?pageSize=10", nil)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"tutoringAnalysisRequestId":"tutor_req_draft"`),
		[]byte(`"archiveItemId":"tarch_http_3"`),
		[]byte(`"questionBankDraftRef":"local://question-bank-drafts/tutor_req_draft.json"`),
		[]byte(`"resultRef":"local://analysis/tutor_req_draft/result.json"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`tutor_req_without_draft`),
		[]byte(`tutor_req_other`),
		[]byte(`student_002`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestListStudentAppQuestionBankDraftsRejectsUnsupportedMethod(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDrafts()
	request := httptest.NewRequest(http.MethodPost, "/v1/student-app/question-bank-drafts", http.NoBody)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestReadStudentAppQuestionBankDraftSummaryReturnsCountOnlySafeResponse(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDrafts()
	request := httptest.NewRequest(http.MethodGet, "/v1/student-app/question-bank-drafts/summary", nil)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(
		response.Body.Bytes(),
		[]byte(`"summary":{"totalCount":2,"quizCount":1,"paperCount":0,"handoutCount":1,"homeworkCount":0}`),
	) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if response.Header().Get("ETag") == "" ||
		response.Header().Get("Cache-Control") != "private, no-cache" {
		t.Fatalf("headers = %#v", response.Header())
	}
	for _, leaked := range [][]byte{
		[]byte(`"data"`),
		[]byte(`"pageInfo"`),
		[]byte(`"resultRef"`),
		[]byte(`"questionBankDraftRef"`),
		[]byte(`tutor_req_draft`),
		[]byte(`tutor_req_without_draft`),
		[]byte(`tarch_http_3`),
		[]byte(`student_002`),
		[]byte(`claimedByWorkerId`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestReadStudentAppQuestionBankDraftSummarySupportsPrivate304(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDrafts()
	first := httptest.NewRequest(http.MethodGet, "/v1/student-app/question-bank-drafts/summary", nil)
	first.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, first, studentPrincipal("student_001"))
	firstResponse := httptest.NewRecorder()
	handler.ServeHTTP(firstResponse, first)
	if firstResponse.Code != http.StatusOK {
		t.Fatalf("first status = %d, body = %s", firstResponse.Code, firstResponse.Body.String())
	}

	second := httptest.NewRequest(http.MethodGet, "/v1/student-app/question-bank-drafts/summary", nil)
	second.Header.Set("X-Agent-Api-Key", "ueacd")
	second.Header.Set("If-None-Match", firstResponse.Header().Get("ETag"))
	setPrincipalHeader(t, second, studentPrincipal("student_001"))
	secondResponse := httptest.NewRecorder()
	handler.ServeHTTP(secondResponse, second)
	if secondResponse.Code != http.StatusNotModified {
		t.Fatalf("second status = %d, body = %s", secondResponse.Code, secondResponse.Body.String())
	}
	if secondResponse.Body.Len() != 0 {
		t.Fatalf("304 body = %s", secondResponse.Body.String())
	}
}

func TestReadStudentAppQuestionBankDraftSummaryRejectsUnsupportedMethod(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDrafts()
	request := httptest.NewRequest(http.MethodPost, "/v1/student-app/question-bank-drafts/summary", http.NoBody)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func newTestHandlerWithStudentAppQuestionBankDrafts() http.Handler {
	store := &fakeRepository{
		requests: []domain.TutoringAnalysisRequest{
			questionBankDraftHTTPItem("tutor_req_draft", "tarch_http_3", "student_001", time.Date(2026, 5, 30, 10, 3, 0, 0, time.UTC)),
			questionBankDraftHTTPItemWithMaterial("tutor_req_draft_handout", "tarch_http_4", "student_001", domain.MaterialTypeHandout, time.Date(2026, 5, 30, 10, 4, 0, 0, time.UTC)),
			completedTutoringAnalysisRequest("tutor_req_without_draft", "tarch_http_3", "student_001", time.Date(2026, 5, 30, 10, 2, 0, 0, time.UTC)),
			questionBankDraftHTTPItem("tutor_req_other", "tarch_http_other", "student_002", time.Date(2026, 5, 30, 10, 1, 0, 0, time.UTC)),
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		ListStudentAppQuestionBankDrafts:       usecase.NewListStudentAppQuestionBankDrafts(store),
		ReadStudentAppQuestionBankDraftSummary: usecase.NewReadStudentAppQuestionBankDraftSummary(store),
		AgentAPIKey:                            "ueacd",
	}).Handler()
}

func questionBankDraftHTTPItem(
	id string,
	archiveItemID string,
	studentID string,
	createdAt time.Time,
) domain.TutoringAnalysisRequest {
	return questionBankDraftHTTPItemWithMaterial(
		id,
		archiveItemID,
		studentID,
		domain.MaterialTypeQuiz,
		createdAt,
	)
}

func questionBankDraftHTTPItemWithMaterial(
	id string,
	archiveItemID string,
	studentID string,
	materialType domain.MaterialType,
	createdAt time.Time,
) domain.TutoringAnalysisRequest {
	request := completedTutoringAnalysisRequest(id, archiveItemID, studentID, createdAt)
	request.QuestionBankIntent = domain.QuestionBankIntentGeneratePersonalizedCheck
	request.SourceArchiveMaterial = materialType
	request.QuestionBankDraftRef = "local://question-bank-drafts/" + id + ".json"
	request.ResultRef = "local://analysis/" + id + "/result.json"
	return request
}

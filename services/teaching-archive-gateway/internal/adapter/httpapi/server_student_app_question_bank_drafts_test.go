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

func newTestHandlerWithStudentAppQuestionBankDrafts() http.Handler {
	store := &fakeRepository{
		requests: []domain.TutoringAnalysisRequest{
			questionBankDraftHTTPItem("tutor_req_draft", "tarch_http_3", "student_001", time.Date(2026, 5, 30, 10, 3, 0, 0, time.UTC)),
			completedTutoringAnalysisRequest("tutor_req_without_draft", "tarch_http_3", "student_001", time.Date(2026, 5, 30, 10, 2, 0, 0, time.UTC)),
			questionBankDraftHTTPItem("tutor_req_other", "tarch_http_other", "student_002", time.Date(2026, 5, 30, 10, 1, 0, 0, time.UTC)),
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		ListStudentAppQuestionBankDrafts: usecase.NewListStudentAppQuestionBankDrafts(store),
		AgentAPIKey:                      "ueacd",
	}).Handler()
}

func questionBankDraftHTTPItem(
	id string,
	archiveItemID string,
	studentID string,
	createdAt time.Time,
) domain.TutoringAnalysisRequest {
	request := completedTutoringAnalysisRequest(id, archiveItemID, studentID, createdAt)
	request.QuestionBankIntent = domain.QuestionBankIntentGeneratePersonalizedCheck
	request.QuestionBankDraftRef = "local://question-bank-drafts/" + id + ".json"
	request.ResultRef = "local://analysis/" + id + "/result.json"
	return request
}

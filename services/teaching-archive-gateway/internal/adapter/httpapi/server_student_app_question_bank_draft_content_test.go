package httpapi_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/httpapi"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestReadStudentAppQuestionBankDraftContentReturnsOwnContent(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftContent()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/question-bank-draft-content?questionBankDraftRef="+url.QueryEscape("local://question-bank-drafts/tutor_req_001.json"),
		nil,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"questionBankDraftRef":"local://question-bank-drafts/tutor_req_001.json"`),
		[]byte(`"tutoringAnalysisRequestId":"tutor_req_001"`),
		[]byte(`"questionText":"What is 1/2 + 1/4?"`),
		[]byte(`"learningTarget":"fraction addition"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`student_001`),
		[]byte(`worker_teaching_ai_01`),
		[]byte(`publishedAt`),
		[]byte(`score`),
		[]byte(`expectedAnswer`),
		[]byte(`explanation`),
		[]byte(`3/4`),
		[]byte(`Use a common denominator of 4.`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestReadStudentAppQuestionBankDraftContentRejectsCrossStudent(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftContent()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/question-bank-draft-content?questionBankDraftRef="+url.QueryEscape("local://question-bank-drafts/tutor_req_other.json"),
		nil,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestReadStudentAppQuestionBankDraftContentRejectsUnsupportedMethod(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftContent()
	request := httptest.NewRequest(http.MethodPost, "/v1/student-app/question-bank-draft-content", http.NoBody)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func newTestHandlerWithStudentAppQuestionBankDraftContent() http.Handler {
	store := &fakeRepository{
		questionBankDraftContents: []domain.QuestionBankDraftContent{
			questionBankDraftHTTPContent("tutor_req_001", "tarch_http_3", "student_001"),
			questionBankDraftHTTPContent("tutor_req_other", "tarch_http_other", "student_002"),
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		ReadStudentAppQuestionBankDraftContent: usecase.NewReadStudentAppQuestionBankDraftContent(store),
		AgentAPIKey:                            "ueacd",
	}).Handler()
}

func questionBankDraftHTTPContent(
	requestID string,
	archiveItemID string,
	studentID string,
) domain.QuestionBankDraftContent {
	createdAt := time.Date(2026, 6, 6, 9, 0, 0, 0, time.UTC)
	return domain.QuestionBankDraftContent{
		QuestionBankDraftRef:      "local://question-bank-drafts/" + requestID + ".json",
		TutoringAnalysisRequestID: requestID,
		ArchiveItemID:             archiveItemID,
		StudentID:                 studentID,
		Status:                    domain.QuestionBankDraftContentStatusDraft,
		SourceArchiveMaterial:     domain.MaterialTypeQuiz,
		ResultSummary:             "fractions need targeted practice",
		Items: []domain.QuestionBankDraftItem{
			{
				ID:             "q_001",
				QuestionText:   "What is 1/2 + 1/4?",
				ExpectedAnswer: "3/4",
				Explanation:    "Use a common denominator of 4.",
				LearningTarget: "fraction addition",
			},
		},
		CreatedAt: createdAt,
		UpdatedAt: createdAt.Add(5 * time.Minute),
	}
}

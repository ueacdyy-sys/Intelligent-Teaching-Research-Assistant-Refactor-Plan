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

func TestListStudentAppQuizSubmissionsReturnsOwnAnswerResources(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuizSubmissions()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/quiz-submissions?quizArchiveItemId=tarch_http_quiz&pageSize=10",
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
		[]byte(`"id":"quiz_sub_http_2"`),
		[]byte(`"quizArchiveItemId":"tarch_http_quiz"`),
		[]byte(`"studentId":"student_001"`),
		[]byte(`"answerRef":"local://answers/student_001/quiz_sub_http_2.json"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	if bytes.Contains(response.Body.Bytes(), []byte("student_002")) {
		t.Fatalf("student_002 leaked in body = %s", response.Body.String())
	}
}

func TestListStudentAppQuizSubmissionsRejectsUnsupportedMethod(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuizSubmissions()
	request := httptest.NewRequest(http.MethodPost, "/v1/student-app/quiz-submissions", http.NoBody)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func newTestHandlerWithStudentAppQuizSubmissions() http.Handler {
	store := &fakeRepository{
		quizSubmissions: []domain.QuizSubmission{
			httpQuizSubmission("quiz_sub_http_2", "student_001", time.Date(2026, 5, 30, 10, 2, 0, 0, time.UTC)),
			httpQuizSubmission("quiz_sub_http_other", "student_002", time.Date(2026, 5, 30, 10, 1, 0, 0, time.UTC)),
			httpQuizSubmission("quiz_sub_http_1", "student_001", time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC)),
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		ListStudentAppQuizSubmissions: usecase.NewListStudentAppQuizSubmissions(store),
		AgentAPIKey:                   "ueacd",
	}).Handler()
}

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

func TestCreateQuizScanSubmissionReturnsCreatedResponse(t *testing.T) {
	handler := newTestHandlerWithTeachingQuizScan()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/quiz-scan-submissions",
		bytes.NewBufferString(`{"scanCode":" teaching-quiz:tarch_http_quiz ","answerRef":" local://answers/student_001/week-3.json "}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"id":"quiz_sub_scan_http"`),
		[]byte(`"quizArchiveItemId":"tarch_http_quiz"`),
		[]byte(`"studentId":"student_001"`),
		[]byte(`"answerRef":"local://answers/student_001/week-3.json"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
}

func TestCreateQuizScanSubmissionRejectsUnsupportedMethod(t *testing.T) {
	handler := newTestHandlerWithTeachingQuizScan()
	request := httptest.NewRequest(http.MethodGet, "/v1/teaching/quiz-scan-submissions", http.NoBody)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func newTestHandlerWithTeachingQuizScan() http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			teachingQuizHTTPItem("tarch_http_quiz", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
		},
	}
	return httpapi.NewServer(
		usecase.NewCreateArchiveItem(store, fixedIDs{id: "tarch_http"}, fixedClock{}),
		usecase.NewListArchiveItems(store),
		usecase.NewCreateAIGradingRequest(store, fixedIDs{id: "grading_req_http"}, fixedClock{}),
		usecase.NewCreateQuizSubmissionAIGradingRequest(store, fixedIDs{id: "grading_req_http"}, fixedClock{}),
		usecase.NewListAIGradingRequests(store),
		nil,
		nil,
		usecase.NewCreateTutoringAnalysisRequest(store, fixedIDs{id: "tutor_req_http"}, fixedClock{}),
		usecase.NewListTutoringAnalysisRequests(store),
		usecase.NewClaimTutoringAnalysisRequest(store, fixedClock{}),
		usecase.NewRecordTutoringAnalysisResult(store, fixedClock{}),
		usecase.NewCreateQuizSubmission(store, fixedIDs{id: "quiz_sub_http"}, fixedClock{}),
		usecase.NewCreateScannedQuizSubmission(
			store,
			fixedIDs{id: "quiz_sub_scan_http"},
			fixedClock{now: time.Date(2026, 5, 30, 10, 45, 0, 0, time.UTC)},
		),
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		"ueacd",
	).Handler()
}

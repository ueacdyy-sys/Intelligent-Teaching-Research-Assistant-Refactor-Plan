package httpapi_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/httpapi"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestCreateQuizSubmissionReturnsCreatedResponse(t *testing.T) {
	handler := newTestHandlerWithTeachingQuiz()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/archive-items/tarch_http_quiz/quiz-submissions",
		bytes.NewBufferString(`{"answerRef":" local://answers/student_001/week-3.json "}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"id":"quiz_sub_http"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"studentId":"student_001"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"status":"SUBMITTED"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func TestCreateQuizSubmissionRejectsOtherStudent(t *testing.T) {
	handler := newTestHandlerWithTeachingQuiz()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/archive-items/tarch_http_quiz/quiz-submissions",
		bytes.NewBufferString(`{"studentId":"student_002","answerRef":"local://answers/student_002/week-3.json"}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func newTestHandlerWithTeachingQuiz() http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			teachingQuizHTTPItem("tarch_http_quiz", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
		},
	}
	return httpapi.NewServer(
		usecase.NewCreateArchiveItem(store, fixedIDs{id: "tarch_http"}, fixedClock{}),
		usecase.NewListArchiveItems(store),
		usecase.NewCreateAIGradingRequest(store, fixedIDs{id: "grading_req_http"}, fixedClock{}),
		usecase.NewListAIGradingRequests(store),
		nil,
		nil,
		usecase.NewCreateTutoringAnalysisRequest(store, fixedIDs{id: "tutor_req_http"}, fixedClock{}),
		usecase.NewListTutoringAnalysisRequests(store),
		usecase.NewClaimTutoringAnalysisRequest(store, fixedClock{}),
		usecase.NewRecordTutoringAnalysisResult(store, fixedClock{}),
		usecase.NewCreateQuizSubmission(store, fixedIDs{id: "quiz_sub_http"}, fixedClock{now: time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC)}),
		"ueacd",
	).Handler()
}

func (f *fakeRepository) CreateQuizSubmission(
	_ context.Context,
	submission domain.QuizSubmission,
) error {
	f.quizSubmissions = append(f.quizSubmissions, submission)
	return nil
}

func teachingQuizHTTPItem(id string, createdAt time.Time) domain.ArchiveItem {
	return domain.ArchiveItem{
		ID:              id,
		OwnerType:       domain.OwnerTypeTeaching,
		MaterialType:    domain.MaterialTypeQuiz,
		Title:           "Week 3 Quiz",
		Source:          domain.SourceTeacherUpload,
		ContentRef:      "local://teaching/quizzes/week-3.pdf",
		Tags:            []string{"math"},
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly},
		OCRStatus:       domain.OCRStatusNotRequired,
		CreatedAt:       createdAt,
	}
}

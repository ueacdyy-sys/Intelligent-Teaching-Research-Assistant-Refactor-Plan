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

func TestCreateQuizSubmissionAIGradingRequestReturnsCreatedResponse(t *testing.T) {
	handler := newTestHandlerWithTeachingQuizSubmission()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/archive-items/tarch_http_quiz/quiz-submissions/quiz_sub_http_answer/ai-grading-requests",
		bytes.NewBufferString(`{"gradingInstructions":" grade submitted answers ","rubricRef":"local://rubrics/week-3.json"}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, teacherPrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"id":"grading_req_http"`),
		[]byte(`"sourceArchiveContentRef":"local://teaching/quizzes/week-3.pdf"`),
		[]byte(`"sourceQuizSubmissionId":"quiz_sub_http_answer"`),
		[]byte(`"sourceAnswerRef":"local://answers/student_001/week-3.json"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
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
		usecase.NewCreateQuizSubmissionAIGradingRequest(store, fixedIDs{id: "grading_req_http"}, fixedClock{}),
		usecase.NewListAIGradingRequests(store),
		nil,
		nil,
		usecase.NewCreateTutoringAnalysisRequest(store, fixedIDs{id: "tutor_req_http"}, fixedClock{}),
		usecase.NewListTutoringAnalysisRequests(store),
		usecase.NewClaimTutoringAnalysisRequest(store, fixedClock{}),
		usecase.NewRecordTutoringAnalysisResult(store, fixedClock{}),
		usecase.NewCreateQuizSubmission(store, fixedIDs{id: "quiz_sub_http"}, fixedClock{now: time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC)}),
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

func newTestHandlerWithTeachingQuizSubmission() http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			teachingQuizHTTPItem("tarch_http_quiz", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
		},
		quizSubmissions: []domain.QuizSubmission{
			quizSubmissionHTTP("quiz_sub_http_answer", "tarch_http_quiz", "student_001"),
		},
	}
	return httpapi.NewServer(
		usecase.NewCreateArchiveItem(store, fixedIDs{id: "tarch_http"}, fixedClock{}),
		usecase.NewListArchiveItems(store),
		usecase.NewCreateAIGradingRequest(store, fixedIDs{id: "grading_req_http"}, fixedClock{}),
		usecase.NewCreateQuizSubmissionAIGradingRequest(store, fixedIDs{id: "grading_req_http"}, fixedClock{now: time.Date(2026, 5, 30, 11, 0, 0, 0, time.UTC)}),
		usecase.NewListAIGradingRequests(store),
		nil,
		nil,
		usecase.NewCreateTutoringAnalysisRequest(store, fixedIDs{id: "tutor_req_http"}, fixedClock{}),
		usecase.NewListTutoringAnalysisRequests(store),
		usecase.NewClaimTutoringAnalysisRequest(store, fixedClock{}),
		usecase.NewRecordTutoringAnalysisResult(store, fixedClock{}),
		usecase.NewCreateQuizSubmission(store, fixedIDs{id: "quiz_sub_http"}, fixedClock{}),
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

func (f *fakeRepository) CreateQuizSubmission(
	_ context.Context,
	submission domain.QuizSubmission,
) error {
	f.quizSubmissions = append(f.quizSubmissions, submission)
	return nil
}

func (f *fakeRepository) GetQuizSubmissionByID(
	_ context.Context,
	id string,
) (domain.QuizSubmission, bool, error) {
	for _, submission := range f.quizSubmissions {
		if submission.ID == id {
			return submission, true, nil
		}
	}
	return domain.QuizSubmission{}, false, nil
}

func quizSubmissionHTTP(id string, quizArchiveItemID string, studentID string) domain.QuizSubmission {
	return domain.QuizSubmission{
		ID:                     id,
		QuizArchiveItemID:      quizArchiveItemID,
		StudentID:              studentID,
		SubmittedByPrincipalID: studentID,
		AnswerRef:              "local://answers/" + studentID + "/week-3.json",
		Status:                 domain.QuizSubmissionStatusSubmitted,
		SubmittedAt:            time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC),
	}
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

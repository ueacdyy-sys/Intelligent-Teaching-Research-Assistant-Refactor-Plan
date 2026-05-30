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

func TestListQuizSubmissionsScopesStudentToOwnRows(t *testing.T) {
	handler := newTestHandlerWithQuizSubmissionRows([]domain.QuizSubmission{
		httpQuizSubmission("quiz_sub_http_2", "student_001", time.Date(2026, 5, 30, 10, 2, 0, 0, time.UTC)),
		httpQuizSubmission("quiz_sub_http_other", "student_002", time.Date(2026, 5, 30, 10, 1, 30, 0, time.UTC)),
		httpQuizSubmission("quiz_sub_http_1", "student_001", time.Date(2026, 5, 30, 10, 1, 0, 0, time.UTC)),
	})
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/teaching/archive-items/tarch_http_quiz/quiz-submissions?pageSize=1",
		nil,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"id":"quiz_sub_http_2"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if bytes.Contains(response.Body.Bytes(), []byte("student_002")) {
		t.Fatalf("student_002 leaked in body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"hasMore":true`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"nextCursor"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func newTestHandlerWithQuizSubmissionRows(rows []domain.QuizSubmission) http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			teachingQuizHTTPItem("tarch_http_quiz", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
		},
		quizSubmissions: append([]domain.QuizSubmission(nil), rows...),
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
		usecase.NewListQuizSubmissions(store),
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

func (f *fakeRepository) ListQuizSubmissions(
	_ context.Context,
	query domain.QuizSubmissionQuery,
) ([]domain.QuizSubmission, error) {
	submissions := make([]domain.QuizSubmission, 0, len(f.quizSubmissions))
	for _, submission := range f.quizSubmissions {
		if query.QuizArchiveItemID != "" && submission.QuizArchiveItemID != query.QuizArchiveItemID {
			continue
		}
		if query.StudentID != "" && submission.StudentID != query.StudentID {
			continue
		}
		if len(query.StudentIDs) > 0 && !containsString(query.StudentIDs, submission.StudentID) {
			continue
		}
		submissions = append(submissions, submission)
		if query.FetchLimit > 0 && len(submissions) >= query.FetchLimit {
			break
		}
	}
	return submissions, nil
}

func httpQuizSubmission(id string, studentID string, submittedAt time.Time) domain.QuizSubmission {
	return domain.QuizSubmission{
		ID:                     id,
		QuizArchiveItemID:      "tarch_http_quiz",
		StudentID:              studentID,
		SubmittedByPrincipalID: studentID,
		AnswerRef:              "local://answers/" + studentID + "/" + id + ".json",
		Status:                 domain.QuizSubmissionStatusSubmitted,
		SubmittedAt:            submittedAt,
	}
}

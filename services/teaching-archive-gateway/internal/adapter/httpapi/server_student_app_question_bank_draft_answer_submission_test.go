package httpapi_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/httpapi"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestSubmitStudentAppQuestionBankDraftAnswerReturnsMetadataOnly(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerSubmission()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/question-bank-draft-answer-submissions",
		bytes.NewBufferString(`{"questionBankDraftRef":"local://question-bank-drafts/tutor_req_001.json","answers":[{"itemId":"q_001","answerText":"3/4"}]}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"id":"qbank_ans_sub_http"`),
		[]byte(`"questionBankDraftRef":"local://question-bank-drafts/tutor_req_001.json"`),
		[]byte(`"tutoringAnalysisRequestId":"tutor_req_001"`),
		[]byte(`"studentId":"student_001"`),
		[]byte(`"status":"SUBMITTED"`),
		[]byte(`"answerCount":1`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`answerText`),
		[]byte(`expectedAnswer`),
		[]byte(`explanation`),
		[]byte(`score`),
		[]byte(`3/4`),
		[]byte(`Use a common denominator of 4.`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
	timing := response.Header().Get("Server-Timing")
	if !strings.Contains(timing, "db.insert;dur=") || !strings.Contains(timing, "response.encode;dur=") {
		t.Fatalf("Server-Timing = %q", timing)
	}
}

func TestSubmitStudentAppQuestionBankDraftAnswerRejectsCrossStudentDraft(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerSubmission()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/question-bank-draft-answer-submissions",
		bytes.NewBufferString(`{"questionBankDraftRef":"local://question-bank-drafts/tutor_req_other.json","answers":[{"itemId":"q_001","answerText":"3/4"}]}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestSubmitStudentAppQuestionBankDraftAnswerRejectsUnknownItem(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerSubmission()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/question-bank-draft-answer-submissions",
		bytes.NewBufferString(`{"questionBankDraftRef":"local://question-bank-drafts/tutor_req_001.json","answers":[{"itemId":"q_missing","answerText":"3/4"}]}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestSubmitStudentAppQuestionBankDraftAnswerRejectsUnsupportedMethod(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerSubmission()
	request := httptest.NewRequest(http.MethodGet, "/v1/student-app/question-bank-draft-answer-submissions", http.NoBody)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestCreateStudentAppQuestionBankDraftAnswerScoringRequestReturnsMetadataOnly(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerScoringRequest()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/ai-grading-requests",
		bytes.NewBufferString(`{"gradingInstructions":"grade the submitted draft answer","rubricRef":"local://rubrics/fractions.json"}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"id":"grading_req_qbank_answer_http"`),
		[]byte(`"archiveItemId":"tarch_http_3"`),
		[]byte(`"status":"QUEUED"`),
		[]byte(`"sourceArchiveOwnerType":"STUDENT"`),
		[]byte(`"sourceArchiveStudentId":"student_001"`),
		[]byte(`"sourceArchiveContentRef":"local://question-bank-drafts/tutor_req_001.json"`),
		[]byte(`"sourceQuestionBankDraftRef":"local://question-bank-drafts/tutor_req_001.json"`),
		[]byte(`"sourceQuestionBankAnswerSubmissionId":"qbank_ans_sub_http_answer"`),
		[]byte(`"sourceArchiveOcrStatus":"NOT_REQUIRED"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`answerText`),
		[]byte(`expectedAnswer`),
		[]byte(`explanation`),
		[]byte(`scoreSummary`),
		[]byte(`resultRef`),
		[]byte(`3/4`),
		[]byte(`Use a common denominator of 4.`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestCreateStudentAppQuestionBankDraftAnswerScoringRequestRejectsTeacherAndCrossStudent(t *testing.T) {
	tests := []struct {
		name      string
		principal domain.PrincipalContext
		want      int
	}{
		{name: "teacher", principal: teacherPrincipal(), want: http.StatusForbidden},
		{name: "cross student", principal: studentPrincipal("student_002"), want: http.StatusNotFound},
		{name: "remote", principal: remotePrincipal(), want: http.StatusForbidden},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerScoringRequest()
			request := httptest.NewRequest(
				http.MethodPost,
				"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/ai-grading-requests",
				bytes.NewBufferString(`{"gradingInstructions":"grade the submitted draft answer"}`),
			)
			request.Header.Set("X-Agent-Api-Key", "ueacd")
			setPrincipalHeader(t, request, tt.principal)

			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != tt.want {
				t.Fatalf("status = %d, want %d, body = %s", response.Code, tt.want, response.Body.String())
			}
		})
	}
}

func TestCreateStudentAppQuestionBankDraftAnswerScoringRequestRejectsUnsupportedSubresource(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerScoringRequest()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/score",
		bytes.NewBufferString(`{"gradingInstructions":"grade the submitted draft answer"}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestReadStudentAppQuestionBankDraftAnswerScoringResultReturnsSafeSummary(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerScoringResult()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/ai-grading-result",
		http.NoBody,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"submissionId":"qbank_ans_sub_http_answer"`),
		[]byte(`"requestId":"grading_req_qbank_answer_result_http"`),
		[]byte(`"questionBankDraftRef":"local://question-bank-drafts/tutor_req_001.json"`),
		[]byte(`"tutoringAnalysisRequestId":"tutor_req_001"`),
		[]byte(`"archiveItemId":"tarch_http_3"`),
		[]byte(`"status":"SUCCEEDED"`),
		[]byte(`"scoreSummary":"score 93"`),
		[]byte(`"requestedAt"`),
		[]byte(`"completedAt"`),
		[]byte(`"updatedAt"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`answerText`),
		[]byte(`expectedAnswer`),
		[]byte(`explanation`),
		[]byte(`resultRef`),
		[]byte(`errorMessage`),
		[]byte(`workerId`),
		[]byte(`claimedByWorkerId`),
		[]byte(`claimExpiresAt`),
		[]byte(`3/4`),
		[]byte(`Use a common denominator of 4.`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestReadStudentAppQuestionBankDraftAnswerScoringResultRejectsTeacherAndCrossStudent(t *testing.T) {
	tests := []struct {
		name      string
		principal domain.PrincipalContext
		want      int
	}{
		{name: "teacher", principal: teacherPrincipal(), want: http.StatusForbidden},
		{name: "cross student", principal: studentPrincipal("student_002"), want: http.StatusNotFound},
		{name: "remote", principal: remotePrincipal(), want: http.StatusForbidden},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerScoringResult()
			request := httptest.NewRequest(
				http.MethodGet,
				"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/ai-grading-result",
				http.NoBody,
			)
			request.Header.Set("X-Agent-Api-Key", "ueacd")
			setPrincipalHeader(t, request, tt.principal)

			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != tt.want {
				t.Fatalf("status = %d, want %d, body = %s", response.Code, tt.want, response.Body.String())
			}
		})
	}
}

func TestReadStudentAppQuestionBankDraftAnswerScoringResultRejectsUnsupportedMethod(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerScoringResult()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/ai-grading-result",
		http.NoBody,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func newTestHandlerWithStudentAppQuestionBankDraftAnswerSubmission() http.Handler {
	store := &fakeRepository{
		questionBankDraftContents: []domain.QuestionBankDraftContent{
			questionBankDraftHTTPContent("tutor_req_001", "tarch_http_3", "student_001"),
			questionBankDraftHTTPContent("tutor_req_other", "tarch_http_other", "student_002"),
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		SubmitStudentAppQuestionBankDraftAnswer: usecase.NewSubmitStudentAppQuestionBankDraftAnswer(
			store,
			fixedIDs{id: "qbank_ans_sub_http"},
			fixedClock{now: time.Date(2026, 6, 6, 9, 30, 0, 0, time.UTC)},
		),
		CreateStudentAppQuestionBankDraftAnswerScoringRequest: usecase.NewCreateStudentAppQuestionBankDraftAnswerScoringRequest(
			store,
			fixedIDs{id: "grading_req_qbank_answer_http"},
			fixedClock{now: time.Date(2026, 6, 6, 9, 35, 0, 0, time.UTC)},
		),
		AgentAPIKey: "ueacd",
	}).Handler()
}

func newTestHandlerWithStudentAppQuestionBankDraftAnswerScoringRequest() http.Handler {
	store := &fakeRepository{
		questionBankDraftContents: []domain.QuestionBankDraftContent{
			questionBankDraftHTTPContent("tutor_req_001", "tarch_http_3", "student_001"),
		},
		questionBankDraftAnswerSubmissions: []domain.QuestionBankDraftAnswerSubmission{
			questionBankDraftHTTPAnswerSubmission(),
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		CreateStudentAppQuestionBankDraftAnswerScoringRequest: usecase.NewCreateStudentAppQuestionBankDraftAnswerScoringRequest(
			store,
			fixedIDs{id: "grading_req_qbank_answer_http"},
			fixedClock{now: time.Date(2026, 6, 6, 9, 35, 0, 0, time.UTC)},
		),
		AgentAPIKey: "ueacd",
	}).Handler()
}

func newTestHandlerWithStudentAppQuestionBankDraftAnswerScoringResult() http.Handler {
	now := time.Date(2026, 6, 6, 10, 45, 0, 0, time.UTC)
	request := httpAIGradingRequest(
		"grading_req_qbank_answer_result_http",
		"tarch_http_3",
		"student_001",
		now.Add(-10*time.Minute),
	)
	request.SourceArchiveContentRef = "local://question-bank-drafts/tutor_req_001.json"
	request.SourceQuestionBankDraftRef = "local://question-bank-drafts/tutor_req_001.json"
	request.SourceQuestionBankAnswerSubmissionID = "qbank_ans_sub_http_answer"
	request.SourceArchiveOCRStatus = domain.OCRStatusNotRequired
	request.Status = domain.AIGradingStatusSucceeded
	request.ScoreSummary = "score 93"
	request.ResultRef = "local://grading/grading_req_qbank_answer_result_http/result.json"
	request.CompletedAt = now.Add(-time.Minute)
	request.UpdatedAt = request.CompletedAt
	store := &fakeRepository{
		gradingRequests: []domain.AIGradingRequest{request},
		questionBankDraftAnswerSubmissions: []domain.QuestionBankDraftAnswerSubmission{
			questionBankDraftHTTPAnswerSubmission(),
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		ReadStudentAppQuestionBankDraftAnswerScoringResult: usecase.NewReadStudentAppQuestionBankDraftAnswerScoringResult(store),
		AgentAPIKey: "ueacd",
	}).Handler()
}

func questionBankDraftHTTPAnswerSubmission() domain.QuestionBankDraftAnswerSubmission {
	return domain.QuestionBankDraftAnswerSubmission{
		ID:                        "qbank_ans_sub_http_answer",
		QuestionBankDraftRef:      "local://question-bank-drafts/tutor_req_001.json",
		TutoringAnalysisRequestID: "tutor_req_001",
		ArchiveItemID:             "tarch_http_3",
		StudentID:                 "student_001",
		SubmittedByPrincipalID:    "student_001",
		Status:                    domain.QuestionBankDraftAnswerSubmissionStatusSubmitted,
		Answers: []domain.QuestionBankDraftSubmittedAnswer{
			{ItemID: "q_001", AnswerText: "3/4"},
		},
		SubmittedAt: time.Date(2026, 6, 6, 9, 32, 0, 0, time.UTC),
	}
}

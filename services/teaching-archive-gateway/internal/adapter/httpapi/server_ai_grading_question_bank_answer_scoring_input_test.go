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

func TestReadQuestionBankDraftAnswerScoringInputReturnsWorkerOnlyInputPackage(t *testing.T) {
	handler := newTestHandlerWithQuestionBankAnswerScoringInput()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/ai-grading-requests/grading_req_http_qbank_answer/question-bank-answer-scoring-input",
		bytes.NewBufferString(`{"workerId":" worker_ai_grading_01 "}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, servicePrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"requestId":"grading_req_http_qbank_answer"`),
		[]byte(`"sourceQuestionBankDraftRef":"local://question-bank-drafts/tutor_req_001.json"`),
		[]byte(`"sourceQuestionBankAnswerSubmissionId":"qbank_ans_sub_http_answer"`),
		[]byte(`"answerText":"3/4"`),
		[]byte(`"expectedAnswer":"3/4"`),
		[]byte(`"explanation":"Use a common denominator of 4."`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`scoreSummary`),
		[]byte(`resultRef`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked result field %s in %s", leaked, response.Body.String())
		}
	}
}

func TestReadQuestionBankDraftAnswerScoringInputRejectsTeacherPrincipal(t *testing.T) {
	handler := newTestHandlerWithQuestionBankAnswerScoringInput()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/ai-grading-requests/grading_req_http_qbank_answer/question-bank-answer-scoring-input",
		bytes.NewBufferString(`{"workerId":"worker_ai_grading_01"}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, teacherPrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestReadQuestionBankDraftAnswerScoringInputRejectsWrongWorker(t *testing.T) {
	handler := newTestHandlerWithQuestionBankAnswerScoringInput()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/ai-grading-requests/grading_req_http_qbank_answer/question-bank-answer-scoring-input",
		bytes.NewBufferString(`{"workerId":"worker_other"}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, servicePrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusConflict {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func newTestHandlerWithQuestionBankAnswerScoringInput() http.Handler {
	now := time.Date(2026, 6, 6, 10, 40, 0, 0, time.UTC)
	request := claimedAIGradingRequest(
		"grading_req_http_qbank_answer",
		"tarch_http_3",
		"student_001",
		now.Add(-5*time.Minute),
	)
	request.GradingInstructions = "score submitted question bank answers"
	request.SourceArchiveContentRef = "local://question-bank-drafts/tutor_req_001.json"
	request.SourceQuestionBankDraftRef = "local://question-bank-drafts/tutor_req_001.json"
	request.SourceQuestionBankAnswerSubmissionID = "qbank_ans_sub_http_answer"
	request.SourceArchiveOCRStatus = domain.OCRStatusNotRequired
	store := &fakeRepository{
		gradingRequests: []domain.AIGradingRequest{request},
		questionBankDraftContents: []domain.QuestionBankDraftContent{
			questionBankDraftHTTPContent("tutor_req_001", "tarch_http_3", "student_001"),
		},
		questionBankDraftAnswerSubmissions: []domain.QuestionBankDraftAnswerSubmission{
			questionBankDraftHTTPAnswerSubmission(),
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		ReadQuestionBankDraftAnswerScoringInput: usecase.NewReadQuestionBankDraftAnswerScoringInput(store, fixedClock{now: now}),
		AgentAPIKey:                             "ueacd",
	}).Handler()
}

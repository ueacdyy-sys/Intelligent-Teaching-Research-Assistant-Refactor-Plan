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

func TestQuestionBankDraftAnswerScoringCompletionBridgeReusesWorkerResultAndStudentSafeRead(t *testing.T) {
	handler := newTestHandlerWithQuestionBankAnswerScoringCompletionBridge()

	inputRequest := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/ai-grading-requests/grading_req_http_qbank_answer_bridge/question-bank-answer-scoring-input",
		bytes.NewBufferString(`{"workerId":" worker_ai_grading_01 "}`),
	)
	inputRequest.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, inputRequest, servicePrincipal())

	inputResponse := httptest.NewRecorder()
	handler.ServeHTTP(inputResponse, inputRequest)

	if inputResponse.Code != http.StatusOK {
		t.Fatalf("input status = %d, body = %s", inputResponse.Code, inputResponse.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"answerText":"3/4"`),
		[]byte(`"expectedAnswer":"3/4"`),
		[]byte(`"explanation":"Use a common denominator of 4."`),
	} {
		if !bytes.Contains(inputResponse.Body.Bytes(), fragment) {
			t.Fatalf("worker input body missing %s in %s", fragment, inputResponse.Body.String())
		}
	}

	resultRequest := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/ai-grading-requests/grading_req_http_qbank_answer_bridge/worker-result",
		bytes.NewBufferString(`{"status":"SUCCEEDED","workerId":"worker_ai_grading_01","scoreSummary":" score 93 ","resultRef":"local://grading/grading_req_http_qbank_answer_bridge/result.json"}`),
	)
	resultRequest.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, resultRequest, servicePrincipal())

	resultResponse := httptest.NewRecorder()
	handler.ServeHTTP(resultResponse, resultRequest)

	if resultResponse.Code != http.StatusOK {
		t.Fatalf("worker result status = %d, body = %s", resultResponse.Code, resultResponse.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"status":"SUCCEEDED"`),
		[]byte(`"scoreSummary":"score 93"`),
		[]byte(`"sourceQuestionBankAnswerSubmissionId":"qbank_ans_sub_http_answer"`),
		[]byte(`"resultRef":"local://grading/grading_req_http_qbank_answer_bridge/result.json"`),
	} {
		if !bytes.Contains(resultResponse.Body.Bytes(), fragment) {
			t.Fatalf("worker result body missing %s in %s", fragment, resultResponse.Body.String())
		}
	}

	studentRequest := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/ai-grading-result",
		http.NoBody,
	)
	studentRequest.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, studentRequest, studentPrincipal("student_001"))

	studentResponse := httptest.NewRecorder()
	handler.ServeHTTP(studentResponse, studentRequest)

	if studentResponse.Code != http.StatusOK {
		t.Fatalf("student result status = %d, body = %s", studentResponse.Code, studentResponse.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"submissionId":"qbank_ans_sub_http_answer"`),
		[]byte(`"requestId":"grading_req_http_qbank_answer_bridge"`),
		[]byte(`"status":"SUCCEEDED"`),
		[]byte(`"scoreSummary":"score 93"`),
		[]byte(`"completedAt"`),
	} {
		if !bytes.Contains(studentResponse.Body.Bytes(), fragment) {
			t.Fatalf("student result body missing %s in %s", fragment, studentResponse.Body.String())
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
		[]byte(`Use a common denominator of 4.`),
	} {
		if bytes.Contains(studentResponse.Body.Bytes(), leaked) {
			t.Fatalf("student result body leaked %s in %s", leaked, studentResponse.Body.String())
		}
	}
}

func newTestHandlerWithQuestionBankAnswerScoringCompletionBridge() http.Handler {
	now := time.Date(2026, 6, 6, 10, 45, 0, 0, time.UTC)
	request := claimedAIGradingRequest(
		"grading_req_http_qbank_answer_bridge",
		"tarch_http_3",
		"student_001",
		now.Add(-10*time.Minute),
	)
	request.GradingInstructions = "score submitted question bank answers"
	request.SourceArchiveContentRef = "local://question-bank-drafts/tutor_req_001.json"
	request.SourceQuestionBankDraftRef = "local://question-bank-drafts/tutor_req_001.json"
	request.SourceQuestionBankAnswerSubmissionID = "qbank_ans_sub_http_answer"
	request.SourceArchiveMaterial = domain.MaterialTypeQuiz
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
		ReadQuestionBankDraftAnswerScoringInput:            usecase.NewReadQuestionBankDraftAnswerScoringInput(store, fixedClock{now: now}),
		RecordAIGradingResult:                              usecase.NewRecordAIGradingResult(store, fixedClock{now: now.Add(time.Minute)}),
		ReadStudentAppQuestionBankDraftAnswerScoringResult: usecase.NewReadStudentAppQuestionBankDraftAnswerScoringResult(store),
		AgentAPIKey: "ueacd",
	}).Handler()
}

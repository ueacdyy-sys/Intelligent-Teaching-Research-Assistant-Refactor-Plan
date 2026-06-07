package httpapi_test

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/httpapi"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestClaimAIGradingRequestReturnsWorkerClaim(t *testing.T) {
	handler := newTestHandlerWithAIGradingClaimRequests([]domain.AIGradingRequest{
		httpAIGradingRequest("grading_req_http_claim", "tarch_http_3", "student_001", time.Date(2026, 5, 29, 10, 3, 0, 0, time.UTC)),
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/ai-grading-requests/worker-claims",
		bytes.NewBufferString(`{"workerId":" worker_ai_grading_01 ","leaseSeconds":120}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, servicePrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"status":"IN_PROGRESS"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"claimedByWorkerId":"worker_ai_grading_01"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"claimExpiresAt"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"sourceArchiveContentRef":"local://archive/student/quiz.pdf"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func TestClaimAIGradingRequestReturnsQuizSubmissionSourceRefs(t *testing.T) {
	request := httpAIGradingRequest(
		"grading_req_http_claim",
		"tarch_http_3",
		"student_001",
		time.Date(2026, 5, 29, 10, 3, 0, 0, time.UTC),
	)
	request.SourceQuizSubmissionID = "quiz_sub_http_answer"
	request.SourceAnswerRef = "local://answers/student_001/week-3.json"
	handler := newTestHandlerWithAIGradingClaimRequests([]domain.AIGradingRequest{request})
	httpRequest := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/ai-grading-requests/worker-claims",
		bytes.NewBufferString(`{"workerId":" worker_ai_grading_01 ","leaseSeconds":120}`),
	)
	httpRequest.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, httpRequest, servicePrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httpRequest)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"sourceQuizSubmissionId":"quiz_sub_http_answer"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"sourceAnswerRef":"local://answers/student_001/week-3.json"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func TestClaimAIGradingRequestReturnsQuestionBankAnswerSourceRefs(t *testing.T) {
	request := httpAIGradingRequest(
		"grading_req_http_claim",
		"tarch_http_3",
		"student_001",
		time.Date(2026, 5, 29, 10, 3, 0, 0, time.UTC),
	)
	request.SourceArchiveContentRef = "local://question-bank-drafts/tutor_req_001.json"
	request.SourceQuestionBankDraftRef = "local://question-bank-drafts/tutor_req_001.json"
	request.SourceQuestionBankAnswerSubmissionID = "qbank_ans_sub_http_answer"
	request.SourceArchiveOCRStatus = domain.OCRStatusNotRequired
	handler := newTestHandlerWithAIGradingClaimRequests([]domain.AIGradingRequest{request})
	httpRequest := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/ai-grading-requests/worker-claims",
		bytes.NewBufferString(`{"workerId":" worker_ai_grading_01 ","leaseSeconds":120}`),
	)
	httpRequest.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, httpRequest, servicePrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httpRequest)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"sourceQuestionBankDraftRef":"local://question-bank-drafts/tutor_req_001.json"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"sourceQuestionBankAnswerSubmissionId":"qbank_ans_sub_http_answer"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	for _, leaked := range [][]byte{
		[]byte(`answerText`),
		[]byte(`expectedAnswer`),
		[]byte(`explanation`),
		[]byte(`scoreSummary`),
		[]byte(`3/4`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestClaimAIGradingRequestReturnsNoContentWhenQueueEmpty(t *testing.T) {
	handler := newTestHandlerWithAIGradingClaimRequests(nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/ai-grading-requests/worker-claims",
		bytes.NewBufferString(`{"workerId":"worker_ai_grading_01","leaseSeconds":120}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, servicePrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if response.Body.Len() != 0 {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func newTestHandlerWithAIGradingClaimRequests(requests []domain.AIGradingRequest) http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			archiveItem("tarch_http_3", "student_001", time.Date(2026, 5, 29, 10, 3, 0, 0, time.UTC)),
		},
		gradingRequests: append([]domain.AIGradingRequest(nil), requests...),
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		CreateArchiveItem:             usecase.NewCreateArchiveItem(store, fixedIDs{id: "tarch_http"}, fixedClock{}),
		ListArchiveItems:              usecase.NewListArchiveItems(store),
		CreateAIGradingRequest:        usecase.NewCreateAIGradingRequest(store, fixedIDs{id: "grading_req_http"}, fixedClock{}),
		CreateQuizSubmissionAIGrading: usecase.NewCreateQuizSubmissionAIGradingRequest(store, fixedIDs{id: "grading_req_http"}, fixedClock{}),
		ListAIGradingRequests:         usecase.NewListAIGradingRequests(store),
		ClaimAIGradingRequest:         usecase.NewClaimAIGradingRequest(store, fixedClock{now: time.Date(2026, 5, 29, 18, 0, 0, 0, time.UTC)}),
		RecordAIGradingResult:         usecase.NewRecordAIGradingResult(store, fixedClock{now: time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)}),
		CreateTutoringAnalysisRequest: usecase.NewCreateTutoringAnalysisRequest(store, fixedIDs{id: "tutor_req_http"}, fixedClock{}),
		ListTutoringAnalysisRequests:  usecase.NewListTutoringAnalysisRequests(store),
		ClaimTutoringAnalysisRequest:  usecase.NewClaimTutoringAnalysisRequest(store, fixedClock{}),
		RecordTutoringAnalysisResult:  usecase.NewRecordTutoringAnalysisResult(store, fixedClock{}),
		AgentAPIKey:                   "ueacd",
	}).Handler()
}

func (f *fakeRepository) ClaimNextAIGradingRequest(
	_ context.Context,
	input domain.ClaimAIGradingRequestInput,
	now time.Time,
) (domain.AIGradingRequest, bool, error) {
	for index, request := range f.gradingRequests {
		claimed, err := domain.ApplyAIGradingClaim(request, input, now)
		if err == nil {
			f.gradingRequests[index] = claimed
			return claimed, true, nil
		}
		if !errors.Is(err, domain.ErrConflict) {
			return domain.AIGradingRequest{}, false, err
		}
	}
	return domain.AIGradingRequest{}, false, nil
}

package httpapi_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/httpapi"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestSubmitQuizDraftIntentReturnsAcceptedReviewOnlyCommand(t *testing.T) {
	handler := newTestHandlerWithQuizDraftIntent()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/quiz-draft-intents",
		bytes.NewBufferString(validQuizDraftIntentJSON()),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, teacherPrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusAccepted {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"id":"quiz_draft_intent_http"`),
		[]byte(`"status":"REVIEW_REQUIRED"`),
		[]byte(`"approvalRequired":true`),
		[]byte(`"eventType":"AGENT_WRITE_INTENT_REVIEW_REQUIRED"`),
		[]byte(`"id":"cmd_quiz_draft_intent_http"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	if bytes.Contains(response.Body.Bytes(), []byte("questions")) {
		t.Fatalf("body leaked final quiz content: %s", response.Body.String())
	}
	if response.Header().Get("X-Teaching-Write-Acceptance") != "review-only-command-intent" {
		t.Fatalf("X-Teaching-Write-Acceptance = %q", response.Header().Get("X-Teaching-Write-Acceptance"))
	}
	if !strings.Contains(response.Header().Get("Server-Timing"), "command.append;dur=") {
		t.Fatalf("Server-Timing = %q, want command.append", response.Header().Get("Server-Timing"))
	}
}

func TestSubmitQuizDraftIntentRejectsStudentPrincipal(t *testing.T) {
	handler := newTestHandlerWithQuizDraftIntent()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/quiz-draft-intents",
		bytes.NewBufferString(validQuizDraftIntentJSON()),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func newTestHandlerWithQuizDraftIntent() http.Handler {
	store := &fakeRepository{}
	return httpapi.NewServer(httpapi.ServerConfig{
		CreateArchiveItem:             usecase.NewCreateArchiveItem(store, fixedIDs{id: "tarch_http"}, fixedClock{}),
		ListArchiveItems:              usecase.NewListArchiveItems(store),
		CreateAIGradingRequest:        usecase.NewCreateAIGradingRequest(store, fixedIDs{id: "grading_req_http"}, fixedClock{}),
		CreateQuizSubmissionAIGrading: usecase.NewCreateQuizSubmissionAIGradingRequest(store, fixedIDs{id: "grading_req_http"}, fixedClock{}),
		ListAIGradingRequests:         usecase.NewListAIGradingRequests(store),
		CreateTutoringAnalysisRequest: usecase.NewCreateTutoringAnalysisRequest(store, fixedIDs{id: "tutor_req_http"}, fixedClock{}),
		ListTutoringAnalysisRequests:  usecase.NewListTutoringAnalysisRequests(store),
		ClaimTutoringAnalysisRequest:  usecase.NewClaimTutoringAnalysisRequest(store, fixedClock{}),
		RecordTutoringAnalysisResult:  usecase.NewRecordTutoringAnalysisResult(store, fixedClock{}),
		SubmitTeachingQuizDraftIntent: usecase.NewSubmitTeachingQuizDraftIntent(
			store,
			fixedIDs{id: "quiz_draft_intent_http"},
			fixedClock{now: time.Date(2026, 6, 4, 16, 30, 0, 0, time.UTC)},
		),
		AgentAPIKey: "ueacd",
	}).Handler()
}

func validQuizDraftIntentJSON() string {
	return `{
		"title":"Week 3 fractions check",
		"sourceMaterialRefs":["tarch_lesson_001"],
		"learningObjectives":["compare fractions"],
		"questionCount":10,
		"difficulty":"MEDIUM",
		"sharedContextRef":"shared-context://agent-task-001",
		"guardrailResultRef":"guardrail://agent-task-001",
		"routeDecisionRef":"route://agent-task-001",
		"inputHash":"sha256:abc123",
		"outputSummary":"review-only quiz draft intent",
		"approvalArtifactRef":"approval://agent-task-001",
		"rollbackPlanRef":"rollback://agent-task-001",
		"auditTraceRef":"audit://agent-task-001",
		"idempotencyKey":"teaching-quiz-draft:week-3"
	}`
}

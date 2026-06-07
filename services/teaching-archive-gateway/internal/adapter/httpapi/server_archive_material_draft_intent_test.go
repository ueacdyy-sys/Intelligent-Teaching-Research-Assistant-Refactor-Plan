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

func TestSubmitArchiveMaterialDraftIntentReturnsAcceptedReviewOnlyCommand(t *testing.T) {
	handler := newTestHandlerWithArchiveMaterialDraftIntent()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/archive-material-draft-intents",
		bytes.NewBufferString(validArchiveMaterialDraftIntentJSON()),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, teacherPrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusAccepted {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"id":"archive_material_draft_intent_http"`),
		[]byte(`"status":"REVIEW_REQUIRED"`),
		[]byte(`"approvalRequired":true`),
		[]byte(`"eventType":"AGENT_WRITE_INTENT_REVIEW_REQUIRED"`),
		[]byte(`"id":"cmd_archive_material_draft_intent_http"`),
		[]byte(`"draftArtifactRef":"draft://archive-material/student_001/fractions-packet"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	if bytes.Contains(response.Body.Bytes(), []byte(`"contentRef"`)) {
		t.Fatalf("body leaked final archive material contentRef: %s", response.Body.String())
	}
	if response.Header().Get("X-Teaching-Write-Acceptance") != "review-only-command-intent" {
		t.Fatalf("X-Teaching-Write-Acceptance = %q", response.Header().Get("X-Teaching-Write-Acceptance"))
	}
	if !strings.Contains(response.Header().Get("Server-Timing"), "command.append;dur=") {
		t.Fatalf("Server-Timing = %q, want command.append", response.Header().Get("Server-Timing"))
	}
}

func TestSubmitArchiveMaterialDraftIntentRejectsStudentPrincipal(t *testing.T) {
	handler := newTestHandlerWithArchiveMaterialDraftIntent()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/archive-material-draft-intents",
		bytes.NewBufferString(validArchiveMaterialDraftIntentJSON()),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func newTestHandlerWithArchiveMaterialDraftIntent() http.Handler {
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
		SubmitArchiveMaterialDraftIntent: usecase.NewSubmitTeachingArchiveMaterialDraftIntent(
			store,
			fixedIDs{id: "archive_material_draft_intent_http"},
			fixedClock{now: time.Date(2026, 6, 4, 17, 45, 0, 0, time.UTC)},
		),
		AgentAPIKey: "ueacd",
	}).Handler()
}

func validArchiveMaterialDraftIntentJSON() string {
	return `{
		"ownerType":"STUDENT",
		"studentId":"student_001",
		"materialType":"HANDOUT",
		"title":"Student fraction portfolio packet",
		"source":"TEACHER_UPLOAD",
		"sourceRefs":["tarch_quiz_001"],
		"draftArtifactRef":"draft://archive-material/student_001/fractions-packet",
		"tags":["fractions"],
		"analysisIntents":["TUTORING"],
		"sharedContextRef":"shared-context://agent-task-archive-material-001",
		"guardrailResultRef":"guardrail://agent-task-archive-material-001",
		"routeDecisionRef":"route://agent-task-archive-material-001",
		"inputHash":"sha256:archive123",
		"outputSummary":"review-only archive material draft intent",
		"approvalArtifactRef":"approval://agent-task-archive-material-001",
		"rollbackPlanRef":"rollback://agent-task-archive-material-001",
		"auditTraceRef":"audit://agent-task-archive-material-001",
		"idempotencyKey":"archive-material-draft:student_001:fractions"
	}`
}

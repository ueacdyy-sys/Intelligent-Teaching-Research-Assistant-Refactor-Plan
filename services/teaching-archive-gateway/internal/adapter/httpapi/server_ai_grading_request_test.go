package httpapi_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCreateAIGradingRequestReturnsCreatedResponse(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/archive-items/tarch_http_3/ai-grading-requests",
		bytes.NewBufferString(`{"gradingInstructions":" grade short answers ","rubricRef":"local://rubrics/week-3.json"}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"id":"grading_req_http"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"status":"QUEUED"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"rubricRef":"local://rubrics/week-3.json"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"sourceArchiveContentRef":"local://archive/student/quiz.pdf"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

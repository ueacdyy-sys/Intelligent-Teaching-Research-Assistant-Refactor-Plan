package httpapi_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCreateStudentAppQuizScanSubmissionReturnsCreatedResponse(t *testing.T) {
	handler := newTestHandlerWithTeachingQuizScan()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/quiz-scan-submissions",
		bytes.NewBufferString(`{"scanCode":" teaching-quiz:tarch_http_quiz ","answerRef":" local://answers/student_001/week-3.json "}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"id":"quiz_sub_scan_http"`),
		[]byte(`"quizArchiveItemId":"tarch_http_quiz"`),
		[]byte(`"studentId":"student_001"`),
		[]byte(`"answerRef":"local://answers/student_001/week-3.json"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
}

func TestCreateStudentAppQuizScanSubmissionRejectsUnsupportedMethod(t *testing.T) {
	handler := newTestHandlerWithTeachingQuizScan()
	request := httptest.NewRequest(http.MethodGet, "/v1/student-app/quiz-scan-submissions", http.NoBody)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

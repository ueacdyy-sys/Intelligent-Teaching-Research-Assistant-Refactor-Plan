package httpapi_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/httpapi"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestCreateAttendanceSessionReturnsCreatedResponse(t *testing.T) {
	store := &fakeRepository{}
	handler := httpapi.NewServer(
		usecase.NewCreateArchiveItem(store, fixedIDs{id: "tarch_http"}, fixedClock{}),
		usecase.NewListArchiveItems(store),
		usecase.NewCreateAIGradingRequest(store, fixedIDs{id: "grading_req_http"}, fixedClock{}),
		usecase.NewCreateQuizSubmissionAIGradingRequest(store, fixedIDs{id: "grading_req_http"}, fixedClock{}),
		listAIGradingRequestsNoop(store),
		nil,
		nil,
		usecase.NewCreateTutoringAnalysisRequest(store, fixedIDs{id: "tutor_req_http"}, fixedClock{}),
		usecase.NewListTutoringAnalysisRequests(store),
		nil,
		nil,
		nil,
		nil,
		usecase.NewCreateAttendanceSession(store, fixedIDs{id: "att_sess_http"}, fixedClock{now: time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC)}),
		nil,
		nil,
		nil,
		nil,
		"ueacd",
	).Handler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/attendance-sessions",
		bytes.NewBufferString(`{"sessionType":"QRCODE","className":"Class A","expectedStudentCount":42,"configRef":"local://attendance/qrcode/class-a.json"}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, teacherPrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"id":"att_sess_http"`),
		[]byte(`"sessionType":"QRCODE"`),
		[]byte(`"className":"Class A"`),
		[]byte(`"expectedStudentCount":42`),
		[]byte(`"presentCount":0`),
		[]byte(`"status":"ACTIVE"`),
		[]byte(`"createdByPrincipalId":"teacher_001"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	if len(store.attendanceSessions) != 1 {
		t.Fatalf("attendanceSessions = %d", len(store.attendanceSessions))
	}
}

func listAIGradingRequestsNoop(store *fakeRepository) *usecase.ListAIGradingRequests {
	return usecase.NewListAIGradingRequests(store)
}

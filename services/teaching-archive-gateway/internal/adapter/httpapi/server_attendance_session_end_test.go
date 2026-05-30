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

func TestEndAttendanceSessionReturnsEndedResponse(t *testing.T) {
	store := &fakeRepository{
		attendanceSessions: []domain.AttendanceSession{
			attendanceHTTPSession("att_sess_http"),
		},
	}
	handler := newAttendanceSessionEndHandler(store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/attendance-sessions/att_sess_http/end",
		http.NoBody,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, teacherPrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"id":"att_sess_http"`),
		[]byte(`"status":"ENDED"`),
		[]byte(`"endedAt":"2026-05-30T12:20:00Z"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
}

func TestEndAttendanceSessionRejectsUnsupportedMethod(t *testing.T) {
	store := &fakeRepository{
		attendanceSessions: []domain.AttendanceSession{
			attendanceHTTPSession("att_sess_http"),
		},
	}
	handler := newAttendanceSessionEndHandler(store)
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/teaching/attendance-sessions/att_sess_http/end",
		http.NoBody,
	)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func newAttendanceSessionEndHandler(store *fakeRepository) http.Handler {
	return httpapi.NewServer(
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
		usecase.NewCreateAttendanceSession(store, fixedIDs{id: "att_sess_http"}, fixedClock{}),
		usecase.NewCreateAttendanceRecord(store, fixedIDs{id: "att_rec_http"}, fixedClock{}),
		usecase.NewSignInAttendance(store, fixedIDs{id: "att_rec_signin_http"}, fixedClock{}),
		usecase.NewEndAttendanceSession(store, fixedClock{now: time.Date(2026, 5, 30, 12, 20, 0, 0, time.UTC)}),
		nil,
		nil,
		nil,
		"ueacd",
	).Handler()
}

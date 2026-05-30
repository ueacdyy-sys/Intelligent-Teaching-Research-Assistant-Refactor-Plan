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

func TestSelectAttendanceRandomStudentsReturnsSelection(t *testing.T) {
	store := &fakeRepository{
		attendanceSessions: []domain.AttendanceSession{
			attendanceHTTPSession("att_sess_http"),
		},
		attendanceRecords: []domain.AttendanceRecord{
			{
				ID:        "att_rec_present",
				SessionID: "att_sess_http",
				StudentID: "student_001",
				Status:    domain.AttendanceRecordStatusPresent,
				CreatedAt: time.Date(2026, 5, 30, 12, 1, 0, 0, time.UTC),
			},
		},
	}
	handler := newAttendanceRandomSelectionHandler(store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/attendance-sessions/att_sess_http/random-selections",
		bytes.NewBufferString(`{"count":2,"candidates":[{"studentId":"student_001","displayName":"A"},{"studentId":"student_002","displayName":"B"},{"studentId":"student_003","displayName":"C","rollcallWeight":3}]}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, teacherPrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"sessionId":"att_sess_http"`),
		[]byte(`"eligibleCount":2`),
		[]byte(`"studentId":"student_003"`),
		[]byte(`"selectionWeight":3`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	if bytes.Contains(response.Body.Bytes(), []byte(`"studentId":"student_001"`)) {
		t.Fatalf("present student leaked in body = %s", response.Body.String())
	}
}

func TestSelectAttendanceRandomStudentsRejectsUnsupportedMethod(t *testing.T) {
	handler := newAttendanceRandomSelectionHandler(&fakeRepository{})
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/teaching/attendance-sessions/att_sess_http/random-selections",
		http.NoBody,
	)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func newAttendanceRandomSelectionHandler(store *fakeRepository) http.Handler {
	return httpapi.NewServer(httpapi.ServerConfig{
		CreateArchiveItem:              usecase.NewCreateArchiveItem(store, fixedIDs{id: "tarch_http"}, fixedClock{}),
		ListArchiveItems:               usecase.NewListArchiveItems(store),
		CreateAIGradingRequest:         usecase.NewCreateAIGradingRequest(store, fixedIDs{id: "grading_req_http"}, fixedClock{}),
		CreateQuizSubmissionAIGrading:  usecase.NewCreateQuizSubmissionAIGradingRequest(store, fixedIDs{id: "grading_req_http"}, fixedClock{}),
		ListAIGradingRequests:          listAIGradingRequestsNoop(store),
		CreateTutoringAnalysisRequest:  usecase.NewCreateTutoringAnalysisRequest(store, fixedIDs{id: "tutor_req_http"}, fixedClock{}),
		ListTutoringAnalysisRequests:   usecase.NewListTutoringAnalysisRequests(store),
		CreateAttendanceSession:        usecase.NewCreateAttendanceSession(store, fixedIDs{id: "att_sess_http"}, fixedClock{}),
		CreateAttendanceRecord:         usecase.NewCreateAttendanceRecord(store, fixedIDs{id: "att_rec_http"}, fixedClock{}),
		SignInAttendance:               usecase.NewSignInAttendance(store, fixedIDs{id: "att_rec_signin_http"}, fixedClock{}),
		EndAttendanceSession:           usecase.NewEndAttendanceSession(store, fixedClock{}),
		SelectAttendanceRandomStudents: usecase.NewSelectAttendanceRandomStudents(store, &fixedRandomFloats{values: []float64{0.99, 0}}),
		AgentAPIKey:                    "ueacd",
	}).Handler()
}

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

func TestCreateAttendanceRecordReturnsCreatedResponse(t *testing.T) {
	store := &fakeRepository{
		attendanceSessions: []domain.AttendanceSession{
			{
				ID:                   "att_sess_http",
				SessionType:          domain.AttendanceSessionTypeQRCode,
				ExpectedStudentCount: 42,
				Status:               domain.AttendanceSessionStatusActive,
				CreatedByPrincipalID: "teacher_001",
				CreatedAt:            time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC),
			},
		},
	}
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
		usecase.NewCreateAttendanceSession(store, fixedIDs{id: "att_sess_http"}, fixedClock{}),
		usecase.NewCreateAttendanceRecord(store, fixedIDs{id: "att_rec_http"}, fixedClock{now: time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC)}),
		"ueacd",
	).Handler()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/attendance-sessions/att_sess_http/records",
		bytes.NewBufferString(`{"studentId":" student_001 ","status":"present","note":" Arrived "}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, teacherPrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"id":"att_rec_http"`),
		[]byte(`"sessionId":"att_sess_http"`),
		[]byte(`"studentId":"student_001"`),
		[]byte(`"status":"PRESENT"`),
		[]byte(`"recordedByPrincipalId":"teacher_001"`),
		[]byte(`"signTime":"2026-05-30T12:05:00Z"`),
		[]byte(`"note":"Arrived"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	if len(store.attendanceRecords) != 1 {
		t.Fatalf("attendanceRecords = %d", len(store.attendanceRecords))
	}
}

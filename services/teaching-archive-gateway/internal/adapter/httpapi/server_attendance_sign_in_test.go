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

func TestSignInAttendanceReturnsCreatedResponse(t *testing.T) {
	store := &fakeRepository{
		attendanceSessions: []domain.AttendanceSession{
			attendanceHTTPSession("att_sess_http"),
		},
	}
	handler := newAttendanceSignInHandler(store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/attendance-sessions/att_sess_http/sign-ins",
		bytes.NewBufferString(`{"method":"qr"}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"id":"att_rec_signin_http"`),
		[]byte(`"sessionId":"att_sess_http"`),
		[]byte(`"studentId":"student_001"`),
		[]byte(`"status":"PRESENT"`),
		[]byte(`"recordedByPrincipalId":"student_001"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
}

func TestSignInAttendanceReturnsOKForDuplicate(t *testing.T) {
	store := &fakeRepository{
		attendanceSessions: []domain.AttendanceSession{
			attendanceHTTPSession("att_sess_http"),
		},
		attendanceRecords: []domain.AttendanceRecord{
			{
				ID:                    "att_rec_existing",
				SessionID:             "att_sess_http",
				StudentID:             "student_001",
				Status:                domain.AttendanceRecordStatusPresent,
				RecordedByPrincipalID: "student_001",
				CreatedAt:             time.Date(2026, 5, 30, 12, 1, 0, 0, time.UTC),
			},
		},
	}
	handler := newAttendanceSignInHandler(store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/teaching/attendance-sessions/att_sess_http/sign-ins",
		bytes.NewBufferString(`{"method":"QR"}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"id":"att_rec_existing"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func newAttendanceSignInHandler(store *fakeRepository) http.Handler {
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
		usecase.NewSignInAttendance(store, fixedIDs{id: "att_rec_signin_http"}, fixedClock{now: time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC)}),
		nil,
		nil,
		nil,
		nil,
		nil,
		"ueacd",
	).Handler()
}

func attendanceHTTPSession(id string) domain.AttendanceSession {
	return domain.AttendanceSession{
		ID:                   id,
		SessionType:          domain.AttendanceSessionTypeQRCode,
		ExpectedStudentCount: 42,
		Status:               domain.AttendanceSessionStatusActive,
		CreatedByPrincipalID: "teacher_001",
		CreatedAt:            time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC),
	}
}

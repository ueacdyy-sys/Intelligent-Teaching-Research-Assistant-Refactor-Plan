package httpapi_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/httpapi"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestListAttendanceRecordsScopesStudentRows(t *testing.T) {
	handler := newTestHandlerWithAttendanceRows([]domain.AttendanceRecord{
		httpAttendanceRecord("att_rec_http_2", "student_001", time.Date(2026, 5, 30, 12, 2, 0, 0, time.UTC)),
		httpAttendanceRecord("att_rec_http_other", "student_002", time.Date(2026, 5, 30, 12, 1, 30, 0, time.UTC)),
		httpAttendanceRecord("att_rec_http_1", "student_001", time.Date(2026, 5, 30, 12, 1, 0, 0, time.UTC)),
	})
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/teaching/attendance-sessions/att_sess_http/records?pageSize=1",
		nil,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"id":"att_rec_http_2"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if bytes.Contains(response.Body.Bytes(), []byte("student_002")) {
		t.Fatalf("student_002 leaked in body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"hasMore":true`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"nextCursor"`)) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func newTestHandlerWithAttendanceRows(rows []domain.AttendanceRecord) http.Handler {
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
		attendanceRecords: append([]domain.AttendanceRecord(nil), rows...),
	}
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
		CreateAttendanceSession:       usecase.NewCreateAttendanceSession(store, fixedIDs{id: "att_sess_http"}, fixedClock{}),
		CreateAttendanceRecord:        usecase.NewCreateAttendanceRecord(store, fixedIDs{id: "att_rec_http"}, fixedClock{}),
		ListAttendanceRecords:         usecase.NewListAttendanceRecords(store),
		AgentAPIKey:                   "ueacd",
	}).Handler()
}

func (f *fakeRepository) ListAttendanceRecords(
	_ context.Context,
	query domain.AttendanceRecordQuery,
) ([]domain.AttendanceRecord, error) {
	records := make([]domain.AttendanceRecord, 0, len(f.attendanceRecords))
	for _, record := range f.attendanceRecords {
		if query.SessionID != "" && record.SessionID != query.SessionID {
			continue
		}
		if query.StudentID != "" && record.StudentID != query.StudentID {
			continue
		}
		if len(query.StudentIDs) > 0 && !containsString(query.StudentIDs, record.StudentID) {
			continue
		}
		records = append(records, record)
		if query.FetchLimit > 0 && len(records) >= query.FetchLimit {
			break
		}
	}
	return records, nil
}

func httpAttendanceRecord(id string, studentID string, createdAt time.Time) domain.AttendanceRecord {
	return domain.AttendanceRecord{
		ID:                    id,
		SessionID:             "att_sess_http",
		StudentID:             studentID,
		Status:                domain.AttendanceRecordStatusPresent,
		RecordedByPrincipalID: "teacher_001",
		SignTime:              createdAt,
		CreatedAt:             createdAt,
	}
}

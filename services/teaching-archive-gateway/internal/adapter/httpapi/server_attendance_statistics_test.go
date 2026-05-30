package httpapi_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/httpapi"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestGetAttendanceStatisticsReturnsLegacySummaryShape(t *testing.T) {
	handler := newTestHandlerWithAttendanceStatistics(domain.AttendanceStatistics{
		TotalStudents:   42,
		TotalRecords:    10,
		AttendanceCount: 8,
		AbsenceCount:    1,
		LateCount:       1,
		AttendanceRate:  0.8,
	})
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/teaching/attendance-statistics?className=Class%20A",
		nil,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, teacherPrincipal())

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"totalStudents":42`),
		[]byte(`"totalRecords":10`),
		[]byte(`"attendanceCount":8`),
		[]byte(`"absenceCount":1`),
		[]byte(`"lateCount":1`),
		[]byte(`"attendanceRate":0.8`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s: %s", fragment, response.Body.String())
		}
	}
}

func newTestHandlerWithAttendanceStatistics(stats domain.AttendanceStatistics) http.Handler {
	store := &fakeRepository{
		attendanceStats: stats,
	}
	return httpapi.NewServer(
		usecase.NewCreateArchiveItem(store, fixedIDs{id: "tarch_http"}, fixedClock{}),
		usecase.NewListArchiveItems(store),
		usecase.NewCreateAIGradingRequest(store, fixedIDs{id: "grading_req_http"}, fixedClock{}),
		usecase.NewCreateQuizSubmissionAIGradingRequest(store, fixedIDs{id: "grading_req_http"}, fixedClock{}),
		usecase.NewListAIGradingRequests(store),
		nil,
		nil,
		usecase.NewCreateTutoringAnalysisRequest(store, fixedIDs{id: "tutor_req_http"}, fixedClock{}),
		usecase.NewListTutoringAnalysisRequests(store),
		usecase.NewClaimTutoringAnalysisRequest(store, fixedClock{}),
		usecase.NewRecordTutoringAnalysisResult(store, fixedClock{}),
		nil,
		nil,
		nil,
		usecase.NewCreateAttendanceSession(store, fixedIDs{id: "att_sess_http"}, fixedClock{}),
		usecase.NewCreateAttendanceRecord(store, fixedIDs{id: "att_rec_http"}, fixedClock{}),
		nil,
		nil,
		nil,
		usecase.NewListAttendanceRecords(store),
		usecase.NewListStudentAttendanceRecords(store),
		usecase.NewGetAttendanceStatistics(store),
		"ueacd",
	).Handler()
}

func (f *fakeRepository) GetAttendanceStatistics(
	_ context.Context,
	query domain.AttendanceStatisticsQuery,
) (domain.AttendanceStatistics, error) {
	f.lastAttendanceStatsQuery = query
	return f.attendanceStats, nil
}

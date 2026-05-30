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

func TestListStudentAppArchiveItemsReturnsOwnArchiveResponse(t *testing.T) {
	handler := newTestHandlerWithStudentAppArchiveItems()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items?materialType=HANDOUT&pageSize=10",
		nil,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"id":"tarch_handout_http"`),
		[]byte(`"ownerType":"STUDENT"`),
		[]byte(`"studentId":"student_001"`),
		[]byte(`"materialType":"HANDOUT"`),
		[]byte(`"title":"Learning Handout"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`tarch_quiz_http`),
		[]byte(`tarch_other_http`),
		[]byte(`tarch_material_http`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestListStudentAppArchiveItemsRejectsUnsupportedMethod(t *testing.T) {
	handler := newTestHandlerWithStudentAppArchiveItems()
	request := httptest.NewRequest(http.MethodPost, "/v1/student-app/archive-items", http.NoBody)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func newTestHandlerWithStudentAppArchiveItems() http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			studentHandoutHTTPItem("tarch_handout_http", "student_001", time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC)),
			archiveItem("tarch_quiz_http", "student_001", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
			archiveItem("tarch_other_http", "student_002", time.Date(2026, 5, 30, 8, 0, 0, 0, time.UTC)),
			teachingMaterialHTTPItem("tarch_material_http", time.Date(2026, 5, 30, 7, 0, 0, 0, time.UTC)),
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		ListStudentAppArchiveItems: usecase.NewListStudentAppArchiveItems(store),
		AgentAPIKey:                "ueacd",
	}).Handler()
}

func studentHandoutHTTPItem(id string, studentID string, createdAt time.Time) domain.ArchiveItem {
	return domain.ArchiveItem{
		ID:              id,
		OwnerType:       domain.OwnerTypeStudent,
		StudentID:       studentID,
		MaterialType:    domain.MaterialTypeHandout,
		Title:           "Learning Handout",
		Source:          domain.SourceTeacherUpload,
		ContentRef:      "local://archive/student/handout.pdf",
		Tags:            []string{"review"},
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentTutoring},
		OCRStatus:       domain.OCRStatusNotRequired,
		CreatedAt:       createdAt,
	}
}

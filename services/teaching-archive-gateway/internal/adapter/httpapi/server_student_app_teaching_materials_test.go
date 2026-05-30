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

func TestListStudentAppTeachingMaterialsReturnsTeachingMaterialResponse(t *testing.T) {
	handler := newTestHandlerWithStudentAppTeachingMaterials()
	request := httptest.NewRequest(http.MethodGet, "/v1/student-app/teaching-materials?pageSize=10", nil)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"id":"tarch_material_http"`),
		[]byte(`"ownerType":"TEACHING"`),
		[]byte(`"materialType":"TEACHING_MATERIAL"`),
		[]byte(`"title":"Lesson Material"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`tarch_quiz_http`),
		[]byte(`tarch_student_http`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestListStudentAppTeachingMaterialsRejectsUnsupportedMethod(t *testing.T) {
	handler := newTestHandlerWithStudentAppTeachingMaterials()
	request := httptest.NewRequest(http.MethodPost, "/v1/student-app/teaching-materials", http.NoBody)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func newTestHandlerWithStudentAppTeachingMaterials() http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			teachingMaterialHTTPItem("tarch_material_http", time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC)),
			teachingQuizHTTPItem("tarch_quiz_http", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
			archiveItem("tarch_student_http", "student_001", time.Date(2026, 5, 30, 8, 0, 0, 0, time.UTC)),
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		ListStudentAppTeachingMaterials: usecase.NewListStudentAppTeachingMaterials(store),
		AgentAPIKey:                     "ueacd",
	}).Handler()
}

func teachingMaterialHTTPItem(id string, createdAt time.Time) domain.ArchiveItem {
	return domain.ArchiveItem{
		ID:              id,
		OwnerType:       domain.OwnerTypeTeaching,
		MaterialType:    domain.MaterialTypeTeachingMaterial,
		Title:           "Lesson Material",
		Source:          domain.SourceTeacherUpload,
		ContentRef:      "local://teaching/materials/lesson.pdf",
		Tags:            []string{"lesson"},
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly},
		OCRStatus:       domain.OCRStatusNotRequired,
		CreatedAt:       createdAt,
	}
}

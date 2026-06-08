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

func TestCreateStudentAppAITutorRequestReturnsCreatedResponse(t *testing.T) {
	handler := newTestHandlerWithStudentAppAITutorRequest()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/ai-tutor-requests",
		bytes.NewBufferString(`{"studentArchiveItemId":" tarch_student_quiz ","analysisGoal":" explain weak skills "}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"id":"tutor_req_student_app"`),
		[]byte(`"archiveItemId":"tarch_student_quiz"`),
		[]byte(`"requestedByPrincipalId":"student_001"`),
		[]byte(`"questionBankIntent":"GENERATE_PERSONALIZED_CHECK"`),
		[]byte(`"sourceArchiveOwnerType":"STUDENT"`),
		[]byte(`"sourceArchiveStudentId":"student_001"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
}

func TestCreateStudentAppAITutorRequestAcceptsPublishedLearningActionSource(t *testing.T) {
	handler := newTestHandlerWithPublishedLearningActionSource()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/ai-tutor-requests",
		bytes.NewBufferString(`{
			"studentArchiveItemId":"tarch_archive_material_001",
			"analysisGoal":"generate practice from this published packet",
			"questionBankIntent":"GENERATE_PERSONALIZED_CHECK",
			"learningActionSource":{
				"actionType":"PERSONALIZED_QUESTION_BANK",
				"packetStatus":"READY"
			}
		}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"id":"tutor_req_student_app"`),
		[]byte(`"archiveItemId":"tarch_archive_material_001"`),
		[]byte(`"questionBankIntent":"GENERATE_PERSONALIZED_CHECK"`),
		[]byte(`"sourceArchiveOwnerType":"STUDENT"`),
		[]byte(`"sourceArchiveStudentId":"student_001"`),
		[]byte(`"sourceArchiveMaterial":"HANDOUT"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`"learningActionSource"`),
		[]byte(`"contentPreview"`),
		[]byte(`"contentRef"`),
		[]byte(`rawContent`),
		[]byte(`prompt`),
		[]byte(`ragChunks`),
		[]byte(`expectedAnswer`),
		[]byte(`rawModelOutput`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestCreateStudentAppAITutorRequestRejectsUnsupportedMethod(t *testing.T) {
	handler := newTestHandlerWithStudentAppAITutorRequest()
	request := httptest.NewRequest(http.MethodPut, "/v1/student-app/ai-tutor-requests", http.NoBody)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func newTestHandlerWithStudentAppAITutorRequest() http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			archiveItem("tarch_student_quiz", "student_001", time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC)),
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		CreateStudentAppAITutorRequest: usecase.NewCreateStudentAppAITutorRequest(
			store,
			fixedIDs{id: "tutor_req_student_app"},
			fixedClock{now: time.Date(2026, 5, 30, 10, 30, 0, 0, time.UTC)},
		),
		AgentAPIKey: "ueacd",
	}).Handler()
}

func newTestHandlerWithPublishedLearningActionSource() http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			{
				ID:              "tarch_archive_material_001",
				OwnerType:       domain.OwnerTypeStudent,
				StudentID:       "student_001",
				MaterialType:    domain.MaterialTypeHandout,
				Title:           "Fractions practice packet",
				Source:          domain.SourceTeacherUpload,
				ContentRef:      "local://archive/student/fractions.pdf",
				Tags:            []string{"fractions"},
				AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentTutoring},
				OCRStatus:       domain.OCRStatusNotRequired,
				CreatedAt:       time.Date(2026, 6, 7, 8, 0, 0, 0, time.UTC),
			},
		},
		publishedArchiveItemIDs: map[string]bool{
			"tarch_archive_material_001": true,
		},
		contentPreviews: []domain.PublishedArchiveMaterialContentPreview{
			publishedArchiveItemContentPreviewHTTPFixture("tarch_archive_material_001", "student_001"),
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		CreateStudentAppAITutorRequest: usecase.NewCreateStudentAppAITutorRequest(
			store,
			fixedIDs{id: "tutor_req_student_app"},
			fixedClock{now: time.Date(2026, 6, 7, 10, 30, 0, 0, time.UTC)},
		),
		AgentAPIKey: "ueacd",
	}).Handler()
}

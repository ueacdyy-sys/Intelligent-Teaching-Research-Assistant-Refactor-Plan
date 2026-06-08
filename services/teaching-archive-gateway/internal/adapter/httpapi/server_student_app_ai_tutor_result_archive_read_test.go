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

func TestReadStudentAppAITutorResultArchiveReturnsSafeCard(t *testing.T) {
	handler := newTestHandlerWithAITutorResultArchive()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_student_ai_tutor_result_001/ai-tutor-result",
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
		[]byte(`"archiveItemId":"tarch_student_ai_tutor_result_001"`),
		[]byte(`"status":"READY_FOR_STUDENT_APP_READ"`),
		[]byte(`"materialType":"HOMEWORK"`),
		[]byte(`"summary":"Guided help for comparing fractions."`),
		[]byte(`"sectionId":"ai_tutor_answer_section_001"`),
		[]byte(`"guidanceSectionsHash":"05a82687de1587bfc882ecf8ec4f54421da7ff0ab4e911cd0af88d4ffbecec4b"`),
		[]byte(`"safetyLabels":["NO_DIAGNOSIS","STUDY_GUIDANCE_ONLY"]`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`"studentId"`),
		[]byte(`"contentRef"`),
		[]byte(`resultRef`),
		[]byte(`rawModelOutput`),
		[]byte(`answerKey`),
		[]byte(`expectedAnswer`),
		[]byte(`internalError`),
		[]byte(`workerId`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestReadStudentAppAITutorResultArchiveRejectsCrossStudentTeacherAndMethod(t *testing.T) {
	handler := newTestHandlerWithAITutorResultArchive()

	crossStudent := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_student_ai_tutor_result_other/ai-tutor-result",
		nil,
	)
	crossStudent.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, crossStudent, studentPrincipal("student_001"))
	crossStudentResponse := httptest.NewRecorder()
	handler.ServeHTTP(crossStudentResponse, crossStudent)
	if crossStudentResponse.Code != http.StatusForbidden {
		t.Fatalf("cross student status = %d, body = %s", crossStudentResponse.Code, crossStudentResponse.Body.String())
	}

	teacher := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_student_ai_tutor_result_001/ai-tutor-result",
		nil,
	)
	teacher.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, teacher, teacherPrincipal())
	teacherResponse := httptest.NewRecorder()
	handler.ServeHTTP(teacherResponse, teacher)
	if teacherResponse.Code != http.StatusForbidden {
		t.Fatalf("teacher status = %d, body = %s", teacherResponse.Code, teacherResponse.Body.String())
	}

	post := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/archive-items/tarch_student_ai_tutor_result_001/ai-tutor-result",
		http.NoBody,
	)
	post.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, post, studentPrincipal("student_001"))
	postResponse := httptest.NewRecorder()
	handler.ServeHTTP(postResponse, post)
	if postResponse.Code != http.StatusMethodNotAllowed {
		t.Fatalf("post status = %d, body = %s", postResponse.Code, postResponse.Body.String())
	}
}

func newTestHandlerWithAITutorResultArchive() http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			aiTutorResultArchiveHTTPItem("tarch_student_ai_tutor_result_001", "student_001"),
			aiTutorResultArchiveHTTPItem("tarch_student_ai_tutor_result_other", "student_002"),
		},
		aiTutorResultArchiveSnapshots: []domain.StudentAppAITutorResultArchiveSnapshot{
			aiTutorResultArchiveHTTPSnapshot("tarch_student_ai_tutor_result_001", "student_001"),
			aiTutorResultArchiveHTTPSnapshot("tarch_student_ai_tutor_result_other", "student_002"),
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		ReadStudentAppAITutorResultArchive: usecase.NewReadStudentAppAITutorResultArchive(store),
		AgentAPIKey:                        "ueacd",
	}).Handler()
}

func aiTutorResultArchiveHTTPItem(id string, studentID string) domain.ArchiveItem {
	return domain.ArchiveItem{
		ID:              id,
		OwnerType:       domain.OwnerTypeStudent,
		StudentID:       studentID,
		MaterialType:    domain.MaterialTypeHomework,
		Title:           "Student AI Tutor result archive tutor_req_student_app_001",
		Source:          domain.SourceSystemImport,
		ContentRef:      "student-ai-tutor-result-archive:ai_tutor_result_archive_cmd_001:sha256_271312a59510bdc5c453848296b910c16791663bc96b6243963830676ca083a0",
		Tags:            []string{"student_app_ai_tutor", "result", "safe_guidance", "archive_commit"},
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly, domain.AnalysisIntentTutoring},
		OCRStatus:       domain.OCRStatusNotRequired,
		CreatedAt:       time.Date(2026, 6, 8, 12, 20, 0, 0, time.UTC),
	}
}

func aiTutorResultArchiveHTTPSnapshot(id string, studentID string) domain.StudentAppAITutorResultArchiveSnapshot {
	return domain.StudentAppAITutorResultArchiveSnapshot{
		ArchiveItemID:        id,
		StudentID:            studentID,
		Summary:              "Guided help for comparing fractions.",
		GuidanceSectionsHash: "05a82687de1587bfc882ecf8ec4f54421da7ff0ab4e911cd0af88d4ffbecec4b",
		SafetyLabels:         []string{"NO_DIAGNOSIS", "STUDY_GUIDANCE_ONLY"},
		SafeGuidanceOnly:     true,
		GuidanceSections: []domain.StudentAppAITutorResultArchiveGuidanceSection{
			{
				SectionID:       "ai_tutor_answer_section_001",
				Title:           "Start with a common denominator",
				Text:            "Convert both fractions to the same denominator, then compare the numerators.",
				SourceBlockRefs: []string{"block_section_001"},
			},
			{
				SectionID:       "ai_tutor_answer_section_002",
				Title:           "Check your reasoning",
				Text:            "Explain why the larger numerator is larger only after the denominators match.",
				SourceBlockRefs: []string{"block_section_002"},
			},
		},
	}
}

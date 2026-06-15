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
		[]byte(`"sourceArchiveItemId":"tarch_source_student_homework_001"`),
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
		[]byte(`sourceTutoringRequestId`),
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

func TestReadStudentAppAITutorResultArchiveReturnsResultArchiveSourceSafeCard(t *testing.T) {
	handler := newTestHandlerWithAITutorResultArchive()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_student_ai_tutor_result_archive_001/ai-tutor-result",
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
		[]byte(`"archiveItemId":"tarch_student_ai_tutor_result_archive_001"`),
		[]byte(`"sourceArchiveItemId":"tarch_student_ai_tutor_result_001"`),
		[]byte(`"status":"READY_FOR_STUDENT_APP_READ"`),
		[]byte(`"summary":"Follow-up help based on a reviewed AI Tutor result."`),
		[]byte(`"sectionId":"ai_tutor_answer_section_result_archive_001"`),
		[]byte(`"guidanceSectionsHash":"747203bfbeca35e36a136f3998121af114471e4a5c02f51c843a4dfee159292c"`),
		[]byte(`"safetyLabels":["STUDY_GUIDANCE_ONLY","FOLLOW_UP_REVIEW"]`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`"studentId"`),
		[]byte(`"contentRef"`),
		[]byte(`resultRef`),
		[]byte(`sourceTutoringRequestId`),
		[]byte(`rawModelOutput`),
		[]byte(`answerKey`),
		[]byte(`prompt`),
		[]byte(`workerId`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestReadStudentAppAITutorResultArchiveReturnsQuestionBankFeedbackSourceSafeCard(t *testing.T) {
	handler := newTestHandlerWithAITutorResultArchive()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_student_feedback_001/ai-tutor-result",
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
		[]byte(`"archiveItemId":"tarch_student_feedback_001"`),
		[]byte(`"sourceArchiveItemId":"tarch_question_bank_feedback_source_001"`),
		[]byte(`"status":"READY_FOR_STUDENT_APP_READ"`),
		[]byte(`"summary":"Follow-up help based on reviewed answer feedback."`),
		[]byte(`"sectionId":"ai_tutor_answer_section_feedback_001"`),
		[]byte(`"guidanceSectionsHash":"daa9efe1e3ee402648dca1919e2c43851b7445d0fdf79d26d7073af39060caab"`),
		[]byte(`"safetyLabels":["STUDY_GUIDANCE_ONLY","FOLLOW_UP_REVIEW"]`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`"studentId"`),
		[]byte(`"contentRef"`),
		[]byte(`resultRef`),
		[]byte(`sourceTutoringRequestId`),
		[]byte(`rawModelOutput`),
		[]byte(`answerKey`),
		[]byte(`prompt`),
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

func TestRenderStudentAppAITutorResultArchiveReturnsSafeTextBlocks(t *testing.T) {
	handler := newTestHandlerWithAITutorResultArchive()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_student_ai_tutor_result_001/ai-tutor-result/rendered",
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
		[]byte(`"sourceArchiveItemId":"tarch_source_student_homework_001"`),
		[]byte(`"renderFormat":"SAFE_TEXT_BLOCKS"`),
		[]byte(`"blockType":"SUMMARY"`),
		[]byte(`"blockType":"GUIDANCE_SECTION"`),
		[]byte(`"sectionId":"ai_tutor_answer_section_001"`),
		[]byte(`"text":"Convert both fractions to the same denominator, then compare the numerators."`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`"studentId"`),
		[]byte(`"contentRef"`),
		[]byte(`resultRef`),
		[]byte(`sourceTutoringRequestId`),
		[]byte(`rawModelOutput`),
		[]byte(`answerKey`),
		[]byte(`expectedAnswer`),
		[]byte(`internalError`),
		[]byte(`workerId`),
		[]byte(`innerHTML`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestRenderStudentAppAITutorResultArchiveReturnsResultArchiveSourceSafeTextBlocks(t *testing.T) {
	handler := newTestHandlerWithAITutorResultArchive()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_student_ai_tutor_result_archive_001/ai-tutor-result/rendered",
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
		[]byte(`"archiveItemId":"tarch_student_ai_tutor_result_archive_001"`),
		[]byte(`"sourceArchiveItemId":"tarch_student_ai_tutor_result_001"`),
		[]byte(`"status":"READY_FOR_STUDENT_APP_READ"`),
		[]byte(`"renderFormat":"SAFE_TEXT_BLOCKS"`),
		[]byte(`"blockType":"SUMMARY"`),
		[]byte(`"text":"Follow-up help based on a reviewed AI Tutor result."`),
		[]byte(`"blockType":"GUIDANCE_SECTION"`),
		[]byte(`"sectionId":"ai_tutor_answer_section_result_archive_001"`),
		[]byte(`"text":"Restate the corrected reasoning before attempting a similar practice item."`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`"studentId"`),
		[]byte(`"contentRef"`),
		[]byte(`resultRef`),
		[]byte(`sourceTutoringRequestId`),
		[]byte(`rawModelOutput`),
		[]byte(`answerKey`),
		[]byte(`prompt`),
		[]byte(`workerId`),
		[]byte(`renderedHtml`),
		[]byte(`renderedMarkdown`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestRenderStudentAppAITutorResultArchiveRejectsCrossStudentTeacherAndMethod(t *testing.T) {
	handler := newTestHandlerWithAITutorResultArchive()

	crossStudent := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_student_ai_tutor_result_other/ai-tutor-result/rendered",
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
		"/v1/student-app/archive-items/tarch_student_ai_tutor_result_001/ai-tutor-result/rendered",
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
		"/v1/student-app/archive-items/tarch_student_ai_tutor_result_001/ai-tutor-result/rendered",
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

func TestReadStudentAppAITutorResultArchiveLearningActionsReturnsSafeActionSources(t *testing.T) {
	handler := newTestHandlerWithAITutorResultArchive()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_student_ai_tutor_result_001/ai-tutor-result/learning-actions",
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
		[]byte(`"sourceArchiveItemId":"tarch_source_student_homework_001"`),
		[]byte(`"status":"READY_FOR_STUDENT_APP_READ"`),
		[]byte(`"renderFormat":"SAFE_TEXT_BLOCKS"`),
		[]byte(`"actionType":"AI_TUTOR_REQUEST"`),
		[]byte(`"actionType":"PERSONALIZED_QUESTION_BANK"`),
		[]byte(`"sourceType":"AI_TUTOR_RESULT_ARCHIVE"`),
		[]byte(`"targetEndpoint":"/v1/student-app/ai-tutor-requests"`),
		[]byte(`"method":"POST"`),
		[]byte(`"resultArchiveStatus":"READY_FOR_STUDENT_APP_READ"`),
		[]byte(`"followUpDepth":0`),
		[]byte(`"followUpDepth":1`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`"studentId"`),
		[]byte(`"contentRef"`),
		[]byte(`resultRef`),
		[]byte(`sourceTutoringRequestId`),
		[]byte(`rawModelOutput`),
		[]byte(`answerKey`),
		[]byte(`expectedAnswer`),
		[]byte(`prompt`),
		[]byte(`workerId`),
		[]byte(`"blocks"`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestReadStudentAppAITutorResultArchiveLearningActionsReturnsResultArchiveSourceSafeActionSources(t *testing.T) {
	handler := newTestHandlerWithAITutorResultArchive()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_student_ai_tutor_result_archive_001/ai-tutor-result/learning-actions",
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
		[]byte(`"archiveItemId":"tarch_student_ai_tutor_result_archive_001"`),
		[]byte(`"sourceArchiveItemId":"tarch_student_ai_tutor_result_001"`),
		[]byte(`"status":"READY_FOR_STUDENT_APP_READ"`),
		[]byte(`"renderFormat":"SAFE_TEXT_BLOCKS"`),
		[]byte(`"actionType":"AI_TUTOR_REQUEST"`),
		[]byte(`"actionType":"PERSONALIZED_QUESTION_BANK"`),
		[]byte(`"sourceType":"AI_TUTOR_RESULT_ARCHIVE"`),
		[]byte(`"targetEndpoint":"/v1/student-app/ai-tutor-requests"`),
		[]byte(`"resultArchiveStatus":"READY_FOR_STUDENT_APP_READ"`),
		[]byte(`"followUpDepth":1`),
		[]byte(`"followUpDepth":2`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`"studentId"`),
		[]byte(`"contentRef"`),
		[]byte(`resultRef`),
		[]byte(`sourceTutoringRequestId`),
		[]byte(`rawModelOutput`),
		[]byte(`answerKey`),
		[]byte(`prompt`),
		[]byte(`workerId`),
		[]byte(`"blocks"`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestReadStudentAppAITutorResultArchiveLearningActionsRejectsCrossStudentTeacherAndMethod(t *testing.T) {
	handler := newTestHandlerWithAITutorResultArchive()

	crossStudent := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_student_ai_tutor_result_other/ai-tutor-result/learning-actions",
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
		"/v1/student-app/archive-items/tarch_student_ai_tutor_result_001/ai-tutor-result/learning-actions",
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
		"/v1/student-app/archive-items/tarch_student_ai_tutor_result_001/ai-tutor-result/learning-actions",
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
			aiTutorResultArchiveHTTPFollowUpItem("tarch_student_ai_tutor_result_archive_001", "student_001"),
			aiTutorResultArchiveHTTPQuestionBankFeedbackItem("tarch_student_feedback_001", "student_001"),
			aiTutorResultArchiveHTTPItem("tarch_student_ai_tutor_result_other", "student_002"),
		},
		aiTutorResultArchiveSnapshots: []domain.StudentAppAITutorResultArchiveSnapshot{
			aiTutorResultArchiveHTTPSnapshot("tarch_student_ai_tutor_result_001", "student_001"),
			aiTutorResultArchiveHTTPFollowUpSnapshot("tarch_student_ai_tutor_result_archive_001", "student_001"),
			aiTutorResultArchiveHTTPQuestionBankFeedbackSnapshot("tarch_student_feedback_001", "student_001"),
			aiTutorResultArchiveHTTPSnapshot("tarch_student_ai_tutor_result_other", "student_002"),
		},
	}
	readResult := usecase.NewReadStudentAppAITutorResultArchive(store)
	renderResult := usecase.NewRenderStudentAppAITutorResultArchive(readResult)
	return httpapi.NewServer(httpapi.ServerConfig{
		ReadStudentAppAITutorResultArchive:                readResult,
		RenderStudentAppAITutorResultArchive:              renderResult,
		ReadStudentAppAITutorResultArchiveLearningActions: usecase.NewReadStudentAppAITutorResultArchiveLearningActions(renderResult),
		AgentAPIKey: "ueacd",
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

func aiTutorResultArchiveHTTPFollowUpItem(id string, studentID string) domain.ArchiveItem {
	item := aiTutorResultArchiveHTTPItem(id, studentID)
	item.Title = "Student AI Tutor result archive tutor_req_student_app_result_archive_001"
	item.ContentRef = "student-ai-tutor-result-archive:ai_tutor_result_archive_cmd_result_archive_001:sha256_fca56f06fe276b7f151662647a31ff0dde640358f3fdad476a813738dbd569b5"
	item.CreatedAt = time.Date(2026, 6, 9, 13, 40, 0, 0, time.UTC)
	return item
}

func aiTutorResultArchiveHTTPQuestionBankFeedbackItem(id string, studentID string) domain.ArchiveItem {
	item := aiTutorResultArchiveHTTPItem(id, studentID)
	item.Title = "Student AI Tutor result archive tutor_req_student_app_feedback_001"
	item.ContentRef = "student-ai-tutor-result-archive:ai_tutor_result_archive_cmd_feedback_001:sha256_f97cfa0b6ecd497dcea78e01bb830006e80ce81847ba325378cabbd2ba49fba2"
	item.CreatedAt = time.Date(2026, 6, 11, 16, 45, 0, 0, time.UTC)
	return item
}

func aiTutorResultArchiveHTTPSnapshot(id string, studentID string) domain.StudentAppAITutorResultArchiveSnapshot {
	return domain.StudentAppAITutorResultArchiveSnapshot{
		ArchiveItemID:           id,
		StudentID:               studentID,
		SourceArchiveItemID:     "tarch_source_student_homework_001",
		SourceTutoringRequestID: "tutor_req_student_app_001",
		Summary:                 "Guided help for comparing fractions.",
		GuidanceSectionsHash:    "05a82687de1587bfc882ecf8ec4f54421da7ff0ab4e911cd0af88d4ffbecec4b",
		SafetyLabels:            []string{"NO_DIAGNOSIS", "STUDY_GUIDANCE_ONLY"},
		SafeGuidanceOnly:        true,
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

func aiTutorResultArchiveHTTPFollowUpSnapshot(id string, studentID string) domain.StudentAppAITutorResultArchiveSnapshot {
	return domain.StudentAppAITutorResultArchiveSnapshot{
		ArchiveItemID:           id,
		StudentID:               studentID,
		SourceArchiveItemID:     "tarch_student_ai_tutor_result_001",
		SourceTutoringRequestID: "tutor_req_student_app_result_archive_001",
		Summary:                 "Follow-up help based on a reviewed AI Tutor result.",
		GuidanceSectionsHash:    "747203bfbeca35e36a136f3998121af114471e4a5c02f51c843a4dfee159292c",
		SafetyLabels:            []string{"STUDY_GUIDANCE_ONLY", "FOLLOW_UP_REVIEW"},
		SafeGuidanceOnly:        true,
		FollowUpDepth:           1,
		GuidanceSections: []domain.StudentAppAITutorResultArchiveGuidanceSection{
			{
				SectionID:       "ai_tutor_answer_section_result_archive_001",
				Title:           "Review the previous correction",
				Text:            "Restate the corrected reasoning before attempting a similar practice item.",
				SourceBlockRefs: []string{"source_block_001"},
			},
		},
	}
}

func aiTutorResultArchiveHTTPQuestionBankFeedbackSnapshot(id string, studentID string) domain.StudentAppAITutorResultArchiveSnapshot {
	return domain.StudentAppAITutorResultArchiveSnapshot{
		ArchiveItemID:           id,
		StudentID:               studentID,
		SourceArchiveItemID:     "tarch_question_bank_feedback_source_001",
		SourceTutoringRequestID: "tutor_req_student_app_feedback_001",
		Summary:                 "Follow-up help based on reviewed answer feedback.",
		GuidanceSectionsHash:    "daa9efe1e3ee402648dca1919e2c43851b7445d0fdf79d26d7073af39060caab",
		SafetyLabels:            []string{"STUDY_GUIDANCE_ONLY", "FOLLOW_UP_REVIEW"},
		SafeGuidanceOnly:        true,
		GuidanceSections: []domain.StudentAppAITutorResultArchiveGuidanceSection{
			{
				SectionID:       "ai_tutor_answer_section_feedback_001",
				Title:           "Practice from feedback",
				Text:            "Restate the feedback in your own words, then solve one similar item.",
				SourceBlockRefs: []string{"block_score_summary", "block_next_step"},
			},
		},
	}
}

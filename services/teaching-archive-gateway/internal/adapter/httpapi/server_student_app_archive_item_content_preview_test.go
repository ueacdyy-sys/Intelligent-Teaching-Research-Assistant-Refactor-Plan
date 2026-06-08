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

func TestReadStudentAppArchiveItemContentPreviewReturnsSafeSections(t *testing.T) {
	handler := newTestHandlerWithPublishedArchiveItemContentPreview()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_archive_material_001/content-preview",
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
		[]byte(`"archiveItemId":"tarch_archive_material_001"`),
		[]byte(`"materialType":"HANDOUT"`),
		[]byte(`"title":"Fractions practice packet"`),
		[]byte(`"previewStatus":"READY"`),
		[]byte(`"id":"section_001"`),
		[]byte(`"text":"Practice equivalent fractions and common denominators."`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`"studentId"`),
		[]byte(`"contentRef"`),
		[]byte(`publicationId`),
		[]byte(`approvalId`),
		[]byte(`workerId`),
		[]byte(`rawContent`),
		[]byte(`objectStorageKey`),
		[]byte(`ocrText`),
		[]byte(`ragChunks`),
		[]byte(`expectedAnswer`),
		[]byte(`rawModelOutput`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestReadStudentAppArchiveItemContentPreviewRejectsCrossStudentOrUnpublished(t *testing.T) {
	handler := newTestHandlerWithPublishedArchiveItemContentPreview()
	for name, archiveItemID := range map[string]string{
		"cross student": "tarch_archive_material_other",
		"unpublished":   "tarch_archive_material_unpublished",
	} {
		t.Run(name, func(t *testing.T) {
			request := httptest.NewRequest(
				http.MethodGet,
				"/v1/student-app/archive-items/"+archiveItemID+"/content-preview",
				nil,
			)
			request.Header.Set("X-Agent-Api-Key", "ueacd")
			setPrincipalHeader(t, request, studentPrincipal("student_001"))

			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != http.StatusNotFound {
				t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
			}
		})
	}
}

func TestReadStudentAppArchiveItemContentPreviewRejectsTeacherAndUnsafeID(t *testing.T) {
	handler := newTestHandlerWithPublishedArchiveItemContentPreview()

	teacherRequest := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_archive_material_001/content-preview",
		nil,
	)
	teacherRequest.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, teacherRequest, teacherPrincipal())
	teacherResponse := httptest.NewRecorder()
	handler.ServeHTTP(teacherResponse, teacherRequest)
	if teacherResponse.Code != http.StatusForbidden {
		t.Fatalf("teacher status = %d, body = %s", teacherResponse.Code, teacherResponse.Body.String())
	}

	unsafeRequest := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/archive_material_001/content-preview",
		nil,
	)
	unsafeRequest.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, unsafeRequest, studentPrincipal("student_001"))
	unsafeResponse := httptest.NewRecorder()
	handler.ServeHTTP(unsafeResponse, unsafeRequest)
	if unsafeResponse.Code != http.StatusUnprocessableEntity {
		t.Fatalf("unsafe id status = %d, body = %s", unsafeResponse.Code, unsafeResponse.Body.String())
	}
}

func TestReadStudentAppArchiveItemContentPreviewRejectsUnsupportedMethod(t *testing.T) {
	handler := newTestHandlerWithPublishedArchiveItemContentPreview()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/archive-items/tarch_archive_material_001/content-preview",
		http.NoBody,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestRenderStudentAppArchiveItemContentPreviewReturnsSafeTextBlocks(t *testing.T) {
	handler := newTestHandlerWithPublishedArchiveItemContentPreview()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_archive_material_001/content-preview/rendered",
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
		[]byte(`"archiveItemId":"tarch_archive_material_001"`),
		[]byte(`"renderFormat":"SAFE_TEXT_BLOCKS"`),
		[]byte(`"previewStatus":"READY"`),
		[]byte(`"blockType":"SECTION"`),
		[]byte(`"sectionId":"section_001"`),
		[]byte(`"text":"Practice equivalent fractions and common denominators."`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`"studentId"`),
		[]byte(`"contentRef"`),
		[]byte(`renderedHtml`),
		[]byte(`renderedMarkdown`),
		[]byte(`rawContent`),
		[]byte(`objectStorageKey`),
		[]byte(`ocrText`),
		[]byte(`ragChunks`),
		[]byte(`expectedAnswer`),
		[]byte(`rawModelOutput`),
		[]byte(`workerId`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestRenderStudentAppArchiveItemContentPreviewRejectsCrossStudentTeacherAndMethod(t *testing.T) {
	handler := newTestHandlerWithPublishedArchiveItemContentPreview()

	crossStudent := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_archive_material_other/content-preview/rendered",
		nil,
	)
	crossStudent.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, crossStudent, studentPrincipal("student_001"))
	crossStudentResponse := httptest.NewRecorder()
	handler.ServeHTTP(crossStudentResponse, crossStudent)
	if crossStudentResponse.Code != http.StatusNotFound {
		t.Fatalf("cross student status = %d, body = %s", crossStudentResponse.Code, crossStudentResponse.Body.String())
	}

	teacher := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_archive_material_001/content-preview/rendered",
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
		"/v1/student-app/archive-items/tarch_archive_material_001/content-preview/rendered",
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

func TestReadStudentAppArchiveItemStudyPacketReturnsSafeMetadataAndTextBlocks(t *testing.T) {
	handler := newTestHandlerWithPublishedArchiveItemContentPreview()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_archive_material_001/study-packet",
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
		[]byte(`"packetStatus":"READY"`),
		[]byte(`"archiveItem":{"id":"tarch_archive_material_001"`),
		[]byte(`"materialType":"HANDOUT"`),
		[]byte(`"title":"Fractions practice packet"`),
		[]byte(`"contentPreview":{"archiveItemId":"tarch_archive_material_001"`),
		[]byte(`"renderFormat":"SAFE_TEXT_BLOCKS"`),
		[]byte(`"blockType":"SECTION"`),
		[]byte(`"text":"Practice equivalent fractions and common denominators."`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`"studentId"`),
		[]byte(`"contentRef"`),
		[]byte(`renderedHtml`),
		[]byte(`renderedMarkdown`),
		[]byte(`rawContent`),
		[]byte(`objectStorageKey`),
		[]byte(`ocrText`),
		[]byte(`ragChunks`),
		[]byte(`expectedAnswer`),
		[]byte(`rawModelOutput`),
		[]byte(`workerId`),
		[]byte(`publicationId`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestReadStudentAppArchiveItemStudyPacketRejectsCrossStudentTeacherAndMethod(t *testing.T) {
	handler := newTestHandlerWithPublishedArchiveItemContentPreview()

	crossStudent := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_archive_material_other/study-packet",
		nil,
	)
	crossStudent.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, crossStudent, studentPrincipal("student_001"))
	crossStudentResponse := httptest.NewRecorder()
	handler.ServeHTTP(crossStudentResponse, crossStudent)
	if crossStudentResponse.Code != http.StatusNotFound {
		t.Fatalf("cross student status = %d, body = %s", crossStudentResponse.Code, crossStudentResponse.Body.String())
	}

	teacher := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_archive_material_001/study-packet",
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
		"/v1/student-app/archive-items/tarch_archive_material_001/study-packet",
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

func TestReadStudentAppArchiveItemLearningActionsReturnsSafeActionAffordances(t *testing.T) {
	handler := newTestHandlerWithPublishedArchiveItemContentPreview()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_archive_material_001/learning-actions",
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
		[]byte(`"archiveItemId":"tarch_archive_material_001"`),
		[]byte(`"packetStatus":"READY"`),
		[]byte(`"actionType":"AI_TUTOR_REQUEST"`),
		[]byte(`"state":"AVAILABLE"`),
		[]byte(`"targetEndpoint":"/v1/student-app/ai-tutor-requests"`),
		[]byte(`"method":"POST"`),
		[]byte(`"questionBankIntent":"GENERATE_PERSONALIZED_CHECK"`),
		[]byte(`"actionType":"PERSONALIZED_QUESTION_BANK"`),
		[]byte(`"state":"DEFERRED_THROUGH_AI_TUTOR"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`"studentId"`),
		[]byte(`"contentRef"`),
		[]byte(`"contentPreview"`),
		[]byte(`rawContent`),
		[]byte(`ragChunks`),
		[]byte(`expectedAnswer`),
		[]byte(`rawModelOutput`),
		[]byte(`workerId`),
		[]byte(`publicationId`),
		[]byte(`prompt`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestReadStudentAppArchiveItemLearningActionsRejectsCrossStudentTeacherAndMethod(t *testing.T) {
	handler := newTestHandlerWithPublishedArchiveItemContentPreview()

	crossStudent := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_archive_material_other/learning-actions",
		nil,
	)
	crossStudent.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, crossStudent, studentPrincipal("student_001"))
	crossStudentResponse := httptest.NewRecorder()
	handler.ServeHTTP(crossStudentResponse, crossStudent)
	if crossStudentResponse.Code != http.StatusNotFound {
		t.Fatalf("cross student status = %d, body = %s", crossStudentResponse.Code, crossStudentResponse.Body.String())
	}

	teacher := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_archive_material_001/learning-actions",
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
		"/v1/student-app/archive-items/tarch_archive_material_001/learning-actions",
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

func newTestHandlerWithPublishedArchiveItemContentPreview() http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			committedMaterialDraftHTTPItem(),
			studentHandoutHTTPItem("tarch_archive_material_unpublished", "student_001", time.Date(2026, 6, 7, 6, 0, 0, 0, time.UTC)),
		},
		publishedArchiveItemIDs: map[string]bool{
			"tarch_archive_material_001": true,
		},
		contentPreviews: []domain.PublishedArchiveMaterialContentPreview{
			publishedArchiveItemContentPreviewHTTPFixture("tarch_archive_material_001", "student_001"),
			publishedArchiveItemContentPreviewHTTPFixture("tarch_archive_material_other", "student_002"),
			publishedArchiveItemContentPreviewHTTPFixture("tarch_archive_material_unpublished", "student_001"),
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		ReadStudentAppArchiveItemContentPreview:   usecase.NewReadStudentAppArchiveItemContentPreview(store),
		RenderStudentAppArchiveItemContentPreview: usecase.NewRenderStudentAppArchiveItemContentPreview(store),
		ReadStudentAppArchiveItemStudyPacket:      usecase.NewReadStudentAppArchiveItemStudyPacket(store),
		ReadStudentAppArchiveItemLearningActions:  usecase.NewReadStudentAppArchiveItemLearningActions(store),
		AgentAPIKey:                               "ueacd",
	}).Handler()
}

func publishedArchiveItemContentPreviewHTTPFixture(
	archiveItemID string,
	studentID string,
) domain.PublishedArchiveMaterialContentPreview {
	createdAt := time.Date(2026, 6, 7, 9, 0, 0, 0, time.UTC)
	return domain.PublishedArchiveMaterialContentPreview{
		ArchiveItemID: archiveItemID,
		StudentID:     studentID,
		MaterialType:  domain.MaterialTypeHandout,
		Title:         "Fractions practice packet",
		Status:        domain.PublishedArchiveMaterialContentPreviewStatusReady,
		PreviewSource: domain.PublishedArchiveMaterialContentPreviewSourceSafeReviewed,
		Sections: []domain.PublishedArchiveMaterialContentPreviewSection{
			{
				ID:       "section_001",
				Title:    "Learning goals",
				Text:     "Practice equivalent fractions and common denominators.",
				PageHint: "p.1",
			},
		},
		CreatedAt: createdAt,
		UpdatedAt: createdAt.Add(5 * time.Minute),
	}
}

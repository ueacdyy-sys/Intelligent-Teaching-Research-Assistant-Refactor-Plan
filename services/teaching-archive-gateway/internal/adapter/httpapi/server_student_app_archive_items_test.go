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
		[]byte(`tarch_unpublished_handout_http`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestListStudentAppArchiveItemsReturns0305CommittedMaterialDraftRow(t *testing.T) {
	handler := newTestHandlerWithCommittedMaterialDraftRow()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items?materialType=HANDOUT&query=fractions&pageSize=10",
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
		[]byte(`"id":"tarch_archive_material_001"`),
		[]byte(`"ownerType":"STUDENT"`),
		[]byte(`"studentId":"student_001"`),
		[]byte(`"materialType":"HANDOUT"`),
		[]byte(`"title":"Fractions practice packet"`),
		[]byte(`"source":"SYSTEM_IMPORT"`),
		[]byte(`"contentRef":"precommit://archive-material/student_001/fractions-packet"`),
		[]byte(`"analysisIntents":["ARCHIVE_ONLY"]`),
		[]byte(`"ocrStatus":"NOT_REQUIRED"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`tarch_archive_material_other`),
		[]byte(`tarch_archive_material_teaching`),
		[]byte(`tarch_archive_material_unpublished`),
		[]byte(`tarch_archive_material_geometry`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestReadStudentAppArchiveItemsSearchSummaryReturnsCountOnlySafeResponse(t *testing.T) {
	handler := newTestHandlerWithCommittedMaterialDraftSummary()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/summary?query=fractions",
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
		[]byte(`"summary":{"totalCount":2,"quizCount":0,"paperCount":0,"handoutCount":1,"homeworkCount":1}`),
		[]byte(`"ETag"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) && string(fragment) != `"ETag"` {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	if response.Header().Get("ETag") == "" ||
		response.Header().Get("Cache-Control") != "private, no-cache" {
		t.Fatalf("headers = %#v", response.Header())
	}
	for _, leaked := range [][]byte{
		[]byte(`"data"`),
		[]byte(`"pageInfo"`),
		[]byte(`"contentRef"`),
		[]byte(`tarch_archive_material_other`),
		[]byte(`tarch_archive_material_teaching`),
		[]byte(`tarch_archive_material_unpublished`),
		[]byte(`worker_internal_summary`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestReadStudentAppArchiveItemsSearchSummarySupportsPrivate304(t *testing.T) {
	handler := newTestHandlerWithCommittedMaterialDraftSummary()
	first := httptest.NewRequest(http.MethodGet, "/v1/student-app/archive-items/summary?materialType=HANDOUT&query=fractions", nil)
	first.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, first, studentPrincipal("student_001"))
	firstResponse := httptest.NewRecorder()
	handler.ServeHTTP(firstResponse, first)
	if firstResponse.Code != http.StatusOK {
		t.Fatalf("first status = %d, body = %s", firstResponse.Code, firstResponse.Body.String())
	}

	second := httptest.NewRequest(http.MethodGet, "/v1/student-app/archive-items/summary?materialType=HANDOUT&query=fractions", nil)
	second.Header.Set("X-Agent-Api-Key", "ueacd")
	second.Header.Set("If-None-Match", firstResponse.Header().Get("ETag"))
	setPrincipalHeader(t, second, studentPrincipal("student_001"))
	secondResponse := httptest.NewRecorder()
	handler.ServeHTTP(secondResponse, second)
	if secondResponse.Code != http.StatusNotModified {
		t.Fatalf("second status = %d, body = %s", secondResponse.Code, secondResponse.Body.String())
	}
	if secondResponse.Body.Len() != 0 {
		t.Fatalf("304 body = %s", secondResponse.Body.String())
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

func TestReadStudentAppArchiveItemReturnsSafePublishedMetadata(t *testing.T) {
	handler := newTestHandlerWithPublishedArchiveItemDetail()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_archive_material_001",
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
		[]byte(`"id":"tarch_archive_material_001"`),
		[]byte(`"ownerType":"STUDENT"`),
		[]byte(`"studentId":"student_001"`),
		[]byte(`"materialType":"HANDOUT"`),
		[]byte(`"title":"Fractions practice packet"`),
		[]byte(`"source":"SYSTEM_IMPORT"`),
		[]byte(`"analysisIntents":["ARCHIVE_ONLY"]`),
		[]byte(`"ocrStatus":"NOT_REQUIRED"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`"contentRef"`),
		[]byte(`publicationId`),
		[]byte(`publicationState`),
		[]byte(`visibilityState`),
		[]byte(`approvalId`),
		[]byte(`workerId`),
		[]byte(`rawModelOutput`),
		[]byte(`expectedAnswer`),
		[]byte(`resultRef`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestReadStudentAppArchiveItemRejectsCrossStudentOrUnpublishedDetail(t *testing.T) {
	handler := newTestHandlerWithPublishedArchiveItemDetail()
	for name, archiveItemID := range map[string]string{
		"cross student": "tarch_archive_material_other",
		"unpublished":   "tarch_archive_material_unpublished",
	} {
		t.Run(name, func(t *testing.T) {
			request := httptest.NewRequest(
				http.MethodGet,
				"/v1/student-app/archive-items/"+archiveItemID,
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

func TestReadStudentAppArchiveItemRejectsTeacherAndUnsafeID(t *testing.T) {
	handler := newTestHandlerWithPublishedArchiveItemDetail()

	teacherRequest := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/archive-items/tarch_archive_material_001",
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
		"/v1/student-app/archive-items/archive_material_001",
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

func TestReadStudentAppArchiveItemRejectsUnsupportedMethod(t *testing.T) {
	handler := newTestHandlerWithPublishedArchiveItemDetail()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/archive-items/tarch_archive_material_001",
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

func newTestHandlerWithStudentAppArchiveItems() http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			studentHandoutHTTPItem("tarch_handout_http", "student_001", time.Date(2026, 5, 30, 10, 0, 0, 0, time.UTC)),
			archiveItem("tarch_quiz_http", "student_001", time.Date(2026, 5, 30, 9, 0, 0, 0, time.UTC)),
			archiveItem("tarch_other_http", "student_002", time.Date(2026, 5, 30, 8, 0, 0, 0, time.UTC)),
			teachingMaterialHTTPItem("tarch_material_http", time.Date(2026, 5, 30, 7, 0, 0, 0, time.UTC)),
			studentHandoutHTTPItem("tarch_unpublished_handout_http", "student_001", time.Date(2026, 5, 30, 6, 0, 0, 0, time.UTC)),
		},
		publishedArchiveItemIDs: map[string]bool{
			"tarch_handout_http": true,
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		ListStudentAppArchiveItems: usecase.NewListStudentAppArchiveItems(store),
		AgentAPIKey:                "ueacd",
	}).Handler()
}

func newTestHandlerWithPublishedArchiveItemDetail() http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			committedMaterialDraftHTTPItem(),
			{
				ID:              "tarch_archive_material_other",
				OwnerType:       domain.OwnerTypeStudent,
				StudentID:       "student_002",
				MaterialType:    domain.MaterialTypeHandout,
				Title:           "Other student packet",
				Source:          domain.SourceSystemImport,
				ContentRef:      "precommit://archive-material/student_002/fractions-packet",
				Tags:            []string{"fractions"},
				AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly},
				OCRStatus:       domain.OCRStatusNotRequired,
				CreatedAt:       time.Date(2026, 6, 7, 8, 0, 0, 0, time.UTC),
			},
			studentHandoutHTTPItem("tarch_archive_material_unpublished", "student_001", time.Date(2026, 6, 7, 6, 0, 0, 0, time.UTC)),
		},
		publishedArchiveItemIDs: map[string]bool{
			"tarch_archive_material_001":   true,
			"tarch_archive_material_other": true,
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		ReadStudentAppArchiveItem: usecase.NewReadStudentAppArchiveItem(store),
		AgentAPIKey:               "ueacd",
	}).Handler()
}

func newTestHandlerWithCommittedMaterialDraftRow() http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			committedMaterialDraftHTTPItem(),
			{
				ID:              "tarch_archive_material_other",
				OwnerType:       domain.OwnerTypeStudent,
				StudentID:       "student_002",
				MaterialType:    domain.MaterialTypeHandout,
				Title:           "Other student packet",
				Source:          domain.SourceSystemImport,
				ContentRef:      "precommit://archive-material/student_002/fractions-packet",
				Tags:            []string{"fractions"},
				AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly},
				OCRStatus:       domain.OCRStatusNotRequired,
				CreatedAt:       time.Date(2026, 6, 7, 8, 0, 0, 0, time.UTC),
			},
			teachingMaterialHTTPItem("tarch_archive_material_teaching", time.Date(2026, 6, 7, 7, 0, 0, 0, time.UTC)),
			studentHandoutHTTPItem("tarch_archive_material_unpublished", "student_001", time.Date(2026, 6, 7, 6, 0, 0, 0, time.UTC)),
			{
				ID:              "tarch_archive_material_geometry",
				OwnerType:       domain.OwnerTypeStudent,
				StudentID:       "student_001",
				MaterialType:    domain.MaterialTypeHandout,
				Title:           "Geometry practice packet",
				Source:          domain.SourceSystemImport,
				ContentRef:      "precommit://archive-material/student_001/geometry-packet",
				Tags:            []string{"geometry", "published"},
				AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly},
				OCRStatus:       domain.OCRStatusNotRequired,
				CreatedAt:       time.Date(2026, 6, 7, 9, 0, 0, 0, time.UTC),
			},
		},
		publishedArchiveItemIDs: map[string]bool{
			"tarch_archive_material_001":      true,
			"tarch_archive_material_geometry": true,
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		ListStudentAppArchiveItems: usecase.NewListStudentAppArchiveItems(store),
		AgentAPIKey:                "ueacd",
	}).Handler()
}

func newTestHandlerWithCommittedMaterialDraftSummary() http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			committedMaterialDraftHTTPItem(),
			{
				ID:              "tarch_archive_material_homework",
				OwnerType:       domain.OwnerTypeStudent,
				StudentID:       "student_001",
				MaterialType:    domain.MaterialTypeHomework,
				Title:           "Fractions reflection homework",
				Source:          domain.SourceSystemImport,
				ContentRef:      "precommit://archive-material/student_001/fractions-homework",
				Tags:            []string{"fractions"},
				AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly},
				OCRStatus:       domain.OCRStatusNotRequired,
				CreatedAt:       time.Date(2026, 6, 7, 10, 0, 0, 0, time.UTC),
			},
			{
				ID:              "tarch_archive_material_other",
				OwnerType:       domain.OwnerTypeStudent,
				StudentID:       "student_002",
				MaterialType:    domain.MaterialTypeHandout,
				Title:           "Other fractions packet",
				Source:          domain.SourceSystemImport,
				ContentRef:      "precommit://archive-material/student_002/fractions-packet",
				Tags:            []string{"fractions"},
				AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly},
				OCRStatus:       domain.OCRStatusNotRequired,
				CreatedAt:       time.Date(2026, 6, 7, 8, 0, 0, 0, time.UTC),
			},
			teachingMaterialHTTPItem("tarch_archive_material_teaching", time.Date(2026, 6, 7, 7, 0, 0, 0, time.UTC)),
			studentHandoutHTTPItem("tarch_archive_material_unpublished", "student_001", time.Date(2026, 6, 7, 6, 0, 0, 0, time.UTC)),
		},
		publishedArchiveItemIDs: map[string]bool{
			"tarch_archive_material_001":      true,
			"tarch_archive_material_homework": true,
			"tarch_archive_material_other":    true,
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		ReadStudentAppArchiveItemSearchSummary: usecase.NewReadStudentAppArchiveItemSearchSummary(store),
		AgentAPIKey:                            "ueacd",
	}).Handler()
}

func committedMaterialDraftHTTPItem() domain.ArchiveItem {
	return domain.ArchiveItem{
		ID:              "tarch_archive_material_001",
		OwnerType:       domain.OwnerTypeStudent,
		StudentID:       "student_001",
		MaterialType:    domain.MaterialTypeHandout,
		Title:           "Fractions practice packet",
		Source:          domain.SourceSystemImport,
		ContentRef:      "precommit://archive-material/student_001/fractions-packet",
		Tags:            []string{"fractions", "draft-approved"},
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly},
		OCRStatus:       domain.OCRStatusNotRequired,
		CreatedAt:       time.Date(2026, 6, 7, 8, 0, 0, 0, time.UTC),
	}
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

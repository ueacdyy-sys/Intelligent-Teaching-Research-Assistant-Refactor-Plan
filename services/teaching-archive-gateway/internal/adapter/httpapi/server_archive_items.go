package httpapi

import (
	"net/http"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/platform"
)

func (s *Server) create(w http.ResponseWriter, r *http.Request) {
	handlerStart := time.Now()
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}

	var request createArchiveItemRequest
	if !decodeJSON(w, r, &request) {
		return
	}

	timing := &platform.TeachingArchiveTiming{}
	ctx := platform.WithTeachingArchiveTiming(r.Context(), timing)
	preUsecaseDuration := time.Since(handlerStart)
	appStart := time.Now()
	item, err := s.createArchiveItem.Execute(ctx, domain.CreateArchiveItemInput{
		Principal:       principal,
		OwnerType:       request.OwnerType,
		StudentID:       request.StudentID,
		MaterialType:    request.MaterialType,
		Title:           request.Title,
		Source:          request.Source,
		ContentRef:      request.ContentRef,
		Tags:            request.Tags,
		AnalysisIntents: request.AnalysisIntents,
		OCRReserved:     request.OCRReserved,
	})
	if handleArchiveError(w, err, "failed to create archive item") {
		return
	}
	writeTeachingServerTiming(w, time.Since(handlerStart), preUsecaseDuration, time.Since(appStart), timing)

	writeJSON(w, http.StatusCreated, toResponse(item))
}

func (s *Server) list(w http.ResponseWriter, r *http.Request) {
	handlerStart := time.Now()
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}

	pageSize, ok := parseOptionalInt(w, r.URL.Query().Get("pageSize"), "pageSize")
	if !ok {
		return
	}
	timing := &platform.TeachingArchiveTiming{}
	ctx := platform.WithTeachingArchiveTiming(r.Context(), timing)
	preUsecaseDuration := time.Since(handlerStart)
	appStart := time.Now()
	page, err := s.listArchiveItems.Execute(ctx, domain.ListArchiveItemsInput{
		Principal:    principal,
		OwnerType:    domain.OwnerType(r.URL.Query().Get("ownerType")),
		StudentID:    r.URL.Query().Get("studentId"),
		MaterialType: domain.MaterialType(r.URL.Query().Get("materialType")),
		PageSize:     pageSize,
		Cursor:       r.URL.Query().Get("cursor"),
	})
	if handleArchiveError(w, err, "failed to list archive items") {
		return
	}
	writeTeachingServerTiming(w, time.Since(handlerStart), preUsecaseDuration, time.Since(appStart), timing)

	writeJSON(w, http.StatusOK, toListResponse(page))
}

func (s *Server) createAIGrading(w http.ResponseWriter, r *http.Request, archiveItemID string) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}

	var request createAIGradingRequestRequest
	if !decodeJSON(w, r, &request) {
		return
	}

	created, err := s.createAIGradingRequest.Execute(
		r.Context(),
		domain.CreateAIGradingRequestInput{
			Principal:           principal,
			ArchiveItemID:       archiveItemID,
			GradingInstructions: request.GradingInstructions,
			RubricRef:           request.RubricRef,
		},
	)
	if handleArchiveError(w, err, "failed to create ai grading request") {
		return
	}

	writeJSON(w, http.StatusCreated, toAIGradingRequestResponse(created))
}

func (s *Server) createQuizSubmissionAIGradingMetadata(
	w http.ResponseWriter,
	r *http.Request,
	archiveItemID string,
	submissionID string,
) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.createQuizSubmissionAIGrading == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "quiz submission ai grading use case is not configured")
		return
	}

	var request createAIGradingRequestRequest
	if !decodeJSON(w, r, &request) {
		return
	}

	created, err := s.createQuizSubmissionAIGrading.Execute(
		r.Context(),
		domain.CreateQuizSubmissionAIGradingRequestInput{
			Principal:           principal,
			QuizArchiveItemID:   archiveItemID,
			SubmissionID:        submissionID,
			GradingInstructions: request.GradingInstructions,
			RubricRef:           request.RubricRef,
		},
	)
	if handleArchiveError(w, err, "failed to create quiz submission ai grading request") {
		return
	}

	writeJSON(w, http.StatusCreated, toAIGradingRequestResponse(created))
}

func (s *Server) createQuizSubmissionMetadata(w http.ResponseWriter, r *http.Request, archiveItemID string) {
	handlerStart := time.Now()
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}

	var request createQuizSubmissionRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	if s.createQuizSubmission == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "quiz submission use case is not configured")
		return
	}

	timing := &platform.TeachingArchiveTiming{}
	ctx := platform.WithTeachingArchiveTiming(r.Context(), timing)
	preUsecaseDuration := time.Since(handlerStart)
	appStart := time.Now()
	created, err := s.createQuizSubmission.Execute(ctx, domain.CreateQuizSubmissionInput{
		Principal:         principal,
		QuizArchiveItemID: archiveItemID,
		StudentID:         request.StudentID,
		AnswerRef:         request.AnswerRef,
	})
	if handleArchiveError(w, err, "failed to create quiz submission") {
		return
	}
	writeTeachingServerTiming(w, time.Since(handlerStart), preUsecaseDuration, time.Since(appStart), timing)

	writeJSON(w, http.StatusCreated, toQuizSubmissionResponse(created))
}

func (s *Server) listQuizSubmissionMetadata(w http.ResponseWriter, r *http.Request, archiveItemID string) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.listQuizSubmissions == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "quiz submission list use case is not configured")
		return
	}

	pageSize, ok := parseOptionalInt(w, r.URL.Query().Get("pageSize"), "pageSize")
	if !ok {
		return
	}
	page, err := s.listQuizSubmissions.Execute(r.Context(), domain.ListQuizSubmissionsInput{
		Principal:         principal,
		QuizArchiveItemID: archiveItemID,
		StudentID:         r.URL.Query().Get("studentId"),
		PageSize:          pageSize,
		Cursor:            r.URL.Query().Get("cursor"),
	})
	if handleArchiveError(w, err, "failed to list quiz submissions") {
		return
	}

	writeJSON(w, http.StatusOK, toQuizSubmissionListResponse(page))
}

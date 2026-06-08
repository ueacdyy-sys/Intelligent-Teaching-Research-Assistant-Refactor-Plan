package httpapi

import (
	"net/http"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (s *Server) listTutoringRequests(w http.ResponseWriter, r *http.Request) {
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
	page, err := s.listTutoringAnalysisRequests.Execute(r.Context(), domain.ListTutoringAnalysisRequestsInput{
		Principal:              principal,
		Status:                 domain.TutoringAnalysisStatus(r.URL.Query().Get("status")),
		ArchiveItemID:          r.URL.Query().Get("archiveItemId"),
		SourceArchiveOwnerType: domain.OwnerType(r.URL.Query().Get("sourceArchiveOwnerType")),
		StudentID:              r.URL.Query().Get("studentId"),
		PageSize:               pageSize,
		Cursor:                 r.URL.Query().Get("cursor"),
	})
	if handleArchiveError(w, err, "failed to list tutoring analysis requests") {
		return
	}

	writeJSON(w, http.StatusOK, toTutoringAnalysisRequestListResponse(page))
}

func (s *Server) createTutoringRequest(w http.ResponseWriter, r *http.Request, archiveItemID string) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}

	var request createTutoringAnalysisRequestRequest
	if !decodeJSON(w, r, &request) {
		return
	}

	created, err := s.createTutoringAnalysisRequest.Execute(
		r.Context(),
		domain.CreateTutoringAnalysisRequestInput{
			Principal:          principal,
			ArchiveItemID:      archiveItemID,
			AnalysisGoal:       request.AnalysisGoal,
			QuestionBankIntent: request.QuestionBankIntent,
		},
	)
	if handleArchiveError(w, err, "failed to create tutoring analysis request") {
		return
	}

	writeJSON(w, http.StatusCreated, toTutoringAnalysisRequestResponse(created))
}

func (s *Server) claimTutoringRequest(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}

	var request claimTutoringAnalysisRequestRequest
	if !decodeJSON(w, r, &request) {
		return
	}

	claimed, found, err := s.claimTutoringAnalysisRequest.Execute(
		r.Context(),
		domain.ClaimTutoringAnalysisRequestInput{
			Principal:    principal,
			WorkerID:     request.WorkerID,
			LeaseSeconds: request.LeaseSeconds,
		},
	)
	if handleArchiveError(w, err, "failed to claim tutoring analysis request") {
		return
	}
	if !found {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	writeJSON(w, http.StatusOK, toTutoringAnalysisWorkerClaimResponse(claimed))
}

func (s *Server) recordTutoringResult(w http.ResponseWriter, r *http.Request, requestID string) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}

	var request recordTutoringAnalysisResultRequest
	if !decodeJSON(w, r, &request) {
		return
	}

	updated, err := s.recordTutoringAnalysisResult.Execute(r.Context(), domain.RecordTutoringAnalysisResultInput{
		Principal:            principal,
		RequestID:            requestID,
		WorkerID:             request.WorkerID,
		Status:               request.Status,
		ResultSummary:        request.ResultSummary,
		ResultRef:            request.ResultRef,
		QuestionBankDraftRef: request.QuestionBankDraftRef,
		ErrorCode:            request.ErrorCode,
		ErrorMessage:         request.ErrorMessage,
	})
	if handleArchiveError(w, err, "failed to record tutoring analysis result") {
		return
	}

	writeJSON(w, http.StatusOK, toTutoringAnalysisRequestResponse(updated))
}

func (s *Server) readAITutorStudyPacketInput(w http.ResponseWriter, r *http.Request, requestID string) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}

	var request readAITutorWorkerStudyPacketInputRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	if s.readAITutorWorkerStudyPacketInput == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "ai tutor worker study packet input use case is not configured")
		return
	}

	input, err := s.readAITutorWorkerStudyPacketInput.Execute(
		r.Context(),
		domain.ReadAITutorWorkerStudyPacketInputInput{
			Principal: principal,
			RequestID: requestID,
			WorkerID:  request.WorkerID,
		},
	)
	if handleArchiveError(w, err, "failed to read ai tutor worker study packet input") {
		return
	}

	writeJSON(w, http.StatusOK, toAITutorWorkerStudyPacketInputResponse(input))
}

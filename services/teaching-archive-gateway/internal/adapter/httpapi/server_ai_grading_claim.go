package httpapi

import (
	"net/http"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (s *Server) aiGradingRequestSubresources(w http.ResponseWriter, r *http.Request) {
	if parseAIGradingWorkerClaimPath(r.URL.Path) {
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		s.claimAIGradingRequestMetadata(w, r)
		return
	}

	if requestID, ok := parseAIGradingQuestionBankAnswerScoringInputPath(r.URL.Path); ok {
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		s.readQuestionBankDraftAnswerScoringInputMetadata(w, r, requestID)
		return
	}

	requestID, ok := parseAIGradingWorkerResultPath(r.URL.Path)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "ai grading request subresource not found")
		return
	}
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.recordAIGradingResultMetadata(w, r, requestID)
}

func (s *Server) claimAIGradingRequestMetadata(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}

	var request claimAIGradingRequestRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	if s.claimAIGradingRequest == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "ai grading claim use case is not configured")
		return
	}

	claimed, found, err := s.claimAIGradingRequest.Execute(
		r.Context(),
		domain.ClaimAIGradingRequestInput{
			Principal:    principal,
			WorkerID:     request.WorkerID,
			LeaseSeconds: request.LeaseSeconds,
		},
	)
	if handleArchiveError(w, err, "failed to claim ai grading request") {
		return
	}
	if !found {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	writeJSON(w, http.StatusOK, toAIGradingWorkerClaimResponse(claimed))
}

func (s *Server) recordAIGradingResultMetadata(w http.ResponseWriter, r *http.Request, requestID string) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}

	var request recordAIGradingResultRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	if s.recordAIGradingResult == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "ai grading result use case is not configured")
		return
	}

	updated, err := s.recordAIGradingResult.Execute(r.Context(), domain.RecordAIGradingResultInput{
		Principal:    principal,
		RequestID:    requestID,
		WorkerID:     request.WorkerID,
		Status:       request.Status,
		ScoreSummary: request.ScoreSummary,
		ResultRef:    request.ResultRef,
		ErrorCode:    request.ErrorCode,
		ErrorMessage: request.ErrorMessage,
	})
	if handleArchiveError(w, err, "failed to record ai grading result") {
		return
	}

	writeJSON(w, http.StatusOK, toAIGradingRequestResponse(updated))
}

func (s *Server) readQuestionBankDraftAnswerScoringInputMetadata(
	w http.ResponseWriter,
	r *http.Request,
	requestID string,
) {
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}

	var request readQuestionBankDraftAnswerScoringInputRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	if s.readQuestionBankDraftAnswerScoringInput == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "question bank answer scoring input use case is not configured")
		return
	}

	input, err := s.readQuestionBankDraftAnswerScoringInput.Execute(
		r.Context(),
		domain.ReadQuestionBankDraftAnswerScoringInputInput{
			Principal: principal,
			RequestID: requestID,
			WorkerID:  request.WorkerID,
		},
	)
	if handleArchiveError(w, err, "failed to read question bank answer scoring input") {
		return
	}

	writeJSON(w, http.StatusOK, toQuestionBankDraftAnswerScoringInputResponse(input))
}

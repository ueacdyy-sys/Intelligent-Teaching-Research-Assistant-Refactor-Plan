package httpapi

import (
	"net/http"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/platform"
)

func (s *Server) studentAppQuestionBankDraftAnswerSubmissions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.submitStudentAppQuestionBankDraftAnswerSubmission(w, r)
}

func (s *Server) studentAppQuestionBankDraftAnswerSubmissionSubresources(w http.ResponseWriter, r *http.Request) {
	if submissionID, ok := parseStudentAppQuestionBankDraftAnswerSubmissionAIGradingResultPath(r.URL.Path); ok {
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		s.readStudentAppQuestionBankDraftAnswerScoringResultMetadata(w, r, submissionID)
		return
	}

	submissionID, ok := parseStudentAppQuestionBankDraftAnswerSubmissionAIGradingRequestPath(r.URL.Path)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "question bank draft answer submission subresource not found")
		return
	}
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.createStudentAppQuestionBankDraftAnswerScoringRequestMetadata(w, r, submissionID)
}

func (s *Server) submitStudentAppQuestionBankDraftAnswerSubmission(w http.ResponseWriter, r *http.Request) {
	handlerStart := time.Now()
	if !s.authorized(r) {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid agent api key")
		return
	}
	principal, ok := parsePrincipalContext(w, r)
	if !ok {
		return
	}
	if s.submitStudentAppQuestionBankDraftAnswer == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "student app question bank draft answer use case is not configured")
		return
	}

	var request submitQuestionBankDraftAnswerSubmissionRequest
	if !decodeJSON(w, r, &request) {
		return
	}

	timing := &platform.TeachingArchiveTiming{}
	ctx := platform.WithTeachingArchiveTiming(r.Context(), timing)
	preUsecaseDuration := time.Since(handlerStart)
	appStart := time.Now()
	result, err := s.submitStudentAppQuestionBankDraftAnswer.ExecuteWithPersistence(
		ctx,
		domain.SubmitStudentAppQuestionBankDraftAnswerInput{
			Principal:            principal,
			QuestionBankDraftRef: request.QuestionBankDraftRef,
			Answers:              request.Answers,
		},
	)
	if handleArchiveError(w, err, "failed to submit student app question bank draft answer") {
		return
	}
	writeTeachingJSON(
		w,
		http.StatusCreated,
		toQuestionBankDraftAnswerSubmissionResponse(result.Submission),
		handlerStart,
		preUsecaseDuration,
		time.Since(appStart),
		timing,
	)
}

func (s *Server) createStudentAppQuestionBankDraftAnswerScoringRequestMetadata(
	w http.ResponseWriter,
	r *http.Request,
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
	if s.createStudentAppQuestionBankDraftAnswerScoringRequest == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "student app question bank draft answer scoring use case is not configured")
		return
	}

	var request createAIGradingRequestRequest
	if !decodeJSON(w, r, &request) {
		return
	}

	created, err := s.createStudentAppQuestionBankDraftAnswerScoringRequest.Execute(
		r.Context(),
		domain.CreateStudentAppQuestionBankDraftAnswerScoringRequestInput{
			Principal:           principal,
			SubmissionID:        submissionID,
			GradingInstructions: request.GradingInstructions,
			RubricRef:           request.RubricRef,
		},
	)
	if handleArchiveError(w, err, "failed to create question bank draft answer scoring request") {
		return
	}

	writeJSON(w, http.StatusCreated, toAIGradingRequestResponse(created))
}

func (s *Server) readStudentAppQuestionBankDraftAnswerScoringResultMetadata(
	w http.ResponseWriter,
	r *http.Request,
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
	if s.readStudentAppQuestionBankDraftAnswerScoringResult == nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "student app question bank draft answer scoring result use case is not configured")
		return
	}

	result, err := s.readStudentAppQuestionBankDraftAnswerScoringResult.Execute(
		r.Context(),
		domain.ReadStudentAppQuestionBankDraftAnswerScoringResultInput{
			Principal:    principal,
			SubmissionID: submissionID,
		},
	)
	if handleArchiveError(w, err, "failed to read question bank draft answer scoring result") {
		return
	}

	writeJSON(w, http.StatusOK, toStudentAppQuestionBankDraftAnswerScoringResultResponse(result))
}

package httpapi

import (
	"net/http"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

type Server struct {
	createArchiveItem             *usecase.CreateArchiveItem
	listArchiveItems              *usecase.ListArchiveItems
	createAIGradingRequest        *usecase.CreateAIGradingRequest
	listAIGradingRequests         *usecase.ListAIGradingRequests
	claimAIGradingRequest         *usecase.ClaimAIGradingRequest
	createTutoringAnalysisRequest *usecase.CreateTutoringAnalysisRequest
	listTutoringAnalysisRequests  *usecase.ListTutoringAnalysisRequests
	claimTutoringAnalysisRequest  *usecase.ClaimTutoringAnalysisRequest
	recordTutoringAnalysisResult  *usecase.RecordTutoringAnalysisResult
	agentAPIKey                   string
}

func NewServer(
	createArchiveItem *usecase.CreateArchiveItem,
	listArchiveItems *usecase.ListArchiveItems,
	createAIGradingRequest *usecase.CreateAIGradingRequest,
	listAIGradingRequests *usecase.ListAIGradingRequests,
	claimAIGradingRequest *usecase.ClaimAIGradingRequest,
	createTutoringAnalysisRequest *usecase.CreateTutoringAnalysisRequest,
	listTutoringAnalysisRequests *usecase.ListTutoringAnalysisRequests,
	claimTutoringAnalysisRequest *usecase.ClaimTutoringAnalysisRequest,
	recordTutoringAnalysisResult *usecase.RecordTutoringAnalysisResult,
	agentAPIKey string,
) *Server {
	return &Server{
		createArchiveItem:             createArchiveItem,
		listArchiveItems:              listArchiveItems,
		createAIGradingRequest:        createAIGradingRequest,
		listAIGradingRequests:         listAIGradingRequests,
		claimAIGradingRequest:         claimAIGradingRequest,
		createTutoringAnalysisRequest: createTutoringAnalysisRequest,
		listTutoringAnalysisRequests:  listTutoringAnalysisRequests,
		claimTutoringAnalysisRequest:  claimTutoringAnalysisRequest,
		recordTutoringAnalysisResult:  recordTutoringAnalysisResult,
		agentAPIKey:                   agentAPIKey,
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.health)
	mux.HandleFunc("/v1/teaching/archive-items", s.archiveItems)
	mux.HandleFunc("/v1/teaching/archive-items/", s.archiveItemSubresources)
	mux.HandleFunc("/v1/teaching/ai-grading-requests", s.aiGradingRequests)
	mux.HandleFunc("/v1/teaching/ai-grading-requests/", s.aiGradingRequestSubresources)
	mux.HandleFunc("/v1/teaching/tutoring-analysis-requests", s.tutoringAnalysisRequests)
	mux.HandleFunc("/v1/teaching/tutoring-analysis-requests/", s.tutoringAnalysisRequestSubresources)
	return mux
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "teaching-archive-gateway"})
}

func (s *Server) archiveItems(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.list(w, r)
	case http.MethodPost:
		s.create(w, r)
	default:
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
	}
}

func (s *Server) archiveItemSubresources(w http.ResponseWriter, r *http.Request) {
	if archiveItemID, ok := parseArchiveItemTutoringAnalysisRequestPath(r.URL.Path); ok {
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		s.createTutoringRequest(w, r, archiveItemID)
		return
	}
	if archiveItemID, ok := parseArchiveItemAIGradingRequestPath(r.URL.Path); ok {
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		s.createAIGrading(w, r, archiveItemID)
		return
	}
	writeError(w, http.StatusNotFound, "NOT_FOUND", "archive item subresource not found")
}

func (s *Server) tutoringAnalysisRequests(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.listTutoringRequests(w, r)
}

func (s *Server) tutoringAnalysisRequestSubresources(w http.ResponseWriter, r *http.Request) {
	if parseTutoringAnalysisWorkerClaimPath(r.URL.Path) {
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		s.claimTutoringRequest(w, r)
		return
	}

	requestID, ok := parseTutoringAnalysisWorkerResultPath(r.URL.Path)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "tutoring analysis request subresource not found")
		return
	}
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.recordTutoringResult(w, r, requestID)
}

func (s *Server) create(w http.ResponseWriter, r *http.Request) {
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

	item, err := s.createArchiveItem.Execute(r.Context(), domain.CreateArchiveItemInput{
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

	writeJSON(w, http.StatusCreated, toResponse(item))
}

func (s *Server) list(w http.ResponseWriter, r *http.Request) {
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
	page, err := s.listArchiveItems.Execute(r.Context(), domain.ListArchiveItemsInput{
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

	writeJSON(w, http.StatusOK, toListResponse(page))
}

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

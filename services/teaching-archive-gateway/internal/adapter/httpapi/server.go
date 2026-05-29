package httpapi

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

type Server struct {
	createArchiveItem             *usecase.CreateArchiveItem
	listArchiveItems              *usecase.ListArchiveItems
	createAIGradingRequest        *usecase.CreateAIGradingRequest
	createTutoringAnalysisRequest *usecase.CreateTutoringAnalysisRequest
	listTutoringAnalysisRequests  *usecase.ListTutoringAnalysisRequests
	claimTutoringAnalysisRequest  *usecase.ClaimTutoringAnalysisRequest
	recordTutoringAnalysisResult  *usecase.RecordTutoringAnalysisResult
	agentAPIKey                   string
}

type createArchiveItemRequest struct {
	OwnerType       domain.OwnerType        `json:"ownerType"`
	StudentID       string                  `json:"studentId,omitempty"`
	MaterialType    domain.MaterialType     `json:"materialType"`
	Title           string                  `json:"title"`
	Source          domain.Source           `json:"source"`
	ContentRef      string                  `json:"contentRef"`
	Tags            []string                `json:"tags,omitempty"`
	AnalysisIntents []domain.AnalysisIntent `json:"analysisIntents"`
	OCRReserved     bool                    `json:"ocrReserved,omitempty"`
}

type createTutoringAnalysisRequestRequest struct {
	AnalysisGoal       string                    `json:"analysisGoal"`
	QuestionBankIntent domain.QuestionBankIntent `json:"questionBankIntent,omitempty"`
}

type createAIGradingRequestRequest struct {
	GradingInstructions string `json:"gradingInstructions"`
	RubricRef           string `json:"rubricRef,omitempty"`
}

type recordTutoringAnalysisResultRequest struct {
	Status               domain.TutoringAnalysisStatus `json:"status"`
	WorkerID             string                        `json:"workerId"`
	ResultSummary        string                        `json:"resultSummary,omitempty"`
	ResultRef            string                        `json:"resultRef,omitempty"`
	QuestionBankDraftRef string                        `json:"questionBankDraftRef,omitempty"`
	ErrorCode            string                        `json:"errorCode,omitempty"`
	ErrorMessage         string                        `json:"errorMessage,omitempty"`
}

type claimTutoringAnalysisRequestRequest struct {
	WorkerID     string `json:"workerId"`
	LeaseSeconds int    `json:"leaseSeconds,omitempty"`
}

type archiveItemResponse struct {
	ID              string                  `json:"id"`
	OwnerType       domain.OwnerType        `json:"ownerType"`
	StudentID       *string                 `json:"studentId,omitempty"`
	MaterialType    domain.MaterialType     `json:"materialType"`
	Title           string                  `json:"title"`
	Source          domain.Source           `json:"source"`
	ContentRef      string                  `json:"contentRef"`
	Tags            []string                `json:"tags"`
	AnalysisIntents []domain.AnalysisIntent `json:"analysisIntents"`
	OCRStatus       domain.OCRStatus        `json:"ocrStatus"`
	CreatedAt       string                  `json:"createdAt"`
}

type archiveItemListResponse struct {
	Data     []archiveItemResponse `json:"data"`
	PageInfo pageInfoResponse      `json:"pageInfo"`
}

type tutoringAnalysisRequestListResponse struct {
	Data     []tutoringAnalysisRequestResponse `json:"data"`
	PageInfo pageInfoResponse                  `json:"pageInfo"`
}

type aiGradingRequestResponse struct {
	ID                     string                 `json:"id"`
	ArchiveItemID          string                 `json:"archiveItemId"`
	RequestedByPrincipalID string                 `json:"requestedByPrincipalId"`
	GradingInstructions    string                 `json:"gradingInstructions"`
	RubricRef              *string                `json:"rubricRef,omitempty"`
	Status                 domain.AIGradingStatus `json:"status"`
	SourceArchiveOwnerType domain.OwnerType       `json:"sourceArchiveOwnerType"`
	SourceArchiveStudentID *string                `json:"sourceArchiveStudentId,omitempty"`
	SourceArchiveMaterial  domain.MaterialType    `json:"sourceArchiveMaterial"`
	SourceArchiveOCRStatus domain.OCRStatus       `json:"sourceArchiveOcrStatus"`
	CreatedAt              string                 `json:"createdAt"`
	UpdatedAt              string                 `json:"updatedAt"`
}

type tutoringAnalysisRequestResponse struct {
	ID                     string                        `json:"id"`
	ArchiveItemID          string                        `json:"archiveItemId"`
	RequestedByPrincipalID string                        `json:"requestedByPrincipalId"`
	AnalysisGoal           string                        `json:"analysisGoal"`
	QuestionBankIntent     domain.QuestionBankIntent     `json:"questionBankIntent"`
	Status                 domain.TutoringAnalysisStatus `json:"status"`
	SourceArchiveOwnerType domain.OwnerType              `json:"sourceArchiveOwnerType"`
	SourceArchiveStudentID *string                       `json:"sourceArchiveStudentId,omitempty"`
	SourceArchiveMaterial  domain.MaterialType           `json:"sourceArchiveMaterial"`
	ResultSummary          *string                       `json:"resultSummary,omitempty"`
	ResultRef              *string                       `json:"resultRef,omitempty"`
	QuestionBankDraftRef   *string                       `json:"questionBankDraftRef,omitempty"`
	ErrorCode              *string                       `json:"errorCode,omitempty"`
	ErrorMessage           *string                       `json:"errorMessage,omitempty"`
	CreatedAt              string                        `json:"createdAt"`
	CompletedAt            *string                       `json:"completedAt,omitempty"`
	UpdatedAt              *string                       `json:"updatedAt,omitempty"`
}

type tutoringAnalysisWorkerClaimResponse struct {
	ID                     string                        `json:"id"`
	ArchiveItemID          string                        `json:"archiveItemId"`
	AnalysisGoal           string                        `json:"analysisGoal"`
	QuestionBankIntent     domain.QuestionBankIntent     `json:"questionBankIntent"`
	Status                 domain.TutoringAnalysisStatus `json:"status"`
	SourceArchiveOwnerType domain.OwnerType              `json:"sourceArchiveOwnerType"`
	SourceArchiveStudentID *string                       `json:"sourceArchiveStudentId,omitempty"`
	SourceArchiveMaterial  domain.MaterialType           `json:"sourceArchiveMaterial"`
	ClaimedByWorkerID      string                        `json:"claimedByWorkerId"`
	ClaimExpiresAt         string                        `json:"claimExpiresAt"`
	CreatedAt              string                        `json:"createdAt"`
	UpdatedAt              string                        `json:"updatedAt"`
}

type pageInfoResponse struct {
	PageSize   int     `json:"pageSize"`
	HasMore    bool    `json:"hasMore"`
	NextCursor *string `json:"nextCursor"`
}

type errorResponse struct {
	Error apiError `json:"error"`
}

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func NewServer(
	createArchiveItem *usecase.CreateArchiveItem,
	listArchiveItems *usecase.ListArchiveItems,
	createAIGradingRequest *usecase.CreateAIGradingRequest,
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

func (s *Server) authorized(r *http.Request) bool {
	if s.agentAPIKey == "" {
		return true
	}
	return r.Header.Get("X-Agent-Api-Key") == s.agentAPIKey
}

func parseArchiveItemTutoringAnalysisRequestPath(path string) (string, bool) {
	const prefix = "/v1/teaching/archive-items/"
	const suffix = "/tutoring-analysis-requests"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	archiveItemID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if archiveItemID == "" || strings.Contains(archiveItemID, "/") {
		return "", false
	}
	return archiveItemID, true
}

func parseArchiveItemAIGradingRequestPath(path string) (string, bool) {
	const prefix = "/v1/teaching/archive-items/"
	const suffix = "/ai-grading-requests"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	archiveItemID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if archiveItemID == "" || strings.Contains(archiveItemID, "/") {
		return "", false
	}
	return archiveItemID, true
}

func parseTutoringAnalysisWorkerClaimPath(path string) bool {
	return path == "/v1/teaching/tutoring-analysis-requests/worker-claims"
}

func parseTutoringAnalysisWorkerResultPath(path string) (string, bool) {
	const prefix = "/v1/teaching/tutoring-analysis-requests/"
	const suffix = "/worker-result"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	requestID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if requestID == "" || strings.Contains(requestID, "/") {
		return "", false
	}
	return requestID, true
}

func parsePrincipalContext(w http.ResponseWriter, r *http.Request) (domain.PrincipalContext, bool) {
	principal, err := decodePrincipalContextHeader(r.Header.Get("X-Principal-Context"))
	if err != nil {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid principal context")
		return domain.PrincipalContext{}, false
	}
	return principal, true
}

func decodePrincipalContextHeader(value string) (domain.PrincipalContext, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return domain.PrincipalContext{}, domain.ErrUnauthenticated
	}
	data, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		data, err = base64.URLEncoding.DecodeString(value)
	}
	if err != nil {
		return domain.PrincipalContext{}, domain.ErrUnauthenticated
	}
	var principal domain.PrincipalContext
	if err := json.Unmarshal(data, &principal); err != nil {
		return domain.PrincipalContext{}, domain.ErrUnauthenticated
	}
	if err := domain.ValidatePrincipalContext(principal); err != nil {
		return domain.PrincipalContext{}, err
	}
	return principal, nil
}

func handleArchiveError(w http.ResponseWriter, err error, internalMessage string) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, domain.ErrValidation):
		writeError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", err.Error())
	case errors.Is(err, domain.ErrUnauthenticated):
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid principal context")
	case errors.Is(err, domain.ErrForbidden):
		writeError(w, http.StatusForbidden, "FORBIDDEN", err.Error())
	case errors.Is(err, domain.ErrNotFound):
		writeError(w, http.StatusNotFound, "NOT_FOUND", err.Error())
	case errors.Is(err, domain.ErrConflict):
		writeError(w, http.StatusConflict, "CONFLICT", err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", internalMessage)
	}
	return true
}

func parseOptionalInt(w http.ResponseWriter, value string, field string) (int, bool) {
	if value == "" {
		return 0, true
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", field+" must be an integer")
		return 0, false
	}
	return parsed, true
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_JSON", "invalid request body")
		return false
	}
	return true
}

func toListResponse(page domain.ArchiveItemPage) archiveItemListResponse {
	items := make([]archiveItemResponse, 0, len(page.Items))
	for _, item := range page.Items {
		items = append(items, toResponse(item))
	}
	return archiveItemListResponse{
		Data: items,
		PageInfo: pageInfoResponse{
			PageSize:   page.PageInfo.PageSize,
			HasMore:    page.PageInfo.HasMore,
			NextCursor: optionalString(page.PageInfo.NextCursor),
		},
	}
}

func toResponse(item domain.ArchiveItem) archiveItemResponse {
	return archiveItemResponse{
		ID:              item.ID,
		OwnerType:       item.OwnerType,
		StudentID:       optionalString(item.StudentID),
		MaterialType:    item.MaterialType,
		Title:           item.Title,
		Source:          item.Source,
		ContentRef:      item.ContentRef,
		Tags:            item.Tags,
		AnalysisIntents: item.AnalysisIntents,
		OCRStatus:       item.OCRStatus,
		CreatedAt:       formatTime(item.CreatedAt),
	}
}

func toAIGradingRequestResponse(request domain.AIGradingRequest) aiGradingRequestResponse {
	return aiGradingRequestResponse{
		ID:                     request.ID,
		ArchiveItemID:          request.ArchiveItemID,
		RequestedByPrincipalID: request.RequestedByPrincipalID,
		GradingInstructions:    request.GradingInstructions,
		RubricRef:              optionalString(request.RubricRef),
		Status:                 request.Status,
		SourceArchiveOwnerType: request.SourceArchiveOwnerType,
		SourceArchiveStudentID: optionalString(request.SourceArchiveStudentID),
		SourceArchiveMaterial:  request.SourceArchiveMaterial,
		SourceArchiveOCRStatus: request.SourceArchiveOCRStatus,
		CreatedAt:              formatTime(request.CreatedAt),
		UpdatedAt:              formatTime(request.UpdatedAt),
	}
}

func toTutoringAnalysisRequestListResponse(page domain.TutoringAnalysisRequestPage) tutoringAnalysisRequestListResponse {
	requests := make([]tutoringAnalysisRequestResponse, 0, len(page.Items))
	for _, request := range page.Items {
		requests = append(requests, toTutoringAnalysisRequestResponse(request))
	}
	return tutoringAnalysisRequestListResponse{
		Data: requests,
		PageInfo: pageInfoResponse{
			PageSize:   page.PageInfo.PageSize,
			HasMore:    page.PageInfo.HasMore,
			NextCursor: optionalString(page.PageInfo.NextCursor),
		},
	}
}

func toTutoringAnalysisRequestResponse(request domain.TutoringAnalysisRequest) tutoringAnalysisRequestResponse {
	return tutoringAnalysisRequestResponse{
		ID:                     request.ID,
		ArchiveItemID:          request.ArchiveItemID,
		RequestedByPrincipalID: request.RequestedByPrincipalID,
		AnalysisGoal:           request.AnalysisGoal,
		QuestionBankIntent:     request.QuestionBankIntent,
		Status:                 request.Status,
		SourceArchiveOwnerType: request.SourceArchiveOwnerType,
		SourceArchiveStudentID: optionalString(request.SourceArchiveStudentID),
		SourceArchiveMaterial:  request.SourceArchiveMaterial,
		ResultSummary:          optionalString(request.ResultSummary),
		ResultRef:              optionalString(request.ResultRef),
		QuestionBankDraftRef:   optionalString(request.QuestionBankDraftRef),
		ErrorCode:              optionalString(request.ErrorCode),
		ErrorMessage:           optionalString(request.ErrorMessage),
		CreatedAt:              formatTime(request.CreatedAt),
		CompletedAt:            optionalTime(request.CompletedAt),
		UpdatedAt:              optionalTime(request.UpdatedAt),
	}
}

func toTutoringAnalysisWorkerClaimResponse(request domain.TutoringAnalysisRequest) tutoringAnalysisWorkerClaimResponse {
	return tutoringAnalysisWorkerClaimResponse{
		ID:                     request.ID,
		ArchiveItemID:          request.ArchiveItemID,
		AnalysisGoal:           request.AnalysisGoal,
		QuestionBankIntent:     request.QuestionBankIntent,
		Status:                 request.Status,
		SourceArchiveOwnerType: request.SourceArchiveOwnerType,
		SourceArchiveStudentID: optionalString(request.SourceArchiveStudentID),
		SourceArchiveMaterial:  request.SourceArchiveMaterial,
		ClaimedByWorkerID:      request.ClaimedByWorkerID,
		ClaimExpiresAt:         formatTime(request.ClaimExpiresAt),
		CreatedAt:              formatTime(request.CreatedAt),
		UpdatedAt:              formatTime(request.UpdatedAt),
	}
}

func optionalString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func formatTime(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}

func optionalTime(value time.Time) *string {
	if value.IsZero() {
		return nil
	}
	formatted := formatTime(value)
	return &formatted
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, code string, message string) {
	writeJSON(w, status, errorResponse{Error: apiError{Code: code, Message: message}})
}

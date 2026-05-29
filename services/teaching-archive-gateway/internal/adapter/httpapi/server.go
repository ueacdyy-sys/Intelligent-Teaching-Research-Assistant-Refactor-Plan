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
	createTutoringAnalysisRequest *usecase.CreateTutoringAnalysisRequest
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
	CreatedAt              string                        `json:"createdAt"`
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
	createTutoringAnalysisRequest *usecase.CreateTutoringAnalysisRequest,
	agentAPIKey string,
) *Server {
	return &Server{
		createArchiveItem:             createArchiveItem,
		listArchiveItems:              listArchiveItems,
		createTutoringAnalysisRequest: createTutoringAnalysisRequest,
		agentAPIKey:                   agentAPIKey,
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.health)
	mux.HandleFunc("/v1/teaching/archive-items", s.archiveItems)
	mux.HandleFunc("/v1/teaching/archive-items/", s.archiveItemSubresources)
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
	archiveItemID, ok := parseArchiveItemTutoringAnalysisRequestPath(r.URL.Path)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "archive item subresource not found")
		return
	}
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.createTutoringRequest(w, r, archiveItemID)
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
		CreatedAt:              formatTime(request.CreatedAt),
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

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, code string, message string) {
	writeJSON(w, status, errorResponse{Error: apiError{Code: code, Message: message}})
}

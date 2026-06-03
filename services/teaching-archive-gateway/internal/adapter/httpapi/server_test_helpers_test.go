package httpapi_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/httpapi"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/platform"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func newTestHandler() http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			archiveItem("tarch_http_3", "student_001", time.Date(2026, 5, 29, 10, 3, 0, 0, time.UTC)),
			archiveItem("tarch_http_other", "student_002", time.Date(2026, 5, 29, 10, 2, 30, 0, time.UTC)),
			archiveItem("tarch_http_2", "student_001", time.Date(2026, 5, 29, 10, 2, 0, 0, time.UTC)),
			archiveItem("tarch_http_1", "student_001", time.Date(2026, 5, 29, 10, 1, 0, 0, time.UTC)),
		},
		requests: []domain.TutoringAnalysisRequest{
			tutoringAnalysisRequest("tutor_req_http_3", "tarch_http_3", "student_001", time.Date(2026, 5, 29, 10, 3, 0, 0, time.UTC)),
			tutoringAnalysisRequest("tutor_req_http_other", "tarch_http_other", "student_002", time.Date(2026, 5, 29, 10, 2, 30, 0, time.UTC)),
			tutoringAnalysisRequest("tutor_req_http_2", "tarch_http_2", "student_001", time.Date(2026, 5, 29, 10, 2, 0, 0, time.UTC)),
			tutoringAnalysisRequest("tutor_req_http_1", "tarch_http_1", "student_001", time.Date(2026, 5, 29, 10, 1, 0, 0, time.UTC)),
		},
	}
	uc := usecase.NewCreateArchiveItem(
		store,
		fixedIDs{id: "tarch_http"},
		fixedClock{now: time.Date(2026, 5, 29, 8, 0, 0, 0, time.UTC)},
	)
	list := usecase.NewListArchiveItems(store)
	createAIGradingRequest := usecase.NewCreateAIGradingRequest(
		store,
		fixedIDs{id: "grading_req_http"},
		fixedClock{now: time.Date(2026, 5, 29, 8, 20, 0, 0, time.UTC)},
	)
	listAIGradingRequests := usecase.NewListAIGradingRequests(store)
	listTutoringRequests := usecase.NewListTutoringAnalysisRequests(store)
	createTutoringRequest := usecase.NewCreateTutoringAnalysisRequest(
		store,
		fixedIDs{id: "tutor_req_http"},
		fixedClock{now: time.Date(2026, 5, 29, 8, 30, 0, 0, time.UTC)},
	)
	recordTutoringResult := usecase.NewRecordTutoringAnalysisResult(
		store,
		fixedClock{now: time.Date(2026, 5, 29, 8, 45, 0, 0, time.UTC)},
	)
	claimTutoringRequest := usecase.NewClaimTutoringAnalysisRequest(
		store,
		fixedClock{now: time.Date(2026, 5, 29, 8, 40, 0, 0, time.UTC)},
	)
	return httpapi.NewServer(httpapi.ServerConfig{
		CreateArchiveItem:             uc,
		ListArchiveItems:              list,
		CreateAIGradingRequest:        createAIGradingRequest,
		CreateQuizSubmissionAIGrading: usecase.NewCreateQuizSubmissionAIGradingRequest(store, fixedIDs{id: "grading_req_http"}, fixedClock{}),
		ListAIGradingRequests:         listAIGradingRequests,
		CreateTutoringAnalysisRequest: createTutoringRequest,
		ListTutoringAnalysisRequests:  listTutoringRequests,
		ClaimTutoringAnalysisRequest:  claimTutoringRequest,
		RecordTutoringAnalysisResult:  recordTutoringResult,
		AgentAPIKey:                   "ueacd",
	}).Handler()
}

func newTestHandlerWithRequests(requests []domain.TutoringAnalysisRequest) http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			archiveItem("tarch_http_3", "student_001", time.Date(2026, 5, 29, 10, 3, 0, 0, time.UTC)),
			archiveItem("tarch_http_other", "student_002", time.Date(2026, 5, 29, 10, 2, 30, 0, time.UTC)),
			archiveItem("tarch_http_2", "student_001", time.Date(2026, 5, 29, 10, 2, 0, 0, time.UTC)),
			archiveItem("tarch_http_1", "student_001", time.Date(2026, 5, 29, 10, 1, 0, 0, time.UTC)),
		},
		requests: append([]domain.TutoringAnalysisRequest(nil), requests...),
	}
	uc := usecase.NewCreateArchiveItem(
		store,
		fixedIDs{id: "tarch_http"},
		fixedClock{now: time.Date(2026, 5, 29, 8, 0, 0, 0, time.UTC)},
	)
	list := usecase.NewListArchiveItems(store)
	createAIGradingRequest := usecase.NewCreateAIGradingRequest(
		store,
		fixedIDs{id: "grading_req_http"},
		fixedClock{now: time.Date(2026, 5, 29, 8, 20, 0, 0, time.UTC)},
	)
	listAIGradingRequests := usecase.NewListAIGradingRequests(store)
	listTutoringRequests := usecase.NewListTutoringAnalysisRequests(store)
	createTutoringRequest := usecase.NewCreateTutoringAnalysisRequest(
		store,
		fixedIDs{id: "tutor_req_http"},
		fixedClock{now: time.Date(2026, 5, 29, 8, 30, 0, 0, time.UTC)},
	)
	recordTutoringResult := usecase.NewRecordTutoringAnalysisResult(
		store,
		fixedClock{now: time.Date(2026, 5, 29, 8, 45, 0, 0, time.UTC)},
	)
	claimTutoringRequest := usecase.NewClaimTutoringAnalysisRequest(
		store,
		fixedClock{now: time.Date(2026, 5, 29, 8, 40, 0, 0, time.UTC)},
	)
	return httpapi.NewServer(httpapi.ServerConfig{
		CreateArchiveItem:             uc,
		ListArchiveItems:              list,
		CreateAIGradingRequest:        createAIGradingRequest,
		CreateQuizSubmissionAIGrading: usecase.NewCreateQuizSubmissionAIGradingRequest(store, fixedIDs{id: "grading_req_http"}, fixedClock{}),
		ListAIGradingRequests:         listAIGradingRequests,
		CreateTutoringAnalysisRequest: createTutoringRequest,
		ListTutoringAnalysisRequests:  listTutoringRequests,
		ClaimTutoringAnalysisRequest:  claimTutoringRequest,
		RecordTutoringAnalysisResult:  recordTutoringResult,
		AgentAPIKey:                   "ueacd",
	}).Handler()
}

func setPrincipalHeader(t *testing.T, request *http.Request, principal domain.PrincipalContext) {
	t.Helper()
	payload, err := json.Marshal(principal)
	if err != nil {
		t.Fatalf("principal JSON: %v", err)
	}
	request.Header.Set("X-Principal-Context", base64.RawURLEncoding.EncodeToString(payload))
}

func teacherPrincipal() domain.PrincipalContext {
	return domain.PrincipalContext{
		PrincipalID: "teacher_001",
		SubjectType: domain.SubjectUser,
		Role:        domain.RoleTeacher,
		EntryPoint:  domain.EntryPointDesktopTeacher,
		Scopes: []domain.Scope{
			domain.ScopeTeachingRead,
			domain.ScopeTeachingWrite,
			domain.ScopeStudentAssignedRead,
			domain.ScopeStudentArchiveWrite,
		},
		KnowledgeAccess: domain.KnowledgeAccess{Public: true, Private: domain.PrivateAccessAssigned},
		StudentAccess:   domain.StudentAccess{Mode: domain.StudentAccessAssigned},
		SessionID:       "sess_teacher",
		IssuedAt:        time.Now().Add(-time.Minute).UTC(),
		ExpiresAt:       time.Now().Add(time.Hour).UTC(),
	}
}

func studentPrincipal(studentID string) domain.PrincipalContext {
	return domain.PrincipalContext{
		PrincipalID: studentID,
		SubjectType: domain.SubjectUser,
		Role:        domain.RoleStudent,
		EntryPoint:  domain.EntryPointStudentApp,
		Scopes: []domain.Scope{
			domain.ScopeTeachingRead,
			domain.ScopeStudentOwnRead,
			domain.ScopeStudentOwnWrite,
		},
		KnowledgeAccess: domain.KnowledgeAccess{Public: true, Private: domain.PrivateAccessNone},
		StudentAccess: domain.StudentAccess{
			Mode:       domain.StudentAccessOwn,
			StudentIDs: []string{studentID},
		},
		SessionID: "sess_student",
		IssuedAt:  time.Now().Add(-time.Minute).UTC(),
		ExpiresAt: time.Now().Add(time.Hour).UTC(),
	}
}

func remotePrincipal() domain.PrincipalContext {
	return domain.PrincipalContext{
		PrincipalID:     "remote:WECHAT:openid",
		SubjectType:     domain.SubjectRemoteChannel,
		Role:            domain.RoleRemoteOperator,
		EntryPoint:      domain.EntryPointRemoteSocial,
		Scopes:          []domain.Scope{domain.ScopeAgentCommandSubmit},
		KnowledgeAccess: domain.KnowledgeAccess{Private: domain.PrivateAccessNone},
		StudentAccess: domain.StudentAccess{
			Mode: domain.StudentAccessNone,
		},
		RequiresHarnessApproval: true,
		SessionID:               "grant_remote",
		IssuedAt:                time.Now().Add(-time.Minute).UTC(),
		ExpiresAt:               time.Now().Add(time.Hour).UTC(),
	}
}

func servicePrincipal() domain.PrincipalContext {
	return domain.PrincipalContext{
		PrincipalID:     "svc_tutoring_worker",
		SubjectType:     domain.SubjectService,
		Role:            domain.RoleService,
		EntryPoint:      domain.EntryPointAgentInternal,
		Scopes:          []domain.Scope{domain.ScopeTeachingRead, domain.ScopeTeachingWrite},
		KnowledgeAccess: domain.KnowledgeAccess{Public: true, Private: domain.PrivateAccessNone},
		StudentAccess:   domain.StudentAccess{Mode: domain.StudentAccessNone},
		SessionID:       "svc_session",
		IssuedAt:        time.Now().Add(-time.Minute).UTC(),
		ExpiresAt:       time.Now().Add(time.Hour).UTC(),
	}
}

type fakeRepository struct {
	items              []domain.ArchiveItem
	requests           []domain.TutoringAnalysisRequest
	gradingRequests    []domain.AIGradingRequest
	quizSubmissions    []domain.QuizSubmission
	attendanceSessions []domain.AttendanceSession
	attendanceRecords  []domain.AttendanceRecord
	attendanceStats    domain.AttendanceStatistics

	lastAttendanceStatsQuery domain.AttendanceStatisticsQuery
}

func (f *fakeRepository) Create(ctx context.Context, _ domain.ArchiveItem) error {
	if timing := platform.TeachingArchiveTimingFromContext(ctx); timing != nil {
		timing.DBInsert = time.Millisecond
	}
	return nil
}

func (f *fakeRepository) List(_ context.Context, query domain.ArchiveItemQuery) ([]domain.ArchiveItem, error) {
	items := make([]domain.ArchiveItem, 0, len(f.items))
	for _, item := range f.items {
		if query.OwnerType != "" && item.OwnerType != query.OwnerType {
			continue
		}
		if query.StudentID != "" && item.StudentID != query.StudentID {
			continue
		}
		if len(query.StudentIDs) > 0 && !containsString(query.StudentIDs, item.StudentID) {
			continue
		}
		if query.MaterialType != "" && item.MaterialType != query.MaterialType {
			continue
		}
		items = append(items, item)
		if query.FetchLimit > 0 && len(items) >= query.FetchLimit {
			break
		}
	}
	return items, nil
}

func (f *fakeRepository) GetByID(_ context.Context, id string) (domain.ArchiveItem, bool, error) {
	for _, item := range f.items {
		if item.ID == id {
			return item, true, nil
		}
	}
	return domain.ArchiveItem{}, false, nil
}

func (f *fakeRepository) CreateTutoringAnalysisRequest(_ context.Context, request domain.TutoringAnalysisRequest) error {
	f.requests = append(f.requests, request)
	return nil
}

func (f *fakeRepository) CreateAIGradingRequest(_ context.Context, request domain.AIGradingRequest) error {
	f.gradingRequests = append(f.gradingRequests, request)
	return nil
}

func (f *fakeRepository) CreateAttendanceSession(_ context.Context, session domain.AttendanceSession) error {
	f.attendanceSessions = append(f.attendanceSessions, session)
	return nil
}

func (f *fakeRepository) GetAttendanceSessionByID(
	_ context.Context,
	id string,
) (domain.AttendanceSession, bool, error) {
	for _, session := range f.attendanceSessions {
		if session.ID == id {
			return session, true, nil
		}
	}
	return domain.AttendanceSession{}, false, nil
}

func (f *fakeRepository) CreateAttendanceRecord(
	_ context.Context,
	record domain.AttendanceRecord,
) (domain.AttendanceRecord, bool, error) {
	for _, existing := range f.attendanceRecords {
		if existing.SessionID == record.SessionID && existing.StudentID == record.StudentID {
			return existing, false, nil
		}
	}
	f.attendanceRecords = append(f.attendanceRecords, record)
	return record, true, nil
}

func (f *fakeRepository) EndAttendanceSession(
	_ context.Context,
	id string,
	endedAt time.Time,
) (domain.AttendanceSession, bool, error) {
	for index, session := range f.attendanceSessions {
		if session.ID != id {
			continue
		}
		if session.Status == domain.AttendanceSessionStatusActive {
			session.Status = domain.AttendanceSessionStatusEnded
			session.EndedAt = endedAt.UTC()
			f.attendanceSessions[index] = session
		}
		return session, true, nil
	}
	return domain.AttendanceSession{}, false, nil
}

func (f *fakeRepository) ListAttendancePresentStudentIDs(
	_ context.Context,
	sessionID string,
) ([]string, error) {
	studentIDs := make([]string, 0, len(f.attendanceRecords))
	for _, record := range f.attendanceRecords {
		if record.SessionID == sessionID && record.Status == domain.AttendanceRecordStatusPresent {
			studentIDs = append(studentIDs, record.StudentID)
		}
	}
	return studentIDs, nil
}

func (f *fakeRepository) ListTutoringAnalysisRequests(
	_ context.Context,
	query domain.TutoringAnalysisRequestQuery,
) ([]domain.TutoringAnalysisRequest, error) {
	requests := make([]domain.TutoringAnalysisRequest, 0, len(f.requests))
	for _, request := range f.requests {
		if query.Status != "" && request.Status != query.Status {
			continue
		}
		if query.ArchiveItemID != "" && request.ArchiveItemID != query.ArchiveItemID {
			continue
		}
		if query.SourceArchiveOwnerType != "" && request.SourceArchiveOwnerType != query.SourceArchiveOwnerType {
			continue
		}
		if query.StudentID != "" && request.SourceArchiveStudentID != query.StudentID {
			continue
		}
		if len(query.StudentIDs) > 0 && !containsString(query.StudentIDs, request.SourceArchiveStudentID) {
			continue
		}
		if query.RequireQuestionBankDraftRef && request.QuestionBankDraftRef == "" {
			continue
		}
		requests = append(requests, request)
		if query.FetchLimit > 0 && len(requests) >= query.FetchLimit {
			break
		}
	}
	return requests, nil
}

func (f *fakeRepository) GetTutoringAnalysisRequestByID(
	_ context.Context,
	id string,
) (domain.TutoringAnalysisRequest, bool, error) {
	for _, request := range f.requests {
		if request.ID == id {
			return request, true, nil
		}
	}
	return domain.TutoringAnalysisRequest{}, false, nil
}

func (f *fakeRepository) ClaimNextTutoringAnalysisRequest(
	_ context.Context,
	input domain.ClaimTutoringAnalysisRequestInput,
	now time.Time,
) (domain.TutoringAnalysisRequest, bool, error) {
	for index, request := range f.requests {
		claimed, err := domain.ApplyTutoringAnalysisClaim(request, input, now)
		if err == nil {
			f.requests[index] = claimed
			return claimed, true, nil
		}
		if !errors.Is(err, domain.ErrConflict) {
			return domain.TutoringAnalysisRequest{}, false, err
		}
	}
	return domain.TutoringAnalysisRequest{}, false, nil
}

func (f *fakeRepository) RecordTutoringAnalysisResult(
	_ context.Context,
	updated domain.TutoringAnalysisRequest,
) error {
	for index, request := range f.requests {
		if request.ID == updated.ID {
			f.requests[index] = updated
			return nil
		}
	}
	f.requests = append(f.requests, updated)
	return nil
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func tutoringAnalysisRequest(id string, archiveItemID string, studentID string, createdAt time.Time) domain.TutoringAnalysisRequest {
	return domain.TutoringAnalysisRequest{
		ID:                     id,
		ArchiveItemID:          archiveItemID,
		RequestedByPrincipalID: studentID,
		AnalysisGoal:           "find weak skills",
		QuestionBankIntent:     domain.QuestionBankIntentGeneratePersonalizedCheck,
		Status:                 domain.TutoringAnalysisStatusQueued,
		SourceArchiveOwnerType: domain.OwnerTypeStudent,
		SourceArchiveStudentID: studentID,
		SourceArchiveMaterial:  domain.MaterialTypeQuiz,
		CreatedAt:              createdAt,
	}
}

func completedTutoringAnalysisRequest(id string, archiveItemID string, studentID string, createdAt time.Time) domain.TutoringAnalysisRequest {
	request := tutoringAnalysisRequest(id, archiveItemID, studentID, createdAt)
	request.Status = domain.TutoringAnalysisStatusSucceeded
	request.ResultSummary = "completed"
	request.ResultRef = "local://analysis/" + id + "/result.json"
	request.CompletedAt = createdAt.Add(time.Hour)
	request.UpdatedAt = request.CompletedAt
	return request
}

func archiveItem(id string, studentID string, createdAt time.Time) domain.ArchiveItem {
	return domain.ArchiveItem{
		ID:              id,
		OwnerType:       domain.OwnerTypeStudent,
		StudentID:       studentID,
		MaterialType:    domain.MaterialTypeQuiz,
		Title:           "Quiz",
		Source:          domain.SourceTeacherUpload,
		ContentRef:      "local://archive/student/quiz.pdf",
		Tags:            []string{"math"},
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentTutoring, domain.AnalysisIntentAIGrading},
		OCRStatus:       domain.OCRStatusReserved,
		CreatedAt:       createdAt,
	}
}

type fixedIDs struct {
	id string
}

func (f fixedIDs) NewID() string {
	return f.id
}

type fixedClock struct {
	now time.Time
}

func (f fixedClock) Now() time.Time {
	return f.now
}

type fixedRandomFloats struct {
	values []float64
	index  int
}

func (f *fixedRandomFloats) Float64() float64 {
	if len(f.values) == 0 {
		return 0
	}
	if f.index >= len(f.values) {
		return f.values[len(f.values)-1]
	}
	value := f.values[f.index]
	f.index++
	return value
}

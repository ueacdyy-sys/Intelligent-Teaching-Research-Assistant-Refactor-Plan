package httpapi

import "ita-refactor/services/teaching-archive-gateway/internal/usecase"

type Server struct {
	createArchiveItem              *usecase.CreateArchiveItem
	listArchiveItems               *usecase.ListArchiveItems
	createQuizSubmission           *usecase.CreateQuizSubmission
	listQuizSubmissions            *usecase.ListQuizSubmissions
	createAIGradingRequest         *usecase.CreateAIGradingRequest
	createQuizSubmissionAIGrading  *usecase.CreateQuizSubmissionAIGradingRequest
	listAIGradingRequests          *usecase.ListAIGradingRequests
	claimAIGradingRequest          *usecase.ClaimAIGradingRequest
	recordAIGradingResult          *usecase.RecordAIGradingResult
	createTutoringAnalysisRequest  *usecase.CreateTutoringAnalysisRequest
	listTutoringAnalysisRequests   *usecase.ListTutoringAnalysisRequests
	claimTutoringAnalysisRequest   *usecase.ClaimTutoringAnalysisRequest
	recordTutoringAnalysisResult   *usecase.RecordTutoringAnalysisResult
	createAttendanceSession        *usecase.CreateAttendanceSession
	createAttendanceRecord         *usecase.CreateAttendanceRecord
	signInAttendance               *usecase.SignInAttendance
	endAttendanceSession           *usecase.EndAttendanceSession
	selectAttendanceRandomStudents *usecase.SelectAttendanceRandomStudents
	listAttendanceRecords          *usecase.ListAttendanceRecords
	listStudentAttendanceRecords   *usecase.ListStudentAttendanceRecords
	getAttendanceStatistics        *usecase.GetAttendanceStatistics
	createScannedQuizSubmission    *usecase.CreateScannedQuizSubmission
	agentAPIKey                    string
}

func NewServer(
	createArchiveItem *usecase.CreateArchiveItem,
	listArchiveItems *usecase.ListArchiveItems,
	createAIGradingRequest *usecase.CreateAIGradingRequest,
	createQuizSubmissionAIGrading *usecase.CreateQuizSubmissionAIGradingRequest,
	listAIGradingRequests *usecase.ListAIGradingRequests,
	claimAIGradingRequest *usecase.ClaimAIGradingRequest,
	recordAIGradingResult *usecase.RecordAIGradingResult,
	createTutoringAnalysisRequest *usecase.CreateTutoringAnalysisRequest,
	listTutoringAnalysisRequests *usecase.ListTutoringAnalysisRequests,
	claimTutoringAnalysisRequest *usecase.ClaimTutoringAnalysisRequest,
	recordTutoringAnalysisResult *usecase.RecordTutoringAnalysisResult,
	createQuizSubmission *usecase.CreateQuizSubmission,
	createScannedQuizSubmission *usecase.CreateScannedQuizSubmission,
	listQuizSubmissions *usecase.ListQuizSubmissions,
	createAttendanceSession *usecase.CreateAttendanceSession,
	createAttendanceRecord *usecase.CreateAttendanceRecord,
	signInAttendance *usecase.SignInAttendance,
	endAttendanceSession *usecase.EndAttendanceSession,
	selectAttendanceRandomStudents *usecase.SelectAttendanceRandomStudents,
	listAttendanceRecords *usecase.ListAttendanceRecords,
	listStudentAttendanceRecords *usecase.ListStudentAttendanceRecords,
	getAttendanceStatistics *usecase.GetAttendanceStatistics,
	agentAPIKey string,
) *Server {
	return &Server{
		createArchiveItem:              createArchiveItem,
		listArchiveItems:               listArchiveItems,
		createQuizSubmission:           createQuizSubmission,
		listQuizSubmissions:            listQuizSubmissions,
		createAIGradingRequest:         createAIGradingRequest,
		createQuizSubmissionAIGrading:  createQuizSubmissionAIGrading,
		listAIGradingRequests:          listAIGradingRequests,
		claimAIGradingRequest:          claimAIGradingRequest,
		recordAIGradingResult:          recordAIGradingResult,
		createTutoringAnalysisRequest:  createTutoringAnalysisRequest,
		listTutoringAnalysisRequests:   listTutoringAnalysisRequests,
		claimTutoringAnalysisRequest:   claimTutoringAnalysisRequest,
		recordTutoringAnalysisResult:   recordTutoringAnalysisResult,
		createAttendanceSession:        createAttendanceSession,
		createAttendanceRecord:         createAttendanceRecord,
		signInAttendance:               signInAttendance,
		endAttendanceSession:           endAttendanceSession,
		selectAttendanceRandomStudents: selectAttendanceRandomStudents,
		listAttendanceRecords:          listAttendanceRecords,
		listStudentAttendanceRecords:   listStudentAttendanceRecords,
		getAttendanceStatistics:        getAttendanceStatistics,
		createScannedQuizSubmission:    createScannedQuizSubmission,
		agentAPIKey:                    agentAPIKey,
	}
}

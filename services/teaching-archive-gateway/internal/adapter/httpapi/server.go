package httpapi

import "ita-refactor/services/teaching-archive-gateway/internal/usecase"

type Server struct {
	createArchiveItem               *usecase.CreateArchiveItem
	listArchiveItems                *usecase.ListArchiveItems
	listStudentAppTeachingMaterials *usecase.ListStudentAppTeachingMaterials
	createQuizSubmission            *usecase.CreateQuizSubmission
	listQuizSubmissions             *usecase.ListQuizSubmissions
	createAIGradingRequest          *usecase.CreateAIGradingRequest
	createQuizSubmissionAIGrading   *usecase.CreateQuizSubmissionAIGradingRequest
	listAIGradingRequests           *usecase.ListAIGradingRequests
	claimAIGradingRequest           *usecase.ClaimAIGradingRequest
	recordAIGradingResult           *usecase.RecordAIGradingResult
	createTutoringAnalysisRequest   *usecase.CreateTutoringAnalysisRequest
	listTutoringAnalysisRequests    *usecase.ListTutoringAnalysisRequests
	claimTutoringAnalysisRequest    *usecase.ClaimTutoringAnalysisRequest
	recordTutoringAnalysisResult    *usecase.RecordTutoringAnalysisResult
	createAttendanceSession         *usecase.CreateAttendanceSession
	createAttendanceRecord          *usecase.CreateAttendanceRecord
	signInAttendance                *usecase.SignInAttendance
	endAttendanceSession            *usecase.EndAttendanceSession
	selectAttendanceRandomStudents  *usecase.SelectAttendanceRandomStudents
	listAttendanceRecords           *usecase.ListAttendanceRecords
	listStudentAttendanceRecords    *usecase.ListStudentAttendanceRecords
	getAttendanceStatistics         *usecase.GetAttendanceStatistics
	createScannedQuizSubmission     *usecase.CreateScannedQuizSubmission
	agentAPIKey                     string
}

func NewServer(config ServerConfig) *Server {
	return &Server{
		createArchiveItem:               config.CreateArchiveItem,
		listArchiveItems:                config.ListArchiveItems,
		listStudentAppTeachingMaterials: config.ListStudentAppTeachingMaterials,
		createQuizSubmission:            config.CreateQuizSubmission,
		listQuizSubmissions:             config.ListQuizSubmissions,
		createAIGradingRequest:          config.CreateAIGradingRequest,
		createQuizSubmissionAIGrading:   config.CreateQuizSubmissionAIGrading,
		listAIGradingRequests:           config.ListAIGradingRequests,
		claimAIGradingRequest:           config.ClaimAIGradingRequest,
		recordAIGradingResult:           config.RecordAIGradingResult,
		createTutoringAnalysisRequest:   config.CreateTutoringAnalysisRequest,
		listTutoringAnalysisRequests:    config.ListTutoringAnalysisRequests,
		claimTutoringAnalysisRequest:    config.ClaimTutoringAnalysisRequest,
		recordTutoringAnalysisResult:    config.RecordTutoringAnalysisResult,
		createAttendanceSession:         config.CreateAttendanceSession,
		createAttendanceRecord:          config.CreateAttendanceRecord,
		signInAttendance:                config.SignInAttendance,
		endAttendanceSession:            config.EndAttendanceSession,
		selectAttendanceRandomStudents:  config.SelectAttendanceRandomStudents,
		listAttendanceRecords:           config.ListAttendanceRecords,
		listStudentAttendanceRecords:    config.ListStudentAttendanceRecords,
		getAttendanceStatistics:         config.GetAttendanceStatistics,
		createScannedQuizSubmission:     config.CreateScannedQuizSubmission,
		agentAPIKey:                     config.AgentAPIKey,
	}
}

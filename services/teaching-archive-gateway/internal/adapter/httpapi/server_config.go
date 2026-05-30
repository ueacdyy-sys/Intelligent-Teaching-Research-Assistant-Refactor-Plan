package httpapi

import "ita-refactor/services/teaching-archive-gateway/internal/usecase"

type ServerConfig struct {
	CreateArchiveItem               *usecase.CreateArchiveItem
	ListArchiveItems                *usecase.ListArchiveItems
	ListStudentAppTeachingMaterials *usecase.ListStudentAppTeachingMaterials
	ListStudentAppArchiveItems      *usecase.ListStudentAppArchiveItems
	CreateStudentAppAITutorRequest  *usecase.CreateStudentAppAITutorRequest
	CreateQuizSubmission            *usecase.CreateQuizSubmission
	ListQuizSubmissions             *usecase.ListQuizSubmissions
	CreateAIGradingRequest          *usecase.CreateAIGradingRequest
	CreateQuizSubmissionAIGrading   *usecase.CreateQuizSubmissionAIGradingRequest
	ListAIGradingRequests           *usecase.ListAIGradingRequests
	ClaimAIGradingRequest           *usecase.ClaimAIGradingRequest
	RecordAIGradingResult           *usecase.RecordAIGradingResult
	CreateTutoringAnalysisRequest   *usecase.CreateTutoringAnalysisRequest
	ListTutoringAnalysisRequests    *usecase.ListTutoringAnalysisRequests
	ClaimTutoringAnalysisRequest    *usecase.ClaimTutoringAnalysisRequest
	RecordTutoringAnalysisResult    *usecase.RecordTutoringAnalysisResult
	CreateAttendanceSession         *usecase.CreateAttendanceSession
	CreateAttendanceRecord          *usecase.CreateAttendanceRecord
	SignInAttendance                *usecase.SignInAttendance
	EndAttendanceSession            *usecase.EndAttendanceSession
	SelectAttendanceRandomStudents  *usecase.SelectAttendanceRandomStudents
	ListAttendanceRecords           *usecase.ListAttendanceRecords
	ListStudentAttendanceRecords    *usecase.ListStudentAttendanceRecords
	GetAttendanceStatistics         *usecase.GetAttendanceStatistics
	CreateScannedQuizSubmission     *usecase.CreateScannedQuizSubmission
	AgentAPIKey                     string
}

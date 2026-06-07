package httpapi

import (
	"ita-refactor/services/teaching-archive-gateway/internal/platform"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

type Server struct {
	createArchiveItem                                     *usecase.CreateArchiveItem
	listArchiveItems                                      *usecase.ListArchiveItems
	listStudentAppTeachingMaterials                       *usecase.ListStudentAppTeachingMaterials
	listStudentAppArchiveItems                            *usecase.ListStudentAppArchiveItems
	readStudentAppArchiveItem                             *usecase.ReadStudentAppArchiveItem
	readStudentAppArchiveItemContentPreview               *usecase.ReadStudentAppArchiveItemContentPreview
	renderStudentAppArchiveItemContentPreview             *usecase.RenderStudentAppArchiveItemContentPreview
	readStudentAppArchiveItemStudyPacket                  *usecase.ReadStudentAppArchiveItemStudyPacket
	createStudentAppAITutorRequest                        *usecase.CreateStudentAppAITutorRequest
	listStudentAppAITutorRequests                         *usecase.ListStudentAppAITutorRequests
	listStudentAppQuizSubmissions                         *usecase.ListStudentAppQuizSubmissions
	listStudentAppQuestionBankDrafts                      *usecase.ListStudentAppQuestionBankDrafts
	readStudentAppQuestionBankDraftContentUseCase         *usecase.ReadStudentAppQuestionBankDraftContent
	submitStudentAppQuestionBankDraftAnswer               *usecase.SubmitStudentAppQuestionBankDraftAnswer
	createStudentAppQuestionBankDraftAnswerScoringRequest *usecase.CreateStudentAppQuestionBankDraftAnswerScoringRequest
	readStudentAppQuestionBankDraftAnswerScoringResult    *usecase.ReadStudentAppQuestionBankDraftAnswerScoringResult
	createQuizSubmission                                  *usecase.CreateQuizSubmission
	listQuizSubmissions                                   *usecase.ListQuizSubmissions
	createAIGradingRequest                                *usecase.CreateAIGradingRequest
	createQuizSubmissionAIGrading                         *usecase.CreateQuizSubmissionAIGradingRequest
	listAIGradingRequests                                 *usecase.ListAIGradingRequests
	claimAIGradingRequest                                 *usecase.ClaimAIGradingRequest
	recordAIGradingResult                                 *usecase.RecordAIGradingResult
	readQuestionBankDraftAnswerScoringInput               *usecase.ReadQuestionBankDraftAnswerScoringInput
	createTutoringAnalysisRequest                         *usecase.CreateTutoringAnalysisRequest
	listTutoringAnalysisRequests                          *usecase.ListTutoringAnalysisRequests
	claimTutoringAnalysisRequest                          *usecase.ClaimTutoringAnalysisRequest
	recordTutoringAnalysisResult                          *usecase.RecordTutoringAnalysisResult
	submitTeachingQuizDraftIntent                         *usecase.SubmitTeachingQuizDraftIntent
	submitTeachingArchiveMaterialDraftIntent              *usecase.SubmitTeachingArchiveMaterialDraftIntent
	createAttendanceSession                               *usecase.CreateAttendanceSession
	createAttendanceRecord                                *usecase.CreateAttendanceRecord
	signInAttendance                                      *usecase.SignInAttendance
	endAttendanceSession                                  *usecase.EndAttendanceSession
	selectAttendanceRandomStudents                        *usecase.SelectAttendanceRandomStudents
	listAttendanceRecords                                 *usecase.ListAttendanceRecords
	listStudentAttendanceRecords                          *usecase.ListStudentAttendanceRecords
	getAttendanceStatistics                               *usecase.GetAttendanceStatistics
	createScannedQuizSubmission                           *usecase.CreateScannedQuizSubmission
	agentAPIKey                                           string
	diagnosticsSecret                                     string
	dbPoolStatsProvider                                   platform.TeachingArchiveDBPoolStatsProvider
	commandLogProvider                                    platform.TeachingCommandLogStatsProvider
}

func NewServer(config ServerConfig) *Server {
	return &Server{
		createArchiveItem:                                     config.CreateArchiveItem,
		listArchiveItems:                                      config.ListArchiveItems,
		listStudentAppTeachingMaterials:                       config.ListStudentAppTeachingMaterials,
		listStudentAppArchiveItems:                            config.ListStudentAppArchiveItems,
		readStudentAppArchiveItem:                             config.ReadStudentAppArchiveItem,
		readStudentAppArchiveItemContentPreview:               config.ReadStudentAppArchiveItemContentPreview,
		renderStudentAppArchiveItemContentPreview:             config.RenderStudentAppArchiveItemContentPreview,
		readStudentAppArchiveItemStudyPacket:                  config.ReadStudentAppArchiveItemStudyPacket,
		createStudentAppAITutorRequest:                        config.CreateStudentAppAITutorRequest,
		listStudentAppAITutorRequests:                         config.ListStudentAppAITutorRequests,
		listStudentAppQuizSubmissions:                         config.ListStudentAppQuizSubmissions,
		listStudentAppQuestionBankDrafts:                      config.ListStudentAppQuestionBankDrafts,
		readStudentAppQuestionBankDraftContentUseCase:         config.ReadStudentAppQuestionBankDraftContent,
		submitStudentAppQuestionBankDraftAnswer:               config.SubmitStudentAppQuestionBankDraftAnswer,
		createStudentAppQuestionBankDraftAnswerScoringRequest: config.CreateStudentAppQuestionBankDraftAnswerScoringRequest,
		readStudentAppQuestionBankDraftAnswerScoringResult:    config.ReadStudentAppQuestionBankDraftAnswerScoringResult,
		createQuizSubmission:                                  config.CreateQuizSubmission,
		listQuizSubmissions:                                   config.ListQuizSubmissions,
		createAIGradingRequest:                                config.CreateAIGradingRequest,
		createQuizSubmissionAIGrading:                         config.CreateQuizSubmissionAIGrading,
		listAIGradingRequests:                                 config.ListAIGradingRequests,
		claimAIGradingRequest:                                 config.ClaimAIGradingRequest,
		recordAIGradingResult:                                 config.RecordAIGradingResult,
		readQuestionBankDraftAnswerScoringInput:               config.ReadQuestionBankDraftAnswerScoringInput,
		createTutoringAnalysisRequest:                         config.CreateTutoringAnalysisRequest,
		listTutoringAnalysisRequests:                          config.ListTutoringAnalysisRequests,
		claimTutoringAnalysisRequest:                          config.ClaimTutoringAnalysisRequest,
		recordTutoringAnalysisResult:                          config.RecordTutoringAnalysisResult,
		submitTeachingQuizDraftIntent:                         config.SubmitTeachingQuizDraftIntent,
		submitTeachingArchiveMaterialDraftIntent:              config.SubmitArchiveMaterialDraftIntent,
		createAttendanceSession:                               config.CreateAttendanceSession,
		createAttendanceRecord:                                config.CreateAttendanceRecord,
		signInAttendance:                                      config.SignInAttendance,
		endAttendanceSession:                                  config.EndAttendanceSession,
		selectAttendanceRandomStudents:                        config.SelectAttendanceRandomStudents,
		listAttendanceRecords:                                 config.ListAttendanceRecords,
		listStudentAttendanceRecords:                          config.ListStudentAttendanceRecords,
		getAttendanceStatistics:                               config.GetAttendanceStatistics,
		createScannedQuizSubmission:                           config.CreateScannedQuizSubmission,
		agentAPIKey:                                           config.AgentAPIKey,
		diagnosticsSecret:                                     config.DiagnosticsSecret,
		dbPoolStatsProvider:                                   config.DBPoolStatsProvider,
		commandLogProvider:                                    config.CommandLogProvider,
	}
}

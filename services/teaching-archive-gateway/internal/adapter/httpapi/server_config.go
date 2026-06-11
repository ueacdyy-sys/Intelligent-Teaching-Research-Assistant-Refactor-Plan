package httpapi

import (
	"ita-refactor/services/teaching-archive-gateway/internal/platform"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

type ServerConfig struct {
	CreateArchiveItem                                     *usecase.CreateArchiveItem
	ListArchiveItems                                      *usecase.ListArchiveItems
	ListStudentAppTeachingMaterials                       *usecase.ListStudentAppTeachingMaterials
	ListStudentAppArchiveItems                            *usecase.ListStudentAppArchiveItems
	ReadStudentAppArchiveItemSearchSummary                *usecase.ReadStudentAppArchiveItemSearchSummary
	ReadStudentAppArchiveItem                             *usecase.ReadStudentAppArchiveItem
	ReadStudentAppArchiveItemContentPreview               *usecase.ReadStudentAppArchiveItemContentPreview
	RenderStudentAppArchiveItemContentPreview             *usecase.RenderStudentAppArchiveItemContentPreview
	ReadStudentAppArchiveItemStudyPacket                  *usecase.ReadStudentAppArchiveItemStudyPacket
	ReadStudentAppArchiveItemLearningActions              *usecase.ReadStudentAppArchiveItemLearningActions
	ReadStudentAppAITutorResultArchive                    *usecase.ReadStudentAppAITutorResultArchive
	RenderStudentAppAITutorResultArchive                  *usecase.RenderStudentAppAITutorResultArchive
	ReadStudentAppAITutorResultArchiveLearningActions     *usecase.ReadStudentAppAITutorResultArchiveLearningActions
	CreateStudentAppAITutorRequest                        *usecase.CreateStudentAppAITutorRequest
	ListStudentAppAITutorRequests                         *usecase.ListStudentAppAITutorRequests
	ReadStudentAppAITutorRequestProgress                  *usecase.ReadStudentAppAITutorRequestProgress
	ReadStudentAppAITutorRequestProgressSummary           *usecase.ReadStudentAppAITutorRequestProgressSummary
	ListStudentAppQuizSubmissions                         *usecase.ListStudentAppQuizSubmissions
	ListStudentAppQuestionBankDrafts                      *usecase.ListStudentAppQuestionBankDrafts
	ReadStudentAppQuestionBankDraftSummary                *usecase.ReadStudentAppQuestionBankDraftSummary
	ReadStudentAppQuestionBankDraftContent                *usecase.ReadStudentAppQuestionBankDraftContent
	SubmitStudentAppQuestionBankDraftAnswer               *usecase.SubmitStudentAppQuestionBankDraftAnswer
	CreateStudentAppQuestionBankDraftAnswerScoringRequest *usecase.CreateStudentAppQuestionBankDraftAnswerScoringRequest
	ReadStudentAppQuestionBankDraftAnswerScoringResult    *usecase.ReadStudentAppQuestionBankDraftAnswerScoringResult
	ReadStudentAppQuestionBankDraftAnswerFeedback         *usecase.ReadStudentAppQuestionBankDraftAnswerFeedback
	RenderStudentAppQuestionBankDraftAnswerFeedback       *usecase.RenderStudentAppQuestionBankDraftAnswerFeedback
	CreateQuizSubmission                                  *usecase.CreateQuizSubmission
	ListQuizSubmissions                                   *usecase.ListQuizSubmissions
	CreateAIGradingRequest                                *usecase.CreateAIGradingRequest
	CreateQuizSubmissionAIGrading                         *usecase.CreateQuizSubmissionAIGradingRequest
	ListAIGradingRequests                                 *usecase.ListAIGradingRequests
	ClaimAIGradingRequest                                 *usecase.ClaimAIGradingRequest
	RecordAIGradingResult                                 *usecase.RecordAIGradingResult
	ReadQuestionBankDraftAnswerScoringInput               *usecase.ReadQuestionBankDraftAnswerScoringInput
	CreateTutoringAnalysisRequest                         *usecase.CreateTutoringAnalysisRequest
	ListTutoringAnalysisRequests                          *usecase.ListTutoringAnalysisRequests
	ClaimTutoringAnalysisRequest                          *usecase.ClaimTutoringAnalysisRequest
	ReadAITutorWorkerStudyPacketInput                     *usecase.ReadAITutorWorkerStudyPacketInput
	RecordTutoringAnalysisResult                          *usecase.RecordTutoringAnalysisResult
	SubmitTeachingQuizDraftIntent                         *usecase.SubmitTeachingQuizDraftIntent
	SubmitArchiveMaterialDraftIntent                      *usecase.SubmitTeachingArchiveMaterialDraftIntent
	CreateAttendanceSession                               *usecase.CreateAttendanceSession
	CreateAttendanceRecord                                *usecase.CreateAttendanceRecord
	SignInAttendance                                      *usecase.SignInAttendance
	EndAttendanceSession                                  *usecase.EndAttendanceSession
	SelectAttendanceRandomStudents                        *usecase.SelectAttendanceRandomStudents
	ListAttendanceRecords                                 *usecase.ListAttendanceRecords
	ListStudentAttendanceRecords                          *usecase.ListStudentAttendanceRecords
	GetAttendanceStatistics                               *usecase.GetAttendanceStatistics
	CreateScannedQuizSubmission                           *usecase.CreateScannedQuizSubmission
	AgentAPIKey                                           string
	DiagnosticsSecret                                     string
	DBPoolStatsProvider                                   platform.TeachingArchiveDBPoolStatsProvider
	CommandLogProvider                                    platform.TeachingCommandLogStatsProvider
}

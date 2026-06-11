package httpapi

import "ita-refactor/services/teaching-archive-gateway/internal/domain"

func toStudentAppQuestionBankDraftSummaryOnlyResponse(
	summary domain.StudentAppQuestionBankDraftSummary,
) studentAppQuestionBankDraftSummaryOnlyResponse {
	return studentAppQuestionBankDraftSummaryOnlyResponse{
		Summary: studentAppQuestionBankDraftSummaryResponse{
			TotalCount:    summary.TotalCount,
			QuizCount:     summary.QuizCount,
			PaperCount:    summary.PaperCount,
			HandoutCount:  summary.HandoutCount,
			HomeworkCount: summary.HomeworkCount,
		},
	}
}

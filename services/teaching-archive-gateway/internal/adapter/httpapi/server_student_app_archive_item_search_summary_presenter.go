package httpapi

import "ita-refactor/services/teaching-archive-gateway/internal/domain"

func toStudentAppArchiveItemSearchSummaryOnlyResponse(
	summary domain.StudentAppArchiveItemSearchSummary,
) studentAppArchiveItemSearchSummaryOnlyResponse {
	return studentAppArchiveItemSearchSummaryOnlyResponse{
		Summary: studentAppArchiveItemSearchSummaryResponse{
			TotalCount:    summary.TotalCount,
			QuizCount:     summary.QuizCount,
			PaperCount:    summary.PaperCount,
			HandoutCount:  summary.HandoutCount,
			HomeworkCount: summary.HomeworkCount,
		},
	}
}

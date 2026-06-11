package httpapi

import (
	"crypto/sha256"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func studentAppArchiveItemSearchSummaryETag(
	summary domain.StudentAppArchiveItemSearchSummary,
) string {
	h := sha256.New()
	writeETagField(h, "student-app-archive-item-search-summary/v1")
	writeETagInt(h, summary.TotalCount)
	writeETagInt(h, summary.QuizCount)
	writeETagInt(h, summary.PaperCount)
	writeETagInt(h, summary.HandoutCount)
	writeETagInt(h, summary.HomeworkCount)
	return etagFromHash(h.Sum(nil))
}

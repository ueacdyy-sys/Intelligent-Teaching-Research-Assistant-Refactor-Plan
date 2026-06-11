package httpapi_test

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func (f *fakeRepository) CountQuestionBankDraftsBySourceMaterial(
	_ context.Context,
	query domain.TutoringAnalysisRequestQuery,
) (map[domain.MaterialType]int, error) {
	counts := map[domain.MaterialType]int{}
	for _, request := range f.requests {
		if query.ID != "" && request.ID != query.ID {
			continue
		}
		if query.Status != "" && request.Status != query.Status {
			continue
		}
		if len(query.Statuses) > 0 && !containsTutoringAnalysisStatus(query.Statuses, request.Status) {
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
		counts[request.SourceArchiveMaterial]++
	}
	return counts, nil
}

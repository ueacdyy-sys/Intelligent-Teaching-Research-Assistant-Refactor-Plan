package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type QuizSubmissionReader interface {
	GetByID(ctx context.Context, id string) (domain.ArchiveItem, bool, error)
	ListQuizSubmissions(ctx context.Context, query domain.QuizSubmissionQuery) ([]domain.QuizSubmission, error)
}

type ListQuizSubmissions struct {
	reader QuizSubmissionReader
}

func NewListQuizSubmissions(reader QuizSubmissionReader) *ListQuizSubmissions {
	return &ListQuizSubmissions{reader: reader}
}

func (uc *ListQuizSubmissions) Execute(
	ctx context.Context,
	input domain.ListQuizSubmissionsInput,
) (domain.QuizSubmissionPage, error) {
	query, err := domain.NormalizeListQuizSubmissionsInput(input)
	if err != nil {
		return domain.QuizSubmissionPage{}, err
	}

	item, ok, err := uc.reader.GetByID(ctx, query.QuizArchiveItemID)
	if err != nil {
		return domain.QuizSubmissionPage{}, err
	}
	if !ok {
		return domain.QuizSubmissionPage{}, domain.ErrNotFound
	}

	scopedQuery, err := domain.ScopeListQuizSubmissions(input.Principal, item, query)
	if err != nil {
		return domain.QuizSubmissionPage{}, err
	}
	submissions, err := uc.reader.ListQuizSubmissions(ctx, scopedQuery)
	if err != nil {
		return domain.QuizSubmissionPage{}, err
	}
	return domain.BuildQuizSubmissionPage(submissions, scopedQuery.PageSize)
}

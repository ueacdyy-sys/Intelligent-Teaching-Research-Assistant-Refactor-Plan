package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type StudentAppQuizSubmissionReader interface {
	ListQuizSubmissions(ctx context.Context, query domain.QuizSubmissionQuery) ([]domain.QuizSubmission, error)
}

type ListStudentAppQuizSubmissions struct {
	reader StudentAppQuizSubmissionReader
}

func NewListStudentAppQuizSubmissions(reader StudentAppQuizSubmissionReader) *ListStudentAppQuizSubmissions {
	return &ListStudentAppQuizSubmissions{reader: reader}
}

func (uc *ListStudentAppQuizSubmissions) Execute(
	ctx context.Context,
	input domain.ListStudentAppQuizSubmissionsInput,
) (domain.QuizSubmissionPage, error) {
	query, err := domain.NormalizeListStudentAppQuizSubmissionsInput(input)
	if err != nil {
		return domain.QuizSubmissionPage{}, err
	}
	submissions, err := uc.reader.ListQuizSubmissions(ctx, query)
	if err != nil {
		return domain.QuizSubmissionPage{}, err
	}
	return domain.BuildQuizSubmissionPage(submissions, query.PageSize)
}

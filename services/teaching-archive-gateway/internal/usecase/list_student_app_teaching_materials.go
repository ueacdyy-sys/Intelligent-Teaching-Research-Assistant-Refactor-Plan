package usecase

import (
	"context"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

type ListStudentAppTeachingMaterials struct {
	reader ArchiveReader
}

func NewListStudentAppTeachingMaterials(reader ArchiveReader) *ListStudentAppTeachingMaterials {
	return &ListStudentAppTeachingMaterials{reader: reader}
}

func (uc *ListStudentAppTeachingMaterials) Execute(
	ctx context.Context,
	input domain.ListStudentAppTeachingMaterialsInput,
) (domain.ArchiveItemPage, error) {
	query, err := domain.NormalizeListStudentAppTeachingMaterialsInput(input)
	if err != nil {
		return domain.ArchiveItemPage{}, err
	}
	items, err := uc.reader.List(ctx, query)
	if err != nil {
		return domain.ArchiveItemPage{}, err
	}
	return domain.BuildArchiveItemPage(items, query.PageSize)
}

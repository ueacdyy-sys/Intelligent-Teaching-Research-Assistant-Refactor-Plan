package usecase

import (
	"context"

	"ita-refactor/services/identity-access-gateway/internal/domain"
)

func (s *IdentityService) GetStudentAppProfile(
	ctx context.Context,
	accessToken string,
) (domain.StudentAppProfile, error) {
	principal, err := s.GetPrincipal(ctx, accessToken)
	if err != nil {
		return domain.StudentAppProfile{}, err
	}
	return domain.NewStudentAppProfile(principal)
}

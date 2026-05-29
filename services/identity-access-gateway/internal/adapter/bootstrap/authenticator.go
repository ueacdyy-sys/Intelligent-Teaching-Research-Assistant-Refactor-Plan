package bootstrap

import (
	"context"
	"strings"

	"ita-refactor/services/identity-access-gateway/internal/domain"
)

type Authenticator struct {
	Password string
}

func (a Authenticator) AuthenticatePassword(_ context.Context, input domain.PasswordSessionInput) (domain.Account, error) {
	if input.Password != a.Password {
		return domain.Account{}, domain.ErrInvalidCredentials
	}

	switch {
	case input.RequestedRole == domain.RoleStudent || strings.Contains(strings.ToLower(input.Identifier), "student"):
		return domain.Account{ID: "user_student_bootstrap", Role: domain.RoleStudent, DisplayName: "Student"}, nil
	case input.RequestedRole == domain.RoleAdmin:
		return domain.Account{ID: "user_admin_bootstrap", Role: domain.RoleAdmin, DisplayName: "Admin"}, nil
	default:
		return domain.Account{ID: "user_teacher_bootstrap", Role: domain.RoleTeacher, DisplayName: "Teacher"}, nil
	}
}

package domain_test

import (
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNormalizeListStudentAppTeachingMaterialsForcesTeachingMaterialQuery(t *testing.T) {
	query, err := domain.NormalizeListStudentAppTeachingMaterialsInput(domain.ListStudentAppTeachingMaterialsInput{
		Principal: studentPrincipal("student_001"),
		PageSize:  2,
	})
	if err != nil {
		t.Fatalf("NormalizeListStudentAppTeachingMaterialsInput returned error: %v", err)
	}
	if query.OwnerType != domain.OwnerTypeTeaching {
		t.Fatalf("OwnerType = %q", query.OwnerType)
	}
	if query.MaterialType != domain.MaterialTypeTeachingMaterial {
		t.Fatalf("MaterialType = %q", query.MaterialType)
	}
	if query.StudentID != "" || len(query.StudentIDs) != 0 {
		t.Fatalf("student scope leaked into teaching material query: %#v", query)
	}
	if query.FetchLimit != 3 {
		t.Fatalf("FetchLimit = %d, want 3", query.FetchLimit)
	}
}

func TestNormalizeListStudentAppTeachingMaterialsRejectsNonStudentAppPrincipals(t *testing.T) {
	studentWithoutTeachingRead := studentPrincipal("student_001")
	studentWithoutTeachingRead.Scopes = []domain.Scope{domain.ScopeStudentOwnRead}

	for name, principal := range map[string]domain.PrincipalContext{
		"teacher desktop":       teacherPrincipal(),
		"remote social":         remoteSocialPrincipal(),
		"service":               servicePrincipal(),
		"missing teaching read": studentWithoutTeachingRead,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := domain.NormalizeListStudentAppTeachingMaterialsInput(domain.ListStudentAppTeachingMaterialsInput{
				Principal: principal,
				PageSize:  10,
			})
			if !errors.Is(err, domain.ErrForbidden) {
				t.Fatalf("error = %v, want ErrForbidden", err)
			}
		})
	}
}

func remoteSocialPrincipal() domain.PrincipalContext {
	return domain.PrincipalContext{
		PrincipalID:     "remote:WECHAT:openid",
		SubjectType:     domain.SubjectRemoteChannel,
		Role:            domain.RoleRemoteOperator,
		EntryPoint:      domain.EntryPointRemoteSocial,
		Scopes:          []domain.Scope{domain.ScopeAgentCommandSubmit},
		KnowledgeAccess: domain.KnowledgeAccess{Private: domain.PrivateAccessNone},
		StudentAccess:   domain.StudentAccess{Mode: domain.StudentAccessNone},
		SessionID:       "grant_remote",
		IssuedAt:        time.Now().Add(-time.Minute).UTC(),
		ExpiresAt:       time.Now().Add(time.Hour).UTC(),
	}
}

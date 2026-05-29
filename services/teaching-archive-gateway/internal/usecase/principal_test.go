package usecase_test

import (
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func teacherPrincipal() domain.PrincipalContext {
	return domain.PrincipalContext{
		PrincipalID: "teacher_001",
		SubjectType: domain.SubjectUser,
		Role:        domain.RoleTeacher,
		EntryPoint:  domain.EntryPointDesktopTeacher,
		Scopes: []domain.Scope{
			domain.ScopeTeachingRead,
			domain.ScopeTeachingWrite,
			domain.ScopeStudentAssignedRead,
			domain.ScopeStudentArchiveWrite,
		},
		KnowledgeAccess: domain.KnowledgeAccess{Public: true, Private: domain.PrivateAccessAssigned},
		StudentAccess:   domain.StudentAccess{Mode: domain.StudentAccessAssigned},
		SessionID:       "sess_teacher",
		IssuedAt:        time.Now().Add(-time.Minute).UTC(),
		ExpiresAt:       time.Now().Add(time.Hour).UTC(),
	}
}

func teacherPrincipalWithStudents(studentIDs ...string) domain.PrincipalContext {
	principal := teacherPrincipal()
	principal.StudentAccess.StudentIDs = append([]string(nil), studentIDs...)
	return principal
}

func adminPrincipal() domain.PrincipalContext {
	return domain.PrincipalContext{
		PrincipalID: "admin_001",
		SubjectType: domain.SubjectUser,
		Role:        domain.RoleAdmin,
		EntryPoint:  domain.EntryPointDesktopTeacher,
		Scopes: []domain.Scope{
			domain.ScopeTeachingRead,
			domain.ScopeTeachingWrite,
			domain.ScopeStudentAssignedRead,
			domain.ScopeStudentArchiveWrite,
		},
		KnowledgeAccess: domain.KnowledgeAccess{Public: true, Private: domain.PrivateAccessAll},
		StudentAccess:   domain.StudentAccess{Mode: domain.StudentAccessAll},
		SessionID:       "sess_admin",
		IssuedAt:        time.Now().Add(-time.Minute).UTC(),
		ExpiresAt:       time.Now().Add(time.Hour).UTC(),
	}
}

func studentPrincipal(studentID string) domain.PrincipalContext {
	return domain.PrincipalContext{
		PrincipalID: studentID,
		SubjectType: domain.SubjectUser,
		Role:        domain.RoleStudent,
		EntryPoint:  domain.EntryPointStudentApp,
		Scopes: []domain.Scope{
			domain.ScopeTeachingRead,
			domain.ScopeStudentOwnRead,
			domain.ScopeStudentOwnWrite,
		},
		KnowledgeAccess: domain.KnowledgeAccess{Public: true, Private: domain.PrivateAccessNone},
		StudentAccess: domain.StudentAccess{
			Mode:       domain.StudentAccessOwn,
			StudentIDs: []string{studentID},
		},
		SessionID: "sess_student",
		IssuedAt:  time.Now().Add(-time.Minute).UTC(),
		ExpiresAt: time.Now().Add(time.Hour).UTC(),
	}
}

func remotePrincipal() domain.PrincipalContext {
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

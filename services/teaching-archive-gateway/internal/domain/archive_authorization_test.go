package domain_test

import (
	"errors"
	"reflect"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestAuthorizeCreateArchiveItemAllowsTeacherAssignedStudentArchiveWrite(t *testing.T) {
	err := domain.AuthorizeCreateArchiveItem(teacherPrincipal(), domain.CreateArchiveItemInput{
		OwnerType:    domain.OwnerTypeStudent,
		StudentID:    "student_001",
		MaterialType: domain.MaterialTypeQuiz,
	})

	if err != nil {
		t.Fatalf("AuthorizeCreateArchiveItem returned error: %v", err)
	}
}

func TestAuthorizeCreateArchiveItemAllowsStudentOwnArchiveWriteOnlyForSelf(t *testing.T) {
	own := studentPrincipal("student_001")
	err := domain.AuthorizeCreateArchiveItem(own, domain.CreateArchiveItemInput{
		OwnerType:    domain.OwnerTypeStudent,
		StudentID:    "student_001",
		MaterialType: domain.MaterialTypeHomework,
	})
	if err != nil {
		t.Fatalf("own archive write error: %v", err)
	}

	err = domain.AuthorizeCreateArchiveItem(own, domain.CreateArchiveItemInput{
		OwnerType:    domain.OwnerTypeStudent,
		StudentID:    "student_002",
		MaterialType: domain.MaterialTypeHomework,
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("other student write error = %v, want ErrForbidden", err)
	}
}

func TestAuthorizeArchiveRejectsRemoteSocialPrincipal(t *testing.T) {
	remote := domain.PrincipalContext{
		PrincipalID:     "remote:WECHAT:openid",
		SubjectType:     domain.SubjectRemoteChannel,
		Role:            domain.RoleRemoteOperator,
		EntryPoint:      domain.EntryPointRemoteSocial,
		Scopes:          []domain.Scope{domain.ScopeAgentCommandSubmit},
		KnowledgeAccess: domain.KnowledgeAccess{Private: domain.PrivateAccessNone},
		StudentAccess: domain.StudentAccess{
			Mode: domain.StudentAccessNone,
		},
		RequiresHarnessApproval: true,
		SessionID:               "grant_remote",
		IssuedAt:                time.Now().Add(-time.Minute).UTC(),
		ExpiresAt:               time.Now().Add(time.Hour).UTC(),
	}

	createErr := domain.AuthorizeCreateArchiveItem(remote, domain.CreateArchiveItemInput{
		OwnerType:    domain.OwnerTypeTeaching,
		MaterialType: domain.MaterialTypeTeachingMaterial,
	})
	if !errors.Is(createErr, domain.ErrForbidden) {
		t.Fatalf("remote create error = %v, want ErrForbidden", createErr)
	}

	listErr := domain.AuthorizeListArchiveItems(remote, domain.ArchiveItemQuery{OwnerType: domain.OwnerTypeTeaching})
	if !errors.Is(listErr, domain.ErrForbidden) {
		t.Fatalf("remote list error = %v, want ErrForbidden", listErr)
	}
}

func TestAuthorizeListArchiveItemsPreventsStudentReadingOtherArchive(t *testing.T) {
	err := domain.AuthorizeListArchiveItems(studentPrincipal("student_001"), domain.ArchiveItemQuery{
		OwnerType: domain.OwnerTypeStudent,
		StudentID: "student_002",
	})

	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func TestScopeListArchiveItemsConstrainsStudentOwnArchiveQuery(t *testing.T) {
	query, err := domain.ScopeListArchiveItems(studentPrincipal("student_001"), domain.ArchiveItemQuery{
		OwnerType: domain.OwnerTypeStudent,
		PageSize:  50,
	})
	if err != nil {
		t.Fatalf("ScopeListArchiveItems returned error: %v", err)
	}
	if query.StudentID != "student_001" {
		t.Fatalf("StudentID = %q, want student_001", query.StudentID)
	}
}

func TestScopeListArchiveItemsConstrainsAssignedStudentIDs(t *testing.T) {
	principal := teacherPrincipal()
	principal.StudentAccess.StudentIDs = []string{"student_001", "student_002"}

	query, err := domain.ScopeListArchiveItems(principal, domain.ArchiveItemQuery{
		OwnerType: domain.OwnerTypeStudent,
		PageSize:  50,
	})
	if err != nil {
		t.Fatalf("ScopeListArchiveItems returned error: %v", err)
	}
	if !reflect.DeepEqual(query.StudentIDs, []string{"student_001", "student_002"}) {
		t.Fatalf("StudentIDs = %#v", query.StudentIDs)
	}
}

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

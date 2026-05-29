package domain

import (
	"errors"
	"strings"
	"time"
)

var (
	ErrForbidden       = errors.New("principal is not allowed for archive item")
	ErrUnauthenticated = errors.New("principal context is required")
)

type SubjectType string

const (
	SubjectUser          SubjectType = "USER"
	SubjectRemoteChannel SubjectType = "REMOTE_CHANNEL"
	SubjectService       SubjectType = "SERVICE"
)

type Role string

const (
	RoleTeacher        Role = "TEACHER"
	RoleStudent        Role = "STUDENT"
	RoleAdmin          Role = "ADMIN"
	RoleRemoteOperator Role = "REMOTE_OPERATOR"
	RoleService        Role = "SERVICE"
)

type EntryPoint string

const (
	EntryPointDesktopTeacher  EntryPoint = "DESKTOP_TEACHER"
	EntryPointDesktopResearch EntryPoint = "DESKTOP_RESEARCH"
	EntryPointStudentApp      EntryPoint = "STUDENT_APP"
	EntryPointRemoteSocial    EntryPoint = "REMOTE_SOCIAL"
	EntryPointAgentInternal   EntryPoint = "AGENT_INTERNAL"
)

type Scope string

const (
	ScopeIdentityRead         Scope = "IDENTITY_READ"
	ScopeTeachingRead         Scope = "TEACHING_READ"
	ScopeTeachingWrite        Scope = "TEACHING_WRITE"
	ScopeResearchRead         Scope = "RESEARCH_READ"
	ScopeResearchWrite        Scope = "RESEARCH_WRITE"
	ScopeStudentOwnRead       Scope = "STUDENT_OWN_READ"
	ScopeStudentOwnWrite      Scope = "STUDENT_OWN_WRITE"
	ScopeStudentAssignedRead  Scope = "STUDENT_ASSIGNED_READ"
	ScopeStudentArchiveWrite  Scope = "STUDENT_ARCHIVE_WRITE"
	ScopeKnowledgePublicRead  Scope = "KNOWLEDGE_PUBLIC_READ"
	ScopeKnowledgePrivateRead Scope = "KNOWLEDGE_PRIVATE_READ"
	ScopeAgentCommandSubmit   Scope = "AGENT_COMMAND_SUBMIT"
	ScopeHarnessApprove       Scope = "HARNESS_APPROVE"
	ScopeDeviceLocalControl   Scope = "DEVICE_LOCAL_CONTROL"
	ScopeAdminSystem          Scope = "ADMIN_SYSTEM"
)

type PrivateKnowledgeAccess string

const (
	PrivateAccessNone     PrivateKnowledgeAccess = "NONE"
	PrivateAccessOwn      PrivateKnowledgeAccess = "OWN"
	PrivateAccessAssigned PrivateKnowledgeAccess = "ASSIGNED"
	PrivateAccessAll      PrivateKnowledgeAccess = "ALL"
)

type StudentAccessMode string

const (
	StudentAccessNone     StudentAccessMode = "NONE"
	StudentAccessOwn      StudentAccessMode = "OWN"
	StudentAccessAssigned StudentAccessMode = "ASSIGNED"
	StudentAccessAll      StudentAccessMode = "ALL"
)

type ChannelProvider string

const (
	ChannelProviderWeChat       ChannelProvider = "WECHAT"
	ChannelProviderQQ           ChannelProvider = "QQ"
	ChannelProviderTelegram     ChannelProvider = "TELEGRAM"
	ChannelProviderLocalPairing ChannelProvider = "LOCAL_PAIRING"
	ChannelProviderOther        ChannelProvider = "OTHER"
)

type PrincipalContext struct {
	PrincipalID             string          `json:"principalId"`
	SubjectType             SubjectType     `json:"subjectType,omitempty"`
	Role                    Role            `json:"role"`
	EntryPoint              EntryPoint      `json:"entryPoint"`
	DisplayName             string          `json:"displayName,omitempty"`
	Scopes                  []Scope         `json:"scopes"`
	KnowledgeAccess         KnowledgeAccess `json:"knowledgeAccess,omitempty"`
	StudentAccess           StudentAccess   `json:"studentAccess"`
	Channel                 *ChannelContext `json:"channel,omitempty"`
	RequiresHarnessApproval bool            `json:"requiresHarnessApproval"`
	SessionID               string          `json:"sessionId,omitempty"`
	IssuedAt                time.Time       `json:"issuedAt,omitempty"`
	ExpiresAt               time.Time       `json:"expiresAt"`
}

type KnowledgeAccess struct {
	Public  bool                   `json:"public"`
	Private PrivateKnowledgeAccess `json:"private"`
}

type StudentAccess struct {
	Mode       StudentAccessMode `json:"mode"`
	StudentIDs []string          `json:"studentIds,omitempty"`
}

type ChannelContext struct {
	Provider          ChannelProvider `json:"provider"`
	ExternalSubjectID string          `json:"externalSubjectId"`
	DeviceName        string          `json:"deviceName,omitempty"`
}

func ValidatePrincipalContext(principal PrincipalContext) error {
	if strings.TrimSpace(principal.PrincipalID) == "" ||
		strings.TrimSpace(principal.SessionID) == "" ||
		!validSubjectType(principal.SubjectType) ||
		!validRole(principal.Role) ||
		!validEntryPoint(principal.EntryPoint) ||
		!validStudentAccessMode(principal.StudentAccess.Mode) ||
		!validPrivateKnowledgeAccess(principal.KnowledgeAccess.Private) ||
		len(principal.Scopes) == 0 ||
		hasInvalidScope(principal.Scopes) ||
		principal.IssuedAt.IsZero() ||
		principal.ExpiresAt.IsZero() ||
		!principal.IssuedAt.Before(principal.ExpiresAt) ||
		!time.Now().UTC().Before(principal.ExpiresAt.UTC()) {
		return ErrUnauthenticated
	}
	return nil
}

func AuthorizeCreateArchiveItem(principal PrincipalContext, input CreateArchiveItemInput) error {
	if err := ValidatePrincipalContext(principal); err != nil {
		return err
	}

	switch input.OwnerType {
	case OwnerTypeTeaching:
		if hasScope(principal, ScopeTeachingWrite) {
			return nil
		}
	case OwnerTypeStudent:
		studentID := strings.TrimSpace(input.StudentID)
		if canWriteAssignedStudentArchive(principal, studentID) || canWriteOwnStudentArchive(principal, studentID) {
			return nil
		}
	}
	return ErrForbidden
}

func AuthorizeListArchiveItems(principal PrincipalContext, query ArchiveItemQuery) error {
	_, err := ScopeListArchiveItems(principal, query)
	return err
}

func AuthorizeReadArchiveItem(principal PrincipalContext, item ArchiveItem) error {
	switch item.OwnerType {
	case OwnerTypeTeaching:
		return AuthorizeListArchiveItems(principal, ArchiveItemQuery{OwnerType: OwnerTypeTeaching})
	case OwnerTypeStudent:
		return AuthorizeListArchiveItems(principal, ArchiveItemQuery{
			OwnerType: OwnerTypeStudent,
			StudentID: item.StudentID,
		})
	default:
		return ErrForbidden
	}
}

func ScopeListArchiveItems(principal PrincipalContext, query ArchiveItemQuery) (ArchiveItemQuery, error) {
	if err := ValidatePrincipalContext(principal); err != nil {
		return ArchiveItemQuery{}, err
	}

	if query.OwnerType == OwnerTypeTeaching {
		if err := requireScope(principal, ScopeTeachingRead); err != nil {
			return ArchiveItemQuery{}, err
		}
		return query, nil
	}
	if query.OwnerType == OwnerTypeStudent || query.StudentID != "" {
		return scopeStudentArchiveQuery(principal, query)
	}
	if hasScope(principal, ScopeTeachingRead) && canReadAssignedStudentArchive(principal, "") {
		return query, nil
	}
	return ArchiveItemQuery{}, ErrForbidden
}

func scopeStudentArchiveQuery(principal PrincipalContext, query ArchiveItemQuery) (ArchiveItemQuery, error) {
	scoped := query
	scoped.OwnerType = OwnerTypeStudent

	if hasScope(principal, ScopeStudentOwnRead) && principal.StudentAccess.Mode == StudentAccessOwn {
		studentID := primaryOwnStudentID(principal)
		if studentID == "" {
			return ArchiveItemQuery{}, ErrForbidden
		}
		if query.StudentID != "" && !ownsStudent(principal, query.StudentID) {
			return ArchiveItemQuery{}, ErrForbidden
		}
		scoped.StudentID = studentID
		scoped.StudentIDs = nil
		return scoped, nil
	}

	if hasScope(principal, ScopeStudentAssignedRead) && principal.StudentAccess.Mode == StudentAccessAll {
		return scoped, nil
	}

	if hasScope(principal, ScopeStudentAssignedRead) && principal.StudentAccess.Mode == StudentAccessAssigned {
		studentIDs := normalizedStudentIDs(principal.StudentAccess.StudentIDs)
		if len(studentIDs) == 0 {
			return scoped, nil
		}
		if query.StudentID != "" {
			if hasStudentID(studentIDs, query.StudentID) {
				return scoped, nil
			}
			return ArchiveItemQuery{}, ErrForbidden
		}
		scoped.StudentIDs = studentIDs
		return scoped, nil
	}
	return ArchiveItemQuery{}, ErrForbidden
}

func requireScope(principal PrincipalContext, scope Scope) error {
	if hasScope(principal, scope) {
		return nil
	}
	return ErrForbidden
}

func canWriteAssignedStudentArchive(principal PrincipalContext, studentID string) bool {
	return hasScope(principal, ScopeStudentArchiveWrite) && hasAssignedStudentAccess(principal, studentID)
}

func canWriteOwnStudentArchive(principal PrincipalContext, studentID string) bool {
	return hasScope(principal, ScopeStudentOwnWrite) && ownsStudent(principal, studentID)
}

func canReadAssignedStudentArchive(principal PrincipalContext, studentID string) bool {
	return hasScope(principal, ScopeStudentAssignedRead) && hasAssignedStudentAccess(principal, studentID)
}

func canReadOwnStudentArchive(principal PrincipalContext, studentID string) bool {
	return hasScope(principal, ScopeStudentOwnRead) && ownsStudent(principal, studentID)
}

func hasAssignedStudentAccess(principal PrincipalContext, studentID string) bool {
	switch principal.StudentAccess.Mode {
	case StudentAccessAll:
		return true
	case StudentAccessAssigned:
		return studentID == "" || len(principal.StudentAccess.StudentIDs) == 0 || hasStudentID(principal.StudentAccess.StudentIDs, studentID)
	default:
		return false
	}
}

func ownsStudent(principal PrincipalContext, studentID string) bool {
	studentID = strings.TrimSpace(studentID)
	if studentID == "" || principal.StudentAccess.Mode != StudentAccessOwn {
		return false
	}
	if strings.TrimSpace(principal.PrincipalID) == studentID {
		return true
	}
	return hasStudentID(principal.StudentAccess.StudentIDs, studentID)
}

func hasScope(principal PrincipalContext, scope Scope) bool {
	for _, candidate := range principal.Scopes {
		if candidate == scope {
			return true
		}
	}
	return false
}

func hasStudentID(studentIDs []string, studentID string) bool {
	for _, candidate := range studentIDs {
		if strings.TrimSpace(candidate) == studentID {
			return true
		}
	}
	return false
}

func primaryOwnStudentID(principal PrincipalContext) string {
	for _, studentID := range principal.StudentAccess.StudentIDs {
		studentID = strings.TrimSpace(studentID)
		if studentID != "" {
			return studentID
		}
	}
	return strings.TrimSpace(principal.PrincipalID)
}

func normalizedStudentIDs(studentIDs []string) []string {
	normalized := make([]string, 0, len(studentIDs))
	seen := map[string]struct{}{}
	for _, studentID := range studentIDs {
		studentID = strings.TrimSpace(studentID)
		if studentID == "" {
			continue
		}
		if _, ok := seen[studentID]; ok {
			continue
		}
		seen[studentID] = struct{}{}
		normalized = append(normalized, studentID)
	}
	return normalized
}

func validSubjectType(value SubjectType) bool {
	switch value {
	case SubjectUser, SubjectRemoteChannel, SubjectService:
		return true
	default:
		return false
	}
}

func validRole(value Role) bool {
	switch value {
	case RoleTeacher, RoleStudent, RoleAdmin, RoleRemoteOperator, RoleService:
		return true
	default:
		return false
	}
}

func validEntryPoint(value EntryPoint) bool {
	switch value {
	case EntryPointDesktopTeacher, EntryPointDesktopResearch, EntryPointStudentApp, EntryPointRemoteSocial, EntryPointAgentInternal:
		return true
	default:
		return false
	}
}

func validStudentAccessMode(value StudentAccessMode) bool {
	switch value {
	case StudentAccessNone, StudentAccessOwn, StudentAccessAssigned, StudentAccessAll:
		return true
	default:
		return false
	}
}

func validPrivateKnowledgeAccess(value PrivateKnowledgeAccess) bool {
	switch value {
	case PrivateAccessNone, PrivateAccessOwn, PrivateAccessAssigned, PrivateAccessAll:
		return true
	default:
		return false
	}
}

func hasInvalidScope(scopes []Scope) bool {
	for _, scope := range scopes {
		if !validScope(scope) {
			return true
		}
	}
	return false
}

func validScope(value Scope) bool {
	switch value {
	case ScopeIdentityRead,
		ScopeTeachingRead,
		ScopeTeachingWrite,
		ScopeResearchRead,
		ScopeResearchWrite,
		ScopeStudentOwnRead,
		ScopeStudentOwnWrite,
		ScopeStudentAssignedRead,
		ScopeStudentArchiveWrite,
		ScopeKnowledgePublicRead,
		ScopeKnowledgePrivateRead,
		ScopeAgentCommandSubmit,
		ScopeHarnessApprove,
		ScopeDeviceLocalControl,
		ScopeAdminSystem:
		return true
	default:
		return false
	}
}

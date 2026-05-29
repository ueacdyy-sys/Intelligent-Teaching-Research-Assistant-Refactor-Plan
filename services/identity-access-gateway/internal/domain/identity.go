package domain

import (
	"errors"
	"strings"
	"time"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidSession     = errors.New("invalid or expired session")
	ErrForbidden          = errors.New("principal is not allowed for this entry point")
	ErrValidation         = errors.New("invalid identity request")
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

type Account struct {
	ID          string
	Role        Role
	DisplayName string
}

type PasswordSessionInput struct {
	Identifier    string
	Password      string
	RequestedRole Role
	EntryPoint    EntryPoint
}

type WeChatSessionStartInput struct {
	RequestedRole Role
	EntryPoint    EntryPoint
	RedirectURI   string
}

type WeChatSessionCallbackInput struct {
	State string
	Code  string
}

type WeChatLoginChallenge struct {
	State     string
	AuthURL   string
	ExpiresAt time.Time
}

type RefreshSessionInput struct {
	RefreshToken string
}

type RevokeSessionInput struct {
	AccessToken string
	SessionID   string
}

type RemoteCommandGrantInput struct {
	Provider          ChannelProvider
	ExternalSubjectID string
	CommandPreview    string
	Nonce             string
	IssuedAt          time.Time
}

func NormalizeRefreshSessionInput(input RefreshSessionInput) (RefreshSessionInput, error) {
	input.RefreshToken = strings.TrimSpace(input.RefreshToken)
	if input.RefreshToken == "" {
		return RefreshSessionInput{}, ErrValidation
	}
	return input, nil
}

func NormalizeWeChatSessionStartInput(input WeChatSessionStartInput) (WeChatSessionStartInput, error) {
	input.RedirectURI = strings.TrimSpace(input.RedirectURI)
	if input.RequestedRole == "" {
		input.RequestedRole = RoleTeacher
	}
	if input.RequestedRole != RoleTeacher && input.RequestedRole != RoleAdmin {
		return WeChatSessionStartInput{}, ErrValidation
	}
	if input.EntryPoint != EntryPointDesktopTeacher && input.EntryPoint != EntryPointDesktopResearch {
		return WeChatSessionStartInput{}, ErrValidation
	}
	return input, nil
}

func NormalizeWeChatSessionCallbackInput(input WeChatSessionCallbackInput) (WeChatSessionCallbackInput, error) {
	input.State = strings.TrimSpace(input.State)
	input.Code = strings.TrimSpace(input.Code)
	if len(input.State) < 8 || input.Code == "" {
		return WeChatSessionCallbackInput{}, ErrValidation
	}
	return input, nil
}

func NormalizeRevokeSessionInput(input RevokeSessionInput) (RevokeSessionInput, error) {
	input.AccessToken = strings.TrimSpace(input.AccessToken)
	input.SessionID = strings.TrimSpace(input.SessionID)
	if input.AccessToken == "" || input.SessionID == "" {
		return RevokeSessionInput{}, ErrValidation
	}
	return input, nil
}

type PrincipalContext struct {
	PrincipalID             string
	SubjectType             SubjectType
	Role                    Role
	EntryPoint              EntryPoint
	DisplayName             string
	Scopes                  []Scope
	KnowledgeAccess         KnowledgeAccess
	StudentAccess           StudentAccess
	Channel                 *ChannelContext
	RequiresHarnessApproval bool
	SessionID               string
	IssuedAt                time.Time
	ExpiresAt               time.Time
}

type KnowledgeAccess struct {
	Public  bool
	Private PrivateKnowledgeAccess
}

type StudentAccess struct {
	Mode       StudentAccessMode
	StudentIDs []string
}

type ChannelContext struct {
	Provider          ChannelProvider
	ExternalSubjectID string
	DeviceName        string
}

type Session struct {
	AccessToken  string
	RefreshToken string
	TokenType    string
	ExpiresIn    int
	Principal    PrincipalContext
}

type RemoteCommandGrant struct {
	GrantToken string
	ExpiresAt  time.Time
	Principal  PrincipalContext
}

func NormalizePasswordSessionInput(input PasswordSessionInput) (PasswordSessionInput, error) {
	input.Identifier = strings.TrimSpace(input.Identifier)
	input.Password = strings.TrimSpace(input.Password)
	if input.Identifier == "" || input.Password == "" {
		return PasswordSessionInput{}, ErrValidation
	}
	if input.EntryPoint == "" {
		return PasswordSessionInput{}, ErrValidation
	}
	return input, nil
}

func NormalizeRemoteCommandGrantInput(input RemoteCommandGrantInput) (RemoteCommandGrantInput, error) {
	input.ExternalSubjectID = strings.TrimSpace(input.ExternalSubjectID)
	input.CommandPreview = strings.TrimSpace(input.CommandPreview)
	input.Nonce = strings.TrimSpace(input.Nonce)
	if input.Provider == "" || input.ExternalSubjectID == "" || input.CommandPreview == "" || len(input.Nonce) < 8 || input.IssuedAt.IsZero() {
		return RemoteCommandGrantInput{}, ErrValidation
	}
	return input, nil
}

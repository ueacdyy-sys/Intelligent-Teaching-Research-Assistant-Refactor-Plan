package domain_test

import (
	"errors"
	"testing"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestNormalizeCreateStudentAppAITutorRequestDefaultsPersonalizedQuestionBank(t *testing.T) {
	normalized, err := domain.NormalizeCreateStudentAppAITutorRequestInput(domain.CreateStudentAppAITutorRequestInput{
		Principal:            studentPrincipal("student_001"),
		StudentArchiveItemID: " tarch_student_quiz ",
		AnalysisGoal:         "  explain weak algebra skills  ",
	})
	if err != nil {
		t.Fatalf("NormalizeCreateStudentAppAITutorRequestInput returned error: %v", err)
	}
	if normalized.ArchiveItemID != "tarch_student_quiz" {
		t.Fatalf("ArchiveItemID = %q", normalized.ArchiveItemID)
	}
	if normalized.AnalysisGoal != "explain weak algebra skills" {
		t.Fatalf("AnalysisGoal = %q", normalized.AnalysisGoal)
	}
	if normalized.QuestionBankIntent != domain.QuestionBankIntentGeneratePersonalizedCheck {
		t.Fatalf("QuestionBankIntent = %q", normalized.QuestionBankIntent)
	}
}

func TestNormalizeCreateStudentAppAITutorRequestAcceptsLearningActionSource(t *testing.T) {
	normalized, err := domain.NormalizeCreateStudentAppAITutorRequestInput(domain.CreateStudentAppAITutorRequestInput{
		Principal:            studentPrincipal("student_001"),
		StudentArchiveItemID: " tarch_archive_material_001 ",
		AnalysisGoal:         " generate practice ",
		LearningActionSource: domain.StudentAppAITutorLearningActionSource{
			ActionType:   domain.StudentAppArchiveItemLearningActionPersonalizedQuestionBank,
			PacketStatus: domain.StudentAppArchiveItemStudyPacketStatusReady,
		},
	})
	if err != nil {
		t.Fatalf("NormalizeCreateStudentAppAITutorRequestInput returned error: %v", err)
	}
	if normalized.StudentID != "student_001" {
		t.Fatalf("StudentID = %q", normalized.StudentID)
	}
	if normalized.LearningActionSource.ActionType != domain.StudentAppArchiveItemLearningActionPersonalizedQuestionBank ||
		normalized.LearningActionSource.PacketStatus != domain.StudentAppArchiveItemStudyPacketStatusReady {
		t.Fatalf("LearningActionSource = %#v", normalized.LearningActionSource)
	}
}

func TestNormalizeCreateStudentAppAITutorRequestAcceptsResultArchiveLearningActionSource(t *testing.T) {
	normalized, err := domain.NormalizeCreateStudentAppAITutorRequestInput(domain.CreateStudentAppAITutorRequestInput{
		Principal:            studentPrincipal("student_001"),
		StudentArchiveItemID: " tarch_student_ai_tutor_result_001 ",
		AnalysisGoal:         " continue guided practice ",
		LearningActionSource: domain.StudentAppAITutorLearningActionSource{
			SourceType:          domain.StudentAppAITutorLearningActionSourceResultArchive,
			ActionType:          domain.StudentAppArchiveItemLearningActionAITutorRequest,
			ResultArchiveStatus: domain.StudentAppAITutorResultArchiveStatusReady,
			RenderFormat:        domain.StudentAppAITutorResultArchiveRenderFormatSafeTextBlocks,
			FollowUpDepth:       1,
		},
	})
	if err != nil {
		t.Fatalf("NormalizeCreateStudentAppAITutorRequestInput returned error: %v", err)
	}
	if normalized.LearningActionSource.SourceType != domain.StudentAppAITutorLearningActionSourceResultArchive ||
		normalized.LearningActionSource.ResultArchiveStatus != domain.StudentAppAITutorResultArchiveStatusReady ||
		normalized.LearningActionSource.RenderFormat != domain.StudentAppAITutorResultArchiveRenderFormatSafeTextBlocks ||
		normalized.LearningActionSource.FollowUpDepth != 1 {
		t.Fatalf("LearningActionSource = %#v", normalized.LearningActionSource)
	}
}

func TestNormalizeCreateStudentAppAITutorRequestRejectsUnsupportedQuestionBankIntent(t *testing.T) {
	_, err := domain.NormalizeCreateStudentAppAITutorRequestInput(domain.CreateStudentAppAITutorRequestInput{
		Principal:            studentPrincipal("student_001"),
		StudentArchiveItemID: "tarch_student_quiz",
		AnalysisGoal:         "explain weak skills",
		QuestionBankIntent:   domain.QuestionBankIntent("EXPORT_FULL_BANK"),
	})
	if !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("error = %v, want ErrValidation", err)
	}
}

func TestNormalizeCreateStudentAppAITutorRequestRejectsInvalidLearningActionSource(t *testing.T) {
	for name, source := range map[string]domain.StudentAppAITutorLearningActionSource{
		"draft published packet": {
			ActionType:   domain.StudentAppArchiveItemLearningActionPersonalizedQuestionBank,
			PacketStatus: domain.StudentAppArchiveItemStudyPacketStatus("DRAFT"),
		},
		"wrong result archive status": {
			SourceType:          domain.StudentAppAITutorLearningActionSourceResultArchive,
			ActionType:          domain.StudentAppArchiveItemLearningActionAITutorRequest,
			ResultArchiveStatus: domain.StudentAppAITutorResultArchiveStatus("DRAFT"),
			RenderFormat:        domain.StudentAppAITutorResultArchiveRenderFormatSafeTextBlocks,
			FollowUpDepth:       1,
		},
		"wrong result archive render format": {
			SourceType:          domain.StudentAppAITutorLearningActionSourceResultArchive,
			ActionType:          domain.StudentAppArchiveItemLearningActionAITutorRequest,
			ResultArchiveStatus: domain.StudentAppAITutorResultArchiveStatusReady,
			RenderFormat:        domain.StudentAppAITutorResultArchiveRenderFormat("HTML"),
			FollowUpDepth:       1,
		},
		"missing result archive follow up depth": {
			SourceType:          domain.StudentAppAITutorLearningActionSourceResultArchive,
			ActionType:          domain.StudentAppArchiveItemLearningActionAITutorRequest,
			ResultArchiveStatus: domain.StudentAppAITutorResultArchiveStatusReady,
			RenderFormat:        domain.StudentAppAITutorResultArchiveRenderFormatSafeTextBlocks,
		},
		"published packet with follow up depth": {
			ActionType:    domain.StudentAppArchiveItemLearningActionPersonalizedQuestionBank,
			PacketStatus:  domain.StudentAppArchiveItemStudyPacketStatusReady,
			FollowUpDepth: 1,
		},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := domain.NormalizeCreateStudentAppAITutorRequestInput(domain.CreateStudentAppAITutorRequestInput{
				Principal:            studentPrincipal("student_001"),
				StudentArchiveItemID: "tarch_archive_material_001",
				AnalysisGoal:         "generate practice",
				LearningActionSource: source,
			})
			if !errors.Is(err, domain.ErrValidation) {
				t.Fatalf("error = %v, want ErrValidation", err)
			}
		})
	}
}

func TestNormalizeCreateStudentAppAITutorRequestRejectsNonStudentAppPrincipals(t *testing.T) {
	studentWithoutTeachingRead := studentPrincipal("student_001")
	studentWithoutTeachingRead.Scopes = []domain.Scope{domain.ScopeStudentOwnRead}

	studentWithoutOwnRead := studentPrincipal("student_001")
	studentWithoutOwnRead.Scopes = []domain.Scope{domain.ScopeTeachingRead}

	for name, principal := range map[string]domain.PrincipalContext{
		"teacher desktop":       teacherPrincipal(),
		"remote social":         remoteSocialPrincipal(),
		"service":               servicePrincipal(),
		"missing teaching read": studentWithoutTeachingRead,
		"missing own read":      studentWithoutOwnRead,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := domain.NormalizeCreateStudentAppAITutorRequestInput(domain.CreateStudentAppAITutorRequestInput{
				Principal:            principal,
				StudentArchiveItemID: "tarch_student_quiz",
				AnalysisGoal:         "explain weak skills",
			})
			if !errors.Is(err, domain.ErrForbidden) {
				t.Fatalf("error = %v, want ErrForbidden", err)
			}
		})
	}
}

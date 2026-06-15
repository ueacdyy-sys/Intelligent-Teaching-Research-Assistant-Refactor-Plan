package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestReadStudentAppAITutorResultArchiveReturnsSafeGuidanceCard(t *testing.T) {
	reader := &fakeAITutorResultArchiveReader{
		item:     aiTutorResultArchiveItem("tarch_student_ai_tutor_result_001", "student_001"),
		ok:       true,
		snapshot: aiTutorResultArchiveSnapshot("tarch_student_ai_tutor_result_001", "student_001"),
		snapOK:   true,
	}
	uc := usecase.NewReadStudentAppAITutorResultArchive(reader)

	card, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_student_ai_tutor_result_001",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if card.Status != domain.StudentAppAITutorResultArchiveStatusReady ||
		card.ArchiveItemID != "tarch_student_ai_tutor_result_001" ||
		card.SourceArchiveItemID != "tarch_source_student_homework_001" ||
		card.SourceTutoringRequestID != "tutor_req_student_app_001" ||
		card.Summary == "" ||
		len(card.GuidanceSections) != 2 {
		t.Fatalf("card = %#v", card)
	}
	if reader.getByIDReads != 1 || reader.snapshotReads != 1 {
		t.Fatalf("reads get:%d snapshot:%d", reader.getByIDReads, reader.snapshotReads)
	}
	if reader.snapshotArchiveItemID != "tarch_student_ai_tutor_result_001" ||
		reader.snapshotStudentID != "student_001" {
		t.Fatalf("snapshot lookup = %q/%q", reader.snapshotArchiveItemID, reader.snapshotStudentID)
	}
}

func TestReadStudentAppAITutorResultArchiveReturnsResultArchiveSourceSafeGuidanceCard(t *testing.T) {
	reader := &fakeAITutorResultArchiveReader{
		item:     aiTutorResultArchiveFollowUpItem("tarch_student_ai_tutor_result_archive_001", "student_001"),
		ok:       true,
		snapshot: aiTutorResultArchiveFollowUpSnapshot("tarch_student_ai_tutor_result_archive_001", "student_001"),
		snapOK:   true,
	}
	uc := usecase.NewReadStudentAppAITutorResultArchive(reader)

	card, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_student_ai_tutor_result_archive_001",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if card.Status != domain.StudentAppAITutorResultArchiveStatusReady ||
		card.SourceArchiveItemID != "tarch_student_ai_tutor_result_001" ||
		card.SourceTutoringRequestID != "tutor_req_student_app_result_archive_001" ||
		card.Summary != "Follow-up help based on a reviewed AI Tutor result." ||
		len(card.GuidanceSections) != 1 ||
		reader.getByIDReads != 1 ||
		reader.snapshotReads != 1 {
		t.Fatalf("card = %#v reads get:%d snapshot:%d", card, reader.getByIDReads, reader.snapshotReads)
	}
}

func TestReadStudentAppAITutorResultArchiveReturnsQuestionBankFeedbackSourceSafeGuidanceCard(t *testing.T) {
	reader := &fakeAITutorResultArchiveReader{
		item:     aiTutorResultArchiveQuestionBankFeedbackItem("tarch_student_feedback_001", "student_001"),
		ok:       true,
		snapshot: aiTutorResultArchiveQuestionBankFeedbackSnapshot("tarch_student_feedback_001", "student_001"),
		snapOK:   true,
	}
	uc := usecase.NewReadStudentAppAITutorResultArchive(reader)

	card, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemInput{
		Principal:     studentPrincipal("student_001"),
		ArchiveItemID: "tarch_student_feedback_001",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if card.Status != domain.StudentAppAITutorResultArchiveStatusReady ||
		card.SourceArchiveItemID != "tarch_question_bank_feedback_source_001" ||
		card.SourceTutoringRequestID != "tutor_req_student_app_feedback_001" ||
		card.Summary != "Follow-up help based on reviewed answer feedback." ||
		len(card.GuidanceSections) != 1 ||
		reader.getByIDReads != 1 ||
		reader.snapshotReads != 1 {
		t.Fatalf("card = %#v reads get:%d snapshot:%d", card, reader.getByIDReads, reader.snapshotReads)
	}
}

func TestReadStudentAppAITutorResultArchiveRejectsForbiddenBeforeReads(t *testing.T) {
	reader := &fakeAITutorResultArchiveReader{}
	uc := usecase.NewReadStudentAppAITutorResultArchive(reader)

	_, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemInput{
		Principal:     teacherPrincipal(),
		ArchiveItemID: "tarch_student_ai_tutor_result_001",
	})
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
	if reader.getByIDReads != 0 || reader.snapshotReads != 0 {
		t.Fatalf("reads get:%d snapshot:%d", reader.getByIDReads, reader.snapshotReads)
	}
}

func TestReadStudentAppAITutorResultArchiveRejectsCrossStudentOrWrongShape(t *testing.T) {
	for name, item := range map[string]domain.ArchiveItem{
		"cross student":  aiTutorResultArchiveItem("tarch_student_ai_tutor_result_001", "student_002"),
		"plain homework": archiveItem("tarch_student_ai_tutor_result_001", "student_001", time.Date(2026, 6, 8, 12, 20, 0, 0, time.UTC)),
		"bad ref": func() domain.ArchiveItem {
			item := aiTutorResultArchiveItem("tarch_student_ai_tutor_result_001", "student_001")
			item.ContentRef = "local://unsafe/raw-result.json"
			return item
		}(),
	} {
		t.Run(name, func(t *testing.T) {
			reader := &fakeAITutorResultArchiveReader{item: item, ok: true}
			uc := usecase.NewReadStudentAppAITutorResultArchive(reader)

			_, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemInput{
				Principal:     studentPrincipal("student_001"),
				ArchiveItemID: "tarch_student_ai_tutor_result_001",
			})
			if !errors.Is(err, domain.ErrForbidden) {
				t.Fatalf("error = %v, want ErrForbidden", err)
			}
			if reader.snapshotReads != 0 {
				t.Fatalf("snapshot reads = %d, want 0", reader.snapshotReads)
			}
		})
	}
}

func TestReadStudentAppAITutorResultArchiveRejectsMissingOrUnsafeSnapshot(t *testing.T) {
	for name, setup := range map[string]func(*fakeAITutorResultArchiveReader){
		"missing": func(reader *fakeAITutorResultArchiveReader) {
			reader.snapOK = false
		},
		"cross student": func(reader *fakeAITutorResultArchiveReader) {
			reader.snapshot.StudentID = "student_002"
		},
		"missing lineage source item": func(reader *fakeAITutorResultArchiveReader) {
			reader.snapshot.SourceArchiveItemID = ""
		},
		"missing lineage source request": func(reader *fakeAITutorResultArchiveReader) {
			reader.snapshot.SourceTutoringRequestID = ""
		},
		"self lineage": func(reader *fakeAITutorResultArchiveReader) {
			reader.snapshot.SourceArchiveItemID = reader.snapshot.ArchiveItemID
		},
		"not safe": func(reader *fakeAITutorResultArchiveReader) {
			reader.snapshot.SafeGuidanceOnly = false
		},
		"empty sections": func(reader *fakeAITutorResultArchiveReader) {
			reader.snapshot.GuidanceSections = nil
		},
		"unsafe text": func(reader *fakeAITutorResultArchiveReader) {
			reader.snapshot.GuidanceSections[0].Text = "<script>alert(1)</script>"
		},
	} {
		t.Run(name, func(t *testing.T) {
			reader := &fakeAITutorResultArchiveReader{
				item:     aiTutorResultArchiveItem("tarch_student_ai_tutor_result_001", "student_001"),
				ok:       true,
				snapshot: aiTutorResultArchiveSnapshot("tarch_student_ai_tutor_result_001", "student_001"),
				snapOK:   true,
			}
			setup(reader)
			uc := usecase.NewReadStudentAppAITutorResultArchive(reader)

			_, err := uc.Execute(context.Background(), domain.ReadStudentAppArchiveItemInput{
				Principal:     studentPrincipal("student_001"),
				ArchiveItemID: "tarch_student_ai_tutor_result_001",
			})
			if !errors.Is(err, domain.ErrNotFound) && !errors.Is(err, domain.ErrForbidden) &&
				!errors.Is(err, domain.ErrValidation) {
				t.Fatalf("error = %v, want ErrNotFound, ErrForbidden, or ErrValidation", err)
			}
		})
	}
}

type fakeAITutorResultArchiveReader struct {
	item                  domain.ArchiveItem
	ok                    bool
	getByIDReads          int
	snapshot              domain.StudentAppAITutorResultArchiveSnapshot
	snapOK                bool
	snapshotReads         int
	snapshotArchiveItemID string
	snapshotStudentID     string
}

func (f *fakeAITutorResultArchiveReader) GetByID(_ context.Context, id string) (domain.ArchiveItem, bool, error) {
	f.getByIDReads++
	if f.item.ID == id {
		return f.item, f.ok, nil
	}
	return domain.ArchiveItem{}, false, nil
}

func (f *fakeAITutorResultArchiveReader) GetStudentAppAITutorResultArchiveSnapshot(
	_ context.Context,
	archiveItemID string,
	studentID string,
) (domain.StudentAppAITutorResultArchiveSnapshot, bool, error) {
	f.snapshotReads++
	f.snapshotArchiveItemID = archiveItemID
	f.snapshotStudentID = studentID
	return f.snapshot, f.snapOK, nil
}

func aiTutorResultArchiveItem(id string, studentID string) domain.ArchiveItem {
	return domain.ArchiveItem{
		ID:              id,
		OwnerType:       domain.OwnerTypeStudent,
		StudentID:       studentID,
		MaterialType:    domain.MaterialTypeHomework,
		Title:           "Student AI Tutor result archive tutor_req_student_app_001",
		Source:          domain.SourceSystemImport,
		ContentRef:      "student-ai-tutor-result-archive:ai_tutor_result_archive_cmd_001:sha256_271312a59510bdc5c453848296b910c16791663bc96b6243963830676ca083a0",
		Tags:            []string{"student_app_ai_tutor", "result", "safe_guidance", "archive_commit"},
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly, domain.AnalysisIntentTutoring},
		OCRStatus:       domain.OCRStatusNotRequired,
		CreatedAt:       time.Date(2026, 6, 8, 12, 20, 0, 0, time.UTC),
	}
}

func aiTutorResultArchiveFollowUpItem(id string, studentID string) domain.ArchiveItem {
	item := aiTutorResultArchiveItem(id, studentID)
	item.Title = "Student AI Tutor result archive tutor_req_student_app_result_archive_001"
	item.ContentRef = "student-ai-tutor-result-archive:ai_tutor_result_archive_cmd_result_archive_001:sha256_fca56f06fe276b7f151662647a31ff0dde640358f3fdad476a813738dbd569b5"
	item.CreatedAt = time.Date(2026, 6, 9, 13, 40, 0, 0, time.UTC)
	return item
}

func aiTutorResultArchiveQuestionBankFeedbackItem(id string, studentID string) domain.ArchiveItem {
	item := aiTutorResultArchiveItem(id, studentID)
	item.Title = "Student AI Tutor result archive tutor_req_student_app_feedback_001"
	item.ContentRef = "student-ai-tutor-result-archive:ai_tutor_result_archive_cmd_feedback_001:sha256_f97cfa0b6ecd497dcea78e01bb830006e80ce81847ba325378cabbd2ba49fba2"
	item.CreatedAt = time.Date(2026, 6, 11, 16, 45, 0, 0, time.UTC)
	return item
}

func aiTutorResultArchiveSnapshot(
	archiveItemID string,
	studentID string,
) domain.StudentAppAITutorResultArchiveSnapshot {
	return domain.StudentAppAITutorResultArchiveSnapshot{
		ArchiveItemID:           archiveItemID,
		StudentID:               studentID,
		SourceArchiveItemID:     "tarch_source_student_homework_001",
		SourceTutoringRequestID: "tutor_req_student_app_001",
		Summary:                 "Guided help for comparing fractions.",
		GuidanceSectionsHash:    "05a82687de1587bfc882ecf8ec4f54421da7ff0ab4e911cd0af88d4ffbecec4b",
		SafetyLabels:            []string{"NO_DIAGNOSIS", "STUDY_GUIDANCE_ONLY"},
		SafeGuidanceOnly:        true,
		GuidanceSections: []domain.StudentAppAITutorResultArchiveGuidanceSection{
			{
				SectionID:       "ai_tutor_answer_section_001",
				Title:           "Start with a common denominator",
				Text:            "Convert both fractions to the same denominator, then compare the numerators.",
				SourceBlockRefs: []string{"block_section_001"},
			},
			{
				SectionID:       "ai_tutor_answer_section_002",
				Title:           "Check your reasoning",
				Text:            "Explain why the larger numerator is larger only after the denominators match.",
				SourceBlockRefs: []string{"block_section_002"},
			},
		},
	}
}

func aiTutorResultArchiveFollowUpSnapshot(
	archiveItemID string,
	studentID string,
) domain.StudentAppAITutorResultArchiveSnapshot {
	sourceArchiveItemID := "tarch_student_ai_tutor_result_001"
	if archiveItemID == sourceArchiveItemID {
		sourceArchiveItemID = "tarch_student_ai_tutor_result_parent_001"
	}
	return domain.StudentAppAITutorResultArchiveSnapshot{
		ArchiveItemID:           archiveItemID,
		StudentID:               studentID,
		SourceArchiveItemID:     sourceArchiveItemID,
		SourceTutoringRequestID: "tutor_req_student_app_result_archive_001",
		Summary:                 "Follow-up help based on a reviewed AI Tutor result.",
		GuidanceSectionsHash:    "747203bfbeca35e36a136f3998121af114471e4a5c02f51c843a4dfee159292c",
		SafetyLabels:            []string{"STUDY_GUIDANCE_ONLY", "FOLLOW_UP_REVIEW"},
		SafeGuidanceOnly:        true,
		FollowUpDepth:           1,
		GuidanceSections: []domain.StudentAppAITutorResultArchiveGuidanceSection{
			{
				SectionID:       "ai_tutor_answer_section_result_archive_001",
				Title:           "Review the previous correction",
				Text:            "Restate the corrected reasoning before attempting a similar practice item.",
				SourceBlockRefs: []string{"source_block_001"},
			},
		},
	}
}

func aiTutorResultArchiveQuestionBankFeedbackSnapshot(
	archiveItemID string,
	studentID string,
) domain.StudentAppAITutorResultArchiveSnapshot {
	return domain.StudentAppAITutorResultArchiveSnapshot{
		ArchiveItemID:           archiveItemID,
		StudentID:               studentID,
		SourceArchiveItemID:     "tarch_question_bank_feedback_source_001",
		SourceTutoringRequestID: "tutor_req_student_app_feedback_001",
		Summary:                 "Follow-up help based on reviewed answer feedback.",
		GuidanceSectionsHash:    "daa9efe1e3ee402648dca1919e2c43851b7445d0fdf79d26d7073af39060caab",
		SafetyLabels:            []string{"STUDY_GUIDANCE_ONLY", "FOLLOW_UP_REVIEW"},
		SafeGuidanceOnly:        true,
		GuidanceSections: []domain.StudentAppAITutorResultArchiveGuidanceSection{
			{
				SectionID:       "ai_tutor_answer_section_feedback_001",
				Title:           "Practice from feedback",
				Text:            "Restate the feedback in your own words, then solve one similar item.",
				SourceBlockRefs: []string{"block_score_summary", "block_next_step"},
			},
		},
	}
}

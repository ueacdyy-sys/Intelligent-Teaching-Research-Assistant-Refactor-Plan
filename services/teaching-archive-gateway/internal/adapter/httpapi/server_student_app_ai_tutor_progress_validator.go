package httpapi

import (
	"crypto/sha256"
	"encoding/base64"
	"hash"
	"strconv"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func studentAppAITutorRequestProgressListETag(
	cards []domain.StudentAppAITutorRequestProgressCard,
	pageInfo domain.ArchivePageInfo,
) string {
	h := sha256.New()
	writeETagField(h, "student-app-ai-tutor-request-progress-list/v1")
	writeETagInt(h, len(cards))
	for _, card := range cards {
		writeStudentAppAITutorRequestProgressCardETagFields(h, card)
	}
	writeETagInt(h, pageInfo.PageSize)
	writeETagBool(h, pageInfo.HasMore)
	writeETagField(h, pageInfo.NextCursor)
	return etagFromHash(h.Sum(nil))
}

func studentAppAITutorRequestProgressETag(card domain.StudentAppAITutorRequestProgressCard) string {
	h := sha256.New()
	writeETagField(h, "student-app-ai-tutor-request-progress-detail/v1")
	writeStudentAppAITutorRequestProgressCardETagFields(h, card)
	return etagFromHash(h.Sum(nil))
}

func writeStudentAppAITutorRequestProgressCardETagFields(
	h hash.Hash,
	card domain.StudentAppAITutorRequestProgressCard,
) {
	writeETagField(h, card.ID)
	writeETagField(h, card.ArchiveItemID)
	writeETagField(h, card.AnalysisGoal)
	writeETagField(h, string(card.QuestionBankIntent))
	writeETagField(h, string(card.Status))
	writeETagField(h, string(card.LearningActionSource))
	writeETagInt(h, card.FollowUpDepth)
	writeETagField(h, string(card.SourceArchiveMaterial))
	writeETagField(h, string(card.ProgressStage))
	writeETagField(h, string(card.NextStudentAction))
	writeETagField(h, string(card.PrimaryAction.ActionType))
	writeETagField(h, string(card.PrimaryAction.State))
	writeETagField(h, card.PrimaryAction.TargetEndpoint)
	writeETagField(h, card.PrimaryAction.TargetURL)
	writeETagField(h, card.PrimaryAction.Method)
	writeETagField(h, card.PrimaryAction.ArchiveItemID)
	writeETagField(h, card.PrimaryAction.QuestionBankDraftRef)
	writeETagBool(h, card.RefreshPolicy.AutoRefresh)
	writeETagInt(h, card.RefreshPolicy.RefreshAfterMs)
	writeETagField(h, string(card.RefreshPolicy.Reason))
	writeETagField(h, card.SafeStatusMessage)
	writeETagInt(h, len(card.Timeline))
	for _, step := range card.Timeline {
		writeETagField(h, step.StepID)
		writeETagField(h, step.Title)
		writeETagField(h, string(step.Status))
		writeETagField(h, optionalETagTime(step.CompletedAt))
	}
	writeETagField(h, formatTime(card.CreatedAt))
	writeETagField(h, optionalETagTime(card.CompletedAt))
	writeETagField(h, formatTime(card.UpdatedAt))
}

func optionalETagTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return formatTime(value)
}

func writeETagField(h hash.Hash, value string) {
	_, _ = h.Write([]byte(strconv.Itoa(len(value))))
	_, _ = h.Write([]byte{':'})
	_, _ = h.Write([]byte(value))
	_, _ = h.Write([]byte{'\n'})
}

func writeETagInt(h hash.Hash, value int) {
	writeETagField(h, strconv.Itoa(value))
}

func writeETagBool(h hash.Hash, value bool) {
	writeETagField(h, strconv.FormatBool(value))
}

func etagFromHash(sum []byte) string {
	return `"sha256-` + base64.RawURLEncoding.EncodeToString(sum) + `"`
}

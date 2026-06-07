package platform

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"math"
	"time"
)

type Clock struct{}

func (Clock) Now() time.Time {
	return time.Now().UTC()
}

type IDGenerator struct{}

func (IDGenerator) NewID() string {
	return newRandomID("tarch_")
}

type TutoringRequestIDGenerator struct{}

func (TutoringRequestIDGenerator) NewID() string {
	return newRandomID("tutor_req_")
}

type AIGradingRequestIDGenerator struct{}

func (AIGradingRequestIDGenerator) NewID() string {
	return newRandomID("grading_req_")
}

type QuizSubmissionIDGenerator struct{}

func (QuizSubmissionIDGenerator) NewID() string {
	return newRandomID("quiz_sub_")
}

type QuestionBankDraftAnswerSubmissionIDGenerator struct{}

func (QuestionBankDraftAnswerSubmissionIDGenerator) NewID() string {
	return newRandomID("qbank_ans_sub_")
}

type TeachingQuizDraftIntentIDGenerator struct{}

func (TeachingQuizDraftIntentIDGenerator) NewID() string {
	return newRandomID("quiz_draft_intent_")
}

type TeachingArchiveMaterialDraftIntentIDGenerator struct{}

func (TeachingArchiveMaterialDraftIntentIDGenerator) NewID() string {
	return newRandomID("archive_material_draft_intent_")
}

type AttendanceSessionIDGenerator struct{}

func (AttendanceSessionIDGenerator) NewID() string {
	return newRandomID("att_sess_")
}

type AttendanceRecordIDGenerator struct{}

func (AttendanceRecordIDGenerator) NewID() string {
	return newRandomID("att_rec_")
}

func newRandomID(prefix string) string {
	buffer := make([]byte, 18)
	if _, err := rand.Read(buffer); err != nil {
		panic(err)
	}
	return prefix + base64.RawURLEncoding.EncodeToString(buffer)
}

type CryptoRandomSource struct{}

func (CryptoRandomSource) Float64() float64 {
	var buffer [8]byte
	if _, err := rand.Read(buffer[:]); err != nil {
		panic(err)
	}
	value := float64(binary.BigEndian.Uint64(buffer[:])) / float64(^uint64(0))
	if value >= 1 {
		return math.Nextafter(1, 0)
	}
	return value
}

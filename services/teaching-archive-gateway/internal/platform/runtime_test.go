package platform

import (
	"strings"
	"testing"
)

func TestIDGeneratorsKeepBusinessPrefixes(t *testing.T) {
	generators := map[string]struct {
		prefix string
		ids    interface{ NewID() string }
	}{
		"archive item":       {prefix: "tarch_", ids: IDGenerator{}},
		"quiz submission":    {prefix: "quiz_sub_", ids: QuizSubmissionIDGenerator{}},
		"quiz draft intent":  {prefix: "quiz_draft_intent_", ids: TeachingQuizDraftIntentIDGenerator{}},
		"ai grading request": {prefix: "grading_req_", ids: AIGradingRequestIDGenerator{}},
		"tutoring request":   {prefix: "tutor_req_", ids: TutoringRequestIDGenerator{}},
		"attendance session": {prefix: "att_sess_", ids: AttendanceSessionIDGenerator{}},
		"attendance record":  {prefix: "att_rec_", ids: AttendanceRecordIDGenerator{}},
	}

	for name, generator := range generators {
		t.Run(name, func(t *testing.T) {
			id := generator.ids.NewID()
			if !strings.HasPrefix(id, generator.prefix) {
				t.Fatalf("id = %q, want prefix %q", id, generator.prefix)
			}
			remainder := strings.TrimPrefix(id, generator.prefix)
			if strings.Contains(remainder, " ") {
				t.Fatalf("id remainder contains whitespace: %q", remainder)
			}
			if len(remainder) < 20 {
				t.Fatalf("entropy segment too short: %q", remainder)
			}
		})
	}
}

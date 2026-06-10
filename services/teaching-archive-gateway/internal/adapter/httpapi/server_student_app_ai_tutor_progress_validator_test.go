package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestWritePrivateConditionalJSONWithETagSkipsPayloadFactoryOnMatch(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/v1/student-app/ai-tutor-requests", http.NoBody)
	request.Header.Set("If-None-Match", `"sha256-preencoded"`)
	response := httptest.NewRecorder()
	calls := 0

	writePrivateConditionalJSONWithETag(response, request, http.StatusOK, `"sha256-preencoded"`, func() any {
		calls++
		return map[string]string{"unexpected": "body"}
	})

	if response.Code != http.StatusNotModified {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if calls != 0 {
		t.Fatalf("payload factory calls = %d, want 0", calls)
	}
	if response.Body.Len() != 0 {
		t.Fatalf("body = %s, want empty", response.Body.String())
	}
	if response.Header().Get("ETag") != `"sha256-preencoded"` {
		t.Fatalf("ETag = %q", response.Header().Get("ETag"))
	}
}

func TestWritePrivateConditionalJSONWithETagBuildsPayloadOnMiss(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/v1/student-app/ai-tutor-requests", http.NoBody)
	request.Header.Set("If-None-Match", `"sha256-other"`)
	response := httptest.NewRecorder()
	calls := 0

	writePrivateConditionalJSONWithETag(response, request, http.StatusOK, `"sha256-current"`, func() any {
		calls++
		return map[string]string{"status": "current"}
	})

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if calls != 1 {
		t.Fatalf("payload factory calls = %d, want 1", calls)
	}
	if !strings.Contains(response.Body.String(), `"status":"current"`) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func TestStudentAppAITutorRequestProgressETagChangesWithVisibleFields(t *testing.T) {
	base := testProgressCard()
	baseETag := studentAppAITutorRequestProgressETag(base)

	updated := base
	updated.UpdatedAt = updated.UpdatedAt.Add(time.Minute)
	if studentAppAITutorRequestProgressETag(updated) == baseETag {
		t.Fatal("ETag did not change when updatedAt changed")
	}

	targetChanged := base
	targetChanged.PrimaryAction.TargetURL = "/v1/student-app/archive-items/changed/ai-tutor-result/rendered"
	if studentAppAITutorRequestProgressETag(targetChanged) == baseETag {
		t.Fatal("ETag did not change when primaryAction.targetUrl changed")
	}

	timelineChanged := base
	timelineChanged.Timeline[1].Status = domain.StudentAppAITutorProgressStepBlocked
	if studentAppAITutorRequestProgressETag(timelineChanged) == baseETag {
		t.Fatal("ETag did not change when timeline status changed")
	}
}

func TestStudentAppAITutorRequestProgressListETagChangesWithPageInfo(t *testing.T) {
	card := testProgressCard()
	base := studentAppAITutorRequestProgressListETag([]domain.StudentAppAITutorRequestProgressCard{card}, domain.ArchivePageInfo{
		PageSize: 10,
		HasMore:  false,
	})
	changed := studentAppAITutorRequestProgressListETag([]domain.StudentAppAITutorRequestProgressCard{card}, domain.ArchivePageInfo{
		PageSize:   10,
		HasMore:    true,
		NextCursor: "cursor_next",
	})

	if changed == base {
		t.Fatal("list ETag did not change when pageInfo changed")
	}
}

func testProgressCard() domain.StudentAppAITutorRequestProgressCard {
	completedAt := time.Date(2026, 6, 10, 10, 4, 0, 0, time.UTC)
	return domain.StudentAppAITutorRequestProgressCard{
		ID:                    "tutor_req_progress_001",
		ArchiveItemID:         "tarch_student_ai_tutor_result_001",
		AnalysisGoal:          "continue guided practice",
		QuestionBankIntent:    domain.QuestionBankIntentGeneratePersonalizedCheck,
		Status:                domain.TutoringAnalysisStatusSucceeded,
		LearningActionSource:  domain.StudentAppAITutorLearningActionSourceResultArchive,
		FollowUpDepth:         2,
		SourceArchiveMaterial: domain.MaterialTypeHomework,
		ProgressStage:         domain.StudentAppAITutorProgressStageResultReady,
		NextStudentAction:     domain.StudentAppAITutorNextActionViewResultArchive,
		PrimaryAction: domain.StudentAppAITutorRequestProgressAction{
			ActionType:     domain.StudentAppAITutorNextActionViewResultArchive,
			State:          domain.StudentAppAITutorProgressActionAvailable,
			TargetEndpoint: "/v1/student-app/archive-items/tarch_student_ai_tutor_result_001/ai-tutor-result/rendered",
			TargetURL:      "/v1/student-app/archive-items/tarch_student_ai_tutor_result_001/ai-tutor-result/rendered",
			Method:         "GET",
			ArchiveItemID:  "tarch_student_ai_tutor_result_001",
		},
		RefreshPolicy: domain.StudentAppAITutorRequestProgressRefreshPolicy{
			Reason: domain.StudentAppAITutorProgressRefreshActionReady,
		},
		SafeStatusMessage: "Reviewed AI tutor result is ready.",
		Timeline: []domain.StudentAppAITutorRequestProgressTimelineStep{
			{
				StepID:      "REQUEST_QUEUED",
				Title:       "Request received",
				Status:      domain.StudentAppAITutorProgressStepCompleted,
				CompletedAt: completedAt,
			},
			{
				StepID:      "AI_TUTOR_WORKING",
				Title:       "AI tutor working",
				Status:      domain.StudentAppAITutorProgressStepCompleted,
				CompletedAt: completedAt,
			},
		},
		CreatedAt:   time.Date(2026, 6, 10, 10, 0, 0, 0, time.UTC),
		CompletedAt: completedAt,
		UpdatedAt:   completedAt,
	}
}

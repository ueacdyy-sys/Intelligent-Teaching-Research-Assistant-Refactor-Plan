package httpapi_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/httpapi"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
	"ita-refactor/services/teaching-archive-gateway/internal/usecase"
)

func TestSubmitStudentAppQuestionBankDraftAnswerReturnsMetadataOnly(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerSubmission()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/question-bank-draft-answer-submissions",
		bytes.NewBufferString(`{"questionBankDraftRef":"local://question-bank-drafts/tutor_req_001.json","answers":[{"itemId":"q_001","answerText":"3/4"}]}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"id":"qbank_ans_sub_http"`),
		[]byte(`"questionBankDraftRef":"local://question-bank-drafts/tutor_req_001.json"`),
		[]byte(`"tutoringAnalysisRequestId":"tutor_req_001"`),
		[]byte(`"studentId":"student_001"`),
		[]byte(`"status":"SUBMITTED"`),
		[]byte(`"answerCount":1`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`answerText`),
		[]byte(`expectedAnswer`),
		[]byte(`explanation`),
		[]byte(`score`),
		[]byte(`3/4`),
		[]byte(`Use a common denominator of 4.`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
	timing := response.Header().Get("Server-Timing")
	if !strings.Contains(timing, "db.insert;dur=") || !strings.Contains(timing, "response.encode;dur=") {
		t.Fatalf("Server-Timing = %q", timing)
	}
}

func TestSubmitStudentAppQuestionBankDraftAnswerRejectsCrossStudentDraft(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerSubmission()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/question-bank-draft-answer-submissions",
		bytes.NewBufferString(`{"questionBankDraftRef":"local://question-bank-drafts/tutor_req_other.json","answers":[{"itemId":"q_001","answerText":"3/4"}]}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestSubmitStudentAppQuestionBankDraftAnswerRejectsUnknownItem(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerSubmission()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/question-bank-draft-answer-submissions",
		bytes.NewBufferString(`{"questionBankDraftRef":"local://question-bank-drafts/tutor_req_001.json","answers":[{"itemId":"q_missing","answerText":"3/4"}]}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestSubmitStudentAppQuestionBankDraftAnswerRejectsUnsupportedMethod(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerSubmission()
	request := httptest.NewRequest(http.MethodGet, "/v1/student-app/question-bank-draft-answer-submissions", http.NoBody)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestCreateStudentAppQuestionBankDraftAnswerScoringRequestReturnsMetadataOnly(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerScoringRequest()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/ai-grading-requests",
		bytes.NewBufferString(`{"gradingInstructions":"grade the submitted draft answer","rubricRef":"local://rubrics/fractions.json"}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"id":"grading_req_qbank_answer_http"`),
		[]byte(`"archiveItemId":"tarch_http_3"`),
		[]byte(`"status":"QUEUED"`),
		[]byte(`"sourceArchiveOwnerType":"STUDENT"`),
		[]byte(`"sourceArchiveStudentId":"student_001"`),
		[]byte(`"sourceArchiveContentRef":"local://question-bank-drafts/tutor_req_001.json"`),
		[]byte(`"sourceQuestionBankDraftRef":"local://question-bank-drafts/tutor_req_001.json"`),
		[]byte(`"sourceQuestionBankAnswerSubmissionId":"qbank_ans_sub_http_answer"`),
		[]byte(`"sourceArchiveOcrStatus":"NOT_REQUIRED"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`answerText`),
		[]byte(`expectedAnswer`),
		[]byte(`explanation`),
		[]byte(`scoreSummary`),
		[]byte(`resultRef`),
		[]byte(`3/4`),
		[]byte(`Use a common denominator of 4.`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestCreateStudentAppQuestionBankDraftAnswerScoringRequestRejectsTeacherAndCrossStudent(t *testing.T) {
	tests := []struct {
		name      string
		principal domain.PrincipalContext
		want      int
	}{
		{name: "teacher", principal: teacherPrincipal(), want: http.StatusForbidden},
		{name: "cross student", principal: studentPrincipal("student_002"), want: http.StatusNotFound},
		{name: "remote", principal: remotePrincipal(), want: http.StatusForbidden},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerScoringRequest()
			request := httptest.NewRequest(
				http.MethodPost,
				"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/ai-grading-requests",
				bytes.NewBufferString(`{"gradingInstructions":"grade the submitted draft answer"}`),
			)
			request.Header.Set("X-Agent-Api-Key", "ueacd")
			setPrincipalHeader(t, request, tt.principal)

			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != tt.want {
				t.Fatalf("status = %d, want %d, body = %s", response.Code, tt.want, response.Body.String())
			}
		})
	}
}

func TestCreateStudentAppQuestionBankDraftAnswerScoringRequestRejectsUnsupportedSubresource(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerScoringRequest()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/score",
		bytes.NewBufferString(`{"gradingInstructions":"grade the submitted draft answer"}`),
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestReadStudentAppQuestionBankDraftAnswerScoringResultReturnsSafeSummary(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerScoringResult()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/ai-grading-result",
		http.NoBody,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"submissionId":"qbank_ans_sub_http_answer"`),
		[]byte(`"requestId":"grading_req_qbank_answer_result_http"`),
		[]byte(`"questionBankDraftRef":"local://question-bank-drafts/tutor_req_001.json"`),
		[]byte(`"tutoringAnalysisRequestId":"tutor_req_001"`),
		[]byte(`"archiveItemId":"tarch_http_3"`),
		[]byte(`"status":"SUCCEEDED"`),
		[]byte(`"scoreSummary":"score 93"`),
		[]byte(`"requestedAt"`),
		[]byte(`"completedAt"`),
		[]byte(`"updatedAt"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`answerText`),
		[]byte(`expectedAnswer`),
		[]byte(`explanation`),
		[]byte(`resultRef`),
		[]byte(`errorMessage`),
		[]byte(`workerId`),
		[]byte(`claimedByWorkerId`),
		[]byte(`claimExpiresAt`),
		[]byte(`3/4`),
		[]byte(`Use a common denominator of 4.`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestReadStudentAppQuestionBankDraftAnswerScoringResultRejectsTeacherAndCrossStudent(t *testing.T) {
	tests := []struct {
		name      string
		principal domain.PrincipalContext
		want      int
	}{
		{name: "teacher", principal: teacherPrincipal(), want: http.StatusForbidden},
		{name: "cross student", principal: studentPrincipal("student_002"), want: http.StatusNotFound},
		{name: "remote", principal: remotePrincipal(), want: http.StatusForbidden},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerScoringResult()
			request := httptest.NewRequest(
				http.MethodGet,
				"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/ai-grading-result",
				http.NoBody,
			)
			request.Header.Set("X-Agent-Api-Key", "ueacd")
			setPrincipalHeader(t, request, tt.principal)

			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != tt.want {
				t.Fatalf("status = %d, want %d, body = %s", response.Code, tt.want, response.Body.String())
			}
		})
	}
}

func TestReadStudentAppQuestionBankDraftAnswerScoringResultRejectsUnsupportedMethod(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerScoringResult()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/ai-grading-result",
		http.NoBody,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestReadStudentAppQuestionBankDraftAnswerFeedbackReturnsSafeCard(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerFeedback()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/ai-feedback",
		http.NoBody,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"submissionId":"qbank_ans_sub_http_answer"`),
		[]byte(`"requestId":"grading_req_qbank_answer_feedback_http"`),
		[]byte(`"archiveItemId":"tarch_http_3"`),
		[]byte(`"feedbackArchiveItemId":"tarch_student_feedback_http"`),
		[]byte(`"status":"READY_FOR_STUDENT_APP_READ"`),
		[]byte(`"scoreSummary":"score 93"`),
		[]byte(`"learnerFeedback"`),
		[]byte(`"summary":"Your comparison is close; focus on matching denominators before judging size."`),
		[]byte(`"nextSteps":["Rewrite both fractions with a common denominator.","Compare the numerators only after denominators match."]`),
		[]byte(`"misconceptionTags":["denominator-mismatch"]`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`"studentId"`),
		[]byte(`"contentRef"`),
		[]byte(`answerText`),
		[]byte(`expectedAnswer`),
		[]byte(`explanation`),
		[]byte(`resultRef`),
		[]byte(`rawModelOutput`),
		[]byte(`workerId`),
		[]byte(`claimedByWorkerId`),
		[]byte(`3/4`),
		[]byte(`Use a common denominator of 4.`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestReadStudentAppQuestionBankDraftAnswerFeedbackRejectsTeacherCrossStudentAndMethod(t *testing.T) {
	tests := []struct {
		name      string
		principal domain.PrincipalContext
		want      int
	}{
		{name: "teacher", principal: teacherPrincipal(), want: http.StatusForbidden},
		{name: "cross student", principal: studentPrincipal("student_002"), want: http.StatusNotFound},
		{name: "remote", principal: remotePrincipal(), want: http.StatusForbidden},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerFeedback()
			request := httptest.NewRequest(
				http.MethodGet,
				"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/ai-feedback",
				http.NoBody,
			)
			request.Header.Set("X-Agent-Api-Key", "ueacd")
			setPrincipalHeader(t, request, tt.principal)

			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != tt.want {
				t.Fatalf("status = %d, want %d, body = %s", response.Code, tt.want, response.Body.String())
			}
		})
	}

	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerFeedback()
	post := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/ai-feedback",
		http.NoBody,
	)
	post.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, post, studentPrincipal("student_001"))
	postResponse := httptest.NewRecorder()
	handler.ServeHTTP(postResponse, post)
	if postResponse.Code != http.StatusMethodNotAllowed {
		t.Fatalf("post status = %d, body = %s", postResponse.Code, postResponse.Body.String())
	}
}

func TestRenderStudentAppQuestionBankDraftAnswerFeedbackReturnsSafeTextBlocks(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerFeedback()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/ai-feedback/rendered",
		http.NoBody,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"submissionId":"qbank_ans_sub_http_answer"`),
		[]byte(`"feedbackArchiveItemId":"tarch_student_feedback_http"`),
		[]byte(`"renderFormat":"SAFE_TEXT_BLOCKS"`),
		[]byte(`"blockType":"SCORE_SUMMARY"`),
		[]byte(`"blockType":"FEEDBACK_SUMMARY"`),
		[]byte(`"blockId":"next_step_001"`),
		[]byte(`"blockType":"PRACTICE_SUGGESTION"`),
		[]byte(`"text":"score 93"`),
		[]byte(`"text":"Your comparison is close; focus on matching denominators before judging size."`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`"studentId"`),
		[]byte(`"contentRef"`),
		[]byte(`"learnerFeedback"`),
		[]byte(`answerText`),
		[]byte(`expectedAnswer`),
		[]byte(`explanation`),
		[]byte(`resultRef`),
		[]byte(`rawModelOutput`),
		[]byte(`workerId`),
		[]byte(`renderedHtml`),
		[]byte(`renderedMarkdown`),
		[]byte(`3/4`),
		[]byte(`Use a common denominator of 4.`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestRenderStudentAppQuestionBankDraftAnswerFeedbackRejectsTeacherCrossStudentAndMethod(t *testing.T) {
	tests := []struct {
		name      string
		principal domain.PrincipalContext
		want      int
	}{
		{name: "teacher", principal: teacherPrincipal(), want: http.StatusForbidden},
		{name: "cross student", principal: studentPrincipal("student_002"), want: http.StatusNotFound},
		{name: "remote", principal: remotePrincipal(), want: http.StatusForbidden},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerFeedback()
			request := httptest.NewRequest(
				http.MethodGet,
				"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/ai-feedback/rendered",
				http.NoBody,
			)
			request.Header.Set("X-Agent-Api-Key", "ueacd")
			setPrincipalHeader(t, request, tt.principal)

			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != tt.want {
				t.Fatalf("status = %d, want %d, body = %s", response.Code, tt.want, response.Body.String())
			}
		})
	}

	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerFeedback()
	post := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/ai-feedback/rendered",
		http.NoBody,
	)
	post.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, post, studentPrincipal("student_001"))
	postResponse := httptest.NewRecorder()
	handler.ServeHTTP(postResponse, post)
	if postResponse.Code != http.StatusMethodNotAllowed {
		t.Fatalf("post status = %d, body = %s", postResponse.Code, postResponse.Body.String())
	}
}

func TestReadStudentAppQuestionBankDraftAnswerFeedbackLearningActionsReturnsSafeSources(t *testing.T) {
	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerFeedback()
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/ai-feedback/learning-actions",
		http.NoBody,
	)
	request.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, request, studentPrincipal("student_001"))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"submissionId":"qbank_ans_sub_http_answer"`),
		[]byte(`"archiveItemId":"tarch_http_3"`),
		[]byte(`"feedbackArchiveItemId":"tarch_student_feedback_http"`),
		[]byte(`"renderFormat":"SAFE_TEXT_BLOCKS"`),
		[]byte(`"actionType":"AI_TUTOR_REQUEST"`),
		[]byte(`"actionType":"PERSONALIZED_QUESTION_BANK"`),
		[]byte(`"targetEndpoint":"/v1/student-app/ai-tutor-requests"`),
		[]byte(`"sourceType":"QUESTION_BANK_DRAFT_ANSWER_FEEDBACK"`),
		[]byte(`"feedbackStatus":"READY_FOR_STUDENT_APP_READ"`),
		[]byte(`"feedbackRenderFormat":"SAFE_TEXT_BLOCKS"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`"studentId"`),
		[]byte(`"contentRef"`),
		[]byte(`"blocks"`),
		[]byte(`"learnerFeedback"`),
		[]byte(`answerText`),
		[]byte(`expectedAnswer`),
		[]byte(`explanation`),
		[]byte(`rawModelOutput`),
		[]byte(`workerId`),
		[]byte(`3/4`),
		[]byte(`Use a common denominator of 4.`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("body leaked %s in %s", leaked, response.Body.String())
		}
	}
}

func TestReadStudentAppQuestionBankDraftAnswerFeedbackLearningActionsRejectsTeacherCrossStudentAndMethod(t *testing.T) {
	tests := []struct {
		name      string
		principal domain.PrincipalContext
		want      int
	}{
		{name: "teacher", principal: teacherPrincipal(), want: http.StatusForbidden},
		{name: "cross student", principal: studentPrincipal("student_002"), want: http.StatusNotFound},
		{name: "remote", principal: remotePrincipal(), want: http.StatusForbidden},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerFeedback()
			request := httptest.NewRequest(
				http.MethodGet,
				"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/ai-feedback/learning-actions",
				http.NoBody,
			)
			request.Header.Set("X-Agent-Api-Key", "ueacd")
			setPrincipalHeader(t, request, tt.principal)

			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != tt.want {
				t.Fatalf("status = %d, want %d, body = %s", response.Code, tt.want, response.Body.String())
			}
		})
	}

	handler := newTestHandlerWithStudentAppQuestionBankDraftAnswerFeedback()
	post := httptest.NewRequest(
		http.MethodPost,
		"/v1/student-app/question-bank-draft-answer-submissions/qbank_ans_sub_http_answer/ai-feedback/learning-actions",
		http.NoBody,
	)
	post.Header.Set("X-Agent-Api-Key", "ueacd")
	setPrincipalHeader(t, post, studentPrincipal("student_001"))
	postResponse := httptest.NewRecorder()
	handler.ServeHTTP(postResponse, post)
	if postResponse.Code != http.StatusMethodNotAllowed {
		t.Fatalf("post status = %d, body = %s", postResponse.Code, postResponse.Body.String())
	}
}

func newTestHandlerWithStudentAppQuestionBankDraftAnswerSubmission() http.Handler {
	store := &fakeRepository{
		questionBankDraftContents: []domain.QuestionBankDraftContent{
			questionBankDraftHTTPContent("tutor_req_001", "tarch_http_3", "student_001"),
			questionBankDraftHTTPContent("tutor_req_other", "tarch_http_other", "student_002"),
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		SubmitStudentAppQuestionBankDraftAnswer: usecase.NewSubmitStudentAppQuestionBankDraftAnswer(
			store,
			fixedIDs{id: "qbank_ans_sub_http"},
			fixedClock{now: time.Date(2026, 6, 6, 9, 30, 0, 0, time.UTC)},
		),
		CreateStudentAppQuestionBankDraftAnswerScoringRequest: usecase.NewCreateStudentAppQuestionBankDraftAnswerScoringRequest(
			store,
			fixedIDs{id: "grading_req_qbank_answer_http"},
			fixedClock{now: time.Date(2026, 6, 6, 9, 35, 0, 0, time.UTC)},
		),
		AgentAPIKey: "ueacd",
	}).Handler()
}

func newTestHandlerWithStudentAppQuestionBankDraftAnswerScoringRequest() http.Handler {
	store := &fakeRepository{
		questionBankDraftContents: []domain.QuestionBankDraftContent{
			questionBankDraftHTTPContent("tutor_req_001", "tarch_http_3", "student_001"),
		},
		questionBankDraftAnswerSubmissions: []domain.QuestionBankDraftAnswerSubmission{
			questionBankDraftHTTPAnswerSubmission(),
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		CreateStudentAppQuestionBankDraftAnswerScoringRequest: usecase.NewCreateStudentAppQuestionBankDraftAnswerScoringRequest(
			store,
			fixedIDs{id: "grading_req_qbank_answer_http"},
			fixedClock{now: time.Date(2026, 6, 6, 9, 35, 0, 0, time.UTC)},
		),
		AgentAPIKey: "ueacd",
	}).Handler()
}

func newTestHandlerWithStudentAppQuestionBankDraftAnswerScoringResult() http.Handler {
	now := time.Date(2026, 6, 6, 10, 45, 0, 0, time.UTC)
	request := httpAIGradingRequest(
		"grading_req_qbank_answer_result_http",
		"tarch_http_3",
		"student_001",
		now.Add(-10*time.Minute),
	)
	request.SourceArchiveContentRef = "local://question-bank-drafts/tutor_req_001.json"
	request.SourceQuestionBankDraftRef = "local://question-bank-drafts/tutor_req_001.json"
	request.SourceQuestionBankAnswerSubmissionID = "qbank_ans_sub_http_answer"
	request.SourceArchiveOCRStatus = domain.OCRStatusNotRequired
	request.Status = domain.AIGradingStatusSucceeded
	request.ScoreSummary = "score 93"
	request.ResultRef = "local://grading/grading_req_qbank_answer_result_http/result.json"
	request.CompletedAt = now.Add(-time.Minute)
	request.UpdatedAt = request.CompletedAt
	store := &fakeRepository{
		gradingRequests: []domain.AIGradingRequest{request},
		questionBankDraftAnswerSubmissions: []domain.QuestionBankDraftAnswerSubmission{
			questionBankDraftHTTPAnswerSubmission(),
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		ReadStudentAppQuestionBankDraftAnswerScoringResult: usecase.NewReadStudentAppQuestionBankDraftAnswerScoringResult(store),
		AgentAPIKey: "ueacd",
	}).Handler()
}

func newTestHandlerWithStudentAppQuestionBankDraftAnswerFeedback() http.Handler {
	store := &fakeRepository{
		items: []domain.ArchiveItem{
			questionBankDraftAnswerFeedbackHTTPArchiveItem("tarch_student_feedback_http", "student_001"),
			questionBankDraftAnswerFeedbackHTTPArchiveItem("tarch_student_feedback_other", "student_002"),
		},
		questionBankDraftAnswerSubmissions: []domain.QuestionBankDraftAnswerSubmission{
			questionBankDraftHTTPAnswerSubmission(),
		},
		questionBankDraftAnswerFeedbackSnapshots: []domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot{
			questionBankDraftAnswerFeedbackHTTPSnapshot("tarch_student_feedback_http", "qbank_ans_sub_http_answer", "student_001"),
			questionBankDraftAnswerFeedbackHTTPSnapshot("tarch_student_feedback_other", "qbank_ans_sub_http_answer", "student_002"),
		},
	}
	return httpapi.NewServer(httpapi.ServerConfig{
		ReadStudentAppQuestionBankDraftAnswerFeedback: usecase.NewReadStudentAppQuestionBankDraftAnswerFeedback(store),
		RenderStudentAppQuestionBankDraftAnswerFeedback: usecase.NewRenderStudentAppQuestionBankDraftAnswerFeedback(
			usecase.NewReadStudentAppQuestionBankDraftAnswerFeedback(store),
		),
		ReadStudentAppQuestionBankDraftAnswerFeedbackLearningActions: usecase.NewReadStudentAppQuestionBankDraftAnswerFeedbackLearningActions(
			usecase.NewRenderStudentAppQuestionBankDraftAnswerFeedback(
				usecase.NewReadStudentAppQuestionBankDraftAnswerFeedback(store),
			),
		),
		AgentAPIKey: "ueacd",
	}).Handler()
}

func questionBankDraftHTTPAnswerSubmission() domain.QuestionBankDraftAnswerSubmission {
	return domain.QuestionBankDraftAnswerSubmission{
		ID:                        "qbank_ans_sub_http_answer",
		QuestionBankDraftRef:      "local://question-bank-drafts/tutor_req_001.json",
		TutoringAnalysisRequestID: "tutor_req_001",
		ArchiveItemID:             "tarch_http_3",
		StudentID:                 "student_001",
		SubmittedByPrincipalID:    "student_001",
		Status:                    domain.QuestionBankDraftAnswerSubmissionStatusSubmitted,
		Answers: []domain.QuestionBankDraftSubmittedAnswer{
			{ItemID: "q_001", AnswerText: "3/4"},
		},
		SubmittedAt: time.Date(2026, 6, 6, 9, 32, 0, 0, time.UTC),
	}
}

func questionBankDraftAnswerFeedbackHTTPArchiveItem(id string, studentID string) domain.ArchiveItem {
	return domain.ArchiveItem{
		ID:              id,
		OwnerType:       domain.OwnerTypeStudent,
		StudentID:       studentID,
		MaterialType:    domain.MaterialTypeHomework,
		Title:           "Student AI Tutor feedback archive qbank_ans_sub_http_answer",
		Source:          domain.SourceSystemImport,
		ContentRef:      "student-ai-tutor-feedback-archive:feedback_archive_cmd_qbank_http:sha256_4249595968f7ea8d603e6620d8f4abb688e52629b10fe0d9244627287fe18463",
		Tags:            []string{"student_app_ai_tutor", "feedback", "question_bank", "archive_commit"},
		AnalysisIntents: []domain.AnalysisIntent{domain.AnalysisIntentArchiveOnly, domain.AnalysisIntentTutoring},
		OCRStatus:       domain.OCRStatusNotRequired,
		CreatedAt:       time.Date(2026, 6, 6, 10, 30, 0, 0, time.UTC),
	}
}

func questionBankDraftAnswerFeedbackHTTPSnapshot(
	feedbackArchiveItemID string,
	submissionID string,
	studentID string,
) domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot {
	return domain.QuestionBankDraftAnswerFeedbackArchiveSnapshot{
		FeedbackArchiveItemID:     feedbackArchiveItemID,
		SubmissionID:              submissionID,
		StudentID:                 studentID,
		RequestID:                 "grading_req_qbank_answer_feedback_http",
		QuestionBankDraftRef:      "local://question-bank-drafts/tutor_req_001.json",
		TutoringAnalysisRequestID: "tutor_req_001",
		SourceArchiveItemID:       "tarch_http_3",
		ScoreSummary:              "score 93",
		LearnerFeedback: domain.QuestionBankDraftAnswerLearnerFeedback{
			Summary:             "Your comparison is close; focus on matching denominators before judging size.",
			Encouragement:       "You identified the key numbers and can fix the reasoning with one more step.",
			NextSteps:           []string{"Rewrite both fractions with a common denominator.", "Compare the numerators only after denominators match."},
			MisconceptionTags:   []string{"denominator-mismatch"},
			PracticeSuggestions: []string{"Try two more fraction comparison items with unlike denominators."},
		},
		SafeLearnerFeedbackOnly: true,
		ReviewedAt:              time.Date(2026, 6, 6, 10, 20, 0, 0, time.UTC),
		ArchivedAt:              time.Date(2026, 6, 6, 10, 30, 0, 0, time.UTC),
		UpdatedAt:               time.Date(2026, 6, 6, 10, 31, 0, 0, time.UTC),
	}
}

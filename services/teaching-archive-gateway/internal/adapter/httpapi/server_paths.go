package httpapi

import "strings"

func parseStudentAppArchiveItemPath(path string) (string, bool) {
	const prefix = "/v1/student-app/archive-items/"
	if !strings.HasPrefix(path, prefix) {
		return "", false
	}
	archiveItemID := strings.TrimPrefix(path, prefix)
	if archiveItemID == "" || strings.Contains(archiveItemID, "/") {
		return "", false
	}
	return archiveItemID, true
}

func parseStudentAppArchiveItemContentPreviewPath(path string) (string, bool) {
	const prefix = "/v1/student-app/archive-items/"
	const suffix = "/content-preview"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	archiveItemID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if archiveItemID == "" || strings.Contains(archiveItemID, "/") {
		return "", false
	}
	return archiveItemID, true
}

func parseStudentAppArchiveItemContentPreviewRenderedPath(path string) (string, bool) {
	const prefix = "/v1/student-app/archive-items/"
	const suffix = "/content-preview/rendered"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	archiveItemID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if archiveItemID == "" || strings.Contains(archiveItemID, "/") {
		return "", false
	}
	return archiveItemID, true
}

func parseStudentAppArchiveItemStudyPacketPath(path string) (string, bool) {
	const prefix = "/v1/student-app/archive-items/"
	const suffix = "/study-packet"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	archiveItemID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if archiveItemID == "" || strings.Contains(archiveItemID, "/") {
		return "", false
	}
	return archiveItemID, true
}

func parseStudentAppArchiveItemLearningActionsPath(path string) (string, bool) {
	const prefix = "/v1/student-app/archive-items/"
	const suffix = "/learning-actions"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	archiveItemID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if archiveItemID == "" || strings.Contains(archiveItemID, "/") {
		return "", false
	}
	return archiveItemID, true
}

func parseStudentAppArchiveItemAITutorResultPath(path string) (string, bool) {
	const prefix = "/v1/student-app/archive-items/"
	const suffix = "/ai-tutor-result"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	archiveItemID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if archiveItemID == "" || strings.Contains(archiveItemID, "/") {
		return "", false
	}
	return archiveItemID, true
}

func parseStudentAppArchiveItemAITutorResultRenderedPath(path string) (string, bool) {
	const prefix = "/v1/student-app/archive-items/"
	const suffix = "/ai-tutor-result/rendered"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	archiveItemID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if archiveItemID == "" || strings.Contains(archiveItemID, "/") {
		return "", false
	}
	return archiveItemID, true
}

func parseArchiveItemTutoringAnalysisRequestPath(path string) (string, bool) {
	const prefix = "/v1/teaching/archive-items/"
	const suffix = "/tutoring-analysis-requests"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	archiveItemID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if archiveItemID == "" || strings.Contains(archiveItemID, "/") {
		return "", false
	}
	return archiveItemID, true
}

func parseArchiveItemAIGradingRequestPath(path string) (string, bool) {
	const prefix = "/v1/teaching/archive-items/"
	const suffix = "/ai-grading-requests"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	archiveItemID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if archiveItemID == "" || strings.Contains(archiveItemID, "/") {
		return "", false
	}
	return archiveItemID, true
}

func parseArchiveItemQuizSubmissionPath(path string) (string, bool) {
	const prefix = "/v1/teaching/archive-items/"
	const suffix = "/quiz-submissions"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	archiveItemID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if archiveItemID == "" || strings.Contains(archiveItemID, "/") {
		return "", false
	}
	return archiveItemID, true
}

func parseQuizSubmissionAIGradingRequestPath(path string) (string, string, bool) {
	const prefix = "/v1/teaching/archive-items/"
	const suffix = "/ai-grading-requests"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", "", false
	}
	inner := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	parts := strings.Split(inner, "/")
	if len(parts) != 3 || parts[0] == "" || parts[1] != "quiz-submissions" || parts[2] == "" {
		return "", "", false
	}
	return parts[0], parts[2], true
}

func parseStudentAppQuestionBankDraftAnswerSubmissionAIGradingRequestPath(path string) (string, bool) {
	const prefix = "/v1/student-app/question-bank-draft-answer-submissions/"
	const suffix = "/ai-grading-requests"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	submissionID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if submissionID == "" || strings.Contains(submissionID, "/") {
		return "", false
	}
	return submissionID, true
}

func parseStudentAppQuestionBankDraftAnswerSubmissionAIGradingResultPath(path string) (string, bool) {
	const prefix = "/v1/student-app/question-bank-draft-answer-submissions/"
	const suffix = "/ai-grading-result"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	submissionID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if submissionID == "" || strings.Contains(submissionID, "/") {
		return "", false
	}
	return submissionID, true
}

func parseAttendanceSessionRecordsPath(path string) (string, bool) {
	const prefix = "/v1/teaching/attendance-sessions/"
	const suffix = "/records"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	sessionID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if sessionID == "" || strings.Contains(sessionID, "/") {
		return "", false
	}
	return sessionID, true
}

func parseAttendanceSessionSignInsPath(path string) (string, bool) {
	const prefix = "/v1/teaching/attendance-sessions/"
	const suffix = "/sign-ins"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	sessionID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if sessionID == "" || strings.Contains(sessionID, "/") {
		return "", false
	}
	return sessionID, true
}

func parseAttendanceSessionEndPath(path string) (string, bool) {
	const prefix = "/v1/teaching/attendance-sessions/"
	const suffix = "/end"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	sessionID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if sessionID == "" || strings.Contains(sessionID, "/") {
		return "", false
	}
	return sessionID, true
}

func parseAttendanceSessionRandomSelectionsPath(path string) (string, bool) {
	const prefix = "/v1/teaching/attendance-sessions/"
	const suffix = "/random-selections"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	sessionID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if sessionID == "" || strings.Contains(sessionID, "/") {
		return "", false
	}
	return sessionID, true
}

func parseStudentAttendanceRecordsPath(path string) (string, bool) {
	const prefix = "/v1/teaching/students/"
	const suffix = "/attendance-records"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	studentID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if studentID == "" || strings.Contains(studentID, "/") {
		return "", false
	}
	return studentID, true
}

func parseAIGradingWorkerClaimPath(path string) bool {
	return path == "/v1/teaching/ai-grading-requests/worker-claims"
}

func parseAIGradingWorkerResultPath(path string) (string, bool) {
	const prefix = "/v1/teaching/ai-grading-requests/"
	const suffix = "/worker-result"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	requestID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if requestID == "" || strings.Contains(requestID, "/") {
		return "", false
	}
	return requestID, true
}

func parseAIGradingQuestionBankAnswerScoringInputPath(path string) (string, bool) {
	const prefix = "/v1/teaching/ai-grading-requests/"
	const suffix = "/question-bank-answer-scoring-input"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	requestID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if requestID == "" || strings.Contains(requestID, "/") {
		return "", false
	}
	return requestID, true
}

func parseTutoringAnalysisWorkerClaimPath(path string) bool {
	return path == "/v1/teaching/tutoring-analysis-requests/worker-claims"
}

func parseTutoringAnalysisWorkerResultPath(path string) (string, bool) {
	const prefix = "/v1/teaching/tutoring-analysis-requests/"
	const suffix = "/worker-result"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	requestID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if requestID == "" || strings.Contains(requestID, "/") {
		return "", false
	}
	return requestID, true
}

func parseTutoringAnalysisAITutorStudyPacketInputPath(path string) (string, bool) {
	const prefix = "/v1/teaching/tutoring-analysis-requests/"
	const suffix = "/ai-tutor-study-packet-input"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	requestID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if requestID == "" || strings.Contains(requestID, "/") {
		return "", false
	}
	return requestID, true
}

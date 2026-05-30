package httpapi

import "strings"

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

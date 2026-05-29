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

func parseAIGradingWorkerClaimPath(path string) bool {
	return path == "/v1/teaching/ai-grading-requests/worker-claims"
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

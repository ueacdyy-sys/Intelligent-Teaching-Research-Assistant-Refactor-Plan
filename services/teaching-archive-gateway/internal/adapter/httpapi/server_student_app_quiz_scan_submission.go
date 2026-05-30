package httpapi

import "net/http"

func (s *Server) studentAppQuizScanSubmissions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.createScannedQuizSubmissionMetadata(w, r)
}

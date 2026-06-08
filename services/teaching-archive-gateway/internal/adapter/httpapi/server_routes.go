package httpapi

import "net/http"

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.health)
	mux.HandleFunc("/internal/teaching/db-pool", s.dbPoolDiagnostics)
	mux.HandleFunc("/internal/teaching/command-log", s.commandLogDiagnostics)
	mux.HandleFunc("/v1/teaching/archive-items", s.archiveItems)
	mux.HandleFunc("/v1/teaching/archive-items/", s.archiveItemSubresources)
	mux.HandleFunc("/v1/student-app/teaching-materials", s.studentAppTeachingMaterials)
	mux.HandleFunc("/v1/student-app/archive-items", s.studentAppArchiveItems)
	mux.HandleFunc("/v1/student-app/archive-items/", s.studentAppArchiveItemSubresources)
	mux.HandleFunc("/v1/student-app/quiz-submissions", s.studentAppQuizSubmissions)
	mux.HandleFunc("/v1/student-app/quiz-scan-submissions", s.studentAppQuizScanSubmissions)
	mux.HandleFunc("/v1/student-app/question-bank-drafts", s.studentAppQuestionBankDrafts)
	mux.HandleFunc("/v1/student-app/question-bank-draft-content", s.studentAppQuestionBankDraftContent)
	mux.HandleFunc("/v1/student-app/question-bank-draft-answer-submissions", s.studentAppQuestionBankDraftAnswerSubmissions)
	mux.HandleFunc("/v1/student-app/question-bank-draft-answer-submissions/", s.studentAppQuestionBankDraftAnswerSubmissionSubresources)
	mux.HandleFunc("/v1/student-app/ai-tutor-requests", s.studentAppAITutorRequests)
	mux.HandleFunc("/v1/teaching/ai-grading-requests", s.aiGradingRequests)
	mux.HandleFunc("/v1/teaching/ai-grading-requests/", s.aiGradingRequestSubresources)
	mux.HandleFunc("/v1/teaching/quiz-draft-intents", s.quizDraftIntents)
	mux.HandleFunc("/v1/teaching/archive-material-draft-intents", s.archiveMaterialDraftIntents)
	mux.HandleFunc("/v1/teaching/quiz-scan-submissions", s.quizScanSubmissions)
	mux.HandleFunc("/v1/teaching/attendance-statistics", s.attendanceStatistics)
	mux.HandleFunc("/v1/teaching/attendance-sessions", s.attendanceSessions)
	mux.HandleFunc("/v1/teaching/attendance-sessions/", s.attendanceSessionSubresources)
	mux.HandleFunc("/v1/teaching/students/", s.studentAttendanceRecords)
	mux.HandleFunc("/v1/teaching/tutoring-analysis-requests", s.tutoringAnalysisRequests)
	mux.HandleFunc("/v1/teaching/tutoring-analysis-requests/", s.tutoringAnalysisRequestSubresources)
	return mux
}

func (s *Server) studentAppArchiveItemSubresources(w http.ResponseWriter, r *http.Request) {
	if archiveItemID, ok := parseStudentAppArchiveItemAITutorResultRenderedPath(r.URL.Path); ok {
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		s.renderStudentAppArchiveItemAITutorResultHTTP(w, r, archiveItemID)
		return
	}
	if archiveItemID, ok := parseStudentAppArchiveItemAITutorResultPath(r.URL.Path); ok {
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		s.readStudentAppArchiveItemAITutorResultHTTP(w, r, archiveItemID)
		return
	}
	if archiveItemID, ok := parseStudentAppArchiveItemLearningActionsPath(r.URL.Path); ok {
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		s.readStudentAppArchiveItemLearningActionsHTTP(w, r, archiveItemID)
		return
	}
	if archiveItemID, ok := parseStudentAppArchiveItemStudyPacketPath(r.URL.Path); ok {
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		s.readStudentAppArchiveItemStudyPacketHTTP(w, r, archiveItemID)
		return
	}
	if archiveItemID, ok := parseStudentAppArchiveItemContentPreviewRenderedPath(r.URL.Path); ok {
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		s.renderStudentAppArchiveItemContentPreviewHTTP(w, r, archiveItemID)
		return
	}
	if archiveItemID, ok := parseStudentAppArchiveItemContentPreviewPath(r.URL.Path); ok {
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		s.readStudentAppArchiveItemContentPreviewHTTP(w, r, archiveItemID)
		return
	}
	archiveItemID, ok := parseStudentAppArchiveItemPath(r.URL.Path)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "student app archive item subresource not found")
		return
	}
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.readStudentAppArchiveItemMetadata(w, r, archiveItemID)
}

func (s *Server) quizDraftIntents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.submitQuizDraftIntent(w, r)
}

func (s *Server) archiveMaterialDraftIntents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.submitArchiveMaterialDraftIntent(w, r)
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "teaching-archive-gateway"})
}

func (s *Server) archiveItems(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.list(w, r)
	case http.MethodPost:
		s.create(w, r)
	default:
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
	}
}

func (s *Server) archiveItemSubresources(w http.ResponseWriter, r *http.Request) {
	if archiveItemID, ok := parseArchiveItemTutoringAnalysisRequestPath(r.URL.Path); ok {
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		s.createTutoringRequest(w, r, archiveItemID)
		return
	}
	if archiveItemID, ok := parseArchiveItemAIGradingRequestPath(r.URL.Path); ok {
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		s.createAIGrading(w, r, archiveItemID)
		return
	}
	if archiveItemID, submissionID, ok := parseQuizSubmissionAIGradingRequestPath(r.URL.Path); ok {
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		s.createQuizSubmissionAIGradingMetadata(w, r, archiveItemID, submissionID)
		return
	}
	if archiveItemID, ok := parseArchiveItemQuizSubmissionPath(r.URL.Path); ok {
		switch r.Method {
		case http.MethodGet:
			s.listQuizSubmissionMetadata(w, r, archiveItemID)
		case http.MethodPost:
			s.createQuizSubmissionMetadata(w, r, archiveItemID)
		default:
			writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		}
		return
	}
	writeError(w, http.StatusNotFound, "NOT_FOUND", "archive item subresource not found")
}

func (s *Server) tutoringAnalysisRequests(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.listTutoringRequests(w, r)
}

func (s *Server) tutoringAnalysisRequestSubresources(w http.ResponseWriter, r *http.Request) {
	if parseTutoringAnalysisWorkerClaimPath(r.URL.Path) {
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		s.claimTutoringRequest(w, r)
		return
	}

	if requestID, ok := parseTutoringAnalysisAITutorStudyPacketInputPath(r.URL.Path); ok {
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
			return
		}
		s.readAITutorStudyPacketInput(w, r, requestID)
		return
	}

	requestID, ok := parseTutoringAnalysisWorkerResultPath(r.URL.Path)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "tutoring analysis request subresource not found")
		return
	}
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}
	s.recordTutoringResult(w, r, requestID)
}

package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptrace"
	"net/url"
	"time"
)

func createArchiveItem(
	ctx context.Context,
	client *http.Client,
	baseURL string,
	agentAPIKey string,
	opIndex int,
	expectedStatus int,
	clientTrace bool,
) (operationResult, error) {
	body := map[string]any{
		"ownerType":       "TEACHING",
		"materialType":    "QUIZ",
		"title":           fmt.Sprintf("Mixed workload quiz %d", opIndex),
		"source":          "TEACHER_UPLOAD",
		"contentRef":      fmt.Sprintf("local://perf/teaching/go-httpbench/quizzes/%d.json", opIndex),
		"tags":            []string{"performance", "go-httpbench"},
		"analysisIntents": []string{"AI_GRADING", "ARCHIVE_ONLY"},
	}
	var response archiveItemResponse
	result, err := doJSON(ctx, client, http.MethodPost, baseURL+"/v1/teaching/archive-items", agentAPIKey, principalHeader(teacherPrincipal()), body, expectedStatus, clientTrace, &response)
	result.archiveItemID = response.ID
	return result, err
}

func createQuizSubmission(
	ctx context.Context,
	client *http.Client,
	baseURL string,
	agentAPIKey string,
	archiveItemID string,
	opIndex int,
	expectedStatus int,
	clientTrace bool,
) (operationResult, error) {
	body := map[string]any{
		"answerRef": fmt.Sprintf("local://perf/student_perf/go-httpbench/answers/%d.json", opIndex),
	}
	return doJSON(
		ctx,
		client,
		http.MethodPost,
		baseURL+"/v1/teaching/archive-items/"+url.PathEscape(archiveItemID)+"/quiz-submissions",
		agentAPIKey,
		principalHeader(studentPrincipal()),
		body,
		expectedStatus,
		clientTrace,
		nil,
	)
}

func listArchiveItems(ctx context.Context, client *http.Client, baseURL string, agentAPIKey string, clientTrace bool) (operationResult, error) {
	return doJSON(
		ctx,
		client,
		http.MethodGet,
		baseURL+"/v1/teaching/archive-items?ownerType=TEACHING&materialType=QUIZ&pageSize=10",
		agentAPIKey,
		principalHeader(teacherPrincipal()),
		nil,
		http.StatusOK,
		clientTrace,
		nil,
	)
}

func principalHeader(principal map[string]any) string {
	data, err := json.Marshal(principal)
	if err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(data)
}

func teacherPrincipal() map[string]any {
	now := time.Now().UTC()
	return map[string]any{
		"principalId":             "teacher_perf",
		"subjectType":             "USER",
		"role":                    "TEACHER",
		"entryPoint":              "DESKTOP_TEACHER",
		"scopes":                  []string{"TEACHING_READ", "TEACHING_WRITE", "STUDENT_ASSIGNED_READ", "STUDENT_ARCHIVE_WRITE"},
		"knowledgeAccess":         map[string]any{"public": true, "private": "ASSIGNED"},
		"studentAccess":           map[string]any{"mode": "ASSIGNED", "studentIds": []string{"student_perf"}},
		"requiresHarnessApproval": false,
		"sessionId":               "sess_teacher_perf",
		"issuedAt":                now.Add(-time.Minute).Format(time.RFC3339Nano),
		"expiresAt":               now.Add(time.Hour).Format(time.RFC3339Nano),
	}
}

func studentPrincipal() map[string]any {
	now := time.Now().UTC()
	return map[string]any{
		"principalId":             "student_perf",
		"subjectType":             "USER",
		"role":                    "STUDENT",
		"entryPoint":              "STUDENT_APP",
		"scopes":                  []string{"TEACHING_READ", "STUDENT_OWN_READ", "STUDENT_OWN_WRITE"},
		"knowledgeAccess":         map[string]any{"public": true, "private": "NONE"},
		"studentAccess":           map[string]any{"mode": "OWN", "studentIds": []string{"student_perf"}},
		"requiresHarnessApproval": false,
		"sessionId":               "sess_student_perf",
		"issuedAt":                now.Add(-time.Minute).Format(time.RFC3339Nano),
		"expiresAt":               now.Add(time.Hour).Format(time.RFC3339Nano),
	}
}

func doJSON(
	ctx context.Context,
	client *http.Client,
	method string,
	endpoint string,
	agentAPIKey string,
	principalContext string,
	payload any,
	expectedStatus int,
	clientTrace bool,
	responseTarget any,
) (operationResult, error) {
	var trace clientRequestTrace
	if clientTrace {
		trace = clientRequestTrace{requestStart: time.Now()}
	}
	var body io.Reader = http.NoBody
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return operationResult{}, err
		}
		body = bytes.NewReader(data)
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return operationResult{}, err
	}
	if payload != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if agentAPIKey != "" {
		request.Header.Set("X-Agent-Api-Key", agentAPIKey)
	}
	if principalContext != "" {
		request.Header.Set("X-Principal-Context", principalContext)
	}
	if clientTrace {
		trace.requestPrepared = time.Now()
		request = request.WithContext(httptrace.WithClientTrace(request.Context(), newClientTrace(&trace)))
	}
	response, err := client.Do(request)
	if err != nil {
		if clientTrace {
			trace.responseClosed = time.Now()
			return operationResult{clientTraceTimings: trace.durations()}, err
		}
		return operationResult{}, err
	}
	result := operationResultFromResponse(response)
	responseBody, readErr := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	_ = response.Body.Close()
	if response.StatusCode != expectedStatus {
		if clientTrace {
			trace.responseClosed = time.Now()
			result.clientTraceTimings = trace.durations()
		}
		return result, fmt.Errorf("%s %s status = %d body = %s", method, endpoint, response.StatusCode, string(responseBody))
	}
	if readErr != nil {
		if clientTrace {
			trace.responseClosed = time.Now()
			result.clientTraceTimings = trace.durations()
		}
		return result, readErr
	}
	if responseTarget != nil && len(bytes.TrimSpace(responseBody)) > 0 {
		if err := json.Unmarshal(responseBody, responseTarget); err != nil {
			if clientTrace {
				trace.responseClosed = time.Now()
				result.clientTraceTimings = trace.durations()
			}
			return result, err
		}
	}
	if clientTrace {
		trace.responseClosed = time.Now()
		result.clientTraceTimings = trace.durations()
	}
	return result, nil
}

func newClientTrace(trace *clientRequestTrace) *httptrace.ClientTrace {
	return &httptrace.ClientTrace{
		GotConn: func(_ httptrace.GotConnInfo) {
			trace.gotConn = time.Now()
		},
		WroteRequest: func(_ httptrace.WroteRequestInfo) {
			trace.wroteRequest = time.Now()
		},
		GotFirstResponseByte: func() {
			trace.gotFirstResponseByte = time.Now()
		},
	}
}

func (trace clientRequestTrace) durations() map[string]time.Duration {
	durations := map[string]time.Duration{}
	addDuration(durations, "client.request_prepare", trace.requestStart, trace.requestPrepared)
	addDuration(durations, "client.transport_wait", trace.requestPrepared, trace.gotConn)
	addDuration(durations, "client.request_write", trace.gotConn, trace.wroteRequest)
	addDuration(durations, "client.first_response_byte_wait", trace.wroteRequest, trace.gotFirstResponseByte)
	addDuration(durations, "client.response_body_read", trace.gotFirstResponseByte, trace.responseClosed)
	addDuration(durations, "client.round_trip", trace.requestPrepared, trace.responseClosed)
	return durations
}

func addDuration(durations map[string]time.Duration, name string, start time.Time, end time.Time) {
	if start.IsZero() || end.IsZero() || end.Before(start) {
		return
	}
	durations[name] = end.Sub(start)
}

func operationResultFromResponse(response *http.Response) operationResult {
	timings := parseServerTimingDurations(response.Header.Get("Server-Timing"))
	if len(timings) == 0 {
		return operationResult{}
	}
	return operationResult{serverTimings: timings}
}

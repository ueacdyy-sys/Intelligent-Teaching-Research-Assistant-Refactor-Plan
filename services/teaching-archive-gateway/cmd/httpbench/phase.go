package main

import (
	"context"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

func runCreateArchiveItemPhase(ctx context.Context, client *http.Client, baseURLs []string, config benchmarkConfig) (phaseReport, []string) {
	expectedStatus, _ := expectedWriteStatus(config)
	execution := runPhase("createArchiveItem", config.Concurrency, config.Operations, func(_ int, opIndex int) (operationResult, error) {
		return createArchiveItem(ctx, client, baseURLForOperation(baseURLs, opIndex), config.AgentAPIKey, opIndex, expectedStatus, config.ClientTrace)
	})
	if execution.firstErr != nil {
		execution.report.FirstError = execution.firstErr.Error()
	}
	return execution.report, archiveItemIDs(execution.results)
}

func runCreateQuizSubmissionPhase(
	ctx context.Context,
	client *http.Client,
	baseURLs []string,
	config benchmarkConfig,
	archiveItemIDs []string,
) phaseReport {
	expectedStatus, _ := expectedWriteStatus(config)
	if len(archiveItemIDs) == 0 {
		return failedPhase("createQuizSubmission", config.Operations, "createArchiveItem produced no archive item ids")
	}
	execution := runPhase("createQuizSubmission", config.Concurrency, config.Operations, func(_ int, opIndex int) (operationResult, error) {
		archiveItemID := archiveItemIDs[opIndex%len(archiveItemIDs)]
		return createQuizSubmission(ctx, client, baseURLForOperation(baseURLs, opIndex), config.AgentAPIKey, archiveItemID, opIndex, expectedStatus, config.ClientTrace)
	})
	if execution.firstErr != nil {
		execution.report.FirstError = execution.firstErr.Error()
	}
	return execution.report
}

func runListArchiveItemsPhase(ctx context.Context, client *http.Client, baseURLs []string, config benchmarkConfig) phaseReport {
	execution := runPhase("listArchiveItems", config.Concurrency, config.Operations, func(_ int, opIndex int) (operationResult, error) {
		return listArchiveItems(ctx, client, baseURLForOperation(baseURLs, opIndex), config.AgentAPIKey, config.ClientTrace)
	})
	if execution.firstErr != nil {
		execution.report.FirstError = execution.firstErr.Error()
	}
	return execution.report
}

type operationResult struct {
	serverTimings      map[string]time.Duration
	clientTraceTimings map[string]time.Duration
	archiveItemID      string
}

type archiveItemResponse struct {
	ID string `json:"id"`
}

type phaseExecution struct {
	report   phaseReport
	results  []operationResult
	firstErr error
}

func archiveItemIDs(results []operationResult) []string {
	ids := make([]string, 0, len(results))
	for _, result := range results {
		if result.archiveItemID != "" {
			ids = append(ids, result.archiveItemID)
		}
	}
	return ids
}

func failedPhase(name string, operations int, firstError string) phaseReport {
	return phaseReport{
		Name:       name,
		Operations: operations,
		Errors:     int64(operations),
		FirstError: firstError,
		LatencyMS:  latencySummary{},
	}
}

type clientRequestTrace struct {
	requestStart         time.Time
	requestPrepared      time.Time
	gotConn              time.Time
	wroteRequest         time.Time
	gotFirstResponseByte time.Time
	responseClosed       time.Time
}

func runPhase(
	name string,
	concurrency int,
	operations int,
	workerFunc func(workerID int, opIndex int) (operationResult, error),
) phaseExecution {
	latencies := make([]time.Duration, operations)
	serverTimings := make([]map[string]time.Duration, operations)
	clientTraceTimings := make([]map[string]time.Duration, operations)
	results := make([]operationResult, operations)
	jobs := make(chan int)
	var errorsCount int64
	var firstErr error
	var firstErrMu sync.Mutex
	var wg sync.WaitGroup
	start := time.Now()

	for worker := 0; worker < concurrency; worker++ {
		workerID := worker
		wg.Add(1)
		go func() {
			defer wg.Done()
			for opIndex := range jobs {
				opStart := time.Now()
				result, err := workerFunc(workerID, opIndex)
				if err != nil {
					atomic.AddInt64(&errorsCount, 1)
					firstErrMu.Lock()
					if firstErr == nil {
						firstErr = err
					}
					firstErrMu.Unlock()
				}
				if len(result.serverTimings) > 0 {
					serverTimings[opIndex] = result.serverTimings
				}
				if len(result.clientTraceTimings) > 0 {
					clientTraceTimings[opIndex] = result.clientTraceTimings
				}
				results[opIndex] = result
				latencies[opIndex] = time.Since(opStart)
			}
		}()
	}
	for opIndex := 0; opIndex < operations; opIndex++ {
		jobs <- opIndex
	}
	close(jobs)
	wg.Wait()

	return phaseExecution{
		report:   buildPhaseReport(name, latencies, serverTimings, clientTraceTimings, errorsCount, time.Since(start)),
		results:  results,
		firstErr: firstErr,
	}
}

func buildPhaseReport(
	name string,
	latencies []time.Duration,
	serverTimings []map[string]time.Duration,
	clientTraceTimings []map[string]time.Duration,
	errorsCount int64,
	duration time.Duration,
) phaseReport {
	seconds := duration.Seconds()
	rps := 0.0
	if seconds > 0 {
		rps = roundFloat(float64(len(latencies)) / seconds)
	}
	report := phaseReport{
		Name:       name,
		Operations: len(latencies),
		Errors:     errorsCount,
		RPS:        rps,
		LatencyMS:  summarizeLatencies(latencies),
	}
	serverTimingBreakdown := observedTimings(serverTimings)
	if len(serverTimingBreakdown) > 0 {
		report.ServerTimingBreakdownMS = map[string]latencySummary{}
		report.ServerTimingBreakdownSamples = map[string]int{}
		for metricName, values := range serverTimingBreakdown {
			report.ServerTimingBreakdownMS[metricName] = summarizeLatencies(values)
			report.ServerTimingBreakdownSamples[metricName] = len(values)
		}
		if values := serverTimingBreakdown["app"]; len(values) > 0 {
			summary := summarizeLatencies(values)
			report.ServerTimingMS = &summary
			report.ServerTimingSamples = len(values)
		}
	} else {
		report.ServerTimingBreakdownMS = nil
		report.ServerTimingBreakdownSamples = nil
	}
	if report.ServerTimingMS == nil && len(serverTimingBreakdown["app"]) > 0 {
		summary := summarizeLatencies(serverTimingBreakdown["app"])
		report.ServerTimingMS = &summary
		report.ServerTimingSamples = len(serverTimingBreakdown["app"])
	}
	if gaps := observedClientServerGaps(latencies, serverTimings); len(gaps) > 0 {
		summary := summarizeLatencies(gaps)
		report.ClientServerGapMS = &summary
		report.ClientServerGapSamples = len(gaps)
	}
	clientTraceBreakdown := observedTimings(clientTraceTimings)
	if gaps := observedClientFirstByteAppGaps(clientTraceTimings, serverTimings); len(gaps) > 0 {
		if clientTraceBreakdown == nil {
			clientTraceBreakdown = map[string][]time.Duration{}
		}
		clientTraceBreakdown["client.first_byte_app_gap"] = gaps
	}
	if len(clientTraceBreakdown) > 0 {
		report.ClientTraceBreakdownMS = map[string]latencySummary{}
		report.ClientTraceBreakdownSamples = map[string]int{}
		for metricName, values := range clientTraceBreakdown {
			report.ClientTraceBreakdownMS[metricName] = summarizeLatencies(values)
			report.ClientTraceBreakdownSamples[metricName] = len(values)
		}
	}
	return report
}

func summarizeLatencies(latencies []time.Duration) latencySummary {
	if len(latencies) == 0 {
		return latencySummary{}
	}
	sorted := append([]time.Duration(nil), latencies...)
	sort.Slice(sorted, func(left int, right int) bool {
		return sorted[left] < sorted[right]
	})
	var total time.Duration
	for _, latency := range sorted {
		total += latency
	}
	return latencySummary{
		MinMS: roundMillis(sorted[0]),
		AvgMS: roundMillis(total / time.Duration(len(sorted))),
		P50MS: roundMillis(percentile(sorted, 50)),
		P95MS: roundMillis(percentile(sorted, 95)),
		P99MS: roundMillis(percentile(sorted, 99)),
		MaxMS: roundMillis(sorted[len(sorted)-1]),
	}
}

func percentile(sorted []time.Duration, p int) time.Duration {
	if len(sorted) == 0 {
		return 0
	}
	index := int(math.Ceil((float64(p)/100)*float64(len(sorted)))) - 1
	if index < 0 {
		index = 0
	}
	if index >= len(sorted) {
		index = len(sorted) - 1
	}
	return sorted[index]
}

func observedTimings(values []map[string]time.Duration) map[string][]time.Duration {
	timings := map[string][]time.Duration{}
	for _, metrics := range values {
		for name, value := range metrics {
			timings[name] = append(timings[name], value)
		}
	}
	return timings
}

func observedClientServerGaps(latencies []time.Duration, serverTimings []map[string]time.Duration) []time.Duration {
	gaps := make([]time.Duration, 0, len(serverTimings))
	for index, metrics := range serverTimings {
		if index >= len(latencies) {
			break
		}
		serverTiming, ok := metrics["handler"]
		if !ok {
			serverTiming, ok = metrics["app"]
		}
		if !ok {
			continue
		}
		gap := latencies[index] - serverTiming
		if gap < 0 {
			gap = 0
		}
		gaps = append(gaps, gap)
	}
	return gaps
}

func observedClientFirstByteAppGaps(clientTraceTimings []map[string]time.Duration, serverTimings []map[string]time.Duration) []time.Duration {
	limit := len(clientTraceTimings)
	if len(serverTimings) < limit {
		limit = len(serverTimings)
	}
	gaps := make([]time.Duration, 0, limit)
	for index := 0; index < limit; index++ {
		firstByteWait, hasFirstByteWait := clientTraceTimings[index]["client.first_response_byte_wait"]
		serverTiming, hasServerTiming := serverTimings[index]["handler"]
		if !hasServerTiming {
			serverTiming, hasServerTiming = serverTimings[index]["app"]
		}
		if !hasFirstByteWait || !hasServerTiming {
			continue
		}
		gap := firstByteWait - serverTiming
		if gap < 0 {
			gap = 0
		}
		gaps = append(gaps, gap)
	}
	return gaps
}

func parseServerTimingDurations(value string) map[string]time.Duration {
	timings := map[string]time.Duration{}
	for _, metric := range strings.Split(value, ",") {
		parts := strings.Split(metric, ";")
		name := strings.TrimSpace(parts[0])
		if len(parts) < 2 || name == "" {
			continue
		}
		for _, attribute := range parts[1:] {
			attribute = strings.TrimSpace(attribute)
			if !strings.HasPrefix(attribute, "dur=") {
				continue
			}
			durationMS, err := strconv.ParseFloat(strings.TrimPrefix(attribute, "dur="), 64)
			if err != nil {
				continue
			}
			timings[name] = time.Duration(durationMS * float64(time.Millisecond))
		}
	}
	return timings
}

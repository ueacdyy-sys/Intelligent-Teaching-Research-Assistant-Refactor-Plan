package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const (
	gatewayDatabaseDiagnosticsPath  = "/internal/identity/session-db-pool"
	internalDiagnosticsSecretHeader = "X-Internal-Diagnostics-Secret"
	maskedSecretValue               = "***"
)

type gatewayDatabaseDiagnosticsSnapshot struct {
	Endpoint     string                              `json:"endpoint"`
	SecretHeader string                              `json:"secretHeader"`
	SampledAt    string                              `json:"sampledAt"`
	Gateways     []gatewayDatabaseDiagnosticsGateway `json:"gateways"`
}

type gatewayDatabaseDiagnosticsGateway struct {
	BaseURL      string         `json:"baseUrl"`
	Status       string         `json:"status"`
	HTTPStatus   int            `json:"httpStatus,omitempty"`
	Stats        map[string]any `json:"stats,omitempty"`
	ErrorMessage string         `json:"errorMessage,omitempty"`
}

type gatewayDatabasePhaseDiagnostics struct {
	Before gatewayDatabaseDiagnosticsSnapshot `json:"before"`
	After  gatewayDatabaseDiagnosticsSnapshot `json:"after"`
	Delta  gatewayDatabaseDiagnosticsDelta    `json:"delta"`
}

type gatewayDatabaseDiagnosticsDelta struct {
	Pool              gatewayDatabasePoolDelta                        `json:"pool"`
	SessionOperations map[string]gatewayDatabaseSessionOperationDelta `json:"sessionOperations,omitempty"`
}

type gatewayDatabasePoolDelta struct {
	AcquireCount              int64   `json:"acquireCount"`
	AcquireDurationMS         float64 `json:"acquireDurationMs"`
	EmptyAcquireWaitTimeMS    float64 `json:"emptyAcquireWaitTimeMs"`
	CanceledAcquireCount      int64   `json:"canceledAcquireCount"`
	CanceledAcquireWaitTimeMS float64 `json:"canceledAcquireWaitTimeMs"`
}

type gatewayDatabaseSessionOperationDelta struct {
	Count                       int64   `json:"count"`
	TotalElapsedMS              float64 `json:"totalElapsedMs"`
	AverageElapsedMS            float64 `json:"averageElapsedMs"`
	PoolAcquireCount            int64   `json:"poolAcquireCount,omitempty"`
	PoolAcquireElapsedMS        float64 `json:"poolAcquireElapsedMs,omitempty"`
	AveragePoolAcquireElapsedMS float64 `json:"averagePoolAcquireElapsedMs,omitempty"`
	DBExecuteElapsedMS          float64 `json:"dbExecuteElapsedMs,omitempty"`
	AverageDBExecuteElapsedMS   float64 `json:"averageDbExecuteElapsedMs,omitempty"`
	RowsAffectedCount           int64   `json:"rowsAffectedCount,omitempty"`
	RowsAffected                int64   `json:"rowsAffected,omitempty"`
	AverageRowsAffected         float64 `json:"averageRowsAffected,omitempty"`
}

type gatewayDatabaseDiagnosticsCollector struct {
	client   *http.Client
	baseURLs []string
	secret   string
	now      func() time.Time
	phases   map[string]gatewayDatabasePhaseDiagnostics
}

func newGatewayDatabaseDiagnosticsCollector(config benchmarkConfig) (*gatewayDatabaseDiagnosticsCollector, error) {
	if strings.TrimSpace(config.GatewayDiagnosticsBaseURL) == "" {
		return nil, nil
	}
	if strings.TrimSpace(config.GatewayDiagnosticsSecret) == "" {
		return nil, errors.New("gateway-diagnostics-secret is required when gateway diagnostics base URL is configured")
	}
	baseURLs, err := parseBaseURLs(config.GatewayDiagnosticsBaseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid gateway diagnostics base URL: %w", err)
	}
	return &gatewayDatabaseDiagnosticsCollector{
		client:   &http.Client{Timeout: 5 * time.Second},
		baseURLs: baseURLs,
		secret:   config.GatewayDiagnosticsSecret,
		now:      func() time.Time { return time.Now().UTC() },
		phases:   map[string]gatewayDatabasePhaseDiagnostics{},
	}, nil
}

func (collector *gatewayDatabaseDiagnosticsCollector) collect(ctx context.Context) gatewayDatabaseDiagnosticsSnapshot {
	if collector == nil {
		return gatewayDatabaseDiagnosticsSnapshot{}
	}
	return collectGatewayDatabaseDiagnostics(ctx, collector.client, collector.baseURLs, collector.secret, collector.now)
}

func (collector *gatewayDatabaseDiagnosticsCollector) recordPhase(
	phase string,
	before gatewayDatabaseDiagnosticsSnapshot,
	after gatewayDatabaseDiagnosticsSnapshot,
) {
	if collector == nil {
		return
	}
	collector.phases[phase] = buildGatewayDatabasePhaseDiagnostics(before, after)
}

func collectGatewayDatabaseDiagnostics(
	ctx context.Context,
	client *http.Client,
	baseURLs []string,
	secret string,
	now func() time.Time,
) gatewayDatabaseDiagnosticsSnapshot {
	snapshot := gatewayDatabaseDiagnosticsSnapshot{
		Endpoint:     gatewayDatabaseDiagnosticsPath,
		SecretHeader: internalDiagnosticsSecretHeader,
		SampledAt:    now().UTC().Format(time.RFC3339Nano),
		Gateways:     make([]gatewayDatabaseDiagnosticsGateway, 0, len(baseURLs)),
	}
	for _, baseURL := range baseURLs {
		trimmedBaseURL := strings.TrimRight(baseURL, "/")
		gateway := gatewayDatabaseDiagnosticsGateway{BaseURL: maskURL(trimmedBaseURL)}
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, trimmedBaseURL+gatewayDatabaseDiagnosticsPath, nil)
		if err != nil {
			gateway.Status = "ERROR"
			gateway.ErrorMessage = maskSensitive(err.Error())
			snapshot.Gateways = append(snapshot.Gateways, gateway)
			continue
		}
		request.Header.Set(internalDiagnosticsSecretHeader, secret)
		response, err := client.Do(request)
		if err != nil {
			gateway.Status = "ERROR"
			gateway.ErrorMessage = maskSensitive(err.Error())
			snapshot.Gateways = append(snapshot.Gateways, gateway)
			continue
		}
		func() {
			defer response.Body.Close()
			gateway.HTTPStatus = response.StatusCode
			if response.StatusCode < 200 || response.StatusCode >= 300 {
				gateway.Status = "UNAVAILABLE"
				return
			}
			var body struct {
				Stats map[string]any `json:"stats"`
			}
			if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
				gateway.Status = "ERROR"
				gateway.ErrorMessage = maskSensitive(err.Error())
				return
			}
			gateway.Status = "OK"
			gateway.Stats = sanitizeDiagnosticsStats(body.Stats)
		}()
		snapshot.Gateways = append(snapshot.Gateways, gateway)
	}
	return snapshot
}

func buildGatewayDatabasePhaseDiagnostics(
	before gatewayDatabaseDiagnosticsSnapshot,
	after gatewayDatabaseDiagnosticsSnapshot,
) gatewayDatabasePhaseDiagnostics {
	return gatewayDatabasePhaseDiagnostics{
		Before: before,
		After:  after,
		Delta:  buildGatewayDatabaseDiagnosticsDelta(before, after),
	}
}

func buildGatewayDatabaseDiagnosticsDelta(
	before gatewayDatabaseDiagnosticsSnapshot,
	after gatewayDatabaseDiagnosticsSnapshot,
) gatewayDatabaseDiagnosticsDelta {
	beforePool := summarizeGatewayDatabasePoolSnapshot(before)
	afterPool := summarizeGatewayDatabasePoolSnapshot(after)
	beforeOperations := summarizeGatewayDatabaseSessionOperations(before)
	afterOperations := summarizeGatewayDatabaseSessionOperations(after)
	return gatewayDatabaseDiagnosticsDelta{
		Pool: gatewayDatabasePoolDelta{
			AcquireCount:              afterPool.AcquireCount - beforePool.AcquireCount,
			AcquireDurationMS:         roundFloat(afterPool.AcquireDurationMS - beforePool.AcquireDurationMS),
			EmptyAcquireWaitTimeMS:    roundFloat(afterPool.EmptyAcquireWaitTimeMS - beforePool.EmptyAcquireWaitTimeMS),
			CanceledAcquireCount:      afterPool.CanceledAcquireCount - beforePool.CanceledAcquireCount,
			CanceledAcquireWaitTimeMS: roundFloat(afterPool.CanceledAcquireWaitTimeMS - beforePool.CanceledAcquireWaitTimeMS),
		},
		SessionOperations: deltaGatewayDatabaseSessionOperations(beforeOperations, afterOperations),
	}
}

func summarizeGatewayDatabasePoolSnapshot(snapshot gatewayDatabaseDiagnosticsSnapshot) gatewayDatabasePoolDelta {
	var summary gatewayDatabasePoolDelta
	for _, gateway := range snapshot.Gateways {
		stats := gateway.Stats
		if len(stats) == 0 {
			continue
		}
		summary.AcquireCount += int64(numberFromMap(stats, "acquireCount"))
		summary.AcquireDurationMS += numberFromMap(stats, "acquireDurationMs")
		summary.EmptyAcquireWaitTimeMS += numberFromMap(stats, "emptyAcquireWaitTimeMs")
		summary.CanceledAcquireCount += int64(numberFromMap(stats, "canceledAcquireCount"))
		summary.CanceledAcquireWaitTimeMS += numberFromMap(stats, "canceledAcquireWaitTimeMs")
	}
	summary.AcquireDurationMS = roundFloat(summary.AcquireDurationMS)
	summary.EmptyAcquireWaitTimeMS = roundFloat(summary.EmptyAcquireWaitTimeMS)
	summary.CanceledAcquireWaitTimeMS = roundFloat(summary.CanceledAcquireWaitTimeMS)
	return summary
}

func summarizeGatewayDatabaseSessionOperations(
	snapshot gatewayDatabaseDiagnosticsSnapshot,
) map[string]gatewayDatabaseSessionOperationDelta {
	summary := map[string]gatewayDatabaseSessionOperationDelta{}
	for _, gateway := range snapshot.Gateways {
		operations := mapFromAny(gateway.Stats["sessionOperations"])
		for operationName, value := range operations {
			operationStats := mapFromAny(value)
			current := summary[operationName]
			current.Count += int64(numberFromMap(operationStats, "count"))
			current.TotalElapsedMS += numberFromMap(operationStats, "totalElapsedMs")
			current.PoolAcquireCount += int64(numberFromMap(operationStats, "poolAcquireCount"))
			current.PoolAcquireElapsedMS += numberFromMap(operationStats, "poolAcquireElapsedMs")
			current.DBExecuteElapsedMS += numberFromMap(operationStats, "dbExecuteElapsedMs")
			current.RowsAffectedCount += int64(numberFromMap(operationStats, "rowsAffectedCount"))
			current.RowsAffected += int64(numberFromMap(operationStats, "rowsAffected"))
			summary[operationName] = current
		}
	}
	for operationName, operation := range summary {
		operation.TotalElapsedMS = roundFloat(operation.TotalElapsedMS)
		operation.PoolAcquireElapsedMS = roundFloat(operation.PoolAcquireElapsedMS)
		operation.DBExecuteElapsedMS = roundFloat(operation.DBExecuteElapsedMS)
		if operation.Count > 0 {
			operation.AverageElapsedMS = roundFloat(operation.TotalElapsedMS / float64(operation.Count))
			operation.AverageDBExecuteElapsedMS = roundFloat(operation.DBExecuteElapsedMS / float64(operation.Count))
		}
		if operation.PoolAcquireCount > 0 {
			operation.AveragePoolAcquireElapsedMS = roundFloat(
				operation.PoolAcquireElapsedMS / float64(operation.PoolAcquireCount),
			)
		}
		if operation.RowsAffectedCount > 0 {
			operation.AverageRowsAffected = roundFloat(float64(operation.RowsAffected) / float64(operation.RowsAffectedCount))
		}
		summary[operationName] = operation
	}
	return summary
}

func deltaGatewayDatabaseSessionOperations(
	before map[string]gatewayDatabaseSessionOperationDelta,
	after map[string]gatewayDatabaseSessionOperationDelta,
) map[string]gatewayDatabaseSessionOperationDelta {
	operationNames := map[string]struct{}{}
	for operationName := range before {
		operationNames[operationName] = struct{}{}
	}
	for operationName := range after {
		operationNames[operationName] = struct{}{}
	}
	deltas := map[string]gatewayDatabaseSessionOperationDelta{}
	for operationName := range operationNames {
		beforeOperation := before[operationName]
		afterOperation := after[operationName]
		delta := gatewayDatabaseSessionOperationDelta{
			Count:                afterOperation.Count - beforeOperation.Count,
			TotalElapsedMS:       roundFloat(afterOperation.TotalElapsedMS - beforeOperation.TotalElapsedMS),
			PoolAcquireCount:     afterOperation.PoolAcquireCount - beforeOperation.PoolAcquireCount,
			PoolAcquireElapsedMS: roundFloat(afterOperation.PoolAcquireElapsedMS - beforeOperation.PoolAcquireElapsedMS),
			DBExecuteElapsedMS:   roundFloat(afterOperation.DBExecuteElapsedMS - beforeOperation.DBExecuteElapsedMS),
			RowsAffectedCount:    afterOperation.RowsAffectedCount - beforeOperation.RowsAffectedCount,
			RowsAffected:         afterOperation.RowsAffected - beforeOperation.RowsAffected,
		}
		if delta.Count > 0 {
			delta.AverageElapsedMS = roundFloat(delta.TotalElapsedMS / float64(delta.Count))
			delta.AverageDBExecuteElapsedMS = roundFloat(delta.DBExecuteElapsedMS / float64(delta.Count))
		}
		if delta.PoolAcquireCount > 0 {
			delta.AveragePoolAcquireElapsedMS = roundFloat(delta.PoolAcquireElapsedMS / float64(delta.PoolAcquireCount))
		}
		if delta.RowsAffectedCount > 0 {
			delta.AverageRowsAffected = roundFloat(float64(delta.RowsAffected) / float64(delta.RowsAffectedCount))
		}
		if delta.Count != 0 || delta.TotalElapsedMS != 0 || delta.PoolAcquireCount != 0 ||
			delta.PoolAcquireElapsedMS != 0 || delta.DBExecuteElapsedMS != 0 ||
			delta.RowsAffectedCount != 0 || delta.RowsAffected != 0 {
			deltas[operationName] = delta
		}
	}
	if len(deltas) == 0 {
		return nil
	}
	return deltas
}

func sanitizeDiagnosticsStats(stats map[string]any) map[string]any {
	if stats == nil {
		return nil
	}
	sanitized := map[string]any{}
	for key, value := range stats {
		sanitized[key] = sanitizeDiagnosticsValue(value)
	}
	return sanitized
}

func sanitizeDiagnosticsValue(value any) any {
	switch typed := value.(type) {
	case string:
		return maskSensitive(typed)
	case []any:
		sanitized := make([]any, 0, len(typed))
		for _, item := range typed {
			sanitized = append(sanitized, sanitizeDiagnosticsValue(item))
		}
		return sanitized
	case map[string]any:
		return sanitizeDiagnosticsStats(typed)
	default:
		return value
	}
}

func mapFromAny(value any) map[string]any {
	if typed, ok := value.(map[string]any); ok {
		return typed
	}
	return nil
}

func numberFromMap(values map[string]any, key string) float64 {
	switch typed := values[key].(type) {
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int64:
		return float64(typed)
	case json.Number:
		value, _ := typed.Float64()
		return value
	default:
		return 0
	}
}

func maskSensitive(value string) string {
	return strings.ReplaceAll(value, "ueacd", maskedSecretValue)
}

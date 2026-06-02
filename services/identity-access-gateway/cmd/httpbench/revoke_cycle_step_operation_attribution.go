package main

type stepOperationAttribution struct {
	StepLatencyMS             *latencySummary                                      `json:"stepLatencyMs,omitempty"`
	ExpectedSessionOperations []string                                             `json:"expectedSessionOperations,omitempty"`
	MissingSessionOperations  []string                                             `json:"missingSessionOperations,omitempty"`
	SessionOperations         map[string]gatewayDatabaseSessionOperationDelta      `json:"sessionOperations,omitempty"`
	WriteLimiterOperations    map[string]gatewayDatabaseWriteLimiterOperationDelta `json:"writeLimiterOperations,omitempty"`
}

type revokeCycleStepOperationSpec struct {
	stepName       string
	operationNames []string
}

var revokeCycleStepOperationSpecs = []revokeCycleStepOperationSpec{
	{stepName: "login", operationNames: []string{"saveSession"}},
	{stepName: "revoke", operationNames: []string{"revokeOwnSession"}},
	{stepName: "revokedPrincipalLookup", operationNames: []string{"getPrincipalByAccessToken"}},
}

func buildRevokeCycleStepOperationAttribution(
	stepLatencies map[string]latencySummary,
	phaseDiagnostics gatewayDatabasePhaseDiagnostics,
) map[string]stepOperationAttribution {
	attribution := make(map[string]stepOperationAttribution, len(revokeCycleStepOperationSpecs))
	observedOperation := false
	for _, spec := range revokeCycleStepOperationSpecs {
		entry := stepOperationAttribution{
			ExpectedSessionOperations: append([]string(nil), spec.operationNames...),
		}
		if latency, ok := stepLatencies[spec.stepName]; ok {
			latencyCopy := latency
			entry.StepLatencyMS = &latencyCopy
		}
		for _, operationName := range spec.operationNames {
			operation, ok := phaseDiagnostics.Delta.SessionOperations[operationName]
			if ok {
				if entry.SessionOperations == nil {
					entry.SessionOperations = map[string]gatewayDatabaseSessionOperationDelta{}
				}
				entry.SessionOperations[operationName] = operation
				observedOperation = true
			} else {
				entry.MissingSessionOperations = append(entry.MissingSessionOperations, operationName)
			}
			if phaseDiagnostics.Delta.WriteLimiter != nil {
				limiterOperation, ok := phaseDiagnostics.Delta.WriteLimiter.Operations[operationName]
				if ok {
					if entry.WriteLimiterOperations == nil {
						entry.WriteLimiterOperations = map[string]gatewayDatabaseWriteLimiterOperationDelta{}
					}
					entry.WriteLimiterOperations[operationName] = limiterOperation
					observedOperation = true
				}
			}
		}
		attribution[spec.stepName] = entry
	}
	if !observedOperation {
		return nil
	}
	return attribution
}

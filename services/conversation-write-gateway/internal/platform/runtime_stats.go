package platform

type ConversationRuntimeStats struct {
	AcceptedConns   int64 `json:"acceptedConns"`
	CurrentConns    int64 `json:"currentConns"`
	MaxCurrentConns int64 `json:"maxCurrentConns"`
	ActiveConns     int64 `json:"activeConns"`
	IdleConns       int64 `json:"idleConns"`
	HijackedConns   int64 `json:"hijackedConns"`
	ClosedConns     int64 `json:"closedConns"`
}

type ConversationRuntimeStatsProvider interface {
	ConversationRuntimeStats() ConversationRuntimeStats
}

type ConversationCommandLogStats struct {
	AcceptedCommands    int64   `json:"acceptedCommands"`
	AppendErrors        int64   `json:"appendErrors"`
	ProjectionEnqueued  int64   `json:"projectionEnqueued"`
	ProjectionSucceeded int64   `json:"projectionSucceeded"`
	ProjectionFailed    int64   `json:"projectionFailed"`
	QueueDepth          int     `json:"queueDepth"`
	QueueCapacity       int     `json:"queueCapacity"`
	OldestPendingAgeMs  float64 `json:"oldestPendingAgeMs"`
}

type ConversationCommandLogStatsProvider interface {
	ConversationCommandLogStats() ConversationCommandLogStats
}

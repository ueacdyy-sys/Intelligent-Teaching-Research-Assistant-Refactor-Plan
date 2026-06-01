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

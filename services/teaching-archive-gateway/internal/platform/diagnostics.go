package platform

type TeachingArchiveDBPoolStats struct {
	MaxConns                int32   `json:"maxConns"`
	TotalConns              int32   `json:"totalConns"`
	AcquiredConns           int32   `json:"acquiredConns"`
	IdleConns               int32   `json:"idleConns"`
	ConstructingConns       int32   `json:"constructingConns"`
	AcquireCount            int64   `json:"acquireCount"`
	AcquireDurationMs       float64 `json:"acquireDurationMs"`
	CanceledAcquireCount    int64   `json:"canceledAcquireCount"`
	EmptyAcquireCount       int64   `json:"emptyAcquireCount"`
	EmptyAcquireWaitTimeMs  float64 `json:"emptyAcquireWaitTimeMs"`
	NewConnsCount           int64   `json:"newConnsCount"`
	MaxIdleDestroyCount     int64   `json:"maxIdleDestroyCount"`
	MaxLifetimeDestroyCount int64   `json:"maxLifetimeDestroyCount"`
}

type TeachingArchiveDBPoolStatsProvider interface {
	TeachingArchiveDBPoolStats() TeachingArchiveDBPoolStats
}

type TeachingCommandLogStats struct {
	AcceptedCommands    int64   `json:"acceptedCommands"`
	AppendErrors        int64   `json:"appendErrors"`
	ProjectionEnqueued  int64   `json:"projectionEnqueued"`
	ProjectionSucceeded int64   `json:"projectionSucceeded"`
	ProjectionFailed    int64   `json:"projectionFailed"`
	QueueDepth          int     `json:"queueDepth"`
	QueueCapacity       int     `json:"queueCapacity"`
	OldestPendingAgeMs  float64 `json:"oldestPendingAgeMs"`
}

type TeachingCommandLogStatsProvider interface {
	TeachingCommandLogStats() TeachingCommandLogStats
}

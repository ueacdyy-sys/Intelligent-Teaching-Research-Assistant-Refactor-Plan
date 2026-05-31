package platform

type SessionDBPoolStats struct {
	MaxConns                int32                    `json:"maxConns"`
	TotalConns              int32                    `json:"totalConns"`
	AcquiredConns           int32                    `json:"acquiredConns"`
	IdleConns               int32                    `json:"idleConns"`
	ConstructingConns       int32                    `json:"constructingConns"`
	AcquireCount            int64                    `json:"acquireCount"`
	AcquireDurationMs       float64                  `json:"acquireDurationMs"`
	CanceledAcquireCount    int64                    `json:"canceledAcquireCount"`
	EmptyAcquireCount       int64                    `json:"emptyAcquireCount"`
	EmptyAcquireWaitTimeMs  float64                  `json:"emptyAcquireWaitTimeMs"`
	NewConnsCount           int64                    `json:"newConnsCount"`
	MaxIdleDestroyCount     int64                    `json:"maxIdleDestroyCount"`
	MaxLifetimeDestroyCount int64                    `json:"maxLifetimeDestroyCount"`
	WriteLimiter            SessionWriteLimiterStats `json:"writeLimiter"`
}

type SessionWriteLimiterStats struct {
	Enabled                   bool    `json:"enabled"`
	Limit                     int     `json:"limit"`
	InUse                     int     `json:"inUse"`
	Waiting                   int64   `json:"waiting"`
	AcquireCount              int64   `json:"acquireCount"`
	AcquireWaitTimeMs         float64 `json:"acquireWaitTimeMs"`
	CanceledAcquireCount      int64   `json:"canceledAcquireCount"`
	CanceledAcquireWaitTimeMs float64 `json:"canceledAcquireWaitTimeMs"`
}

type SessionDBPoolStatsProvider interface {
	SessionDBPoolStats() SessionDBPoolStats
}

type SessionWriteLimiterStatsProvider interface {
	SessionWriteLimiterStats() SessionWriteLimiterStats
}

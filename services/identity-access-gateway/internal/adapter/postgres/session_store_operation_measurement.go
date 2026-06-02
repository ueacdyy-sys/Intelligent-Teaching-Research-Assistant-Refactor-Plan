package postgres

import (
	"context"
	"time"
)

type DBOperationMeasurement struct {
	PoolAcquireElapsed   time.Duration
	DBExecuteElapsed     time.Duration
	PoolAcquireMeasured  bool
	DBExecuteMeasured    bool
	RowsAffected         int64
	RowsAffectedMeasured bool
}

type MeasuredExecDB interface {
	ExecMeasured(ctx context.Context, sql string, args ...any) (CommandTag, DBOperationMeasurement, error)
}

func (s *SessionStore) execMeasured(
	ctx context.Context,
	sql string,
	args ...any,
) (CommandTag, DBOperationMeasurement, error) {
	if measuredDB, ok := s.db.(MeasuredExecDB); ok {
		tag, measurement, err := measuredDB.ExecMeasured(ctx, sql, args...)
		return tag, measureRowsAffected(tag, measurement), err
	}
	tag, err := s.db.Exec(ctx, sql, args...)
	return tag, measureRowsAffected(tag, DBOperationMeasurement{}), err
}

func measureRowsAffected(tag CommandTag, measurement DBOperationMeasurement) DBOperationMeasurement {
	if tag == nil {
		return measurement
	}
	measurement.RowsAffected = tag.RowsAffected()
	measurement.RowsAffectedMeasured = true
	return measurement
}

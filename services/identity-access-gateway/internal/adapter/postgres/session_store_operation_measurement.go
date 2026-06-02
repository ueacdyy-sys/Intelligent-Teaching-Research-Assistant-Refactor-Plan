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

type MeasuredQueryRow interface {
	ScanMeasured(dest ...any) (DBOperationMeasurement, error)
}

type MeasuredQueryRowDB interface {
	QueryRowMeasured(ctx context.Context, sql string, args ...any) MeasuredQueryRow
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

func (s *SessionStore) queryRowMeasured(
	ctx context.Context,
	sql string,
	dest []any,
	args ...any,
) (DBOperationMeasurement, error) {
	if measuredDB, ok := s.db.(MeasuredQueryRowDB); ok {
		return measuredDB.QueryRowMeasured(ctx, sql, args...).ScanMeasured(dest...)
	}
	return DBOperationMeasurement{}, s.db.QueryRow(ctx, sql, args...).Scan(dest...)
}

func measureRowsAffected(tag CommandTag, measurement DBOperationMeasurement) DBOperationMeasurement {
	if tag == nil {
		return measurement
	}
	measurement.RowsAffected = tag.RowsAffected()
	measurement.RowsAffectedMeasured = true
	return measurement
}

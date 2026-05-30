package postgres_test

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestEndAttendanceSessionUpdatesActiveSession(t *testing.T) {
	endedAt := time.Date(2026, 5, 30, 12, 20, 0, 0, time.UTC)
	db := &recordingDB{rows: &singleEndedAttendanceSessionRow{endedAt: endedAt}}
	repository := postgres.NewArchiveRepository(db)

	session, ok, err := repository.EndAttendanceSession(context.Background(), "att_sess_row", endedAt)
	if err != nil {
		t.Fatalf("EndAttendanceSession returned error: %v", err)
	}
	if !ok {
		t.Fatal("ok = false, want true")
	}
	if session.Status != domain.AttendanceSessionStatusEnded {
		t.Fatalf("Status = %q", session.Status)
	}
	if !session.EndedAt.Equal(endedAt) {
		t.Fatalf("EndedAt = %s", session.EndedAt)
	}

	for _, fragment := range []string{
		"WITH ended AS",
		"UPDATE teaching_attendance_sessions",
		"SET status = 'ENDED'",
		"ended_at = $2",
		"WHERE id = $1",
		"AND status = 'ACTIVE'",
		"UNION ALL",
		"NOT EXISTS (SELECT 1 FROM ended)",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if strings.Contains(db.lastSQL, "teaching_attendance_records") {
		t.Fatalf("SQL should not mutate records table: %s", db.lastSQL)
	}
	if len(db.args) != 2 {
		t.Fatalf("args = %d, want 2", len(db.args))
	}
}

func TestEndAttendanceSessionReturnsAlreadyEndedSession(t *testing.T) {
	endedAt := time.Date(2026, 5, 30, 12, 15, 0, 0, time.UTC)
	db := &recordingDB{rows: &singleEndedAttendanceSessionRow{endedAt: endedAt}}
	repository := postgres.NewArchiveRepository(db)

	session, ok, err := repository.EndAttendanceSession(context.Background(), "att_sess_row", endedAt.Add(5*time.Minute))
	if err != nil {
		t.Fatalf("EndAttendanceSession returned error: %v", err)
	}
	if !ok {
		t.Fatal("ok = false, want true")
	}
	if !session.EndedAt.Equal(endedAt) {
		t.Fatalf("EndedAt = %s", session.EndedAt)
	}
}

func TestEndAttendanceSessionReturnsMissing(t *testing.T) {
	db := &recordingDB{rows: &emptyRows{}}
	repository := postgres.NewArchiveRepository(db)

	_, ok, err := repository.EndAttendanceSession(
		context.Background(),
		"att_sess_missing",
		time.Date(2026, 5, 30, 12, 20, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("EndAttendanceSession returned error: %v", err)
	}
	if ok {
		t.Fatal("ok = true, want false")
	}
}

type singleEndedAttendanceSessionRow struct {
	advanced bool
	endedAt  time.Time
}

func (r *singleEndedAttendanceSessionRow) Close() {}

func (r *singleEndedAttendanceSessionRow) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *singleEndedAttendanceSessionRow) Scan(dest ...any) error {
	*(dest[0].(*string)) = "att_sess_row"
	*(dest[1].(*string)) = string(domain.AttendanceSessionTypeQRCode)
	*(dest[2].(*sql.NullString)) = sql.NullString{String: "Class A", Valid: true}
	*(dest[3].(*int)) = 42
	*(dest[4].(*int)) = 1
	*(dest[5].(*int)) = 0
	*(dest[6].(*int)) = 0
	*(dest[7].(*sql.NullString)) = sql.NullString{String: "local://attendance/qrcode/class-a.json", Valid: true}
	*(dest[8].(*string)) = string(domain.AttendanceSessionStatusEnded)
	*(dest[9].(*string)) = "teacher_001"
	*(dest[10].(*time.Time)) = time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC)
	*(dest[11].(*sql.NullTime)) = sql.NullTime{Time: r.endedAt, Valid: true}
	return nil
}

func (r *singleEndedAttendanceSessionRow) Err() error {
	return nil
}

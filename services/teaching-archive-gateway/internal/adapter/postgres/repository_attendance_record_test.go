package postgres_test

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"
	"time"

	"ita-refactor/services/teaching-archive-gateway/internal/adapter/postgres"
	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func TestGetAttendanceSessionByIDScansSession(t *testing.T) {
	db := &recordingDB{rows: &singleAttendanceSessionRow{}}
	repository := postgres.NewArchiveRepository(db)

	session, ok, err := repository.GetAttendanceSessionByID(context.Background(), "att_sess_row")
	if err != nil {
		t.Fatalf("GetAttendanceSessionByID returned error: %v", err)
	}
	if !ok {
		t.Fatal("ok = false, want true")
	}
	if session.ID != "att_sess_row" || session.Status != domain.AttendanceSessionStatusActive {
		t.Fatalf("session = %#v", session)
	}
	if !strings.Contains(db.lastSQL, "FROM teaching_attendance_sessions") {
		t.Fatalf("SQL = %s", db.lastSQL)
	}
}

func TestCreateAttendanceRecordInsertsAndUpdatesCounterAtomically(t *testing.T) {
	db := &recordingDB{rows: &singleAttendanceRecordRow{created: true}}
	repository := postgres.NewArchiveRepository(db)

	record, created, err := repository.CreateAttendanceRecord(context.Background(), domain.AttendanceRecord{
		ID:                    "att_rec_row",
		SessionID:             "att_sess_row",
		StudentID:             "student_001",
		Status:                domain.AttendanceRecordStatusPresent,
		RecordedByPrincipalID: "teacher_001",
		SignTime:              time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC),
		Note:                  "QR scan",
		CreatedAt:             time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("CreateAttendanceRecord returned error: %v", err)
	}
	if !created {
		t.Fatal("created = false, want true")
	}
	if record.ID != "att_rec_row" {
		t.Fatalf("record.ID = %q", record.ID)
	}

	for _, fragment := range []string{
		"WITH active_session AS",
		"inserted AS",
		"INSERT INTO teaching_attendance_records",
		"FROM teaching_attendance_sessions AS session",
		"FOR UPDATE",
		"ON CONFLICT (session_id, student_id) DO NOTHING",
		"UPDATE teaching_attendance_sessions",
		"present_count = present_count + CASE WHEN $4 = 'PRESENT' THEN 1 ELSE 0 END",
		"absent_count = absent_count + CASE WHEN $4 = 'ABSENT' THEN 1 ELSE 0 END",
		"late_count = late_count + CASE WHEN $4 = 'LATE' THEN 1 ELSE 0 END",
		"EXISTS (SELECT 1 FROM inserted)",
	} {
		if !strings.Contains(db.lastSQL, fragment) {
			t.Fatalf("SQL missing %q in: %s", fragment, db.lastSQL)
		}
	}
	if len(db.args) != 8 {
		t.Fatalf("args = %d, want 8", len(db.args))
	}
}

func TestCreateAttendanceRecordReturnsExistingDuplicate(t *testing.T) {
	db := &recordingDB{rows: &singleAttendanceRecordRow{
		id:      "att_rec_existing",
		created: false,
	}}
	repository := postgres.NewArchiveRepository(db)

	record, created, err := repository.CreateAttendanceRecord(context.Background(), domain.AttendanceRecord{
		ID:                    "att_rec_new",
		SessionID:             "att_sess_row",
		StudentID:             "student_001",
		Status:                domain.AttendanceRecordStatusPresent,
		RecordedByPrincipalID: "student_001",
		CreatedAt:             time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("CreateAttendanceRecord returned error: %v", err)
	}
	if created {
		t.Fatal("created = true, want existing duplicate")
	}
	if record.ID != "att_rec_existing" {
		t.Fatalf("record.ID = %q", record.ID)
	}
}

func TestCreateAttendanceRecordRejectsInactiveRace(t *testing.T) {
	db := &recordingDB{rows: &emptyRows{}}
	repository := postgres.NewArchiveRepository(db)

	_, _, err := repository.CreateAttendanceRecord(context.Background(), domain.AttendanceRecord{
		ID:                    "att_rec_row",
		SessionID:             "att_sess_row",
		StudentID:             "student_001",
		Status:                domain.AttendanceRecordStatusPresent,
		RecordedByPrincipalID: "teacher_001",
		CreatedAt:             time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC),
	})
	if !errors.Is(err, domain.ErrAttendanceSessionNotActive) {
		t.Fatalf("error = %v, want ErrAttendanceSessionNotActive", err)
	}
}

type singleAttendanceSessionRow struct {
	advanced bool
}

func (r *singleAttendanceSessionRow) Close() {}

func (r *singleAttendanceSessionRow) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *singleAttendanceSessionRow) Scan(dest ...any) error {
	*(dest[0].(*string)) = "att_sess_row"
	*(dest[1].(*string)) = string(domain.AttendanceSessionTypeQRCode)
	*(dest[2].(*sql.NullString)) = sql.NullString{String: "Class A", Valid: true}
	*(dest[3].(*int)) = 42
	*(dest[4].(*int)) = 1
	*(dest[5].(*int)) = 0
	*(dest[6].(*int)) = 0
	*(dest[7].(*sql.NullString)) = sql.NullString{String: "local://attendance/qrcode/class-a.json", Valid: true}
	*(dest[8].(*string)) = string(domain.AttendanceSessionStatusActive)
	*(dest[9].(*string)) = "teacher_001"
	*(dest[10].(*time.Time)) = time.Date(2026, 5, 30, 12, 0, 0, 0, time.UTC)
	*(dest[11].(*sql.NullTime)) = sql.NullTime{}
	return nil
}

func (r *singleAttendanceSessionRow) Err() error {
	return nil
}

type singleAttendanceRecordRow struct {
	advanced bool
	id       string
	created  bool
}

func (r *singleAttendanceRecordRow) Close() {}

func (r *singleAttendanceRecordRow) Next() bool {
	if r.advanced {
		return false
	}
	r.advanced = true
	return true
}

func (r *singleAttendanceRecordRow) Scan(dest ...any) error {
	id := r.id
	if id == "" {
		id = "att_rec_row"
	}
	*(dest[0].(*string)) = id
	*(dest[1].(*string)) = "att_sess_row"
	*(dest[2].(*string)) = "student_001"
	*(dest[3].(*string)) = string(domain.AttendanceRecordStatusPresent)
	*(dest[4].(*string)) = "teacher_001"
	*(dest[5].(*sql.NullTime)) = sql.NullTime{Time: time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC), Valid: true}
	*(dest[6].(*sql.NullString)) = sql.NullString{String: "QR scan", Valid: true}
	*(dest[7].(*time.Time)) = time.Date(2026, 5, 30, 12, 5, 0, 0, time.UTC)
	*(dest[8].(*bool)) = r.created
	return nil
}

func (r *singleAttendanceRecordRow) Err() error {
	return nil
}

type emptyRows struct{}

func (r *emptyRows) Close() {}
func (r *emptyRows) Next() bool {
	return false
}
func (r *emptyRows) Scan(dest ...any) error {
	return nil
}
func (r *emptyRows) Err() error {
	return nil
}

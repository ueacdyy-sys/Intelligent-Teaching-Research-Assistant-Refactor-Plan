package domain

type AttendanceStatisticsInput struct {
	Principal PrincipalContext
	ClassName string
}

type AttendanceStatisticsQuery struct {
	ClassName string
}

type AttendanceStatistics struct {
	TotalStudents   int
	TotalRecords    int
	AttendanceCount int
	AbsenceCount    int
	LateCount       int
	AttendanceRate  float64
}

func NormalizeAttendanceStatisticsInput(input AttendanceStatisticsInput) (AttendanceStatisticsQuery, error) {
	className, err := normalizeOptionalText(input.ClassName, maxAttendanceClassNameLength, "className")
	if err != nil {
		return AttendanceStatisticsQuery{}, err
	}
	return AttendanceStatisticsQuery{ClassName: className}, nil
}

func AuthorizeAttendanceStatisticsQuery(principal PrincipalContext, _ AttendanceStatisticsQuery) error {
	if err := ValidatePrincipalContext(principal); err != nil {
		return err
	}
	if !hasScope(principal, ScopeTeachingRead) {
		return ErrForbidden
	}
	if !canReadAssignedStudentArchive(principal, "") {
		return ErrForbidden
	}
	return nil
}

func BuildAttendanceStatistics(
	totalStudents int,
	attendanceCount int,
	absenceCount int,
	lateCount int,
) (AttendanceStatistics, error) {
	if totalStudents < 0 || attendanceCount < 0 || absenceCount < 0 || lateCount < 0 {
		return AttendanceStatistics{}, validationError("attendance statistics counts must be non-negative")
	}
	totalRecords := attendanceCount + absenceCount + lateCount
	attendanceRate := 0.0
	if totalRecords > 0 {
		attendanceRate = float64(attendanceCount) / float64(totalRecords)
	}
	return AttendanceStatistics{
		TotalStudents:   totalStudents,
		TotalRecords:    totalRecords,
		AttendanceCount: attendanceCount,
		AbsenceCount:    absenceCount,
		LateCount:       lateCount,
		AttendanceRate:  attendanceRate,
	}, nil
}

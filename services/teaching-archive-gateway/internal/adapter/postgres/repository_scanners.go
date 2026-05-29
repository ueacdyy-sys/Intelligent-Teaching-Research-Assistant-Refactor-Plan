package postgres

import (
	"database/sql"
	"encoding/json"

	"ita-refactor/services/teaching-archive-gateway/internal/domain"
)

func scanArchiveItem(rows Rows) (domain.ArchiveItem, error) {
	var (
		item      domain.ArchiveItem
		ownerType string
		studentID sql.NullString
		material  string
		source    string
		tags      []byte
		intents   []byte
		ocrStatus string
	)
	if err := rows.Scan(
		&item.ID,
		&ownerType,
		&studentID,
		&material,
		&item.Title,
		&source,
		&item.ContentRef,
		&tags,
		&intents,
		&ocrStatus,
		&item.CreatedAt,
	); err != nil {
		return domain.ArchiveItem{}, err
	}
	if studentID.Valid {
		item.StudentID = studentID.String
	}
	item.OwnerType = domain.OwnerType(ownerType)
	item.MaterialType = domain.MaterialType(material)
	item.Source = domain.Source(source)
	item.OCRStatus = domain.OCRStatus(ocrStatus)
	if err := json.Unmarshal(tags, &item.Tags); err != nil {
		return domain.ArchiveItem{}, err
	}
	if err := json.Unmarshal(intents, &item.AnalysisIntents); err != nil {
		return domain.ArchiveItem{}, err
	}
	return item, nil
}

func scanTutoringAnalysisRequest(rows Rows) (domain.TutoringAnalysisRequest, error) {
	var (
		request       domain.TutoringAnalysisRequest
		questionBank  string
		status        string
		ownerType     string
		studentID     sql.NullString
		material      string
		resultSummary sql.NullString
		resultRef     sql.NullString
		draftRef      sql.NullString
		errorCode     sql.NullString
		errorMessage  sql.NullString
		claimWorkerID sql.NullString
		claimExpires  sql.NullTime
		completedAt   sql.NullTime
		updatedAt     sql.NullTime
	)
	if err := rows.Scan(
		&request.ID,
		&request.ArchiveItemID,
		&request.RequestedByPrincipalID,
		&request.AnalysisGoal,
		&questionBank,
		&status,
		&ownerType,
		&studentID,
		&material,
		&resultSummary,
		&resultRef,
		&draftRef,
		&errorCode,
		&errorMessage,
		&claimWorkerID,
		&claimExpires,
		&request.CreatedAt,
		&completedAt,
		&updatedAt,
	); err != nil {
		return domain.TutoringAnalysisRequest{}, err
	}
	request.QuestionBankIntent = domain.QuestionBankIntent(questionBank)
	request.Status = domain.TutoringAnalysisStatus(status)
	request.SourceArchiveOwnerType = domain.OwnerType(ownerType)
	if studentID.Valid {
		request.SourceArchiveStudentID = studentID.String
	}
	request.SourceArchiveMaterial = domain.MaterialType(material)
	if resultSummary.Valid {
		request.ResultSummary = resultSummary.String
	}
	if resultRef.Valid {
		request.ResultRef = resultRef.String
	}
	if draftRef.Valid {
		request.QuestionBankDraftRef = draftRef.String
	}
	if errorCode.Valid {
		request.ErrorCode = errorCode.String
	}
	if errorMessage.Valid {
		request.ErrorMessage = errorMessage.String
	}
	if claimWorkerID.Valid {
		request.ClaimedByWorkerID = claimWorkerID.String
	}
	if claimExpires.Valid {
		request.ClaimExpiresAt = claimExpires.Time
	}
	if completedAt.Valid {
		request.CompletedAt = completedAt.Time
	}
	if updatedAt.Valid {
		request.UpdatedAt = updatedAt.Time
	}
	return request, nil
}

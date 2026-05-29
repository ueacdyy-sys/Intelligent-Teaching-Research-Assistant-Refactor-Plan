use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::{
    ApprovalArtifact, ApprovalDecision, ApprovalDecisionCorrelationReport,
    ApprovalDecisionCorrelationStatus, EvidenceStoreError, JsonlApprovalDecisionStore,
    JsonlApprovalStore, correlate_approval_decisions,
};

const APPROVAL_QUEUE_SNAPSHOT_SCHEMA_VERSION: &str =
    "2026-05-29.agent-harness.approval-queue-snapshot.v1";
const REVIEW_ONLY_REASON: &str = "approval queue is review-only; execution candidates are disabled";
const UNCORRELATED_REASON: &str =
    "uncorrelated approval decisions block execution candidate projection";

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalQueueSnapshot {
    pub schema_version: String,
    pub generated_at: String,
    pub approval_artifact_count: usize,
    pub approval_decision_count: usize,
    pub all_decisions_correlated: bool,
    pub uncorrelated_decision_count: usize,
    pub execution_candidate_count: usize,
    pub execution_disabled_reason: String,
    pub correlation: ApprovalDecisionCorrelationReport,
}

impl ApprovalQueueSnapshot {
    pub fn from_correlation(
        generated_at: impl Into<String>,
        correlation: ApprovalDecisionCorrelationReport,
    ) -> Self {
        let uncorrelated_decision_count = correlation
            .entries
            .iter()
            .filter(|entry| entry.status != ApprovalDecisionCorrelationStatus::Matched)
            .count();
        let all_decisions_correlated = correlation.all_correlated;
        Self {
            schema_version: APPROVAL_QUEUE_SNAPSHOT_SCHEMA_VERSION.to_string(),
            generated_at: generated_at.into(),
            approval_artifact_count: correlation.total_approval_artifacts,
            approval_decision_count: correlation.total_decisions,
            all_decisions_correlated,
            uncorrelated_decision_count,
            execution_candidate_count: 0,
            execution_disabled_reason: if all_decisions_correlated {
                REVIEW_ONLY_REASON.to_string()
            } else {
                UNCORRELATED_REASON.to_string()
            },
            correlation,
        }
    }
}

pub struct JsonlApprovalQueueReader {
    approvals_path: PathBuf,
    decisions_path: PathBuf,
}

impl JsonlApprovalQueueReader {
    pub fn new(approvals_path: impl AsRef<Path>, decisions_path: impl AsRef<Path>) -> Self {
        Self {
            approvals_path: approvals_path.as_ref().to_path_buf(),
            decisions_path: decisions_path.as_ref().to_path_buf(),
        }
    }

    pub fn read(
        &self,
        generated_at: impl Into<String>,
    ) -> Result<ApprovalQueueSnapshot, EvidenceStoreError> {
        let generated_at = generated_at.into();
        let approvals = read_approval_artifacts(&self.approvals_path)?;
        let decisions = read_approval_decisions(&self.decisions_path)?;
        let correlation =
            correlate_approval_decisions(generated_at.clone(), &approvals, &decisions);
        Ok(ApprovalQueueSnapshot::from_correlation(
            generated_at,
            correlation,
        ))
    }
}

fn read_approval_artifacts(path: &Path) -> Result<Vec<ApprovalArtifact>, EvidenceStoreError> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    JsonlApprovalStore::new(path).read_all()
}

fn read_approval_decisions(path: &Path) -> Result<Vec<ApprovalDecision>, EvidenceStoreError> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    JsonlApprovalDecisionStore::new(path).read_all()
}

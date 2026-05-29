use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::{
    ActionKind, ApprovalArtifact, ApprovalStatus, EvidenceStoreError, Principal,
    append_jsonl_record, read_jsonl_records,
};

const HARNESS_APPROVE: &str = "HARNESS_APPROVE";
const APPROVAL_DECISION_SCHEMA_VERSION: &str = "2026-05-29.agent-harness.approval-decision.v1";

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
pub enum ApprovalDecisionOutcome {
    #[serde(rename = "APPROVED")]
    Approved,
    #[serde(rename = "REJECTED")]
    Rejected,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ApprovalDecisionError {
    ReviewerMissingHarnessApprove,
    ReviewerRequiresHarnessApproval,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalDecision {
    pub schema_version: String,
    pub decision_id: String,
    pub approval_id: String,
    pub decided_at: String,
    pub reviewer_principal_id: String,
    pub reviewer_session_id: String,
    pub requested_principal_id: String,
    pub action: ActionKind,
    pub target: String,
    pub outcome: ApprovalDecisionOutcome,
    pub reason: String,
    pub source_status: ApprovalStatus,
    pub execution_ready: bool,
}

impl ApprovalDecision {
    pub fn approve(
        decision_id: impl Into<String>,
        decided_at: impl Into<String>,
        approval: &ApprovalArtifact,
        reviewer: &Principal,
        reason: impl Into<String>,
    ) -> Result<Self, ApprovalDecisionError> {
        Self::from_approval(
            decision_id,
            decided_at,
            approval,
            reviewer,
            ApprovalDecisionOutcome::Approved,
            reason,
        )
    }

    pub fn reject(
        decision_id: impl Into<String>,
        decided_at: impl Into<String>,
        approval: &ApprovalArtifact,
        reviewer: &Principal,
        reason: impl Into<String>,
    ) -> Result<Self, ApprovalDecisionError> {
        Self::from_approval(
            decision_id,
            decided_at,
            approval,
            reviewer,
            ApprovalDecisionOutcome::Rejected,
            reason,
        )
    }

    fn from_approval(
        decision_id: impl Into<String>,
        decided_at: impl Into<String>,
        approval: &ApprovalArtifact,
        reviewer: &Principal,
        outcome: ApprovalDecisionOutcome,
        reason: impl Into<String>,
    ) -> Result<Self, ApprovalDecisionError> {
        if !reviewer.has_scope(HARNESS_APPROVE) {
            return Err(ApprovalDecisionError::ReviewerMissingHarnessApprove);
        }
        if reviewer.requires_harness_approval {
            return Err(ApprovalDecisionError::ReviewerRequiresHarnessApproval);
        }
        Ok(Self {
            schema_version: APPROVAL_DECISION_SCHEMA_VERSION.to_string(),
            decision_id: decision_id.into(),
            approval_id: approval.approval_id.clone(),
            decided_at: decided_at.into(),
            reviewer_principal_id: reviewer.principal_id.clone(),
            reviewer_session_id: reviewer.session_id.clone(),
            requested_principal_id: approval.principal_id.clone(),
            action: approval.action,
            target: approval.target.clone(),
            outcome,
            reason: reason.into(),
            source_status: approval.status,
            execution_ready: false,
        })
    }
}

pub struct JsonlApprovalDecisionStore {
    path: PathBuf,
}

impl JsonlApprovalDecisionStore {
    pub fn new(path: impl AsRef<Path>) -> Self {
        Self {
            path: path.as_ref().to_path_buf(),
        }
    }

    pub fn append(&mut self, decision: &ApprovalDecision) -> Result<(), EvidenceStoreError> {
        append_jsonl_record(&self.path, decision)
    }

    pub fn read_all(&self) -> Result<Vec<ApprovalDecision>, EvidenceStoreError> {
        read_jsonl_records(&self.path)
    }
}

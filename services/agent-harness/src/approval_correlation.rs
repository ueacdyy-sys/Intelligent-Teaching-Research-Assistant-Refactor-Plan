use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::{ApprovalArtifact, ApprovalDecision};

const APPROVAL_DECISION_CORRELATION_SCHEMA_VERSION: &str =
    "2026-05-29.agent-harness.approval-decision-correlation.v1";

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
pub enum ApprovalDecisionCorrelationStatus {
    #[serde(rename = "MATCHED")]
    Matched,
    #[serde(rename = "MISSING_APPROVAL")]
    MissingApproval,
    #[serde(rename = "DUPLICATE_APPROVAL_ID")]
    DuplicateApprovalId,
    #[serde(rename = "CONTEXT_MISMATCH")]
    ContextMismatch,
    #[serde(rename = "EXECUTION_READY_DECISION")]
    ExecutionReadyDecision,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalDecisionCorrelationEntry {
    pub decision_id: String,
    pub approval_id: String,
    pub status: ApprovalDecisionCorrelationStatus,
    pub issues: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalDecisionCorrelationReport {
    pub schema_version: String,
    pub generated_at: String,
    pub total_approval_artifacts: usize,
    pub total_decisions: usize,
    pub all_correlated: bool,
    pub entries: Vec<ApprovalDecisionCorrelationEntry>,
}

pub fn correlate_approval_decisions(
    generated_at: impl Into<String>,
    approval_artifacts: &[ApprovalArtifact],
    decisions: &[ApprovalDecision],
) -> ApprovalDecisionCorrelationReport {
    let index = index_approval_artifacts(approval_artifacts);
    let entries: Vec<_> = decisions
        .iter()
        .map(|decision| correlate_decision(decision, &index))
        .collect();
    let all_correlated = entries
        .iter()
        .all(|entry| entry.status == ApprovalDecisionCorrelationStatus::Matched);

    ApprovalDecisionCorrelationReport {
        schema_version: APPROVAL_DECISION_CORRELATION_SCHEMA_VERSION.to_string(),
        generated_at: generated_at.into(),
        total_approval_artifacts: approval_artifacts.len(),
        total_decisions: decisions.len(),
        all_correlated,
        entries,
    }
}

fn index_approval_artifacts(
    approval_artifacts: &[ApprovalArtifact],
) -> HashMap<&str, Vec<&ApprovalArtifact>> {
    let mut index: HashMap<&str, Vec<&ApprovalArtifact>> = HashMap::new();
    for artifact in approval_artifacts {
        index
            .entry(artifact.approval_id.as_str())
            .or_default()
            .push(artifact);
    }
    index
}

fn correlate_decision(
    decision: &ApprovalDecision,
    index: &HashMap<&str, Vec<&ApprovalArtifact>>,
) -> ApprovalDecisionCorrelationEntry {
    let (status, issues) = match index.get(decision.approval_id.as_str()) {
        None => (
            ApprovalDecisionCorrelationStatus::MissingApproval,
            vec!["approvalId not found".to_string()],
        ),
        Some(matches) if matches.len() > 1 => (
            ApprovalDecisionCorrelationStatus::DuplicateApprovalId,
            vec!["approvalId is not unique".to_string()],
        ),
        Some(matches) => correlate_context(matches[0], decision),
    };

    ApprovalDecisionCorrelationEntry {
        decision_id: decision.decision_id.clone(),
        approval_id: decision.approval_id.clone(),
        status,
        issues,
    }
}

fn correlate_context(
    artifact: &ApprovalArtifact,
    decision: &ApprovalDecision,
) -> (ApprovalDecisionCorrelationStatus, Vec<String>) {
    if decision.execution_ready {
        return (
            ApprovalDecisionCorrelationStatus::ExecutionReadyDecision,
            vec!["executionReady must be false".to_string()],
        );
    }

    let mut issues = Vec::new();
    if decision.requested_principal_id != artifact.principal_id {
        issues.push("requestedPrincipalId mismatch".to_string());
    }
    if decision.action != artifact.action {
        issues.push("action mismatch".to_string());
    }
    if decision.target != artifact.target {
        issues.push("target mismatch".to_string());
    }
    if decision.source_status != artifact.status {
        issues.push("sourceStatus mismatch".to_string());
    }

    if issues.is_empty() {
        (ApprovalDecisionCorrelationStatus::Matched, issues)
    } else {
        (ApprovalDecisionCorrelationStatus::ContextMismatch, issues)
    }
}

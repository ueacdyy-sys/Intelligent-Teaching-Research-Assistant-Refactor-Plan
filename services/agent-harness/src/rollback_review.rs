use serde::{Deserialize, Serialize};

use super::{ApprovalQueueSnapshot, ExecutionCandidateView};

const ROLLBACK_REVIEW_SCHEMA_VERSION: &str = "2026-05-30.agent-harness.rollback-review.v1";
const KEEP_EXECUTION_DISABLED: &str = "keep local execution disabled";
const PRESERVE_EVIDENCE: &str = "preserve approval and evidence JSONL for audit review";
const RESOLVE_CORRELATION: &str = "resolve approval decision correlation before execution";
const REMOVE_EXECUTION_CANDIDATES: &str = "remove execution candidates before rollback review";

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
pub enum RollbackReviewState {
    #[serde(rename = "NO_LOCAL_SIDE_EFFECTS_READY")]
    NoLocalSideEffectsReady,
    #[serde(rename = "REVIEW_BLOCKED_UNCORRELATED_DECISIONS")]
    ReviewBlockedUncorrelatedDecisions,
    #[serde(rename = "ROLLBACK_BLOCKED_EXECUTION_CANDIDATES_PRESENT")]
    RollbackBlockedExecutionCandidatesPresent,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RollbackReviewReport {
    pub schema_version: String,
    pub generated_at: String,
    pub source_queue_generated_at: String,
    pub source_view_generated_at: String,
    pub source_approval_artifact_count: usize,
    pub source_approval_decision_count: usize,
    pub source_uncorrelated_decision_count: usize,
    pub source_execution_candidate_count: usize,
    pub local_execution_enabled: bool,
    pub evidence_retention_required: bool,
    pub rollback_state: RollbackReviewState,
    pub rollback_actions: Vec<String>,
}

impl RollbackReviewReport {
    pub fn from_queue_and_view(
        generated_at: impl Into<String>,
        queue: &ApprovalQueueSnapshot,
        view: &ExecutionCandidateView,
    ) -> Self {
        let rollback_state = rollback_state(queue, view);
        Self {
            schema_version: ROLLBACK_REVIEW_SCHEMA_VERSION.to_string(),
            generated_at: generated_at.into(),
            source_queue_generated_at: queue.generated_at.clone(),
            source_view_generated_at: view.generated_at.clone(),
            source_approval_artifact_count: queue.approval_artifact_count,
            source_approval_decision_count: queue.approval_decision_count,
            source_uncorrelated_decision_count: queue.uncorrelated_decision_count,
            source_execution_candidate_count: view.candidate_count,
            local_execution_enabled: false,
            evidence_retention_required: true,
            rollback_state,
            rollback_actions: rollback_actions(rollback_state),
        }
    }
}

fn rollback_state(
    queue: &ApprovalQueueSnapshot,
    view: &ExecutionCandidateView,
) -> RollbackReviewState {
    if view.candidate_count > 0 {
        return RollbackReviewState::RollbackBlockedExecutionCandidatesPresent;
    }
    if queue.uncorrelated_decision_count > 0 {
        return RollbackReviewState::ReviewBlockedUncorrelatedDecisions;
    }
    RollbackReviewState::NoLocalSideEffectsReady
}

fn rollback_actions(state: RollbackReviewState) -> Vec<String> {
    let mut actions = vec![KEEP_EXECUTION_DISABLED.to_string()];
    match state {
        RollbackReviewState::NoLocalSideEffectsReady => {
            actions.push(PRESERVE_EVIDENCE.to_string());
        }
        RollbackReviewState::ReviewBlockedUncorrelatedDecisions => {
            actions.push(RESOLVE_CORRELATION.to_string());
            actions.push(PRESERVE_EVIDENCE.to_string());
        }
        RollbackReviewState::RollbackBlockedExecutionCandidatesPresent => {
            actions.push(REMOVE_EXECUTION_CANDIDATES.to_string());
            actions.push(PRESERVE_EVIDENCE.to_string());
        }
    }
    actions
}

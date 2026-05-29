use serde::{Deserialize, Serialize};

use super::{ActionKind, ApprovalQueueSnapshot};

const EXECUTION_CANDIDATE_VIEW_SCHEMA_VERSION: &str =
    "2026-05-29.agent-harness.execution-candidate-view.v1";
const BLOCKED_REASON: &str = "real local execution is disabled by current SDD";
const FUTURE_SDD_PRECONDITION: &str = "future SDD must explicitly enable execution candidates";
const CORRELATION_PRECONDITION: &str = "all approval decisions must be correlated";

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionCandidate {
    pub candidate_id: String,
    pub action: ActionKind,
    pub target: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionCandidateView {
    pub schema_version: String,
    pub generated_at: String,
    pub source_queue_generated_at: String,
    pub source_approval_decision_count: usize,
    pub source_uncorrelated_decision_count: usize,
    pub candidate_count: usize,
    pub candidates: Vec<ExecutionCandidate>,
    pub blocked_reason: String,
    pub blocked_preconditions: Vec<String>,
}

impl ExecutionCandidateView {
    pub fn from_queue_snapshot(
        generated_at: impl Into<String>,
        queue: &ApprovalQueueSnapshot,
    ) -> Self {
        let mut blocked_preconditions = vec![FUTURE_SDD_PRECONDITION.to_string()];
        if queue.uncorrelated_decision_count > 0 {
            blocked_preconditions.push(CORRELATION_PRECONDITION.to_string());
        }

        Self {
            schema_version: EXECUTION_CANDIDATE_VIEW_SCHEMA_VERSION.to_string(),
            generated_at: generated_at.into(),
            source_queue_generated_at: queue.generated_at.clone(),
            source_approval_decision_count: queue.approval_decision_count,
            source_uncorrelated_decision_count: queue.uncorrelated_decision_count,
            candidate_count: 0,
            candidates: Vec::new(),
            blocked_reason: BLOCKED_REASON.to_string(),
            blocked_preconditions,
        }
    }
}

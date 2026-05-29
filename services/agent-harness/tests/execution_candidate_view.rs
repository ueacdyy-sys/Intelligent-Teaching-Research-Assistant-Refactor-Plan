use std::path::PathBuf;

use agent_harness::{
    ActionKind, ApprovalArtifact, ApprovalDecision, ApprovalQueueSnapshot, DecisionOutcome,
    ExecutionCandidateView, HarnessRequest, PermissionManifest, Principal,
    correlate_approval_decisions, evaluate_request,
};

fn load_manifest() -> PermissionManifest {
    let text = include_str!("../../../contracts/harness/permission-manifest.current.json");
    PermissionManifest::from_json(text).expect("manifest should parse")
}

fn remote_principal_requiring_approval() -> Principal {
    Principal::with_context(
        "remote:WECHAT:openid",
        "sess_remote_1",
        vec!["AGENT_COMMAND_SUBMIT".to_string()],
        true,
    )
}

fn admin_reviewer() -> Principal {
    Principal::with_context(
        "user_admin_bootstrap",
        "sess_admin_1",
        vec!["HARNESS_APPROVE".to_string()],
        false,
    )
}

fn workspace_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("services directory")
        .parent()
        .expect("workspace root")
        .to_path_buf()
}

fn workspace_target(relative: &str) -> String {
    workspace_root()
        .join(relative)
        .to_string_lossy()
        .replace('\\', "/")
}

#[test]
fn matched_queue_snapshot_still_produces_empty_execution_candidate_view() {
    let approval = sample_approval("approval_remote_1", "evidence_remote_1");
    let decision = sample_decision("decision_1", &approval);
    let queue = queue_snapshot("2026-05-29T10:00:00Z", &[approval], &[decision]);

    let view = ExecutionCandidateView::from_queue_snapshot("2026-05-29T11:00:00Z", &queue);

    assert_eq!(view.source_queue_generated_at, "2026-05-29T10:00:00Z");
    assert_eq!(view.source_approval_decision_count, 1);
    assert_eq!(view.source_uncorrelated_decision_count, 0);
    assert_eq!(view.candidate_count, 0);
    assert!(view.candidates.is_empty());
    assert_eq!(
        view.blocked_preconditions,
        vec!["future SDD must explicitly enable execution candidates"]
    );
}

#[test]
fn uncorrelated_queue_snapshot_blocks_candidates_with_precondition() {
    let approval = sample_approval("approval_remote_2", "evidence_remote_2");
    let decision = sample_decision("decision_missing_1", &approval);
    let queue = queue_snapshot("2026-05-29T10:01:00Z", &[], &[decision]);

    let view = ExecutionCandidateView::from_queue_snapshot("2026-05-29T11:01:00Z", &queue);

    assert_eq!(view.source_approval_decision_count, 1);
    assert_eq!(view.source_uncorrelated_decision_count, 1);
    assert_eq!(view.candidate_count, 0);
    assert!(view.candidates.is_empty());
    assert!(
        view.blocked_preconditions
            .contains(&"all approval decisions must be correlated".to_string())
    );
}

#[test]
fn execution_candidate_view_serializes_to_contract_shape() {
    let queue = queue_snapshot("2026-05-29T10:02:00Z", &[], &[]);

    let view = ExecutionCandidateView::from_queue_snapshot("2026-05-29T11:02:00Z", &queue);
    let text = serde_json::to_string(&view).expect("view should serialize");

    assert!(
        text.contains("\"schemaVersion\":\"2026-05-29.agent-harness.execution-candidate-view.v1\"")
    );
    assert!(text.contains("\"candidateCount\":0"));
    assert!(text.contains("\"candidates\":[]"));
    assert!(text.contains("\"blockedReason\":\"real local execution is disabled by current SDD\""));
}

fn queue_snapshot(
    generated_at: &str,
    approvals: &[ApprovalArtifact],
    decisions: &[ApprovalDecision],
) -> ApprovalQueueSnapshot {
    let correlation = correlate_approval_decisions(generated_at, approvals, decisions);
    ApprovalQueueSnapshot::from_correlation(generated_at, correlation)
}

fn sample_decision(decision_id: &str, approval: &ApprovalArtifact) -> ApprovalDecision {
    ApprovalDecision::approve(
        decision_id,
        "2026-05-29T08:04:00Z",
        approval,
        &admin_reviewer(),
        "approved for execution candidate test",
    )
    .expect("admin reviewer should approve")
}

fn sample_approval(approval_id: &str, evidence_id: &str) -> ApprovalArtifact {
    let manifest = load_manifest();
    let principal = remote_principal_requiring_approval();
    let request = HarnessRequest::new(
        ActionKind::FileWrite,
        workspace_target("reports/remote.txt"),
    );
    let decision = evaluate_request(&manifest, &principal, &request);
    assert_eq!(decision.outcome, DecisionOutcome::ApprovalRequired);
    ApprovalArtifact::from_decision(
        approval_id,
        evidence_id,
        "2026-05-29T07:00:00Z",
        &manifest,
        &principal,
        &request,
        &decision,
    )
    .expect("approval-required decision should create artifact")
}

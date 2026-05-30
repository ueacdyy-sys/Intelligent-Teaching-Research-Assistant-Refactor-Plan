use std::path::PathBuf;

use agent_harness::{
    ActionKind, ApprovalArtifact, ApprovalDecision, ApprovalQueueSnapshot, DecisionOutcome,
    ExecutionCandidate, ExecutionCandidateView, HarnessRequest, PermissionManifest, Principal,
    RollbackReviewReport, RollbackReviewState, correlate_approval_decisions, evaluate_request,
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
fn matched_review_only_queue_is_ready_without_local_execution() {
    let approval = sample_approval("approval_remote_1", "evidence_remote_1");
    let decision = sample_decision("decision_1", &approval);
    let queue = queue_snapshot("2026-05-30T12:20:00Z", &[approval], &[decision]);
    let view = ExecutionCandidateView::from_queue_snapshot("2026-05-30T12:25:00Z", &queue);

    let report = RollbackReviewReport::from_queue_and_view("2026-05-30T12:30:00Z", &queue, &view);

    assert_eq!(
        report.rollback_state,
        RollbackReviewState::NoLocalSideEffectsReady
    );
    assert!(!report.local_execution_enabled);
    assert!(report.evidence_retention_required);
    assert_eq!(report.source_execution_candidate_count, 0);
    assert!(
        report
            .rollback_actions
            .contains(&"keep local execution disabled".to_string())
    );
    assert!(
        report
            .rollback_actions
            .contains(&"preserve approval and evidence JSONL for audit review".to_string())
    );
}

#[test]
fn uncorrelated_decisions_block_rollback_review() {
    let approval = sample_approval("approval_remote_2", "evidence_remote_2");
    let decision = sample_decision("decision_missing_1", &approval);
    let queue = queue_snapshot("2026-05-30T12:21:00Z", &[], &[decision]);
    let view = ExecutionCandidateView::from_queue_snapshot("2026-05-30T12:26:00Z", &queue);

    let report = RollbackReviewReport::from_queue_and_view("2026-05-30T12:31:00Z", &queue, &view);

    assert_eq!(
        report.rollback_state,
        RollbackReviewState::ReviewBlockedUncorrelatedDecisions
    );
    assert_eq!(report.source_uncorrelated_decision_count, 1);
    assert!(
        report
            .rollback_actions
            .contains(&"resolve approval decision correlation before execution".to_string())
    );
}

#[test]
fn execution_candidates_block_rollback_review() {
    let queue = queue_snapshot("2026-05-30T12:22:00Z", &[], &[]);
    let mut view = ExecutionCandidateView::from_queue_snapshot("2026-05-30T12:27:00Z", &queue);
    view.candidate_count = 1;
    view.candidates.push(ExecutionCandidate {
        candidate_id: "candidate_1".to_string(),
        action: ActionKind::FileWrite,
        target: workspace_target("reports/should-not-execute.txt"),
    });

    let report = RollbackReviewReport::from_queue_and_view("2026-05-30T12:32:00Z", &queue, &view);

    assert_eq!(
        report.rollback_state,
        RollbackReviewState::RollbackBlockedExecutionCandidatesPresent
    );
    assert_eq!(report.source_execution_candidate_count, 1);
    assert!(
        report
            .rollback_actions
            .contains(&"remove execution candidates before rollback review".to_string())
    );
}

#[test]
fn rollback_review_serializes_to_contract_shape() {
    let queue = queue_snapshot("2026-05-30T12:23:00Z", &[], &[]);
    let view = ExecutionCandidateView::from_queue_snapshot("2026-05-30T12:28:00Z", &queue);

    let report = RollbackReviewReport::from_queue_and_view("2026-05-30T12:33:00Z", &queue, &view);
    let text = serde_json::to_string(&report).expect("rollback review should serialize");

    assert!(text.contains("\"schemaVersion\":\"2026-05-30.agent-harness.rollback-review.v1\""));
    assert!(text.contains("\"localExecutionEnabled\":false"));
    assert!(text.contains("\"evidenceRetentionRequired\":true"));
    assert!(text.contains("\"rollbackState\":\"NO_LOCAL_SIDE_EFFECTS_READY\""));
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
        "2026-05-30T12:10:00Z",
        approval,
        &admin_reviewer(),
        "approved for rollback review test",
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
        "2026-05-30T12:00:00Z",
        &manifest,
        &principal,
        &request,
        &decision,
    )
    .expect("approval-required decision should create artifact")
}

use std::path::PathBuf;

use agent_harness::{
    ActionKind, ApprovalArtifact, ApprovalDecision, ApprovalDecisionCorrelationStatus,
    ApprovalStatus, DecisionOutcome, HarnessRequest, PermissionManifest, Principal,
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
fn matching_decision_correlates_to_single_pending_approval_artifact() {
    let approval = sample_approval("approval_remote_1", "evidence_remote_1");
    let decision = sample_decision("decision_1", &approval);

    let report = correlate_approval_decisions("2026-05-29T09:00:00Z", &[approval], &[decision]);

    assert!(report.all_correlated);
    assert_eq!(report.total_approval_artifacts, 1);
    assert_eq!(report.total_decisions, 1);
    assert_eq!(
        report.entries[0].status,
        ApprovalDecisionCorrelationStatus::Matched
    );
    assert!(report.entries[0].issues.is_empty());
}

#[test]
fn decision_without_source_approval_is_marked_missing() {
    let approval = sample_approval("approval_remote_2", "evidence_remote_2");
    let decision = sample_decision("decision_missing_1", &approval);

    let report = correlate_approval_decisions("2026-05-29T09:01:00Z", &[], &[decision]);

    assert!(!report.all_correlated);
    assert_eq!(
        report.entries[0].status,
        ApprovalDecisionCorrelationStatus::MissingApproval
    );
    assert_eq!(report.entries[0].issues, vec!["approvalId not found"]);
}

#[test]
fn duplicate_approval_artifact_ids_are_marked_uncorrelated() {
    let first = sample_approval("approval_duplicate", "evidence_duplicate_1");
    let second = sample_approval("approval_duplicate", "evidence_duplicate_2");
    let decision = sample_decision("decision_duplicate_1", &first);

    let report =
        correlate_approval_decisions("2026-05-29T09:02:00Z", &[first, second], &[decision]);

    assert!(!report.all_correlated);
    assert_eq!(
        report.entries[0].status,
        ApprovalDecisionCorrelationStatus::DuplicateApprovalId
    );
    assert_eq!(report.entries[0].issues, vec!["approvalId is not unique"]);
}

#[test]
fn mismatched_decision_context_is_marked_uncorrelated() {
    let approval = sample_approval("approval_remote_3", "evidence_remote_3");
    let mut decision = sample_decision("decision_mismatch_1", &approval);
    decision.requested_principal_id = "remote:WECHAT:other".to_string();
    decision.action = ActionKind::BrowserNavigate;
    decision.target = "https://example.invalid".to_string();
    decision.source_status = ApprovalStatus::Pending;

    let report = correlate_approval_decisions("2026-05-29T09:03:00Z", &[approval], &[decision]);

    assert!(!report.all_correlated);
    assert_eq!(
        report.entries[0].status,
        ApprovalDecisionCorrelationStatus::ContextMismatch
    );
    assert_eq!(
        report.entries[0].issues,
        vec![
            "requestedPrincipalId mismatch",
            "action mismatch",
            "target mismatch"
        ]
    );
}

#[test]
fn execution_ready_decision_is_marked_uncorrelated() {
    let approval = sample_approval("approval_remote_4", "evidence_remote_4");
    let mut decision = sample_decision("decision_execution_ready_1", &approval);
    decision.execution_ready = true;

    let report = correlate_approval_decisions("2026-05-29T09:04:00Z", &[approval], &[decision]);

    assert!(!report.all_correlated);
    assert_eq!(
        report.entries[0].status,
        ApprovalDecisionCorrelationStatus::ExecutionReadyDecision
    );
    assert_eq!(
        report.entries[0].issues,
        vec!["executionReady must be false"]
    );
}

#[test]
fn correlation_report_serializes_to_contract_shape() {
    let approval = sample_approval("approval_remote_5", "evidence_remote_5");
    let decision = sample_decision("decision_contract_1", &approval);

    let report = correlate_approval_decisions("2026-05-29T09:05:00Z", &[approval], &[decision]);
    let text = serde_json::to_string(&report).expect("report should serialize");

    assert!(text.contains(
        "\"schemaVersion\":\"2026-05-29.agent-harness.approval-decision-correlation.v1\""
    ));
    assert!(text.contains("\"allCorrelated\":true"));
    assert!(text.contains("\"status\":\"MATCHED\""));
}

fn sample_decision(decision_id: &str, approval: &ApprovalArtifact) -> ApprovalDecision {
    ApprovalDecision::approve(
        decision_id,
        "2026-05-29T08:04:00Z",
        approval,
        &admin_reviewer(),
        "approved for correlation test",
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

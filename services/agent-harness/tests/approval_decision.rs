use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use agent_harness::{
    ActionKind, ApprovalArtifact, ApprovalDecision, ApprovalDecisionError, ApprovalDecisionOutcome,
    ApprovalStatus, DecisionOutcome, EvidenceStoreError, HarnessRequest,
    JsonlApprovalDecisionStore, PermissionManifest, Principal, evaluate_request,
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
        vec![
            "AGENT_COMMAND_SUBMIT".to_string(),
            "HARNESS_APPROVE".to_string(),
        ],
        false,
    )
}

fn reviewer_without_approval_scope() -> Principal {
    Principal::with_context(
        "user_teacher",
        "sess_teacher_1",
        vec!["AGENT_COMMAND_SUBMIT".to_string()],
        false,
    )
}

fn remote_reviewer_with_approval_scope() -> Principal {
    Principal::with_context(
        "remote:WECHAT:reviewer",
        "sess_remote_reviewer_1",
        vec!["HARNESS_APPROVE".to_string()],
        true,
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

fn temp_path(name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after epoch")
        .as_nanos();
    std::env::temp_dir()
        .join("ita-agent-harness-tests")
        .join(format!("{name}-{nanos}"))
}

#[test]
fn local_reviewer_can_create_approved_decision_without_execution_readiness() {
    let approval = sample_approval("approval_remote_1", "evidence_remote_1");
    let reviewer = admin_reviewer();

    let decision = ApprovalDecision::approve(
        "decision_approved_1",
        "2026-05-29T08:00:00Z",
        &approval,
        &reviewer,
        "local reviewer approved dry-run request",
    )
    .expect("admin reviewer should approve");

    assert_eq!(decision.outcome, ApprovalDecisionOutcome::Approved);
    assert_eq!(decision.approval_id, "approval_remote_1");
    assert_eq!(decision.reviewer_principal_id, "user_admin_bootstrap");
    assert_eq!(decision.requested_principal_id, "remote:WECHAT:openid");
    assert_eq!(decision.action, ActionKind::FileWrite);
    assert_eq!(decision.source_status, ApprovalStatus::Pending);
    assert!(!decision.execution_ready);
}

#[test]
fn local_reviewer_can_create_rejected_decision_without_execution_readiness() {
    let approval = sample_approval("approval_remote_2", "evidence_remote_2");
    let reviewer = admin_reviewer();

    let decision = ApprovalDecision::reject(
        "decision_rejected_1",
        "2026-05-29T08:01:00Z",
        &approval,
        &reviewer,
        "target is too broad",
    )
    .expect("admin reviewer should reject");

    assert_eq!(decision.outcome, ApprovalDecisionOutcome::Rejected);
    assert_eq!(decision.reason, "target is too broad");
    assert!(!decision.execution_ready);
}

#[test]
fn reviewer_without_harness_approve_cannot_create_decision() {
    let approval = sample_approval("approval_remote_3", "evidence_remote_3");
    let reviewer = reviewer_without_approval_scope();

    let err = ApprovalDecision::approve(
        "decision_denied_1",
        "2026-05-29T08:02:00Z",
        &approval,
        &reviewer,
        "should not be allowed",
    )
    .expect_err("reviewer without HARNESS_APPROVE must fail");

    assert_eq!(err, ApprovalDecisionError::ReviewerMissingHarnessApprove);
}

#[test]
fn remote_reviewer_with_harness_approve_cannot_create_decision() {
    let approval = sample_approval("approval_remote_4", "evidence_remote_4");
    let reviewer = remote_reviewer_with_approval_scope();

    let err = ApprovalDecision::approve(
        "decision_remote_reviewer_denied_1",
        "2026-05-29T08:02:30Z",
        &approval,
        &reviewer,
        "remote reviewers must not approve local control",
    )
    .expect_err("remote reviewer requiring Harness approval must fail");

    assert_eq!(err, ApprovalDecisionError::ReviewerRequiresHarnessApproval);
}

#[test]
fn approval_decision_serializes_to_contract_shape() {
    let approval = sample_approval("approval_remote_5", "evidence_remote_5");
    let decision = ApprovalDecision::approve(
        "decision_contract_1",
        "2026-05-29T08:03:00Z",
        &approval,
        &admin_reviewer(),
        "contract check",
    )
    .expect("admin reviewer should approve");

    let text = serde_json::to_string(&decision).expect("decision should serialize");

    assert!(text.contains("\"schemaVersion\":\"2026-05-29.agent-harness.approval-decision.v1\""));
    assert!(text.contains("\"outcome\":\"APPROVED\""));
    assert!(text.contains("\"sourceStatus\":\"PENDING\""));
    assert!(text.contains("\"executionReady\":false"));
}

#[test]
fn jsonl_approval_decision_store_appends_and_reads_in_order() {
    let path = temp_path("approval-decision-store-order").join("decisions.jsonl");
    let mut store = JsonlApprovalDecisionStore::new(&path);
    let first = sample_decision("decision_1", "approval_1");
    let second = sample_decision("decision_2", "approval_2");

    store.append(&first).expect("first append should succeed");
    store.append(&second).expect("second append should succeed");

    let records = store.read_all().expect("decision JSONL should be readable");

    assert_eq!(records[0].decision_id, "decision_1");
    assert_eq!(records[1].decision_id, "decision_2");
}

#[test]
fn jsonl_approval_decision_store_reports_typed_json_error_for_invalid_lines() {
    let path = temp_path("approval-decision-store-invalid").join("decisions.jsonl");
    create_parent(&path);
    fs::write(&path, "{bad json}\n").expect("invalid fixture should be writable");
    let store = JsonlApprovalDecisionStore::new(&path);

    let err = store.read_all().expect_err("invalid JSONL should fail");

    assert!(matches!(err, EvidenceStoreError::Json(_)));
}

fn sample_decision(decision_id: &str, approval_id: &str) -> ApprovalDecision {
    ApprovalDecision::approve(
        decision_id,
        "2026-05-29T08:04:00Z",
        &sample_approval(approval_id, "evidence_for_decision"),
        &admin_reviewer(),
        "approved for store test",
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

fn create_parent(path: &Path) {
    fs::create_dir_all(path.parent().expect("path should have parent"))
        .expect("parent should be creatable");
}

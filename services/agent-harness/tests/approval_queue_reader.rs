use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use agent_harness::{
    ActionKind, ApprovalArtifact, ApprovalDecision, ApprovalDecisionCorrelationStatus,
    ApprovalQueueSnapshot, DecisionOutcome, EvidenceStoreError, HarnessRequest,
    JsonlApprovalDecisionStore, JsonlApprovalQueueReader, JsonlApprovalStore, PermissionManifest,
    Principal, evaluate_request,
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

fn temp_dir(name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after epoch")
        .as_nanos();
    std::env::temp_dir()
        .join("ita-agent-harness-tests")
        .join(format!("{name}-{nanos}"))
}

#[test]
fn reader_loads_persisted_approvals_and_decisions_with_correlation() {
    let dir = temp_dir("approval-queue-reader-matched");
    let approvals_path = dir.join("approvals.jsonl");
    let decisions_path = dir.join("decisions.jsonl");
    let approval = sample_approval("approval_remote_1", "evidence_remote_1");
    let decision = sample_decision("decision_1", &approval);
    append_approval(&approvals_path, &approval);
    append_decision(&decisions_path, &decision);

    let reader = JsonlApprovalQueueReader::new(&approvals_path, &decisions_path);
    let snapshot = reader
        .read("2026-05-29T10:00:00Z")
        .expect("queue snapshot should read");

    assert!(snapshot.all_decisions_correlated);
    assert_eq!(snapshot.approval_artifact_count, 1);
    assert_eq!(snapshot.approval_decision_count, 1);
    assert_eq!(snapshot.uncorrelated_decision_count, 0);
    assert_eq!(snapshot.execution_candidate_count, 0);
    assert_eq!(
        snapshot.execution_disabled_reason,
        "approval queue is review-only; execution candidates are disabled"
    );
    assert_eq!(
        snapshot.correlation.entries[0].status,
        ApprovalDecisionCorrelationStatus::Matched
    );
}

#[test]
fn uncorrelated_decisions_are_counted_and_never_become_execution_candidates() {
    let dir = temp_dir("approval-queue-reader-uncorrelated");
    let approvals_path = dir.join("approvals.jsonl");
    let decisions_path = dir.join("decisions.jsonl");
    let approval = sample_approval("approval_remote_2", "evidence_remote_2");
    let decision = sample_decision("decision_missing_1", &approval);
    append_decision(&decisions_path, &decision);

    let reader = JsonlApprovalQueueReader::new(&approvals_path, &decisions_path);
    let snapshot = reader
        .read("2026-05-29T10:01:00Z")
        .expect("queue snapshot should read without approval file");

    assert!(!snapshot.all_decisions_correlated);
    assert_eq!(snapshot.approval_artifact_count, 0);
    assert_eq!(snapshot.approval_decision_count, 1);
    assert_eq!(snapshot.uncorrelated_decision_count, 1);
    assert_eq!(snapshot.execution_candidate_count, 0);
    assert_eq!(
        snapshot.execution_disabled_reason,
        "uncorrelated approval decisions block execution candidate projection"
    );
}

#[test]
fn invalid_approval_jsonl_returns_typed_json_error() {
    let dir = temp_dir("approval-queue-reader-invalid-approval");
    let approvals_path = dir.join("approvals.jsonl");
    let decisions_path = dir.join("decisions.jsonl");
    create_parent(&approvals_path);
    fs::write(&approvals_path, "{bad json}\n").expect("invalid fixture should be writable");

    let reader = JsonlApprovalQueueReader::new(&approvals_path, &decisions_path);
    let err = reader
        .read("2026-05-29T10:02:00Z")
        .expect_err("invalid approval JSONL should fail");

    assert!(matches!(err, EvidenceStoreError::Json(_)));
}

#[test]
fn invalid_decision_jsonl_returns_typed_json_error() {
    let dir = temp_dir("approval-queue-reader-invalid-decision");
    let approvals_path = dir.join("approvals.jsonl");
    let decisions_path = dir.join("decisions.jsonl");
    create_parent(&decisions_path);
    fs::write(&decisions_path, "{bad json}\n").expect("invalid fixture should be writable");

    let reader = JsonlApprovalQueueReader::new(&approvals_path, &decisions_path);
    let err = reader
        .read("2026-05-29T10:03:00Z")
        .expect_err("invalid decision JSONL should fail");

    assert!(matches!(err, EvidenceStoreError::Json(_)));
}

#[test]
fn queue_snapshot_serializes_to_contract_shape() {
    let snapshot = ApprovalQueueSnapshot::from_correlation(
        "2026-05-29T10:04:00Z",
        agent_harness::correlate_approval_decisions("2026-05-29T10:04:00Z", &[], &[]),
    );

    let text = serde_json::to_string(&snapshot).expect("snapshot should serialize");

    assert!(
        text.contains("\"schemaVersion\":\"2026-05-29.agent-harness.approval-queue-snapshot.v1\"")
    );
    assert!(text.contains("\"executionCandidateCount\":0"));
    assert!(text.contains("\"correlation\""));
}

fn append_approval(path: &Path, approval: &ApprovalArtifact) {
    let mut store = JsonlApprovalStore::new(path);
    store
        .append(approval)
        .expect("approval append should succeed");
}

fn append_decision(path: &Path, decision: &ApprovalDecision) {
    let mut store = JsonlApprovalDecisionStore::new(path);
    store
        .append(decision)
        .expect("decision append should succeed");
}

fn sample_decision(decision_id: &str, approval: &ApprovalArtifact) -> ApprovalDecision {
    ApprovalDecision::approve(
        decision_id,
        "2026-05-29T08:04:00Z",
        approval,
        &admin_reviewer(),
        "approved for queue reader test",
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

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use agent_harness::{
    ActionKind, ApprovalArtifact, ApprovalStatus, DecisionOutcome, EvidenceStoreError,
    HarnessRequest, JsonlApprovalStore, PermissionManifest, Principal, evaluate_request,
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

fn admin_principal() -> Principal {
    Principal::with_context(
        "user_admin_bootstrap",
        "sess_admin_1",
        vec![
            "AGENT_COMMAND_SUBMIT".to_string(),
            "DEVICE_LOCAL_CONTROL".to_string(),
            "HARNESS_APPROVE".to_string(),
        ],
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
fn approval_required_decision_creates_pending_artifact() {
    let manifest = load_manifest();
    let principal = remote_principal_requiring_approval();
    let request = HarnessRequest::new(
        ActionKind::FileWrite,
        workspace_target("reports/remote.txt"),
    );
    let decision = evaluate_request(&manifest, &principal, &request);

    let artifact = ApprovalArtifact::from_decision(
        "approval_remote_1",
        "evidence_remote_1",
        "2026-05-29T07:00:00Z",
        &manifest,
        &principal,
        &request,
        &decision,
    )
    .expect("approval-required decision should create artifact");

    assert_eq!(decision.outcome, DecisionOutcome::ApprovalRequired);
    assert_eq!(artifact.approval_id, "approval_remote_1");
    assert_eq!(artifact.evidence_id, "evidence_remote_1");
    assert_eq!(artifact.principal_id, "remote:WECHAT:openid");
    assert_eq!(artifact.session_id, "sess_remote_1");
    assert_eq!(artifact.action, ActionKind::FileWrite);
    assert_eq!(artifact.status, ApprovalStatus::Pending);
    assert_eq!(artifact.reason, "principal requires harness approval");
}

#[test]
fn allow_and_deny_decisions_do_not_create_approval_artifacts() {
    let manifest = load_manifest();
    let admin = admin_principal();
    let allowed_request = HarnessRequest::new(ActionKind::FileRead, workspace_target("README.md"));
    let allowed_decision = evaluate_request(&manifest, &admin, &allowed_request);

    let allowed_artifact = ApprovalArtifact::from_decision(
        "approval_allow",
        "evidence_allow",
        "2026-05-29T07:01:00Z",
        &manifest,
        &admin,
        &allowed_request,
        &allowed_decision,
    );

    let denied_request = HarnessRequest::new(ActionKind::ProcessStart, "cmd.exe");
    let denied_decision = evaluate_request(&manifest, &admin, &denied_request);
    let denied_artifact = ApprovalArtifact::from_decision(
        "approval_deny",
        "evidence_deny",
        "2026-05-29T07:02:00Z",
        &manifest,
        &admin,
        &denied_request,
        &denied_decision,
    );

    assert_eq!(allowed_decision.outcome, DecisionOutcome::AllowDryRun);
    assert_eq!(denied_decision.outcome, DecisionOutcome::Deny);
    assert!(allowed_artifact.is_none());
    assert!(denied_artifact.is_none());
}

#[test]
fn approval_artifact_serializes_to_contract_shape() {
    let manifest = load_manifest();
    let principal = remote_principal_requiring_approval();
    let request = HarnessRequest::new(
        ActionKind::FileWrite,
        workspace_target("reports/remote.txt"),
    );
    let decision = evaluate_request(&manifest, &principal, &request);
    let artifact = ApprovalArtifact::from_decision(
        "approval_remote_2",
        "evidence_remote_2",
        "2026-05-29T07:03:00Z",
        &manifest,
        &principal,
        &request,
        &decision,
    )
    .expect("approval-required decision should create artifact");

    let text = serde_json::to_string(&artifact).expect("artifact should serialize");

    assert!(text.contains("\"schemaVersion\":\"2026-05-29.agent-harness.approval-artifact.v1\""));
    assert!(text.contains("\"approvalId\":\"approval_remote_2\""));
    assert!(text.contains("\"status\":\"PENDING\""));
    assert!(text.contains("\"action\":\"FILE_WRITE\""));
}

#[test]
fn jsonl_approval_store_appends_and_reads_in_order() {
    let path = temp_path("approval-store-order").join("approvals.jsonl");
    let mut store = JsonlApprovalStore::new(&path);
    let first = sample_approval("approval_1", "evidence_1");
    let second = sample_approval("approval_2", "evidence_2");

    store.append(&first).expect("first append should succeed");
    store.append(&second).expect("second append should succeed");

    let records = store.read_all().expect("approval JSONL should be readable");

    assert_eq!(records[0].approval_id, "approval_1");
    assert_eq!(records[1].approval_id, "approval_2");
}

#[test]
fn jsonl_approval_store_reports_typed_json_error_for_invalid_lines() {
    let path = temp_path("approval-store-invalid-json").join("approvals.jsonl");
    create_parent(&path);
    fs::write(&path, "{bad json}\n").expect("invalid fixture should be writable");
    let store = JsonlApprovalStore::new(&path);

    let err = store.read_all().expect_err("invalid JSONL should fail");

    assert!(matches!(err, EvidenceStoreError::Json(_)));
}

fn sample_approval(approval_id: &str, evidence_id: &str) -> ApprovalArtifact {
    let manifest = load_manifest();
    let principal = remote_principal_requiring_approval();
    let request = HarnessRequest::new(
        ActionKind::FileWrite,
        workspace_target("reports/remote.txt"),
    );
    let decision = evaluate_request(&manifest, &principal, &request);
    ApprovalArtifact::from_decision(
        approval_id,
        evidence_id,
        "2026-05-29T07:04:00Z",
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

use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use agent_harness::{
    ActionKind, DecisionOutcome, EvidenceStoreError, HarnessRequest, JsonlEvidenceStore,
    PermissionManifest, PersistentDryRunHarness, Principal,
};

fn load_manifest() -> PermissionManifest {
    let text = include_str!("../../../contracts/harness/permission-manifest.current.json");
    PermissionManifest::from_json(text).expect("manifest should parse")
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

fn remote_principal_requiring_approval() -> Principal {
    Principal::with_context(
        "remote:WECHAT:openid",
        "sess_remote_1",
        vec!["AGENT_COMMAND_SUBMIT".to_string()],
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
fn persistent_dry_run_appends_jsonl_evidence_for_allowed_request() {
    let evidence_path = temp_path("persistent-allow").join("evidence.jsonl");
    let mut harness =
        PersistentDryRunHarness::new(load_manifest(), JsonlEvidenceStore::new(&evidence_path));
    let request = HarnessRequest::new(ActionKind::FileRead, workspace_target("README.md"));

    let report = harness.dry_run(
        "evidence_persistent_1",
        "2026-05-29T05:00:00Z",
        &admin_principal(),
        request,
    );

    assert_eq!(report.outcome, DecisionOutcome::AllowDryRun);
    assert!(report.evidence_appended);
    assert_eq!(report.evidence_error, None);
    assert!(report.would_execute);

    let records = JsonlEvidenceStore::new(&evidence_path)
        .read_all()
        .expect("evidence JSONL should be readable");
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].evidence_id, "evidence_persistent_1");
    assert_eq!(records[0].outcome, DecisionOutcome::AllowDryRun);
}

#[test]
fn persistent_dry_run_persists_denied_decision_without_execution_readiness() {
    let evidence_path = temp_path("persistent-deny").join("evidence.jsonl");
    let mut harness =
        PersistentDryRunHarness::new(load_manifest(), JsonlEvidenceStore::new(&evidence_path));
    let request = HarnessRequest::new(ActionKind::ProcessStart, "cmd.exe");

    let report = harness.dry_run(
        "evidence_persistent_2",
        "2026-05-29T05:01:00Z",
        &admin_principal(),
        request,
    );

    assert_eq!(report.outcome, DecisionOutcome::Deny);
    assert!(report.evidence_appended);
    assert!(!report.would_execute);

    let records = JsonlEvidenceStore::new(&evidence_path)
        .read_all()
        .expect("evidence JSONL should be readable");
    assert_eq!(records[0].outcome, DecisionOutcome::Deny);
}

#[test]
fn persistent_dry_run_persists_approval_required_without_execution_readiness() {
    let evidence_path = temp_path("persistent-approval").join("evidence.jsonl");
    let mut harness =
        PersistentDryRunHarness::new(load_manifest(), JsonlEvidenceStore::new(&evidence_path));
    let request = HarnessRequest::new(ActionKind::FileRead, workspace_target("README.md"));

    let report = harness.dry_run(
        "evidence_persistent_3",
        "2026-05-29T05:02:00Z",
        &remote_principal_requiring_approval(),
        request,
    );

    assert_eq!(report.outcome, DecisionOutcome::ApprovalRequired);
    assert!(report.evidence_appended);
    assert!(!report.would_execute);

    let records = JsonlEvidenceStore::new(&evidence_path)
        .read_all()
        .expect("evidence JSONL should be readable");
    assert_eq!(records[0].outcome, DecisionOutcome::ApprovalRequired);
}

#[test]
fn persistent_dry_run_surfaces_append_io_error_and_disables_execution_readiness() {
    let evidence_directory_path = temp_path("persistent-io-error");
    fs::create_dir_all(&evidence_directory_path).expect("fixture directory should be creatable");
    let mut harness = PersistentDryRunHarness::new(
        load_manifest(),
        JsonlEvidenceStore::new(&evidence_directory_path),
    );
    let request = HarnessRequest::new(ActionKind::FileRead, workspace_target("README.md"));

    let report = harness.dry_run(
        "evidence_persistent_4",
        "2026-05-29T05:03:00Z",
        &admin_principal(),
        request,
    );

    assert_eq!(report.outcome, DecisionOutcome::AllowDryRun);
    assert!(!report.evidence_appended);
    assert!(matches!(
        report.evidence_error,
        Some(EvidenceStoreError::Io(_))
    ));
    assert!(!report.would_execute);
}

use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use agent_harness::{
    ActionKind, DecisionOutcome, EvidenceStoreError, FileTargetKind, HarnessRequest,
    JsonlEvidenceStore, PermissionManifest, PersistentDryRunHarness, Principal,
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
fn persistent_file_metadata_appends_evidence_then_returns_allowed_file_metadata() {
    let evidence_path = temp_path("persistent-file-metadata-allow").join("evidence.jsonl");
    let mut harness =
        PersistentDryRunHarness::new(load_manifest(), JsonlEvidenceStore::new(&evidence_path));
    let request = HarnessRequest::new(ActionKind::FileRead, workspace_target("README.md"));

    let report = harness.dry_run_file_metadata(
        "evidence_persistent_file_metadata_1",
        "2026-05-29T06:00:00Z",
        &admin_principal(),
        request,
    );

    assert_eq!(report.outcome, DecisionOutcome::AllowDryRun);
    assert!(report.evidence_appended);
    assert_eq!(report.evidence_error, None);
    assert!(report.would_execute);
    assert_eq!(
        report.matched_rule_id.as_deref(),
        Some("refactor-plan-workspace")
    );
    assert_eq!(report.target_exists, Some(true));
    assert_eq!(report.target_kind, FileTargetKind::File);
    assert_eq!(report.parent_exists, Some(true));
    assert!(!report.content_read);
    assert!(!report.content_written);

    let records = JsonlEvidenceStore::new(&evidence_path)
        .read_all()
        .expect("evidence JSONL should be readable");
    assert_eq!(
        records[0].evidence_id,
        "evidence_persistent_file_metadata_1"
    );
}

#[test]
fn persistent_file_metadata_does_not_create_missing_write_target() {
    let evidence_path = temp_path("persistent-file-metadata-missing").join("evidence.jsonl");
    let missing_target =
        workspace_root().join("reports/__persistent_metadata_missing_target__.txt");
    assert!(!missing_target.exists());
    let mut harness =
        PersistentDryRunHarness::new(load_manifest(), JsonlEvidenceStore::new(&evidence_path));
    let request = HarnessRequest::new(
        ActionKind::FileWrite,
        missing_target.to_string_lossy().replace('\\', "/"),
    );

    let report = harness.dry_run_file_metadata(
        "evidence_persistent_file_metadata_2",
        "2026-05-29T06:01:00Z",
        &admin_principal(),
        request,
    );

    assert_eq!(report.outcome, DecisionOutcome::AllowDryRun);
    assert!(report.evidence_appended);
    assert_eq!(report.target_exists, Some(false));
    assert_eq!(report.target_kind, FileTargetKind::Missing);
    assert_eq!(report.parent_exists, Some(true));
    assert!(!report.content_read);
    assert!(!report.content_written);
    assert!(!missing_target.exists());
}

#[test]
fn persistent_file_metadata_persists_approval_required_but_keeps_metadata_unchecked() {
    let evidence_path = temp_path("persistent-file-metadata-approval").join("evidence.jsonl");
    let mut harness =
        PersistentDryRunHarness::new(load_manifest(), JsonlEvidenceStore::new(&evidence_path));
    let request = HarnessRequest::new(ActionKind::FileRead, workspace_target("README.md"));

    let report = harness.dry_run_file_metadata(
        "evidence_persistent_file_metadata_3",
        "2026-05-29T06:02:00Z",
        &remote_principal_requiring_approval(),
        request,
    );

    assert_eq!(report.outcome, DecisionOutcome::ApprovalRequired);
    assert!(report.evidence_appended);
    assert!(!report.would_execute);
    assert_eq!(
        report.matched_rule_id.as_deref(),
        Some("refactor-plan-workspace")
    );
    assert_eq!(report.target_exists, None);
    assert_eq!(report.target_kind, FileTargetKind::Unchecked);
    assert_eq!(report.parent_exists, None);

    let records = JsonlEvidenceStore::new(&evidence_path)
        .read_all()
        .expect("evidence JSONL should be readable");
    assert_eq!(records[0].outcome, DecisionOutcome::ApprovalRequired);
}

#[test]
fn persistent_file_metadata_append_failure_keeps_metadata_unchecked() {
    let evidence_directory_path = temp_path("persistent-file-metadata-io-error");
    fs::create_dir_all(&evidence_directory_path).expect("fixture directory should be creatable");
    let mut harness = PersistentDryRunHarness::new(
        load_manifest(),
        JsonlEvidenceStore::new(&evidence_directory_path),
    );
    let request = HarnessRequest::new(ActionKind::FileRead, workspace_target("README.md"));

    let report = harness.dry_run_file_metadata(
        "evidence_persistent_file_metadata_4",
        "2026-05-29T06:03:00Z",
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
    assert_eq!(report.target_exists, None);
    assert_eq!(report.target_kind, FileTargetKind::Unchecked);
    assert_eq!(report.parent_exists, None);
}

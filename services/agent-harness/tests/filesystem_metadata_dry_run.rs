use std::path::PathBuf;

use agent_harness::{
    ActionKind, DecisionOutcome, DryRunHarness, FileTargetKind, HarnessRequest,
    InMemoryEvidenceStore, PermissionManifest, Principal,
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

#[test]
fn allowed_existing_file_metadata_dry_run_does_not_read_content() {
    let mut harness = DryRunHarness::new(load_manifest(), InMemoryEvidenceStore::new());
    let request = HarnessRequest::new(ActionKind::FileRead, workspace_target("README.md"));

    let report = harness.dry_run_file_metadata(
        "evidence_file_metadata_1",
        "2026-05-29T04:00:00Z",
        &admin_principal(),
        request,
    );

    assert_eq!(report.outcome, DecisionOutcome::AllowDryRun);
    assert!(report.would_execute);
    assert_eq!(
        report.matched_rule_id.as_deref(),
        Some("refactor-plan-workspace")
    );
    assert!(report.normalized_target.ends_with("/README.md"));
    assert_eq!(report.target_exists, Some(true));
    assert_eq!(report.target_kind, FileTargetKind::File);
    assert_eq!(report.parent_exists, Some(true));
    assert!(!report.content_read);
    assert!(!report.content_written);
    assert_eq!(harness.evidence_records().len(), 1);
}

#[test]
fn allowed_missing_write_metadata_dry_run_does_not_create_target() {
    let missing_target = workspace_root().join("reports/__dry_run_metadata_missing_target__.txt");
    assert!(!missing_target.exists());

    let mut harness = DryRunHarness::new(load_manifest(), InMemoryEvidenceStore::new());
    let request = HarnessRequest::new(
        ActionKind::FileWrite,
        missing_target.to_string_lossy().replace('\\', "/"),
    );

    let report = harness.dry_run_file_metadata(
        "evidence_file_metadata_2",
        "2026-05-29T04:01:00Z",
        &admin_principal(),
        request,
    );

    assert_eq!(report.outcome, DecisionOutcome::AllowDryRun);
    assert_eq!(report.target_exists, Some(false));
    assert_eq!(report.target_kind, FileTargetKind::Missing);
    assert_eq!(report.parent_exists, Some(true));
    assert!(!report.content_read);
    assert!(!report.content_written);
    assert!(!missing_target.exists());
}

#[test]
fn denied_outside_manifest_metadata_dry_run_stays_unchecked() {
    let mut harness = DryRunHarness::new(load_manifest(), InMemoryEvidenceStore::new());
    let request = HarnessRequest::new(
        ActionKind::FileRead,
        "C:/Windows/System32/drivers/etc/hosts",
    );

    let report = harness.dry_run_file_metadata(
        "evidence_file_metadata_3",
        "2026-05-29T04:02:00Z",
        &admin_principal(),
        request,
    );

    assert_eq!(report.outcome, DecisionOutcome::Deny);
    assert!(!report.would_execute);
    assert_eq!(report.matched_rule_id, None);
    assert_eq!(report.target_exists, None);
    assert_eq!(report.target_kind, FileTargetKind::Unchecked);
    assert_eq!(report.parent_exists, None);
    assert_eq!(harness.evidence_records().len(), 1);
}

#[test]
fn approval_required_metadata_dry_run_records_evidence_without_filesystem_probe() {
    let mut harness = DryRunHarness::new(load_manifest(), InMemoryEvidenceStore::new());
    let request = HarnessRequest::new(ActionKind::FileRead, workspace_target("README.md"));

    let report = harness.dry_run_file_metadata(
        "evidence_file_metadata_4",
        "2026-05-29T04:03:00Z",
        &remote_principal_requiring_approval(),
        request,
    );

    assert_eq!(report.outcome, DecisionOutcome::ApprovalRequired);
    assert!(!report.would_execute);
    assert_eq!(
        report.matched_rule_id.as_deref(),
        Some("refactor-plan-workspace")
    );
    assert_eq!(report.target_exists, None);
    assert_eq!(report.target_kind, FileTargetKind::Unchecked);
    assert_eq!(report.parent_exists, None);
    assert_eq!(
        harness.evidence_records()[0].outcome,
        DecisionOutcome::ApprovalRequired
    );
}

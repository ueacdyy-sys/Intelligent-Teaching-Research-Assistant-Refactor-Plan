use agent_harness::{
    ActionKind, DecisionOutcome, DryRunHarness, HarnessRequest, InMemoryEvidenceStore,
    PermissionManifest, Principal,
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

#[test]
fn allowed_file_dry_run_records_evidence_without_side_effects() {
    let mut harness = DryRunHarness::new(load_manifest(), InMemoryEvidenceStore::new());
    let request = HarnessRequest::new(
        ActionKind::FileWrite,
        "C:/Users/Administrator/Desktop/Intelligent-Teaching-Research-Assistant-Refactor-Plan/reports/dry-run.txt",
    );

    let report = harness.dry_run(
        "evidence_dry_run_1",
        "2026-05-29T03:00:00Z",
        &admin_principal(),
        request,
    );

    assert_eq!(report.outcome, DecisionOutcome::AllowDryRun);
    assert!(report.would_execute);
    assert_eq!(harness.evidence_records().len(), 1);
    assert_eq!(
        harness.evidence_records()[0].evidence_id,
        "evidence_dry_run_1"
    );
    assert!(harness.evidence_records()[0].dry_run);
}

#[test]
fn denied_process_dry_run_records_non_executed_evidence() {
    let mut harness = DryRunHarness::new(load_manifest(), InMemoryEvidenceStore::new());
    let request = HarnessRequest::new(ActionKind::ProcessStart, "cmd.exe");

    let report = harness.dry_run(
        "evidence_dry_run_2",
        "2026-05-29T03:01:00Z",
        &admin_principal(),
        request,
    );

    assert_eq!(report.outcome, DecisionOutcome::Deny);
    assert!(!report.would_execute);
    assert_eq!(harness.evidence_records().len(), 1);
    assert!(!harness.evidence_records()[0].dry_run);
}

#[test]
fn approval_required_remote_dry_run_records_non_executed_evidence() {
    let mut harness = DryRunHarness::new(load_manifest(), InMemoryEvidenceStore::new());
    let principal = Principal::with_context(
        "remote:WECHAT:openid",
        "sess_remote_1",
        vec!["AGENT_COMMAND_SUBMIT".to_string()],
        true,
    );
    let request = HarnessRequest::new(
        ActionKind::FileWrite,
        "C:/Users/Administrator/Desktop/Intelligent-Teaching-Research-Assistant-Refactor-Plan/reports/remote.txt",
    );

    let report = harness.dry_run(
        "evidence_dry_run_3",
        "2026-05-29T03:02:00Z",
        &principal,
        request,
    );

    assert_eq!(report.outcome, DecisionOutcome::ApprovalRequired);
    assert!(!report.would_execute);
    assert_eq!(
        harness.evidence_records()[0].outcome,
        DecisionOutcome::ApprovalRequired
    );
}

#[test]
fn lookalike_browser_origin_is_denied() {
    let mut harness = DryRunHarness::new(load_manifest(), InMemoryEvidenceStore::new());
    let request = HarnessRequest::new(ActionKind::BrowserNavigate, "http://127.0.0.1.evil.local");

    let report = harness.dry_run(
        "evidence_dry_run_4",
        "2026-05-29T03:03:00Z",
        &admin_principal(),
        request,
    );

    assert_eq!(report.outcome, DecisionOutcome::Deny);
    assert!(!report.would_execute);
}

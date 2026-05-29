use agent_harness::{
    ActionKind, DecisionOutcome, HarnessRequest, PermissionManifest, Principal, evaluate_request,
};

fn load_manifest() -> PermissionManifest {
    let text = include_str!("../../../contracts/harness/permission-manifest.current.json");
    PermissionManifest::from_json(text).expect("manifest should parse")
}

#[test]
fn admin_principal_can_dry_run_allowed_file_write() {
    let manifest = load_manifest();
    let principal = Principal::new(
        vec![
            "AGENT_COMMAND_SUBMIT".to_string(),
            "DEVICE_LOCAL_CONTROL".to_string(),
            "HARNESS_APPROVE".to_string(),
        ],
        false,
    );
    let request = HarnessRequest::new(
        ActionKind::FileWrite,
        "C:/Users/Administrator/Desktop/Intelligent-Teaching-Research-Assistant-Refactor-Plan/reports/dry-run.txt",
    );

    let decision = evaluate_request(&manifest, &principal, &request);

    assert_eq!(decision.outcome, DecisionOutcome::AllowDryRun);
}

#[test]
fn remote_social_principal_requires_approval_before_local_control() {
    let manifest = load_manifest();
    let principal = Principal::new(vec!["AGENT_COMMAND_SUBMIT".to_string()], true);
    let request = HarnessRequest::new(
        ActionKind::FileWrite,
        "C:/Users/Administrator/Desktop/Intelligent-Teaching-Research-Assistant-Refactor-Plan/reports/remote.txt",
    );

    let decision = evaluate_request(&manifest, &principal, &request);

    assert_eq!(decision.outcome, DecisionOutcome::ApprovalRequired);
}

#[test]
fn principal_without_local_control_scope_is_denied() {
    let manifest = load_manifest();
    let principal = Principal::new(vec!["AGENT_COMMAND_SUBMIT".to_string()], false);
    let request = HarnessRequest::new(
        ActionKind::FileRead,
        "C:/Users/Administrator/Desktop/Intelligent-Teaching-Research-Assistant-Refactor-Plan/README.md",
    );

    let decision = evaluate_request(&manifest, &principal, &request);

    assert_eq!(decision.outcome, DecisionOutcome::Deny);
}

#[test]
fn unlisted_process_is_denied() {
    let manifest = load_manifest();
    let principal = Principal::new(vec!["DEVICE_LOCAL_CONTROL".to_string()], false);
    let request = HarnessRequest::new(ActionKind::ProcessStart, "cmd.exe");

    let decision = evaluate_request(&manifest, &principal, &request);

    assert_eq!(decision.outcome, DecisionOutcome::Deny);
}

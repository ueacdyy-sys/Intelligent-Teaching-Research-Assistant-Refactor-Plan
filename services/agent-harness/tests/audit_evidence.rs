use agent_harness::{
    ActionKind, AuditEvidence, DecisionOutcome, HarnessRequest, InMemoryEvidenceStore,
    PermissionManifest, Principal, evaluate_request,
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
fn allow_decision_creates_dry_run_evidence() {
    let manifest = load_manifest();
    let principal = admin_principal();
    let request = HarnessRequest::new(
        ActionKind::FileWrite,
        "C:/Users/Administrator/Desktop/Intelligent-Teaching-Research-Assistant-Refactor-Plan/reports/dry-run.txt",
    );
    let decision = evaluate_request(&manifest, &principal, &request);

    let evidence = AuditEvidence::from_decision(
        "evidence_1",
        "2026-05-29T02:50:00Z",
        &manifest,
        &principal,
        &request,
        &decision,
    );

    assert_eq!(evidence.outcome, DecisionOutcome::AllowDryRun);
    assert!(evidence.dry_run);
    assert_eq!(evidence.principal_id, "user_admin_bootstrap");
    assert_eq!(evidence.session_id, "sess_admin_1");
}

#[test]
fn approval_required_decision_creates_non_executed_evidence() {
    let manifest = load_manifest();
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
    let decision = evaluate_request(&manifest, &principal, &request);

    let evidence = AuditEvidence::from_decision(
        "evidence_2",
        "2026-05-29T02:51:00Z",
        &manifest,
        &principal,
        &request,
        &decision,
    );

    assert_eq!(evidence.outcome, DecisionOutcome::ApprovalRequired);
    assert!(!evidence.dry_run);
}

#[test]
fn evidence_serializes_to_contract_shape() {
    let manifest = load_manifest();
    let principal = admin_principal();
    let request = HarnessRequest::new(
        ActionKind::FileRead,
        "C:/Users/Administrator/Desktop/Intelligent-Teaching-Research-Assistant-Refactor-Plan/README.md",
    );
    let decision = evaluate_request(&manifest, &principal, &request);
    let evidence = AuditEvidence::from_decision(
        "evidence_3",
        "2026-05-29T02:52:00Z",
        &manifest,
        &principal,
        &request,
        &decision,
    );

    let json = serde_json::to_string(&evidence).expect("evidence should serialize");

    assert!(json.contains("\"schemaVersion\":\"2026-05-29.agent-harness.audit-evidence.v1\""));
    assert!(json.contains("\"evidenceId\":\"evidence_3\""));
    assert!(json.contains("\"action\":\"FILE_READ\""));
    assert!(json.contains("\"outcome\":\"ALLOW_DRY_RUN\""));
    assert!(json.contains("\"dryRun\":true"));
}

#[test]
fn in_memory_evidence_store_preserves_append_order() {
    let manifest = load_manifest();
    let principal = admin_principal();
    let request = HarnessRequest::new(
        ActionKind::FileRead,
        "C:/Users/Administrator/Desktop/Intelligent-Teaching-Research-Assistant-Refactor-Plan/README.md",
    );
    let decision = evaluate_request(&manifest, &principal, &request);
    let first = AuditEvidence::from_decision(
        "evidence_1",
        "2026-05-29T02:53:00Z",
        &manifest,
        &principal,
        &request,
        &decision,
    );
    let second = AuditEvidence::from_decision(
        "evidence_2",
        "2026-05-29T02:54:00Z",
        &manifest,
        &principal,
        &request,
        &decision,
    );
    let mut store = InMemoryEvidenceStore::new();

    store.append(first);
    store.append(second);

    let records = store.records();
    assert_eq!(records[0].evidence_id, "evidence_1");
    assert_eq!(records[1].evidence_id, "evidence_2");
}

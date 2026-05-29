use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use agent_harness::{
    ActionKind, AuditEvidence, DecisionOutcome, EvidenceStoreError, JsonlEvidenceStore,
};

fn temp_evidence_path(name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after epoch")
        .as_nanos();
    std::env::temp_dir()
        .join("ita-agent-harness-tests")
        .join(format!("{name}-{nanos}"))
        .join("nested")
        .join("evidence.jsonl")
}

fn sample_evidence(id: &str, action: ActionKind) -> AuditEvidence {
    AuditEvidence {
        schema_version: "2026-05-29.agent-harness.audit-evidence.v1".to_string(),
        evidence_id: id.to_string(),
        recorded_at: "2026-05-29T03:10:00Z".to_string(),
        principal_id: "user_admin_bootstrap".to_string(),
        session_id: "sess_admin_1".to_string(),
        action,
        target: "C:/Users/Administrator/Desktop/Intelligent-Teaching-Research-Assistant-Refactor-Plan/README.md".to_string(),
        outcome: DecisionOutcome::AllowDryRun,
        reason: "manifest permits dry-run action".to_string(),
        dry_run: true,
        manifest_schema_version: "2026-05-29.agent-harness.permission-manifest.v1".to_string(),
    }
}

#[test]
fn jsonl_store_creates_parent_directory_and_appends_record() {
    let path = temp_evidence_path("create-parent");
    let mut store = JsonlEvidenceStore::new(&path);

    store
        .append(&sample_evidence("evidence_1", ActionKind::FileRead))
        .expect("append should succeed");

    assert!(path.exists());
    assert!(path.parent().expect("path should have parent").exists());
}

#[test]
fn jsonl_store_reads_records_in_append_order() {
    let path = temp_evidence_path("append-order");
    let mut store = JsonlEvidenceStore::new(&path);

    store
        .append(&sample_evidence("evidence_1", ActionKind::FileRead))
        .expect("first append should succeed");
    store
        .append(&sample_evidence("evidence_2", ActionKind::FileWrite))
        .expect("second append should succeed");

    let records = store.read_all().expect("read should succeed");

    assert_eq!(records[0].evidence_id, "evidence_1");
    assert_eq!(records[1].evidence_id, "evidence_2");
}

#[test]
fn jsonl_store_writes_one_json_record_per_line() {
    let path = temp_evidence_path("line-format");
    let mut store = JsonlEvidenceStore::new(&path);

    store
        .append(&sample_evidence("evidence_1", ActionKind::FileRead))
        .expect("first append should succeed");
    store
        .append(&sample_evidence("evidence_2", ActionKind::FileWrite))
        .expect("second append should succeed");

    let text = fs::read_to_string(&path).expect("evidence file should be readable");
    let lines: Vec<&str> = text.lines().collect();

    assert_eq!(lines.len(), 2);
    assert!(lines[0].contains("\"evidenceId\":\"evidence_1\""));
    assert!(lines[1].contains("\"evidenceId\":\"evidence_2\""));
}

#[test]
fn jsonl_store_reports_typed_json_error_for_invalid_lines() {
    let path = temp_evidence_path("invalid-json");
    create_parent(&path);
    fs::write(&path, "{bad json}\n").expect("invalid fixture should be writable");
    let store = JsonlEvidenceStore::new(&path);

    let err = store.read_all().expect_err("invalid JSONL should fail");

    assert!(matches!(err, EvidenceStoreError::Json(_)));
}

fn create_parent(path: &Path) {
    fs::create_dir_all(path.parent().expect("path should have parent"))
        .expect("parent should be creatable");
}

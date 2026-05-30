use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, ErrorKind, Write};
use std::path::{Path, PathBuf};

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

mod approval_correlation;
mod approval_decision;
mod approval_queue;
mod execution_candidate;
mod rollback_review;
pub use approval_correlation::{
    ApprovalDecisionCorrelationEntry, ApprovalDecisionCorrelationReport,
    ApprovalDecisionCorrelationStatus, correlate_approval_decisions,
};
pub use approval_decision::{
    ApprovalDecision, ApprovalDecisionError, ApprovalDecisionOutcome, JsonlApprovalDecisionStore,
};
pub use approval_queue::{ApprovalQueueSnapshot, JsonlApprovalQueueReader};
pub use execution_candidate::{ExecutionCandidate, ExecutionCandidateView};
pub use rollback_review::{RollbackReviewReport, RollbackReviewState};

const DEVICE_LOCAL_CONTROL: &str = "DEVICE_LOCAL_CONTROL";
const AUDIT_EVIDENCE_SCHEMA_VERSION: &str = "2026-05-29.agent-harness.audit-evidence.v1";
const APPROVAL_ARTIFACT_SCHEMA_VERSION: &str = "2026-05-29.agent-harness.approval-artifact.v1";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionManifest {
    pub schema_version: String,
    pub default_decision: DefaultDecision,
    pub file_rules: Vec<FileRule>,
    pub process_rules: Vec<ProcessRule>,
    pub browser_rules: Vec<BrowserRule>,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
pub enum DefaultDecision {
    #[serde(rename = "DENY")]
    Deny,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRule {
    pub id: String,
    pub root: String,
    pub actions: Vec<ActionKind>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessRule {
    pub id: String,
    pub executable: String,
    pub mode: ProcessMode,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
pub enum ProcessMode {
    #[serde(rename = "DRY_RUN_ONLY")]
    DryRunOnly,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserRule {
    pub id: String,
    pub origin: String,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
pub enum ActionKind {
    #[serde(rename = "FILE_READ")]
    FileRead,
    #[serde(rename = "FILE_WRITE")]
    FileWrite,
    #[serde(rename = "PROCESS_START")]
    ProcessStart,
    #[serde(rename = "BROWSER_NAVIGATE")]
    BrowserNavigate,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
pub enum DecisionOutcome {
    #[serde(rename = "ALLOW_DRY_RUN")]
    AllowDryRun,
    #[serde(rename = "APPROVAL_REQUIRED")]
    ApprovalRequired,
    #[serde(rename = "DENY")]
    Deny,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Decision {
    pub outcome: DecisionOutcome,
    pub reason: String,
}

#[derive(Debug)]
pub struct Principal {
    principal_id: String,
    session_id: String,
    scopes: Vec<String>,
    requires_harness_approval: bool,
}

impl Principal {
    pub fn new(scopes: Vec<String>, requires_harness_approval: bool) -> Self {
        Self::with_context(
            "UNKNOWN_PRINCIPAL",
            "UNKNOWN_SESSION",
            scopes,
            requires_harness_approval,
        )
    }

    pub fn with_context(
        principal_id: impl Into<String>,
        session_id: impl Into<String>,
        scopes: Vec<String>,
        requires_harness_approval: bool,
    ) -> Self {
        Self {
            principal_id: principal_id.into(),
            session_id: session_id.into(),
            scopes,
            requires_harness_approval,
        }
    }

    fn has_scope(&self, scope: &str) -> bool {
        self.scopes.iter().any(|item| item == scope)
    }
}

#[derive(Debug)]
pub struct HarnessRequest {
    action: ActionKind,
    target: String,
}

impl HarnessRequest {
    pub fn new(action: ActionKind, target: impl Into<String>) -> Self {
        Self {
            action,
            target: target.into(),
        }
    }
}

impl PermissionManifest {
    pub fn from_json(text: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(text)
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuditEvidence {
    pub schema_version: String,
    pub evidence_id: String,
    pub recorded_at: String,
    pub principal_id: String,
    pub session_id: String,
    pub action: ActionKind,
    pub target: String,
    pub outcome: DecisionOutcome,
    pub reason: String,
    pub dry_run: bool,
    pub manifest_schema_version: String,
}

impl AuditEvidence {
    pub fn from_decision(
        evidence_id: impl Into<String>,
        recorded_at: impl Into<String>,
        manifest: &PermissionManifest,
        principal: &Principal,
        request: &HarnessRequest,
        decision: &Decision,
    ) -> Self {
        Self {
            schema_version: AUDIT_EVIDENCE_SCHEMA_VERSION.to_string(),
            evidence_id: evidence_id.into(),
            recorded_at: recorded_at.into(),
            principal_id: principal.principal_id.clone(),
            session_id: principal.session_id.clone(),
            action: request.action,
            target: request.target.clone(),
            outcome: decision.outcome,
            reason: decision.reason.clone(),
            dry_run: decision.outcome == DecisionOutcome::AllowDryRun,
            manifest_schema_version: manifest.schema_version.clone(),
        }
    }
}

pub trait EvidenceStore {
    fn append(&mut self, evidence: AuditEvidence);
    fn records(&self) -> &[AuditEvidence];
}

#[derive(Debug, Default)]
pub struct InMemoryEvidenceStore {
    records: Vec<AuditEvidence>,
}

impl InMemoryEvidenceStore {
    pub fn new() -> Self {
        Self { records: vec![] }
    }

    pub fn append(&mut self, evidence: AuditEvidence) {
        <Self as EvidenceStore>::append(self, evidence);
    }

    pub fn records(&self) -> &[AuditEvidence] {
        <Self as EvidenceStore>::records(self)
    }
}

impl EvidenceStore for InMemoryEvidenceStore {
    fn append(&mut self, evidence: AuditEvidence) {
        self.records.push(evidence);
    }

    fn records(&self) -> &[AuditEvidence] {
        &self.records
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EvidenceStoreError {
    Io(String),
    Json(String),
}

pub struct JsonlEvidenceStore {
    path: PathBuf,
}

impl JsonlEvidenceStore {
    pub fn new(path: impl AsRef<Path>) -> Self {
        Self {
            path: path.as_ref().to_path_buf(),
        }
    }

    pub fn append(&mut self, evidence: &AuditEvidence) -> Result<(), EvidenceStoreError> {
        append_jsonl_record(&self.path, evidence)
    }

    pub fn read_all(&self) -> Result<Vec<AuditEvidence>, EvidenceStoreError> {
        read_jsonl_records(&self.path)
    }
}

pub trait EvidenceSink {
    fn try_append(&mut self, evidence: AuditEvidence) -> Result<(), EvidenceStoreError>;
}

impl EvidenceSink for JsonlEvidenceStore {
    fn try_append(&mut self, evidence: AuditEvidence) -> Result<(), EvidenceStoreError> {
        self.append(&evidence)
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
pub enum ApprovalStatus {
    #[serde(rename = "PENDING")]
    Pending,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalArtifact {
    pub schema_version: String,
    pub approval_id: String,
    pub evidence_id: String,
    pub requested_at: String,
    pub principal_id: String,
    pub session_id: String,
    pub action: ActionKind,
    pub target: String,
    pub reason: String,
    pub status: ApprovalStatus,
    pub manifest_schema_version: String,
}

impl ApprovalArtifact {
    pub fn from_decision(
        approval_id: impl Into<String>,
        evidence_id: impl Into<String>,
        requested_at: impl Into<String>,
        manifest: &PermissionManifest,
        principal: &Principal,
        request: &HarnessRequest,
        decision: &Decision,
    ) -> Option<Self> {
        if decision.outcome != DecisionOutcome::ApprovalRequired {
            return None;
        }
        Some(Self {
            schema_version: APPROVAL_ARTIFACT_SCHEMA_VERSION.to_string(),
            approval_id: approval_id.into(),
            evidence_id: evidence_id.into(),
            requested_at: requested_at.into(),
            principal_id: principal.principal_id.clone(),
            session_id: principal.session_id.clone(),
            action: request.action,
            target: request.target.clone(),
            reason: decision.reason.clone(),
            status: ApprovalStatus::Pending,
            manifest_schema_version: manifest.schema_version.clone(),
        })
    }
}

pub struct JsonlApprovalStore {
    path: PathBuf,
}

impl JsonlApprovalStore {
    pub fn new(path: impl AsRef<Path>) -> Self {
        Self {
            path: path.as_ref().to_path_buf(),
        }
    }

    pub fn append(&mut self, artifact: &ApprovalArtifact) -> Result<(), EvidenceStoreError> {
        append_jsonl_record(&self.path, artifact)
    }

    pub fn read_all(&self) -> Result<Vec<ApprovalArtifact>, EvidenceStoreError> {
        read_jsonl_records(&self.path)
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct DryRunReport {
    pub outcome: DecisionOutcome,
    pub reason: String,
    pub would_execute: bool,
    pub evidence_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileTargetKind {
    File,
    Directory,
    Symlink,
    Missing,
    Other,
    Unchecked,
}

#[derive(Debug, PartialEq, Eq)]
pub struct FileMetadataReport {
    pub outcome: DecisionOutcome,
    pub reason: String,
    pub would_execute: bool,
    pub evidence_id: String,
    pub normalized_target: String,
    pub matched_rule_id: Option<String>,
    pub target_exists: Option<bool>,
    pub target_kind: FileTargetKind,
    pub parent_exists: Option<bool>,
    pub content_read: bool,
    pub content_written: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub struct PersistentDryRunReport {
    pub outcome: DecisionOutcome,
    pub reason: String,
    pub would_execute: bool,
    pub evidence_id: String,
    pub evidence_appended: bool,
    pub evidence_error: Option<EvidenceStoreError>,
}

#[derive(Debug, PartialEq, Eq)]
pub struct PersistentFileMetadataReport {
    pub outcome: DecisionOutcome,
    pub reason: String,
    pub would_execute: bool,
    pub evidence_id: String,
    pub evidence_appended: bool,
    pub evidence_error: Option<EvidenceStoreError>,
    pub normalized_target: String,
    pub matched_rule_id: Option<String>,
    pub target_exists: Option<bool>,
    pub target_kind: FileTargetKind,
    pub parent_exists: Option<bool>,
    pub content_read: bool,
    pub content_written: bool,
}

pub struct DryRunHarness<S: EvidenceStore> {
    manifest: PermissionManifest,
    evidence_store: S,
}

pub struct PersistentDryRunHarness<S: EvidenceSink> {
    manifest: PermissionManifest,
    evidence_store: S,
}

impl<S: EvidenceStore> DryRunHarness<S> {
    pub fn new(manifest: PermissionManifest, evidence_store: S) -> Self {
        Self {
            manifest,
            evidence_store,
        }
    }

    pub fn dry_run(
        &mut self,
        evidence_id: impl Into<String>,
        recorded_at: impl Into<String>,
        principal: &Principal,
        request: HarnessRequest,
    ) -> DryRunReport {
        let evidence_id = evidence_id.into();
        let decision = evaluate_request(&self.manifest, principal, &request);
        let evidence = AuditEvidence::from_decision(
            evidence_id.clone(),
            recorded_at,
            &self.manifest,
            principal,
            &request,
            &decision,
        );
        self.evidence_store.append(evidence);
        DryRunReport {
            outcome: decision.outcome,
            reason: decision.reason,
            would_execute: decision.outcome == DecisionOutcome::AllowDryRun,
            evidence_id,
        }
    }

    pub fn dry_run_file_metadata(
        &mut self,
        evidence_id: impl Into<String>,
        recorded_at: impl Into<String>,
        principal: &Principal,
        request: HarnessRequest,
    ) -> FileMetadataReport {
        let evidence_id = evidence_id.into();
        let matched_rule_id = matching_file_rule_id(&self.manifest, &request);
        let normalized_target = normalize_slashes(&request.target);
        let decision = if is_file_action(request.action) {
            evaluate_request(&self.manifest, principal, &request)
        } else {
            deny("filesystem metadata dry-run only supports file actions")
        };
        let evidence = AuditEvidence::from_decision(
            evidence_id.clone(),
            recorded_at,
            &self.manifest,
            principal,
            &request,
            &decision,
        );
        self.evidence_store.append(evidence);

        let mut report = FileMetadataReport {
            outcome: decision.outcome,
            reason: decision.reason,
            would_execute: decision.outcome == DecisionOutcome::AllowDryRun,
            evidence_id,
            normalized_target,
            matched_rule_id,
            target_exists: None,
            target_kind: FileTargetKind::Unchecked,
            parent_exists: None,
            content_read: false,
            content_written: false,
        };

        if report.outcome == DecisionOutcome::AllowDryRun {
            apply_filesystem_metadata(&mut report);
        }

        report
    }

    pub fn evidence_records(&self) -> &[AuditEvidence] {
        self.evidence_store.records()
    }
}

impl<S: EvidenceSink> PersistentDryRunHarness<S> {
    pub fn new(manifest: PermissionManifest, evidence_store: S) -> Self {
        Self {
            manifest,
            evidence_store,
        }
    }

    pub fn dry_run(
        &mut self,
        evidence_id: impl Into<String>,
        recorded_at: impl Into<String>,
        principal: &Principal,
        request: HarnessRequest,
    ) -> PersistentDryRunReport {
        let evidence_id = evidence_id.into();
        let decision = evaluate_request(&self.manifest, principal, &request);
        let evidence = AuditEvidence::from_decision(
            evidence_id.clone(),
            recorded_at,
            &self.manifest,
            principal,
            &request,
            &decision,
        );
        let append_result = self.evidence_store.try_append(evidence);
        let evidence_error = append_result.err();
        let evidence_appended = evidence_error.is_none();

        PersistentDryRunReport {
            outcome: decision.outcome,
            reason: decision.reason,
            would_execute: evidence_appended && decision.outcome == DecisionOutcome::AllowDryRun,
            evidence_id,
            evidence_appended,
            evidence_error,
        }
    }

    pub fn dry_run_file_metadata(
        &mut self,
        evidence_id: impl Into<String>,
        recorded_at: impl Into<String>,
        principal: &Principal,
        request: HarnessRequest,
    ) -> PersistentFileMetadataReport {
        let evidence_id = evidence_id.into();
        let matched_rule_id = matching_file_rule_id(&self.manifest, &request);
        let normalized_target = normalize_slashes(&request.target);
        let decision = if is_file_action(request.action) {
            evaluate_request(&self.manifest, principal, &request)
        } else {
            deny("filesystem metadata dry-run only supports file actions")
        };
        let evidence = AuditEvidence::from_decision(
            evidence_id.clone(),
            recorded_at,
            &self.manifest,
            principal,
            &request,
            &decision,
        );
        let append_result = self.evidence_store.try_append(evidence);
        let evidence_error = append_result.err();
        let evidence_appended = evidence_error.is_none();

        let mut report = PersistentFileMetadataReport {
            outcome: decision.outcome,
            reason: decision.reason,
            would_execute: evidence_appended && decision.outcome == DecisionOutcome::AllowDryRun,
            evidence_id,
            evidence_appended,
            evidence_error,
            normalized_target,
            matched_rule_id,
            target_exists: None,
            target_kind: FileTargetKind::Unchecked,
            parent_exists: None,
            content_read: false,
            content_written: false,
        };

        if report.would_execute {
            apply_persistent_filesystem_metadata(&mut report);
        }

        report
    }
}

pub fn evaluate_request(
    manifest: &PermissionManifest,
    principal: &Principal,
    request: &HarnessRequest,
) -> Decision {
    if !manifest_allows_target(manifest, request) {
        return deny("target is not permitted by manifest");
    }
    if principal.requires_harness_approval {
        return Decision {
            outcome: DecisionOutcome::ApprovalRequired,
            reason: "principal requires harness approval".to_string(),
        };
    }
    if !principal.has_scope(DEVICE_LOCAL_CONTROL) {
        return deny("principal is missing DEVICE_LOCAL_CONTROL");
    }
    Decision {
        outcome: DecisionOutcome::AllowDryRun,
        reason: "manifest permits dry-run action".to_string(),
    }
}

fn manifest_allows_target(manifest: &PermissionManifest, request: &HarnessRequest) -> bool {
    match request.action {
        ActionKind::FileRead | ActionKind::FileWrite => manifest.file_rules.iter().any(|rule| {
            rule.actions.contains(&request.action) && is_under_root(&request.target, &rule.root)
        }),
        ActionKind::ProcessStart => manifest.process_rules.iter().any(|rule| {
            rule.mode == ProcessMode::DryRunOnly
                && executable_matches(&request.target, &rule.executable)
        }),
        ActionKind::BrowserNavigate => manifest
            .browser_rules
            .iter()
            .any(|rule| origin_matches(&request.target, &rule.origin)),
    }
}

fn matching_file_rule_id(
    manifest: &PermissionManifest,
    request: &HarnessRequest,
) -> Option<String> {
    if !is_file_action(request.action) {
        return None;
    }
    manifest
        .file_rules
        .iter()
        .find(|rule| {
            rule.actions.contains(&request.action) && is_under_root(&request.target, &rule.root)
        })
        .map(|rule| rule.id.clone())
}

fn is_file_action(action: ActionKind) -> bool {
    matches!(action, ActionKind::FileRead | ActionKind::FileWrite)
}

fn apply_filesystem_metadata(report: &mut FileMetadataReport) {
    let metadata = probe_filesystem_metadata(&report.normalized_target);
    report.target_exists = metadata.target_exists;
    report.target_kind = metadata.target_kind;
    report.parent_exists = metadata.parent_exists;
}

fn apply_persistent_filesystem_metadata(report: &mut PersistentFileMetadataReport) {
    let metadata = probe_filesystem_metadata(&report.normalized_target);
    report.target_exists = metadata.target_exists;
    report.target_kind = metadata.target_kind;
    report.parent_exists = metadata.parent_exists;
}

struct FilesystemMetadataProbe {
    target_exists: Option<bool>,
    target_kind: FileTargetKind,
    parent_exists: Option<bool>,
}

fn probe_filesystem_metadata(normalized_target: &str) -> FilesystemMetadataProbe {
    let target = Path::new(normalized_target);
    let (target_exists, target_kind) = match fs::symlink_metadata(target) {
        Ok(metadata) => (Some(true), file_target_kind(&metadata)),
        Err(error) if error.kind() == ErrorKind::NotFound => (Some(false), FileTargetKind::Missing),
        Err(_) => (None, FileTargetKind::Unchecked),
    };
    FilesystemMetadataProbe {
        target_exists,
        target_kind,
        parent_exists: target
            .parent()
            .and_then(path_exists_without_following_symlinks),
    }
}

fn file_target_kind(metadata: &fs::Metadata) -> FileTargetKind {
    let file_type = metadata.file_type();
    if file_type.is_symlink() {
        FileTargetKind::Symlink
    } else if file_type.is_file() {
        FileTargetKind::File
    } else if file_type.is_dir() {
        FileTargetKind::Directory
    } else {
        FileTargetKind::Other
    }
}

fn path_exists_without_following_symlinks(path: &Path) -> Option<bool> {
    match fs::symlink_metadata(path) {
        Ok(_) => Some(true),
        Err(error) if error.kind() == ErrorKind::NotFound => Some(false),
        Err(_) => None,
    }
}

fn is_under_root(target: &str, root: &str) -> bool {
    let target = normalize_slashes(target);
    let root = normalize_slashes(root);
    if has_parent_segment(&target) || has_parent_segment(&root) || root.is_empty() {
        return false;
    }
    target == root || target.starts_with(&format!("{root}/"))
}

fn executable_matches(target: &str, allowed: &str) -> bool {
    executable_name(target) == executable_name(allowed)
}

fn executable_name(value: &str) -> String {
    let normalized = normalize_slashes(value).to_ascii_lowercase();
    let basename = normalized.rsplit('/').next().unwrap_or_default();
    basename
        .strip_suffix(".exe")
        .unwrap_or(basename)
        .to_string()
}

fn origin_matches(target: &str, allowed_origin: &str) -> bool {
    let target = normalize_slashes(target).to_ascii_lowercase();
    let allowed = normalize_slashes(allowed_origin).to_ascii_lowercase();
    if allowed.is_empty() || has_parent_segment(&target) || has_parent_segment(&allowed) {
        return false;
    }
    target == allowed
        || target.starts_with(&format!("{allowed}/"))
        || target.starts_with(&format!("{allowed}:"))
}

fn normalize_slashes(value: &str) -> String {
    value
        .trim()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_string()
}

fn has_parent_segment(value: &str) -> bool {
    value.split('/').any(|segment| segment == "..")
}

fn deny(reason: &str) -> Decision {
    Decision {
        outcome: DecisionOutcome::Deny,
        reason: reason.to_string(),
    }
}

fn append_jsonl_record<T: Serialize>(path: &Path, value: &T) -> Result<(), EvidenceStoreError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(to_io_error)?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(to_io_error)?;
    serde_json::to_writer(&mut file, value).map_err(to_json_error)?;
    file.write_all(b"\n").map_err(to_io_error)?;
    Ok(())
}

fn read_jsonl_records<T: DeserializeOwned>(path: &Path) -> Result<Vec<T>, EvidenceStoreError> {
    let file = OpenOptions::new()
        .read(true)
        .open(path)
        .map_err(to_io_error)?;
    let mut records = Vec::new();
    for line in BufReader::new(file).lines() {
        let line = line.map_err(to_io_error)?;
        if line.trim().is_empty() {
            continue;
        }
        records.push(serde_json::from_str(&line).map_err(to_json_error)?);
    }
    Ok(records)
}

fn to_io_error(error: std::io::Error) -> EvidenceStoreError {
    EvidenceStoreError::Io(error.to_string())
}

fn to_json_error(error: serde_json::Error) -> EvidenceStoreError {
    EvidenceStoreError::Json(error.to_string())
}

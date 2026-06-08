import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditRootWorkflowCoverage, formatRootWorkflowCoverageAudit, rootWorkflows, sourceReports } from "./root-workflow-coverage-audit.mjs";
describe("root workflow coverage audit", () => {
  it("passes when every immutable-root workflow has current evidence", () => {
    const report = auditRootWorkflowCoverage(currentInputs());
    assert.equal(report.readiness, "READY");
    assert.equal(report.summary.totalWorkflows, rootWorkflows.length);
    assert.equal(report.summary.coveredWorkflows, rootWorkflows.length);
    assert.equal(report.summary.contractOnlyWorkflows, 0);
    assert.equal(report.summary.runtimeCoveredWorkflows, 5);
    const research = workflowById(report, "research_conversation_and_fusion");
    assert.deepEqual(runtimeNames(research), "research_agent_readonly_runtime_slo research_agent_readonly_runtime_adapter research_deep_research_intent_runtime research_deep_research_worker_lifecycle_runtime research_deep_research_retrieval_plan_runtime research_deep_research_retrieval_execution_runtime research_deep_research_reasoning_synthesis_runtime research_deep_research_final_answer_review_runtime research_deep_research_finalization_runtime research_deep_research_render_preview_runtime research_deep_research_publication_precheck_runtime research_deep_research_teacher_delivery_runtime research_deep_research_student_visibility_review_runtime research_deep_research_student_delivery_runtime research_deep_research_student_archive_persistence_runtime research_deep_research_student_archive_projection_review_runtime research_deep_research_student_archive_projection_runtime research_deep_research_student_archive_storage_precommit_runtime research_deep_research_student_archive_storage_commit_runtime research_deep_research_student_archive_row_verification_runtime".split(" "));
    for (const key of researchReportKeys()) assertReportPassed(research, key);
    const teaching = workflowById(report, "teaching_archive_quiz_and_ai_grading");
    assert.deepEqual(runtimeNames(teaching), "teaching_agent_readonly_runtime_slo teaching_agent_readonly_runtime_adapter teaching_archive_material_draft_human_review_runtime teaching_archive_material_draft_storage_precommit_runtime teaching_archive_material_draft_storage_commit_runtime teaching_archive_material_draft_storage_row_verification_runtime teaching_archive_material_draft_student_product_read_runtime teaching_archive_material_publication_precheck_runtime teaching_archive_material_publication_approval_runtime teaching_archive_material_publication_delivery_runtime teaching_archive_material_publication_persistence_command_runtime teaching_archive_material_publication_storage_commit_runtime teaching_archive_material_publication_row_verification_runtime teaching_archive_material_publication_student_app_read_runtime teaching_archive_material_publication_projection_hardening_runtime teaching_archive_material_published_search_foundation_runtime teaching_archive_material_published_detail_metadata_read_runtime teaching_archive_material_published_content_preview_precheck_runtime teaching_archive_material_published_content_preview_read_foundation teaching_archive_material_published_content_preview_render_envelope teaching_archive_material_published_study_packet teaching_archive_material_published_learning_actions student_app_ai_tutor_published_learning_action_source student_app_ai_tutor_worker_study_packet_input student_app_ai_tutor_model_execution_precheck_runtime".split(" "));
    for (const key of "teachingAgentReadonlyRuntimeAdapter teachingArchiveMaterialDraftHumanReview teachingArchiveMaterialDraftStoragePrecommit teachingArchiveMaterialDraftStorageCommit teachingArchiveMaterialDraftStorageRowVerification teachingArchiveMaterialDraftStudentProductRead teachingArchiveMaterialPublicationPrecheck teachingArchiveMaterialPublicationApproval teachingArchiveMaterialPublicationDelivery teachingArchiveMaterialPublicationPersistenceCommand teachingArchiveMaterialPublicationStorageCommit teachingArchiveMaterialPublicationRowVerification teachingArchiveMaterialPublicationStudentAppRead teachingArchiveMaterialPublicationProjectionHardening teachingArchiveMaterialPublishedSearchFoundation teachingArchiveMaterialPublishedDetailMetadataRead teachingArchiveMaterialPublishedContentPreviewPrecheck teachingArchiveMaterialPublishedContentPreviewReadFoundation teachingArchiveMaterialPublishedContentPreviewRenderEnvelope teachingArchiveMaterialPublishedStudyPacket teachingArchiveMaterialPublishedLearningActions studentAppAiTutorPublishedLearningActionSource studentAppAiTutorWorkerStudyPacketInput studentAppAiTutorModelExecutionPrecheck".split(" ")) assertReportPassed(teaching, key);
    assertRuntimeAfter(teaching, "student_app_ai_tutor_model_execution_precheck_runtime", "student_app_ai_tutor_controlled_answer_artifact_runtime");
    assertReportPassed(teaching, "studentAppAiTutorControlledAnswerArtifact");
    assertRuntimeAfter(teaching, "student_app_ai_tutor_controlled_answer_artifact_runtime", "student_app_ai_tutor_answer_review_gate_runtime");
    assertReportPassed(teaching, "studentAppAiTutorAnswerReviewGate");
    assertRuntimeAfter(teaching, "student_app_ai_tutor_answer_review_gate_runtime", "student_app_ai_tutor_reviewed_result_persistence_bridge_runtime");
    assertReportPassed(teaching, "studentAppAiTutorReviewedResultPersistenceBridge");
    assertRuntimeAfter(teaching, "student_app_ai_tutor_reviewed_result_persistence_bridge_runtime", "student_app_ai_tutor_result_student_visibility_review_runtime");
    assertReportPassed(teaching, "studentAppAiTutorResultStudentVisibilityReview");
    assertRuntimeAfter(teaching, "student_app_ai_tutor_result_student_visibility_review_runtime", "student_app_ai_tutor_result_student_delivery_envelope_runtime");
    assertReportPassed(teaching, "studentAppAiTutorResultStudentDeliveryEnvelope");
    assertRuntimeAfter(teaching, "student_app_ai_tutor_result_student_delivery_envelope_runtime", "student_app_ai_tutor_result_student_archive_persistence_command_runtime");
    assertReportPassed(teaching, "studentAppAiTutorResultStudentArchivePersistenceCommand");
    assertRuntimeAfter(teaching, "student_app_ai_tutor_result_student_archive_persistence_command_runtime", "student_app_ai_tutor_result_student_archive_storage_commit_runtime");
    assertReportPassed(teaching, "studentAppAiTutorResultStudentArchiveStorageCommit");
    const studentTutor = workflowById(report, "student_app_personalized_learning");
    assert.deepEqual(runtimeNames(studentTutor), "student_tutor_agent_readonly_runtime_slo student_tutor_agent_readonly_runtime_adapter student_app_ai_tutor_request_runtime student_app_ai_tutor_published_learning_action_source student_app_ai_tutor_worker_study_packet_input student_app_ai_tutor_model_execution_precheck_runtime student_app_ai_tutor_worker_claim_runtime student_app_ai_tutor_result_runtime student_app_ai_tutor_question_bank_draft_generation_plan_runtime student_app_ai_tutor_question_bank_draft_generation_worker_claim_precheck_runtime student_app_ai_tutor_question_bank_draft_generation_worker_claim_runtime student_app_ai_tutor_question_bank_draft_generation_input_envelope_runtime student_app_ai_tutor_question_bank_draft_generation_model_execution_precheck_runtime student_app_ai_tutor_question_bank_draft_generation_controlled_draft_runtime student_app_ai_tutor_question_bank_draft_generation_teacher_review_runtime student_app_ai_tutor_question_bank_draft_generation_content_storage_commit_runtime student_app_ai_tutor_question_bank_draft_generation_content_row_verification_runtime student_app_ai_tutor_question_bank_draft_visibility_runtime student_app_ai_tutor_question_bank_draft_content_precheck_runtime student_app_ai_tutor_question_bank_draft_content_read_foundation student_app_ai_tutor_question_bank_draft_content_student_read_verification_runtime student_app_ai_tutor_question_bank_draft_answer_submission_foundation student_app_ai_tutor_question_bank_draft_answer_submission_verification_runtime student_app_ai_tutor_question_bank_draft_answer_scoring_request_foundation student_app_ai_tutor_question_bank_draft_answer_scoring_request_verification_runtime student_app_ai_tutor_question_bank_draft_answer_scoring_input_foundation student_app_ai_tutor_question_bank_draft_answer_scoring_model_execution_precheck_runtime student_app_ai_tutor_question_bank_draft_answer_controlled_scoring_artifact_runtime student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_runtime student_app_ai_tutor_question_bank_draft_answer_scoring_result_foundation student_app_ai_tutor_question_bank_draft_answer_scoring_completion_bridge student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime student_app_ai_tutor_question_bank_draft_answer_feedback_generation_model_execution_precheck_runtime student_app_ai_tutor_question_bank_draft_answer_feedback_controlled_draft_runtime student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_controlled_draft_source_runtime student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_controlled_draft_source_runtime student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_controlled_draft_source_runtime student_app_ai_tutor_question_bank_draft_answer_feedback_archive_persistence_command_controlled_draft_source_runtime student_app_ai_tutor_question_bank_draft_answer_feedback_archive_storage_commit_controlled_draft_source_runtime student_app_ai_tutor_question_bank_draft_answer_feedback_archive_row_verification_controlled_draft_source_runtime student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_runtime student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_runtime student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_runtime student_app_ai_tutor_question_bank_draft_answer_feedback_archive_persistence_command_runtime student_app_ai_tutor_question_bank_draft_answer_feedback_archive_storage_commit_runtime student_app_ai_tutor_question_bank_draft_answer_feedback_archive_row_verification_runtime teaching_archive_material_draft_student_product_read_runtime teaching_archive_material_publication_precheck_runtime teaching_archive_material_publication_approval_runtime teaching_archive_material_publication_delivery_runtime teaching_archive_material_publication_persistence_command_runtime teaching_archive_material_publication_storage_commit_runtime teaching_archive_material_publication_row_verification_runtime teaching_archive_material_publication_student_app_read_runtime teaching_archive_material_publication_projection_hardening_runtime teaching_archive_material_published_search_foundation_runtime teaching_archive_material_published_detail_metadata_read_runtime teaching_archive_material_published_content_preview_precheck_runtime teaching_archive_material_published_content_preview_read_foundation teaching_archive_material_published_content_preview_render_envelope teaching_archive_material_published_study_packet teaching_archive_material_published_learning_actions".split(" "));
    for (const key of "studentTutorAgentReadonlyRuntimeAdapter studentAppAiTutorRequest studentAppAiTutorPublishedLearningActionSource studentAppAiTutorWorkerStudyPacketInput studentAppAiTutorModelExecutionPrecheck studentAppAiTutorWorkerClaim studentAppAiTutorResult studentAppAiTutorQuestionBankDraftGenerationPlan studentAppAiTutorQuestionBankDraftGenerationWorkerClaimPrecheck studentAppAiTutorQuestionBankDraftGenerationWorkerClaim studentAppAiTutorQuestionBankDraftGenerationInputEnvelope studentAppAiTutorQuestionBankDraftGenerationModelExecutionPrecheck studentAppAiTutorQuestionBankDraftGenerationControlledDraft studentAppAiTutorQuestionBankDraftGenerationTeacherReview studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit studentAppAiTutorQuestionBankDraftGenerationContentRowVerification studentAppAiTutorQuestionBankDraftVisibility studentAppAiTutorQuestionBankDraftContentPrecheck studentAppAiTutorQuestionBankDraftContentRead studentAppAiTutorQuestionBankDraftContentStudentReadVerification studentAppAiTutorQuestionBankDraftAnswerSubmission studentAppAiTutorQuestionBankDraftAnswerSubmissionVerification studentAppAiTutorQuestionBankDraftAnswerScoringRequest studentAppAiTutorQuestionBankDraftAnswerScoringRequestVerification studentAppAiTutorQuestionBankDraftAnswerScoringInput studentAppAiTutorQuestionBankDraftAnswerScoringModelExecutionPrecheck studentAppAiTutorQuestionBankDraftAnswerControlledScoringArtifact studentAppAiTutorQuestionBankDraftAnswerScoringResultPersistenceBridge studentAppAiTutorQuestionBankDraftAnswerScoringResult studentAppAiTutorQuestionBankDraftAnswerScoringCompletionBridge studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck studentAppAiTutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck studentAppAiTutorQuestionBankDraftAnswerFeedbackControlledDraft studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifact studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApproval studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommit studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveRowVerification teachingArchiveMaterialDraftStudentProductRead teachingArchiveMaterialPublicationPrecheck teachingArchiveMaterialPublicationApproval teachingArchiveMaterialPublicationDelivery teachingArchiveMaterialPublicationPersistenceCommand teachingArchiveMaterialPublicationStorageCommit teachingArchiveMaterialPublicationRowVerification teachingArchiveMaterialPublicationStudentAppRead teachingArchiveMaterialPublicationProjectionHardening teachingArchiveMaterialPublishedSearchFoundation teachingArchiveMaterialPublishedDetailMetadataRead teachingArchiveMaterialPublishedContentPreviewPrecheck teachingArchiveMaterialPublishedContentPreviewReadFoundation teachingArchiveMaterialPublishedContentPreviewRenderEnvelope teachingArchiveMaterialPublishedStudyPacket teachingArchiveMaterialPublishedLearningActions".split(" ")) assertReportPassed(studentTutor, key);
    assertRuntimeAfter(studentTutor, "student_app_ai_tutor_model_execution_precheck_runtime", "student_app_ai_tutor_controlled_answer_artifact_runtime");
    assertReportPassed(studentTutor, "studentAppAiTutorControlledAnswerArtifact");
    assertRuntimeAfter(studentTutor, "student_app_ai_tutor_controlled_answer_artifact_runtime", "student_app_ai_tutor_answer_review_gate_runtime");
    assertReportPassed(studentTutor, "studentAppAiTutorAnswerReviewGate");
    assertRuntimeAfter(studentTutor, "student_app_ai_tutor_answer_review_gate_runtime", "student_app_ai_tutor_reviewed_result_persistence_bridge_runtime");
    assertReportPassed(studentTutor, "studentAppAiTutorReviewedResultPersistenceBridge");
    assertRuntimeAfter(studentTutor, "student_app_ai_tutor_reviewed_result_persistence_bridge_runtime", "student_app_ai_tutor_result_student_visibility_review_runtime");
    assertReportPassed(studentTutor, "studentAppAiTutorResultStudentVisibilityReview");
    assertRuntimeAfter(studentTutor, "student_app_ai_tutor_result_student_visibility_review_runtime", "student_app_ai_tutor_result_student_delivery_envelope_runtime");
    assertReportPassed(studentTutor, "studentAppAiTutorResultStudentDeliveryEnvelope");
    assertRuntimeAfter(studentTutor, "student_app_ai_tutor_result_student_delivery_envelope_runtime", "student_app_ai_tutor_result_student_archive_persistence_command_runtime");
    assertReportPassed(studentTutor, "studentAppAiTutorResultStudentArchivePersistenceCommand");
    assertRuntimeAfter(studentTutor, "student_app_ai_tutor_result_student_archive_persistence_command_runtime", "student_app_ai_tutor_result_student_archive_storage_commit_runtime");
    assertReportPassed(studentTutor, "studentAppAiTutorResultStudentArchiveStorageCommit");
    const workflowPlugin = workflowById(report, "workflow_plugin_self_evolution");
    assert.deepEqual(runtimeNames(workflowPlugin), ["workflow_plugin_runtime_slo"]);
    for (const key of [
      "workflowPluginDraftIntent",
      "workflowPluginSandboxResult",
      "workflowPluginHumanApproval",
      "workflowPluginRegistryAdmissionRuntime",
      "workflowPluginExecutionIsolation",
      "workflowPluginPublicationDisabled",
      "workflowPluginManagementDisabledView",
      "workflowPluginManagementAuditDetail",
      "workflowPluginManagementReadonlyList",
    ]) {
      assertReportPassed(workflowPlugin, key);
    }
    const harness = workflowById(report, "agent_harness_local_control");
    assert.deepEqual(runtimeNames(harness), [
      "agent_readonly_runtime_dispatcher",
      "agent_readonly_api_runtime",
    ]);
    assertReportPassed(harness, "agentReadonlyApiRuntime");
    assertReportPassed(harness, "teachingArchiveMaterialDraftHumanReview");
    assertReportPassed(harness, "teachingArchiveMaterialDraftStoragePrecommit");
    assertReportPassed(harness, "teachingArchiveMaterialDraftStorageCommit");
    assertReportPassed(harness, "teachingArchiveMaterialDraftStorageRowVerification");
    assert.match(formatRootWorkflowCoverageAudit(report), /Root workflow coverage: READY/u);
    assert.deepEqual(report.summary.mixedWorkloadNames, [
      "ai_worker_admission",
      "conversation_write",
      "identity_http",
      "knowledge_retrieval",
      "teaching_archive",
    ]);
  });
  it("fails when the immutable root requirement text is missing", () => {
    const inputs = currentInputs();
    inputs.rootRequirementsText = "";
    const report = auditRootWorkflowCoverage(inputs);
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "root_requirements.present").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "root_requirements.anchors_covered").passed, false);
  });
  it("fails when a required source report is missing", () => {
    const inputs = currentInputs();
    delete inputs.reports[sourceReports.studentApp];
    const report = auditRootWorkflowCoverage(inputs);
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "sources.required_reports_parseable").passed, false);
    assert.equal(report.workflows.find((workflow) => workflow.id === "student_app_personalized_learning").coverageStatus, "NEEDS_EVIDENCE");
  });
  it("fails when workflow/plugin runtime SLO evidence is missing", () => {
    const inputs = currentInputs();
    delete inputs.reports[sourceReports.workflowPluginRuntimeSlo];
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "workflow_plugin_self_evolution");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.coverageStatus, "NEEDS_EVIDENCE");
    assert.equal(workflow.runtimeEvidenceResults[0].passed, false);
  });
  it("fails when a workflow/plugin control-plane report is missing", () => {
    for (const reportKey of [
      "workflowPluginDraftIntent",
      "workflowPluginSandboxResult",
      "workflowPluginHumanApproval",
      "workflowPluginRegistryAdmissionRuntime",
      "workflowPluginExecutionIsolation",
      "workflowPluginPublicationDisabled",
      "workflowPluginManagementDisabledView",
      "workflowPluginManagementAuditDetail",
      "workflowPluginManagementReadonlyList",
    ]) {
      const inputs = currentInputs();
      delete inputs.reports[sourceReports[reportKey]];
      const report = auditRootWorkflowCoverage(inputs);
      const workflow = report.workflows.find((candidate) => candidate.id === "workflow_plugin_self_evolution");
      assert.equal(report.readiness, "NEEDS_REMEDIATION");
      assert.equal(workflow.coverageStatus, "NEEDS_EVIDENCE");
      assert.equal(workflow.reportResults.find((result) => result.key === reportKey).passed, false);
    }
  });
  it("fails when workflow/plugin runtime SLO exceeds the target", () => {
    const inputs = currentInputs();
    const runtimeSlo = JSON.parse(inputs.reports[sourceReports.workflowPluginRuntimeSlo]);
    runtimeSlo.runtimeSlo.p99Ms = 350;
    inputs.reports[sourceReports.workflowPluginRuntimeSlo] = JSON.stringify(runtimeSlo);
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "workflow_plugin_self_evolution");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.runtimeEvidenceResults[0].passed, false);
  });
  it("fails when TeachingAgent read-only runtime SLO evidence is missing", () => {
    const inputs = currentInputs();
    delete inputs.reports[sourceReports.teachingAgentReadonlyRuntimeSlo];
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "teaching_archive_quiz_and_ai_grading");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.coverageStatus, "NEEDS_EVIDENCE");
    assert.equal(workflow.runtimeEvidenceResults[0].passed, false);
  });
  it("fails when TeachingAgent read-only runtime SLO exceeds the target", () => {
    const inputs = currentInputs();
    const runtimeSlo = JSON.parse(inputs.reports[sourceReports.teachingAgentReadonlyRuntimeSlo]);
    runtimeSlo.runtimeSlo.p99Ms = 55;
    inputs.reports[sourceReports.teachingAgentReadonlyRuntimeSlo] = JSON.stringify(runtimeSlo);
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "teaching_archive_quiz_and_ai_grading");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.runtimeEvidenceResults[0].passed, false);
  });
  it("fails when TeachingAgent real read-only runtime adapter evidence is missing", () => {
    const inputs = currentInputs();
    delete inputs.reports[sourceReports.teachingAgentReadonlyRuntimeAdapter];
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "teaching_archive_quiz_and_ai_grading");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.coverageStatus, "NEEDS_EVIDENCE");
    assert.equal(workflow.reportResults.find((result) => result.key === "teachingAgentReadonlyRuntimeAdapter").passed, false);
    assert.equal(workflow.runtimeEvidenceResults[1].passed, false);
  });
  it("fails when TeachingAgent real read-only runtime adapter exceeds the target", () => {
    const inputs = currentInputs();
    const adapter = JSON.parse(inputs.reports[sourceReports.teachingAgentReadonlyRuntimeAdapter]);
    adapter.runtimeSlo.p99Ms = 55;
    inputs.reports[sourceReports.teachingAgentReadonlyRuntimeAdapter] = JSON.stringify(adapter);
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "teaching_archive_quiz_and_ai_grading");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.runtimeEvidenceResults[1].passed, false);
  });
  it("fails when ResearchAgent read-only runtime SLO evidence is missing", () => {
    const inputs = currentInputs();
    delete inputs.reports[sourceReports.researchAgentReadonlyRuntimeSlo];
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "research_conversation_and_fusion");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.coverageStatus, "NEEDS_EVIDENCE");
    assert.equal(workflow.runtimeEvidenceResults[0].passed, false);
  });
  it("fails when ResearchAgent read-only contract evidence is missing", () => {
    const inputs = currentInputs();
    delete inputs.reports[sourceReports.researchAgentReadonlyContract];
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "research_conversation_and_fusion");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.coverageStatus, "NEEDS_EVIDENCE");
    assert.equal(workflow.reportResults.find((result) => result.key === "researchAgentReadonlyContract").passed, false);
  });
  it("fails when ResearchAgent read-only runtime SLO exceeds the target", () => {
    const inputs = currentInputs();
    const runtimeSlo = JSON.parse(inputs.reports[sourceReports.researchAgentReadonlyRuntimeSlo]);
    runtimeSlo.runtimeSlo.p99Ms = 55;
    inputs.reports[sourceReports.researchAgentReadonlyRuntimeSlo] = JSON.stringify(runtimeSlo);
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "research_conversation_and_fusion");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.runtimeEvidenceResults[0].passed, false);
  });
  it("fails when ResearchAgent real read-only runtime adapter evidence is missing", () => {
    const inputs = currentInputs();
    delete inputs.reports[sourceReports.researchAgentReadonlyRuntimeAdapter];
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "research_conversation_and_fusion");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.coverageStatus, "NEEDS_EVIDENCE");
    assert.equal(workflow.reportResults.find((result) => result.key === "researchAgentReadonlyRuntimeAdapter").passed, false);
    assert.equal(workflow.runtimeEvidenceResults[1].passed, false);
  });
  it("fails when ResearchAgent real read-only runtime adapter exceeds the target", () => {
    const inputs = currentInputs();
    const adapter = JSON.parse(inputs.reports[sourceReports.researchAgentReadonlyRuntimeAdapter]);
    adapter.runtimeSlo.p99Ms = 55;
    inputs.reports[sourceReports.researchAgentReadonlyRuntimeAdapter] = JSON.stringify(adapter);
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "research_conversation_and_fusion");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.runtimeEvidenceResults[1].passed, false);
  });
  it("fails when Research deep_research intent runtime evidence is missing", () => {
    const inputs = currentInputs();
    delete inputs.reports[sourceReports.researchDeepResearchIntent];
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "research_conversation_and_fusion");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.coverageStatus, "NEEDS_EVIDENCE");
    assert.equal(workflow.reportResults.find((result) => result.key === "researchDeepResearchIntent").passed, false);
    assert.equal(workflow.runtimeEvidenceResults[2].passed, false);
  });
  it("fails when Research deep_research intent runtime exceeds the admission target", () => {
    const inputs = currentInputs();
    const deepResearchIntent = JSON.parse(inputs.reports[sourceReports.researchDeepResearchIntent]);
    deepResearchIntent.runtimeSlo.p99Ms = 55;
    inputs.reports[sourceReports.researchDeepResearchIntent] = JSON.stringify(deepResearchIntent);
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "research_conversation_and_fusion");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.runtimeEvidenceResults[2].passed, false);
  });
  it("fails when Research deep_research worker lifecycle evidence is missing", () => {
    const inputs = currentInputs();
    delete inputs.reports[sourceReports.researchDeepResearchWorkerLifecycle];
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "research_conversation_and_fusion");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.coverageStatus, "NEEDS_EVIDENCE");
    assert.equal(workflow.reportResults.find((result) => result.key === "researchDeepResearchWorkerLifecycle").passed, false);
    assert.equal(workflow.runtimeEvidenceResults[3].passed, false);
  });
  it("fails when Research deep_research worker lifecycle exceeds the control-plane target", () => {
    const inputs = currentInputs();
    const lifecycle = JSON.parse(inputs.reports[sourceReports.researchDeepResearchWorkerLifecycle]);
    lifecycle.runtimeSlo.p99Ms = 55;
    inputs.reports[sourceReports.researchDeepResearchWorkerLifecycle] = JSON.stringify(lifecycle);
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "research_conversation_and_fusion");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.runtimeEvidenceResults[3].passed, false);
  });
  it("fails when Research deep_research retrieval, synthesis, review, finalization, preview, or delivery evidence is missing or slow", () => {
    const missing = currentInputs();
    delete missing.reports[sourceReports.researchDeepResearchRetrievalExecution];
    let report = auditRootWorkflowCoverage(missing);
    let workflow = report.workflows.find((candidate) => candidate.id === "research_conversation_and_fusion");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.reportResults.find((result) => result.key === "researchDeepResearchRetrievalExecution").passed, false);
    assert.equal(workflow.runtimeEvidenceResults[5].passed, false);
    const slow = currentInputs();
    const execution = JSON.parse(slow.reports[sourceReports.researchDeepResearchRetrievalExecution]);
    execution.runtimeSlo.p99Ms = 350;
    slow.reports[sourceReports.researchDeepResearchRetrievalExecution] = JSON.stringify(execution);
    report = auditRootWorkflowCoverage(slow);
    workflow = report.workflows.find((candidate) => candidate.id === "research_conversation_and_fusion");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.runtimeEvidenceResults[5].passed, false);
    const missingSynthesis = currentInputs();
    delete missingSynthesis.reports[sourceReports.researchDeepResearchReasoningSynthesis];
    report = auditRootWorkflowCoverage(missingSynthesis);
    workflow = report.workflows.find((candidate) => candidate.id === "research_conversation_and_fusion");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.reportResults.find((result) => result.key === "researchDeepResearchReasoningSynthesis").passed, false);
    assert.equal(workflow.runtimeEvidenceResults[6].passed, false);
    const missingReview = currentInputs();
    delete missingReview.reports[sourceReports.researchDeepResearchFinalAnswerReview];
    report = auditRootWorkflowCoverage(missingReview);
    workflow = report.workflows.find((candidate) => candidate.id === "research_conversation_and_fusion");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.reportResults.find((result) => result.key === "researchDeepResearchFinalAnswerReview").passed, false);
    assert.equal(workflow.runtimeEvidenceResults[7].passed, false);
    const missingFinalization = currentInputs();
    delete missingFinalization.reports[sourceReports.researchDeepResearchFinalization];
    report = auditRootWorkflowCoverage(missingFinalization);
    workflow = report.workflows.find((candidate) => candidate.id === "research_conversation_and_fusion");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.reportResults.find((result) => result.key === "researchDeepResearchFinalization").passed, false);
    assert.equal(workflow.runtimeEvidenceResults[8].passed, false);
    const missingPreview = currentInputs();
    delete missingPreview.reports[sourceReports.researchDeepResearchRenderPreview];
    report = auditRootWorkflowCoverage(missingPreview);
    workflow = report.workflows.find((candidate) => candidate.id === "research_conversation_and_fusion");
    assert.equal(workflow.reportResults.find((result) => result.key === "researchDeepResearchRenderPreview").passed, false);
    const missingPrecheck = currentInputs();
    delete missingPrecheck.reports[sourceReports.researchDeepResearchPublicationPrecheck];
    report = auditRootWorkflowCoverage(missingPrecheck);
    workflow = report.workflows.find((candidate) => candidate.id === "research_conversation_and_fusion");
    assert.equal(workflow.reportResults.find((result) => result.key === "researchDeepResearchPublicationPrecheck").passed, false);
    assert.equal(workflow.runtimeEvidenceResults[10].passed, false);
    for (const [reportKey, runtimeIndex] of [
      ["researchDeepResearchTeacherDelivery", 11],
      ["researchDeepResearchStudentVisibilityReview", 12],
      ["researchDeepResearchStudentDelivery", 13],
      ["researchDeepResearchStudentArchivePersistence", 14],
      ["researchDeepResearchStudentArchiveProjectionReview", 15],
      ["researchDeepResearchStudentArchiveProjection", 16],
      ["researchDeepResearchStudentArchiveStoragePrecommit", 17],
      ["researchDeepResearchStudentArchiveStorageCommit", 18],
      ["researchDeepResearchStudentArchiveRowVerification", 19],
    ]) {
      const missing = currentInputs();
      delete missing.reports[sourceReports[reportKey]];
      report = auditRootWorkflowCoverage(missing);
      workflow = report.workflows.find((candidate) => candidate.id === "research_conversation_and_fusion");
      assert.equal(workflow.reportResults.find((result) => result.key === reportKey).passed, false);
      assert.equal(workflow.runtimeEvidenceResults[runtimeIndex].passed, false);
    }
  });
  it("fails when StudentTutorAgent read-only runtime SLO evidence is missing", () => {
    const inputs = currentInputs();
    delete inputs.reports[sourceReports.studentTutorAgentReadonlyRuntimeSlo];
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.coverageStatus, "NEEDS_EVIDENCE");
    assert.equal(workflow.runtimeEvidenceResults[0].passed, false);
  });
  it("fails when StudentTutorAgent read-only contract evidence is missing", () => {
    const inputs = currentInputs();
    delete inputs.reports[sourceReports.studentTutorAgentReadonlyContract];
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.coverageStatus, "NEEDS_EVIDENCE");
    assert.equal(workflow.reportResults.find((result) => result.key === "studentTutorAgentReadonlyContract").passed, false);
  });
  it("fails when StudentTutorAgent read-only runtime SLO exceeds the target", () => {
    const inputs = currentInputs();
    const runtimeSlo = JSON.parse(inputs.reports[sourceReports.studentTutorAgentReadonlyRuntimeSlo]);
    runtimeSlo.runtimeSlo.p99Ms = 55;
    inputs.reports[sourceReports.studentTutorAgentReadonlyRuntimeSlo] = JSON.stringify(runtimeSlo);
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.runtimeEvidenceResults[0].passed, false);
  });
  it("fails when StudentTutorAgent real read-only runtime adapter evidence is missing", () => {
    const inputs = currentInputs();
    delete inputs.reports[sourceReports.studentTutorAgentReadonlyRuntimeAdapter];
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.coverageStatus, "NEEDS_EVIDENCE");
    assert.equal(workflow.reportResults.find((result) => result.key === "studentTutorAgentReadonlyRuntimeAdapter").passed, false);
    assert.equal(workflow.runtimeEvidenceResults[1].passed, false);
  });
  it("fails when StudentTutorAgent real read-only runtime adapter exceeds the target", () => {
    const inputs = currentInputs();
    const adapter = JSON.parse(inputs.reports[sourceReports.studentTutorAgentReadonlyRuntimeAdapter]);
    adapter.runtimeSlo.p99Ms = 55;
    inputs.reports[sourceReports.studentTutorAgentReadonlyRuntimeAdapter] = JSON.stringify(adapter);
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.runtimeEvidenceResults[1].passed, false);
  });
  it("fails when Student App AI Tutor request, generation claim, input envelope, teacher review, or draft visibility evidence is missing or slow", () => {
    const inputs = currentInputs();
    delete inputs.reports[sourceReports.studentAppAiTutorRequest];
    let report = auditRootWorkflowCoverage(inputs);
    let workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.coverageStatus, "NEEDS_EVIDENCE");
    assert.equal(workflow.reportResults.find((result) => result.key === "studentAppAiTutorRequest").passed, false);
    assert.equal(workflow.runtimeEvidenceResults[2].passed, false);
    const slow = currentInputs();
    const runtime = JSON.parse(slow.reports[sourceReports.studentAppAiTutorRequest]);
    runtime.runtimeSlo.p99Ms = 55;
    slow.reports[sourceReports.studentAppAiTutorRequest] = JSON.stringify(runtime);
    report = auditRootWorkflowCoverage(slow);
    workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.runtimeEvidenceResults[2].passed, false);
    const missingClaim = currentInputs();
    delete missingClaim.reports[sourceReports.studentAppAiTutorQuestionBankDraftGenerationWorkerClaim];
    report = auditRootWorkflowCoverage(missingClaim);
    workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.reportResults.find((result) => result.key === "studentAppAiTutorQuestionBankDraftGenerationWorkerClaim").passed, false);
    assertRuntimeFailed(workflow, "student_app_ai_tutor_question_bank_draft_generation_worker_claim_runtime");
    const slowClaim = currentInputs();
    const claimRuntime = JSON.parse(slowClaim.reports[sourceReports.studentAppAiTutorQuestionBankDraftGenerationWorkerClaim]);
    claimRuntime.runtimeSlo.p99Ms = 55;
    slowClaim.reports[sourceReports.studentAppAiTutorQuestionBankDraftGenerationWorkerClaim] = JSON.stringify(claimRuntime);
    report = auditRootWorkflowCoverage(slowClaim);
    workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assertRuntimeFailed(workflow, "student_app_ai_tutor_question_bank_draft_generation_worker_claim_runtime");
    const missingEnvelope = currentInputs();
    delete missingEnvelope.reports[sourceReports.studentAppAiTutorQuestionBankDraftGenerationInputEnvelope];
    report = auditRootWorkflowCoverage(missingEnvelope);
    workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.reportResults.find((result) => result.key === "studentAppAiTutorQuestionBankDraftGenerationInputEnvelope").passed, false);
    assertRuntimeFailed(workflow, "student_app_ai_tutor_question_bank_draft_generation_input_envelope_runtime");
    const slowEnvelope = currentInputs();
    const envelopeRuntime = JSON.parse(slowEnvelope.reports[sourceReports.studentAppAiTutorQuestionBankDraftGenerationInputEnvelope]);
    envelopeRuntime.runtimeSlo.p99Ms = 55;
    slowEnvelope.reports[sourceReports.studentAppAiTutorQuestionBankDraftGenerationInputEnvelope] = JSON.stringify(envelopeRuntime);
    report = auditRootWorkflowCoverage(slowEnvelope);
    workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assertRuntimeFailed(workflow, "student_app_ai_tutor_question_bank_draft_generation_input_envelope_runtime");
    const missingModelPrecheck = currentInputs();
    delete missingModelPrecheck.reports[sourceReports.studentAppAiTutorQuestionBankDraftGenerationModelExecutionPrecheck];
    report = auditRootWorkflowCoverage(missingModelPrecheck);
    workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.reportResults.find((result) => result.key === "studentAppAiTutorQuestionBankDraftGenerationModelExecutionPrecheck").passed, false);
    assertRuntimeFailed(workflow, "student_app_ai_tutor_question_bank_draft_generation_model_execution_precheck_runtime");
    const slowModelPrecheck = currentInputs();
    const modelPrecheckRuntime = JSON.parse(slowModelPrecheck.reports[sourceReports.studentAppAiTutorQuestionBankDraftGenerationModelExecutionPrecheck]);
    modelPrecheckRuntime.runtimeSlo.p99Ms = 55;
    slowModelPrecheck.reports[sourceReports.studentAppAiTutorQuestionBankDraftGenerationModelExecutionPrecheck] = JSON.stringify(modelPrecheckRuntime);
    report = auditRootWorkflowCoverage(slowModelPrecheck);
    workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assertRuntimeFailed(workflow, "student_app_ai_tutor_question_bank_draft_generation_model_execution_precheck_runtime");
    const missingControlledDraft = currentInputs();
    delete missingControlledDraft.reports[sourceReports.studentAppAiTutorQuestionBankDraftGenerationControlledDraft];
    report = auditRootWorkflowCoverage(missingControlledDraft);
    workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.reportResults.find((result) => result.key === "studentAppAiTutorQuestionBankDraftGenerationControlledDraft").passed, false);
    assertRuntimeFailed(workflow, "student_app_ai_tutor_question_bank_draft_generation_controlled_draft_runtime");
    const slowControlledDraft = currentInputs();
    const controlledDraftRuntime = JSON.parse(slowControlledDraft.reports[sourceReports.studentAppAiTutorQuestionBankDraftGenerationControlledDraft]);
    controlledDraftRuntime.runtimeSlo.p99Ms = 55;
    slowControlledDraft.reports[sourceReports.studentAppAiTutorQuestionBankDraftGenerationControlledDraft] = JSON.stringify(controlledDraftRuntime);
    report = auditRootWorkflowCoverage(slowControlledDraft);
    workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assertRuntimeFailed(workflow, "student_app_ai_tutor_question_bank_draft_generation_controlled_draft_runtime");
    const missingTeacherReview = currentInputs();
    delete missingTeacherReview.reports[sourceReports.studentAppAiTutorQuestionBankDraftGenerationTeacherReview];
    report = auditRootWorkflowCoverage(missingTeacherReview);
    workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.reportResults.find((result) => result.key === "studentAppAiTutorQuestionBankDraftGenerationTeacherReview").passed, false);
    assertRuntimeFailed(workflow, "student_app_ai_tutor_question_bank_draft_generation_teacher_review_runtime");
    const slowTeacherReview = currentInputs();
    const teacherReviewRuntime = JSON.parse(slowTeacherReview.reports[sourceReports.studentAppAiTutorQuestionBankDraftGenerationTeacherReview]);
    teacherReviewRuntime.runtimeSlo.p99Ms = 55;
    slowTeacherReview.reports[sourceReports.studentAppAiTutorQuestionBankDraftGenerationTeacherReview] = JSON.stringify(teacherReviewRuntime);
    report = auditRootWorkflowCoverage(slowTeacherReview);
    workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assertRuntimeFailed(workflow, "student_app_ai_tutor_question_bank_draft_generation_teacher_review_runtime");
    const missingContentStorageCommit = currentInputs();
    delete missingContentStorageCommit.reports[sourceReports.studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit];
    report = auditRootWorkflowCoverage(missingContentStorageCommit);
    workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.reportResults.find((result) => result.key === "studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit").passed, false);
    assertRuntimeFailed(workflow, "student_app_ai_tutor_question_bank_draft_generation_content_storage_commit_runtime");
    const slowContentStorageCommit = currentInputs();
    const contentStorageCommitRuntime = JSON.parse(slowContentStorageCommit.reports[sourceReports.studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit]);
    contentStorageCommitRuntime.runtimeSlo.p99Ms = 55;
    slowContentStorageCommit.reports[sourceReports.studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit] = JSON.stringify(contentStorageCommitRuntime);
    report = auditRootWorkflowCoverage(slowContentStorageCommit);
    workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assertRuntimeFailed(workflow, "student_app_ai_tutor_question_bank_draft_generation_content_storage_commit_runtime");
    const missingContentRowVerification = currentInputs();
    delete missingContentRowVerification.reports[sourceReports.studentAppAiTutorQuestionBankDraftGenerationContentRowVerification];
    report = auditRootWorkflowCoverage(missingContentRowVerification);
    workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.reportResults.find((result) => result.key === "studentAppAiTutorQuestionBankDraftGenerationContentRowVerification").passed, false);
    assertRuntimeFailed(workflow, "student_app_ai_tutor_question_bank_draft_generation_content_row_verification_runtime");
    const slowContentRowVerification = currentInputs();
    const contentRowVerificationRuntime = JSON.parse(slowContentRowVerification.reports[sourceReports.studentAppAiTutorQuestionBankDraftGenerationContentRowVerification]);
    contentRowVerificationRuntime.runtimeSlo.p99Ms = 55;
    slowContentRowVerification.reports[sourceReports.studentAppAiTutorQuestionBankDraftGenerationContentRowVerification] = JSON.stringify(contentRowVerificationRuntime);
    report = auditRootWorkflowCoverage(slowContentRowVerification);
    workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assertRuntimeFailed(workflow, "student_app_ai_tutor_question_bank_draft_generation_content_row_verification_runtime");
    const missingDrafts = currentInputs();
    delete missingDrafts.reports[sourceReports.studentAppAiTutorQuestionBankDraftVisibility];
    report = auditRootWorkflowCoverage(missingDrafts);
    workflow = report.workflows.find((candidate) => candidate.id === "student_app_personalized_learning");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.reportResults.find((result) => result.key === "studentAppAiTutorQuestionBankDraftVisibility").passed, false);
    assertRuntimeFailed(workflow, "student_app_ai_tutor_question_bank_draft_visibility_runtime");
  });
  it("fails when Agent read-only runtime dispatcher evidence is missing", () => {
    const inputs = currentInputs();
    delete inputs.reports[sourceReports.agentReadonlyRuntimeDispatcher];
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "agent_harness_local_control");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.coverageStatus, "NEEDS_EVIDENCE");
    assert.equal(workflow.runtimeEvidenceResults[0].passed, false);
  });
  it("fails when Agent read-only runtime dispatcher exceeds the target", () => {
    const inputs = currentInputs();
    const dispatcher = JSON.parse(inputs.reports[sourceReports.agentReadonlyRuntimeDispatcher]);
    dispatcher.runtimeSlo.p99Ms = 55;
    inputs.reports[sourceReports.agentReadonlyRuntimeDispatcher] = JSON.stringify(dispatcher);
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "agent_harness_local_control");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.runtimeEvidenceResults[0].passed, false);
  });
  it("fails when Agent read-only API runtime evidence is missing", () => {
    const inputs = currentInputs();
    delete inputs.reports[sourceReports.agentReadonlyApiRuntime];
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "agent_harness_local_control");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.coverageStatus, "NEEDS_EVIDENCE");
    assert.equal(workflow.reportResults.find((result) => result.key === "agentReadonlyApiRuntime").passed, false);
    assert.equal(workflow.runtimeEvidenceResults[1].passed, false);
  });
  it("fails when Agent read-only API runtime exceeds the target", () => {
    const inputs = currentInputs();
    const apiRuntime = JSON.parse(inputs.reports[sourceReports.agentReadonlyApiRuntime]);
    apiRuntime.runtimeSlo.p99Ms = 55;
    inputs.reports[sourceReports.agentReadonlyApiRuntime] = JSON.stringify(apiRuntime);
    const report = auditRootWorkflowCoverage(inputs);
    const workflow = report.workflows.find((candidate) => candidate.id === "agent_harness_local_control");
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(workflow.runtimeEvidenceResults[1].passed, false);
  });
  it("fails when sustained scale-up drops a root mixed workload", () => {
    const inputs = currentInputs();
    const scaleup = JSON.parse(inputs.reports[sourceReports.sustainedScaleUp]);
    for (const step of scaleup.steps) {
      step.workloads = step.workloads.filter((workload) => workload.name !== "teaching_archive");
    }
    inputs.reports[sourceReports.sustainedScaleUp] = JSON.stringify(scaleup);
    const report = auditRootWorkflowCoverage(inputs);
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "performance.mixed_workload_names_present").passed, false);
    assert.equal(report.workflows.find((workflow) => workflow.id === "teaching_archive_quiz_and_ai_grading").coverageStatus, "NEEDS_EVIDENCE");
  });
  it("fails when forbidden AI runtime dependencies re-enter baseline", () => {
    const inputs = currentInputs();
    const dependencies = JSON.parse(inputs.reports[sourceReports.aiWorkerDependencies]);
    dependencies.findings = dependencies.findings.map((finding) =>
      finding.id === "baseline.no_forbidden_ai_packages" ? { ...finding, actual: "torch" } : finding,
    );
    inputs.reports[sourceReports.aiWorkerDependencies] = JSON.stringify(dependencies);
    const report = auditRootWorkflowCoverage(inputs);
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "baseline.no_forbidden_ai_runtime_dependencies").passed, false);
  });
  it("fails when strict quality evidence is not passing", () => {
    const inputs = currentInputs();
    const quality = JSON.parse(inputs.reports[sourceReports.quality]);
    quality.allPassed = false;
    inputs.reports[sourceReports.quality] = JSON.stringify(quality);
    const report = auditRootWorkflowCoverage(inputs);
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_passed").passed, false);
  });
});
function workflowById(report, id) {
  return report.workflows.find((workflow) => workflow.id === id);
}
function runtimeNames(workflow) { return workflow.runtimeEvidenceResults.map((result) => result.name).filter((name) => !["student_app_ai_tutor_controlled_answer_artifact_runtime", "student_app_ai_tutor_answer_review_gate_runtime", "student_app_ai_tutor_reviewed_result_persistence_bridge_runtime", "student_app_ai_tutor_result_student_visibility_review_runtime", "student_app_ai_tutor_result_student_delivery_envelope_runtime", "student_app_ai_tutor_result_student_archive_persistence_command_runtime", "student_app_ai_tutor_result_student_archive_storage_commit_runtime"].includes(name)); }
function assertRuntimeAfter(workflow, previous, next) { const names = workflow.runtimeEvidenceResults.map((result) => result.name); assert.equal(names[names.indexOf(previous) + 1], next); }
function assertReportPassed(workflow, key) {
  assert.equal(workflow.reportResults.find((result) => result.key === key).passed, true);
}
function assertRuntimeFailed(workflow, name) {
  const result = workflow.runtimeEvidenceResults.find((candidate) => candidate.name === name);
  assert.ok(result, `missing runtime evidence ${name}`);
  assert.equal(result.passed, false);
}
function researchReportKeys() {
  return "researchAgentReadonlyRuntimeAdapter researchDeepResearchIntent researchDeepResearchWorkerLifecycle researchDeepResearchRetrievalPlan researchDeepResearchRetrievalExecution researchDeepResearchReasoningSynthesis researchDeepResearchFinalAnswerReview researchDeepResearchFinalization researchDeepResearchRenderPreview researchDeepResearchPublicationPrecheck researchDeepResearchTeacherDelivery researchDeepResearchStudentVisibilityReview researchDeepResearchStudentDelivery researchDeepResearchStudentArchivePersistence researchDeepResearchStudentArchiveProjectionReview researchDeepResearchStudentArchiveProjection researchDeepResearchStudentArchiveStoragePrecommit researchDeepResearchStudentArchiveStorageCommit researchDeepResearchStudentArchiveRowVerification".split(" ");
}
function currentInputs() {
  return {
    rootRequirementsPath: "../智能教研助手/项目根本需求（禁止改动）",
    rootRequirementsText: "教师端 微信扫码登录 账号密码登录 学生端 外部操控\n科研模式 对话 多个多模态模型融合回答 节点\n教学模式 随堂测验 AI批改 档案资料 学生档案\nAI辅导助手 教学资料 扫码答题\n公开知识库 私密知识库 物理上的隔断 RAG检索\nOCR识别 RAG 模型训练 微调\n操纵电脑上的所有应用 社交平台 发布命令 统筹智能体\n工作流 插件 自动测试 人类评估性能与效果 自我进化",
    reports: {
      [sourceReports.identity]: JSON.stringify(readyReport()),
      [sourceReports.studentApp]: JSON.stringify(readyReport()),
      [sourceReports.teachingArchive]: JSON.stringify(passedReport()),
      [sourceReports.knowledgePolicy]: JSON.stringify(readyReport()),
      [sourceReports.knowledgeRetrieval]: JSON.stringify(readyReport()),
      [sourceReports.aiWorkerJob]: JSON.stringify(readyReport()),
      [sourceReports.aiWorkerAdmission]: JSON.stringify(readyReport()),
      [sourceReports.aiWorkerDependencies]: JSON.stringify(aiWorkerDependenciesReport()),
      [sourceReports.agentHarness]: JSON.stringify(readyReport()),
      [sourceReports.agentSkillContracts]: JSON.stringify(readyReport()),
      [sourceReports.agentReadonlyRuntimeDispatcher]: JSON.stringify(agentReadonlyRuntimeDispatcherReport()),
      [sourceReports.agentReadonlyApiRuntime]: JSON.stringify(agentReadonlyApiRuntimeReport()),
      [sourceReports.agentControlledWriteIntentGateway]: JSON.stringify(readyReport()),
      [sourceReports.teachingQuizDraftIntent]: JSON.stringify(readyReport()),
      [sourceReports.teachingArchiveMaterialDraftIntent]: JSON.stringify(readyReport()),
      [sourceReports.teachingArchiveMaterialDraftHumanReview]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.teachingArchiveMaterialDraftStoragePrecommit]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.teachingArchiveMaterialDraftStorageCommit]: JSON.stringify(readyRuntimeReport(8)),
      [sourceReports.teachingArchiveMaterialDraftStorageRowVerification]: JSON.stringify(readyRuntimeReport(7)),
      [sourceReports.teachingArchiveMaterialDraftStudentProductRead]: JSON.stringify(readyRuntimeReport(8)),
      [sourceReports.teachingArchiveMaterialPublicationPrecheck]: JSON.stringify(readyRuntimeReport(7)),
      [sourceReports.teachingArchiveMaterialPublicationApproval]: JSON.stringify(readyRuntimeReport(7)),
      [sourceReports.teachingArchiveMaterialPublicationDelivery]: JSON.stringify(readyRuntimeReport(7)),
      [sourceReports.teachingArchiveMaterialPublicationPersistenceCommand]: JSON.stringify(readyRuntimeReport(7)),
      [sourceReports.teachingArchiveMaterialPublicationStorageCommit]: JSON.stringify(readyRuntimeReport(8)),
      [sourceReports.teachingArchiveMaterialPublicationRowVerification]: JSON.stringify(readyRuntimeReport(8)),
      [sourceReports.teachingArchiveMaterialPublicationStudentAppRead]: JSON.stringify(readyRuntimeReport(8)),
      [sourceReports.teachingArchiveMaterialPublicationProjectionHardening]: JSON.stringify(readyRuntimeReport(8)),
      [sourceReports.teachingArchiveMaterialPublishedSearchFoundation]: JSON.stringify(readyRuntimeReport(8)),
      [sourceReports.teachingArchiveMaterialPublishedDetailMetadataRead]: JSON.stringify(readyRuntimeReport(8)),
      [sourceReports.teachingArchiveMaterialPublishedContentPreviewPrecheck]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.teachingArchiveMaterialPublishedContentPreviewReadFoundation]: JSON.stringify(readyRuntimeReport(4)),
      [sourceReports.teachingArchiveMaterialPublishedContentPreviewRenderEnvelope]: JSON.stringify(readyRuntimeReport(3)),
      [sourceReports.teachingArchiveMaterialPublishedStudyPacket]: JSON.stringify(readyRuntimeReport(4)),
      [sourceReports.teachingArchiveMaterialPublishedLearningActions]: JSON.stringify(readyRuntimeReport(4)),
      [sourceReports.teachingAgentReadonlyRuntimeSlo]: JSON.stringify(teachingAgentReadonlyRuntimeSloReport()),
      [sourceReports.teachingAgentReadonlyRuntimeAdapter]: JSON.stringify(teachingAgentReadonlyRuntimeAdapterReport()),
      [sourceReports.studentTutorAgentReadonlyContract]: JSON.stringify(readyReport()),
      [sourceReports.studentTutorAgentReadonlyRuntimeSlo]: JSON.stringify(studentTutorAgentReadonlyRuntimeSloReport()),
      [sourceReports.studentTutorAgentReadonlyRuntimeAdapter]: JSON.stringify(studentTutorAgentReadonlyRuntimeAdapterReport()),
      [sourceReports.studentAppAiTutorRequest]: JSON.stringify(studentAppAiTutorRequestReport()),
      [sourceReports.studentAppAiTutorPublishedLearningActionSource]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorWorkerStudyPacketInput]: JSON.stringify(readyRuntimeReport(7)),
      [sourceReports.studentAppAiTutorModelExecutionPrecheck]: JSON.stringify(readyRuntimeReport(8)),
      [sourceReports.studentAppAiTutorControlledAnswerArtifact]: JSON.stringify(readyRuntimeReport(8)),
      [sourceReports.studentAppAiTutorAnswerReviewGate]: JSON.stringify(readyRuntimeReport(8)),
      [sourceReports.studentAppAiTutorReviewedResultPersistenceBridge]: JSON.stringify(readyRuntimeReport(8)),
      [sourceReports.studentAppAiTutorResultStudentVisibilityReview]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorResultStudentDeliveryEnvelope]: JSON.stringify(readyRuntimeReport(5)),
      [sourceReports.studentAppAiTutorResultStudentArchivePersistenceCommand]: JSON.stringify(readyRuntimeReport(5)),
      [sourceReports.studentAppAiTutorResultStudentArchiveStorageCommit]: JSON.stringify(readyRuntimeReport(5)),
      [sourceReports.studentAppAiTutorWorkerClaim]: JSON.stringify(studentAppAiTutorWorkerClaimReport()),
      [sourceReports.studentAppAiTutorResult]: JSON.stringify(readyRuntimeReport(7)),
      [sourceReports.studentAppAiTutorQuestionBankDraftGenerationPlan]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftGenerationWorkerClaimPrecheck]: JSON.stringify(readyRuntimeReport(7)),
      [sourceReports.studentAppAiTutorQuestionBankDraftGenerationWorkerClaim]: JSON.stringify(readyRuntimeReport(7)),
      [sourceReports.studentAppAiTutorQuestionBankDraftGenerationInputEnvelope]: JSON.stringify(readyRuntimeReport(7)),
      [sourceReports.studentAppAiTutorQuestionBankDraftGenerationModelExecutionPrecheck]: JSON.stringify(readyRuntimeReport(7)),
      [sourceReports.studentAppAiTutorQuestionBankDraftGenerationControlledDraft]: JSON.stringify(readyRuntimeReport(7)),
      [sourceReports.studentAppAiTutorQuestionBankDraftGenerationTeacherReview]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftGenerationContentRowVerification]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftVisibility]: JSON.stringify(readyRuntimeReport(8)),
      [sourceReports.studentAppAiTutorQuestionBankDraftContentPrecheck]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftContentRead]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftContentStudentReadVerification]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftAnswerSubmission]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftAnswerSubmissionVerification]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftAnswerScoringRequest]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftAnswerScoringRequestVerification]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftAnswerScoringInput]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftAnswerScoringModelExecutionPrecheck]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftAnswerControlledScoringArtifact]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftAnswerScoringResultPersistenceBridge]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftAnswerScoringResult]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftAnswerScoringCompletionBridge]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftAnswerFeedbackControlledDraft]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifact]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApproval]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand]: JSON.stringify(readyRuntimeReport(6)), [sourceReports.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource]: JSON.stringify(readyRuntimeReport(6)), [sourceReports.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource]: JSON.stringify(readyRuntimeReport(6)), [sourceReports.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommit]: JSON.stringify(readyRuntimeReport(6)), [sourceReports.studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveRowVerification]: JSON.stringify(readyRuntimeReport(6)),
      [sourceReports.researchAgentReadonlyContract]: JSON.stringify(readyReport()),
      [sourceReports.researchAgentReadonlyRuntimeSlo]: JSON.stringify(researchAgentReadonlyRuntimeSloReport()),
      [sourceReports.researchAgentReadonlyRuntimeAdapter]: JSON.stringify(researchAgentReadonlyRuntimeAdapterReport()),
      [sourceReports.researchDeepResearchIntent]: JSON.stringify(researchDeepResearchIntentReport()),
      [sourceReports.researchDeepResearchWorkerLifecycle]: JSON.stringify(researchDeepResearchWorkerLifecycleReport()),
      [sourceReports.researchDeepResearchRetrievalPlan]: JSON.stringify(researchDeepResearchRetrievalPlanReport()),
      [sourceReports.researchDeepResearchRetrievalExecution]: JSON.stringify(researchDeepResearchRetrievalExecutionReport()),
      [sourceReports.researchDeepResearchReasoningSynthesis]: JSON.stringify(researchDeepResearchReasoningSynthesisReport()),
      [sourceReports.researchDeepResearchFinalAnswerReview]: JSON.stringify(researchDeepResearchFinalAnswerReviewReport()),
      [sourceReports.researchDeepResearchFinalization]: JSON.stringify(researchDeepResearchFinalizationReport()),
      [sourceReports.researchDeepResearchRenderPreview]: JSON.stringify(researchDeepResearchRenderPreviewReport()),
      [sourceReports.researchDeepResearchPublicationPrecheck]: JSON.stringify(researchDeepResearchPublicationPrecheckReport()),
      [sourceReports.researchDeepResearchTeacherDelivery]: JSON.stringify(researchDeepResearchTeacherDeliveryReport()),
      [sourceReports.researchDeepResearchStudentVisibilityReview]: JSON.stringify(researchDeepResearchStudentVisibilityReviewReport()),
      [sourceReports.researchDeepResearchStudentDelivery]: JSON.stringify(researchDeepResearchStudentDeliveryReport()),
      [sourceReports.researchDeepResearchStudentArchivePersistence]: JSON.stringify(researchDeepResearchStudentArchivePersistenceReport()),
      [sourceReports.researchDeepResearchStudentArchiveProjectionReview]: JSON.stringify(researchDeepResearchStudentArchiveProjectionReviewReport()),
      [sourceReports.researchDeepResearchStudentArchiveProjection]: JSON.stringify(researchDeepResearchStudentArchiveProjectionReport()),
      [sourceReports.researchDeepResearchStudentArchiveStoragePrecommit]: JSON.stringify(researchDeepResearchStudentArchiveStoragePrecommitReport()),
      [sourceReports.researchDeepResearchStudentArchiveStorageCommit]: JSON.stringify(readyRuntimeReport(12)),
      [sourceReports.researchDeepResearchStudentArchiveRowVerification]: JSON.stringify(readyRuntimeReport(12)),
      [sourceReports.workflowPluginFlow]: JSON.stringify(readyReport()),
      [sourceReports.workflowPluginRegistry]: JSON.stringify({ decision: "ALLOW_SAVE" }),
      [sourceReports.workflowPluginRuntimeSlo]: JSON.stringify(workflowPluginRuntimeSloReport()),
      [sourceReports.workflowPluginDraftIntent]: JSON.stringify(readyReport()),
      [sourceReports.workflowPluginSandboxResult]: JSON.stringify(readyReport()),
      [sourceReports.workflowPluginHumanApproval]: JSON.stringify(readyReport()),
      [sourceReports.workflowPluginRegistryAdmissionRuntime]: JSON.stringify(readyReport()),
      [sourceReports.workflowPluginExecutionIsolation]: JSON.stringify(readyReport()),
      [sourceReports.workflowPluginPublicationDisabled]: JSON.stringify(readyReport()),
      [sourceReports.workflowPluginManagementDisabledView]: JSON.stringify(readyReport()),
      [sourceReports.workflowPluginManagementAuditDetail]: JSON.stringify(readyReport()),
      [sourceReports.workflowPluginManagementReadonlyList]: JSON.stringify(readyReport()),
      [sourceReports.conversationRuntime]: JSON.stringify(readyReport()),
      [sourceReports.sustainedScaleUp]: JSON.stringify(sustainedScaleupReport()),
      [sourceReports.quality]: JSON.stringify({ allPassed: true }),
    },
  };
}
function agentReadonlyRuntimeDispatcherReport() { return readyRuntimeReport(11); }
function agentReadonlyApiRuntimeReport() { return readyRuntimeReport(13); }
function researchAgentReadonlyRuntimeSloReport() { return readyRuntimeReport(2.55); }
function researchAgentReadonlyRuntimeAdapterReport() { return readyRuntimeReport(3); }
function researchDeepResearchIntentReport() { return readyRuntimeReport(8); }
function researchDeepResearchWorkerLifecycleReport() { return readyRuntimeReport(9); }
function researchDeepResearchRetrievalPlanReport() { return readyRuntimeReport(9); }
function researchDeepResearchRetrievalExecutionReport() { return readyRuntimeReport(18); }
function researchDeepResearchReasoningSynthesisReport() { return readyRuntimeReport(20); }
function researchDeepResearchFinalAnswerReviewReport() { return readyRuntimeReport(12); }
function researchDeepResearchFinalizationReport() { return readyRuntimeReport(12); }
function researchDeepResearchRenderPreviewReport() { return readyRuntimeReport(12); }
function researchDeepResearchPublicationPrecheckReport() { return readyRuntimeReport(12); }
function researchDeepResearchTeacherDeliveryReport() { return readyRuntimeReport(12); }
function researchDeepResearchStudentVisibilityReviewReport() { return readyRuntimeReport(12); }
function researchDeepResearchStudentDeliveryReport() { return readyRuntimeReport(12); }
function researchDeepResearchStudentArchivePersistenceReport() { return readyRuntimeReport(12); }
function researchDeepResearchStudentArchiveProjectionReviewReport() { return readyRuntimeReport(12); }
function researchDeepResearchStudentArchiveProjectionReport() { return readyRuntimeReport(12); }
function researchDeepResearchStudentArchiveStoragePrecommitReport() { return readyRuntimeReport(12); }
function studentTutorAgentReadonlyRuntimeSloReport() { return readyRuntimeReport(11); }
function studentTutorAgentReadonlyRuntimeAdapterReport() { return readyRuntimeReport(4); }
function studentAppAiTutorRequestReport() { return readyRuntimeReport(6); }
function studentAppAiTutorWorkerClaimReport() { return readyRuntimeReport(6); }
function teachingAgentReadonlyRuntimeSloReport() { return readyRuntimeReport(11); }
function teachingAgentReadonlyRuntimeAdapterReport() { return readyRuntimeReport(4); }
function workflowPluginRuntimeSloReport() { return readyRuntimeReport(40); }
function readyRuntimeReport(p99Ms) { return { readiness: "READY", runtimeSlo: { p99Ms, totalErrors: 0 } }; }
function readyReport() { return { readiness: "READY" }; }
function passedReport() { return { status: "PASSED" }; }
function aiWorkerDependenciesReport() { return { readiness: "READY", findings: [{ id: "baseline.no_forbidden_ai_packages", actual: "none" }] }; }
function sustainedScaleupReport() {
  const workloads = ["identity_http", "conversation_write", "teaching_archive", "knowledge_retrieval", "ai_worker_admission"].map((name) => ({ name }));
  return { status: "PASSED", steps: [{ name: "low", workloads }] };
}

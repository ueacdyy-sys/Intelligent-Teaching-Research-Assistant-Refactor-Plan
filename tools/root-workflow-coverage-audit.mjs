import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  allowInProgressQualityGateFromEnv,
  isQualityGateReportPassing,
  summarizeQualityGateReportState,
} from "./quality-gate-report-state.mjs";
const defaultOutPath = "reports/root-workflow-coverage.current.json";
const defaultRootRequirementsPath = "../智能教研助手/项目根本需求（禁止改动）";
export const sourceReports = {
  identity: "reports/identity-access-contract.current.json",
  studentApp: "reports/student-app-flow.current.json",
  teachingArchive: "reports/teaching-archive-benchmark.current.json",
  knowledgePolicy: "reports/knowledge-access-policy.current.json",
  knowledgeRetrieval: "reports/knowledge-retrieval-benchmark.current.json",
  aiWorkerJob: "reports/ai-worker-job.current.json",
  aiWorkerAdmission: "reports/ai-worker-job-admission.current.json",
  aiWorkerDependencies: "reports/ai-worker-runtime-dependency-profile.current.json",
  agentHarness: "reports/agent-harness-flow.current.json",
  agentSkillContracts: "reports/agent-skill-contracts.current.json",
  agentReadonlyRuntimeDispatcher: "reports/agent-readonly-runtime-dispatcher.current.json",
  agentReadonlyApiRuntime: "reports/agent-readonly-api-runtime.current.json",
  agentControlledWriteIntentGateway: "reports/agent-controlled-write-intent-gateway.current.json",
  teachingQuizDraftIntent: "reports/teaching-quiz-draft-intent.current.json",
  teachingArchiveMaterialDraftIntent: "reports/teaching-archive-material-draft-intent.current.json",
  teachingArchiveMaterialDraftHumanReview: "reports/teaching-archive-material-draft-human-review.current.json",
  teachingArchiveMaterialDraftStoragePrecommit: "reports/teaching-archive-material-draft-storage-precommit.current.json",
  teachingArchiveMaterialDraftStorageCommit: "reports/teaching-archive-material-draft-storage-commit.current.json",
  teachingArchiveMaterialDraftStorageRowVerification: "reports/teaching-archive-material-draft-storage-row-verification.current.json",
  teachingArchiveMaterialDraftStudentProductRead: "reports/teaching-archive-material-draft-student-product-read.current.json",
  teachingArchiveMaterialPublicationPrecheck: "reports/teaching-archive-material-publication-precheck.current.json",
  teachingArchiveMaterialPublicationApproval: "reports/teaching-archive-material-publication-approval.current.json",
  teachingArchiveMaterialPublicationDelivery: "reports/teaching-archive-material-publication-delivery.current.json",
  teachingArchiveMaterialPublicationPersistenceCommand: "reports/teaching-archive-material-publication-persistence-command.current.json",
  teachingArchiveMaterialPublicationStorageCommit: "reports/teaching-archive-material-publication-storage-commit.current.json",
  teachingArchiveMaterialPublicationRowVerification: "reports/teaching-archive-material-publication-row-verification.current.json",
  teachingArchiveMaterialPublicationStudentAppRead: "reports/teaching-archive-material-publication-student-app-read.current.json",
  teachingArchiveMaterialPublicationProjectionHardening: "reports/teaching-archive-material-publication-projection-hardening.current.json",
  teachingArchiveMaterialPublishedSearchFoundation: "reports/teaching-archive-material-published-search-foundation.current.json",
  teachingArchiveMaterialPublishedDetailMetadataRead: "reports/teaching-archive-material-published-detail-metadata-read.current.json",
  teachingArchiveMaterialPublishedContentPreviewPrecheck: "reports/teaching-archive-material-published-content-preview-precheck.current.json",
  teachingArchiveMaterialPublishedContentPreviewReadFoundation: "reports/teaching-archive-material-published-content-preview-read-foundation.current.json",
  teachingArchiveMaterialPublishedContentPreviewRenderEnvelope: "reports/teaching-archive-material-published-content-preview-render-envelope.current.json",
  teachingArchiveMaterialPublishedStudyPacket: "reports/teaching-archive-material-published-study-packet.current.json",
  teachingArchiveMaterialPublishedLearningActions: "reports/teaching-archive-material-published-learning-actions.current.json",
  teachingAgentReadonlyRuntimeSlo: "reports/teaching-agent-readonly-runtime-slo.current.json",
  teachingAgentReadonlyRuntimeAdapter: "reports/teaching-agent-readonly-runtime-adapter.current.json",
  studentTutorAgentReadonlyContract: "reports/student-tutor-agent-readonly-contract.current.json",
  studentTutorAgentReadonlyRuntimeSlo: "reports/student-tutor-agent-readonly-runtime-slo.current.json",
  studentTutorAgentReadonlyRuntimeAdapter: "reports/student-tutor-agent-readonly-runtime-adapter.current.json",
  studentAppAiTutorRequest: "reports/student-app-ai-tutor-request.current.json",
  studentAppAiTutorPublishedLearningActionSource: "reports/student-app-ai-tutor-published-learning-action-source.current.json",
  studentAppAiTutorWorkerStudyPacketInput: "reports/student-app-ai-tutor-worker-study-packet-input.current.json",
  studentAppAiTutorModelExecutionPrecheck: "reports/student-app-ai-tutor-model-execution-precheck.current.json",
  studentAppAiTutorControlledAnswerArtifact: "reports/student-app-ai-tutor-controlled-answer-artifact.current.json",
  studentAppAiTutorAnswerReviewGate: "reports/student-app-ai-tutor-answer-review-gate.current.json",
  studentAppAiTutorReviewedResultPersistenceBridge: "reports/student-app-ai-tutor-reviewed-result-persistence-bridge.current.json",
  studentAppAiTutorResultStudentVisibilityReview: "reports/student-app-ai-tutor-result-student-visibility-review.current.json",
  studentAppAiTutorResultStudentDeliveryEnvelope: "reports/student-app-ai-tutor-result-student-delivery-envelope.current.json",
  studentAppAiTutorResultStudentArchivePersistenceCommand: "reports/student-app-ai-tutor-result-student-archive-persistence-command.current.json",
  studentAppAiTutorWorkerClaim: "reports/student-app-ai-tutor-worker-claim.current.json",
  studentAppAiTutorResult: "reports/student-app-ai-tutor-result.current.json",
  studentAppAiTutorQuestionBankDraftGenerationPlan: "reports/student-app-ai-tutor-question-bank-draft-generation-plan.current.json",
  studentAppAiTutorQuestionBankDraftGenerationWorkerClaimPrecheck: "reports/student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck.current.json",
  studentAppAiTutorQuestionBankDraftGenerationWorkerClaim: "reports/student-app-ai-tutor-question-bank-draft-generation-worker-claim.current.json",
  studentAppAiTutorQuestionBankDraftGenerationInputEnvelope: "reports/student-app-ai-tutor-question-bank-draft-generation-input-envelope.current.json",
  studentAppAiTutorQuestionBankDraftGenerationModelExecutionPrecheck: "reports/student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck.current.json",
  studentAppAiTutorQuestionBankDraftGenerationControlledDraft: "reports/student-app-ai-tutor-question-bank-draft-generation-controlled-draft.current.json",
  studentAppAiTutorQuestionBankDraftGenerationTeacherReview: "reports/student-app-ai-tutor-question-bank-draft-generation-teacher-review.current.json",
  studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit: "reports/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit.current.json",
  studentAppAiTutorQuestionBankDraftGenerationContentRowVerification: "reports/student-app-ai-tutor-question-bank-draft-generation-content-row-verification.current.json",
  studentAppAiTutorQuestionBankDraftVisibility: "reports/student-app-ai-tutor-question-bank-draft-visibility.current.json",
  studentAppAiTutorQuestionBankDraftContentPrecheck: "reports/student-app-ai-tutor-question-bank-draft-content-precheck.current.json",
  studentAppAiTutorQuestionBankDraftContentRead: "reports/student-app-ai-tutor-question-bank-draft-content-read.current.json",
  studentAppAiTutorQuestionBankDraftContentStudentReadVerification: "reports/student-app-ai-tutor-question-bank-draft-content-student-read-verification.current.json",
  studentAppAiTutorQuestionBankDraftAnswerSubmission: "reports/student-app-ai-tutor-question-bank-draft-answer-submission.current.json",
  studentAppAiTutorQuestionBankDraftAnswerSubmissionVerification: "reports/student-app-ai-tutor-question-bank-draft-answer-submission-verification.current.json",
  studentAppAiTutorQuestionBankDraftAnswerScoringRequest: "reports/student-app-ai-tutor-question-bank-draft-answer-scoring-request.current.json",
  studentAppAiTutorQuestionBankDraftAnswerScoringRequestVerification: "reports/student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification.current.json",
  studentAppAiTutorQuestionBankDraftAnswerScoringInput: "reports/student-app-ai-tutor-question-bank-draft-answer-scoring-input.current.json",
  studentAppAiTutorQuestionBankDraftAnswerScoringModelExecutionPrecheck: "reports/student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck.current.json",
  studentAppAiTutorQuestionBankDraftAnswerControlledScoringArtifact: "reports/student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact.current.json",
  studentAppAiTutorQuestionBankDraftAnswerScoringResultPersistenceBridge: "reports/student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge.current.json",
  studentAppAiTutorQuestionBankDraftAnswerScoringResult: "reports/student-app-ai-tutor-question-bank-draft-answer-scoring-result.current.json",
  studentAppAiTutorQuestionBankDraftAnswerScoringCompletionBridge: "reports/student-app-ai-tutor-question-bank-draft-answer-scoring-completion-bridge.current.json",
  studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck.current.json",
  studentAppAiTutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck.current.json",
  studentAppAiTutorQuestionBankDraftAnswerFeedbackControlledDraft: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft.current.json",
  studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource: "reports/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source.current.json",
  studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source.current.json",
  studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source.current.json",
  studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source.current.json",
  studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source.current.json",
  studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source.current.json",
  studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifact: "reports/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact.current.json",
  studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApproval: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval.current.json",
  studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope.current.json",
  studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command.current.json",
  studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommit: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit.current.json",
  studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveRowVerification: "reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification.current.json",
  researchAgentReadonlyContract: "reports/research-agent-readonly-contract.current.json",
  researchAgentReadonlyRuntimeSlo: "reports/research-agent-readonly-runtime-slo.current.json",
  researchAgentReadonlyRuntimeAdapter: "reports/research-agent-readonly-runtime-adapter.current.json",
  researchDeepResearchIntent: "reports/research-deep-research-intent.current.json",
  researchDeepResearchWorkerLifecycle: "reports/research-deep-research-worker-lifecycle.current.json",
  researchDeepResearchRetrievalPlan: "reports/research-deep-research-retrieval-plan.current.json",
  researchDeepResearchRetrievalExecution: "reports/research-deep-research-retrieval-execution.current.json",
  researchDeepResearchReasoningSynthesis: "reports/research-deep-research-reasoning-synthesis.current.json",
  researchDeepResearchFinalAnswerReview: "reports/research-deep-research-final-answer-review.current.json",
  researchDeepResearchFinalization: "reports/research-deep-research-finalization.current.json",
  researchDeepResearchRenderPreview: "reports/research-deep-research-render-preview.current.json",
  researchDeepResearchPublicationPrecheck: "reports/research-deep-research-publication-precheck.current.json",
  researchDeepResearchTeacherDelivery: "reports/research-deep-research-teacher-delivery.current.json",
  researchDeepResearchStudentVisibilityReview: "reports/research-deep-research-student-visibility-review.current.json",
  researchDeepResearchStudentDelivery: "reports/research-deep-research-student-delivery.current.json",
  researchDeepResearchStudentArchivePersistence: "reports/research-deep-research-student-archive-persistence.current.json",
  researchDeepResearchStudentArchiveProjectionReview: "reports/research-deep-research-student-archive-projection-review.current.json",
  researchDeepResearchStudentArchiveProjection: "reports/research-deep-research-student-archive-projection.current.json",
  researchDeepResearchStudentArchiveStoragePrecommit: "reports/research-deep-research-student-archive-storage-precommit.current.json",
  researchDeepResearchStudentArchiveStorageCommit: "reports/research-deep-research-student-archive-storage-commit.current.json",
  researchDeepResearchStudentArchiveRowVerification: "reports/research-deep-research-student-archive-row-verification.current.json",
  workflowPluginFlow: "reports/workflow-plugin-flow.current.json",
  workflowPluginRegistry: "reports/workflow-plugin-registry-admission.current.json",
  workflowPluginRuntimeSlo: "reports/workflow-plugin-runtime-slo.current.json",
  workflowPluginDraftIntent: "reports/workflow-plugin-draft-intent.current.json",
  workflowPluginSandboxResult: "reports/workflow-plugin-sandbox-result.current.json",
  workflowPluginHumanApproval: "reports/workflow-plugin-human-approval.current.json",
  workflowPluginRegistryAdmissionRuntime: "reports/workflow-plugin-registry-admission-runtime.current.json",
  workflowPluginExecutionIsolation: "reports/workflow-plugin-execution-isolation.current.json",
  workflowPluginPublicationDisabled: "reports/workflow-plugin-publication-disabled.current.json",
  workflowPluginManagementDisabledView: "reports/workflow-plugin-management-disabled-view.current.json",
  workflowPluginManagementAuditDetail: "reports/workflow-plugin-management-audit-detail.current.json",
  workflowPluginManagementReadonlyList: "reports/workflow-plugin-management-readonly-list.current.json",
  conversationRuntime: "reports/conversation-loadgen-runtime-decision.current.json",
  sustainedScaleUp: "reports/system-sustained-mixed-workload-scaleup.current.json",
  quality: "reports/quality-gate.current.json",
};
export const rootWorkflows = [
  {
    id: "identity_and_remote_entry",
    name: "Identity, teacher/student login, and remote command entry",
    anchors: ["教师端", "学生端", "微信扫码登录", "账号密码登录", "外部操控"],
    reportChecks: [
      ["identity", "READY"],
      ["agentHarness", "READY"],
      ["agentSkillContracts", "READY"],
    ],
    mixedWorkloads: ["identity_http"],
    coverageClass: "CONTRACT_AND_MIXED_SMOKE",
  },
  {
    id: "research_conversation_and_fusion",
    name: "Research conversation, node orchestration, and answer fusion",
    anchors: ["科研模式", "对话", "多个多模态模型融合回答", "节点"],
    reportChecks: [
      ["conversationRuntime", "READY"],
      ["researchAgentReadonlyContract", "READY"],
      ["researchAgentReadonlyRuntimeAdapter", "READY"],
      ["researchDeepResearchIntent", "READY"],
      ["researchDeepResearchWorkerLifecycle", "READY"],
      ["researchDeepResearchRetrievalPlan", "READY"],
      ["researchDeepResearchRetrievalExecution", "READY"],
      ["researchDeepResearchReasoningSynthesis", "READY"],
      ["researchDeepResearchFinalAnswerReview", "READY"],
      ["researchDeepResearchFinalization", "READY"],
      ["researchDeepResearchRenderPreview", "READY"],
      ["researchDeepResearchPublicationPrecheck", "READY"],
      ["researchDeepResearchTeacherDelivery", "READY"],
      ["researchDeepResearchStudentVisibilityReview", "READY"],
      ["researchDeepResearchStudentDelivery", "READY"],
      ["researchDeepResearchStudentArchivePersistence", "READY"],
      ["researchDeepResearchStudentArchiveProjectionReview", "READY"],
      ["researchDeepResearchStudentArchiveProjection", "READY"],
      ["researchDeepResearchStudentArchiveStoragePrecommit", "READY"],
      ["researchDeepResearchStudentArchiveStorageCommit", "READY"],
      ["researchDeepResearchStudentArchiveRowVerification", "READY"],
    ],
    mixedWorkloads: ["conversation_write"],
    runtimeEvidence: [
      { name: "research_agent_readonly_runtime_slo", reportKey: "researchAgentReadonlyRuntimeSlo", targetP99Ms: 50 },
      { name: "research_agent_readonly_runtime_adapter", reportKey: "researchAgentReadonlyRuntimeAdapter", targetP99Ms: 50 },
      { name: "research_deep_research_intent_runtime", reportKey: "researchDeepResearchIntent", targetP99Ms: 50 },
      { name: "research_deep_research_worker_lifecycle_runtime", reportKey: "researchDeepResearchWorkerLifecycle", targetP99Ms: 50 },
      { name: "research_deep_research_retrieval_plan_runtime", reportKey: "researchDeepResearchRetrievalPlan", targetP99Ms: 50 },
      { name: "research_deep_research_retrieval_execution_runtime", reportKey: "researchDeepResearchRetrievalExecution", targetP99Ms: 300 },
      { name: "research_deep_research_reasoning_synthesis_runtime", reportKey: "researchDeepResearchReasoningSynthesis", targetP99Ms: 300 },
      { name: "research_deep_research_final_answer_review_runtime", reportKey: "researchDeepResearchFinalAnswerReview", targetP99Ms: 300 },
      { name: "research_deep_research_finalization_runtime", reportKey: "researchDeepResearchFinalization", targetP99Ms: 300 },
      { name: "research_deep_research_render_preview_runtime", reportKey: "researchDeepResearchRenderPreview", targetP99Ms: 300 },
      { name: "research_deep_research_publication_precheck_runtime", reportKey: "researchDeepResearchPublicationPrecheck", targetP99Ms: 300 },
      { name: "research_deep_research_teacher_delivery_runtime", reportKey: "researchDeepResearchTeacherDelivery", targetP99Ms: 300 },
      { name: "research_deep_research_student_visibility_review_runtime", reportKey: "researchDeepResearchStudentVisibilityReview", targetP99Ms: 300 },
      { name: "research_deep_research_student_delivery_runtime", reportKey: "researchDeepResearchStudentDelivery", targetP99Ms: 300 },
      { name: "research_deep_research_student_archive_persistence_runtime", reportKey: "researchDeepResearchStudentArchivePersistence", targetP99Ms: 300 },
      { name: "research_deep_research_student_archive_projection_review_runtime", reportKey: "researchDeepResearchStudentArchiveProjectionReview", targetP99Ms: 300 },
      { name: "research_deep_research_student_archive_projection_runtime", reportKey: "researchDeepResearchStudentArchiveProjection", targetP99Ms: 300 },
      { name: "research_deep_research_student_archive_storage_precommit_runtime", reportKey: "researchDeepResearchStudentArchiveStoragePrecommit", targetP99Ms: 300 },
      { name: "research_deep_research_student_archive_storage_commit_runtime", reportKey: "researchDeepResearchStudentArchiveStorageCommit", targetP99Ms: 300 },
      { name: "research_deep_research_student_archive_row_verification_runtime", reportKey: "researchDeepResearchStudentArchiveRowVerification", targetP99Ms: 300 },
    ],
    coverageClass: "PERFORMANCE_DECISION_AND_RESEARCH_ASYNC_STUDENT_ARCHIVE_ROW_VERIFICATION_RUNTIME",
  },
  {
    id: "teaching_archive_quiz_and_ai_grading",
    name: "Teaching archive, quiz, AI grading, and learning material flows",
    anchors: ["教学模式", "随堂测验", "AI批改", "档案资料", "学生档案"],
    reportChecks: [
      ["teachingArchive", "PASSED"],
      ["studentApp", "READY"],
      ["teachingQuizDraftIntent", "READY"],
      ["teachingArchiveMaterialDraftHumanReview", "READY"],
      ["teachingArchiveMaterialDraftStoragePrecommit", "READY"],
      ["teachingArchiveMaterialDraftStorageCommit", "READY"],
      ["teachingArchiveMaterialDraftStorageRowVerification", "READY"],
      ["teachingArchiveMaterialDraftStudentProductRead", "READY"],
      ["teachingArchiveMaterialPublicationPrecheck", "READY"],
      ["teachingArchiveMaterialPublicationApproval", "READY"],
      ["teachingArchiveMaterialPublicationDelivery", "READY"],
      ["teachingArchiveMaterialPublicationPersistenceCommand", "READY"],
      ["teachingArchiveMaterialPublicationStorageCommit", "READY"],
      ["teachingArchiveMaterialPublicationRowVerification", "READY"],
      ["teachingArchiveMaterialPublicationStudentAppRead", "READY"],
      ["teachingArchiveMaterialPublicationProjectionHardening", "READY"],
      ["teachingArchiveMaterialPublishedSearchFoundation", "READY"],
      ["teachingArchiveMaterialPublishedDetailMetadataRead", "READY"],
      ["teachingArchiveMaterialPublishedContentPreviewPrecheck", "READY"],
      ["teachingArchiveMaterialPublishedContentPreviewReadFoundation", "READY"],
      ["teachingArchiveMaterialPublishedContentPreviewRenderEnvelope", "READY"],
      ["teachingArchiveMaterialPublishedStudyPacket", "READY"],
      ["teachingArchiveMaterialPublishedLearningActions", "READY"],
      ["studentAppAiTutorPublishedLearningActionSource", "READY"],
      ["studentAppAiTutorWorkerStudyPacketInput", "READY"],
      ["studentAppAiTutorModelExecutionPrecheck", "READY"],
      ["studentAppAiTutorControlledAnswerArtifact", "READY"],
      ["studentAppAiTutorAnswerReviewGate", "READY"],
      ["studentAppAiTutorReviewedResultPersistenceBridge", "READY"],
      ["studentAppAiTutorResultStudentVisibilityReview", "READY"],
      ["studentAppAiTutorResultStudentDeliveryEnvelope", "READY"],
      ["studentAppAiTutorResultStudentArchivePersistenceCommand", "READY"],
      ["teachingAgentReadonlyRuntimeAdapter", "READY"],
    ],
    mixedWorkloads: ["teaching_archive"],
    runtimeEvidence: [
      { name: "teaching_agent_readonly_runtime_slo", reportKey: "teachingAgentReadonlyRuntimeSlo", targetP99Ms: 50 },
      { name: "teaching_agent_readonly_runtime_adapter", reportKey: "teachingAgentReadonlyRuntimeAdapter", targetP99Ms: 50 },
      { name: "teaching_archive_material_draft_human_review_runtime", reportKey: "teachingArchiveMaterialDraftHumanReview", targetP99Ms: 50 },
      { name: "teaching_archive_material_draft_storage_precommit_runtime", reportKey: "teachingArchiveMaterialDraftStoragePrecommit", targetP99Ms: 50 },
      { name: "teaching_archive_material_draft_storage_commit_runtime", reportKey: "teachingArchiveMaterialDraftStorageCommit", targetP99Ms: 50 },
      { name: "teaching_archive_material_draft_storage_row_verification_runtime", reportKey: "teachingArchiveMaterialDraftStorageRowVerification", targetP99Ms: 50 },
      { name: "teaching_archive_material_draft_student_product_read_runtime", reportKey: "teachingArchiveMaterialDraftStudentProductRead", targetP99Ms: 50 },
      { name: "teaching_archive_material_publication_precheck_runtime", reportKey: "teachingArchiveMaterialPublicationPrecheck", targetP99Ms: 50 },
      { name: "teaching_archive_material_publication_approval_runtime", reportKey: "teachingArchiveMaterialPublicationApproval", targetP99Ms: 50 },
      { name: "teaching_archive_material_publication_delivery_runtime", reportKey: "teachingArchiveMaterialPublicationDelivery", targetP99Ms: 50 },
      { name: "teaching_archive_material_publication_persistence_command_runtime", reportKey: "teachingArchiveMaterialPublicationPersistenceCommand", targetP99Ms: 50 },
      { name: "teaching_archive_material_publication_storage_commit_runtime", reportKey: "teachingArchiveMaterialPublicationStorageCommit", targetP99Ms: 50 },
      { name: "teaching_archive_material_publication_row_verification_runtime", reportKey: "teachingArchiveMaterialPublicationRowVerification", targetP99Ms: 50 },
      { name: "teaching_archive_material_publication_student_app_read_runtime", reportKey: "teachingArchiveMaterialPublicationStudentAppRead", targetP99Ms: 50 },
      { name: "teaching_archive_material_publication_projection_hardening_runtime", reportKey: "teachingArchiveMaterialPublicationProjectionHardening", targetP99Ms: 50 },
      { name: "teaching_archive_material_published_search_foundation_runtime", reportKey: "teachingArchiveMaterialPublishedSearchFoundation", targetP99Ms: 50 },
      { name: "teaching_archive_material_published_detail_metadata_read_runtime", reportKey: "teachingArchiveMaterialPublishedDetailMetadataRead", targetP99Ms: 50 },
      { name: "teaching_archive_material_published_content_preview_precheck_runtime", reportKey: "teachingArchiveMaterialPublishedContentPreviewPrecheck", targetP99Ms: 50 },
      { name: "teaching_archive_material_published_content_preview_read_foundation", reportKey: "teachingArchiveMaterialPublishedContentPreviewReadFoundation", targetP99Ms: 50 },
      { name: "teaching_archive_material_published_content_preview_render_envelope", reportKey: "teachingArchiveMaterialPublishedContentPreviewRenderEnvelope", targetP99Ms: 50 },
      { name: "teaching_archive_material_published_study_packet", reportKey: "teachingArchiveMaterialPublishedStudyPacket", targetP99Ms: 50 },
      { name: "teaching_archive_material_published_learning_actions", reportKey: "teachingArchiveMaterialPublishedLearningActions", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_published_learning_action_source", reportKey: "studentAppAiTutorPublishedLearningActionSource", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_worker_study_packet_input", reportKey: "studentAppAiTutorWorkerStudyPacketInput", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_model_execution_precheck_runtime", reportKey: "studentAppAiTutorModelExecutionPrecheck", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_controlled_answer_artifact_runtime", reportKey: "studentAppAiTutorControlledAnswerArtifact", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_answer_review_gate_runtime", reportKey: "studentAppAiTutorAnswerReviewGate", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_reviewed_result_persistence_bridge_runtime", reportKey: "studentAppAiTutorReviewedResultPersistenceBridge", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_result_student_visibility_review_runtime", reportKey: "studentAppAiTutorResultStudentVisibilityReview", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_result_student_delivery_envelope_runtime", reportKey: "studentAppAiTutorResultStudentDeliveryEnvelope", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_result_student_archive_persistence_command_runtime", reportKey: "studentAppAiTutorResultStudentArchivePersistenceCommand", targetP99Ms: 50 },
    ],
    coverageClass: "CONTRACT_AND_MIXED_SMOKE",
  },
  {
    id: "student_app_personalized_learning",
    name: "Student app, own archive access, tutoring, and quiz submissions",
    anchors: ["学生端", "AI辅导助手", "学生档案", "教学资料", "扫码答题"],
    reportChecks: [
      ["studentApp", "READY"],
      ["identity", "READY"],
      ["studentTutorAgentReadonlyContract", "READY"],
      ["studentTutorAgentReadonlyRuntimeAdapter", "READY"],
      ["studentAppAiTutorRequest", "READY"],
      ["studentAppAiTutorPublishedLearningActionSource", "READY"],
      ["studentAppAiTutorWorkerStudyPacketInput", "READY"],
      ["studentAppAiTutorModelExecutionPrecheck", "READY"],
      ["studentAppAiTutorControlledAnswerArtifact", "READY"],
      ["studentAppAiTutorAnswerReviewGate", "READY"],
      ["studentAppAiTutorReviewedResultPersistenceBridge", "READY"],
      ["studentAppAiTutorResultStudentVisibilityReview", "READY"],
      ["studentAppAiTutorResultStudentDeliveryEnvelope", "READY"],
      ["studentAppAiTutorResultStudentArchivePersistenceCommand", "READY"],
      ["studentAppAiTutorWorkerClaim", "READY"],
      ["studentAppAiTutorResult", "READY"],
      ["studentAppAiTutorQuestionBankDraftGenerationPlan", "READY"],
      ["studentAppAiTutorQuestionBankDraftGenerationWorkerClaimPrecheck", "READY"],
      ["studentAppAiTutorQuestionBankDraftGenerationWorkerClaim", "READY"],
      ["studentAppAiTutorQuestionBankDraftGenerationInputEnvelope", "READY"],
      ["studentAppAiTutorQuestionBankDraftGenerationModelExecutionPrecheck", "READY"],
      ["studentAppAiTutorQuestionBankDraftGenerationControlledDraft", "READY"],
      ["studentAppAiTutorQuestionBankDraftGenerationTeacherReview", "READY"],
      ["studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit", "READY"],
      ["studentAppAiTutorQuestionBankDraftGenerationContentRowVerification", "READY"],
      ["studentAppAiTutorQuestionBankDraftVisibility", "READY"],
      ["studentAppAiTutorQuestionBankDraftContentPrecheck", "READY"],
      ["studentAppAiTutorQuestionBankDraftContentRead", "READY"],
      ["studentAppAiTutorQuestionBankDraftContentStudentReadVerification", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerSubmission", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerSubmissionVerification", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerScoringRequest", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerScoringRequestVerification", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerScoringInput", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerScoringModelExecutionPrecheck", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerControlledScoringArtifact", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerScoringResultPersistenceBridge", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerScoringResult", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerScoringCompletionBridge", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerFeedbackControlledDraft", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifact", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApproval", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommit", "READY"],
      ["studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveRowVerification", "READY"],
      ["teachingArchiveMaterialDraftStudentProductRead", "READY"],
      ["teachingArchiveMaterialPublicationPrecheck", "READY"],
      ["teachingArchiveMaterialPublicationApproval", "READY"],
      ["teachingArchiveMaterialPublicationDelivery", "READY"],
      ["teachingArchiveMaterialPublicationPersistenceCommand", "READY"],
      ["teachingArchiveMaterialPublicationStorageCommit", "READY"],
      ["teachingArchiveMaterialPublicationRowVerification", "READY"],
      ["teachingArchiveMaterialPublicationStudentAppRead", "READY"],
      ["teachingArchiveMaterialPublicationProjectionHardening", "READY"],
      ["teachingArchiveMaterialPublishedSearchFoundation", "READY"],
      ["teachingArchiveMaterialPublishedDetailMetadataRead", "READY"],
      ["teachingArchiveMaterialPublishedContentPreviewPrecheck", "READY"],
      ["teachingArchiveMaterialPublishedContentPreviewReadFoundation", "READY"],
      ["teachingArchiveMaterialPublishedContentPreviewRenderEnvelope", "READY"],
      ["teachingArchiveMaterialPublishedStudyPacket", "READY"],
      ["teachingArchiveMaterialPublishedLearningActions", "READY"],
    ],
    mixedWorkloads: ["teaching_archive"],
    runtimeEvidence: [
      { name: "student_tutor_agent_readonly_runtime_slo", reportKey: "studentTutorAgentReadonlyRuntimeSlo", targetP99Ms: 50 },
      { name: "student_tutor_agent_readonly_runtime_adapter", reportKey: "studentTutorAgentReadonlyRuntimeAdapter", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_request_runtime", reportKey: "studentAppAiTutorRequest", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_published_learning_action_source", reportKey: "studentAppAiTutorPublishedLearningActionSource", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_worker_study_packet_input", reportKey: "studentAppAiTutorWorkerStudyPacketInput", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_model_execution_precheck_runtime", reportKey: "studentAppAiTutorModelExecutionPrecheck", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_controlled_answer_artifact_runtime", reportKey: "studentAppAiTutorControlledAnswerArtifact", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_answer_review_gate_runtime", reportKey: "studentAppAiTutorAnswerReviewGate", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_reviewed_result_persistence_bridge_runtime", reportKey: "studentAppAiTutorReviewedResultPersistenceBridge", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_result_student_visibility_review_runtime", reportKey: "studentAppAiTutorResultStudentVisibilityReview", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_result_student_delivery_envelope_runtime", reportKey: "studentAppAiTutorResultStudentDeliveryEnvelope", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_result_student_archive_persistence_command_runtime", reportKey: "studentAppAiTutorResultStudentArchivePersistenceCommand", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_worker_claim_runtime", reportKey: "studentAppAiTutorWorkerClaim", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_result_runtime", reportKey: "studentAppAiTutorResult", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_generation_plan_runtime", reportKey: "studentAppAiTutorQuestionBankDraftGenerationPlan", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_generation_worker_claim_precheck_runtime", reportKey: "studentAppAiTutorQuestionBankDraftGenerationWorkerClaimPrecheck", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_generation_worker_claim_runtime", reportKey: "studentAppAiTutorQuestionBankDraftGenerationWorkerClaim", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_generation_input_envelope_runtime", reportKey: "studentAppAiTutorQuestionBankDraftGenerationInputEnvelope", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_generation_model_execution_precheck_runtime", reportKey: "studentAppAiTutorQuestionBankDraftGenerationModelExecutionPrecheck", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_generation_controlled_draft_runtime", reportKey: "studentAppAiTutorQuestionBankDraftGenerationControlledDraft", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_generation_teacher_review_runtime", reportKey: "studentAppAiTutorQuestionBankDraftGenerationTeacherReview", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_generation_content_storage_commit_runtime", reportKey: "studentAppAiTutorQuestionBankDraftGenerationContentStorageCommit", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_generation_content_row_verification_runtime", reportKey: "studentAppAiTutorQuestionBankDraftGenerationContentRowVerification", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_visibility_runtime", reportKey: "studentAppAiTutorQuestionBankDraftVisibility", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_content_precheck_runtime", reportKey: "studentAppAiTutorQuestionBankDraftContentPrecheck", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_content_read_foundation", reportKey: "studentAppAiTutorQuestionBankDraftContentRead", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_content_student_read_verification_runtime", reportKey: "studentAppAiTutorQuestionBankDraftContentStudentReadVerification", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_submission_foundation", reportKey: "studentAppAiTutorQuestionBankDraftAnswerSubmission", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_submission_verification_runtime", reportKey: "studentAppAiTutorQuestionBankDraftAnswerSubmissionVerification", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_scoring_request_foundation", reportKey: "studentAppAiTutorQuestionBankDraftAnswerScoringRequest", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_scoring_request_verification_runtime", reportKey: "studentAppAiTutorQuestionBankDraftAnswerScoringRequestVerification", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_scoring_input_foundation", reportKey: "studentAppAiTutorQuestionBankDraftAnswerScoringInput", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_scoring_model_execution_precheck_runtime", reportKey: "studentAppAiTutorQuestionBankDraftAnswerScoringModelExecutionPrecheck", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_controlled_scoring_artifact_runtime", reportKey: "studentAppAiTutorQuestionBankDraftAnswerControlledScoringArtifact", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_runtime", reportKey: "studentAppAiTutorQuestionBankDraftAnswerScoringResultPersistenceBridge", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_scoring_result_foundation", reportKey: "studentAppAiTutorQuestionBankDraftAnswerScoringResult", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_scoring_completion_bridge", reportKey: "studentAppAiTutorQuestionBankDraftAnswerScoringCompletionBridge", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_precheck_runtime", reportKey: "studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationPrecheck", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_feedback_generation_model_execution_precheck_runtime", reportKey: "studentAppAiTutorQuestionBankDraftAnswerFeedbackGenerationModelExecutionPrecheck", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_feedback_controlled_draft_runtime", reportKey: "studentAppAiTutorQuestionBankDraftAnswerFeedbackControlledDraft", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_controlled_draft_source_runtime", reportKey: "studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifactControlledDraftSource", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_controlled_draft_source_runtime", reportKey: "studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApprovalControlledDraftSource", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_controlled_draft_source_runtime", reportKey: "studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelopeControlledDraftSource", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_persistence_command_controlled_draft_source_runtime", reportKey: "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommandControlledDraftSource", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_storage_commit_controlled_draft_source_runtime", reportKey: "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommitControlledDraftSource", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_row_verification_controlled_draft_source_runtime", reportKey: "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveRowVerificationControlledDraftSource", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_reviewed_feedback_artifact_runtime", reportKey: "studentAppAiTutorQuestionBankDraftAnswerReviewedFeedbackArtifact", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_feedback_publication_approval_runtime", reportKey: "studentAppAiTutorQuestionBankDraftAnswerFeedbackPublicationApproval", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_feedback_delivery_envelope_runtime", reportKey: "studentAppAiTutorQuestionBankDraftAnswerFeedbackDeliveryEnvelope", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_persistence_command_runtime", reportKey: "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchivePersistenceCommand", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_storage_commit_runtime", reportKey: "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveStorageCommit", targetP99Ms: 50 },
      { name: "student_app_ai_tutor_question_bank_draft_answer_feedback_archive_row_verification_runtime", reportKey: "studentAppAiTutorQuestionBankDraftAnswerFeedbackArchiveRowVerification", targetP99Ms: 50 },
      { name: "teaching_archive_material_draft_student_product_read_runtime", reportKey: "teachingArchiveMaterialDraftStudentProductRead", targetP99Ms: 50 },
      { name: "teaching_archive_material_publication_precheck_runtime", reportKey: "teachingArchiveMaterialPublicationPrecheck", targetP99Ms: 50 },
      { name: "teaching_archive_material_publication_approval_runtime", reportKey: "teachingArchiveMaterialPublicationApproval", targetP99Ms: 50 },
      { name: "teaching_archive_material_publication_delivery_runtime", reportKey: "teachingArchiveMaterialPublicationDelivery", targetP99Ms: 50 },
      { name: "teaching_archive_material_publication_persistence_command_runtime", reportKey: "teachingArchiveMaterialPublicationPersistenceCommand", targetP99Ms: 50 },
      { name: "teaching_archive_material_publication_storage_commit_runtime", reportKey: "teachingArchiveMaterialPublicationStorageCommit", targetP99Ms: 50 },
      { name: "teaching_archive_material_publication_row_verification_runtime", reportKey: "teachingArchiveMaterialPublicationRowVerification", targetP99Ms: 50 },
      { name: "teaching_archive_material_publication_student_app_read_runtime", reportKey: "teachingArchiveMaterialPublicationStudentAppRead", targetP99Ms: 50 },
      { name: "teaching_archive_material_publication_projection_hardening_runtime", reportKey: "teachingArchiveMaterialPublicationProjectionHardening", targetP99Ms: 50 },
      { name: "teaching_archive_material_published_search_foundation_runtime", reportKey: "teachingArchiveMaterialPublishedSearchFoundation", targetP99Ms: 50 },
      { name: "teaching_archive_material_published_detail_metadata_read_runtime", reportKey: "teachingArchiveMaterialPublishedDetailMetadataRead", targetP99Ms: 50 },
      { name: "teaching_archive_material_published_content_preview_precheck_runtime", reportKey: "teachingArchiveMaterialPublishedContentPreviewPrecheck", targetP99Ms: 50 },
      { name: "teaching_archive_material_published_content_preview_read_foundation", reportKey: "teachingArchiveMaterialPublishedContentPreviewReadFoundation", targetP99Ms: 50 },
      { name: "teaching_archive_material_published_content_preview_render_envelope", reportKey: "teachingArchiveMaterialPublishedContentPreviewRenderEnvelope", targetP99Ms: 50 },
      { name: "teaching_archive_material_published_study_packet", reportKey: "teachingArchiveMaterialPublishedStudyPacket", targetP99Ms: 50 },
      { name: "teaching_archive_material_published_learning_actions", reportKey: "teachingArchiveMaterialPublishedLearningActions", targetP99Ms: 50 },
    ],
    coverageClass: "CONTRACT_AND_STUDENT_TUTOR_ASYNC_REQUEST_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_ASYNC_CLAIM_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_ASYNC_RESULT_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECK_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECK_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_STORAGE_COMMIT_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_ROW_VERIFICATION_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_CONTENT_READ_FOUNDATION + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_CONTENT_STUDENT_READ_VERIFICATION_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_FOUNDATION + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SUBMISSION_VERIFICATION_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_FOUNDATION + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_REQUEST_VERIFICATION_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_INPUT_FOUNDATION + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_MODEL_EXECUTION_PRECHECK_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_FOUNDATION + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_COMPLETION_BRIDGE + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_PRECHECK_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_GENERATION_MODEL_EXECUTION_PRECHECK_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_CONTROLLED_DRAFT_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_CONTROLLED_DRAFT_SOURCE_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_CONTROLLED_DRAFT_SOURCE_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_CONTROLLED_DRAFT_SOURCE_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_CONTROLLED_DRAFT_SOURCE_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_CONTROLLED_DRAFT_SOURCE_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_CONTROLLED_DRAFT_SOURCE_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_REVIEWED_FEEDBACK_ARTIFACT_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_PUBLICATION_APPROVAL_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_DELIVERY_ENVELOPE_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PERSISTENCE_COMMAND_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMIT_RUNTIME + CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_ROW_VERIFICATION_RUNTIME",
  },
  {
    id: "knowledge_access_and_retrieval",
    name: "Public/private knowledge isolation and hybrid retrieval",
    anchors: ["公开知识库", "私密知识库", "物理上的隔断", "RAG检索"],
    reportChecks: [
      ["knowledgePolicy", "READY"],
      ["knowledgeRetrieval", "READY"],
    ],
    mixedWorkloads: ["knowledge_retrieval"],
    coverageClass: "POLICY_AND_MIXED_SMOKE",
  },
  {
    id: "ai_worker_optional_model_runtime",
    name: "AI worker boundary for OCR, RAG, model calls, and training tasks",
    anchors: ["OCR识别", "RAG", "模型训练", "微调"],
    reportChecks: [
      ["aiWorkerJob", "READY"],
      ["aiWorkerAdmission", "READY"],
      ["aiWorkerDependencies", "READY"],
    ],
    mixedWorkloads: ["ai_worker_admission"],
    coverageClass: "WORKER_BOUNDARY_AND_MIXED_ADMISSION_SMOKE",
  },
  {
    id: "agent_harness_local_control",
    name: "Agent harness for desktop application control and approval",
    anchors: ["操纵电脑上的所有应用", "社交平台", "发布命令", "统筹智能体"],
    reportChecks: [
      ["agentHarness", "READY"],
      ["agentSkillContracts", "READY"],
      ["agentReadonlyApiRuntime", "READY"],
      ["agentControlledWriteIntentGateway", "READY"],
      ["teachingQuizDraftIntent", "READY"],
      ["teachingArchiveMaterialDraftIntent", "READY"],
      ["teachingArchiveMaterialDraftHumanReview", "READY"],
      ["teachingArchiveMaterialDraftStoragePrecommit", "READY"],
      ["teachingArchiveMaterialDraftStorageCommit", "READY"],
      ["teachingArchiveMaterialDraftStorageRowVerification", "READY"],
      ["identity", "READY"],
    ],
    mixedWorkloads: ["identity_http", "ai_worker_admission"],
    runtimeEvidence: [
      { name: "agent_readonly_runtime_dispatcher", reportKey: "agentReadonlyRuntimeDispatcher", targetP99Ms: 50 },
      { name: "agent_readonly_api_runtime", reportKey: "agentReadonlyApiRuntime", targetP99Ms: 50 },
    ],
    coverageClass: "CONTRACT_SHARED_MIXED_READONLY_RUNTIME_AND_CONTROLLED_WRITE_INTENT",
  },
  {
    id: "workflow_plugin_self_evolution",
    name: "Generated workflow/plugin self-evolution with sandbox and approval",
    anchors: ["工作流", "插件", "自动测试", "人类评估性能与效果", "自我进化"],
    reportChecks: [
      ["workflowPluginFlow", "READY"],
      ["workflowPluginRegistry", "READY"],
      ["workflowPluginRuntimeSlo", "READY"],
      ["workflowPluginDraftIntent", "READY"],
      ["workflowPluginSandboxResult", "READY"],
      ["workflowPluginHumanApproval", "READY"],
      ["workflowPluginRegistryAdmissionRuntime", "READY"],
      ["workflowPluginExecutionIsolation", "READY"],
      ["workflowPluginPublicationDisabled", "READY"],
      ["workflowPluginManagementDisabledView", "READY"],
      ["workflowPluginManagementAuditDetail", "READY"],
      ["workflowPluginManagementReadonlyList", "READY"],
    ],
    mixedWorkloads: [],
    runtimeEvidence: [
      { name: "workflow_plugin_runtime_slo", reportKey: "workflowPluginRuntimeSlo", targetP99Ms: 300 },
    ],
    coverageClass: "RUNTIME_SLO_AND_REVIEW_ONLY_EXECUTION",
  },
];
export function auditRootWorkflowCoverage(inputs) {
  const reports = parseReports(inputs.reports ?? {});
  const rootText = String(inputs.rootRequirementsText ?? "");
  const workflows = rootWorkflows.map((workflow) => summarizeWorkflow(workflow, rootText, reports));
  const mixedWorkloadNames = collectMixedWorkloadNames(reports.sustainedScaleUp?.value);
  const findings = [];
  addFinding(findings, {
    id: "root_requirements.present",
    passed: rootText.trim().length > 0,
    actual: rootText.trim().length > 0 ? "present" : "missing",
    expected: "immutable root requirements text is readable",
    remediation: "Read the immutable root requirements file before claiming root workflow coverage.",
  });
  addFinding(findings, {
    id: "root_requirements.anchors_covered",
    passed: workflows.every((workflow) => workflow.rootAnchorStatus === "COVERED"),
    actual: workflows.map((workflow) => `${workflow.id}:${workflow.missingRootAnchors.join("|") || "covered"}`).join(";"),
    expected: "every root workflow maps back to one or more immutable root requirement anchors",
    remediation: "Update the workflow mapping only after reading the root requirement; do not infer coverage from stale docs.",
  });
  addFinding(findings, {
    id: "sources.required_reports_parseable",
    passed: Object.entries(sourceReports).every(([key]) => reports[key]?.parseable === true),
    actual: Object.entries(sourceReports).map(([key, reportPath]) => `${key}:${reports[key]?.parseable === true ? "json" : "missing_or_invalid"}:${reportPath}`).join(";"),
    expected: "all root workflow source reports are readable JSON",
    remediation: "Regenerate the missing or invalid workflow source report before using it as root coverage evidence.",
  });
  addFinding(findings, {
    id: "workflows.coverage_complete",
    passed: workflows.every((workflow) => workflow.coverageStatus === "COVERED"),
    actual: workflows.map((workflow) => `${workflow.id}:${workflow.coverageStatus}`).join(";"),
    expected: "every root workflow has passing contract, policy, or mixed-smoke evidence",
    remediation: "Add the missing workflow contract, policy audit, or mixed workload evidence before capacity promotion review.",
  });
  addFinding(findings, {
    id: "performance.mixed_workload_names_present",
    passed: ["identity_http", "conversation_write", "teaching_archive", "knowledge_retrieval", "ai_worker_admission"]
      .every((name) => mixedWorkloadNames.includes(name)),
    actual: mixedWorkloadNames.join(","),
    expected: "identity_http, conversation_write, teaching_archive, knowledge_retrieval, ai_worker_admission",
    remediation: "Keep every current root performance slice in the sustained scale-up report.",
  });
  addFinding(findings, {
    id: "baseline.no_forbidden_ai_runtime_dependencies",
    passed: forbiddenAiPackageHits(reports.aiWorkerDependencies?.value) === 0,
    actual: forbiddenAiPackageHits(reports.aiWorkerDependencies?.value),
    expected: 0,
    remediation: "Keep model, OCR, RAG, vector, embedding, and training dependencies outside the baseline runtime.",
  });
  addFinding(findings, {
    id: "quality.gate_passed",
    passed: isQualityGateReportPassing(reports.quality?.value, {
      allowInProgress: allowInProgressQualityGateFromEnv(),
    }),
    actual: summarizeQualityGateReportState(reports.quality?.value),
    expected: "quality gate allPassed=true",
    remediation: "Root workflow coverage must not be used from a workspace whose strict quality gate is failing.",
  });
  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: new Date().toISOString(),
    readiness,
    workloadType: "ROOT_WORKFLOW_COVERAGE",
    rootRequirements: {
      sourcePath: inputs.rootRequirementsPath ?? null,
      anchorCount: workflows.reduce((total, workflow) => total + workflow.matchedRootAnchors.length, 0),
    },
    summary: summarizeCoverage(workflows, mixedWorkloadNames),
    workflows,
    findings,
    nextAction: readiness === "READY"
      ? "Treat this as root workflow coverage evidence only; cross-module database and queue diagnostics plus root SLO promotion review remain required."
      : "Fix missing root workflow coverage before using current performance evidence for whole-system capacity review.",
  };
}
export function formatRootWorkflowCoverageAudit(report) {
  const lines = [
    `Root workflow coverage: ${report.readiness}`,
    `Covered workflows: ${report.summary.coveredWorkflows}/${report.summary.totalWorkflows}`,
    `Mixed workload names: ${report.summary.mixedWorkloadNames.join(",")}`,
    "",
    "Workflow coverage:",
  ];
  for (const workflow of report.workflows) {
    lines.push(`- ${workflow.id}: ${workflow.coverageStatus} ${workflow.coverageClass}`);
  }
  lines.push("", "Findings:");
  for (const finding of report.findings) {
    lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}
function summarizeWorkflow(workflow, rootText, reports) {
  const matchedRootAnchors = workflow.anchors.filter((anchor) => containsText(rootText, anchor));
  const reportResults = workflow.reportChecks.map(([key, expected]) => ({
    key,
    expected,
    actual: sourceStatus(reports[key]?.value),
    reportPath: sourceReports[key],
    passed: reports[key]?.parseable === true && sourceStatus(reports[key]?.value) === expected,
  }));
  const mixedWorkloadNames = collectMixedWorkloadNames(reports.sustainedScaleUp?.value);
  const mixedWorkloadResults = workflow.mixedWorkloads.map((name) => ({
    name,
    passed: mixedWorkloadNames.includes(name),
  }));
  const runtimeEvidenceResults = (workflow.runtimeEvidence ?? []).map((evidence) =>
    summarizeRuntimeEvidence(evidence, reports),
  );
  const coverageStatus = matchedRootAnchors.length > 0 &&
    reportResults.every((result) => result.passed) &&
    mixedWorkloadResults.every((result) => result.passed) &&
    runtimeEvidenceResults.every((result) => result.passed)
    ? "COVERED"
    : "NEEDS_EVIDENCE";
  return {
    id: workflow.id,
    name: workflow.name,
    coverageClass: workflow.coverageClass,
    coverageStatus,
    rootAnchorStatus: matchedRootAnchors.length > 0 ? "COVERED" : "MISSING",
    matchedRootAnchors,
    missingRootAnchors: workflow.anchors.filter((anchor) => !matchedRootAnchors.includes(anchor)),
    reportResults,
    mixedWorkloadResults,
    runtimeEvidenceResults,
  };
}
function summarizeCoverage(workflows, mixedWorkloadNames) {
  const coveredWorkflows = workflows.filter((workflow) => workflow.coverageStatus === "COVERED");
  const mixedCoveredWorkflows = workflows.filter((workflow) =>
    workflow.mixedWorkloadResults.length > 0 && workflow.mixedWorkloadResults.every((result) => result.passed),
  );
  const runtimeCoveredWorkflows = workflows.filter((workflow) =>
    workflow.runtimeEvidenceResults.length > 0 && workflow.runtimeEvidenceResults.every((result) => result.passed),
  );
  const contractOnlyWorkflows = workflows.filter((workflow) =>
    workflow.mixedWorkloadResults.length === 0 && workflow.runtimeEvidenceResults.length === 0,
  );
  return {
    totalWorkflows: workflows.length,
    coveredWorkflows: coveredWorkflows.length,
    mixedCoveredWorkflows: mixedCoveredWorkflows.length,
    runtimeCoveredWorkflows: runtimeCoveredWorkflows.length,
    contractOnlyWorkflows: contractOnlyWorkflows.length,
    mixedWorkloadNames,
  };
}
function summarizeRuntimeEvidence(evidence, reports) {
  const report = reports[evidence.reportKey]?.value;
  const p99Ms = numberOrNull(report?.runtimeSlo?.p99Ms);
  const totalErrors = numberOrNull(report?.runtimeSlo?.totalErrors);
  const targetP99Ms = numberOrNull(evidence.targetP99Ms);
  return {
    name: evidence.name,
    reportKey: evidence.reportKey,
    reportPath: sourceReports[evidence.reportKey],
    targetP99Ms,
    p99Ms,
    totalErrors,
    passed: reports[evidence.reportKey]?.parseable === true &&
      sourceStatus(report) === "READY" &&
      Number.isFinite(p99Ms) &&
      Number.isFinite(targetP99Ms) &&
      p99Ms <= targetP99Ms &&
      totalErrors === 0,
  };
}
function collectMixedWorkloadNames(report) {
  if (!report || typeof report !== "object") return [];
  const names = new Set();
  for (const step of report.steps ?? []) {
    for (const workload of step.workloads ?? []) {
      if (typeof workload.name === "string") names.add(workload.name);
    }
  }
  return [...names].sort();
}
function forbiddenAiPackageHits(report) {
  if (!report || typeof report !== "object" || !Array.isArray(report.findings)) return null;
  const finding = report.findings.find((candidate) => candidate.id === "baseline.no_forbidden_ai_packages");
  return String(finding?.actual ?? "").toLowerCase() === "none" ? 0 : null;
}
function parseReports(reports) {
  return Object.fromEntries(Object.entries(sourceReports).map(([key, reportPath]) => {
    const text = reports[reportPath];
    if (typeof text !== "string" || text.trim().length === 0) {
      return [key, { present: false, parseable: false }];
    }
    try {
      return [key, { present: true, parseable: true, value: JSON.parse(text) }];
    } catch (error) {
      return [key, { present: true, parseable: false, error: error.message }];
    }
  }));
}
function sourceStatus(report) {
  if (!report || typeof report !== "object") return "MISSING";
  if (typeof report.readiness === "string") return report.readiness;
  if (typeof report.status === "string") return report.status;
  if (report.decision === "ALLOW_SAVE") return "READY";
  if (typeof report.decision === "string") return report.decision;
  if (typeof report.allPassed === "boolean") return report.allPassed ? "PASSED" : "FAILED";
  return "UNKNOWN";
}
function containsText(text, needle) {
  return String(text).toLowerCase().includes(String(needle).toLowerCase());
}
function addFinding(findings, finding) {
  findings.push({
    id: finding.id,
    passed: Boolean(finding.passed),
    severity: finding.passed ? "info" : "error",
    actual: finding.actual ?? null,
    expected: finding.expected,
    remediation: finding.remediation,
  });
}
function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
}
function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}
function loadCurrentInputs(root, rootRequirementsPath) {
  const absoluteRootRequirements = path.resolve(root, rootRequirementsPath);
  return {
    rootRequirementsPath,
    rootRequirementsText: fs.readFileSync(absoluteRootRequirements, "utf8"),
    reports: Object.fromEntries(Object.values(sourceReports).map((reportPath) => [
      reportPath,
      fs.readFileSync(path.join(root, reportPath), "utf8"),
    ])),
  };
}
function writeReport(root, reportPath, report) {
  const absolute = path.join(root, reportPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}
function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  const rootRequirementsIndex = argv.indexOf("--root-requirements");
  return {
    out: outIndex === -1 ? defaultOutPath : argv[outIndex + 1],
    rootRequirementsPath: rootRequirementsIndex === -1
      ? defaultRootRequirementsPath
      : argv[rootRequirementsIndex + 1],
  };
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = auditRootWorkflowCoverage(loadCurrentInputs(root, args.rootRequirementsPath));
    writeReport(root, args.out, report);
    console.log(formatRootWorkflowCoverageAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

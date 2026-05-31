import { postgresDiagnosticsDefaults as sharedPostgresDiagnosticsDefaults } from "./postgres-diagnostics.mjs";

export {
  applyPostgresDiagnosticsArg,
  collectPostgresDiagnostics,
  postgresDiagnosticsEnabled,
  runBenchmarkCommandAsync,
  runBenchmarkWithPostgresDiagnostics,
  startPostgresDiagnosticsTimeline,
} from "./postgres-diagnostics.mjs";

export const postgresDiagnosticsDefaults = {
  ...sharedPostgresDiagnosticsDefaults,
  postgresDiagnosticsRelations: "identity_sessions,identity_remote_command_nonces",
};

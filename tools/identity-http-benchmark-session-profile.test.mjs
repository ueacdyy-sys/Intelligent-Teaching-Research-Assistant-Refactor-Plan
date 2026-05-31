import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addSessionPersistenceToDatabaseProfile,
  applySessionTablePersistenceArg,
  defaultSessionTablePersistence,
  gatewaySessionPersistenceEnv,
} from "./identity-http-benchmark-session-profile.mjs";

describe("identity HTTP benchmark session persistence profile", () => {
  it("parses, reports, and forwards the session table persistence profile", () => {
    const options = { sessionDbSessionTablePersistence: defaultSessionTablePersistence };

    assert.equal(
      applySessionTablePersistenceArg(options, "--session-db-session-table-persistence", "UNLOGGED"),
      true,
    );
    assert.equal(options.sessionDbSessionTablePersistence, "unlogged");
    assert.deepEqual(gatewaySessionPersistenceEnv(options), {
      SESSION_DB_SESSION_TABLE_PERSISTENCE: "unlogged",
    });
    assert.deepEqual(addSessionPersistenceToDatabaseProfile({ workerCount: 6 }, options), {
      workerCount: 6,
      sessionTablePersistence: "unlogged",
    });
  });

  it("ignores unrelated args and rejects unknown persistence profiles", () => {
    assert.equal(applySessionTablePersistenceArg({}, "--session-db-max-conns", "12"), false);
    assert.throws(
      () => applySessionTablePersistenceArg({}, "--session-db-session-table-persistence", "temporary"),
      /logged or unlogged/u,
    );
  });
});

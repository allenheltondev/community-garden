import assert from "node:assert/strict";
import test from "node:test";
import {
  groupNamesFromListResponse,
  planTierGroupChanges,
  resetCiApiAccess,
  resetCiUserUsage,
} from "../ci-auth-seed.mjs";

test("resetCiUserUsage clears rolling AI allowance for the seeded CI user", async () => {
  const calls = [];
  const client = {
    query: async (...args) => {
      calls.push(args);
    },
  };

  await resetCiUserUsage(client, "11111111-1111-1111-1111-111111111111");

  assert.deepEqual(calls, [
    [
      "DELETE FROM ai_usage_events WHERE user_id = $1",
      ["11111111-1111-1111-1111-111111111111"],
    ],
  ]);
});

test("groupNamesFromListResponse reads the SDK's PascalCase group shape", () => {
  const response = {
    Groups: [{ GroupName: "pro-tier" }, { GroupName: "admin" }],
  };

  assert.deepEqual(groupNamesFromListResponse(response), ["pro-tier", "admin"]);
});

test("groupNamesFromListResponse tolerates a user with no groups", () => {
  assert.deepEqual(groupNamesFromListResponse({}), []);
  assert.deepEqual(groupNamesFromListResponse({ Groups: [] }), []);
  assert.deepEqual(groupNamesFromListResponse(undefined), []);
});

test("planTierGroupChanges demotes a CI user who still carries a higher tier group", () => {
  const changes = planTierGroupChanges(["pro-tier"], "free");

  assert.equal(changes.targetGroup, "free-tier");
  assert.deepEqual(changes.groupsToRemove, ["pro-tier"]);
  assert.equal(changes.addTargetGroup, true);
});

test("planTierGroupChanges leaves a correctly grouped user alone", () => {
  const changes = planTierGroupChanges(["free-tier"], "free");

  assert.deepEqual(changes.groupsToRemove, []);
  assert.equal(changes.addTargetGroup, false);
});

test("planTierGroupChanges keeps non-tier groups such as admin", () => {
  const changes = planTierGroupChanges(["admin", "supporter-tier"], "pro");

  assert.equal(changes.targetGroup, "pro-tier");
  assert.deepEqual(changes.groupsToRemove, ["supporter-tier"]);
  assert.equal(changes.addTargetGroup, true);
});

test("planTierGroupChanges adds the tier group for a user with none", () => {
  const changes = planTierGroupChanges([], "supporter");

  assert.equal(changes.targetGroup, "supporter-tier");
  assert.deepEqual(changes.groupsToRemove, []);
  assert.equal(changes.addTargetGroup, true);
});

test("resetCiApiAccess clears prior access requests so each run starts clean", async () => {
  const calls = [];
  const client = {
    query: async (...args) => {
      calls.push(args);
    },
  };

  await resetCiApiAccess(client, "22222222-2222-2222-2222-222222222222");

  assert.deepEqual(calls, [
    [
      "DELETE FROM api_access_requests WHERE user_id = $1",
      ["22222222-2222-2222-2222-222222222222"],
    ],
  ]);
});

test("resetCiApiAccess leaves issued keys alone", async () => {
  const statements = [];
  const client = {
    query: async (sql) => {
      statements.push(sql);
    },
  };

  await resetCiApiAccess(client, "22222222-2222-2222-2222-222222222222");

  // Deleting keys would orphan the API Gateway keys behind them.
  assert.equal(
    statements.some((sql) => /delete\s+from\s+api_keys/i.test(sql)),
    false
  );
});

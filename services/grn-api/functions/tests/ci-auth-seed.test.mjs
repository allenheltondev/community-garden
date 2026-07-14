import assert from "node:assert/strict";
import test from "node:test";
import { resetCiUserUsage } from "../ci-auth-seed.mjs";

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

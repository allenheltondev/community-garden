import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminListGroupsForUserCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminSetUserPasswordCommand,
  AdminInitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import pg from "pg";

const { USER_POOL_ID, USER_POOL_CLIENT_ID, DATABASE_URL } = process.env;
const cognito = new CognitoIdentityProviderClient();

/**
 * Deterministic password derived from the user label.
 * Meets Cognito complexity requirements (upper, lower, digit, special, 20+ chars).
 */
function deterministicPassword(label) {
  return `CiSeed!9x_${label}_Zq2w`;
}

/**
 * Decode the `sub` claim from a JWT id_token without verification
 * (fine for CI-only usage against our own Cognito pool).
 */
function decodeSubFromJwt(idToken) {
  const payload = idToken.split(".")[1];
  const json = Buffer.from(payload, "base64url").toString("utf-8");
  const claims = JSON.parse(json);
  if (!claims.sub) throw new Error("Unable to decode sub from id token");
  return claims.sub;
}

/**
 * Create-or-reuse a Cognito user with a deterministic email, set a known
 * password, put them in the right groups, and return fresh tokens via
 * ADMIN_USER_PASSWORD_AUTH.
 *
 * Groups are applied *before* the token is minted, on purpose. The GRN
 * authorizer reads `cognito:groups` out of the JWT's own claims to decide
 * isAdmin, so a group added after authentication is invisible for the life of
 * that token and an admin CI user would be refused by the admin endpoints.
 */
async function getOrCreateUser(label, { tier, admin }) {
  const email = `ci+${label}@example.com`;
  const password = deterministicPassword(label);

  await ensureUser(email, password);
  await ensureGroups(email, tier, admin);

  try {
    return await authenticateUser(email, password);
  } catch (err) {
    if (err.name !== "NotAuthorizedException") throw err;

    // User is in a bad state; delete and recreate.
    await cognito.send(
      new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: email })
    );
    await ensureUser(email, password);
    await ensureGroups(email, tier, admin);
    return await authenticateUser(email, password);
  }
}

async function ensureGroups(email, tier, admin) {
  await ensureTierGroup(email, tier);
  if (admin === true) {
    await ensureAdminGroup(email);
  }
}

/**
 * Put a CI user in the shared pool's `admin` group. Only ever adds: the
 * seeder never grants admin implicitly, so a user is admin exactly when their
 * spec says so, and nothing else in the pool is demoted as a side effect.
 */
async function ensureAdminGroup(email) {
  const response = await cognito.send(
    new AdminListGroupsForUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
    })
  );

  if (groupNamesFromListResponse(response).includes(ADMIN_GROUP)) return;

  await cognito.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      GroupName: ADMIN_GROUP,
    })
  );
}

async function ensureUser(email, password) {
  try {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        MessageAction: "SUPPRESS",
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "email_verified", Value: "true" },
        ],
      })
    );
  } catch (err) {
    if (err.name !== "UsernameExistsException") throw err;
  }

  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      Password: password,
      Permanent: true,
    })
  );
}

const TIER_GROUPS = ["free-tier", "supporter-tier", "pro-tier"];
const ADMIN_GROUP = "admin";

function tierToGroupName(tier) {
  switch (tier) {
    case "pro":
      return "pro-tier";
    case "supporter":
      return "supporter-tier";
    default:
      return "free-tier";
  }
}

/**
 * Read group names out of an AdminListGroupsForUser response.
 *
 * The AWS SDK v3 returns PascalCase (`Groups` / `GroupName`). Reading the
 * snake_case shape instead silently yields an empty list, which makes the
 * seeder look successful while never demoting a user — so CI users keep a
 * tier group they were once given and every "free tier is blocked" assertion
 * fails against them.
 */
export function groupNamesFromListResponse(response) {
  return response?.Groups?.flatMap((group) => group.GroupName ?? []) ?? [];
}

/**
 * Work out which tier groups to remove and whether the target group is
 * missing. Tier groups are mutually exclusive: the authorizer resolves a tier
 * by looking these up live, and pro wins over supporter over free, so a
 * leftover group silently upgrades the user.
 */
export function planTierGroupChanges(currentGroups, tier) {
  const targetGroup = tierToGroupName(tier);
  return {
    targetGroup,
    groupsToRemove: currentGroups.filter(
      (group) => TIER_GROUPS.includes(group) && group !== targetGroup
    ),
    addTargetGroup: !currentGroups.includes(targetGroup),
  };
}

async function ensureTierGroup(email, tier) {
  const response = await cognito.send(
    new AdminListGroupsForUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
    })
  );

  const { targetGroup, groupsToRemove, addTargetGroup } = planTierGroupChanges(
    groupNamesFromListResponse(response),
    tier
  );

  await Promise.all(
    groupsToRemove.map((group) =>
      cognito.send(
        new AdminRemoveUserFromGroupCommand({
          UserPoolId: USER_POOL_ID,
          Username: email,
          GroupName: group,
        })
      )
    )
  );

  if (addTargetGroup) {
    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        GroupName: targetGroup,
      })
    );
  }
}

async function authenticateUser(email, password) {
  const authResult = await cognito.send(
    new AdminInitiateAuthCommand({
      UserPoolId: USER_POOL_ID,
      ClientId: USER_POOL_CLIENT_ID,
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: email, PASSWORD: password },
    })
  );

  const tokens = authResult.AuthenticationResult;
  return {
    email,
    access_token: tokens.AccessToken,
    id_token: tokens.IdToken,
    refresh_token: tokens.RefreshToken,
  };
}

/**
 * Upsert the user row in Postgres so the API's authorizer/handlers
 * find a valid profile with the expected tier and role.
 */
async function upsertUser(client, userId, email, { role, tier }) {
  const subscriptionStatus = tier === "pro" ? "active" : "none";
  const proExpires = tier === "pro" ? "now() + interval '365 days'" : "null";

  // Remove any stale row with the same email but a different id (happens when
  // Cognito recreates the user with a new sub).
  await client.query(`DELETE FROM users WHERE email = $1 AND id != $2`, [email, userId]);

  await client.query(
    `INSERT INTO users (id, email, display_name, is_verified, tier, subscription_status, pro_expires_at, user_type, onboarding_completed)
     VALUES ($1, $2, $3, true, $4, $5, ${proExpires}, $6, true)
     ON CONFLICT (id) DO UPDATE
       SET email                 = EXCLUDED.email,
           display_name          = EXCLUDED.display_name,
           is_verified           = true,
           tier                  = EXCLUDED.tier,
           subscription_status   = EXCLUDED.subscription_status,
           pro_expires_at        = EXCLUDED.pro_expires_at,
           user_type             = EXCLUDED.user_type,
           onboarding_completed  = true,
           updated_at            = now(),
           deleted_at            = null`,
    [userId, email, `CI ${role} (${tier})`, tier, subscriptionStatus, role]
  );
}

/**
 * CI users are intentionally reused between staging runs. Clear their
 * rolling AI allowance when fresh credentials are seeded so a previous PR's
 * contract run cannot make the next run fail with a documented 429 response.
 * This Lambda is never deployed to production.
 */
export async function resetCiUserUsage(client, userId) {
  await client.query(`DELETE FROM ai_usage_events WHERE user_id = $1`, [userId]);
}

/**
 * Clear the CI user's API access requests so each run starts from a known
 * state: no pending request, and no approval left over from a run that stopped
 * between approving and creating a key.
 *
 * Without this the contract suite is not deterministic — a leftover approval
 * makes "a second key needs a new approval" succeed instead of being refused,
 * and a leftover pending request turns the first POST into a conflict.
 *
 * Issued keys are deliberately left alone. Deleting them would orphan the API
 * Gateway keys behind them, and they do nothing to the outcome: the gate reads
 * approvals, and `access_request_id` becomes null here rather than freeing an
 * approval to be spent twice.
 */
export async function resetCiApiAccess(client, userId) {
  await client.query(`DELETE FROM api_access_requests WHERE user_id = $1`, [userId]);
}

/**
 * Provision a single named user: create/reuse in Cognito, upsert in Postgres,
 * return tokens keyed by the caller-supplied name.
 */
async function provisionUser(client, { name, role, tier, admin }) {
  const tokens = await getOrCreateUser(name, { tier, admin });
  const userId = decodeSubFromJwt(tokens.id_token);
  await upsertUser(client, userId, tokens.email, { role, tier });
  await resetCiUserUsage(client, userId);
  await resetCiApiAccess(client, userId);
  return { name, ...tokens };
}

/**
 * Default user specs used when the Lambda is invoked with an empty payload.
 * Preserves backward compatibility with callers that don't send a `users` array.
 */
const LEGACY_USERS = [
  { name: "grower-free", role: "grower", tier: "free" },
  { name: "grower-pro", role: "grower", tier: "pro" },
];

export async function handler(event) {
  const userSpecs = Array.isArray(event?.users) && event.users.length > 0
    ? event.users
    : LEGACY_USERS;

  // Validate each spec
  for (const spec of userSpecs) {
    if (!spec.name || !spec.role || !spec.tier) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Each user must have name, role, and tier" }),
      };
    }
  }

  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const results = await Promise.all(userSpecs.map((spec) => provisionUser(client, spec)));

    // Build a map keyed by user name for easy extraction in CI scripts
    const users = {};
    for (const result of results) {
      const { name, ...tokens } = result;
      users[name] = tokens;
    }

    // Legacy shape: include top-level aliases so existing callers don't break
    const legacy = {};
    if (users["grower-free"]) legacy.grower_free = users["grower-free"];
    if (users["grower-pro"]) legacy.grower_pro = users["grower-pro"];
    if (users["grower-pro"]) legacy.grower = users["grower-pro"];

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ users, ...legacy }),
    };
  } finally {
    await client.end();
  }
}

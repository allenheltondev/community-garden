import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  InitiateAuthCommand
} from '@aws-sdk/client-cognito-identity-provider';
import { createDbClient } from '../../scripts/db-client.mjs';

const client = new CognitoIdentityProviderClient();

// Two staging validation jobs — Okra API Integration and Admin API Integration —
// both mint a token from this one function, and CI starts them in parallel. Each
// invocation rewrites the same user's password and then signs in with it, so an
// InitiateAuth can land while the other invocation's AdminSetUserPassword is
// still being applied. Cognito answers that with NotAuthorizedException, and
// because the pool sets PreventUserExistenceErrors the message is the generic
// "Incorrect username or password" rather than anything pointing at a race.
// Re-applying the password and retrying resolves it; the sequence is idempotent,
// so a repeat costs nothing when the first attempt was fine.
const AUTH_ATTEMPTS = 4;
const RETRY_BASE_MS = 400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Create the CI user if absent, force the password we are about to use, and put
 * them in the admin group. Safe to repeat: every step is an upsert.
 */
async function ensureCiUser({ userPoolId, username, password, adminGroup }) {
  try {
    await client.send(new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: username,
      MessageAction: 'SUPPRESS',
      TemporaryPassword: password
    }));
  } catch (err) {
    if (err.name !== 'UsernameExistsException') throw err;
  }

  await client.send(new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId,
    Username: username,
    Password: password,
    Permanent: true
  }));

  await client.send(new AdminAddUserToGroupCommand({
    UserPoolId: userPoolId,
    Username: username,
    GroupName: adminGroup
  }));
}

/**
 * Sign in as the CI user, repairing the account and retrying when Cognito
 * refuses the credential we just set.
 */
async function authenticateWithRetry({ userPoolId, clientId, username, password, adminGroup }) {
  let lastError;

  for (let attempt = 1; attempt <= AUTH_ATTEMPTS; attempt += 1) {
    await ensureCiUser({ userPoolId, username, password, adminGroup });

    try {
      const auth = await client.send(new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: clientId,
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password
        }
      }));

      const accessToken = auth.AuthenticationResult?.AccessToken;
      if (!accessToken) {
        throw new Error(`Auth succeeded but no AccessToken — challenge: ${auth.ChallengeName ?? 'none'}`);
      }

      return accessToken;
    } catch (err) {
      // Only a rejected credential is worth another pass. Anything else — a
      // missing auth flow on the client, a throttle, a bad pool id — will not
      // improve by repeating, so surface it immediately.
      if (err.name !== 'NotAuthorizedException') throw err;

      lastError = err;
      console.warn(
        `InitiateAuth rejected the CI credential (attempt ${attempt}/${AUTH_ATTEMPTS}); re-applying the password and retrying.`
      );

      if (attempt < AUTH_ATTEMPTS) {
        await sleep(RETRY_BASE_MS * attempt);
      }
    }
  }

  throw lastError;
}

/**
 * Lambda that upserts a CI admin user and returns an access token.
 * Credentials come from environment variables, passed through from GitHub secrets at deploy time.
 * Intended for CI use only — should NOT be deployed to production.
 */
export const handler = async () => {
  const userPoolId = process.env.SHARED_USER_POOL_ID;
  const clientId = process.env.SHARED_USER_POOL_CLIENT_ID;
  const username = process.env.CI_ADMIN_USERNAME;
  const password = process.env.CI_ADMIN_PASSWORD;
  const adminGroup = process.env.ADMIN_REQUIRED_GROUP ?? 'admin';

  if (!userPoolId || !clientId || !username || !password) {
    throw new Error('Required env vars: SHARED_USER_POOL_ID, SHARED_USER_POOL_CLIENT_ID, CI_ADMIN_USERNAME, CI_ADMIN_PASSWORD');
  }

  const accessToken = await authenticateWithRetry({
    userPoolId,
    clientId,
    username,
    password,
    adminGroup
  });

  // Upsert the admin user in the database so route handlers can resolve the cognito sub
  const tokenPayload = JSON.parse(
    Buffer.from(accessToken.split('.')[1], 'base64url').toString()
  );
  const cognitoSub = tokenPayload.sub;

  const db = await createDbClient();
  await db.connect();
  try {
    await db.query(
      `INSERT INTO admin_users (cognito_sub, email, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (cognito_sub) DO UPDATE SET updated_at = now()`,
      [cognitoSub, username, `CI Admin (${username})`]
    );
  } finally {
    await db.end();
  }

  return { accessToken };
};

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const { mockClient, mockSend } = vi.hoisted(() => ({
  mockClient: {
    connect: vi.fn(),
    query: vi.fn(),
    end: vi.fn(),
  },
  mockSend: vi.fn(),
}));

vi.mock('../../scripts/db-client.mjs', () => ({
  createDbClient: vi.fn(() => mockClient),
}));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(() => ({ send: mockSend })),
  AdminCreateUserCommand: vi.fn((params: any) => ({ __type: 'AdminCreateUser', ...params })),
  AdminSetUserPasswordCommand: vi.fn((params: any) => ({ __type: 'AdminSetUserPassword', ...params })),
  AdminAddUserToGroupCommand: vi.fn((params: any) => ({ __type: 'AdminAddUserToGroup', ...params })),
  InitiateAuthCommand: vi.fn((params: any) => ({ __type: 'InitiateAuth', ...params })),
}));

import { handler } from '../../src/handlers/ci-auth-token.mjs';

// ─── Fixtures ───────────────────────────────────────────────────────────────

/** Minimal unsigned JWT whose payload carries the sub the handler decodes. */
function makeAccessToken(sub: string) {
  const payload = Buffer.from(JSON.stringify({ sub })).toString('base64url');
  return `header.${payload}.signature`;
}

/** Cognito's answer when it will not accept the credential we just set. */
function notAuthorized() {
  const err: any = new Error('Incorrect username or password.');
  err.name = 'NotAuthorizedException';
  return err;
}

function usernameExists() {
  const err: any = new Error('User account already exists');
  err.name = 'UsernameExistsException';
  return err;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SHARED_USER_POOL_ID = 'us-east-1_test';
  process.env.SHARED_USER_POOL_CLIENT_ID = 'test-client-id';
  process.env.CI_ADMIN_USERNAME = 'okra-ci-admin+staging@ogf.local';
  process.env.CI_ADMIN_PASSWORD = 'OgFdeadbeefcafe!9a';
  mockClient.connect.mockResolvedValue(undefined);
  mockClient.query.mockResolvedValue({ rows: [] });
  mockClient.end.mockResolvedValue(undefined);
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ci-auth-token handler', () => {
  it('returns a token on the first pass when Cognito accepts the credential', async () => {
    const token = makeAccessToken('sub-happy-path');
    mockSend.mockImplementation(async (command: any) => {
      if (command.__type === 'AdminCreateUser') throw usernameExists();
      if (command.__type === 'InitiateAuth') {
        return { AuthenticationResult: { AccessToken: token } };
      }
      return {};
    });

    await expect(handler()).resolves.toEqual({ accessToken: token });

    const authCalls = mockSend.mock.calls.filter(([c]: any) => c.__type === 'InitiateAuth');
    expect(authCalls).toHaveLength(1);
  });

  it('re-applies the password and retries when a parallel invocation moves it', async () => {
    // The Okra and Admin integration jobs mint from this function at the same
    // time, so an InitiateAuth can arrive mid password-rewrite and be refused.
    const token = makeAccessToken('sub-after-retry');
    let authAttempts = 0;

    mockSend.mockImplementation(async (command: any) => {
      if (command.__type === 'AdminCreateUser') throw usernameExists();
      if (command.__type === 'InitiateAuth') {
        authAttempts += 1;
        if (authAttempts === 1) throw notAuthorized();
        return { AuthenticationResult: { AccessToken: token } };
      }
      return {};
    });

    await expect(handler()).resolves.toEqual({ accessToken: token });
    expect(authAttempts).toBe(2);

    // The password must be set again before the second attempt, otherwise the
    // retry would just re-present a credential Cognito has already rejected.
    const setPasswordCalls = mockSend.mock.calls.filter(
      ([c]: any) => c.__type === 'AdminSetUserPassword'
    );
    expect(setPasswordCalls).toHaveLength(2);
  });

  it('does not retry an error that repeating cannot fix', async () => {
    const err: any = new Error('USER_PASSWORD_AUTH is not enabled for the client');
    err.name = 'InvalidParameterException';
    let authAttempts = 0;

    mockSend.mockImplementation(async (command: any) => {
      if (command.__type === 'AdminCreateUser') throw usernameExists();
      if (command.__type === 'InitiateAuth') {
        authAttempts += 1;
        throw err;
      }
      return {};
    });

    await expect(handler()).rejects.toThrow('USER_PASSWORD_AUTH is not enabled');
    expect(authAttempts).toBe(1);
  });

  it('records the authenticated sub so admin routes can resolve the CI user', async () => {
    const token = makeAccessToken('sub-persisted');
    mockSend.mockImplementation(async (command: any) => {
      if (command.__type === 'AdminCreateUser') throw usernameExists();
      if (command.__type === 'InitiateAuth') {
        return { AuthenticationResult: { AccessToken: token } };
      }
      return {};
    });

    await handler();

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    const [, params] = mockClient.query.mock.calls[0];
    expect(params[0]).toBe('sub-persisted');
    expect(params[1]).toBe('okra-ci-admin+staging@ogf.local');
    expect(mockClient.end).toHaveBeenCalledTimes(1);
  });
});

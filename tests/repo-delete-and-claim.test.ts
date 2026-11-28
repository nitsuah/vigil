import { describe, it, expect, vi } from 'vitest';
import { claimRepoGrant, isOwnNamespace, type RepoAccessDb } from '../lib/repo-access';

const respond = (status: number, body: unknown) =>
  vi.fn(async () => ({ status, json: async () => body })) as unknown as typeof fetch;

describe('claimRepoGrant', () => {
  it('grants access when the token has push access', async () => {
    const db = vi.fn(async () => []);
    await expect(claimRepoGrant(db as unknown as RepoAccessDb, 'octo/demo', '1', 't', respond(200, { permissions: { push: true } }))).resolves.toBe(true);
    expect(db).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['read-only access', respond(200, { permissions: { push: false } })],
    ['a repo the token cannot see', respond(404, {})],
  ])('refuses %s', async (_label, fetchImpl) => {
    const db = vi.fn(async () => []);
    await expect(claimRepoGrant(db as unknown as RepoAccessDb, 'octo/demo', '1', 't', fetchImpl)).resolves.toBe(false);
    expect(db).not.toHaveBeenCalled();
  });
});

describe('isOwnNamespace', () => {
  it('matches only the repo owner', async () => {
    await expect(isOwnNamespace('Octo/gone', 't', respond(200, { login: 'octo' }))).resolves.toBe(true);
    await expect(isOwnNamespace('other/gone', 't', respond(200, { login: 'octo' }))).resolves.toBe(false);
    await expect(isOwnNamespace('octo/gone', 't', respond(401, {}))).resolves.toBe(false);
  });
});

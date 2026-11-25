/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    parseGitHubError,
    getOAuthAuthorizationUrl,
    getOrgAuthInstructions,
    extractOrgName,
    type GitHubErrorDetails,
} from './github-errors';

describe('parseGitHubError', () => {
    it('returns oauth_restriction when message contains OAuth App access restrictions', () => {
        const error = new Error('OAuth App access restrictions');
        const result = parseGitHubError(error);
        expect(result.type).toBe('oauth_restriction');
        expect(result.actionable).toBe(true);
        expect(result.helpUrl).toMatch(/^https:\/\/github\.com\/settings\/connections\/applications\//);
    });

    it('returns oauth_restriction when message contains organization has enabled OAuth App access restrictions', () => {
        const error = new Error('The `acme` organization has enabled OAuth App access restrictions');
        const result = parseGitHubError(error);
        expect(result.type).toBe('oauth_restriction');
        expect(result.actionable).toBe(true);
        expect(result.helpUrl).toMatch(/^https:\/\/github\.com\/settings\/connections\/applications\//);
    });

    it('userMessage starts with org name when backticked org found in message', () => {
        const error = new Error('The `acme` organization has enabled OAuth App access restrictions');
        const result = parseGitHubError(error);
        expect(result.userMessage).toMatch(/^acme organization/);
    });

    it('userMessage starts with "this organization" when no backticked org in message', () => {
        const error = new Error('OAuth App access restrictions');
        const result = parseGitHubError(error);
        expect(result.userMessage).toMatch(/^this organization/);
    });

    it('returns permission_denied for Bad credentials', () => {
        const error = new Error('Bad credentials');
        const result = parseGitHubError(error);
        expect(result.type).toBe('permission_denied');
        expect(result.actionable).toBe(true);
    });

    it('returns permission_denied for Resource not accessible by integration', () => {
        const error = new Error('Resource not accessible by integration');
        const result = parseGitHubError(error);
        expect(result.type).toBe('permission_denied');
        expect(result.actionable).toBe(true);
    });

    it('returns not_found for Not Found with 404', () => {
        const error = new Error('Not Found (404)');
        const result = parseGitHubError(error);
        expect(result.type).toBe('not_found');
        expect(result.actionable).toBe(false);
    });

    it('returns rate_limit with helpUrl containing rate-limiting', () => {
        const error = new Error('API rate limit exceeded');
        const result = parseGitHubError(error);
        expect(result.type).toBe('rate_limit');
        expect(result.helpUrl).toContain('rate-limiting');
    });

    it('returns unknown for other errors', () => {
        const error = new Error('Some random error');
        const result = parseGitHubError(error);
        expect(result.type).toBe('unknown');
        expect(result.actionable).toBe(false);
    });

    it('returns unknown for non-Error input with userMessage including the input', () => {
        const result = parseGitHubError('boom');
        expect(result.type).toBe('unknown');
        expect(result.message).toBe('boom');
        expect(result.userMessage).toBe('An unexpected error occurred: boom');
    });
});

describe('getOAuthAuthorizationUrl', () => {
    const originalEnv = process.env.GITHUB_ID;

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.GITHUB_ID;
        } else {
            process.env.GITHUB_ID = originalEnv;
        }
    });

    it('returns URL with client ID when GITHUB_ID is set', () => {
        process.env.GITHUB_ID = 'abc123';
        const url = getOAuthAuthorizationUrl();
        expect(url).toBe('https://github.com/settings/connections/applications/abc123');
    });

    it('restores env var after test', () => {
        process.env.GITHUB_ID = 'abc123';
        getOAuthAuthorizationUrl();
        expect(process.env.GITHUB_ID).toBe('abc123');
    });
});

describe('getOrgAuthInstructions', () => {
    it('contains the org name, Vigil, and org settings URL', () => {
        const instructions = getOrgAuthInstructions('acme');
        expect(instructions).toContain('the acme organization');
        expect(instructions).toContain('Vigil');
        expect(instructions).toContain('https://github.com/organizations/acme/settings/oauth_application_policy');
    });

    it('uses custom app name when provided', () => {
        const instructions = getOrgAuthInstructions('acme', 'Other');
        expect(instructions).toContain('the acme organization');
        expect(instructions).toContain('Other');
        expect(instructions).not.toContain('Vigil');
    });
});

describe('extractOrgName', () => {
    it('returns org name for owner/repo format', () => {
        expect(extractOrgName('acme/repo')).toBe('acme');
    });

    it('returns null for single segment', () => {
        expect(extractOrgName('norepo')).toBeNull();
    });

    it('returns null for three segments', () => {
        expect(extractOrgName('a/b/c')).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(extractOrgName('')).toBeNull();
    });
});
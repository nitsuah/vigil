import { describe, it, expect } from 'vitest';
import { rulesetRulesToDetails, ProtectionRules, RulesetRule } from '@/lib/best-practices';

describe('rulesetRulesToDetails', () => {
    const makeRule = (type: string, parameters?: Record<string, unknown>): RulesetRule => ({ type, parameters });

    it('maps pull_request to required_pull_request_reviews with defaults', () => {
        const rules: RulesetRule[] = [makeRule('pull_request', { required_approving_review_count: 2, dismiss_stale_reviews_on_push: true, require_code_owner_review: true })];
        const out = rulesetRulesToDetails(rules);
        expect(out.required_pull_request_reviews).toEqual({
            required_approving_review_count: 2,
            dismiss_stale_reviews: true,
            require_code_owner_reviews: true,
        });
    });

    it('maps pull_request with missing parameters to defaults', () => {
        const rules: RulesetRule[] = [makeRule('pull_request', {})];
        const out = rulesetRulesToDetails(rules);
        expect(out.required_pull_request_reviews).toEqual({
            required_approving_review_count: 0,
            dismiss_stale_reviews: undefined,
            require_code_owner_reviews: undefined,
        });
    });

    it('maps required_status_checks with strict and filtered contexts', () => {
        const rules: RulesetRule[] = [makeRule('required_status_checks', {
            strict_required_status_checks_policy: true,
            required_status_checks: [{ context: 'ci/test' }, { context: '' }, { context: 'ci/lint' }],
        })];
        const out = rulesetRulesToDetails(rules);
        expect(out.required_status_checks).toEqual({
            strict: true,
            contexts: ['ci/test', 'ci/lint'],
        });
    });

    it('maps required_status_checks with missing strict to undefined', () => {
        const rules: RulesetRule[] = [makeRule('required_status_checks', { required_status_checks: [{ context: 'ci/test' }] })];
        const out = rulesetRulesToDetails(rules);
        expect(out.required_status_checks).toEqual({
            strict: undefined,
            contexts: ['ci/test'],
        });
    });

    it('sets required_signatures.enabled when rule exists', () => {
        const rules: RulesetRule[] = [makeRule('required_signatures')];
        const out = rulesetRulesToDetails(rules);
        expect(out.required_signatures).toEqual({ enabled: true });
    });

    it('sets required_linear_history.enabled when rule exists', () => {
        const rules: RulesetRule[] = [makeRule('required_linear_history')];
        const out = rulesetRulesToDetails(rules);
        expect(out.required_linear_history).toEqual({ enabled: true });
    });

    it('maps non_fast_forward to allow_force_pushes.enabled = false', () => {
        const rules: RulesetRule[] = [makeRule('non_fast_forward')];
        const out = rulesetRulesToDetails(rules);
        expect(out.allow_force_pushes).toEqual({ enabled: false });
    });

    it('maps deletion to allow_deletions.enabled = false', () => {
        const rules: RulesetRule[] = [makeRule('deletion')];
        const out = rulesetRulesToDetails(rules);
        expect(out.allow_deletions).toEqual({ enabled: false });
    });

    it('maps required_conversation_resolution from required_review_thread_resolution', () => {
        const rules: RulesetRule[] = [makeRule('required_conversation_resolution', { required_review_thread_resolution: true })];
        const out = rulesetRulesToDetails(rules);
        expect(out.required_conversation_resolution).toEqual({ enabled: true });
    });

    it('maps fork_sync parameters to allow_fork_syncing', () => {
        const rules: RulesetRule[] = [makeRule('fork_sync', { enabled: true })];
        const out = rulesetRulesToDetails(rules);
        expect(out.allow_fork_syncing).toEqual({ enabled: true });
    });

    it('leaves fields undefined for missing rules', () => {
        const rules: RulesetRule[] = [];
        const out = rulesetRulesToDetails(rules);
        expect(out.required_pull_request_reviews).toBeUndefined();
        expect(out.required_status_checks).toBeUndefined();
        expect(out.required_signatures).toBeUndefined();
        expect(out.required_linear_history).toBeUndefined();
        expect(out.required_conversation_resolution).toBeUndefined();
        expect(out.allow_force_pushes).toBeUndefined();
        expect(out.allow_deletions).toBeUndefined();
        expect(out.allow_fork_syncing).toBeUndefined();
        expect(out.lock_branch).toBeUndefined();
    });

    it('ignores unknown rule types', () => {
        const rules: RulesetRule[] = [makeRule('unknown_rule', { foo: 'bar' })];
        const out = rulesetRulesToDetails(rules);
        expect(Object.keys(out)).toHaveLength(0);
    });

    it('does not mutate input array or parameter objects', () => {
        const params = { required_approving_review_count: 1 };
        const rules: RulesetRule[] = [makeRule('pull_request', params)];
        const rulesCopy = [...rules];
        rulesetRulesToDetails(rules);
        expect(rules).toEqual(rulesCopy);
        expect(params).toEqual({ required_approving_review_count: 1 });
    });

    it('returns lock_branch as undefined (rulesets have no equivalent)', () => {
        const rules: RulesetRule[] = [makeRule('pull_request')];
        const out = rulesetRulesToDetails(rules);
        expect(out.lock_branch).toBeUndefined();
    });
});

describe('ProtectionRules type', () => {
    it('has all expected optional fields with correct shapes', () => {
        const pr: ProtectionRules = {
            required_pull_request_reviews: { required_approving_review_count: 1, dismiss_stale_reviews: true, require_code_owner_reviews: true },
            required_status_checks: { strict: true, contexts: ['ci/test'] },
            required_signatures: { enabled: true },
            required_linear_history: { enabled: true },
            required_conversation_resolution: { enabled: true },
            allow_force_pushes: { enabled: false },
            allow_deletions: { enabled: false },
            lock_branch: { enabled: false },
            allow_fork_syncing: { enabled: true },
        };
        expect(pr.required_pull_request_reviews?.required_approving_review_count).toBe(1);
        expect(pr.required_status_checks?.contexts).toContain('ci/test');
        expect(pr.required_signatures?.enabled).toBe(true);
        expect(pr.required_linear_history?.enabled).toBe(true);
        expect(pr.required_conversation_resolution?.enabled).toBe(true);
        expect(pr.allow_force_pushes?.enabled).toBe(false);
        expect(pr.allow_deletions?.enabled).toBe(false);
        expect(pr.lock_branch?.enabled).toBe(false);
        expect(pr.allow_fork_syncing?.enabled).toBe(true);
    });
});
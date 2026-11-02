import { describe, it, expect } from 'vitest';
import { mergeProtection, rulesetRulesToDetails, ProtectionRules, RulesetRule } from '@/lib/best-practices';

describe('rulesetRulesToDetails', () => {
    const makeRule = (type: string, parameters?: Record<string, unknown>): RulesetRule => ({ type, parameters });

    it('maps pull_request to required_pull_request_reviews', () => {
        const out = rulesetRulesToDetails([makeRule('pull_request', { required_approving_review_count: 2, dismiss_stale_reviews_on_push: true, require_code_owner_review: true })]);
        expect(out.required_pull_request_reviews).toEqual({ required_approving_review_count: 2, dismiss_stale_reviews: true, require_code_owner_reviews: true });
    });

    it('maps required_status_checks with strict and filtered contexts', () => {
        const out = rulesetRulesToDetails([makeRule('required_status_checks', { strict_required_status_checks_policy: true, required_status_checks: [{ context: 'ci/test' }, { context: '' }, { context: 'ci/lint' }] })]);
        expect(out.required_status_checks).toEqual({ strict: true, contexts: ['ci/test', 'ci/lint'] });
    });

    it('sets required_signatures.enabled when rule exists', () => {
        expect(rulesetRulesToDetails([makeRule('required_signatures')]).required_signatures).toEqual({ enabled: true });
    });

    it('sets required_linear_history.enabled when rule exists', () => {
        expect(rulesetRulesToDetails([makeRule('required_linear_history')]).required_linear_history).toEqual({ enabled: true });
    });

    it('maps non_fast_forward to allow_force_pushes.enabled = false', () => {
        expect(rulesetRulesToDetails([makeRule('non_fast_forward')]).allow_force_pushes).toEqual({ enabled: false });
    });

    it('maps deletion to allow_deletions.enabled = false', () => {
        expect(rulesetRulesToDetails([makeRule('deletion')]).allow_deletions).toEqual({ enabled: false });
    });

    it('maps required_conversation_resolution from required_review_thread_resolution', () => {
        expect(rulesetRulesToDetails([makeRule('required_conversation_resolution', { required_review_thread_resolution: true })]).required_conversation_resolution).toEqual({ enabled: true });
    });

    it('maps fork_sync parameters to allow_fork_syncing', () => {
        expect(rulesetRulesToDetails([makeRule('fork_sync', { enabled: true })]).allow_fork_syncing).toEqual({ enabled: true });
    });

    it('leaves fields undefined for missing rules', () => {
        const out = rulesetRulesToDetails([]);
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
        expect(Object.keys(rulesetRulesToDetails([makeRule('unknown_rule', { foo: 'bar' })])).length).toBe(0);
    });

    it('does not mutate input array or parameter objects', () => {
        const params = { required_approving_review_count: 1 };
        const rules: RulesetRule[] = [makeRule('pull_request', params)];
        const rulesCopy = [...rules];
        rulesetRulesToDetails(rules);
        expect(rules).toEqual(rulesCopy);
        expect(params).toEqual({ required_approving_review_count: 1 });
    });

    it('returns lock_branch as undefined', () => {
        expect(rulesetRulesToDetails([makeRule('pull_request')]).lock_branch).toBeUndefined();
    });
});

describe('mergeProtection', () => {
    it('merges required controls with OR and uses the maximum review count', () => {
        const classic: ProtectionRules = {
            required_pull_request_reviews: {
                required_approving_review_count: 1,
                dismiss_stale_reviews: false,
                require_code_owner_reviews: true,
            },
            required_status_checks: {
                strict: false,
                contexts: ['ci/test', 'ci/lint'],
            },
            required_signatures: { enabled: false },
            required_linear_history: { enabled: true },
            required_conversation_resolution: { enabled: false },
            allow_force_pushes: { enabled: true },
            allow_deletions: { enabled: false },
            allow_fork_syncing: { enabled: true },
            lock_branch: { enabled: true },
        };
        const ruleset: ProtectionRules = {
            required_pull_request_reviews: {
                required_approving_review_count: 2,
                dismiss_stale_reviews: true,
                require_code_owner_reviews: false,
            },
            required_status_checks: {
                strict: true,
                contexts: ['ci/lint', 'codeql'],
            },
            required_signatures: { enabled: true },
            required_linear_history: { enabled: false },
            required_conversation_resolution: { enabled: true },
            allow_force_pushes: { enabled: false },
            allow_deletions: { enabled: true },
            allow_fork_syncing: { enabled: false },
            lock_branch: { enabled: false },
        };

        expect(mergeProtection(classic, ruleset)).toEqual({
            required_pull_request_reviews: {
                required_approving_review_count: 2,
                dismiss_stale_reviews: true,
                require_code_owner_reviews: true,
            },
            required_status_checks: {
                strict: true,
                contexts: ['ci/test', 'ci/lint', 'codeql'],
            },
            required_signatures: { enabled: true },
            required_linear_history: { enabled: true },
            required_conversation_resolution: { enabled: true },
            allow_force_pushes: { enabled: false },
            allow_deletions: { enabled: false },
            allow_fork_syncing: { enabled: false },
            lock_branch: { enabled: true },
        });
    });

    it('preserves classic-only and ruleset-only controls', () => {
        const classic: ProtectionRules = {
            allow_force_pushes: { enabled: true },
            lock_branch: { enabled: true },
        };
        const ruleset: ProtectionRules = {
            required_signatures: { enabled: true },
            allow_deletions: { enabled: false },
        };

        expect(mergeProtection(classic, null)).toEqual(classic);
        expect(mergeProtection(null, ruleset)).toEqual(ruleset);
    });

    it('returns null only when both sources are absent', () => {
        expect(mergeProtection(null, undefined)).toBeNull();
        expect(mergeProtection({}, null)).toEqual({});
    });

    it('treats an absent allowance source as neutral', () => {
        expect(
            mergeProtection({ allow_force_pushes: { enabled: true } }, {}),
        ).toEqual({ allow_force_pushes: { enabled: true } });
        expect(
            mergeProtection({}, { allow_deletions: { enabled: false } }),
        ).toEqual({ allow_deletions: { enabled: false } });
    });

    it('does not mutate either input or nested arrays', () => {
        const classic: ProtectionRules = {
            required_status_checks: { strict: false, contexts: ['ci/test'] },
            allow_force_pushes: { enabled: true },
        };
        const ruleset: ProtectionRules = {
            required_status_checks: { strict: true, contexts: ['codeql'] },
            allow_force_pushes: { enabled: false },
        };
        const classicCopy = JSON.parse(JSON.stringify(classic));
        const rulesetCopy = JSON.parse(JSON.stringify(ruleset));

        mergeProtection(classic, ruleset);

        expect(classic).toEqual(classicCopy);
        expect(ruleset).toEqual(rulesetCopy);
    });
});

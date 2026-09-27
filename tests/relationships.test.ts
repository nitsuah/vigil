import { describe, it, expect } from 'vitest';
import { parseRelationshipInput, resolveEndpoint, RelationshipValidationError } from '@/lib/relationships';

const known = [
    { name: 'agent-board', full_name: 'nitsuah/agent-board' },
    { name: 'site', full_name: 'Nitsuah-Labs/site' },
    { name: 'site', full_name: 'nitsuah/site' },
];

const base = {
    source: 'agent-board',
    target: 'nitsuah/bb-mcp',
    kind: 'calls',
    context: 'Posts chat turns to the bb-mcp server over HTTP',
};

describe('resolveEndpoint', () => {
    it('resolves a unique tracked short name to lower-case owner/repo', () => {
        expect(resolveEndpoint('Agent-Board', known, 'source')).toBe('nitsuah/agent-board');
    });

    it('accepts an untracked owner/repo and a GitHub URL', () => {
        expect(resolveEndpoint('Nitsuah/BB-MCP', known, 'target')).toBe('nitsuah/bb-mcp');
        expect(resolveEndpoint('https://github.com/nitsuah/bb-mcp/', known, 'target')).toBe('nitsuah/bb-mcp');
    });

    it('rejects ambiguous and unknown short names rather than guessing', () => {
        expect(() => resolveEndpoint('site', known, 'target')).toThrow(/ambiguous/);
        expect(() => resolveEndpoint('bb-mcp', known, 'target')).toThrow(/not a tracked repo/);
    });

    it('rejects malformed names', () => {
        expect(() => resolveEndpoint('a/b/c', known, 'target')).toThrow(RelationshipValidationError);
        expect(() => resolveEndpoint('', known, 'target')).toThrow(/required/);
    });
});

describe('parseRelationshipInput', () => {
    it('normalizes a valid edge; evidence is optional for people', () => {
        expect(parseRelationshipInput(base, known)).toEqual({
            source: 'nitsuah/agent-board', target: 'nitsuah/bb-mcp', kind: 'calls',
            context: base.context, evidence: null,
        });
    });

    it('requires evidence for agent proposals', () => {
        expect(() => parseRelationshipInput(base, known, { requireEvidence: true })).toThrow(/evidence/);
        expect(parseRelationshipInput({ ...base, evidence: ' src/mcp.ts ' }, known, { requireEvidence: true }).evidence)
            .toBe('src/mcp.ts');
    });

    it('rejects kinds outside the vocabulary (no "same language" edges)', () => {
        expect(() => parseRelationshipInput({ ...base, kind: 'same_language' }, known)).toThrow(/kind must be one of/);
    });

    it('rejects a context too short to carry meaning, and self-edges', () => {
        expect(() => parseRelationshipInput({ ...base, context: 'uses it' }, known)).toThrow(/context/);
        expect(() => parseRelationshipInput({ ...base, target: 'nitsuah/agent-board' }, known)).toThrow(/differ/);
    });
});

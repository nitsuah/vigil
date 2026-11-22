import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gitInspectArgs } from '@/lib/showcase';

describe('gitInspectArgs', () => {
    it('keeps git ownership checks on and disables helper launches by default', () => {
        const args = gitInspectArgs('/work/repo', {});
        expect(args.join(' ')).not.toContain('safe.directory');
        expect(args).toContain('--no-pager');
        expect(args).toContain('core.fsmonitor=false');
        expect(args).toContain('log.showSignature=false');
        expect(args.slice(-2)).toEqual(['-C', '/work/repo']);
    });

    it('trusts only the named directory, and only when explicitly opted in', () => {
        const args = gitInspectArgs('/work/repo', { SHOWCASE_TRUST_REPO: '1' });
        expect(args).toContain('safe.directory=/work/repo');
        expect(args.join(' ')).not.toContain('safe.directory=*');
        expect(gitInspectArgs('/work/repo', { SHOWCASE_TRUST_REPO: 'yes' }).join(' ')).not.toContain('safe.directory');
    });
});

describe('scripts/showcase.ts git calls', () => {
    const src = readFileSync('scripts/showcase.ts', 'utf8');

    it('never passes a blanket safe.directory and skips signature verification on the date lookup', () => {
        expect(src).not.toContain('safe.directory=*');
        expect(src).toContain('--no-show-signature');
    });
});

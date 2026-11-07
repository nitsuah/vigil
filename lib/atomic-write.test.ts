import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertParentInside, ensureDirInside, writeAtomic } from './atomic-write';

const dirs: string[] = [];
const tmpDir = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-'));
    dirs.push(d);
    return d;
};
afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('writeAtomic', () => {
    it('writes the content and leaves no temp files behind', () => {
        const d = tmpDir();
        const f = path.join(d, 'out.json');
        writeAtomic(f, 'hello');
        expect(fs.readFileSync(f, 'utf8')).toBe('hello');
        expect(fs.readdirSync(d)).toEqual(['out.json']);
    });

    it('replaces an existing destination file', () => {
        const d = tmpDir();
        const f = path.join(d, 'out.json');
        fs.writeFileSync(f, 'old');
        writeAtomic(f, 'new');
        expect(fs.readFileSync(f, 'utf8')).toBe('new');
    });

    it('does not write through a symlink planted at the old predictable temp name', () => {
        const d = tmpDir();
        const victim = path.join(d, 'victim.txt');
        fs.writeFileSync(victim, 'keep me');
        const f = path.join(d, 'out.json');
        fs.symlinkSync(victim, path.join(d, `.out.json.${process.pid}.tmp`));
        writeAtomic(f, 'payload');
        expect(fs.readFileSync(victim, 'utf8')).toBe('keep me');
        expect(fs.readFileSync(f, 'utf8')).toBe('payload');
    });

    it('cleans up the temp file when the rename fails', () => {
        const d = tmpDir();
        const target = path.join(d, 'adir');
        fs.mkdirSync(target);
        fs.writeFileSync(path.join(target, 'x'), '1'); // non-empty directory cannot be replaced by a file
        expect(() => writeAtomic(target, 'data')).toThrow();
        expect(fs.readdirSync(d)).toEqual(['adir']);
    });
});

describe('ensureDirInside', () => {
    it('creates a plain directory and returns its real path', () => {
        const d = tmpDir();
        const out = ensureDirInside(d, 'promo');
        expect(out).toBe(path.join(fs.realpathSync(d), 'promo'));
        expect(fs.statSync(out).isDirectory()).toBe(true);
    });

    it('refuses a symlinked directory and writes nothing outside', () => {
        const d = tmpDir();
        const outside = tmpDir();
        fs.symlinkSync(outside, path.join(d, 'promo'), 'dir');
        expect(() => ensureDirInside(d, 'promo')).toThrow(/refusing/);
        expect(fs.readdirSync(outside)).toEqual([]);
    });

    it('refuses a non-directory entry', () => {
        const d = tmpDir();
        fs.writeFileSync(path.join(d, 'promo'), 'x');
        expect(() => ensureDirInside(d, 'promo')).toThrow(/refusing/);
    });

    it('refuses when an ancestor symlink redirects the parent', () => {
        const d = tmpDir();
        const outside = tmpDir();
        fs.symlinkSync(outside, path.join(d, 'site'), 'dir');
        expect(() => assertParentInside(d, path.join(d, 'site', 'index.html'))).toThrow(/refusing/);
    });

    it('never creates directories below a symlinked ancestor', () => {
        const d = tmpDir();
        const outside = tmpDir();
        fs.symlinkSync(outside, path.join(d, 'a'), 'dir');
        expect(() => ensureDirInside(d, 'a/b/promo')).toThrow(/refusing/);
        expect(fs.readdirSync(outside)).toEqual([]);
    });

    it('creates nested directories inside the root', () => {
        const d = tmpDir();
        const out = ensureDirInside(d, 'a/b/promo');
        expect(out).toBe(path.join(fs.realpathSync(d), 'a', 'b', 'promo'));
    });
});

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dirs: string[] = [];
const tmpDir = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'showcase-'));
    dirs.push(d);
    return d;
};
afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const script = path.resolve(__dirname, '../scripts/showcase.ts');
const apply = (repo: string) =>
    spawnSync(process.execPath, ['--import', 'tsx', script, 'apply', repo], { encoding: 'utf8', cwd: path.resolve(__dirname, '..') });

const makeRepo = () => {
    const d = tmpDir();
    fs.writeFileSync(path.join(d, 'FEATURES.md'), '# Features\n\n## Core\n- **Alpha** - does a thing\n');
    return d;
};

describe('showcase apply output dir', () => {
    it('writes promo/spots.json in a normal checkout', () => {
        const repo = makeRepo();
        const r = apply(repo);
        expect(r.status ?? 0).toBe(0);
        expect(fs.existsSync(path.join(repo, 'promo', 'spots.json'))).toBe(true);
    });

    it('refuses a symlinked promo dir and writes nothing outside', () => {
        const repo = makeRepo();
        const outside = tmpDir();
        fs.symlinkSync(outside, path.join(repo, 'promo'), 'dir');
        const r = apply(repo);
        expect(r.status).toBe(2);
        expect(r.stderr).toMatch(/refusing/);
        expect(fs.readdirSync(outside)).toEqual([]);
    });

    it('reports files already written when a later write is refused', () => {
        const repo = makeRepo();
        fs.mkdirSync(path.join(repo, 'docs'));
        fs.writeFileSync(path.join(repo, 'docs', 'index.html'), '<html><head></head><body>x</body></html>');
        const outside = tmpDir();
        fs.symlinkSync(outside, path.join(repo, 'promo'), 'dir');
        const r = apply(repo);
        expect(r.status).toBe(2);
        expect(r.stdout).toContain('written before the error');
        expect(r.stdout).toContain('docs/index.html');
        expect(fs.readdirSync(outside)).toEqual([]);
    });

    it('refuses a manifest symlinked to another file inside the checkout', () => {
        const repo = makeRepo();
        fs.mkdirSync(path.join(repo, 'promo'));
        const real = path.join(repo, 'promo', 'real.json');
        fs.writeFileSync(real, '{"product":"x","features":[],"spots":[]}');
        fs.symlinkSync(real, path.join(repo, 'promo', 'spots.json'), 'file');
        const r = apply(repo);
        expect(r.status).toBe(2);
        expect(r.stderr).toMatch(/refusing/);
        expect(fs.lstatSync(path.join(repo, 'promo', 'spots.json')).isSymbolicLink()).toBe(true);
    });

    it('stops on a manifest that is not a plain file instead of treating it as missing', () => {
        const repo = makeRepo();
        fs.mkdirSync(path.join(repo, 'promo', 'spots.json'), { recursive: true });
        const r = apply(repo);
        expect(r.status).toBe(2);
        expect(r.stderr).toMatch(/refusing/);
    });

    it('refuses a symlinked manifest and leaves its target alone', () => {
        const repo = makeRepo();
        const outside = tmpDir();
        const target = path.join(outside, 'spots.json');
        fs.writeFileSync(target, '{"product":"x","features":[],"spots":[]}');
        fs.mkdirSync(path.join(repo, 'promo'));
        fs.symlinkSync(target, path.join(repo, 'promo', 'spots.json'), 'file');
        const r = apply(repo);
        expect(r.status).toBe(2);
        expect(r.stderr).toMatch(/refusing/);
        expect(fs.readFileSync(target, 'utf8')).toBe('{"product":"x","features":[],"spots":[]}');
        expect(fs.lstatSync(path.join(repo, 'promo', 'spots.json')).isSymbolicLink()).toBe(true);
    });
});

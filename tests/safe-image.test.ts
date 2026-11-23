import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isAllowedImageSrc, ALLOWED_IMAGE_HOSTS } from '@/lib/safe-image';

describe('isAllowedImageSrc', () => {
    it('allows https images on allowlisted hosts', () => {
        for (const src of [
            'https://img.shields.io/badge/a-b-green',
            'https://github.com/o/r/actions/workflows/ci.yml/badge.svg',
            'https://raw.githubusercontent.com/o/r/main/a.png',
            'https://avatars.githubusercontent.com/u/1',
            'https://user-images.githubusercontent.com/1/a.png',
        ]) expect(isAllowedImageSrc(src), src).toBe(true);
    });

    it('rejects other hosts, schemes, relative and malformed values', () => {
        for (const src of [
            'https://attacker.example/pixel.png?d=secret',
            'http://img.shields.io/badge/a-b-green',
            'https://img.shields.io.attacker.example/a.png',
            'https://attacker.example/.githubusercontent.com',
            'https://user:pw@github.com/a.png',
            'https://evilgithubusercontent.com/a.png',
            'data:image/png;base64,AAAA',
            '//attacker.example/a.png',
            '/relative.png',
            'javascript:alert(1)',
            '',
            undefined,
            null,
            'https://github.com/' + 'a'.repeat(3000),
        ]) expect(isAllowedImageSrc(src), String(src)).toBe(false);
    });
});

describe('netlify.toml img-src policy', () => {
    const toml = readFileSync('netlify.toml', 'utf8');
    const policy = toml.match(/Content-Security-Policy = "([^"]+)"/)?.[1] ?? '';

    it('restricts images and lists every allowlisted host', () => {
        expect(policy.startsWith("img-src 'self'")).toBe(true);
        for (const host of ALLOWED_IMAGE_HOSTS) expect(policy).toContain(`https://${host}`);
        expect(policy).toContain('https://*.githubusercontent.com');
    });
});

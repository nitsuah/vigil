/**
 * Allowlist for images rendered from generated or repository-sourced markdown.
 *
 * Only https URLs on these hosts are loaded; anything else (other hosts, http,
 * data:, relative paths) is shown as its alt text. The same list is mirrored in
 * the `img-src` Content-Security-Policy header in netlify.toml (a test keeps
 * the two in sync).
 */

export const ALLOWED_IMAGE_HOSTS = [
    'img.shields.io',
    'github.com',
    'raw.githubusercontent.com',
    'api.netlify.com',
    'codecov.io',
] as const;

/** Any subdomain of these is allowed too (avatars, user-images, camo, ...). */
export const ALLOWED_IMAGE_HOST_SUFFIXES = ['.githubusercontent.com'] as const;

export function isAllowedImageSrc(src: unknown): src is string {
    if (typeof src !== 'string' || src.length === 0 || src.length > 2048) return false;
    let url: URL;
    try {
        url = new URL(src);
    } catch {
        return false;
    }
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return (
        (ALLOWED_IMAGE_HOSTS as readonly string[]).includes(host) ||
        ALLOWED_IMAGE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
    );
}

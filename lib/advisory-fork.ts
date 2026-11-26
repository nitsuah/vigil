/**
 * GitHub names the temporary private fork it creates for a security advisory
 * `<repo>-ghsa-xxxx-xxxx-xxxx`. It has no delivery work of its own, goes away
 * when the advisory closes, and its name identifies the advisory, so vigil
 * does not sync it.
 */
export function isAdvisoryFork(fullName: string): boolean {
    return /-ghsa(?:-[a-z0-9]{4}){3}$/i.test(fullName);
}

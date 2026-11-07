import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Write via a temp file and rename, so an interrupted run never leaves a truncated file.
 * The temp file is created exclusively ('wx') with an unpredictable name, so a pre-existing
 * file or symlink at that path is refused instead of being followed and truncated.
 */
export function writeAtomic(file: string, content: string): void {
    const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
    const fd = fs.openSync(tmp, 'wx', 0o644);
    try {
        fs.writeSync(fd, content);
    } finally {
        fs.closeSync(fd);
    }
    try {
        fs.renameSync(tmp, file);
    } catch (e) {
        fs.rmSync(tmp, { force: true });
        throw e;
    }
}

/**
 * Create (if needed) and return the real path of `<root>/<rel>`, refusing a symlinked or
 * non-directory entry so writes stay inside the checkout.
 */
export function ensureDirInside(root: string, rel: string): string {
    const dir = path.join(root, rel);
    let st: fs.Stats | null = null;
    try {
        st = fs.lstatSync(dir);
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    if (st && (st.isSymbolicLink() || !st.isDirectory())) {
        throw new Error(`refusing to write: ${rel} is not a plain directory`);
    }
    fs.mkdirSync(dir, { recursive: true });
    const realRoot = fs.realpathSync(root);
    const realDir = fs.realpathSync(dir);
    if (realDir === realRoot || !realDir.startsWith(realRoot + path.sep)) {
        throw new Error(`refusing to write: ${rel} resolves outside the repo`);
    }
    return realDir;
}

/** Throw unless `file`'s parent directory resolves inside `root`. */
export function assertParentInside(root: string, file: string): void {
    const realRoot = fs.realpathSync(root);
    const realParent = fs.realpathSync(path.dirname(file));
    if (realParent !== realRoot && !realParent.startsWith(realRoot + path.sep)) {
        throw new Error(`refusing to write: ${path.relative(root, file)} resolves outside the repo`);
    }
}

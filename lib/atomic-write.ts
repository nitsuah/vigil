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
    const realRoot = fs.realpathSync(root);
    // Resolve the deepest ancestor that already exists before creating anything below it.
    let existing = dir;
    for (;;) {
        let st: fs.Stats | null = null;
        try {
            st = fs.lstatSync(existing);
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        }
        if (st) {
            if (existing === dir && (st.isSymbolicLink() || !st.isDirectory())) {
                throw new Error(`refusing to write: ${rel} is not a plain directory`);
            }
            break;
        }
        existing = path.dirname(existing);
    }
    const fromRoot = path.relative(realRoot, fs.realpathSync(existing));
    if (fromRoot === '..' || fromRoot.startsWith('..' + path.sep) || path.isAbsolute(fromRoot)) {
        throw new Error(`refusing to write: ${rel} resolves outside the repo`);
    }
    fs.mkdirSync(dir, { recursive: true });
    const realDir = fs.realpathSync(dir);
    const relDir = path.relative(realRoot, realDir);
    if (relDir === '' || relDir === '..' || relDir.startsWith('..' + path.sep) || path.isAbsolute(relDir)) {
        throw new Error(`refusing to write: ${rel} resolves outside the repo`);
    }
    return realDir;
}

/**
 * Throw unless `file`'s parent directory resolves inside `root`.
 * Returns that resolved parent so callers can write into the directory that was checked.
 */
export function assertParentInside(root: string, file: string): string {
    const realParent = fs.realpathSync(path.dirname(file));
    const relParent = path.relative(fs.realpathSync(root), realParent);
    if (relParent === '..' || relParent.startsWith('..' + path.sep) || path.isAbsolute(relParent)) {
        throw new Error(`refusing to write: ${path.relative(root, file)} resolves outside the repo`);
    }
    return realParent;
}

/**
 * Read `<root>/<rel>` as text, refusing a symlink, a non-file, or anything whose real path
 * is outside `root`. A missing file throws ENOENT, as readFileSync does.
 */
export function readFileInside(root: string, rel: string): string {
    const file = path.join(root, rel);
    const st = fs.lstatSync(file);
    if (st.isSymbolicLink() || !st.isFile()) {
        throw new Error(`refusing to read: ${rel} is not a plain file`);
    }
    const realFile = fs.realpathSync(file);
    const relFile = path.relative(fs.realpathSync(root), realFile);
    if (relFile === '' || relFile === '..' || relFile.startsWith('..' + path.sep) || path.isAbsolute(relFile)) {
        throw new Error(`refusing to read: ${rel} resolves outside the repo`);
    }
    // Open the resolved path without following links, and read only if it is the file that was checked.
    const fd = fs.openSync(realFile, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try {
        const opened = fs.fstatSync(fd);
        if (!opened.isFile() || opened.ino !== st.ino || opened.dev !== st.dev) {
            throw new Error(`refusing to read: ${rel} changed while it was being checked`);
        }
        return fs.readFileSync(fd, 'utf8');
    } finally {
        fs.closeSync(fd);
    }
}

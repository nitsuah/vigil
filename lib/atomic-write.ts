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

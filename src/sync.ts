import fs from 'fs';
import path from 'path';
import * as p from '@clack/prompts';
import color from 'picocolors';

/**
 * Ensures the destination directory exists.
 */
export function ensureDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Copies the contents of the source directory to the destination directory.
 * Safely merges if files exist.
 */
function copyDir(src: string, dest: string) {
    if (!fs.existsSync(src)) return;
    ensureDir(dest);

    try {
        // Use fs.cpSync for robust recursive copying (Node 16.7+)
        fs.cpSync(src, dest, {
            recursive: true,
            force: true,
            preserveTimestamps: true
        });
    } catch (error: any) {
        if (error.code === 'EPERM' || error.code === 'EBUSY') {
            throw new Error(`Permission denied or file busy. Close your AI tools (Cursor, Claude, etc.) and try again.`);
        }
        throw error;
    }
}

/**
 * Performs a safe sync by copying contents to the hub, backing up the original, and creating a junction.
 */
export async function safeSyncFolder(toolName: string, originalPath: string, hubPath: string) {
    try {
        const stats = fs.lstatSync(originalPath);

        // If it's already a symbolic link or junction, and it points to the hub, skip it.
        if (stats.isSymbolicLink()) {
            const target = fs.readlinkSync(originalPath);
            if (path.resolve(target) === path.resolve(hubPath)) {
                p.note(`Link already configured correctly.`, `Skipping ${toolName}`);
                return;
            }
        }

        // Step 1: Copy to Hub (merging)
        p.log.step(`Merging ${color.cyan(toolName)} skills into Hub...`);
        copyDir(originalPath, hubPath);

        try {
            // Step 2: Backup original
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = `${originalPath}.backup_${timestamp}`;
            p.log.step(`Backing up original to ${color.dim(backupPath)}...`);
            fs.renameSync(originalPath, backupPath);

            // Step 3: Create Junction (Windows) or Symlink (macOS/Linux)
            p.log.step(`Creating symbolic link...`);
            const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';

            // Ensure parent dir exists before symlinking
            ensureDir(path.dirname(originalPath));
            fs.symlinkSync(hubPath, originalPath, symlinkType);

            p.log.success(color.green(`Successfully synced ${toolName} to Hub!`));
        } catch (error: any) {
            if (error.code === 'EPERM' || error.code === 'EBUSY') {
                p.log.error(color.red(`\nPermission Denied: Could not backup or link ${toolName}.`));
                p.log.info(color.yellow(`Please completely CLOSE ${toolName} (and any VS Code/Cursor windows) then try again.`));
            } else {
                p.log.error(`Failed to sync ${toolName}: ${error.message}`);
            }
        }
    } catch (error: any) {
        p.log.error(`Generic Error syncing ${toolName}: ${error.message}`);
    }
}

/**
 * Scans directories and returns a unique list of skill folder/file names.
 */
export function getSkillsOverview(paths: string[]): string[] {
    const skills = new Set<string>();
    for (const dirPath of paths) {
        if (fs.existsSync(dirPath)) {
            try {
                const files = fs.readdirSync(dirPath);
                // Filter out backups to avoid cluttering the overview
                files.filter(f => !f.includes('.backup_')).forEach(f => skills.add(f));
            } catch (error: any) {
                p.log.warn(`Could not read items in ${dirPath}: ${error.message}`);
            }
        }
    }
    return Array.from(skills).sort();
}

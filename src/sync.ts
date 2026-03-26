import fs from 'fs';
import path from 'path';

/**
 * Ensure the directory exists.
 */
export function ensureDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Read the skill entry names from a directory.
 */
export function getSkillEntries(dirPath: string): string[] {
    if (!isExistingDirectory(dirPath)) {
        return [];
    }

    return fs.readdirSync(dirPath).filter(item => {
        if (item.includes('.backup_')) {
            return false;
        }

        return isExistingDirectory(path.join(dirPath, item));
    });
}

/**
 * Aggregate skill names from multiple directories.
 */
export function getSkillsOverview(paths: string[]): string[] {
    const skills = new Set<string>();

    for (const dirPath of paths) {
        for (const skillName of getSkillEntries(dirPath)) {
            skills.add(skillName);
        }
    }

    return Array.from(skills).sort();
}

/**
 * Copy a single skill into the Skills Hub.
 * The original skill directory is preserved.
 */
export function copySkillToHub(sourcePath: string, hubPath: string) {
    if (!isExistingDirectory(sourcePath)) {
        return;
    }

    ensureDir(hubPath);

    const skillName = path.basename(sourcePath);
    const targetPath = path.join(hubPath, skillName);
    const realSourcePath = resolveRealPath(sourcePath) ?? sourcePath;

    if (path.resolve(realSourcePath) === path.resolve(targetPath)) {
        return;
    }

    removeEntry(targetPath);
    copyEntry(realSourcePath, targetPath);
}

/**
 * Sync the selected Hub skills to the target agent skills directory.
 * If a skill with the same name already exists in the target, remove it first and then recreate the symlink.
 */
export function syncHubSkillsToAgent(toolName: string, hubPath: string, skillNames: string[], targetSkillsDir: string) {
    if (path.resolve(hubPath) === path.resolve(targetSkillsDir)) {
        throw new Error(`${toolName} sync failed: target skills directory cannot be the same as the Skills Hub.`);
    }

    ensureDir(targetSkillsDir);

    for (const skillName of skillNames) {
        const sourcePath = path.join(hubPath, skillName);
        if (!pathExists(sourcePath)) {
            throw new Error(`${toolName} sync failed: skill "${skillName}" does not exist in the Hub.`);
        }

        if (!isExistingDirectory(sourcePath)) {
            continue;
        }

        const targetPath = path.join(targetSkillsDir, skillName);
        if (path.resolve(sourcePath) === path.resolve(targetPath)) {
            continue;
        }

        removeEntry(targetPath);
        fs.symlinkSync(sourcePath, targetPath, getSymlinkType(sourcePath));
    }
}

/**
 * Backward-compatible API: sync all current Hub skills to the target directory.
 */
export async function safeSyncFolder(toolName: string, originalPath: string, hubPath: string) {
    syncHubSkillsToAgent(toolName, hubPath, getSkillEntries(hubPath), originalPath);
}

function copyEntry(sourcePath: string, targetPath: string) {
    fs.cpSync(sourcePath, targetPath, {
        recursive: true,
        force: true,
        preserveTimestamps: true,
        dereference: true,
    });
}

function removeEntry(targetPath: string) {
    if (!pathExists(targetPath)) {
        return;
    }

    fs.rmSync(targetPath, { recursive: true, force: true });
}

function pathExists(targetPath: string): boolean {
    try {
        fs.lstatSync(targetPath);
        return true;
    } catch {
        return false;
    }
}

function isExistingDirectory(dirPath: string): boolean {
    try {
        return fs.statSync(dirPath).isDirectory();
    } catch {
        return false;
    }
}

function resolveRealPath(targetPath: string): string | null {
    try {
        return fs.realpathSync.native(targetPath);
    } catch {
        return null;
    }
}

function getSymlinkType(targetPath: string): 'junction' | 'dir' | 'file' {
    if (process.platform === 'win32') {
        return 'junction';
    }

    return 'dir';
}

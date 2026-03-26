import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
    copySkillToHub,
    ensureDir,
    getSkillEntries,
    getSkillsOverview,
    safeSyncFolder,
    syncHubSkillsToAgent
} from '../sync';

describe('sync file operations', () => {
    const testDir = path.join(os.tmpdir(), 'skillhubs-test-' + Date.now());
    const hubDir = path.join(testDir, 'hub');
    const sourceDir = path.join(testDir, 'source');
    const targetSkillsDir = path.join(testDir, 'target-skills');

    beforeEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }

        ensureDir(testDir);
        ensureDir(hubDir);
        ensureDir(sourceDir);
        ensureDir(targetSkillsDir);
    });

    afterEach(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('ensureDir creates directories', () => {
        const newDir = path.join(testDir, 'ensure-me');
        ensureDir(newDir);
        expect(fs.existsSync(newDir)).toBe(true);
    });

    it('getSkillEntries returns only directory-based skills and ignores single files', () => {
        createSkillDir(sourceDir, 'skill-alpha', 'alpha');
        fs.writeFileSync(path.join(sourceDir, 'single-file.txt'), 'ignore-me');

        expect(getSkillEntries(sourceDir).sort()).toEqual(['skill-alpha']);
    });

    it('getSkillsOverview aggregates unique skill names across multiple directories', () => {
        const anotherSourceDir = path.join(testDir, 'source-b');
        ensureDir(anotherSourceDir);

        createSkillDir(sourceDir, 'skill-alpha', 'alpha');
        createSkillDir(sourceDir, 'skill-beta', 'beta');
        createSkillDir(anotherSourceDir, 'skill-beta', 'beta-2');
        createSkillDir(anotherSourceDir, 'skill-gamma', 'gamma');

        expect(getSkillsOverview([sourceDir, anotherSourceDir])).toEqual([
            'skill-alpha',
            'skill-beta',
            'skill-gamma',
        ]);
    });

    it('copySkillToHub copies directory-based skills and preserves the source directory', () => {
        const sourceSkillPath = createSkillDir(sourceDir, 'skill-alpha', 'alpha');

        copySkillToHub(sourceSkillPath, hubDir);

        expect(fs.existsSync(path.join(hubDir, 'skill-alpha'))).toBe(true);
        expect(readSkillFile(path.join(hubDir, 'skill-alpha'))).toBe('alpha');
        expect(readSkillFile(sourceSkillPath)).toBe('alpha');
    });

    it('copySkillToHub ignores single-file skills', () => {
        const singleFilePath = path.join(sourceDir, 'single-file.txt');
        fs.writeFileSync(singleFilePath, 'ignore-me');

        copySkillToHub(singleFilePath, hubDir);

        expect(fs.existsSync(path.join(hubDir, 'single-file.txt'))).toBe(false);
    });

    it('copySkillToHub overwrites existing Hub directories with the same name', () => {
        createSkillDir(hubDir, 'skill-alpha', 'old-content');
        const sourceSkillPath = createSkillDir(sourceDir, 'skill-alpha', 'new-content');

        copySkillToHub(sourceSkillPath, hubDir);

        expect(readSkillFile(path.join(hubDir, 'skill-alpha'))).toBe('new-content');
    });

    it('syncHubSkillsToAgent creates the target skillsDir and links skills when it does not exist', () => {
        const missingTargetSkillsDir = path.join(testDir, 'missing-target-skills');
        createSkillDir(hubDir, 'skill-alpha', 'alpha');

        syncHubSkillsToAgent('TestAgent', hubDir, ['skill-alpha'], missingTargetSkillsDir);

        const targetSkillPath = path.join(missingTargetSkillsDir, 'skill-alpha');
        expect(fs.existsSync(missingTargetSkillsDir)).toBe(true);
        expect(fs.lstatSync(targetSkillPath).isSymbolicLink()).toBe(true);
    });

    it('syncHubSkillsToAgent removes an existing directory with the same name before creating the symlink', () => {
        const hubSkillPath = createSkillDir(hubDir, 'skill-alpha', 'from-hub');
        const targetSkillPath = createSkillDir(targetSkillsDir, 'skill-alpha', 'local-version');
        createSkillDir(targetSkillsDir, 'untouched-skill', 'keep-me');

        syncHubSkillsToAgent('TestAgent', hubDir, ['skill-alpha'], targetSkillsDir);

        expect(fs.lstatSync(targetSkillPath).isSymbolicLink()).toBe(true);
        expect(path.resolve(fs.realpathSync.native(targetSkillPath))).toBe(path.resolve(fs.realpathSync.native(hubSkillPath)));
        expect(readSkillFile(path.join(targetSkillsDir, 'untouched-skill'))).toBe('keep-me');
    });

    it('syncHubSkillsToAgent keeps the link target stable across repeated runs', () => {
        const hubSkillPath = createSkillDir(hubDir, 'skill-alpha', 'from-hub');
        const targetSkillPath = path.join(targetSkillsDir, 'skill-alpha');

        syncHubSkillsToAgent('TestAgent', hubDir, ['skill-alpha'], targetSkillsDir);
        syncHubSkillsToAgent('TestAgent', hubDir, ['skill-alpha'], targetSkillsDir);

        expect(fs.lstatSync(targetSkillPath).isSymbolicLink()).toBe(true);
        expect(path.resolve(fs.realpathSync.native(targetSkillPath))).toBe(path.resolve(fs.realpathSync.native(hubSkillPath)));
    });

    it('syncHubSkillsToAgent ignores single-file entries in the Hub', () => {
        fs.writeFileSync(path.join(hubDir, 'single-file.txt'), 'ignore-me');

        syncHubSkillsToAgent('TestAgent', hubDir, ['single-file.txt'], targetSkillsDir);

        expect(fs.existsSync(path.join(targetSkillsDir, 'single-file.txt'))).toBe(false);
    });

    it('syncHubSkillsToAgent rejects using the Hub itself as the target directory', () => {
        createSkillDir(hubDir, 'skill-alpha', 'alpha');

        expect(() => syncHubSkillsToAgent('TestAgent', hubDir, ['skill-alpha'], hubDir)).toThrow(
            'target skills directory cannot be the same as the Skills Hub'
        );
    });

    it('safeSyncFolder syncs all directory-based Hub skills to the target directory', async () => {
        const alphaSkillPath = createSkillDir(hubDir, 'skill-alpha', 'alpha');
        const betaSkillPath = createSkillDir(hubDir, 'skill-beta', 'beta');
        fs.writeFileSync(path.join(hubDir, 'single-file.txt'), 'ignore-me');

        await safeSyncFolder('TestAgent', targetSkillsDir, hubDir);

        const targetAlphaPath = path.join(targetSkillsDir, 'skill-alpha');
        const targetBetaPath = path.join(targetSkillsDir, 'skill-beta');

        expect(fs.lstatSync(targetAlphaPath).isSymbolicLink()).toBe(true);
        expect(fs.lstatSync(targetBetaPath).isSymbolicLink()).toBe(true);
        expect(path.resolve(fs.realpathSync.native(targetAlphaPath))).toBe(path.resolve(fs.realpathSync.native(alphaSkillPath)));
        expect(path.resolve(fs.realpathSync.native(targetBetaPath))).toBe(path.resolve(fs.realpathSync.native(betaSkillPath)));
        expect(fs.existsSync(path.join(targetSkillsDir, 'single-file.txt'))).toBe(false);
    });
});

function createSkillDir(baseDir: string, skillName: string, content: string): string {
    const skillPath = path.join(baseDir, skillName);
    ensureDir(skillPath);
    fs.writeFileSync(path.join(skillPath, 'SKILL.md'), content);
    return skillPath;
}

function readSkillFile(skillDir: string): string {
    return fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
}

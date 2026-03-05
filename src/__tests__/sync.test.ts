import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ensureDir, safeSyncFolder } from '../sync';

describe('sync logic', () => {
    const testDir = path.join(os.tmpdir(), 'shareskills-test-' + Date.now());
    const hubDir = path.join(testDir, 'hub');
    const agentSkillsDir = path.join(testDir, 'agent-skills');

    beforeEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
        ensureDir(testDir);
        ensureDir(hubDir);
        ensureDir(agentSkillsDir);

        // Create a dummy skill file
        fs.writeFileSync(path.join(agentSkillsDir, 'dummy.txt'), 'hello');
    });

    afterEach(() => {
        // Cleanup junctions on Windows can be tricky if not careful, but rmSync should handle it
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('should ensure a directory exists', () => {
        const newDir = path.join(testDir, 'ensure-me');
        ensureDir(newDir);
        expect(fs.existsSync(newDir)).toBe(true);
    });

    it('should sync folder to hub and create a junction/symlink', async () => {
        await safeSyncFolder('TestAgent', agentSkillsDir, hubDir);

        // Check if file moved to hub
        expect(fs.existsSync(path.join(hubDir, 'dummy.txt'))).toBe(true);
        expect(fs.readFileSync(path.join(hubDir, 'dummy.txt'), 'utf-8')).toBe('hello');

        // Check if original path is now a link
        const stats = fs.lstatSync(agentSkillsDir);
        expect(stats.isSymbolicLink()).toBe(true);

        // Verify the link points to the hub
        const target = fs.readlinkSync(agentSkillsDir);
        expect(path.resolve(target)).toBe(path.resolve(hubDir));

        // Check if backup exists
        const files = fs.readdirSync(testDir);
        const backupDir = files.find(f => f.startsWith('agent-skills.backup_'));
        expect(backupDir).toBeDefined();
        expect(fs.existsSync(path.join(testDir, backupDir!, 'dummy.txt'))).toBe(true);
    });

    it('should skip if already a link to the same hub', async () => {
        // Setup initial sync
        await safeSyncFolder('TestAgent', agentSkillsDir, hubDir);

        // Try syncing again
        await safeSyncFolder('TestAgent', agentSkillsDir, hubDir);

        // Should still be a link pointing to the same place
        const stats = fs.lstatSync(agentSkillsDir);
        expect(stats.isSymbolicLink()).toBe(true);
        const target = fs.readlinkSync(agentSkillsDir);
        expect(path.resolve(target)).toBe(path.resolve(hubDir));
    });
});

import { describe, it, expect } from 'vitest';
import path from 'path';
import {
    ALL_OPTION,
    buildDefaultSourceDirectories,
    buildSkillCandidates,
    dedupeExecutionTargets,
    dedupeSourceDirectories,
    filterExecutionTargetsAgainstHub,
    filterSourceDirectoriesAgainstHub,
    getDuplicatedSkillNames,
    getDuplicateSkillGroups,
    isPathInsideDirectory,
    partitionAgentsByDetectedPaths,
    resolveAgentPaths,
    resolveSelectedHubSkills,
    resolveDuplicateSkillCandidatesBySelection,
    resolveSelectedSkillCandidates,
    resolveSelectedSyncAgents,
    resolveSelectedSourceDirectories,
    SyncTargetAgent,
    SkillCandidate,
    SkillCandidateEntry,
    SkillSourceDirectory,
} from '../flow';

describe('collection flow pure functions', () => {
    it('resolveAgentPaths resolves detectPath and skillsPath from homeDir', () => {
        const homeDir = path.join('C:/Users', 'tester');
        const agents = [
            {
                key: 'cursor',
                name: 'Cursor',
                skillsDir: '.cursor/skills',
                detectDir: '.cursor',
            },
            {
                key: 'claude_code',
                name: 'Claude Code',
                skillsDir: '.claude/skills',
                detectDir: '.claude',
            },
        ];

        expect(resolveAgentPaths(agents, homeDir)).toEqual([
            {
                ...agents[0],
                skillsPath: path.join(homeDir, '.cursor/skills'),
                detectPath: path.join(homeDir, '.cursor'),
            },
            {
                ...agents[1],
                skillsPath: path.join(homeDir, '.claude/skills'),
                detectPath: path.join(homeDir, '.claude'),
            },
        ]);
    });

    it('partitionAgentsByDetectedPaths separates detected and undetected agents', () => {
        const resolvedAgents = [
            {
                key: 'cursor',
                name: 'Cursor',
                skillsPath: path.resolve('D:/mock/.cursor/skills'),
                detectPath: path.resolve('D:/mock/.cursor'),
            },
            {
                key: 'claude_code',
                name: 'Claude Code',
                skillsPath: path.resolve('D:/mock/.claude/skills'),
                detectPath: path.resolve('D:/mock/.claude'),
            },
            {
                key: 'codex',
                name: 'Codex',
                skillsPath: path.resolve('D:/mock/.codex/skills'),
                detectPath: path.resolve('D:/mock/.codex'),
            },
        ];

        expect(partitionAgentsByDetectedPaths(resolvedAgents, [
            'D:/mock/.cursor',
            'D:/mock/.codex',
        ])).toEqual({
            detectedAgents: [resolvedAgents[0], resolvedAgents[2]],
            undetectedAgents: [resolvedAgents[1]],
        });
    });

    it('buildDefaultSourceDirectories keeps existing skills directories and merges duplicates', () => {
        const detectedAgents = [
            {
                key: 'amp',
                name: 'Amp',
                skillsPath: path.resolve('D:/mock/.config/agents/skills'),
            },
            {
                key: 'kimi_cli',
                name: 'Kimi Code CLI',
                skillsPath: path.resolve('D:/mock/.config/agents/skills'),
            },
            {
                key: 'claude_code',
                name: 'Claude Code',
                skillsPath: path.resolve('D:/mock/.claude/skills'),
            },
            {
                key: 'cursor',
                name: 'Cursor',
                skillsPath: path.resolve('D:/mock/.cursor/skills'),
            },
        ];

        expect(buildDefaultSourceDirectories(detectedAgents, [
            'D:/mock/.config/agents/skills',
            'D:/mock/.claude/skills',
        ])).toEqual([
            createSource('agent_amp', 'Amp / Kimi Code CLI', 'D:/mock/.config/agents/skills'),
            createSource('agent_claude_code', 'Claude Code', 'D:/mock/.claude/skills'),
        ]);
    });

    it('resolveSelectedSourceDirectories returns all default source directories when all is selected', () => {
        const defaultSources = [
            createSource('cursor', 'Cursor', 'D:/mock/.cursor/skills'),
            createSource('claude', 'Claude Code', 'D:/mock/.claude/skills'),
        ];

        expect(resolveSelectedSourceDirectories(defaultSources, [ALL_OPTION])).toEqual(defaultSources);
    });

    it('resolveSelectedSourceDirectories returns only the selected default source directories', () => {
        const defaultSources = [
            createSource('cursor', 'Cursor', 'D:/mock/.cursor/skills'),
            createSource('claude', 'Claude Code', 'D:/mock/.claude/skills'),
            createSource('openclaw', 'OpenClaw', 'D:/mock/.openclaw/skills'),
        ];

        expect(resolveSelectedSourceDirectories(defaultSources, ['claude', 'openclaw'])).toEqual([
            defaultSources[1],
            defaultSources[2],
        ]);
    });

    it('dedupeSourceDirectories merges identical directories and joins labels', () => {
        const sourceDirectories = [
            createSource('amp', 'Amp', 'D:/mock/.config/agents/skills'),
            createSource('kimi', 'Kimi Code CLI', 'D:/mock/.config/agents/skills'),
            createSource('claude', 'Claude Code', 'D:/mock/.claude/skills'),
        ];

        expect(dedupeSourceDirectories(sourceDirectories)).toEqual([
            createSource('amp', 'Amp / Kimi Code CLI', 'D:/mock/.config/agents/skills'),
            createSource('claude', 'Claude Code', 'D:/mock/.claude/skills'),
        ]);
    });

    it('filterSourceDirectoriesAgainstHub filters out the Hub itself and nested directories inside it', () => {
        const sourceDirectories = [
            createSource('cursor', 'Cursor', 'D:/mock/.cursor/skills'),
            createSource('hub', 'Hub', 'D:/mock/hub'),
            createSource('nested', 'Nested', 'D:/mock/hub/plugins/skills'),
        ];

        expect(filterSourceDirectoriesAgainstHub(sourceDirectories, 'D:/mock/hub')).toEqual([
            createSource('cursor', 'Cursor', 'D:/mock/.cursor/skills'),
        ]);
    });

    it('isPathInsideDirectory detects identical and nested paths', () => {
        expect(isPathInsideDirectory('D:/mock/hub', 'D:/mock/hub')).toBe(true);
        expect(isPathInsideDirectory('D:/mock/hub', 'D:/mock/hub/skill-alpha')).toBe(true);
        expect(isPathInsideDirectory('D:/mock/hub', 'D:/mock/hub-nested')).toBe(false);
        expect(isPathInsideDirectory('D:/mock/hub', 'D:/mock/other/skill-alpha')).toBe(false);
    });

    it('buildSkillCandidates skips entries inside the Hub and preserves the remaining order', () => {
        const candidateEntries: SkillCandidateEntry[] = [
            createCandidateEntry('skill-alpha', 'Claude Code', 'D:/mock/.claude/skills', null),
            createCandidateEntry('skill-beta', 'Custom Source 1', 'D:/mock/plugins/skills', 'D:/mock/plugins/skills/skill-beta'),
            createCandidateEntry('skill-from-hub', 'Hub Mirror', 'D:/mock/mirrors/hub', 'D:/mock/hub/skill-from-hub'),
            createCandidateEntry('skill-dup', 'Claude Code', 'D:/mock/.claude/skills', 'D:/mock/.claude/skills/skill-dup'),
        ];

        expect(buildSkillCandidates(candidateEntries, 'D:/mock/hub')).toEqual([
            {
                id: 'skill_1',
                name: 'skill-alpha',
                fullPath: path.resolve('D:/mock/.claude/skills/skill-alpha'),
                sourceLabel: 'Claude Code',
                sourceDirPath: path.resolve('D:/mock/.claude/skills'),
            },
            {
                id: 'skill_2',
                name: 'skill-beta',
                fullPath: path.resolve('D:/mock/plugins/skills/skill-beta'),
                sourceLabel: 'Custom Source 1',
                sourceDirPath: path.resolve('D:/mock/plugins/skills'),
            },
            {
                id: 'skill_3',
                name: 'skill-dup',
                fullPath: path.resolve('D:/mock/.claude/skills/skill-dup'),
                sourceLabel: 'Claude Code',
                sourceDirPath: path.resolve('D:/mock/.claude/skills'),
            },
        ]);
    });

    it('resolveSelectedSkillCandidates returns all candidate skills when all is selected', () => {
        const skillCandidates = [
            createCandidate('skill_1', 'skill-alpha', 'Claude Code'),
            createCandidate('skill_2', 'skill-beta', 'Custom Source 1'),
        ];

        expect(resolveSelectedSkillCandidates(skillCandidates, [ALL_OPTION])).toEqual(skillCandidates);
    });

    it('resolveSelectedHubSkills returns all Hub skills when all is selected', () => {
        const hubSkills = ['skill-alpha', 'skill-beta', 'skill-dup'];

        expect(resolveSelectedHubSkills(hubSkills, [ALL_OPTION])).toEqual(hubSkills);
    });

    it('resolveSelectedHubSkills returns only the selected Hub skills', () => {
        const hubSkills = ['skill-alpha', 'skill-beta', 'skill-dup'];

        expect(resolveSelectedHubSkills(hubSkills, ['skill-beta', 'skill-dup'])).toEqual([
            'skill-beta',
            'skill-dup',
        ]);
    });

    it('getDuplicateSkillGroups and getDuplicatedSkillNames detect duplicate skill names', () => {
        const selectedCandidates = [
            createCandidate('skill_1', 'skill-alpha', 'Claude Code'),
            createCandidate('skill_2', 'skill-dup', 'Claude Code'),
            createCandidate('skill_3', 'skill-dup', 'Custom Source 1'),
            createCandidate('skill_4', 'skill-beta', 'Custom Source 1'),
        ];

        expect(getDuplicatedSkillNames(selectedCandidates)).toEqual(new Set(['skill-dup']));
        expect(getDuplicateSkillGroups(selectedCandidates)).toEqual([
            {
                skillName: 'skill-dup',
                candidates: [selectedCandidates[1], selectedCandidates[2]],
            },
        ]);
    });

    it('resolveDuplicateSkillCandidatesBySelection keeps unique items and resolves duplicates from the selected results', () => {
        const selectedCandidates = [
            createCandidate('skill_1', 'skill-alpha', 'Claude Code'),
            createCandidate('skill_2', 'skill-dup', 'Claude Code'),
            createCandidate('skill_3', 'skill-dup', 'Custom Source 1'),
            createCandidate('skill_4', 'skill-beta', 'Custom Source 1'),
        ];

        expect(resolveDuplicateSkillCandidatesBySelection(selectedCandidates, {
            'skill-dup': 'skill_3',
        })).toEqual([
            selectedCandidates[0],
            selectedCandidates[3],
            selectedCandidates[2],
        ]);
    });

    it('resolveDuplicateSkillCandidatesBySelection throws when a duplicate selection result is missing', () => {
        const selectedCandidates = [
            createCandidate('skill_1', 'skill-dup', 'Claude Code'),
            createCandidate('skill_2', 'skill-dup', 'Custom Source 1'),
        ];

        expect(() => resolveDuplicateSkillCandidatesBySelection(selectedCandidates, {})).toThrow(
            'Missing source selection result for skill "skill-dup"'
        );
    });

    it('resolveSelectedSyncAgents returns all detected agents when all is selected', () => {
        const detectedAgents = [
            createSyncAgent('cursor', 'Cursor', 'D:/mock/.cursor/skills'),
            createSyncAgent('claude', 'Claude Code', 'D:/mock/.claude/skills'),
        ];

        expect(resolveSelectedSyncAgents(detectedAgents, [ALL_OPTION])).toEqual(detectedAgents);
    });

    it('resolveSelectedSyncAgents returns only the selected sync target agents', () => {
        const detectedAgents = [
            createSyncAgent('cursor', 'Cursor', 'D:/mock/.cursor/skills'),
            createSyncAgent('claude', 'Claude Code', 'D:/mock/.claude/skills'),
            createSyncAgent('openclaw', 'OpenClaw', 'D:/mock/.openclaw/skills'),
        ];

        expect(resolveSelectedSyncAgents(detectedAgents, ['cursor', 'openclaw'])).toEqual([
            detectedAgents[0],
            detectedAgents[2],
        ]);
    });

    it('dedupeExecutionTargets merges sync targets with the same skillsPath', () => {
        const selectedAgents = [
            createSyncAgent('amp', 'Amp', 'D:/mock/.config/agents/skills'),
            createSyncAgent('kimi', 'Kimi Code CLI', 'D:/mock/.config/agents/skills'),
            createSyncAgent('cursor', 'Cursor', 'D:/mock/.cursor/skills'),
        ];

        expect(dedupeExecutionTargets(selectedAgents)).toEqual([
            {
                label: 'Amp / Kimi Code CLI',
                skillsPath: path.resolve('D:/mock/.config/agents/skills'),
            },
            {
                label: 'Cursor',
                skillsPath: path.resolve('D:/mock/.cursor/skills'),
            },
        ]);
    });

    it('filterExecutionTargetsAgainstHub filters out target directories that are the same as the Hub', () => {
        const executionTargets = [
            { label: 'Cursor', skillsPath: path.resolve('D:/mock/hub') },
            { label: 'Claude Code', skillsPath: path.resolve('D:/mock/.claude/skills') },
        ];

        expect(filterExecutionTargetsAgainstHub(executionTargets, 'D:/mock/hub')).toEqual([
            { label: 'Claude Code', skillsPath: path.resolve('D:/mock/.claude/skills') },
        ]);
    });

    it('collection flow pure functions can compose the final skill list to copy into the Hub', () => {
        const defaultSources = [
            createSource('cursor', 'Cursor', 'D:/mock/.cursor/skills'),
            createSource('claude', 'Claude Code', 'D:/mock/.claude/skills'),
            createSource('openclaw', 'OpenClaw', 'D:/mock/.openclaw/skills'),
        ];
        const customSources = [
            createSource('custom_1', 'Custom Source 1', 'D:/mock/plugins/skills'),
        ];

        const selectedDefaultSources = resolveSelectedSourceDirectories(defaultSources, ['claude', 'openclaw']);
        const collectionSources = filterSourceDirectoriesAgainstHub(
            dedupeSourceDirectories([...selectedDefaultSources, ...customSources]),
            'D:/mock/hub',
        );

        expect(collectionSources).toEqual([
            defaultSources[1],
            defaultSources[2],
            customSources[0],
        ]);

        const skillCandidates = [
            createCandidate('skill_1', 'existing-local', 'OpenClaw'),
            createCandidate('skill_2', 'skill-alpha', 'Claude Code'),
            createCandidate('skill_3', 'skill-dup', 'Claude Code'),
            createCandidate('skill_4', 'skill-beta', 'Custom Source 1'),
            createCandidate('skill_5', 'skill-dup', 'Custom Source 1'),
        ];

        const selectedCandidates = resolveSelectedSkillCandidates(skillCandidates, [ALL_OPTION]);
        const resolvedCandidates = resolveDuplicateSkillCandidatesBySelection(selectedCandidates, {
            'skill-dup': 'skill_3',
        });

        expect(resolvedCandidates.map(candidate => `${candidate.name} <- ${candidate.sourceLabel}`)).toEqual([
            'existing-local <- OpenClaw',
            'skill-alpha <- Claude Code',
            'skill-beta <- Custom Source 1',
            'skill-dup <- Claude Code',
        ]);
    });

    it('sync flow pure functions can compose the final target directories and Hub skill list', () => {
        const hubSkills = ['existing-local', 'skill-alpha', 'skill-beta', 'skill-dup'];
        const detectedAgents = [
            createSyncAgent('cursor', 'Cursor', 'D:/mock/.cursor/skills'),
            createSyncAgent('amp', 'Amp', 'D:/mock/.config/agents/skills'),
            createSyncAgent('kimi', 'Kimi Code CLI', 'D:/mock/.config/agents/skills'),
            createSyncAgent('hub_like', 'HubLike', 'D:/mock/hub'),
        ];

        const selectedSkillNames = resolveSelectedHubSkills(hubSkills, [ALL_OPTION]);
        const selectedAgents = resolveSelectedSyncAgents(detectedAgents, ['cursor', 'amp', 'kimi', 'hub_like']);
        const executionTargets = filterExecutionTargetsAgainstHub(
            dedupeExecutionTargets(selectedAgents),
            'D:/mock/hub',
        );

        expect(selectedSkillNames).toEqual(hubSkills);
        expect(executionTargets).toEqual([
            {
                label: 'Cursor',
                skillsPath: path.resolve('D:/mock/.cursor/skills'),
            },
            {
                label: 'Amp / Kimi Code CLI',
                skillsPath: path.resolve('D:/mock/.config/agents/skills'),
            },
        ]);
    });

    it('detection flow pure functions can compose the final detected agents and default source directories', () => {
        const homeDir = path.join('C:/Users', 'tester');
        const resolvedAgents = resolveAgentPaths([
            {
                key: 'cursor',
                name: 'Cursor',
                skillsDir: '.cursor/skills',
                detectDir: '.cursor',
            },
            {
                key: 'claude_code',
                name: 'Claude Code',
                skillsDir: '.claude/skills',
                detectDir: '.claude',
            },
            {
                key: 'amp',
                name: 'Amp',
                skillsDir: '.config/agents/skills',
                detectDir: '.config/agents',
            },
            {
                key: 'kimi_cli',
                name: 'Kimi Code CLI',
                skillsDir: '.config/agents/skills',
                detectDir: '.config/agents',
            },
        ], homeDir);

        const { detectedAgents, undetectedAgents } = partitionAgentsByDetectedPaths(resolvedAgents, [
            path.join(homeDir, '.cursor'),
            path.join(homeDir, '.config/agents'),
        ]);
        const defaultSources = buildDefaultSourceDirectories(
            detectedAgents,
            detectedAgents.map(agent => agent.skillsPath),
        );

        expect(detectedAgents.map(agent => agent.name)).toEqual([
            'Cursor',
            'Amp',
            'Kimi Code CLI',
        ]);
        expect(undetectedAgents.map(agent => agent.name)).toEqual(['Claude Code']);
        expect(defaultSources).toEqual([
            createSource('agent_cursor', 'Cursor', path.join(homeDir, '.cursor/skills')),
            createSource('agent_amp', 'Amp / Kimi Code CLI', path.join(homeDir, '.config/agents/skills')),
        ]);
    });
});

function createSource(key: string, label: string, dirPath: string): SkillSourceDirectory {
    return { key, label, dirPath: path.resolve(dirPath) };
}

function createCandidate(id: string, name: string, sourceLabel: string): SkillCandidate {
    return {
        id,
        name,
        fullPath: path.resolve(`D:/mock/${sourceLabel}/${name}`),
        sourceLabel,
        sourceDirPath: path.resolve(`D:/mock/${sourceLabel}`),
    };
}

function createSyncAgent(key: string, name: string, skillsPath: string): SyncTargetAgent {
    return {
        key,
        name,
        skillsPath: path.resolve(skillsPath),
    };
}

function createCandidateEntry(
    skillName: string,
    sourceLabel: string,
    sourceDirPath: string,
    resolvedFullPath: string | null,
): SkillCandidateEntry {
    return {
        skillName,
        fullPath: path.resolve(sourceDirPath, skillName),
        resolvedFullPath: resolvedFullPath ? path.resolve(resolvedFullPath) : null,
        sourceLabel,
        sourceDirPath: path.resolve(sourceDirPath),
    };
}

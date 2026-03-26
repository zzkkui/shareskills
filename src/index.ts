#!/usr/bin/env node

import { Command } from 'commander';
import * as p from '@clack/prompts';
import color from 'picocolors';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { AGENTS, DEFAULT_HUB_PATH, AgentConfig } from './constants';
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
    SkillCandidate,
    SkillCandidateEntry,
    SkillSourceDirectory,
} from './flow';
import { copySkillToHub, ensureDir, getSkillEntries, syncHubSkillsToAgent } from './sync';

const program = new Command();

interface ResolvedAgentConfig extends AgentConfig {
    skillsPath: string;
    detectPath: string;
}

interface SyncTargetSelection {
    key: string;
    name: string;
    skillsPath: string;
}

program
    .name('skillhubs')
    .description('Collect and sync skills from different AI tools into a unified Skills Hub.')
    .version('1.0.0');

program
    .command('sync')
    .description('Interactively collect skills into the Hub and optionally sync them to AI agents')
    .action(async () => {
        try {
            p.intro(color.bgCyan(color.black(' Skillhubs ')));

            p.note(
                `This command runs in two steps:\n` +
                `1. Collect skills into the Skills Hub from detected AI agent skills directories and any custom directories you add.\n` +
                `2. Select skills from the Skills Hub and symlink them to the AI agents or custom target directories you choose.\n\n` +
                `${color.yellow(color.bold('Note:'))} When syncing to a target agent, an existing skill with the same name in the target directory will be removed before the symlink is created.`,
                'Workflow'
            );

            const resolvedHubDir = await promptHubDirectory();
            ensureDir(resolvedHubDir);

            const { detectedAgents, undetectedAgents } = resolveAgents();
            reportDetectedAgents(detectedAgents, undetectedAgents);

            const defaultSources = filterSourceDirectoriesAgainstHub(
                getDefaultSourceDirectories(detectedAgents),
                resolvedHubDir,
            );
            reportDefaultSources(defaultSources);
            const selectedDefaultSources = await promptDefaultSourceDirectories(defaultSources);

            const customSources = await promptCustomSourceDirectories(resolvedHubDir);
            const allSourceDirectories = filterSourceDirectoriesAgainstHub(
                dedupeSourceDirectories([...selectedDefaultSources, ...customSources]),
                resolvedHubDir,
            );
            reportCollectionSources(allSourceDirectories);

            await collectSkillsToHub(allSourceDirectories, resolvedHubDir);
            await syncHubSkillsToAgents(detectedAgents, resolvedHubDir);

            p.outro(color.green('Done.'));
        } catch (error: any) {
            p.log.error(error?.message ?? 'Execution failed.');
            process.exit(1);
        }
    });

program.parse(process.argv);

function buildExamplePath(...segments: string[]): string {
    return path.join(os.homedir(), ...segments);
}

function getHubPathPlaceholder(): string {
    return `For example: ${DEFAULT_HUB_PATH}`;
}

function getCustomSourcePlaceholder(): string {
    return `For example: ${buildExamplePath('.claude', 'skills')}`;
}

function getCustomTargetPlaceholder(): string {
    return `For example: ${buildExamplePath('.cursor', 'skills')}`;
}

async function promptHubDirectory(): Promise<string> {
    let hubDir = process.env.SKILLHUBS_HUB_PATH;
    if (!hubDir) {
        const result = await p.text({
            message: 'Step 1: Enter the Skills Hub directory',
            placeholder: getHubPathPlaceholder(),
            initialValue: DEFAULT_HUB_PATH,
            validate: (value) => {
                if (!value) {
                    return 'Please enter the Skills Hub path.';
                }
            },
        });

        if (p.isCancel(result)) {
            p.cancel('Cancelled.');
            process.exit(0);
        }

        hubDir = result as string;
    }

    const resolvedHubDir = path.resolve(hubDir);
    if (!fs.existsSync(resolvedHubDir)) {
        p.log.info(`Creating Skills Hub directory: ${color.dim(resolvedHubDir)}`);
    }

    return resolvedHubDir;
}

function resolveAgents(): { detectedAgents: ResolvedAgentConfig[]; undetectedAgents: ResolvedAgentConfig[] } {
    const homeDir = os.homedir();
    const resolvedAgents: ResolvedAgentConfig[] = resolveAgentPaths(AGENTS, homeDir);
    const detectedPaths = resolvedAgents
        .filter(agent => fs.existsSync(agent.detectPath))
        .map(agent => agent.detectPath);

    return partitionAgentsByDetectedPaths(resolvedAgents, detectedPaths);
}

function reportDetectedAgents(detectedAgents: ResolvedAgentConfig[], undetectedAgents: ResolvedAgentConfig[]) {
    p.log.step('Detecting available AI agents...');

    if (detectedAgents.length === 0) {
        p.log.warn('No built-in supported AI agents were detected.');
    } else {
        p.log.success(`Detected: ${detectedAgents.map(agent => color.green(agent.name)).join(', ')}`);
    }

    if (undetectedAgents.length > 0) {
        p.log.info(`Not detected: ${undetectedAgents.map(agent => color.gray(agent.name)).join(', ')}`);
    }
}

function getDefaultSourceDirectories(detectedAgents: ResolvedAgentConfig[]): SkillSourceDirectory[] {
    const existingSkillsDirectories = detectedAgents
        .filter(agent => isExistingDirectory(agent.skillsPath))
        .map(agent => agent.skillsPath);

    return buildDefaultSourceDirectories(detectedAgents, existingSkillsDirectories);
}

function reportDefaultSources(defaultSources: SkillSourceDirectory[]) {
    if (defaultSources.length === 0) {
        p.log.warn('No detected AI agents have a skills directory that can be used as a source.');
        return;
    }

    p.note(
        defaultSources
            .map(source => `• ${color.cyan(source.label)}\n  ${color.dim(source.dirPath)}`)
            .join('\n'),
        'Default source directories'
    );
}

async function promptDefaultSourceDirectories(defaultSources: SkillSourceDirectory[]): Promise<SkillSourceDirectory[]> {
    if (defaultSources.length === 0) {
        return [];
    }

    const selection = await p.multiselect({
        message: 'Select which default source directories to include in collection',
        options: [
            {
                value: ALL_OPTION,
                label: color.bold('All default source directories'),
                hint: 'Select all currently detected default source directories at once',
            },
            ...defaultSources.map(source => ({
                value: source.key,
                label: source.label,
                hint: source.dirPath,
            })),
        ],
    });

    if (p.isCancel(selection)) {
        p.cancel('Cancelled.');
        process.exit(0);
    }

    const selectedValues = selection as string[];
    return resolveSelectedSourceDirectories(defaultSources, selectedValues);
}

function reportCollectionSources(sourceDirectories: SkillSourceDirectory[]) {
    if (sourceDirectories.length === 0) {
        return;
    }

    p.note(
        sourceDirectories
            .map(source => `• ${color.cyan(source.label)}\n  ${color.dim(source.dirPath)}`)
            .join('\n'),
        'Collection sources for this run'
    );
}

async function promptCustomSourceDirectories(hubDir: string): Promise<SkillSourceDirectory[]> {
    const customSources: SkillSourceDirectory[] = [];

    let shouldAddCustomSource = await p.confirm({
        message: 'Add a custom skills source directory?',
        initialValue: false,
    });

    while (shouldAddCustomSource && !p.isCancel(shouldAddCustomSource)) {
        const customPathResult = await p.text({
            message: 'Enter the absolute path of the custom skills directory',
            placeholder: getCustomSourcePlaceholder(),
            validate: (value) => {
                if (!value) {
                    return 'Please enter a directory path.';
                }

                const resolvedPath = path.resolve(value);
                if (!isExistingDirectory(resolvedPath)) {
                    return 'This path does not exist or is not a directory.';
                }

                if (resolvedPath === hubDir || isPathInsideDirectory(hubDir, resolvedPath)) {
                    return 'The Skills Hub itself cannot be used as a collection source.';
                }
            },
        });

        if (p.isCancel(customPathResult)) {
            p.cancel('Cancelled.');
            process.exit(0);
        }

        const customLabelResult = await p.text({
            message: 'Enter a display name for this custom source',
            initialValue: `Custom source ${customSources.length + 1}`,
            validate: (value) => {
                if (!value) {
                    return 'Please enter a display name.';
                }
            },
        });

        if (p.isCancel(customLabelResult)) {
            p.cancel('Cancelled.');
            process.exit(0);
        }

        customSources.push({
            key: `custom_${customSources.length + 1}`,
            label: customLabelResult as string,
            dirPath: path.resolve(customPathResult as string),
        });

        shouldAddCustomSource = await p.confirm({
            message: 'Add another custom source directory?',
            initialValue: false,
        });
    }

    return customSources;
}

async function collectSkillsToHub(sourceDirectories: SkillSourceDirectory[], hubDir: string) {
    if (sourceDirectories.length === 0) {
        p.log.warn('No skills source directories are available. Skipping directly to the sync step.');
        return;
    }

    const skillCandidates = collectSkillCandidates(sourceDirectories, hubDir);
    if (skillCandidates.length === 0) {
        p.log.warn('No skills were found in the source directories.');
        return;
    }

    const selectedCandidates = await promptSkillCollection(skillCandidates);
    if (selectedCandidates.length === 0) {
        p.log.info('No skills were selected for collection into the Skills Hub.');
        return;
    }

    const resolvedCandidates = await resolveDuplicateSkillCandidates(selectedCandidates);
    p.note(
        resolvedCandidates
            .map(candidate => `• ${color.cyan(candidate.name)} <- ${candidate.sourceLabel}`)
            .join('\n'),
        'About to copy into the Skills Hub'
    );

    const confirmCollection = await p.confirm({
        message: 'Copy these skills to the Skills Hub? Skills with the same name will be overwritten by the selected source.',
        initialValue: true,
    });

    if (!confirmCollection || p.isCancel(confirmCollection)) {
        p.log.info('Collection step skipped.');
        return;
    }

    const spinner = p.spinner();
    spinner.start('Copying selected skills into the Skills Hub...');

    try {
        for (const candidate of resolvedCandidates) {
            copySkillToHub(candidate.fullPath, hubDir);
        }

        spinner.stop(`Copied ${resolvedCandidates.length} skills into the Skills Hub.`);
    } catch (error: any) {
        spinner.stop('Copy interrupted.');
        throw error;
    }
}

function collectSkillCandidates(sourceDirectories: SkillSourceDirectory[], hubDir: string): SkillCandidate[] {
    const candidateEntries: SkillCandidateEntry[] = [];

    for (const source of sourceDirectories) {
        for (const skillName of getSkillEntries(source.dirPath)) {
            const fullPath = path.join(source.dirPath, skillName);
            candidateEntries.push({
                skillName,
                fullPath,
                resolvedFullPath: resolvePathSafely(fullPath),
                sourceLabel: source.label,
                sourceDirPath: source.dirPath,
            });
        }
    }

    return buildSkillCandidates(candidateEntries, hubDir);
}

async function promptSkillCollection(skillCandidates: SkillCandidate[]): Promise<SkillCandidate[]> {
    const duplicatedSkillNames = getDuplicatedSkillNames(skillCandidates);
    const selection = await p.multiselect({
        message: 'Step 1: Select the skills to place in the Skills Hub',
        options: [
            {
                value: ALL_OPTION,
                label: color.bold('All skills'),
                hint: 'Select all currently scanned skills at once',
            },
            ...skillCandidates.map(candidate => ({
                value: candidate.id,
                label: duplicatedSkillNames.has(candidate.name)
                    ? `${candidate.name} (${candidate.sourceLabel})`
                    : candidate.name,
                hint: `${candidate.sourceLabel} · ${candidate.sourceDirPath}`,
            })),
        ],
    });

    if (p.isCancel(selection)) {
        p.cancel('Cancelled.');
        process.exit(0);
    }

    const selectedIds = selection as string[];
    return resolveSelectedSkillCandidates(skillCandidates, selectedIds);
}

async function resolveDuplicateSkillCandidates(selectedCandidates: SkillCandidate[]): Promise<SkillCandidate[]> {
    const duplicateSelections: Record<string, string> = {};

    for (const group of getDuplicateSkillGroups(selectedCandidates)) {
        const selectedCandidateId = await p.select({
            message: `Skill "${group.skillName}" exists in multiple sources. Select the version to place in the Skills Hub`,
            options: group.candidates.map(candidate => ({
                value: candidate.id,
                label: candidate.sourceLabel,
                hint: candidate.fullPath,
            })),
        });

        if (p.isCancel(selectedCandidateId)) {
            p.cancel('Cancelled.');
            process.exit(0);
        }

        duplicateSelections[group.skillName] = selectedCandidateId as string;
    }

    return resolveDuplicateSkillCandidatesBySelection(selectedCandidates, duplicateSelections);
}

async function syncHubSkillsToAgents(detectedAgents: ResolvedAgentConfig[], hubDir: string) {
    const hubSkills = getSkillEntries(hubDir);
    if (hubSkills.length === 0) {
        p.log.warn('There are no skills in the Skills Hub yet, so sync cannot continue.');
        return;
    }

    const selectedSkillNames = await promptHubSkillSelection(hubSkills);
    if (selectedSkillNames.length === 0) {
        p.log.info('No skills were selected for sync.');
        return;
    }

    const selectedAgents = await promptTargetAgents(detectedAgents);
    const customTargets = await promptCustomTargetDirectories(hubDir);
    const selectedTargets: SyncTargetSelection[] = [
        ...selectedAgents.map(agent => ({
            key: agent.key,
            name: agent.name,
            skillsPath: agent.skillsPath,
        })),
        ...customTargets,
    ];

    if (selectedTargets.length === 0) {
        p.log.info('No sync targets were selected.');
        return;
    }

    const executionTargets = filterExecutionTargetsAgainstHub(
        dedupeExecutionTargets(selectedTargets),
        hubDir,
    );

    if (executionTargets.length === 0) {
        p.log.warn('The selected target directory is the same as the Skills Hub. Sync was skipped.');
        return;
    }

    p.note(
        [
            `Selected Hub skills: ${selectedSkillNames.map(skill => color.cyan(skill)).join(', ')}`,
            `Sync targets: ${executionTargets.map(target => color.green(target.label)).join(', ')}`,
        ].join('\n'),
        'Sync confirmation'
    );

    const confirmSync = await p.confirm({
        message: 'Start syncing? Skills with the same name in the target directory will be removed before the symlink is created.',
        initialValue: true,
    });

    if (!confirmSync || p.isCancel(confirmSync)) {
        p.log.info('Sync step cancelled.');
        return;
    }

    const spinner = p.spinner();
    spinner.start('Syncing the Skills Hub to target AI agents...');

    try {
        for (const target of executionTargets) {
            syncHubSkillsToAgent(target.label, hubDir, selectedSkillNames, target.skillsPath);
        }

        spinner.stop(`Synced ${selectedSkillNames.length} skills to ${executionTargets.length} target directories.`);
    } catch (error: any) {
        spinner.stop('Sync interrupted.');
        throw error;
    }
}

async function promptHubSkillSelection(hubSkills: string[]): Promise<string[]> {
    const selection = await p.multiselect({
        message: 'Step 2: Select the skills to sync from the Skills Hub',
        options: [
            {
                value: ALL_OPTION,
                label: color.bold('All Hub skills'),
                hint: 'Sync all skills currently in the Hub at once',
            },
            ...hubSkills.map(skillName => ({
                value: skillName,
                label: skillName,
                hint: path.join('Hub', skillName),
            })),
        ],
    });

    if (p.isCancel(selection)) {
        p.cancel('Cancelled.');
        process.exit(0);
    }

    const selectedValues = selection as string[];
    return resolveSelectedHubSkills(hubSkills, selectedValues);
}

async function promptTargetAgents(detectedAgents: ResolvedAgentConfig[]): Promise<ResolvedAgentConfig[]> {
    if (detectedAgents.length === 0) {
        p.log.info('No AI agents were detected by the built-in rules yet. You can still add target directories manually.');
        return [];
    }

    const selection = await p.multiselect({
        message: 'Select which AI agents to sync to',
        options: [
            {
                value: ALL_OPTION,
                label: color.bold('All detected AI agents'),
                hint: 'Sync the selected Hub skills to every detected agent',
            },
            ...detectedAgents.map(agent => ({
                value: agent.key,
                label: agent.name,
                hint: `${agent.skillsPath}${fs.existsSync(agent.skillsPath) ? '' : ' (skillsDir does not exist and will be created automatically)'}`,
            })),
        ],
    });

    if (p.isCancel(selection)) {
        p.cancel('Cancelled.');
        process.exit(0);
    }

    const selectedValues = selection as string[];
    return resolveSelectedSyncAgents<ResolvedAgentConfig>(detectedAgents, selectedValues);
}

async function promptCustomTargetDirectories(hubDir: string): Promise<SyncTargetSelection[]> {
    const customTargets: SyncTargetSelection[] = [];

    let shouldAddCustomTarget = await p.confirm({
        message: 'Add a custom sync target directory?',
        initialValue: false,
    });

    while (shouldAddCustomTarget && !p.isCancel(shouldAddCustomTarget)) {
        const customPathResult = await p.text({
            message: 'Enter the absolute path of the target skills directory',
            placeholder: getCustomTargetPlaceholder(),
            validate: (value) => {
                if (!value) {
                    return 'Please enter a directory path.';
                }

                const resolvedPath = path.resolve(value);
                if (resolvedPath === hubDir || isPathInsideDirectory(hubDir, resolvedPath)) {
                    return 'The Skills Hub itself or its subdirectories cannot be used as sync targets.';
                }

                if (pathExists(resolvedPath) && !isExistingDirectory(resolvedPath)) {
                    return 'This path already exists, but it is not a directory.';
                }

                const parentDir = path.dirname(resolvedPath);
                if (!isExistingDirectory(parentDir)) {
                    return 'The parent directory does not exist, so the target skills directory cannot be created safely.';
                }
            },
        });

        if (p.isCancel(customPathResult)) {
            p.cancel('Cancelled.');
            process.exit(0);
        }

        const customLabelResult = await p.text({
            message: 'Enter a display name for this sync target',
            initialValue: `Custom target ${customTargets.length + 1}`,
            validate: (value) => {
                if (!value) {
                    return 'Please enter a display name.';
                }
            },
        });

        if (p.isCancel(customLabelResult)) {
            p.cancel('Cancelled.');
            process.exit(0);
        }

        customTargets.push({
            key: `custom_target_${customTargets.length + 1}`,
            name: customLabelResult as string,
            skillsPath: path.resolve(customPathResult as string),
        });

        shouldAddCustomTarget = await p.confirm({
            message: 'Add another custom sync target directory?',
            initialValue: false,
        });
    }

    return customTargets;
}

function isExistingDirectory(dirPath: string): boolean {
    try {
        return fs.statSync(dirPath).isDirectory();
    } catch {
        return false;
    }
}

function pathExists(targetPath: string): boolean {
    try {
        fs.lstatSync(targetPath);
        return true;
    } catch {
        return false;
    }
}

function resolvePathSafely(targetPath: string): string | null {
    try {
        return fs.realpathSync.native(targetPath);
    } catch {
        return null;
    }
}

import path from 'path';

export const ALL_OPTION = '__all__';

export interface SkillSourceDirectory {
    key: string;
    label: string;
    dirPath: string;
}

export interface SkillCandidate {
    id: string;
    name: string;
    fullPath: string;
    sourceLabel: string;
    sourceDirPath: string;
}

export interface SkillCandidateEntry {
    skillName: string;
    fullPath: string;
    resolvedFullPath: string | null;
    sourceLabel: string;
    sourceDirPath: string;
}

export interface DuplicateSkillGroup {
    skillName: string;
    candidates: SkillCandidate[];
}

export interface SyncTargetAgent {
    key: string;
    name: string;
    skillsPath: string;
}

export interface DetectableAgent {
    detectPath: string;
}

export interface ExecutionTarget {
    label: string;
    skillsPath: string;
}

export function resolveAgentPaths<T extends {
    skillsDir: string;
    detectDir: string;
}>(
    agents: T[],
    homeDir: string,
): Array<T & { skillsPath: string; detectPath: string }> {
    return agents.map(agent => ({
        ...agent,
        skillsPath: path.join(homeDir, agent.skillsDir),
        detectPath: path.join(homeDir, agent.detectDir),
    }));
}

export function partitionAgentsByDetectedPaths<T extends DetectableAgent>(
    resolvedAgents: T[],
    detectedPaths: string[],
): { detectedAgents: T[]; undetectedAgents: T[] } {
    const detectedPathSet = new Set(detectedPaths.map(detectPath => path.resolve(detectPath)));
    const detectedAgents: T[] = [];
    const undetectedAgents: T[] = [];

    for (const agent of resolvedAgents) {
        if (detectedPathSet.has(path.resolve(agent.detectPath))) {
            detectedAgents.push(agent);
            continue;
        }

        undetectedAgents.push(agent);
    }

    return { detectedAgents, undetectedAgents };
}

export function buildDefaultSourceDirectories<T extends SyncTargetAgent>(
    detectedAgents: T[],
    existingSkillsDirectories: string[],
): SkillSourceDirectory[] {
    const existingDirectorySet = new Set(
        existingSkillsDirectories.map(directoryPath => path.resolve(directoryPath)),
    );

    return dedupeSourceDirectories(
        detectedAgents
            .filter(agent => existingDirectorySet.has(path.resolve(agent.skillsPath)))
            .map(agent => ({
                key: `agent_${agent.key}`,
                label: agent.name,
                dirPath: path.resolve(agent.skillsPath),
            })),
    );
}

export function resolveSelectedSourceDirectories(
    defaultSources: SkillSourceDirectory[],
    selectedValues: string[],
): SkillSourceDirectory[] {
    if (selectedValues.includes(ALL_OPTION)) {
        return defaultSources;
    }

    return defaultSources.filter(source => selectedValues.includes(source.key));
}

export function dedupeSourceDirectories(sourceDirectories: SkillSourceDirectory[]): SkillSourceDirectory[] {
    const sourceMap = new Map<string, SkillSourceDirectory>();

    for (const source of sourceDirectories) {
        const resolvedDirPath = path.resolve(source.dirPath);
        const existingSource = sourceMap.get(resolvedDirPath);
        if (existingSource) {
            existingSource.label = `${existingSource.label} / ${source.label}`;
            continue;
        }

        sourceMap.set(resolvedDirPath, {
            ...source,
            dirPath: resolvedDirPath,
        });
    }

    return Array.from(sourceMap.values());
}

export function filterSourceDirectoriesAgainstHub(
    sourceDirectories: SkillSourceDirectory[],
    hubDir: string,
): SkillSourceDirectory[] {
    return sourceDirectories.filter(source => !isPathInsideDirectory(hubDir, source.dirPath));
}

export function buildSkillCandidates(
    candidateEntries: SkillCandidateEntry[],
    hubDir: string,
): SkillCandidate[] {
    const candidates: SkillCandidate[] = [];
    let index = 1;

    for (const entry of candidateEntries) {
        if (entry.resolvedFullPath && isPathInsideDirectory(hubDir, entry.resolvedFullPath)) {
            continue;
        }

        candidates.push({
            id: `skill_${index++}`,
            name: entry.skillName,
            fullPath: entry.fullPath,
            sourceLabel: entry.sourceLabel,
            sourceDirPath: entry.sourceDirPath,
        });
    }

    return candidates;
}

export function resolveSelectedSkillCandidates(
    skillCandidates: SkillCandidate[],
    selectedIds: string[],
): SkillCandidate[] {
    if (selectedIds.includes(ALL_OPTION)) {
        return skillCandidates;
    }

    return skillCandidates.filter(candidate => selectedIds.includes(candidate.id));
}

export function resolveSelectedHubSkills(
    hubSkills: string[],
    selectedValues: string[],
): string[] {
    if (selectedValues.includes(ALL_OPTION)) {
        return hubSkills;
    }

    return hubSkills.filter(skillName => selectedValues.includes(skillName));
}

export function resolveSelectedSyncAgents<T extends SyncTargetAgent>(
    detectedAgents: T[],
    selectedValues: string[],
): T[] {
    if (selectedValues.includes(ALL_OPTION)) {
        return detectedAgents;
    }

    return detectedAgents.filter(agent => selectedValues.includes(agent.key));
}

export function dedupeExecutionTargets<T extends SyncTargetAgent>(
    selectedAgents: T[],
): ExecutionTarget[] {
    const targetMap = new Map<string, ExecutionTarget>();

    for (const agent of selectedAgents) {
        const resolvedSkillsPath = path.resolve(agent.skillsPath);
        const existingTarget = targetMap.get(resolvedSkillsPath);
        if (existingTarget) {
            existingTarget.label = `${existingTarget.label} / ${agent.name}`;
            continue;
        }

        targetMap.set(resolvedSkillsPath, {
            label: agent.name,
            skillsPath: resolvedSkillsPath,
        });
    }

    return Array.from(targetMap.values());
}

export function filterExecutionTargetsAgainstHub(
    executionTargets: ExecutionTarget[],
    hubDir: string,
): ExecutionTarget[] {
    const resolvedHubDir = path.resolve(hubDir);
    return executionTargets.filter(target => path.resolve(target.skillsPath) !== resolvedHubDir);
}

export function isPathInsideDirectory(parentPath: string, targetPath: string): boolean {
    const relativePath = path.relative(path.resolve(parentPath), path.resolve(targetPath));
    return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

export function getDuplicatedSkillNames(skillCandidates: SkillCandidate[]): Set<string> {
    const skillCounts = new Map<string, number>();

    for (const candidate of skillCandidates) {
        skillCounts.set(candidate.name, (skillCounts.get(candidate.name) ?? 0) + 1);
    }

    const duplicatedSkillNames = new Set<string>();
    for (const [skillName, count] of skillCounts) {
        if (count > 1) {
            duplicatedSkillNames.add(skillName);
        }
    }

    return duplicatedSkillNames;
}

export function getDuplicateSkillGroups(selectedCandidates: SkillCandidate[]): DuplicateSkillGroup[] {
    return groupSkillCandidates(selectedCandidates)
        .filter(group => group.candidates.length > 1)
        .sort((left, right) => left.skillName.localeCompare(right.skillName));
}

export function resolveDuplicateSkillCandidatesBySelection(
    selectedCandidates: SkillCandidate[],
    duplicateSelections: Record<string, string>,
): SkillCandidate[] {
    const groupedCandidates = groupSkillCandidates(selectedCandidates);
    const resolvedCandidates: SkillCandidate[] = [];

    for (const group of groupedCandidates) {
        if (group.candidates.length === 1) {
            resolvedCandidates.push(group.candidates[0]);
            continue;
        }

        const selectedCandidateId = duplicateSelections[group.skillName];
        if (!selectedCandidateId) {
            throw new Error(`Missing source selection result for skill "${group.skillName}".`);
        }

        const resolvedCandidate = group.candidates.find(candidate => candidate.id === selectedCandidateId);
        if (!resolvedCandidate) {
            throw new Error(`Source selection result for skill "${group.skillName}" was not found.`);
        }

        resolvedCandidates.push(resolvedCandidate);
    }

    return resolvedCandidates.sort((left, right) => left.name.localeCompare(right.name));
}

function groupSkillCandidates(selectedCandidates: SkillCandidate[]): DuplicateSkillGroup[] {
    const groupedCandidates = new Map<string, SkillCandidate[]>();

    for (const candidate of selectedCandidates) {
        const existingGroup = groupedCandidates.get(candidate.name) ?? [];
        existingGroup.push(candidate);
        groupedCandidates.set(candidate.name, existingGroup);
    }

    return Array.from(groupedCandidates.entries()).map(([skillName, candidates]) => ({
        skillName,
        candidates,
    }));
}

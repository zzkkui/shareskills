#!/usr/bin/env node

import { Command } from 'commander';
import * as p from '@clack/prompts';
import color from 'picocolors';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { AGENTS, DEFAULT_HUB_PATH, AgentConfig } from './constants';
import { safeSyncFolder, ensureDir, getSkillsOverview } from './sync';

const program = new Command();

program
    .name('shareskills')
    .description('Synchronize AI agent skills across different tools safely.')
    .version('1.0.0');

program
    .command('sync')
    .description('Interactively sync detected skills to the central hub')
    .action(async () => {
        p.intro(color.bgCyan(color.black(' ShareSkills AI Sync ')));

        p.note(
            `ShareSkills allows you to use the same 'Custom Instructions' or 'Skills' across all your AI tools.\n` +
            `By syncing them into one central Hub, any change you make in one IDE (like Cursor)\n` +
            `will automatically be available in others (like Antigravity or Windsurf).\n\n` +
            `${color.yellow(color.bold('IMPORTANT:'))} Please close your AI tools (Cursor, VS Code, etc.) before proceeding\n` +
            `to prevent 'Permission Denied' errors while we move your skill folders.`,
            'What is ShareSkills?'
        );

        // 1. Where should the hub be?
        let hubDir = process.env.SHARESKILLS_HUB_PATH;
        if (!hubDir) {
            hubDir = await p.text({
                message: 'Step 1: Where do you want your universal central folder (The Hub)?',
                placeholder: 'e.g. C:\\Users\\Name\\Documents\\AI-Skills',
                initialValue: DEFAULT_HUB_PATH,
                validate: (value) => {
                    if (!value) return 'Please provide a path.';
                },
            }) as string;
        }

        if (p.isCancel(hubDir)) {
            p.cancel('Operation cancelled.');
            process.exit(0);
        }

        const resolvedHubDir = path.resolve(hubDir);

        // Create hub if it doesn't exist
        if (!fs.existsSync(resolvedHubDir)) {
            p.log.info(`Creating a new central Hub directory at: ${color.dim(resolvedHubDir)}`);
            ensureDir(resolvedHubDir);
        }

        // 2. Detect agents
        p.log.step('Searching for installed AI agents on your system...');
        const homeDir = os.homedir();

        const detected: AgentConfig[] = [];
        const notDetected: AgentConfig[] = [];

        for (const agent of AGENTS) {
            const fullPath = path.join(homeDir, agent.relativePath);

            if (fs.existsSync(fullPath)) {
                detected.push({ ...agent, relativePath: fullPath });
            } else {
                notDetected.push({ ...agent, relativePath: fullPath });
            }
        }

        // Show findings
        if (detected.length === 0) {
            p.log.warn('We couldn\'t find any supported AI agents in the default locations.');
        } else {
            p.log.success(`Detected valid paths for: ${detected.map(d => color.green(d.name)).join(', ')}`);
        }

        if (notDetected.length > 0) {
            p.log.info(`The following tools were not found automatically: ${notDetected.map(n => color.gray(n.name)).join(', ')}`);
        }

        // 3. User Selects what to sync
        const options = [
            {
                value: 'ALL',
                label: color.bold('Sync ALL detected agents'),
                hint: 'Connects all found tools to the shared central Hub'
            },
            ...detected.map(agent => ({
                value: agent.name,
                label: agent.name,
                hint: `Join the Hub & share skills from ${agent.relativePath}`
            }))
        ];

        if (detected.length === 0) {
            const proceedManual = await p.confirm({
                message: 'No agents found. Would you like to manually specify a skills folder path?',
                initialValue: true
            });
            if (!proceedManual || p.isCancel(proceedManual)) {
                p.cancel('Operation cancelled.');
                process.exit(0);
            }
        }

        let selectedAgents: AgentConfig[] = [];

        if (detected.length > 0) {
            const selectionResult = await p.multiselect({
                message: 'Which agents should join the shared Hub?',
                options,
                required: true,
            });

            if (p.isCancel(selectionResult)) {
                p.cancel('Operation cancelled.');
                process.exit(0);
            }

            const results = selectionResult as string[];
            if (results.includes('ALL')) {
                selectedAgents = [...detected];
            } else {
                selectedAgents = detected.filter(a => results.includes(a.name));
            }
        }

        // 4. Add Manual Paths via interactive fallback
        let addMore = await p.confirm({
            message: 'Manual Sync: Do you have other AI folders you want to add to the Hub?',
            initialValue: false,
        });

        if (addMore && !p.isCancel(addMore)) {
            p.note(
                `Manual Sync allows you to provide paths for tools we didn't find automatically.\n` +
                `Just point us to the 'skills' folder of that tool, and we'll link it to the Hub.`,
                'Manual Path Entry'
            );
        }

        while (addMore && !p.isCancel(addMore)) {
            const customName = await p.text({
                message: 'Name for this extra tool (e.g. "My Custom Bot"):',
                validate: (value) => { if (!value) return 'Required'; }
            });
            if (p.isCancel(customName)) break;

            const customPath = await p.text({
                message: `Absolute path to the 'skills' folder for ${customName}:`,
                placeholder: 'e.g. C:\\Path\\To\\Tool\\skills',
                validate: (value) => {
                    if (!value) return 'Required';
                    if (!fs.existsSync(value)) return 'This path does not exist on your computer.';
                }
            });
            if (p.isCancel(customPath)) break;

            selectedAgents.push({ name: customName as string, relativePath: customPath as string });

            addMore = await p.confirm({
                message: 'Would you like to add another custom path?',
                initialValue: false,
            });
        }

        if (selectedAgents.length === 0) {
            p.outro('Nothing selected. Exiting.');
            return;
        }

        // 5. Build Overview & Final Confirmation
        const skillList = getSkillsOverview(selectedAgents.map(a => a.relativePath));

        if (skillList.length > 0) {
            p.note(
                skillList.map(s => `• ${color.cyan(s)}`).join('\n'),
                `Discovered ${color.green(skillList.length)} skills to be shared:`
            );

            // Give the user a moment to actually see the list
            await p.confirm({
                message: `Displaying ${skillList.length} skills. Ready to continue?`,
                initialValue: true
            });
        } else {
            p.log.warn('No active skills found in the selected folders.');
        }

        p.log.warn(color.yellow('Final Check: You are about to link these tools to the Hub:'));
        selectedAgents.forEach(a => p.log.info(`- ${a.name}: ${color.dim(a.relativePath)}`));
        p.log.info(`Target Hub: ${color.bgBlue(color.white(` ${resolvedHubDir} `))}`);

        const finalConfirm = await p.confirm({
            message: 'Proceed with synchronization? (Existing folders will be backed up safely)',
            initialValue: true,
        });

        if (!finalConfirm || p.isCancel(finalConfirm)) {
            p.cancel('Sync aborted by user.');
            process.exit(0);
        }

        // 6. Execute Sync
        const s = p.spinner();
        s.start('Synchronizing skills...');

        for (const agent of selectedAgents) {
            await safeSyncFolder(agent.name, agent.relativePath, resolvedHubDir);
        }

        s.stop('Sync complete!');

        p.outro(color.green('All selected agents are now sharing the same skills hub!'));
    });

program.parse(process.argv);

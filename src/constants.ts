import path from 'path';
import os from 'os';

export interface AgentConfig {
  name: string;
  relativePath: string;
}

export const AGENTS: AgentConfig[] = [
  { name: 'Antigravity', relativePath: '.gemini/antigravity/skills' },
  { name: 'Claude Code', relativePath: '.claude/skills' },
  { name: 'Cursor', relativePath: '.cursor/skills' },
  { name: 'Codex', relativePath: '.agents/skills' },
  { name: 'Gemini CLI', relativePath: '.gemini/skills' },
  { name: 'GitHub Copilot', relativePath: '.copilot/skills' },
  { name: 'OpenCode', relativePath: '.config/opencode/skills' },
  { name: 'Windsurf', relativePath: '.codeium/windsurf/skills' },
];

export const DEFAULT_HUB_PATH = path.join(os.homedir(), 'Documents', 'AI-Skills');

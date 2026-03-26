import fs from 'fs';
import path from 'path';
import os from 'os';

export interface AgentConfig {
  key: string;
  name: string;
  skillsDir: string;
  detectDir: string;
}

export const AGENTS: AgentConfig[] = [
  { key: 'cursor', name: 'Cursor', skillsDir: '.cursor/skills', detectDir: '.cursor' },
  { key: 'claude_code', name: 'Claude Code', skillsDir: '.claude/skills', detectDir: '.claude' },
  { key: 'codex', name: 'Codex', skillsDir: '.codex/skills', detectDir: '.codex' },
  { key: 'opencode', name: 'OpenCode', skillsDir: '.config/opencode/skills', detectDir: '.config/opencode' },
  { key: 'antigravity', name: 'Antigravity', skillsDir: '.gemini/antigravity/global_skills', detectDir: '.gemini/antigravity' },
  { key: 'amp', name: 'Amp', skillsDir: '.config/agents/skills', detectDir: '.config/agents' },
  { key: 'kimi_cli', name: 'Kimi Code CLI', skillsDir: '.config/agents/skills', detectDir: '.config/agents' },
  { key: 'augment', name: 'Augment', skillsDir: '.augment/rules', detectDir: '.augment' },
  { key: 'openclaw', name: 'OpenClaw', skillsDir: '.openclaw/skills', detectDir: '.openclaw' },
  { key: 'cline', name: 'Cline', skillsDir: '.cline/skills', detectDir: '.cline' },
  { key: 'codebuddy', name: 'CodeBuddy', skillsDir: '.codebuddy/skills', detectDir: '.codebuddy' },
  { key: 'command_code', name: 'Command Code', skillsDir: '.commandcode/skills', detectDir: '.commandcode' },
  { key: 'continue', name: 'Continue', skillsDir: '.continue/skills', detectDir: '.continue' },
  { key: 'crush', name: 'Crush', skillsDir: '.config/crush/skills', detectDir: '.config/crush' },
  { key: 'junie', name: 'Junie', skillsDir: '.junie/skills', detectDir: '.junie' },
  { key: 'iflow_cli', name: 'iFlow CLI', skillsDir: '.iflow/skills', detectDir: '.iflow' },
  { key: 'kiro_cli', name: 'Kiro CLI', skillsDir: '.kiro/skills', detectDir: '.kiro' },
  { key: 'kode', name: 'Kode', skillsDir: '.kode/skills', detectDir: '.kode' },
  { key: 'mcpjam', name: 'MCPJam', skillsDir: '.mcpjam/skills', detectDir: '.mcpjam' },
  { key: 'mistral_vibe', name: 'Mistral Vibe', skillsDir: '.vibe/skills', detectDir: '.vibe' },
  { key: 'mux', name: 'Mux', skillsDir: '.mux/skills', detectDir: '.mux' },
  { key: 'openclaude', name: 'OpenClaude IDE', skillsDir: '.openclaude/skills', detectDir: '.openclaude' },
  { key: 'openhands', name: 'OpenHands', skillsDir: '.openhands/skills', detectDir: '.openhands' },
  { key: 'pi', name: 'Pi', skillsDir: '.pi/agent/skills', detectDir: '.pi' },
  { key: 'qoder', name: 'Qoder', skillsDir: '.qoder/skills', detectDir: '.qoder' },
  { key: 'qwen_code', name: 'Qwen Code', skillsDir: '.qwen/skills', detectDir: '.qwen' },
  { key: 'trae', name: 'Trae', skillsDir: '.trae/skills', detectDir: '.trae' },
  { key: 'trae_cn', name: 'Trae CN', skillsDir: '.trae-cn/skills', detectDir: '.trae-cn' },
  { key: 'zencoder', name: 'Zencoder', skillsDir: '.zencoder/skills', detectDir: '.zencoder' },
  { key: 'neovate', name: 'Neovate', skillsDir: '.neovate/skills', detectDir: '.neovate' },
  { key: 'pochi', name: 'Pochi', skillsDir: '.pochi/skills', detectDir: '.pochi' },
  { key: 'adal', name: 'AdaL', skillsDir: '.adal/skills', detectDir: '.adal' },
  { key: 'kilo_code', name: 'Kilo Code', skillsDir: '.kilocode/skills', detectDir: '.kilocode' },
  { key: 'roo_code', name: 'Roo Code', skillsDir: '.roo/skills', detectDir: '.roo' },
  { key: 'goose', name: 'Goose', skillsDir: '.config/goose/skills', detectDir: '.config/goose' },
  { key: 'gemini_cli', name: 'Gemini CLI', skillsDir: '.gemini/skills', detectDir: '.gemini' },
  { key: 'github_copilot', name: 'GitHub Copilot', skillsDir: '.copilot/skills', detectDir: '.copilot' },
  { key: 'clawdbot', name: 'Clawdbot', skillsDir: '.clawdbot/skills', detectDir: '.clawdbot' },
  { key: 'droid', name: 'Droid', skillsDir: '.factory/skills', detectDir: '.factory' },
  { key: 'windsurf', name: 'Windsurf', skillsDir: '.codeium/windsurf/skills', detectDir: '.codeium/windsurf' },
  { key: 'moltbot', name: 'MoltBot', skillsDir: '.moltbot/skills', detectDir: '.moltbot' },
];

function resolveDefaultHubBaseDir(): string {
  const homeDir = os.homedir();
  const documentsDir = path.join(homeDir, 'Documents');

  if (fs.existsSync(documentsDir)) {
    return documentsDir;
  }

  return homeDir;
}

export const DEFAULT_HUB_PATH = path.join(resolveDefaultHubBaseDir(), 'AI-Skills');

# skillhubs CLI

Forked from [fALECX/shareskills](https://github.com/fALECX/shareskills).

`skillhubs` is an interactive CLI for collecting skill directories from supported AI tools or custom directories into a central Skills Hub, then linking selected Hub skills back into detected agents or custom target directories.

## What It Does

- Detects supported AI agents under the current user's home directory.
- Lets you choose which detected skills directories should be used as collection sources.
- Lets you add custom source directories.
- Copies selected skill directories into a central Skills Hub.
- Prompts you to resolve duplicate skill names before writing them into the Hub.
- Lets you choose which Hub skills should be synced to which targets.
- Removes any existing target entry with the same name, then creates a link to the Hub skill.
- Uses directory junctions on Windows and directory symlinks on non-Windows platforms.

## Current Scope And Behavior

- The CLI currently exposes one interactive command: `skillhubs sync`.
- A "skill" is treated as a directory entry. Standalone files inside a skills directory are ignored.
- Source directories cannot be the Hub itself or any directory inside the Hub.
- Sync targets cannot be the Hub itself or any directory inside the Hub.
- Built-in target skills directories are created automatically when needed.
- Custom target directories may be new, but their parent directory must already exist.
- This version does not create backups before syncing.
- During sync, an existing target skill with the same name is removed before the new link is created.
- Collection into the Hub is a copy step. After sync, the selected target skills point to the Hub.

## Built-In Agent Detection

Current built-in detection includes 41 agents: Cursor, Claude Code, Codex, OpenCode, Antigravity, Amp, Kimi Code CLI, Augment, OpenClaw, Cline, CodeBuddy, Command Code, Continue, Crush, Junie, iFlow CLI, Kiro CLI, Kode, MCPJam, Mistral Vibe, Mux, OpenClaude IDE, OpenHands, Pi, Qoder, Qwen Code, Trae, Trae CN, Zencoder, Neovate, Pochi, AdaL, Kilo Code, Roo Code, Goose, Gemini CLI, GitHub Copilot, Clawdbot, Droid, Windsurf, and MoltBot.

## Installation

```bash
npm install -g skillhubs
```

## Usage

```bash
skillhubs sync
```

You can also provide the Hub path via environment variable:

```powershell
$env:SKILLHUBS_HUB_PATH = 'D:\AI-Skills'
skillhubs sync
```

If `SKILLHUBS_HUB_PATH` is not set, the default Hub path is:

- `~/Documents/AI-Skills` when the `Documents` directory exists
- `~/AI-Skills` otherwise

## Interactive Workflow

1. Enter the Skills Hub directory, or use `SKILLHUBS_HUB_PATH`.
2. Review detected agents and choose which default source directories to include.
3. Optionally add custom source directories.
4. Select which skills should be copied into the Hub.
5. If the same skill name exists in multiple sources, choose which version should win.
6. Select which Hub skills should be synced.
7. Select detected agent targets and optionally add custom target directories.
8. Confirm sync. Existing target entries with the same name will be removed and replaced with links.

## How Syncing Works

1. The Hub directory is resolved and created if it does not exist.
2. Selected source skill directories are copied into the Hub.
3. Selected Hub skills are linked into selected target skills directories.
4. On Windows, links are created as junctions. On non-Windows platforms, directory symlinks are used.

## Requirements

- Node.js >= 16.7.0

## License

ISC

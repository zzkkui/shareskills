# ShareSkills CLI 🚀

Synchronize AI agent skills and custom instructions across different IDEs and tools (Cursor, Windsurf, Antigravity, etc.) into one **Universal Central Hub**.

## The Problem
Every AI tool (Cursor, Claude Code, Windsurf, etc.) has its own "skills" or "custom instructions" folder. If you update a skill in one IDE, you have to manually copy it to the others.

## The Solution
**ShareSkills** connects all your AI tools to a single, shared folder (The Hub). 
Any change you make in **any** tool is instantly reflected in **all** other tools.

## Features
- 🔄 **One-Way Centralization:** Merges all existing skills into a central Hub.
- 🔗 **Smart Linking:** Replaces local folders with symbolic links (junctions on Windows) so your tools work flawlessly.
- 🛡️ **Safety First:** Automatically creates backups of your original skills before making changes.
- 🤖 **Multi-Agent Support:** Pre-configured for Antigravity, Cursor, Windsurf, Claude Code, and more.
- 🛠️ **Manual Mode:** Add any custom directory to the Hub.

## Installation

```bash
npm install -g shareskills
```

## Quick Start

1. **Close your AI tools** (Cursor, VS Code, etc.) to prevent file access issues.
2. Run the sync command:
   ```bash
   shareskills sync
   ```
3. Follow the interactive prompts to:
   - Choose your Hub location (e.g., `Documents/AI-Skills`).
   - Select which agents you want to synchronize.
   - Add any custom paths.

## How it Works
1. ShareSkills finds your agent folders (e.g., `~/.cursor/skills`).
2. It copies the files into your **Hub**.
3. It renames your original folder to `.backup_[timestamp]`.
4. It creates a **Symbolic Link** from the original location to the Hub.

## License
ISC

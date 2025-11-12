# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a **Claude Code marketplace** containing LSP (Language Server Protocol) server plugins for multiple programming languages. The repository provides 10 different language server plugins that integrate with Claude Code's LSP tool (`$ENABLE_LSP_TOOL=1`).

## Architecture

### Marketplace Structure

The repository follows the Claude Code marketplace plugin structure:

```
.
├── .claude-plugin/
│   └── marketplace.json         # Marketplace manifest listing all plugins
├── <language-name>/             # One directory per LSP plugin
│   ├── plugin.json              # Plugin metadata (name, version, description, etc.)
│   └── .lsp.json                # LSP server configuration
└── README.md                    # Installation instructions and documentation
```

### Plugin Configuration Format

Each plugin directory contains two critical files:

1. **`plugin.json`**: Metadata about the plugin
   - `name`: Plugin identifier (matches directory name)
   - `version`: Semantic version
   - `description`: Human-readable description
   - `author`: Author information
   - `repository`: Link to upstream LSP server
   - `license`: License information
   - `keywords`: Search/categorization tags

2. **`.lsp.json`**: LSP server runtime configuration
   - `<language-id>`: Language identifier used by Claude Code
   - `command`: Executable name or path to LSP server binary
   - `args`: Command-line arguments passed to the server
   - `extensionToLanguage`: Maps file extensions to language identifiers
   - `transport`: Communication protocol (always "stdio" for current plugins)
   - `initializationOptions`: LSP initialization parameters
   - `settings`: Language server-specific settings
   - `maxRestarts`: Maximum restart attempts on crash (typically 3)

### Supported Languages

The marketplace includes plugins for:

| Plugin | Language | LSP Server | Command |
|--------|----------|------------|---------|
| vtsls | TypeScript/JavaScript | vtsls | `vtsls --stdio` |
| rust-analyzer | Rust | rust-analyzer | `rust-analyzer` |
| pyright | Python | Pyright | `pyright` |
| gopls | Go | gopls | `gopls` |
| jdtls | Java | Eclipse JDT LS | `jdtls` |
| clangd | C/C++ | clangd | `clangd` |
| ruby-lsp | Ruby | ruby-lsp | `ruby-lsp` |
| vscode-langservers | HTML/CSS | vscode-langservers-extracted | (html/css servers) |
| phpactor | PHP | Phpactor | `phpactor` |
| omnisharp | C# | OmniSharp | `omnisharp` |

## Development Guidelines

### Adding a New Language Server Plugin

1. Create a new directory with the plugin name (lowercase, hyphenated)
2. Create `plugin.json` with metadata:
   ```json
   {
     "name": "language-name",
     "version": "0.1.0",
     "description": "Brief description",
     "author": {
       "name": "Piebald LLC",
       "email": "support@piebald.ai"
     },
     "repository": "https://github.com/upstream/repo",
     "license": "License-Type",
     "keywords": ["language", "lsp", "language-server"]
   }
   ```
3. Create `.lsp.json` with LSP configuration:
   ```json
   {
     "language-id": {
       "command": "lsp-executable",
       "args": ["--stdio"],
       "extensionToLanguage": {
         ".ext": "language-id"
       },
       "transport": "stdio",
       "initializationOptions": {},
       "settings": {},
       "maxRestarts": 3
     }
   }
   ```
4. Add plugin entry to `.claude-plugin/marketplace.json`
5. Update README.md with installation instructions for the LSP server

### Modifying Existing Plugin Configuration

- **To change LSP server settings**: Edit the `.lsp.json` file in the plugin directory
- **To update plugin metadata**: Edit `plugin.json` in the plugin directory
- **To add/remove plugins from marketplace**: Edit `.claude-plugin/marketplace.json`

### Important Constraints

- All plugins use `"transport": "stdio"` (standard input/output communication)
- The `command` in `.lsp.json` must be available in the user's PATH or be an absolute path
- File extensions in `extensionToLanguage` must start with a dot (`.`)
- Language identifiers should follow LSP specification conventions
- `maxRestarts: 3` is the standard failsafe to prevent infinite restart loops

## Testing and Validation

### Testing a Plugin Locally

1. Install the marketplace:
   ```bash
   claude
   /plugin marketplace add <path-to-this-repo>
   ```

2. Install the specific plugin:
   ```bash
   claude
   /plugins
   # Navigate to this marketplace, select plugin, press 'i' to install
   ```

3. Restart Claude Code and verify LSP server starts

4. Test LSP operations in a project with the target language:
   - Use `$ENABLE_LSP_TOOL=1` environment variable to enable LSP tool
   - Verify `goToDefinition`, `hover`, `findReferences`, etc. work

### Validation Checklist

- [ ] Plugin directory name matches plugin.json `name` field
- [ ] `.lsp.json` language ID is unique and descriptive
- [ ] LSP server command is documented in README.md installation instructions
- [ ] File extensions map to correct language identifiers
- [ ] Plugin is listed in `.claude-plugin/marketplace.json`
- [ ] Repository link points to upstream LSP server project
- [ ] Keywords/tags are relevant for searchability

## Git Workflow

This repository uses simple main-branch development:
- **Main branch**: `main` (default for PRs and development)
- Commit style: Standard conventional commits recommended
- No specific branching strategy required (small repository)

## External Dependencies

Each plugin requires users to install the corresponding LSP server binary:
- Installation instructions are in README.md
- LSP servers must be in PATH or configured with absolute paths
- Most LSP servers are installed via language-specific package managers (npm, cargo, gem, pip, go install, etc.)

# Claude Code LSPs

This repository contains a [Claude Code marketplace](...) with plugins that offer LSP servers for TypeScript, Rust, X, Y, Z.  [LSP servers]() provide powerful and familiar code intelligence features to IDEs, and now Claude Code directly.

[**Claude Code is going to officially support LSP soon.**](linktoreddit)  In 2.0.30 (October 31st) they adding the working beginnings of a system to run LSP servers from plugins automatically on startup, and an `LSP` tool (enable via `$ENABLE_LSP_TOOL=1`) that Claude can use to
- Go to the definition for symbols (`goToDefinition`)
- Hover over symbols (`hover`)
- List all the symbols in a file (`documentSymbol`)
- Find all references to a symbol (`findReferences`)
- Search for symbols across the workspace (`workspaceSymbol`)

> [!warning]
> Support for LSP in Claude Code is pretty raw still.  There are bugs in the different LSP operations, no documention, and no UI indication that your LSP servers are started/running/have errors or even exist.  But it's there, and with [tweakcc](https://github.com/Piebald-AI/tweakcc) you can make it work.

## Patching Claude Code

You can manually patch it, but it's much easier to use [tweakcc](https://github.com/Piebald-AI/tweakcc) to automatically detect your Claude Code installation (npm or native) apply the necessary patches.

Run `npx tweakcc --apply`.  It will automatically patch your Claude Code installation to make LSP support usable.  (It also does a bunch of other things like let you customize all the system prompt parts, create new CC themes, change the thinking verbs, and a lot more.)

If you'd like to apply the patches yourself, go the bottom of this page.

## Installing the plugins

Install them the usual way.  First make CC aware of the marketplace:
1. Run `claude`
2. `/plugin marketplace add Piebald-AI/claude-code-lsps`

Then enable the plugins of your choice:
1. Run `claude`
2. Type `/plugins`
3. Choose `Browse and install plugins`
4. Enter the `Claude Code Language Servers` marketplace
5. Select the plugins you'd like with the spacebar (e.g. TypeScript, Rust)
6. Press "i" to install them
7. Restart Claude Code

Here's a screenshot:

<img width="603" height="374" alt="image" src="https://github.com/user-attachments/assets/207ebb79-8c45-446b-9c08-eb81d235c301" />


## Language-specific setup instructions

You need to install various components in order for the plugins to use them:

### Rust

Uses `rust-analyzer`, the official modern Rust Language Server and the same one used by the official VS Code extension.  If you have `rustup`, installing `rust-analyzer` is easy:

```bash
rustup component add rust-analyzer
```

The `rust-analyzer` executable needs to be in your PATH.

### JavaScript/TypeScript

Install the `typescript-language-server` and `typescript` packages globally:
```bash
# npm
npm install -g typescript-language-server typescript

# pnpm
pnpm install -g typescript-language-server typescript

# bun
bun install -g typescript-language-server typescript
```
Make sure the `typescript-language-server` executable is in your PATH.



## Patching Claude Code manually

Note that this will only work with npm-based installations.  If you have the native installation (run `claude doctor` to check), then tweakcc is your only option.

1. Find your `cli.js`.  Depending on where you installed it, it could be in several different locations.  It's often at `NPM_ROOT/@anthropic-ai/claude-code/cli.js`&mdash;use `npm root -g` to get your global installation location.

2.

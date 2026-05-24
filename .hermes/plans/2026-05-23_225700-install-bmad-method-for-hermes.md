# Plan: Install BMAD-METHOD for Hermes Agent

## Goal

Install the BMAD-METHOD framework (https://github.com/bmad-code-org/BMAD-METHOD) so its skills, agents, and workflows are usable from Hermes Agent.

## Background

**BMAD-METHOD** (v6.7.1) is an AI-driven agile development framework providing 12+ specialized agent personas (PM, Architect, Developer, UX Designer, etc.) and 34+ structured workflows covering analysis, planning, solutioning, and implementation. It's installed via `npx bmad-method install`.

**The problem:** BMAD's installer supports ~50 AI platforms (Claude Code, Cursor, Codex, etc.) but does NOT have a "hermes" platform code. Hermes Agent loads skills from `~/.hermes/skills/` using YAML-frontmatter SKILL.md files.

**The gap:** BMAD skills use:
- SKILL.md with simple YAML frontmatter (`name`, `description` only)
- `customize.toml` sidecar files for agent persona configuration
- Python scripts (`resolve_customization.py`, `resolve_config.py`) for runtime config resolution
- A `_bmad/` project folder with config, scripts, and customization overrides

Hermes skills use:
- SKILL.md with richer YAML frontmatter (`name`, `description`, `version`, `author`, `license`, `platforms`, `metadata`)
- No sidecar TOML files — all config is inline in the SKILL.md
- Skills grouped into category subdirectories under `~/.hermes/skills/`

## Proposed Approach

**Strategy: Install to a temp project directory using the `claude-code` tool option, then adapt and copy the skill files into Hermes's skill directory structure.**

This avoids trying to patch the BMAD installer and instead manually bridges the gap.

## Step-by-Step Plan

### Step 1: Prerequisites
- Verify Node.js >= 20.12.0 is installed
- Verify Python >= 3.10 is installed
- Verify `uv` is installed (needed for BMAD scripts)

### Step 2: Clone BMAD-METHOD repo
```bash
cd /tmp
git clone https://github.com/bmad-code-org/BMAD-METHOD.git
cd BMAD-METHOD
npm install
```

### Step 3: Run BMAD installer with `claude-code` tool
```bash
npx bmad-method install --directory /tmp/bmad-target --modules bmm --tools claude-code --yes
```
This creates:
- `/tmp/bmad-target/_bmad/` — config, scripts, customizations
- `/tmp/bmad-target/.claude/skills/` — all skill SKILL.md files (flattened)

### Step 4: Inspect installed files
- List all installed skill files under `.claude/skills/`
- List all config/script files under `_bmad/`
- Catalog what needs adaptation

### Step 5: Create Hermes skill directory structure
```bash
mkdir -p ~/.hermes/skills/software-development/bmad-method
```

### Step 6: Copy and adapt skills
For each BMAD skill file:
1. Copy the SKILL.md to `~/.hermes/skills/software-development/bmad-method/<skill-name>/SKILL.md`
2. Add Hermes-compatible frontmatter (version, author, license, platforms, metadata)
3. Copy `customize.toml` alongside if present
4. Adjust any `{skill-root}` / `{project-root}` path references to work from the Hermes skill directory

### Step 7: Copy supporting infrastructure
- Copy `_bmad/scripts/` to a shared location accessible by skills
- Copy `_bmad/config.toml` and `_bmad/custom/` for customization support
- Ensure Python scripts are executable and paths are correct

### Step 8: Create a BMAD orchestrator skill
Write a top-level `bmad-method/SKILL.md` that:
- Lists all available BMAD agents and workflows
- Provides instructions for activating agent personas
- References the sub-skills for each workflow phase

### Step 9: Test
- Run `hermes skills list` to verify skills appear
- Load the orchestrator skill: `/skill bmad-method`
- Test activating a specific agent (e.g., Mary the Business Analyst)

## Files Likely to Change

| Path | Action |
|------|--------|
| `~/.hermes/skills/software-development/bmad-method/` | Create — all BMAD skills |
| `~/.hermes/skills/software-development/bmad-method/SKILL.md` | Create — orchestrator |
| `~/.hermes/skills/software-development/bmad-method/scripts/` | Create — Python helpers |
| `~/.hermes/skills/software-development/bmad-method/config/` | Create — BMAD config |

## Key Risks & Tradeoffs

1. **Script dependencies**: BMAD skills reference Python scripts that resolve TOML configs. These need to be accessible from the Hermes skill directory. May need to adjust paths.

2. **customize.toml sidecars**: Hermes doesn't natively support sidecar config files. Options:
   - Inline the TOML content into SKILL.md (loses BMAD's override chain)
   - Keep TOML files and instruct the agent to read them manually
   - Write a Hermes-compatible adapter script

3. **Project-level `_bmad/` folder**: BMAD expects a `_bmad/` folder in each project. For Hermes, we can either:
   - Create it on-demand when a BMAD skill is activated
   - Store a template in the skill directory and copy it to the project

4. **Updates**: BMAD releases new versions frequently. We'll need a manual update process (re-run installer, re-copy).

5. **Agent persona activation**: BMAD agents use `customize.toml` to define personas. In Hermes, these personas would be described inline in the SKILL.md content, which the LLM reads and follows.

## Open Questions

- Should BMAD skills be installed globally (`~/.hermes/skills/`) or per-project (`.hermes/skills/`)?
- Should we create a Hermes skill that automates the BMAD install/update process?
- Do we need all 34+ workflows or just the core agent personas?

## Verification

1. `hermes skills list` shows all BMAD skills
2. `/skill bmad-method` loads without errors
3. Activating an agent persona (e.g., "talk to Mary") works
4. A BMAD workflow (e.g., "create a product brief") executes end-to-end

// The headless harness adapters of the watcher door, one fresh call per agent stage, and which
// of them run their stages inside the guardrail. Pure data, node built-ins only; the engine and
// the configuration validator both read it.
//
// Every adapter: `bin` on PATH (an override in `env`, a path ending in .mjs/.js/.cjs runs under
// this node, for the tests), and `args(prompt, turns, ctx)` where ctx = { pluginRoot }. The flags
// bypass the harness's own approval prompts (spec §8: a headless stage cannot answer them; the
// envelope is the brake) and, where the harness has one, limit what else loads into the stage.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const HARNESSES = {
  'claude-code': {
    bin: 'claude',
    env: 'ULTRAPOWERS_CLAUDE',
    // --plugin-dir: the stage loads the engine's own plugin checkout, so the skills its prompt
    // names and the guardrail hook come from the same version as the engine, whether or not the
    // host has the plugin enabled or installed from a marketplace.
    args: (prompt, turns, ctx = {}) => ['-p', prompt, '--permission-mode', 'bypassPermissions', '--max-turns', String(turns), '--output-format', 'json', '--plugin-dir', ctx.pluginRoot ?? PLUGIN_ROOT],
  },
  codex: {
    bin: 'codex',
    env: 'ULTRAPOWERS_CODEX',
    // --dangerously-bypass-hook-trust: a plugin hook Codex has not been trusted interactively is
    // skipped otherwise, and the guardrail is that hook. --ignore-user-config keeps the user's
    // MCP servers out; the project's .codex/config.toml still loads.
    args: (prompt) => ['exec', '--json', '--dangerously-bypass-approvals-and-sandbox', '--dangerously-bypass-hook-trust', '--skip-git-repo-check', '--ignore-user-config', prompt],
  },
  copilot: {
    bin: 'copilot',
    env: 'ULTRAPOWERS_COPILOT',
    args: (prompt) => ['-p', prompt, '--allow-all-tools', '--no-ask-user', '--output-format', 'json', '-s', '--disable-builtin-mcps'],
  },
  cursor: {
    bin: 'agent',
    env: 'ULTRAPOWERS_CURSOR_AGENT',
    args: (prompt) => ['-p', '--force', '--trust', '--output-format', 'json', prompt],
  },
  gemini: {
    bin: 'gemini',
    env: 'ULTRAPOWERS_GEMINI',
    // -e ultrapowers: only this extension loads; the guardrail reaches Gemini through the
    // project's .gemini/settings.json BeforeTool hook that init writes.
    args: (prompt) => ['-p', prompt, '--approval-mode=yolo', '--output-format', 'json', '--skip-trust', '-e', 'ultrapowers'],
  },
  qwen: {
    bin: 'qwen',
    env: 'ULTRAPOWERS_QWEN',
    args: (prompt) => ['-p', prompt, '--yolo', '--output-format', 'json', '-e', 'ultrapowers'],
  },
  opencode: {
    bin: 'opencode',
    env: 'ULTRAPOWERS_OPENCODE',
    // Never --pure: it would drop the plugin, and the guardrail with it.
    args: (prompt) => ['run', '--format', 'json', '--dangerously-skip-permissions', prompt],
  },
  pi: {
    bin: 'pi',
    env: 'ULTRAPOWERS_PI',
    // --no-extensions plus -e <ours>: the one extension that carries the guardrail, and no other.
    args: (prompt, turns, ctx = {}) => ['-p', '--mode', 'json', '--no-session', '--approve', '--no-extensions', '-e', path.join(ctx.pluginRoot ?? PLUGIN_ROOT, '.pi', 'extensions', 'ultrapowers.ts'), prompt],
  },
  droid: {
    bin: 'droid',
    env: 'ULTRAPOWERS_DROID',
    args: (prompt) => ['exec', '--skip-permissions-unsafe', '--output-format', 'json', prompt],
  },
  kimi: {
    bin: 'kimi',
    env: 'ULTRAPOWERS_KIMI',
    args: (prompt) => ['-p', prompt, '--output-format', 'stream-json'],
  },
  hermes: {
    bin: 'hermes',
    env: 'ULTRAPOWERS_HERMES',
    // --accept-hooks: a non-interactive run cannot answer the hook consent prompt.
    args: (prompt) => ['chat', '--oneshot', '-q', prompt, '--format', 'stream-json', '--yolo', '--accept-hooks'],
  },
  antigravity: {
    bin: 'agy',
    env: 'ULTRAPOWERS_AGY',
    args: (prompt) => ['-p', prompt, '--output-format', 'json', '--dangerously-skip-permissions'],
  },
  devin: {
    bin: 'devin',
    env: 'ULTRAPOWERS_DEVIN',
    args: (prompt) => ['-p', prompt, '--permission-mode', 'dangerous', '--respect-workspace-trust', 'false'],
  },
};

export const HARNESS_NAMES = Object.keys(HARNESSES);

// The harnesses whose headless stages run inside the guardrail: a plugin hook (Claude Code,
// Codex, Copilot CLI, Cursor, Qwen Code, Droid, Kimi Code, Antigravity), an in-process hook
// (OpenCode, Pi, Hermes) or the project hook init writes (Gemini CLI). Devin's plugin hooks are
// documented as best effort and fail open, so the watcher refuses it.
export const GUARDED_HARNESSES = HARNESS_NAMES.filter((n) => n !== 'devin');

// A harness whose hook can fail open on its own errors (a crashed or timed-out hook lets the
// call through): still guarded, named in the documentation.
export const FAIL_OPEN_ON_ERROR = ['kimi', 'gemini', 'qwen', 'droid'];

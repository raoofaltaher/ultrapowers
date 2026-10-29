---
name: windows-tests-start-tools-by-absolute-path
description: A test that plants a fake tool in a folder and then starts the real tool by bare name with that folder as cwd runs the fake on the Windows CI runner (Node 22 searches the child's cwd first) and passes on a local Node 26; read the result from a file or start the tool from an absolute path
metadata:
  type: gotcha
date: 2026-10-29
---
`execFileSync('git', args, { cwd: root })` on Windows resolves `git` in `root` before PATH on the GitHub runner's Node 22: a `git.exe` planted in `root` (a copy of node, in `tests/init/test-secret-denies.mjs`) ran instead of git and returned nothing, so the planted-git test was red on Windows CI from the day it was added (fb40b2c, 2026-10-23) while it passed on the owner's machine with Node 26, which no longer searches the cwd.

**Why:** the lookup of a bare command name by Node's spawn on Windows depends on the Node (libuv) version; the plugin's own code never hits it because `hooks/lib/resolve-tool.mjs` starts every tool from an absolute PATH entry, but a test helper that spawns by bare name does.

**How to apply:** in a test that plants an executable, never start a tool by bare name with that folder as cwd; read the effect from a file (here `.git/config`) or resolve the tool with `resolveTool` first. A Windows-only CI failure with an empty result and a local pass is this before it is anything else. Related: [[windows-node-test-spawn-failures-under-load]].

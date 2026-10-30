@AGENTS.md
@.agents/memory/MEMORY.md

## Claude Code notes

- Claude Code settings are in `.claude/settings.json`. This repository ignores the whole `.claude/` folder, so each clone keeps its own copy; init writes a changed version as a proposal beside it. Personal overrides go in `.claude/settings.local.json`.
- The output style is `STE Explanatory`, stored at `.claude/output-styles/ste-explanatory.md` and selected by `outputStyle` in the settings file.
- `.claude/settings.json` pre-approves the test and build commands of the toolchains init found at the project root when it wrote the file (`npm test`, `pytest`, `dotnet test`, `cargo test` or `go test`, and the matching builds), which run repository code without a prompt; a toolchain it did not find has no entry. Remove the entries your team does not accept. It also denies reads of the `.env`, `.env.local`, the `.env.*.local`, `.env.development`, `.env.test`, `.env.staging`, `.env.production`, `.env.secret` and `.env.secrets` files and the `.dev.vars` and `.dev.vars.*` files (`.env.example` stays readable), `.agents/mcp-secrets.env` and the credential folders and files of the home directory (`~/.ssh`, `~/.aws`, the `gh` and `glab` configurations, `~/.git-credentials`, `~/.netrc`, `~/.npmrc`, `~/.gnupg`, `~/.kube`, the Docker config), denies the `--no-index`, `/dev/null`, `--contents`, `-S` and `--ignore-revs-file` forms of `git diff` and `git blame` that read a file outside the checkout (`git blame` itself asks first), denies the `rev:path` forms of `git show` that name an `.env` or `.dev.vars` file at any depth (`git show HEAD:web/.env`), and denies `--output` (and its abbreviations) on `git log`, `git diff` and `git show`, which would otherwise write a file without a prompt.
- Hooks are declared in the `hooks` object of `.claude/settings.json`.
- Project MCP servers are declared in `.mcp.json`, with secrets as `${VAR}` placeholders whose names are listed in `.agents/mcp-secrets.env.example`.

import json
import os
import re
import shlex
from pathlib import Path

BOOTSTRAP_MARKER = "ultrapowers:using-ultrapowers bootstrap for hermes"

# Team memory (ultrapowers piece 4). Hermes accepts injected context on the
# first turn only (pre_llm_call with is_first_turn) and has no post-compaction
# hook, so Hermes users get the one-line nudge at session start and no rescue
# line after compaction. The AGENTS.md criteria carry the rest.
TEAM_MEMORY_NUDGE = (
    "Team-memory: if this session verified a durable, expensive-to-rediscover, "
    "non-derivable fact, save it to `{store}` with the team-memory skill."
)


def _team_memory_store(start_dir: str):
    """Relative POSIX path from start_dir to the nearest .agents/memory/ that
    holds a MEMORY.md at or above it (".agents/memory/", "../.agents/memory/",
    ...), or None. Same contract as hooks/lib/team-memory-common's
    find_memory_store. A missing start_dir yields None, never an exception.
    """
    if not os.path.isdir(start_dir):
        return None
    current = os.path.realpath(start_dir)
    prefix = ""
    while True:
        if os.path.isfile(os.path.join(current, ".agents", "memory", "MEMORY.md")):
            return f"{prefix}.agents/memory/"
        parent = os.path.dirname(current)
        if parent == current:
            return None
        current = parent
        prefix = "../" + prefix


def _skills_dir() -> str:
    """Locate the stock skills/ tree for either supported install layout.

    - git-clone install (`hermes plugins install raoofaltaher/ultrapowers`): the plugin
      dir is the repo root, so `.hermes-plugin/` and `skills/` are siblings and
      this module resolves `../skills`.
    - flattened install (plugin files copied to the plugin dir root): `skills/`
      sits next to this module.

    Raises loudly when neither matches — a bootstrap that silently skips is how
    a broken install masquerades as a working one.
    """
    here = os.path.dirname(os.path.realpath(__file__))
    candidates = (
        os.path.realpath(os.path.join(here, "..", "skills")),
        os.path.realpath(os.path.join(here, "skills")),
    )
    for cand in candidates:
        if os.path.isfile(os.path.join(cand, "using-ultrapowers", "SKILL.md")):
            return cand
    raise RuntimeError(
        "ultrapowers plugin: cannot find the skills/ tree "
        f"(looked at {candidates}). Reinstall with "
        "`hermes plugins install raoofaltaher/ultrapowers`."
    )


def _strip_frontmatter(content: str) -> str:
    match = re.match(r"^---\n[\s\S]*?\n---\n([\s\S]*)$", content)
    return (match.group(1) if match else content).strip()


def _frontmatter_value(content: str, key: str) -> str:
    """Return a flat ``key: value`` scalar from a SKILL.md frontmatter block.

    Hermes reads a skill's description from ``register_skill``'s ``description``
    argument, which defaults to "": registering only the path left every skill
    with a blank description in the skill catalogue, so the model had nothing to
    select on. Skill frontmatter is a flat block of single-line scalars, so a
    line scan covers it without a YAML dependency.
    """
    match = re.match(r"^---\n([\s\S]*?)\n---\n", content)
    if not match:
        return ""
    for line in match.group(1).splitlines():
        name, sep, value = line.partition(":")
        if sep and name.strip() == key:
            return value.strip().strip("\"'")
    return ""


def _build_bootstrap(skills_dir: str) -> str:
    with open(
        os.path.join(skills_dir, "using-ultrapowers", "SKILL.md"),
        encoding="utf-8",
    ) as f:
        body = _strip_frontmatter(f.read())

    tools_path = os.path.join(
        skills_dir, "using-ultrapowers", "references", "hermes-tools.md"
    )
    with open(tools_path, encoding="utf-8") as f:
        tool_mapping = f.read().strip()

    return (
        f"<EXTREMELY_IMPORTANT>\n"
        f"{BOOTSTRAP_MARKER}\n\n"
        f"You have ultrapowers.\n\n"
        f"The using-ultrapowers skill content is included below and is already "
        f"loaded for this Hermes session. Follow it now. "
        f"Do not try to load using-ultrapowers again.\n\n"
        f"{body}\n\n"
        f"## Loading Ultrapowers Skills on Hermes\n\n"
        f"Ultrapowers skills are registered with Hermes' native skill loader: "
        f'invoke one with `skill_view("ultrapowers:skill-name")` '
        f'(for example `skill_view("ultrapowers:brainstorming")`). '
        f"If a namespaced lookup returns 'not found', read the skill file "
        f"directly instead:\n"
        f'`read_file("{skills_dir}/skill-name/SKILL.md")`\n\n'
        f"The ultrapowers skills directory is: `{skills_dir}`\n\n"
        f"{tool_mapping}\n"
        f"</EXTREMELY_IMPORTANT>"
    )


NUDGE_SCAFFOLD = (
    "This project has no ultrapowers scaffold. "
    "Offer /ultrapowers:init before other work."
)
NUDGE_REPAIR = (
    "This project's .agents/ultrapowers.json is unreadable. "
    "Offer /ultrapowers:init to repair it before other work."
)
NUDGE_PLATFORMS = (None, "", "cli")


def _plugin_version():
    here = os.path.dirname(os.path.realpath(__file__))
    try:
        with open(os.path.join(here, "plugin.yaml"), encoding="utf-8") as f:
            for line in f:
                match = re.match(r"^version:\s*['\"]?([0-9][^'\"\s]*)", line)
                if match:
                    return match.group(1)
    except OSError:
        pass
    return None


def _version_less(a, b):
    def parts(v):
        return [int(re.sub(r"\D", "", p) or 0) for p in str(v).split(".")]

    pa, pb = parts(a), parts(b)
    width = max(len(pa), len(pb))
    pa += [0] * (width - len(pa))
    pb += [0] * (width - len(pb))
    return pa < pb


def _find_marker(start):
    current = os.path.abspath(start)
    while True:
        candidate = os.path.join(current, ".agents", "ultrapowers.json")
        if os.path.isfile(candidate):
            return candidate
        parent = os.path.dirname(current)
        if parent == current:
            return None
        current = parent


def _in_git_repo(start):
    current = os.path.abspath(start)
    while True:
        if os.path.exists(os.path.join(current, ".git")):
            return True
        parent = os.path.dirname(current)
        if parent == current:
            return False
        current = parent


def _project_nudge(directory):
    """One line for the first turn when the project needs /ultrapowers:init.

    Read-only. Mirrors hooks/session-start: missing marker, older
    pluginVersion, or an unreadable marker each get a line; a current
    project gets none. ULTRAPOWERS_NUDGE=off silences every line, and a
    directory outside any git repository gets no scaffold line.
    """
    if os.environ.get("ULTRAPOWERS_NUDGE", "").lower() == "off":
        return None
    marker = _find_marker(directory)
    if marker is None:
        return NUDGE_SCAFFOLD if _in_git_repo(directory) else None
    try:
        with open(marker, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return NUDGE_REPAIR
    recorded = data.get("pluginVersion") if isinstance(data, dict) else None
    # The marker is project content; only a plain dotted version may reach the bootstrap.
    if not isinstance(recorded, str) or not re.fullmatch(r"[0-9]+(?:[.][0-9]+){0,3}", recorded):
        return NUDGE_REPAIR
    current = _plugin_version()
    if current and _version_less(recorded, current):
        return (
            f"This project's ultrapowers scaffold is from version {recorded}; "
            f"the plugin is {current}. "
            "Offer /ultrapowers:init to upgrade before other work."
        )
    return None


def _with_project_nudge(bootstrap, platform):
    # Only a terminal session has a project directory; messaging gateways
    # run from wherever the gateway process started.
    if platform not in NUDGE_PLATFORMS:
        return bootstrap
    try:
        nudge = _project_nudge(os.getcwd())
    except Exception:
        return bootstrap
    if not nudge:
        return bootstrap
    close = "</EXTREMELY_IMPORTANT>"
    at = bootstrap.rfind(close)
    if at == -1:
        return f"{bootstrap}\n\n{nudge}"
    return f"{bootstrap[:at]}\n{nudge}\n{bootstrap[at:]}"


def _guardrail_cli(skills_dir):
    """Path of hooks/lib/guardrail-cli.mjs for either install layout, or None."""
    root = os.path.dirname(skills_dir)
    for cand in (
        os.path.join(root, "hooks", "lib", "guardrail-cli.mjs"),
        os.path.join(os.path.dirname(os.path.realpath(__file__)), "hooks", "lib", "guardrail-cli.mjs"),
    ):
        if os.path.isfile(cand):
            return cand
    return None


def _run_active(start_dir):
    """The deny prefix of the run that may guard a call made from start_dir, or None.

    A run record (a *.json file in .ultrapowers/runs/) counts only up to the nearest project root,
    the first folder holding .agents/ultrapowers.json; .ultrapowers/autopilot-active counts at any
    height. This is only the fast path that decides whether the hook is spawned, and it may be
    conservative (a record of another session passes it); the hook decides whose run it is. The
    prefix of a record is read from its file name (qa-<id>-<hex>.json, hunt-<id>-<hex>.json): HUNT
    when any record is a hunt's, as the hook picks a hunt before QA. A headless watcher stage
    carries ULTRAPOWERS_AUTOPILOT_INSIDE=1: without a marker the run is then an autopilot stage, and
    the hook decides (outside any project it denies), as in the hook.
    """
    current = os.path.realpath(start_dir)
    past_project = False
    while True:
        base = os.path.join(current, ".ultrapowers")
        if not past_project:
            try:
                records = [n for n in os.listdir(os.path.join(base, "runs")) if n.endswith(".json")]
            except OSError:
                records = []
            if records:
                return "HUNT-GUARDRAIL" if any(n.startswith("hunt-") for n in records) else "QA-GUARDRAIL"
        if os.path.isfile(os.path.join(base, "autopilot-active")):
            return "AUTOPILOT-GUARDRAIL"
        if os.path.isfile(os.path.join(current, ".agents", "ultrapowers.json")):
            past_project = True
        parent = os.path.dirname(current)
        if parent == current:
            return "AUTOPILOT-GUARDRAIL" if os.environ.get("ULTRAPOWERS_AUTOPILOT_INSIDE") == "1" else None
        current = parent


def _under(path, root):
    """True when path is root or inside it (symlinks resolved, case folded on Windows)."""
    path = os.path.normcase(os.path.realpath(path))
    root = os.path.normcase(os.path.realpath(root))
    return path == root or path.startswith(root.rstrip(os.sep) + os.sep)


def _node_binary(cwd, projects=()):
    """The node executable from the absolute PATH entries, or None.

    Never the project's: a relative entry (`.`, `bin`), an entry that is the working directory and
    every entry at or under a project root in `projects` (a node_modules/.bin that npm run adds, a
    tools folder of the repository) are skipped, as hooks/lib/resolve-tool.mjs skips them, so a node
    or node.cmd planted in the project is not run. shutil.which is not used: on Windows it searches
    the current directory first unless NoDefaultCurrentDirectoryInExePath is set in this process's
    environment.
    """
    here = os.path.normcase(os.path.realpath(cwd)) if cwd else None
    roots = [p for p in projects if p]
    if os.name == "nt":
        exts = [e for e in os.environ.get("PATHEXT", ".COM;.EXE;.BAT;.CMD").split(";") if e]
    else:
        exts = [""]
    for entry in os.environ.get("PATH", "").split(os.pathsep):
        entry = entry.strip().strip('"')
        if not entry or not os.path.isabs(entry):
            continue
        if here and os.path.normcase(os.path.realpath(entry)) == here:
            continue
        if any(_under(entry, root) for root in roots):
            continue
        for ext in exts:
            cand = os.path.join(entry, "node" + ext)
            if os.path.isfile(cand) and os.access(cand, os.X_OK):
                return cand
    return None


# The arguments of a Hermes tool that name a file or a directory (read_file, write_file, patch and
# search_files take `path`; terminal takes `workdir`; the others are the spellings the guard reads).
_PATH_ARGS = ("path", "file_path", "filePath", "notebook_path", "file", "workdir", "working_directory", "Cwd", "dir_path")
_DIR_ARGS = ("workdir", "working_directory", "Cwd", "dir_path")
_DIR_CHANGE = re.compile(r"(?:^|[\s;&|(){}`])(?:cd|pushd|popd|chdir)(?=$|[\s;&|(){}`])", re.IGNORECASE)
# A shell removes quotes and backslashes before it runs a word, so `'cd' src`, `c\d src` and `c""d src` change
# the directory; `eval`, or an expansion used as the program (`C=cd; $C src`), can build a `cd` the text never shows.
_PROTECTED = " \t\r\n;&|()<>{}"
_PROTECTED_SINGLE = _PROTECTED + "$`"
_SKIPPED_WORD = re.compile(r"^(?:\w+=.*|\d*[<>].*|!|\{|\}|then|do|else|elif|if|while|until|builtin|command|time|exec)$")
_OPERATORS = re.compile(r"[;&|()<>`=]+")
RELATIVE_PATH = "a relative path cannot be verified on Hermes; use an absolute path"


def _is_absolute(path):
    # On Windows a rooted path with no drive (/tmp/x) names one place on the current drive; the guard reads it so too.
    return os.path.isabs(path) or (os.name == "nt" and path[:1] in ("/", "\\"))


def _unquoted(command):
    """The command as the shell reads it once its quotes and backslashes are removed. What a quote or a
    backslash protects (a space, an operator; in single quotes an expansion too) becomes `_`, so a quoted
    string stays one word and what it holds is no command."""
    out = []
    quote = ""
    i = 0
    while i < len(command):
        ch = command[i]
        i += 1
        if quote and ch == quote:
            quote = ""
        elif quote == '"' and ch == "\\" and i < len(command):
            ch = command[i]
            i += 1
            out.append("_" if ch in _PROTECTED_SINGLE else ch)
        elif quote:
            out.append("_" if ch in (_PROTECTED_SINGLE if quote == "'" else _PROTECTED) else ch)
        elif ch in "'\"":
            quote = ch
        elif ch == "\\" and i < len(command):
            ch = command[i]
            i += 1
            if ch != "\n":
                out.append("_" if ch in _PROTECTED else ch)
        else:
            out.append(ch)
    return "".join(out)


def _hides_directory_change(command):
    """True when the command changes the directory of the terminal session, or can without saying so: a
    `cd`, `pushd`, `popd` or `chdir` word however it is quoted, `eval`, and a program word that holds an
    expansion or a brace list."""
    text = _unquoted(command)
    if _DIR_CHANGE.search(text):
        return True
    for segment in re.split(r"[;&|()\n]", text):
        words = [w for w in segment.split() if not _SKIPPED_WORD.match(w)]
        if words and (words[0] == "eval" or re.search(r"[$`{}]", words[0])):
            return True
    return False


def _command_words(command):
    """The words of a shell command, quotes removed (a quoted path with a space is one word), split again
    at the operators and redirections that can touch a word. A command that does not parse is not
    guessed at: it returns None, and the caller treats it as holding a relative path."""
    try:
        tokens = shlex.split(command, posix=False)
    except ValueError:
        return None
    return [w for token in tokens for w in _OPERATORS.split(token.strip("\"'")) if w]


def _relative_word(word):
    """True for a command word that is lexically a relative path: it has a separator or starts with a dot."""
    if not word or word[0] in "/\\~$-@%!#{}[]*?" or "://" in word:
        return False
    if re.match(r"^[A-Za-z]:[\\/]", word):
        return False
    return "/" in word or "\\" in word or word[0] == "."


def _checked_args(args):
    """The call's arguments with every `~` expanded, or (None, reason) when the call cannot be judged.

    Hermes expands `~` and resolves a relative path in the directory its terminal session was left in
    by an earlier `cd`; neither is in the hook payload, and the guard reads `~/x` as `<project>/~/x` and
    a relative path against the process cwd. So a leading `~` is expanded here (one that does not
    resolve is refused), a relative path is refused, and so is a directory change in a command, which
    moves the session for every later call. A command is judged against its own workdir when that is
    absolute, as the guard does: its relative paths are then known.
    """
    if not isinstance(args, dict):
        return args, None
    out = dict(args)
    relative = False
    absolute_workdir = False
    for key in _PATH_ARGS:
        value = out.get(key)
        if not isinstance(value, str) or not value:
            continue
        expanded = os.path.expanduser(value)
        if expanded.startswith("~"):
            return None, f"the path {value!r} starts with ~ and cannot be resolved; use an absolute path"
        out[key] = expanded
        if not _is_absolute(expanded):
            relative = True
        elif key in _DIR_ARGS:
            absolute_workdir = True
    command = next((out[k] for k in ("command", "cmd") if isinstance(out.get(k), str)), None)
    if command is not None:
        if _hides_directory_change(command):
            return None, "a directory change cannot be tracked on Hermes (its terminal keeps it for every later call), and eval or an expansion used as the program can hide one; name absolute paths and the program itself instead"
        if not absolute_workdir:
            words = _command_words(command)
            if words is None or any(_relative_word(w) for w in words):
                relative = True
    if relative:
        return None, RELATIVE_PATH + " (or give the call an absolute workdir)"
    return out, None


def _guardrail_verdict(skills_dir, tool_name, args, cwd):
    """Runs the ultrapowers guardrail for one tool call: None to allow, or a Hermes block directive.

    Inert without a run marker, so an ordinary session spawns nothing. With a marker, the hook
    decides; a hook that cannot run blocks (an active run without its brake fails closed).
    """
    # Every candidate is searched: the session cwd and the call's own workdir (Hermes terminal);
    # a tool argument can add a run, never hide one.
    candidates = [cwd]
    workdir = args.get("workdir") if isinstance(args, dict) else None
    if isinstance(workdir, str) and workdir:
        candidates.append(os.path.join(cwd, os.path.expanduser(workdir)))
    prefix = next((p for p in (_run_active(c) for c in candidates) if p), None)
    if not prefix:
        return None
    import subprocess

    args, problem = _checked_args(args)
    if problem:
        return {"action": "block", "message": f"{prefix} DENY: {problem}"}
    projects = []
    for c in candidates:
        marker = _find_marker(c)
        if marker:
            projects.append(os.path.dirname(os.path.dirname(marker)))
    cli = _guardrail_cli(skills_dir)
    node = _node_binary(cwd, projects)
    if not cli or not node:
        return {"action": "block", "message": f"{prefix} DENY: the ultrapowers guardrail could not run (node or the hook is missing); a tool call during a run is refused without it"}
    event = json.dumps({"hook_event_name": "PreToolUse", "tool_name": tool_name, "tool_input": {} if args is None else args, "cwd": cwd})
    # The child runs from the plugin's folder (the event carries the session cwd), and on Windows it
    # does not search its current directory for the programs it starts. --hermes: an MCP tool is
    # named mcp_<server>_<tool>, which the guard reads against an autopilot stage's server list.
    env = dict(os.environ, NoDefaultCurrentDirectoryInExePath="1")
    try:
        proc = subprocess.run([node, cli, "--hermes"], input=event, capture_output=True, text=True, timeout=20, cwd=os.path.dirname(os.path.abspath(__file__)), env=env)
    except (OSError, subprocess.SubprocessError) as exc:
        return {"action": "block", "message": f"{prefix} DENY: the ultrapowers guardrail could not run ({exc}); a tool call during a run is refused without it"}
    if proc.returncode == 0:
        return None
    deny_line = ""
    for line in (proc.stderr or "").splitlines():
        if "GUARDRAIL DENY: " in line:
            deny_line = line.strip()
    if proc.returncode == 2:
        # The hook's own line, with the profile's prefix: QA-GUARDRAIL DENY, HUNT-GUARDRAIL DENY or AUTOPILOT-GUARDRAIL DENY.
        return {"action": "block", "message": deny_line or "ultrapowers guardrail: denied"}
    return {"action": "block", "message": f"{prefix} DENY: the ultrapowers guardrail could not run (exit {proc.returncode}); a tool call during a run is refused without it"}


def register(ctx):
    skills_dir = _skills_dir()
    bootstrap = _build_bootstrap(skills_dir)

    # The QA and autopilot envelopes: the guardrail (hooks/qa-guardrail) runs before every tool
    # call of an active run, through the node entry, and blocks with the hook's reason.
    def pre_tool_call(tool_name=None, args=None, task_id=None, **kwargs):
        try:
            return _guardrail_verdict(skills_dir, str(tool_name or ""), args, os.getcwd())
        except Exception as exc:  # a broken guard must never fail open during a run
            prefix = _run_active(os.getcwd())
            if prefix:
                return {"action": "block", "message": f"{prefix} DENY: the ultrapowers guardrail failed ({exc}); a tool call during a run is refused without it"}
            return None

    ctx.register_hook("pre_tool_call", pre_tool_call)

    # Register every stock skill with Hermes' native loader so skill_view can
    # load them on demand. Standard markdown; no conversion (plugin guide).
    # register_skill requires a pathlib.Path — a str raises AttributeError and
    # hermes silently disables the whole plugin (verified 2026-07-23).
    for name in sorted(os.listdir(skills_dir)):
        skill_md = os.path.join(skills_dir, name, "SKILL.md")
        if os.path.isfile(skill_md):
            with open(skill_md, encoding="utf-8") as f:
                description = _frontmatter_value(f.read(), "description")
            ctx.register_skill(name, Path(skill_md), description=description)

    # pre_llm_call returning {"context": ...} is the documented injection path
    # (on_session_start return values are ignored, and ctx.inject_message
    # refuses from that hook — verified empirically 2026-07-23). The context is
    # appended to the first turn's user message.
    def pre_llm_call(
        session_id=None,
        user_message=None,
        conversation_history=None,
        is_first_turn=None,
        model=None,
        platform=None,
        **kwargs,
    ):
        if is_first_turn:
            context = _with_project_nudge(bootstrap, platform)
            # Same terminal-only rule as the scaffold nudge: a messaging
            # gateway's working directory is not the project.
            memory_off = os.environ.get("ULTRAPOWERS_NUDGE", "").lower() == "off"
            store = _team_memory_store(os.getcwd()) if platform in NUDGE_PLATFORMS and not memory_off else None
            if store:
                return {"context": f"{context}\n\n{TEAM_MEMORY_NUDGE.format(store=store)}"}
            return {"context": context}
        return None

    ctx.register_hook("pre_llm_call", pre_llm_call)

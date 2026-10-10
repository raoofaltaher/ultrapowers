import json
import os
import re
import shutil
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
    """True when a QA or autopilot run marker exists at or above start_dir."""
    current = os.path.realpath(start_dir)
    while True:
        base = os.path.join(current, ".ultrapowers")
        if os.path.isfile(os.path.join(base, "qa-active")) or os.path.isfile(os.path.join(base, "autopilot-active")):
            return True
        parent = os.path.dirname(current)
        if parent == current:
            return False
        current = parent


def _guardrail_verdict(skills_dir, tool_name, args, cwd):
    """Runs the ultrapowers guardrail for one tool call: None to allow, or a Hermes block directive.

    Inert without a run marker, so an ordinary session spawns nothing. With a marker, the hook
    decides; a hook that cannot run blocks (an active run without its brake fails closed).
    """
    if not _run_active(cwd):
        return None
    import subprocess

    cli = _guardrail_cli(skills_dir)
    node = shutil.which("node")
    if not cli or not node:
        return {"action": "block", "message": "the ultrapowers guardrail could not run (node or the hook is missing); a tool call during a run is refused without it"}
    event = json.dumps({"hook_event_name": "PreToolUse", "tool_name": tool_name, "tool_input": {} if args is None else args, "cwd": cwd})
    try:
        proc = subprocess.run([node, cli], input=event, capture_output=True, text=True, timeout=20, cwd=cwd)
    except (OSError, subprocess.SubprocessError) as exc:
        return {"action": "block", "message": f"the ultrapowers guardrail could not run ({exc}); a tool call during a run is refused without it"}
    if proc.returncode == 0:
        return None
    reason = ""
    for line in (proc.stderr or "").splitlines():
        if "GUARDRAIL DENY: " in line:
            reason = line.split("GUARDRAIL DENY: ", 1)[1].strip()
    if proc.returncode == 2:
        return {"action": "block", "message": f"ultrapowers guardrail: {reason or 'denied'}"}
    return {"action": "block", "message": f"the ultrapowers guardrail could not run (exit {proc.returncode}); a tool call during a run is refused without it"}


def register(ctx):
    skills_dir = _skills_dir()
    bootstrap = _build_bootstrap(skills_dir)

    # The QA and autopilot envelopes: the guardrail (hooks/qa-guardrail) runs before every tool
    # call of an active run, through the node entry, and blocks with the hook's reason.
    def pre_tool_call(tool_name=None, args=None, task_id=None, **kwargs):
        try:
            return _guardrail_verdict(skills_dir, str(tool_name or ""), args, os.getcwd())
        except Exception as exc:  # a broken guard must never fail open during a run
            if _run_active(os.getcwd()):
                return {"action": "block", "message": f"the ultrapowers guardrail failed ({exc}); a tool call during a run is refused without it"}
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

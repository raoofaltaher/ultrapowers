import json
import os
import re
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


def register(ctx):
    skills_dir = _skills_dir()
    bootstrap = _build_bootstrap(skills_dir)

    # Register every stock skill with Hermes' native loader so skill_view can
    # load them on demand. Standard markdown; no conversion (plugin guide).
    # register_skill requires a pathlib.Path — a str raises AttributeError and
    # hermes silently disables the whole plugin (verified 2026-07-23).
    for name in sorted(os.listdir(skills_dir)):
        skill_md = os.path.join(skills_dir, name, "SKILL.md")
        if os.path.isfile(skill_md):
            ctx.register_skill(name, Path(skill_md))

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
            store = _team_memory_store(os.getcwd()) if platform in NUDGE_PLATFORMS else None
            if store:
                return {"context": f"{context}\n\n{TEAM_MEMORY_NUDGE.format(store=store)}"}
            return {"context": context}
        return None

    ctx.register_hook("pre_llm_call", pre_llm_call)

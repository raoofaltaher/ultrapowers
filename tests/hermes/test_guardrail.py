"""The Hermes plugin runs the ultrapowers guardrail before every tool call of an active run
(pre_tool_call): a denied call is blocked with the hook's reason, an allowed one passes, and
without a run (a run record or the autopilot marker) nothing is spawned. Needs node and bash (Git Bash on Windows)."""
import datetime
import importlib
import json
import os
import shutil
import sys

import pytest

_PLUGIN_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.hermes-plugin"))
sys.path.insert(0, _PLUGIN_DIR)


def _load_plugin():
    if "__init__" in sys.modules:
        del sys.modules["__init__"]
    return importlib.import_module("__init__")


def _record(root, profile, ident, session=None):
    """A run record, .ultrapowers/runs/<run>.json, bound to no session unless one is named (Hermes
    names no session, so a record bound to one never guards its calls)."""
    run = f"{profile}-{ident}-0a1b2c3d"
    runs = root / ".ultrapowers" / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    (runs / f"{run}.json").write_text(
        json.dumps({"run": run, "profile": profile, "id": ident, "session": session, "startedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()}),
        encoding="utf-8",
    )


def _project(tmp_path, active=True):
    (tmp_path / ".agents").mkdir()
    (tmp_path / ".ultrapowers").mkdir()
    (tmp_path / ".agents" / "ultrapowers.json").write_text(json.dumps({"name": "p", "autopilot": {"mode": "gated"}}), encoding="utf-8")
    if active:
        (tmp_path / ".ultrapowers" / "autopilot-active").write_text(
            json.dumps({"ticket": "GH-16", "branch": "GH-16-x", "scope": ["."], "stage": "execute"}), encoding="utf-8"
        )
    return tmp_path


@pytest.fixture
def hook(mock_ctx):
    plugin = _load_plugin()
    plugin.register(mock_ctx)
    assert "pre_tool_call" in mock_ctx._hooks, "the plugin registers pre_tool_call"
    return mock_ctx._hooks["pre_tool_call"]


@pytest.mark.skipif(shutil.which("node") is None, reason="node is needed to run the guardrail")
def test_push_is_blocked_inside_a_stage(hook, tmp_path, monkeypatch):
    root = _project(tmp_path)
    monkeypatch.chdir(root)
    verdict = hook("terminal", {"command": "git push origin GH-16-x"}, "t1")
    assert verdict and verdict.get("action") == "block"
    assert "git push is never allowed" in verdict.get("message", "")


@pytest.mark.skipif(shutil.which("node") is None, reason="node is needed to run the guardrail")
def test_state_file_write_is_blocked_and_a_read_passes(hook, tmp_path, monkeypatch):
    root = _project(tmp_path)
    monkeypatch.chdir(root)
    blocked = hook("write_file", {"path": str(root / "tasks" / "GH-16" / "autopilot.json"), "content": "{}"}, "t2")
    assert blocked and blocked.get("action") == "block"
    assert hook("read_file", {"path": str(root / "README.md")}, "t3") is None
    assert hook("terminal", {"command": "git status"}, "t4") is None


def test_outside_a_run_nothing_is_checked(hook, tmp_path, monkeypatch):
    root = _project(tmp_path, active=False)
    monkeypatch.chdir(root)
    assert hook("terminal", {"command": "git push origin main"}, "t5") is None


@pytest.mark.skipif(shutil.which("node") is None, reason="node is needed to run the guardrail")
def test_inside_flag_keeps_the_envelope_without_the_marker(hook, tmp_path, monkeypatch):
    root = _project(tmp_path, active=False)
    monkeypatch.chdir(root)
    monkeypatch.setenv("ULTRAPOWERS_AUTOPILOT_INSIDE", "1")
    verdict = hook("terminal", {"command": "git push origin main"}, "t8")
    assert verdict and verdict.get("action") == "block"
    assert verdict.get("message", "").startswith("AUTOPILOT-GUARDRAIL DENY: git push is never allowed")
    assert hook("terminal", {"command": "git status"}, "t9") is None


@pytest.mark.skipif(shutil.which("node") is None, reason="node is needed to run the guardrail")
def test_a_workdir_under_a_run_is_guarded_from_a_session_outside_it(hook, tmp_path, monkeypatch):
    (tmp_path / "proj").mkdir()
    root = _project(tmp_path / "proj")
    outside = tmp_path / "outside"
    outside.mkdir()
    monkeypatch.chdir(outside)
    verdict = hook("terminal", {"command": "git push origin GH-16-x", "workdir": str(root)}, "t10")
    assert verdict and verdict.get("action") == "block"


@pytest.mark.skipif(shutil.which("node") is None, reason="node is needed to run the guardrail")
def test_a_terminal_workdir_outside_the_project_is_blocked(hook, tmp_path, monkeypatch):
    (tmp_path / "proj").mkdir()
    root = _project(tmp_path / "proj")
    outside = tmp_path / "outside"
    outside.mkdir()
    monkeypatch.chdir(root)
    verdict = hook("terminal", {"command": "echo x > config", "workdir": str(outside)}, "t11")
    assert verdict and verdict.get("action") == "block"
    assert "outside the project root" in verdict.get("message", "")
    assert hook("terminal", {"command": "git status", "workdir": str(root / ".agents")}, "t12") is None


def test_plugin_yaml_declares_the_hook():
    here = os.path.dirname(os.path.abspath(__file__))
    text = open(os.path.join(here, "..", "..", ".hermes-plugin", "plugin.yaml"), encoding="utf-8").read()
    assert "pre_tool_call" in text


@pytest.mark.skipif(shutil.which("node") is None, reason="node is needed to run the guardrail")
def test_a_non_dict_args_reaches_the_hook_and_is_refused(hook, tmp_path, monkeypatch):
    root = _project(tmp_path)
    monkeypatch.chdir(root)
    for args in (["git", "push", "origin", "GH-16-x"], "git push origin GH-16-x"):
        verdict = hook("terminal", args, "t6")
        assert verdict and verdict.get("action") == "block", args
    assert hook("terminal", None, "t7") is None


@pytest.mark.skipif(shutil.which("node") is None, reason="node is needed to run the guardrail")
def test_a_hunt_record_blocks_a_push_with_the_hunt_prefix_and_passes_an_audit(hook, tmp_path, monkeypatch):
    root = _project(tmp_path, active=False)
    _record(root, "hunt", "audit-2026-10-11")
    monkeypatch.chdir(root)
    verdict = hook("terminal", {"command": "git push origin x"}, "t13")
    assert verdict and verdict.get("action") == "block"
    assert verdict.get("message", "").startswith("HUNT-GUARDRAIL DENY: ")
    assert hook("terminal", {"command": "npm audit --package-lock-only --json"}, "t14") is None
    blocked = hook("write_file", {"path": str(root / "repo-a" / "src" / "x.ts"), "content": "x"}, "t15")
    assert blocked and blocked.get("action") == "block"


@pytest.mark.parametrize(
    "run,prefix",
    [("qa", "QA-GUARDRAIL DENY: "), ("hunt", "HUNT-GUARDRAIL DENY: "), ("autopilot", "AUTOPILOT-GUARDRAIL DENY: ")],
)
def test_the_plugins_own_fail_closed_denies_carry_the_profile_prefix(tmp_path, monkeypatch, run, prefix):
    import subprocess

    plugin = _load_plugin()
    root = _project(tmp_path, active=False)
    if run == "autopilot":
        (root / ".ultrapowers" / "autopilot-active").write_text("{}", encoding="utf-8")
    else:
        _record(root, run, "T-1")
    verdict = lambda: plugin._guardrail_verdict(str(root), "terminal", {"command": "git status"}, str(root))

    # The node binary or the hook is missing.
    monkeypatch.setattr(plugin, "_node_binary", lambda cwd, *a, **k: None)
    missing = verdict()
    assert missing["action"] == "block" and missing["message"].startswith(prefix), missing

    # The hook cannot be spawned, and it exits with something other than 0 or 2.
    monkeypatch.setattr(plugin, "_node_binary", lambda cwd, *a, **k: "node")
    monkeypatch.setattr(plugin, "_guardrail_cli", lambda skills_dir: "guardrail-cli.mjs")

    def spawn_fails(*args, **kwargs):
        raise OSError("boom")

    monkeypatch.setattr(subprocess, "run", spawn_fails)
    spawn = verdict()
    assert spawn["action"] == "block" and spawn["message"].startswith(prefix), spawn

    monkeypatch.setattr(subprocess, "run", lambda *a, **k: subprocess.CompletedProcess(a, 1, "", ""))
    crashed = verdict()
    assert crashed["action"] == "block" and crashed["message"].startswith(prefix), crashed
    assert "exit 1" in crashed["message"]


def test_the_order_is_a_hunt_record_then_a_qa_record_then_the_autopilot_marker(tmp_path):
    plugin = _load_plugin()
    root = _project(tmp_path)
    _record(root, "hunt", "audit-2026-10-11")
    _record(root, "qa", "GH-16")
    assert plugin._run_active(str(root)) == "HUNT-GUARDRAIL"
    (root / ".ultrapowers" / "runs" / "hunt-audit-2026-10-11-0a1b2c3d.json").unlink()
    assert plugin._run_active(str(root)) == "QA-GUARDRAIL"
    (root / ".ultrapowers" / "runs" / "qa-GH-16-0a1b2c3d.json").unlink()
    assert plugin._run_active(str(root)) == "AUTOPILOT-GUARDRAIL"
    (root / ".ultrapowers" / "autopilot-active").unlink()
    assert plugin._run_active(str(root)) is None


def _nested(root):
    nested = root / "repo-a"
    (nested / ".agents").mkdir(parents=True)
    (nested / ".agents" / "ultrapowers.json").write_text("{}", encoding="utf-8")
    (nested / "src").mkdir()
    return nested


def test_a_record_in_a_parent_project_does_not_guard_a_nested_project(tmp_path):
    plugin = _load_plugin()
    root = _project(tmp_path, active=False)
    _record(root, "qa", "GH-16")
    nested = _nested(root)
    assert plugin._run_active(str(root)) == "QA-GUARDRAIL"
    assert plugin._run_active(str(nested / "src")) is None
    # the nested project's own record guards it, and the parent's autopilot marker still counts above it
    _record(nested, "hunt", "audit-2026-10-11")
    assert plugin._run_active(str(nested / "src")) == "HUNT-GUARDRAIL"
    (root / ".ultrapowers" / "autopilot-active").write_text("{}", encoding="utf-8")
    (nested / ".ultrapowers" / "runs" / "hunt-audit-2026-10-11-0a1b2c3d.json").unlink()
    assert plugin._run_active(str(nested / "src")) == "AUTOPILOT-GUARDRAIL"


@pytest.mark.skipif(shutil.which("node") is None, reason="node is needed to run the guardrail")
def test_a_nested_project_is_not_guarded_by_a_record_of_its_parent_and_a_session_record_guards_nothing(hook, tmp_path, monkeypatch):
    root = _project(tmp_path, active=False)
    _record(root, "qa", "GH-16")
    nested = _nested(root)
    monkeypatch.chdir(nested / "src")
    assert hook("terminal", {"command": "git push origin x"}, "t16") is None
    # a record bound to a session never guards Hermes, which names none: the fast path lets it
    # through to the hook, and the hook finds no record that applies
    (root / ".ultrapowers" / "runs" / "qa-GH-16-0a1b2c3d.json").unlink()
    _record(root, "qa", "GH-17", session="S1")
    monkeypatch.chdir(root)
    assert hook("terminal", {"command": "git push origin x"}, "t17") is None


@pytest.mark.skipif(shutil.which("node") is None, reason="node is needed to run the guardrail")
def test_a_node_planted_in_the_project_is_never_run(tmp_path, monkeypatch):
    """A node.cmd or node in the project directory, reachable through the current directory or a
    relative PATH entry, is not the node the guardrail runs: the real hook decides the call."""
    plugin = _load_plugin()
    root = _project(tmp_path)
    sentinel = root / "decoy-ran.txt"
    if os.name == "nt":
        (root / "node.cmd").write_text(f'@echo off\r\necho ran> "{sentinel}"\r\nexit /b 0\r\n', encoding="utf-8")
    else:
        decoy = root / "node"
        decoy.write_text(f'#!/bin/sh\necho ran > "{sentinel}"\nexit 0\n', encoding="utf-8")
        decoy.chmod(0o755)
    monkeypatch.chdir(root)
    monkeypatch.setenv("PATH", os.pathsep.join([".", "bin", os.environ.get("PATH", "")]))
    verdict = plugin._guardrail_verdict(plugin._skills_dir(), "terminal", {"command": "git push origin GH-16-x"}, str(root))
    assert not sentinel.exists(), "the decoy node in the project directory ran"
    assert verdict and verdict.get("action") == "block", verdict
    assert "git push is never allowed" in verdict.get("message", ""), verdict
    found = plugin._node_binary(str(root))
    assert found and os.path.isabs(found) and os.path.dirname(os.path.realpath(found)) != os.path.realpath(str(root)), found


# ---- the 2026-10-23 hunt: Medium 17 and 18 (paths), Low 7 (node lookup), Medium 19 (MCP names) ----

RELATIVE = "a relative path cannot be verified on Hermes; use an absolute path"


def _blocked(verdict, text):
    assert verdict and verdict.get("action") == "block", verdict
    assert text in verdict.get("message", ""), verdict


@pytest.mark.skipif(shutil.which("node") is None, reason="node is needed to run the guardrail")
def test_a_relative_path_is_refused_during_a_run_because_hermes_resolves_it_in_the_session_directory(hook, tmp_path, monkeypatch):
    """Hermes runs a file tool and a command in the directory a previous `cd` left the session in, which the
    hook payload does not carry: the guard would judge `ultrapowers.json` at the project root while Hermes
    writes `.agents/ultrapowers.json`. A relative path is refused; an absolute one is judged."""
    root = _project(tmp_path)
    monkeypatch.chdir(root)
    for tool, args in [
        ("write_file", {"path": "ultrapowers.json", "content": "{}"}),
        ("write_file", {"path": "./ultrapowers.json", "content": "{}"}),
        ("read_file", {"path": "README.md"}),
        ("search_files", {"pattern": "x", "path": "."}),
        ("terminal", {"command": "echo x > ./config"}),
        ("terminal", {"command": "cat src/a.ts"}),
        ("terminal", {"command": "git add ."}),
        ("terminal", {"command": "git status", "workdir": ".agents"}),
    ]:
        _blocked(hook(tool, args, "t20"), RELATIVE)
    # a directory change of the persisted terminal session cannot be followed
    for command in ("cd .agents", "git status && cd /tmp", "pushd /tmp", "(cd src; ls)"):
        _blocked(hook("terminal", {"command": command}, "t21"), "a directory change")
    # absolute paths, and commands with no path, are judged by the guard as before
    assert hook("read_file", {"path": str(root / "README.md")}, "t22") is None
    assert hook("terminal", {"command": "git status"}, "t23") is None
    assert hook("terminal", {"command": 'cat "' + str(root / "src" / "a.ts") + '"'}, "t24") is None
    _blocked(hook("write_file", {"path": str(root / ".agents" / "ultrapowers.json"), "content": "{}"}, "t25"), "protected path")
    # an absolute workdir fixes the directory the command runs in, so its relative paths are judged against it
    assert hook("terminal", {"command": "cat src/a.ts", "workdir": str(root)}, "t26") is None
    _blocked(hook("terminal", {"command": "echo x > ultrapowers.json", "workdir": str(root / ".agents")}, "t27"), "protected path")


def test_without_a_run_a_relative_path_is_not_checked(hook, tmp_path, monkeypatch):
    root = _project(tmp_path, active=False)
    monkeypatch.chdir(root)
    assert hook("write_file", {"path": "ultrapowers.json", "content": "{}"}, "t28") is None
    assert hook("terminal", {"command": "cd .agents && ls"}, "t29") is None

# The verification of Medium 17: the directory-change refusal read the command's text, so a quote, a backslash
# or an expansion hid the word `cd`. Quotes and backslashes are removed as the shell removes them, and `eval`
# and an expansion used as the program are refused too (they can build a `cd` the text never shows).
HIDDEN_DIRECTORY_CHANGES = [
    "'cd' src", '"cd" src', r"\cd src", r"c\d src", 'c""d src', "eval 'c''d src'", "eval cd src", 'eval "$X"', "builtin eval x",
    "C=cd; $C src", "$C src", "${C} src", "$'cd' src", "A=1 $C src", "A='x y' $C src", "builtin $C src", "true && $C src", "if true; then $C src; fi",
    "c${E}d src", "c$(true)d src", "c`true`d src", "c{d,} src", "$(echo cd) src", "`echo cd` src",
]


def test_a_directory_change_hidden_by_quotes_eval_or_an_expansion_is_refused_during_a_run(hook, tmp_path, monkeypatch):
    root = _project(tmp_path)
    monkeypatch.chdir(root)
    for i, command in enumerate(HIDDEN_DIRECTORY_CHANGES):
        _blocked(hook("terminal", {"command": command}, f"t40-{i}"), "a directory change")
    # the same commands with an absolute workdir are refused too: the session still moves
    _blocked(hook("terminal", {"command": "'cd' src", "workdir": str(root)}, "t41"), "a directory change")


@pytest.mark.skipif(shutil.which("node") is None, reason="node is needed to run the guardrail")
def test_a_quoted_word_that_is_no_command_and_an_expansion_in_an_argument_are_not_a_directory_change(hook, tmp_path, monkeypatch):
    root = _project(tmp_path)
    monkeypatch.chdir(root)
    for i, command in enumerate([
        "echo 'cd src'", 'echo "cd src"', 'echo "a;cd b"', "echo eval", "echo $HOME", 'echo "$HOME"', "X=$(git status)", "X=$(git status) echo done",
        "git status && echo $?", "echo ${HOME}", r"echo \$HOME",
    ]):
        assert hook("terminal", {"command": command}, f"t42-{i}") is None, command


def test_without_a_run_a_hidden_directory_change_is_not_checked(hook, tmp_path, monkeypatch):
    root = _project(tmp_path, active=False)
    monkeypatch.chdir(root)
    for i, command in enumerate(HIDDEN_DIRECTORY_CHANGES):
        assert hook("terminal", {"command": command}, f"t43-{i}") is None, command


@pytest.mark.skipif(shutil.which("node") is None, reason="node is needed to run the guardrail")
def test_a_home_path_is_expanded_before_the_guard_reads_it_and_an_unresolved_one_is_refused(hook, tmp_path, monkeypatch):
    """Hermes expands `~`; the guard reads `~/.bashrc` as the project-relative `<root>/~/.bashrc`. The adapter
    expands it first, so the guard judges the file Hermes writes; a `~` that does not resolve is refused."""
    (tmp_path / "proj").mkdir()
    root = _project(tmp_path / "proj")
    monkeypatch.chdir(root)
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("USERPROFILE", str(home))
    outside = hook("write_file", {"path": "~/.bashrc", "content": "x"}, "t30")
    assert outside and outside.get("action") == "block", outside
    assert RELATIVE not in outside.get("message", ""), "the path is absolute once expanded"
    _blocked(hook("terminal", {"command": "git status", "workdir": "~"}, "t31"), "outside the project root")
    # the same file under the project, spelled with ~, is the file the guard now judges
    monkeypatch.setenv("HOME", str(root))
    monkeypatch.setenv("USERPROFILE", str(root))
    _blocked(hook("write_file", {"path": "~/.agents/ultrapowers.json", "content": "{}"}, "t32"), "protected path")
    # a user the adapter cannot resolve stays a `~` path and is refused
    monkeypatch.setattr(os.path, "expanduser", lambda p: p)
    for tool, args in [("write_file", {"path": "~otheruser/x", "content": "x"}), ("read_file", {"path": "~"}), ("terminal", {"command": "git status", "workdir": "~root"})]:
        _blocked(hook(tool, args, "t33"), "cannot be resolved")


def test_the_adapter_expands_a_home_path_in_every_path_argument(tmp_path, monkeypatch):
    plugin = _load_plugin()
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("USERPROFILE", str(home))
    args, problem = plugin._checked_args({"path": "~/a", "file_path": "~/b", "workdir": "~", "command": "ls", "content": "~/not-a-path"})
    assert problem is None
    assert os.path.normcase(args["path"]) == os.path.normcase(os.path.expanduser("~/a"))
    assert os.path.isabs(args["file_path"]) and os.path.isabs(args["workdir"])
    assert args["content"] == "~/not-a-path", "only path arguments are expanded"
    assert args["command"] == "ls"


@pytest.mark.skipif(shutil.which("node") is None, reason="node is needed to run the guardrail")
def test_a_node_on_an_absolute_path_entry_inside_the_project_is_never_run(tmp_path, monkeypatch):
    """The lookup skipped only the working directory: an absolute PATH entry inside the project (a
    node_modules/.bin that npm run adds, a tools folder) was accepted when the session ran elsewhere."""
    plugin = _load_plugin()
    (tmp_path / "proj").mkdir()
    root = _project(tmp_path / "proj")
    outside = tmp_path / "outside"
    outside.mkdir()
    tools = root / "tools"
    tools.mkdir()
    sentinel = root / "decoy-ran.txt"
    if os.name == "nt":
        (tools / "node.cmd").write_text(f'@echo off\r\necho ran> "{sentinel}"\r\nexit /b 0\r\n', encoding="utf-8")
    else:
        decoy = tools / "node"
        decoy.write_text(f'#!/bin/sh\necho ran > "{sentinel}"\nexit 0\n', encoding="utf-8")
        decoy.chmod(0o755)
    monkeypatch.chdir(outside)
    monkeypatch.setenv("PATH", os.pathsep.join([str(tools), os.environ.get("PATH", "")]))
    found = plugin._node_binary(str(outside), [str(root)])
    assert found and not os.path.realpath(found).startswith(os.path.realpath(str(root))), found
    # through a call: the run is found from the call's workdir, and the project is that run's
    verdict = plugin._guardrail_verdict(plugin._skills_dir(), "terminal", {"command": "git push origin GH-16-x", "workdir": str(root)}, str(outside))
    assert not sentinel.exists(), "the decoy node inside the project ran"
    assert verdict and verdict.get("action") == "block", verdict
    assert "git push is never allowed" in verdict.get("message", ""), verdict


def _snapshot(root, *servers):
    folder = root / ".ultrapowers" / "autopilot"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "mcp.json").write_text(json.dumps({"mcpServers": {name: {"command": "x"} for name in servers}}), encoding="utf-8")


@pytest.mark.skipif(shutil.which("node") is None, reason="node is needed to run the guardrail")
def test_an_mcp_tool_of_a_server_outside_the_snapshot_is_refused_in_an_autopilot_stage(hook, tmp_path, monkeypatch):
    """Hermes names an MCP tool mcp_<server>_<tool>; the stage's server list judges mcp__<server>__<tool>."""
    root = _project(tmp_path)
    _snapshot(root, "context7", "my-docs")
    monkeypatch.chdir(root)
    for name in ("mcp_postgres_query", "mcp_Postgres-Admin_drop_table"):
        _blocked(hook(name, {"query": "select 1"}, "t34"), "the MCP server 'postgres")
    assert hook("mcp_context7_query-docs", {"query": "x"}, "t35") is None
    assert hook("mcp_my_docs_search", {"query": "x"}, "t36") is None
    assert hook("read_file", {"path": str(root / "README.md")}, "t37") is None
    _blocked(hook("mcp_", {"query": "x"}, "t38"), "cannot be read")

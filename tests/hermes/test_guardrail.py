"""The Hermes plugin runs the ultrapowers guardrail before every tool call of an active run
(pre_tool_call): a denied call is blocked with the hook's reason, an allowed one passes, and
without a run marker nothing is spawned. Needs node and bash (Git Bash on Windows)."""
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


@pytest.mark.parametrize("marker,prefix", [("qa-active", "QA-GUARDRAIL DENY: "), ("autopilot-active", "AUTOPILOT-GUARDRAIL DENY: ")])
def test_the_plugins_own_fail_closed_denies_carry_the_profile_prefix(tmp_path, monkeypatch, marker, prefix):
    import subprocess

    plugin = _load_plugin()
    root = _project(tmp_path, active=False)
    (root / ".ultrapowers" / marker).write_text("{}", encoding="utf-8")
    verdict = lambda: plugin._guardrail_verdict(str(root), "terminal", {"command": "git status"}, str(root))

    # The node binary or the hook is missing.
    monkeypatch.setattr(plugin.shutil, "which", lambda name: None)
    missing = verdict()
    assert missing["action"] == "block" and missing["message"].startswith(prefix), missing

    # The hook cannot be spawned, and it exits with something other than 0 or 2.
    monkeypatch.setattr(plugin.shutil, "which", lambda name: "node")
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


def test_the_qa_profile_wins_when_both_markers_exist(tmp_path):
    plugin = _load_plugin()
    root = _project(tmp_path)
    (root / ".ultrapowers" / "qa-active").write_text("{}", encoding="utf-8")
    assert plugin._run_active(str(root)) == "QA-GUARDRAIL"
    (root / ".ultrapowers" / "qa-active").unlink()
    assert plugin._run_active(str(root)) == "AUTOPILOT-GUARDRAIL"
    (root / ".ultrapowers" / "autopilot-active").unlink()
    assert plugin._run_active(str(root)) is None

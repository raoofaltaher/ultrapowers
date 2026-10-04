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


def test_plugin_yaml_declares_the_hook():
    here = os.path.dirname(os.path.abspath(__file__))
    text = open(os.path.join(here, "..", "..", ".hermes-plugin", "plugin.yaml"), encoding="utf-8").read()
    assert "pre_tool_call" in text

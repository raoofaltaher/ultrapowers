import importlib
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../.hermes-plugin")
))

BOOTSTRAP_MARKER = "ultrapowers:using-ultrapowers bootstrap for hermes"

# Hermes spills injected context over 10,000 chars to a file, which breaks
# inline injection semantics. The bootstrap must stay under it with margin.
HERMES_CONTEXT_SPILL_LIMIT = 10_000


def _load():
    if "__init__" in sys.modules:
        del sys.modules["__init__"]
    return importlib.import_module("__init__")


def _bootstrap():
    m = _load()
    return m._build_bootstrap(m._skills_dir())


class TestStripFrontmatter:
    def test_strips_yaml_block(self):
        m = _load()
        content = "---\nname: foo\ndescription: bar\n---\n# Body\nContent here"
        assert m._strip_frontmatter(content) == "# Body\nContent here"

    def test_no_frontmatter_returns_trimmed_content(self):
        m = _load()
        content = "# No frontmatter\nJust content"
        assert m._strip_frontmatter(content) == "# No frontmatter\nJust content"

    def test_strips_surrounding_whitespace_from_body(self):
        m = _load()
        content = "---\nname: foo\n---\n\n\n# Body\n\n"
        assert m._strip_frontmatter(content) == "# Body"


class TestSkillsDirResolution:
    def test_repo_layout_resolves(self):
        # The repo checkout IS the git-clone layout: .hermes-plugin/ and
        # skills/ are siblings, so resolution must succeed from here.
        m = _load()
        skills = m._skills_dir()
        assert os.path.isfile(
            os.path.join(skills, "using-ultrapowers", "SKILL.md")
        )


class TestBootstrapContent:
    def test_marker_and_wrapper(self):
        content = _bootstrap()
        assert BOOTSTRAP_MARKER in content
        assert content.startswith("<EXTREMELY_IMPORTANT>")
        assert content.rstrip().endswith("</EXTREMELY_IMPORTANT>")

    def test_contains_using_ultrapowers_body(self):
        content = _bootstrap()
        # A distinctive line from the skill body proves the real SKILL.md was
        # embedded, not a stub.
        assert "You have ultrapowers" in content
        assert "## The Rule" in content

    def test_frontmatter_stripped(self):
        content = _bootstrap()
        assert "---\nname:" not in content

    def test_tool_mapping_sourced_from_reference_file(self):
        m = _load()
        content = _bootstrap()
        ref = os.path.join(
            m._skills_dir(), "using-ultrapowers", "references", "hermes-tools.md"
        )
        with open(ref, encoding="utf-8") as f:
            ref_text = f.read().strip()
        # The mapping is included verbatim from the reference file — the
        # single source, not a drift-prone inline copy.
        assert ref_text in content
        assert "read_file" in content

    def test_skill_view_guidance_present(self):
        content = _bootstrap()
        assert 'skill_view("ultrapowers:brainstorming")' in content

    def test_under_hermes_context_spill_limit(self):
        content = _bootstrap()
        assert len(content) < HERMES_CONTEXT_SPILL_LIMIT, (
            f"bootstrap is {len(content)} chars; hermes spills injected "
            f"context over {HERMES_CONTEXT_SPILL_LIMIT} to a file, which "
            "breaks inline injection"
        )


class TestTeamMemory:
    def _store(self, root):
        (root / ".agents" / "memory").mkdir(parents=True)
        (root / ".agents" / "memory" / "MEMORY.md").write_text("# Team memory: index\n")

    def test_no_store_returns_none(self, tmp_path):
        m = _load()
        assert m._team_memory_store(str(tmp_path)) is None

    def test_missing_dir_returns_none(self, tmp_path):
        m = _load()
        assert m._team_memory_store(str(tmp_path / "gone")) is None

    def test_store_at_cwd(self, tmp_path):
        m = _load()
        self._store(tmp_path)
        assert m._team_memory_store(str(tmp_path)) == ".agents/memory/"

    def test_store_two_levels_up(self, tmp_path):
        m = _load()
        self._store(tmp_path)
        nested = tmp_path / "nested" / "app"
        nested.mkdir(parents=True)
        assert m._team_memory_store(str(nested)) == "../../.agents/memory/"

    def test_first_turn_context_carries_nudge_only_with_store(self, tmp_path, monkeypatch, mock_ctx):
        m = _load()
        m.register(mock_ctx)
        hook = mock_ctx._hooks["pre_llm_call"]
        monkeypatch.chdir(tmp_path)

        without = hook(is_first_turn=True)["context"]
        assert "Team-memory:" not in without
        assert without.rstrip().endswith("</EXTREMELY_IMPORTANT>")

        self._store(tmp_path)
        with_store = hook(is_first_turn=True)["context"]
        assert with_store.rstrip().endswith(
            "Team-memory: if this session verified a durable, expensive-to-rediscover, "
            "non-derivable fact, save it to `.agents/memory/` with the team-memory skill."
        )
        assert BOOTSTRAP_MARKER in with_store
        assert hook(is_first_turn=False) is None

    def test_limit_is_documented(self):
        m = _load()
        ref = os.path.join(m._skills_dir(), "using-ultrapowers", "references", "hermes-tools.md")
        with open(ref, encoding="utf-8") as f:
            text = f.read()
        assert "## Team memory on Hermes" in text
        assert "first turn only" in text
        assert "post-compaction" in text

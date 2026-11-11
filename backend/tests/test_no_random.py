"""
Tests that no random() call exists in production source paths.

Grep is used so this catches both `import random` usage and
any future Math.random() / numpy random calls that slip in.
Any random usage in test files themselves or third-party packages is ignored.
"""

import os
import re
import pathlib

# Directories that are part of the production application (not tests or venv)
PRODUCTION_DIRS = [
    pathlib.Path(__file__).parent.parent / "ai_models",
    pathlib.Path(__file__).parent.parent / "api",
    pathlib.Path(__file__).parent.parent / "data",
    pathlib.Path(__file__).parent.parent / "services",
]

# Pattern that matches random usage in Python
RANDOM_PATTERN = re.compile(
    r"""
    (?:
        random\.random\b      |  # random.random()
        random\.uniform\b     |  # random.uniform()
        random\.gauss\b       |  # random.gauss()
        random\.randint\b     |  # random.randint()
        random\.choice\b      |  # random.choice()
        random\.choices\b     |  # random.choices()
        np\.random\b          |  # numpy random
        numpy\.random\b          # numpy.random explicit
    )
    """,
    re.VERBOSE,
)


def _find_random_usages() -> list[tuple[pathlib.Path, int, str]]:
    """Return (file, line_number, line_content) for every random() call found."""
    hits = []
    for directory in PRODUCTION_DIRS:
        for py_file in directory.rglob("*.py"):
            if "test_" in py_file.name or py_file.name.startswith("test"):
                continue  # skip test files
            text = py_file.read_text(encoding="utf-8")
            for lineno, line in enumerate(text.splitlines(), start=1):
                stripped = line.strip()
                if stripped.startswith("#"):
                    continue  # skip comment-only lines
                if RANDOM_PATTERN.search(line):
                    hits.append((py_file, lineno, line.rstrip()))
    return hits


def test_no_random_in_production_python():
    """Fail if any random() / np.random call is found in production Python source."""
    hits = _find_random_usages()
    if hits:
        report = "\n".join(
            f"  {f.relative_to(pathlib.Path(__file__).parent.parent)} line {ln}: {code}"
            for f, ln, code in hits
        )
        raise AssertionError(
            f"Found {len(hits)} random() call(s) in production source — remove them:\n{report}"
        )


def test_no_math_random_in_production_ts():
    """Fail if Math.random() is found in Next.js API route files."""
    frontend_api = pathlib.Path(__file__).parent.parent.parent / "frontend" / "app" / "api"
    if not frontend_api.exists():
        return  # frontend not present in this test run

    ts_random = re.compile(r"Math\.random\(\)")
    hits = []
    for ts_file in frontend_api.rglob("*.ts"):
        text = ts_file.read_text(encoding="utf-8")
        for lineno, line in enumerate(text.splitlines(), start=1):
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("*") or stripped.startswith("/*"):
                continue
            if ts_random.search(line):
                hits.append((ts_file, lineno, line.rstrip()))

    if hits:
        report = "\n".join(
            f"  {f} line {ln}: {code}"
            for f, ln, code in hits
        )
        raise AssertionError(
            f"Found {len(hits)} Math.random() call(s) in Next.js API routes:\n{report}"
        )

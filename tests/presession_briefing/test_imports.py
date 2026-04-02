import subprocess
import sys
import unittest
from pathlib import Path


class ImportBoundaryTests(unittest.TestCase):
    def test_core_imports_do_not_require_optional_chart_dependencies(self) -> None:
        code = """
import builtins
real_import = builtins.__import__

def guarded_import(name, *args, **kwargs):
    if name.split(".")[0] in {"matplotlib", "mplfinance"}:
        raise AssertionError(f"optional dependency imported: {name}")
    return real_import(name, *args, **kwargs)

builtins.__import__ = guarded_import

import presession_briefing
from presession_briefing.orchestrator import generate_session_brief
from presession_briefing.service import service_capabilities

assert callable(generate_session_brief)
assert service_capabilities()["service"]["version"] == "0.2.0"
print("ok")
"""
        result = subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True,
            check=False,
            cwd=Path(__file__).resolve().parents[2],
            text=True,
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr or result.stdout)


if __name__ == "__main__":
    unittest.main()

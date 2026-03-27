# run_tests.py
from pathlib import Path
import subprocess
import sys

if __name__ == "__main__":
    # комментарий (ru): запускаем pytest из корня проекта,
    # чтобы работать с правильными путями и конфигами из pyproject.toml
    project_root = Path(__file__).resolve().parent
    cmd = [
        sys.executable,
        "-m",
        "pytest",
    ]
    raise SystemExit(subprocess.call(cmd, cwd=project_root))

# run_export_skeleton.py
from pathlib import Path
import subprocess
import sys

if __name__ == "__main__":
    # комментарий (ru): вычисляем пути относительно корня проекта
    project_root = Path(__file__).resolve().parent
    script_path = project_root / "docs" / "export_skeleton.py"

    cmd = [
        sys.executable,
        str(script_path),
    ]

    raise SystemExit(subprocess.call(cmd))

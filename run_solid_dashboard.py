# run_solid_dashboard.py
from pathlib import Path
import subprocess
import sys

if __name__ == "__main__":
    # комментарий (ru): вычисляем пути относительно корня, где лежит этот файл
    project_root = Path(__file__).resolve().parent
    target_dir = project_root / "app"
    config_path = project_root / "tools" / "solid_dashboard" / "solid_config.json"

    cmd = [
        sys.executable,
        "-m",
        "tools.solid_dashboard.solid_dashboard",
        "--target-dir",
        str(target_dir),
        "--config",
        str(config_path),
    ]

    # комментарий (ru): пробрасываем код возврата адаптера наверх
    raise SystemExit(subprocess.call(cmd))

from pathlib import Path
import subprocess
import sys

if __name__ == "__main__":
    # комментарий (ru): вычисляем пути относительно корня, где лежит этот файл
    project_root = Path(__file__).resolve().parent  # scopus_search_code
    target_dir = project_root / "app"               # app/ как корень анализируемого пакета
    config_path = project_root / "solid_config.json"  # конфиг теперь в корне проекта

    cmd = [
        sys.executable,
        "-m",
        "tools.solid_verifier.solid_dashboard",
        "--target-dir",
        str(target_dir),
        "--config",
        str(config_path),
    ]
    # комментарий (ru): пробрасываем код возврата адаптера наверх
    raise SystemExit(subprocess.call(cmd))

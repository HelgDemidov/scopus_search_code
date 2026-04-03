# Скрипт для запуска пайплайна анализа кода "в один клик"
# Команда для запуска из корня (scopus_search_code): python run_solid_dashboard.py

import subprocess
import sys
from pathlib import Path

if __name__ == "__main__":

    # Корень проекта — там где лежит сам этот скрипт
    project_root = Path(__file__).resolve().parent
    
    # target_dir указывает на корень проекта
    target_dir = project_root
    config_path = project_root / "solid_config.json"
    
    # Путь к директории с исходниками верификатора
    verifier_dir = project_root / "tools" / "solid_verifier"

    cmd = [
        sys.executable,
        "-m", "solid_dashboard", # Теперь обращаемся напрямую к пакету
        "--target-dir", str(target_dir),
        "--config", str(config_path),
    ]
    
    # запускаем из папки верификатора, чтобы Python видел внутренние импорты
    raise SystemExit(subprocess.call(cmd, cwd=verifier_dir))
# Скрипт для унифицированного запуска всех проектных тестов проекта Scopus Search
# Команда для запуска из корня (scopus_search_code): python run_tests.py

import subprocess
import sys
import os

from pathlib import Path

if __name__ == "__main__":
    # запускаем pytest из корня проекта,
    # чтобы работать с правильными путями и конфигами из pyproject.toml
    project_root = Path(__file__).resolve().parent
    
    # Добавляем путь к верификатору в PYTHONPATH, чтобы pytest мог найти модуль solid_dashboard
    env = os.environ.copy()
    verifier_path = str(project_root / "tools" / "solid_verifier")
    
    if "PYTHONPATH" in env:
        env["PYTHONPATH"] = f"{verifier_path}{os.pathsep}{env['PYTHONPATH']}"
    else:
        env["PYTHONPATH"] = verifier_path

    cmd = [
        sys.executable,
        "-m",
        "pytest",
    ]
    
    # Передаем обновленное окружение в subprocess
    raise SystemExit(subprocess.call(cmd, cwd=project_root, env=env))
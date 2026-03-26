import json
from pathlib import Path
from typing import Any, Dict

def load_config(path: str | None) -> Dict[str, Any]:
    """
    Загружает конфиг верификатора из JSON-файла.
    Если путь не передан, пытается найти solid_config.json в текущем рабочем каталоге.
    """
    # Если путь явно указан через --config
    if path:
        config_path = Path(path).resolve()
    else:
        # По умолчанию ищем solid_config.json в CWD
        config_path = Path("solid_config.json").resolve()

    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with config_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    # Минимальная валидация ключей
    if "package_root" not in data:
        raise ValueError("Config must contain 'package_root'")
    if "layers" not in data or not isinstance(data["layers"], dict):
        raise ValueError("Config must contain 'layers' dict")
    if "ignore_dirs" not in data or not isinstance(data["ignore_dirs"], list):
        raise ValueError("Config must contain 'ignore_dirs' list")

    return data

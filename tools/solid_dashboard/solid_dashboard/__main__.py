import argparse
import json

from .pipeline import run_pipeline
from .config import load_config

from .adapters.radon_adapter import RadonAdapter
from .adapters.cohesion_adapter import CohesionAdapter
from .adapters.import_graph_adapter import ImportGraphAdapter
from .adapters.import_linter_adapter import ImportLinterAdapter

def main() -> None:
    parser = argparse.ArgumentParser(description="SOLID-Verifier Dashboard")
    parser.add_argument(
        "--target-dir",
        required=True,
        help="Путь к анализируемому проекту (корень Python-пакета)",
    )
    parser.add_argument(
        "--config",
        required=False,
        help="Путь к solid_config.json (по умолчанию ищется в текущем каталоге)",
    )

    args = parser.parse_args()

    # Загружаем конфиг верификатора
    config = load_config(args.config)

    # Инициализируем адаптеры Блока 1
    adapters = [
        RadonAdapter(),
        CohesionAdapter(),
        ImportGraphAdapter(),
        ImportLinterAdapter(),
    ]

    results = run_pipeline(args.target_dir, config, adapters)

    print("\n=== Результат Pipeline ===")
    print(json.dumps(results, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()

import argparse
import json

from .pipeline import run_pipeline
from .config import load_config

from .adapters.radon_adapter import RadonAdapter
from .adapters.cohesion_adapter import CohesionAdapter
from .adapters.import_graph_adapter import ImportGraphAdapter
from .adapters.import_linter_adapter import ImportLinterAdapter
from .adapters.pyan3_adapter import Pyan3Adapter

def main() -> None:
    parser = argparse.ArgumentParser(description="SOLID-Verifier Dashboard")
    parser.add_argument(
        "--target-dir",
        required=True,
        help="Path to analyzed project (Python package root)",
    )
    parser.add_argument(
        "--config",
        required=False,
        help="Path to solid_config.json (search performed in current catalog by default)",
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
        Pyan3Adapter(),
    ]

    results = run_pipeline(args.target_dir, config, adapters)

    print("\n=== Pipeline Result ===")
    print(json.dumps(results, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()

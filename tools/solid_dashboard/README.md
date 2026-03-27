# SOLID Verifier Dashboard

A config-driven CLI tool for analyzing Python projects against SOLID principles and layered architecture. It orchestrates several static analysis adapters into a single pipeline and produces a machine-readable report.

> **Status:** The tool currently lives inside the `Scopus Search Code` repository under `tools/solid_dashboard/`. It is designed to be extracted into a standalone repository and Python package later.

---

## Features

### Implemented

- **Config-driven architecture**
  - Single `solid_config.json` describes the package root, logical layers, and ignored directories.
  - Makes the verifier reusable across different Python projects.

- **Cyclomatic complexity (Radon)**
  - Computes function/method complexity and ranks (A–F).
  - Helps highlight potential SRP violations (overly complex methods).

- **Class cohesion analysis**
  - Calculates cohesion metrics (LCOM-like) for classes.
  - Flags low-cohesion classes that likely mix multiple responsibilities.

- **AST import graph adapter**
  - Builds a graph of imports between modules.
  - Assigns each module to a layer (routers, services, infrastructure, models, interfaces, other) and exposes internal dependency edges.

- **Architecture contracts with import‑linter**
  - Uses the `import-linter` Python API and a `.importlinter` config in the host project.
  - Enforces layered rules (e.g. routers → services → infrastructure → models; no reversed imports).

- **Call graph analysis (Pyan3)**
  - Generates a static call graph, deduplicates edges, and filters out FastAPI router endpoints when needed.
  - Enables dead-code detection and deeper reasoning about LSP/OCP in the future.

### Planned

- **LLM adapter (AI analysis)**
  - Optional `--ai` / `--ai-strict` mode using OpenAI/Ollama-compatible APIs.
  - Best-effort reasoning about OCP, LSP, ISP and DIP violations that static tools miss.

- **HTML dashboard**
  - Jinja2-based HTML report with vis.js graphs and Bootstrap UI.
  - Visualizes complexity, cohesion, import graph, call graph, and AI findings with filters and drill-down.

- **Baseline diffing**
  - Ability to save a JSON baseline and compare future runs against it.
  - Highlights architectural regressions between commits/branches.

---

## Project Layout

The SOLID Verifier is currently embedded into the `scopus_search_code` repository as a separate tool. Only files relevant to the verifier are shown here.

```text
scopus_search_code/
├── .importlinter                     # Layered architecture contracts for the host app (used by ImportLinterAdapter)
├── run_solid_dashboard.py            # Convenience entry point to run the SOLID pipeline
└── tools/
    └── solid_dashboard/              # SOLID Verifier tool root
        ├── solid_dashboard/          # Main Python package
        │   ├── adapters/             # Adapters for external analyzers
        │   │   ├── cohesion_adapter.py
        │   │   ├── import_graph_adapter.py
        │   │   ├── import_linter_adapter.py
        │   │   ├── pyan3_adapter.py
        │   │   └── radon_adapter.py
        │   ├── interfaces/           # Internal abstractions
        │   │   └── analyzer.py       # IAnalyzer protocol (name + run(target_dir, context, config))
        │   ├── config.py             # Loading and validating solid_config.json
        │   ├── pipeline.py           # Sequential pipeline and context propagation
        │   ├── schema.py             # Typed config/result models (Pydantic / TypedDict)
        │   └── __main__.py           # CLI entry point (argument parsing, report writing)
        ├── tests/                    # Tests for the verifier itself
        │   └── sample_project/       # Minimal project used as test fixture
        ├── report/                   # Generated reports
        │   └── solid_report.log      # Last JSON report of the pipeline
        ├── solid_config.json         # Project-specific layer mapping and ignore rules
        └── requirements.txt          # Dependencies for the verifier (radon, pyan3, import-linter, etc.)
```
---

## Notes

- `run_solid_dashboard.py` lives in the host project root and is deliberately thin:
  it just resolves paths and calls `python -m tools.solid_dashboard.solid_dashboard ...`.
- `run_tests.py` and `run_export_skeleton.py` belong to the main service (tests and LLM context)
  and are intentionally *not* part of the SOLID Verifier surface.

---

## Usage

From the root of the host project (`scopus_search_code`), run:

```bash
python run_solid_dashboard.py
```
This script:

- Resolves the target directory (currently ./app) and the config file (./tools/solid_dashboard/solid_config.json).

- Invokes the internal CLI:

```bash
python -m tools.solid_dashboard.solid_dashboard \
    --target-dir ./app \
    --config ./tools/solid_dashboard/solid_config.json
```
- Executes all configured adapters in sequence (Radon, Cohesion, Import Graph, Import Linter, Pyan3).

- Prints the JSON result to stdout and writes it to:
```text
tools/solid_dashboard/solid_dashboard/report/solid_report.log
```
You can commit solid_config.json and .importlinter to any other Python project, copy the tools/solid_dashboard/ directory, and keep the same command contract. Once extracted into a standalone package, the entry point will become a global CLI (for example solid-dashboard) with the same flags and behavior.
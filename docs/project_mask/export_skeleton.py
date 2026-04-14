# Скрипт для генерации AST-маски проекта: обходит .py-файлы и удаляет тела функций, оставляя сигнатуры.
# Результат сохраняется в docs/project_mask/scopus_project_mask.txt для использования при работе с LLM.
# Запуск из корня репозитория (PowerShell):
#   python docs/project_mask/export_skeleton.py
#
# Хук pre-push автоматически запускает этот скрипт перед каждым git push.
# Для установки хука выполни в PowerShell из корня репозитория:
#   Copy-Item docs/project_mask/pre-push-hook .git/hooks/pre-push

import ast
from pathlib import Path


class SkeletonTransformer(ast.NodeTransformer):
    """АST-трансформер, который удаляет тела функций и методов."""

    def clear_body(self, node):
        doc = ast.get_docstring(node)
        # Если есть докстринг, оставляем его; иначе ставим pass
        if doc:
            node.body = [ast.Expr(value=ast.Constant(value=doc))]
        else:
            node.body = [ast.Pass()]
        return node

    def visit_FunctionDef(self, node):
        self.generic_visit(node)
        return self.clear_body(node)

    def visit_AsyncFunctionDef(self, node):
        self.generic_visit(node)
        return self.clear_body(node)


def generate_project_mask(root_dir: str, output_file: str) -> None:
    root_path = Path(root_dir)

    with open(output_file, "w", encoding="utf-8") as out:
        for py_file in sorted(root_path.rglob("*.py")):
            # Пропускаем служебные директории и всю папку docs (вспомогательные скрипты не являются частью приложения)
            if (
                ".venv" in py_file.parts
                or "alembic" in py_file.parts
                or "docs" in py_file.parts
            ):
                continue

            try:
                code = py_file.read_text(encoding="utf-8")
                tree = ast.parse(code)

                # Применяем трансформацию: удаляем тела функций, оставляем сигнатуры
                SkeletonTransformer().visit(tree)
                skeleton_code = ast.unparse(tree)

                out.write(f"\n{'=' * 60}\n")
                out.write(f"FILE: {py_file.relative_to(root_path)}\n")
                out.write(f"{'=' * 60}\n")
                out.write(skeleton_code)
                out.write("\n")

            except Exception as e:
                out.write(f"\n# Parsing error {py_file}: {e}\n")


if __name__ == "__main__":
    generate_project_mask(
        root_dir=".",
        output_file="docs/project_mask/scopus_project_mask.txt",  # правильный путь к файлу маски
    )
    print("Success! Mask saved in docs/project_mask/scopus_project_mask.txt")

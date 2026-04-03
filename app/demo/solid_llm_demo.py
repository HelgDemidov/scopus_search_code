# app/demo/solid_llm_demo.py

class BaseProcessor:
    # Класс-«иерархия» для LSP-эвристик

    def process(self, value: int) -> str:
        # Базовая реализация, которую дочерние классы должны переопределить
        raise NotImplementedError("Subclasses must implement process()")


class BadProcessor(BaseProcessor):
    # Кандидат для OCP-H-001 и LSP-H-001

    def process(self, value: int) -> str:
        # LSP-H-001: NotImplementedError в override-методе
        if value < 0:
            raise NotImplementedError("Negative values are not supported")

        # OCP-H-001: if/elif цепочка с isinstance
        if isinstance(value, int):
            return f"int:{value}"
        elif isinstance(value, bool):
            return f"bool:{value}"
        elif isinstance(value, float):
            return f"float:{value}"
        else:
            return "unknown"
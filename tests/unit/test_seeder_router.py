# tests/unit/test_seeder_router.py
#
# Юнит-тесты для _check_secret — вызываем функцию напрямую, без HTTP.
# Не используют БД и HTTP-клиент.

import pytest
from fastapi import HTTPException

import app.routers.seeder_router as seeder_module
from app.routers.seeder_router import _check_secret, _is_vacuum_due


def test_check_secret_correct_passes(monkeypatch):
    """Верный секрет не бросает исключение."""
    monkeypatch.setattr(seeder_module, "_SEEDER_SECRET", "correct_secret")
    # Не должно бросить — Header(...) — это просто дефолт для DI, при прямом вызове игнорируется
    _check_secret("correct_secret")


def test_check_secret_wrong_secret_raises_403(monkeypatch):
    """Неверный секрет → HTTPException 403."""
    monkeypatch.setattr(seeder_module, "_SEEDER_SECRET", "correct_secret")
    with pytest.raises(HTTPException) as exc:
        _check_secret("wrong_secret")
    assert exc.value.status_code == 403


def test_check_secret_empty_env_always_rejects(monkeypatch):
    """_SEEDER_SECRET='' (не задан в окружении) → отклоняет любой заголовок."""
    monkeypatch.setattr(seeder_module, "_SEEDER_SECRET", "")
    with pytest.raises(HTTPException) as exc:
        _check_secret("")
    assert exc.value.status_code == 403


class TestIsVacuumDue:
    def test_not_due_before_threshold(self):
        assert _is_vacuum_due(1) is False
        assert _is_vacuum_due(9) is False

    def test_due_exactly_at_threshold(self):
        assert _is_vacuum_due(10) is True

    def test_due_at_every_multiple(self):
        assert _is_vacuum_due(20) is True
        assert _is_vacuum_due(100) is True

    def test_not_due_between_multiples(self):
        assert _is_vacuum_due(11) is False
        assert _is_vacuum_due(19) is False

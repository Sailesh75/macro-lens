"""Tests for search_food's dataType filter — specifically that Survey (FNDDS)
is included so composite/mixed dishes (e.g. "fried rice with chicken") can
match a single combined entry instead of forcing ingredient-by-ingredient
decomposition. See learning.md for why this was added.
"""

from types import SimpleNamespace

from app.pipeline.usda import search_food


def test_search_food_includes_fndds_composite_dish_data(monkeypatch):
    """Mocks get_settings too, not just _get_with_retry — search_food checks
    settings.usda_api_key before doing anything else, and CI has no real
    .env/key to fall back on (unlike a local dev machine), so this must not
    depend on one existing. See learning.md for the CI failure this fixes.
    """
    captured = {}

    class _FakeResponse:
        def json(self):
            return {"foods": []}

    def fake_get_with_retry(url, params, **kwargs):
        captured["params"] = params
        return _FakeResponse()

    monkeypatch.setattr("app.pipeline.usda.get_settings", lambda: SimpleNamespace(usda_api_key="fake-key"))
    monkeypatch.setattr("app.pipeline.usda._get_with_retry", fake_get_with_retry)

    search_food("fried rice")

    data_types = captured["params"]["dataType"]
    assert "Survey (FNDDS)" in data_types
    assert "Foundation" in data_types
    assert "SR Legacy" in data_types
    assert "Branded" not in data_types

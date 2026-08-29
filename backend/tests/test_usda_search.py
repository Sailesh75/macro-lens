"""Tests for search_food's dataType filter — specifically that Survey (FNDDS)
is included so composite/mixed dishes (e.g. "fried rice with chicken") can
match a single combined entry instead of forcing ingredient-by-ingredient
decomposition. See learning.md for why this was added.
"""

from app.pipeline.usda import search_food


def test_search_food_includes_fndds_composite_dish_data(monkeypatch):
    captured = {}

    class _FakeResponse:
        def json(self):
            return {"foods": []}

    def fake_get_with_retry(url, params, **kwargs):
        captured["params"] = params
        return _FakeResponse()

    monkeypatch.setattr("app.pipeline.usda._get_with_retry", fake_get_with_retry)

    search_food("fried rice")

    data_types = captured["params"]["dataType"]
    assert "Survey (FNDDS)" in data_types
    assert "Foundation" in data_types
    assert "SR Legacy" in data_types
    assert "Branded" not in data_types

from retrieval.retriever import Chunk, _extract_article_refs


class TestExtractArticleRefs:
    def test_stattia_pattern(self) -> None:
        assert _extract_article_refs("стаття 17 закону") == {"article_number": "17"}

    def test_abbreviated_st(self) -> None:
        assert _extract_article_refs("ст. 22 ЗУ") == {"article_number": "22"}

    def test_abbreviated_st_no_dot(self) -> None:
        assert _extract_article_refs("ст 5 про закупівлі") == {"article_number": "5"}

    def test_no_match_returns_none(self) -> None:
        assert _extract_article_refs("загальне питання про тендер") is None

    def test_case_insensitive(self) -> None:
        assert _extract_article_refs("СТАТТЯ 5") == {"article_number": "5"}

    def test_returns_first_match(self) -> None:
        result = _extract_article_refs("стаття 17 і стаття 22")
        assert result == {"article_number": "17"}


class TestChunkModel:
    def test_construction(self) -> None:
        chunk = Chunk(id="abc", doc_id="law-922", text="text", score=0.8, metadata={})
        assert chunk.score == 0.8
        assert chunk.text == "text"
        assert chunk.doc_id == "law-922"

    def test_empty_metadata(self) -> None:
        chunk = Chunk(id="x", doc_id="d", text="t", score=0.0, metadata={})
        assert chunk.metadata == {}

    def test_metadata_with_fields(self) -> None:
        meta = {"breadcrumb": "Закон 922 → Стаття 17", "version_date": "2024-01-01"}
        chunk = Chunk(id="y", doc_id="d", text="t", score=0.5, metadata=meta)
        assert chunk.metadata["breadcrumb"] == "Закон 922 → Стаття 17"

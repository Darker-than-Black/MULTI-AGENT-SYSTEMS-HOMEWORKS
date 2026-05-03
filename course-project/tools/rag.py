"""RAG search tool for agents — all retrieval must go through this tool."""

from __future__ import annotations

from typing import cast, Literal

from langchain_core.tools import tool

from config import settings
from retrieval.retriever import hybrid_search

_MAX_CONTEXT_CHARS = 6000


@tool
def rag_search(query: str, collection: str = "laws") -> str:
    """Search the procurement knowledge base.

    Use collection='laws' for questions about Ukrainian procurement law and regulations.
    Use collection='articles' for procedural questions about Prozorro platform usage.
    Returns relevant text snippets with source citations.
    """
    chunks = hybrid_search(
        query,
        cast(Literal["laws", "articles"], collection),
        top_k=settings.rerank_top_k,
    )
    blocks = []
    for chunk in chunks:
        breadcrumb = chunk.metadata.get("breadcrumb") or chunk.metadata.get(
            "title", chunk.doc_id
        )
        source = chunk.metadata.get("source_url") or chunk.doc_id
        blocks.append(f"---\n{breadcrumb}\n{chunk.text}\nДжерело: {source}")

    context = "\n\n".join(blocks)
    return context[:_MAX_CONTEXT_CHARS] if len(context) > _MAX_CONTEXT_CHARS else context

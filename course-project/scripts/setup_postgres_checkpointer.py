"""One-shot setup: create LangGraph checkpointer schema in Postgres.

Usage: python scripts/setup_postgres_checkpointer.py
Prereq: docker compose up -d (Postgres must be reachable at settings.postgres_url).

Idempotent — PostgresSaver.setup() can be called repeatedly without harm.
"""

import sys
from pathlib import Path

# Make project root importable when run as `python scripts/setup_postgres_checkpointer.py`.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from langgraph.checkpoint.postgres import PostgresSaver  # noqa: E402

from config import settings  # noqa: E402


def main() -> None:
    with PostgresSaver.from_conn_string(settings.postgres_url) as checkpointer:
        checkpointer.setup()
    print(f"Checkpointer schema initialized at {settings.postgres_url}")


if __name__ == "__main__":
    main()

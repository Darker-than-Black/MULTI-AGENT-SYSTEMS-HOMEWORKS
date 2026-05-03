"""Entry point: CLI REPL backed by the Phase 2 supervisor graph."""

from __future__ import annotations

from uuid import uuid4

from config import settings
from schemas import GraphState
from supervisor import graph


def sanitize_terminal_text(text: str) -> str:
    return text.encode("utf-8", errors="surrogateescape").decode(
        "utf-8",
        errors="replace",
    )


def build_initial_state(user_message: str, session_id: str) -> GraphState:
    return {
        "user_message": sanitize_terminal_text(user_message),
        "session_id": session_id,
        "user_id": "cli-user",
        "plan": None,
        "worker_responses": [],
        "critic_history": [],
        "retry_count": 0,
        "aggregated_response": None,
        "escalated": False,
        "final_response": None,
    }


def main() -> None:
    print(f"Prozorro Assistant  [{settings.llm_provider}/{settings.llm_model}]")
    print("Введіть запитання або 'exit' для виходу.\n")

    while True:
        try:
            user_input = input("Запит: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nДо побачення!")
            break
        if not user_input:
            continue
        if user_input.lower() in ("exit", "quit"):
            print("До побачення!")
            break

        session_id = str(uuid4())
        initial_state = build_initial_state(user_input, session_id)
        result = graph.invoke(
            initial_state,
            {"configurable": {"thread_id": session_id}},
        )

        print(f"\n{result['final_response']}")
        if result.get("escalated"):
            print("Запит позначено для подальшого опрацювання фахівцем.")
        print()


if __name__ == "__main__":
    main()

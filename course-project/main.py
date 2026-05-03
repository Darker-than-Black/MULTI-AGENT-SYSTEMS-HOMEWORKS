"""Phase-0 entry point: load settings, print Hello, run echo REPL.

Real LangGraph wiring lands in Phase 1.7 (Lawyer single-topic) and
Phase 2.6 (full Planner-driven graph). Until then this REPL just
confirms config + interactive shell work end-to-end.
"""

from config import settings


def main() -> None:
    print("Hello")
    print(f"LLM provider: {settings.llm_provider} / model: {settings.llm_model}")
    print("Echo REPL — type 'exit' to quit.")
    print("-" * 40)
    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye!")
            break
        if not user_input:
            continue
        if user_input.lower() in ("exit", "quit"):
            print("Goodbye!")
            break
        print(f"Echo: {user_input}")


if __name__ == "__main__":
    main()

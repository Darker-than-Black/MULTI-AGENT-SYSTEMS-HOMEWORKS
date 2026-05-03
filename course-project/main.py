"""Entry point: CLI REPL backed by the Lawyer agent (Phase 1)."""

from config import settings


def main() -> None:
    from agents.lawyer import invoke_lawyer  # deferred to keep startup fast when not needed

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

        response = invoke_lawyer(user_input)

        if not response.found:
            print("Відповідь не знайдена: запит поза межами бази знань.\n")
            continue

        print(f"\nВідповідь: {response.answer}")
        print(f"Впевненість: {response.confidence:.0%}")
        if response.sources:
            print("Джерела:")
            for src in response.sources:
                url_part = f"  {src.url}" if src.url else ""
                print(f"  • {src.title}  [{src.doc_id}]{url_part}")
        if response.needs_human:
            print(f"\n⚠ Потрібна консультація фахівця: {response.needs_human_reason}")
        print()


if __name__ == "__main__":
    main()

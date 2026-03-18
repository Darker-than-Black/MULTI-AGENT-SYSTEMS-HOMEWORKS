from agent import agent
from config import Settings
import itertools
import sys
import threading
import time
from datetime import datetime

from tools import write_report

settings = Settings()
THREAD_ID = "research-cli-session"


def _spinner(stop_event: threading.Event, label: str = "System: Processing"):
    for frame in itertools.cycle("|/-\\"):
        if stop_event.is_set():
            break
        sys.stdout.write(f"\r{label} {frame}")
        sys.stdout.flush()
        time.sleep(0.1)
    sys.stdout.write("\r" + " " * 60 + "\r")
    sys.stdout.flush()


def _clear_spinner_line():
    sys.stdout.write("\r" + " " * 60 + "\r")
    sys.stdout.flush()


def main():
    print("Research Agent (type 'exit' to quit)")
    print("-" * 40)

    while True:
        try:
            user_input = input("\nYou: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye!")
            break

        if not user_input:
            continue

        if user_input.lower() in ("exit", "quit"):
            print("Goodbye!")
            break

        report_saved = False
        tool_calls_count = 0
        last_agent_content = ""
        stop_spinner = threading.Event()
        spinner_thread = threading.Thread(
            target=_spinner, args=(stop_spinner,), daemon=True
        )
        spinner_thread.start()

        try:
            for chunk in agent.stream(
                {"messages": [("user", user_input)]},
                config={
                    "configurable": {"thread_id": THREAD_ID},
                    "recursion_limit": settings.max_iterations,
                },
            ):
                if "agent" in chunk and "messages" in chunk["agent"]:
                    for msg in chunk["agent"]["messages"]:
                        tool_calls = getattr(msg, "tool_calls", None) or []
                        if tool_calls:
                            for call in tool_calls:
                                tool_calls_count += 1
                                _clear_spinner_line()
                                print(
                                    f"\nSystem: Step {tool_calls_count} -> calling tool `{call.get('name', 'unknown')}`"
                                )

                        if hasattr(msg, "content") and msg.content:
                            last_agent_content = msg.content
                            _clear_spinner_line()
                            print(f"\nAgent: {msg.content}")

                if "tools" in chunk and "messages" in chunk["tools"]:
                    for msg in chunk["tools"]["messages"]:
                        content = getattr(msg, "content", "")
                        if not content:
                            continue
                        _clear_spinner_line()
                        print(f"\nTool: {content}")
                        if "Report saved to:" in content:
                            report_saved = True
        finally:
            stop_spinner.set()
            spinner_thread.join(timeout=1)

        if not report_saved:
            fallback_filename = (
                f"research_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
            )
            fallback_content = last_agent_content.strip()
            if fallback_content:
                save_result = write_report.invoke(
                    {
                        "filename": fallback_filename,
                        "content": fallback_content,
                    }
                )
                print(f"\nSystem: Agent did not save a file. Fallback save -> {save_result}")
            else:
                print(
                    "\nSystem: No report file was saved and there was no final content to persist."
                )


if __name__ == "__main__":
    main()

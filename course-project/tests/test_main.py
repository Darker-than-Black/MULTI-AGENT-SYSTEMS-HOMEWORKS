from __future__ import annotations

from unittest.mock import Mock

import main


def test_sanitize_terminal_text_replaces_invalid_surrogates() -> None:
    raw = "запит \udcd0 test"

    assert main.sanitize_terminal_text(raw) == "запит � test"


def test_build_initial_state_sets_all_graph_fields() -> None:
    state = main.build_initial_state("Тестовий запит", "session-123")

    assert state == {
        "user_message": "Тестовий запит",
        "session_id": "session-123",
        "user_id": "cli-user",
        "plan": None,
        "worker_responses": [],
        "critic_history": [],
        "retry_count": 0,
        "aggregated_response": None,
        "escalated": False,
        "final_response": None,
    }


def test_build_initial_state_sanitizes_user_message() -> None:
    state = main.build_initial_state("Тест \udcd0 запит", "session-123")

    assert state["user_message"] == "Тест � запит"


def test_main_invokes_graph_and_prints_final_response(
    monkeypatch,
    capsys,
) -> None:
    mock_graph = Mock()
    mock_graph.invoke.return_value = {
        "final_response": "## Юридична консультація\n\nВідповідь по суті.",
        "escalated": False,
    }

    inputs = iter(["Що передбачає стаття 17?", "exit"])
    monkeypatch.setattr(main, "graph", mock_graph)
    monkeypatch.setattr(main, "uuid4", lambda: "session-abc")
    monkeypatch.setattr("builtins.input", lambda _: next(inputs))

    main.main()

    captured = capsys.readouterr().out
    assert "Prozorro Assistant" in captured
    assert "## Юридична консультація" in captured
    mock_graph.invoke.assert_called_once_with(
        main.build_initial_state("Що передбачає стаття 17?", "session-abc"),
        {"configurable": {"thread_id": "session-abc"}},
    )


def test_main_prints_escalation_notice(monkeypatch, capsys) -> None:
    mock_graph = Mock()
    mock_graph.invoke.return_value = {
        "final_response": "Запит передано фахівцю для подальшого опрацювання.",
        "escalated": True,
    }

    inputs = iter(["Система не працює", "quit"])
    monkeypatch.setattr(main, "graph", mock_graph)
    monkeypatch.setattr(main, "uuid4", lambda: "session-escalation")
    monkeypatch.setattr("builtins.input", lambda _: next(inputs))

    main.main()

    captured = capsys.readouterr().out
    assert "Запит передано фахівцю для подальшого опрацювання." in captured
    assert "Запит позначено для подальшого опрацювання фахівцем." in captured

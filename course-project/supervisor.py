"""Phase 2 single-topic supervisor graph for planner routing and final response formatting."""

from __future__ import annotations

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from agents.common_support import invoke_common_support
from agents.lawyer import lawyer_node
from agents.planner import invoke_planner
from agents.technical_support import invoke_technical_support
from final_response import format_response
from schemas import GraphState


def planner_node(state: GraphState) -> dict:
    return {"plan": invoke_planner(state["user_message"])}


def common_support_node(state: GraphState) -> dict:
    return {
        "worker_responses": [
            invoke_common_support(state["plan"].subtasks[0].query)
        ]
    }


def technical_support_node(state: GraphState) -> dict:
    return {
        "worker_responses": [
            invoke_technical_support(state["plan"].subtasks[0].query)
        ]
    }


def off_topic_node(state: GraphState) -> dict:
    reason = state["plan"].off_topic_reason if state.get("plan") else None
    message = "Вибачте, це питання поза межами системи ProZorro."
    if reason:
        message = f"{message} {reason}"
    return {"final_response": message, "escalated": False}


def escalation_stub_node(state: GraphState) -> dict:
    return {
        "final_response": "Запит передано фахівцю для подальшого опрацювання.",
        "escalated": True,
    }


def final_response_node(state: GraphState) -> dict:
    language = state["plan"].language if state.get("plan") else "uk"
    return {
        "final_response": format_response(
            state.get("worker_responses", []),
            language,
        )
    }


def route_after_planner(state: GraphState) -> str:
    plan = state["plan"]
    if not plan.is_on_topic:
        return "off_topic_node"
    if plan.needs_human:
        return "escalation_stub_node"
    return {
        "legal": "lawyer_node",
        "procurement_general": "common_support_node",
        "technical_system": "technical_support_node",
    }[plan.subtasks[0].topic]


def build_graph():
    builder = StateGraph(GraphState)
    builder.add_node("planner_node", planner_node)
    builder.add_node("lawyer_node", lawyer_node)
    builder.add_node("common_support_node", common_support_node)
    builder.add_node("technical_support_node", technical_support_node)
    builder.add_node("off_topic_node", off_topic_node)
    builder.add_node("escalation_stub_node", escalation_stub_node)
    builder.add_node("final_response_node", final_response_node)

    builder.add_edge(START, "planner_node")
    builder.add_conditional_edges(
        "planner_node",
        route_after_planner,
        {
            "lawyer_node": "lawyer_node",
            "common_support_node": "common_support_node",
            "technical_support_node": "technical_support_node",
            "off_topic_node": "off_topic_node",
            "escalation_stub_node": "escalation_stub_node",
        },
    )
    builder.add_edge("lawyer_node", "final_response_node")
    builder.add_edge("common_support_node", "final_response_node")
    builder.add_edge("technical_support_node", "final_response_node")
    builder.add_edge("off_topic_node", END)
    builder.add_edge("escalation_stub_node", END)
    builder.add_edge("final_response_node", END)
    return builder.compile(checkpointer=MemorySaver())


graph = build_graph()

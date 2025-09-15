import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import {
  Annotation,
  END,
  messagesStateReducer,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { writerModel } from "../models.js";
import { prompt_finalReportGeneration } from "../prompts.js";
import { todayStr } from "../utils.js";
import { AgentState, clarifyWithUser, writeResearchBrief } from "./scoping.js";
import { agent as researchMultiAgent } from "./research_multi_agent.js";

export const ResearcherState = Annotation.Root({
  research_brief: Annotation<string>(),
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  researcher_messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  tool_call_iterations: Annotation<number>(),
  research_topic: Annotation<string>(),
  compressed_research: Annotation<string>(),
  raw_notes: Annotation<string[]>(),
});

async function finalReportGeneration(state: typeof AgentState.State) {
  const prompt = prompt_finalReportGeneration(
    state["research_brief"],
    state["notes"].join("\n"),
    todayStr(),
  );

  const finalReport = await writerModel.invoke([new HumanMessage(prompt)]);

  return {
    final_report: finalReport.content,
    messages: ["Here is the final report: " + finalReport.content],
  };
}

export const agent = new StateGraph(AgentState)
  .addNode("clarify_with_user", clarifyWithUser, {
    ends: ["write_research_brief", END],
  })
  .addNode("write_research_brief", writeResearchBrief)
  .addNode("supervisor_subgraph", researchMultiAgent, {
    subgraphs: [researchMultiAgent],
  })
  .addNode("final_report_generation", finalReportGeneration)
  .addEdge(START, "clarify_with_user")
  .addEdge("write_research_brief", "supervisor_subgraph")
  .addEdge("supervisor_subgraph", "final_report_generation")
  .addEdge("final_report_generation", END)
  .compile();

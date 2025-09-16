import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import {
  Annotation,
  Command,
  END,
  messagesStateReducer,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { conductResearch, researchComplete, think } from "../tools.js";
import { supervisorModel } from "../models.js";
import { prompt_leadResearcher } from "../prompts.js";
import { todayStr } from "../utils.js";
import { ToolCall } from "@langchain/core/messages/tool";
import { agent as researchAgent } from "./research.js";

const MAX_RESEARCH_ITERATIONS = 5;
const MAX_CONCURRENT_TOOL_CALLS = 2;

const tools = [conductResearch, researchComplete, think];
const modelWithTools = supervisorModel.bindTools(tools);

export const SupervisorState = Annotation.Root({
  research_brief: Annotation<string>(),
  supervisor_messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  notes: Annotation<string[]>(),
  research_iterations: Annotation<number>(),
  raw_notes: Annotation<string[]>(),
});

async function supervisor(state: typeof SupervisorState.State) {
  const supervisorMessages = state["supervisor_messages"] || [];
  const systemMessage = prompt_leadResearcher(
    todayStr(),
    MAX_CONCURRENT_TOOL_CALLS,
    MAX_RESEARCH_ITERATIONS,
  );
  const messages = [new SystemMessage(systemMessage)].concat(
    supervisorMessages,
  );

  const response = await modelWithTools.invoke(messages);

  return new Command({
    goto: "supervisor_tools",
    update: {
      supervisor_messages: supervisorMessages.concat([response]),
      research_iterations: (state["research_iterations"] || 0) + 1,
    },
  });
}

async function supervisorTools(state: typeof SupervisorState.State) {
  const supervisorMessages = state["supervisor_messages"] || [];
  const researchIterations = state["research_iterations"] || 0;
  const lastMessage = supervisorMessages[supervisorMessages.length - 1];

  const toolMessages: ToolMessage[] = [];
  const allRawNotes: string[] = [];
  let nextStep = "supervisor";
  let shouldEnd = false;

  if (
    !("tool_calls" in lastMessage) ||
    !Array.isArray(lastMessage.tool_calls) ||
    lastMessage.tool_calls.length === 0 ||
    lastMessage.tool_calls.some(
      (call: ToolCall) => call.name === "researchComplete",
    ) ||
    researchIterations >= MAX_RESEARCH_ITERATIONS
  ) {
    shouldEnd = true;
    nextStep = END;
  } else {
    const thinkToolCalls = lastMessage.tool_calls.filter(
      (tc: ToolCall) => tc.name === "think",
    );

    const conductResearchCalls = lastMessage.tool_calls.filter(
      (tc: ToolCall) => tc.name === "conductResearch",
    );

    for (const toolCall of thinkToolCalls) {
      const observation = await think.invoke(toolCall["args"]);
      toolMessages.push(
        new ToolMessage({
          content:
            typeof observation === "string" ? observation : String(observation),
          name: toolCall["name"],
          tool_call_id: toolCall["id"],
        }),
      );
    }

    if (conductResearchCalls.length > 0) {
      const researchResults = await Promise.all(
        conductResearchCalls.map(async (toolCall) => {
          return researchAgent.invoke({
            researcher_messages: [
              new HumanMessage(toolCall["args"]["research_brief"]),
            ],
            research_topic: toolCall["args"]["research_topic"],
          });
        }),
      );

      const researchToolMessages = researchResults.map((result, idx) => {
        return new ToolMessage({
          content:
            result["compressed_research"] || "Error synthesizing research.",
          name: conductResearchCalls[idx].name,
          tool_call_id: conductResearchCalls[idx]["id"],
        });
      });

      toolMessages.push(...researchToolMessages);

      allRawNotes.push(
        researchResults.map((r) => r["raw_notes"] || "").join("\n"),
      );
    }
  }

  if (shouldEnd) {
    return new Command({
      goto: nextStep,
      update: {
        notes: supervisorMessages
          .filter((msg) => msg.getType() === "tool")
          .map((msg) => msg.content),
        research_brief: state["research_brief"],
      },
    });
  }

  return new Command({
    goto: nextStep,
    update: {
      supervisor_messages: supervisorMessages.concat(toolMessages),
      raw_notes: allRawNotes,
    },
  });
}

export const agent = new StateGraph(SupervisorState)
  .addNode("supervisor", supervisor, { ends: ["supervisor_tools", END] })
  .addNode("supervisor_tools", supervisorTools, {
    ends: ["supervisor", END],
    subgraphs: [researchAgent],
  })
  .addEdge(START, "supervisor")
  .compile();

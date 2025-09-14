import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import {
  Annotation,
  END,
  MessagesAnnotation,
  messagesStateReducer,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { tavilySearch, think } from "../tools.js";
import { compressionModel, researchModel } from "../models.js";
import {
  humanPrompt_compressResearch,
  prompt_compressResearch,
  prompt_researchAgent,
} from "../prompts.js";
import { todayStr } from "../utils.js";
import { ToolCall } from "@langchain/core/messages/tool";

const tools = [tavilySearch, think];
const toolsByName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
const modelWithTools = researchModel.bindTools(tools);

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

async function llmCall(state: typeof ResearcherState.State) {
  return {
    researcher_messages: [
      await modelWithTools.invoke(
        [new SystemMessage(prompt_researchAgent(todayStr()))].concat(
          state["researcher_messages"],
        ),
      ),
    ],
  };
}

async function toolNode(state: typeof MessagesAnnotation.State) {
  const messages = state["messages"];
  const lastMessage = messages[messages.length - 1];

  if (
    "tool_calls" in lastMessage &&
    Array.isArray(lastMessage.tool_calls) &&
    lastMessage.tool_calls?.length
  ) {
    const observations = [];
    const toolCalls = lastMessage.tool_calls || [];
    for (const toolCall of toolCalls) {
      const tool = toolsByName[toolCall.toolName];
      if (!tool) {
        observations.push(`No tool found with name ${toolCall.toolName}`);
        continue;
      }

      try {
        const observation = await tool.invoke(toolCall["args"]);
        observations.push(observation);
      } catch (e) {
        observations.push(`Error invoking tool ${toolCall.toolName}: ${e}`);
      }
    }

    const toolOutputs = [
      observations.map((obs, i) => {
        const toolCall = toolCalls[i] as ToolCall;
        return new ToolMessage({
          content: obs,
          name: toolCall["name"] as string,
          id: toolCall["id"] as string,
        });
      }),
    ];

    return {
      researcher_messages: toolOutputs,
    };
  }

  return {};
}

async function writeResearchBrief(state: typeof ResearcherState.State) {
  const systemMessage = prompt_compressResearch(todayStr());
  const messages = [
    new SystemMessage(systemMessage),
    ...state["researcher_messages"],
    new HumanMessage({ content: humanPrompt_compressResearch("testing") }),
  ];

  const response = await compressionModel.invoke(messages);
  const rawNotes = state["researcher_messages"]
    .filter((m) => m.getType() === "ai" || m.getType() === "tool")
    .map((msg) => msg.content);

  return {
    compressed_research: response.content.toString(),
    raw_notes: rawNotes.join("\n"),
  };
}

export const agent = new StateGraph(ResearcherState)
  .addNode("llm_call", llmCall)
  .addNode("tool_node", toolNode)
  .addNode("compress_research", writeResearchBrief)
  .addEdge(START, "llm_call")
  .addConditionalEdges(
    "llm_call",
    (state: typeof ResearcherState.State) => {
      const messages = state["researcher_messages"];
      const lastMessage = messages[messages.length - 1];

      if ("tool_calls" in lastMessage) return "tool_node";
      return "compress_research";
    },
    { tool_node: "tool_node", compress_research: "compress_research" },
  )
  .addEdge("tool_node", "llm_call")
  .addEdge("compress_research", END)
  .compile();

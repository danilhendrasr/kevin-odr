import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import {
  Annotation,
  END,
  messagesStateReducer,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { think } from "../tools.js";
import { compressionModel, researchModel } from "../models.js";
import {
  humanPrompt_compressResearch,
  prompt_compressResearch,
  prompt_researchAgentWithMcp,
} from "../prompts.js";
import { messageHasToolCalls, todayStr } from "../utils.js";
import { ToolCall } from "@langchain/core/messages/tool";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    filesystem: {
      transport: "stdio",
      command: "npx",
      args: [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        __dirname + "/files",
      ],
    },
  },
});

async function llmCall(state: typeof ResearcherState.State) {
  const mcpTools = await mcpClient.getTools();
  const tools = [...mcpTools, think];
  const modelWithTools = researchModel.bindTools(tools);

  return {
    researcher_messages: [
      await modelWithTools.invoke(
        [new SystemMessage(prompt_researchAgentWithMcp(todayStr()))].concat(
          state["researcher_messages"],
        ),
      ),
    ],
  };
}

async function toolNode(state: typeof ResearcherState.State) {
  const messages = state["researcher_messages"];
  const lastMessage = messages[messages.length - 1];

  if (!messageHasToolCalls(lastMessage)) {
    return {
      researcher_messages: [],
    };
  }

  const mcpTools = await mcpClient.getTools();
  const tools = [...mcpTools, think];
  const toolsByName = Object.fromEntries(
    tools.map((tool) => [tool.name, tool]),
  );

  const observations = [];
  const toolCalls =
    "tool_calls" in lastMessage ? (lastMessage.tool_calls as ToolCall[]) : [];
  for (const toolCall of toolCalls) {
    const tool = toolsByName[toolCall.name];
    if (!tool) {
      observations.push(`No tool found with name ${toolCall.name}`);
      continue;
    }

    try {
      // Ensure toolCall.args matches the expected input for the tool
      const observation = await (tool as any).invoke(toolCall.args);
      observations.push(observation);
    } catch (e) {
      observations.push(`Error invoking tool ${toolCall.name}: ${e}`);
    }
  }

  const toolOutputs = observations.map((obs, i) => {
    const toolCall = toolCalls[i] as ToolCall;
    return new ToolMessage({
      content: obs,
      name: toolCall["name"],
      tool_call_id: toolCall["id"] || "<unknown_id>",
    });
  });

  return {
    researcher_messages: toolOutputs,
  };
}

async function compressResearch(state: typeof ResearcherState.State) {
  const systemMessage = prompt_compressResearch(todayStr());
  const messages = [
    new SystemMessage(systemMessage),
    ...state["researcher_messages"],
    new HumanMessage({
      content: humanPrompt_compressResearch(state.research_topic),
    }),
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
  .addNode("compress_research", compressResearch)
  .addEdge(START, "llm_call")
  .addConditionalEdges(
    "llm_call",
    (state: typeof ResearcherState.State) => {
      const messages = state["researcher_messages"];
      const lastMessage = messages[messages.length - 1];

      if (messageHasToolCalls(lastMessage)) {
        return "tool_node";
      }

      return "compress_research";
    },
    { tool_node: "tool_node", compress_research: "compress_research" },
  )
  .addEdge("tool_node", "llm_call")
  .addEdge("compress_research", END)
  .compile();

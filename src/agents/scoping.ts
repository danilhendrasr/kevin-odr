import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import {
  Annotation,
  Command,
  END,
  messagesStateReducer,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import {
  prompt_clarifyWithUser,
  prompt_transformMessagesIntoTopic,
} from "../prompts.js";
import { clarificationSchema, researchQuestionSchema } from "../schemas.js";
import { todayStr } from "../utils.js";

export const AgentState = Annotation.Root({
  research_brief: Annotation<string>(),
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  supervisor_messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  raw_notes: Annotation<string[]>(),
  notes: Annotation<string[]>(),
  final_report: Annotation<string>(),
});

const model = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

export async function clarifyWithUser(state: typeof AgentState.State) {
  const structuredOutputModel = model.withStructuredOutput(
    clarificationSchema,
    { name: "user_clarification" },
  );

  const response = await structuredOutputModel.invoke([
    new HumanMessage(prompt_clarifyWithUser(state["messages"], todayStr())),
  ]);

  if (response.need_clarification) {
    return new Command({
      update: { messages: [new AIMessage(response.question)] },
      goto: END,
    });
  }

  return new Command({
    update: { messages: [new AIMessage(response.verification)] },
    goto: "write_research_brief",
  });
}

export async function writeResearchBrief(state: typeof AgentState.State) {
  const structuredOutputModel = model.withStructuredOutput(
    researchQuestionSchema,
  );

  const response = await structuredOutputModel.invoke([
    new HumanMessage(
      prompt_transformMessagesIntoTopic(state["messages"], todayStr()),
    ),
  ]);

  return {
    research_brief: response.research_brief,
    supervisor_messages: [new HumanMessage(response.research_brief)],
  };
}

export const agent = new StateGraph(AgentState)
  .addNode("clarify_with_user", clarifyWithUser, {
    ends: [END, "write_research_brief"],
  })
  .addNode("write_research_brief", writeResearchBrief)
  .addEdge(START, "clarify_with_user")
  .addEdge("write_research_brief", END)
  .compile();

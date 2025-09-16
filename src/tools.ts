import { tool } from "@langchain/core/tools";
import { z } from "zod/v3";
import {
  deduplicateSearchResults,
  formatSearchOutput,
  summarizeSearchResults,
  tavilySearchMultiple,
} from "./utils.js";

export const tavilySearch = tool(
  async (params) => {
    const searchResults = await tavilySearchMultiple(
      [params.query],
      params.max_results,
      params.topic,
    );

    const uniqueResults = await deduplicateSearchResults(searchResults);
    const summarizedResults = await summarizeSearchResults(uniqueResults);

    return formatSearchOutput(summarizedResults);
  },
  {
    name: "tavily_search",
    description:
      "Fetch results from Tavily search API with content summarization.",
    schema: z.object({
      query: z.string().min(2).max(100),
      max_results: z.number().min(1).max(10).default(3),
      topic: z.enum(["general", "finance", "news"]).default("general"),
    }),
  },
);

export const think = tool(
  (params) => {
    return `Reflection recorded: ${params.reflection}`;
  },
  {
    name: "think",
    description:
      "Tool for strategic reflection on research progress and decision-making.",
    schema: z.object({
      reflection: z.string().min(1),
    }),
  },
);

export const researchComplete = tool(
  () => {
    return "Research process completed.";
  },
  {
    name: "researchComplete",
    description: "Indicate that the research process is complete.",
  },
);

export const conductResearch = tool(
  async () => {
    return "Research conducted and summarized.";
  },
  {
    name: "conductResearch",
    description:
      "Conduct research on a specific topic using Tavily search and summarize findings.",
    schema: z.object({
      research_brief: z.string().min(10),
      research_topic: z.string().min(2),
    }),
  },
);

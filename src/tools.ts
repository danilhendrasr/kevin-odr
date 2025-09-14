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

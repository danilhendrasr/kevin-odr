import { TavilySearch } from "@langchain/tavily";
import { summarizationModel } from "./models.js";
import { webpageSummarySchema } from "./schemas.js";
import { HumanMessage } from "@langchain/core/messages";
import { prompt_summarizeWebpage } from "./prompts.js";

export function todayStr() {
  const today = new Date();
  return today.toISOString().split("T")[0];
}

export type TavilyTopic = "general" | "finance" | "news";

export type WebpageSummaryResult = {
  title: string;
  content: string;
};

const tavilyClient = new TavilySearch({
  tavilyApiKey: process.env.TAVILY_API_KEY!,
});

export async function tavilySearchMultiple(
  queries: string[],
  maxResults = 3,
  topic: TavilyTopic = "general",
  includeRawContent = true,
) {
  const results = await Promise.all(
    queries.map((query) => {
      return tavilyClient.invoke({
        query,
        maxResults,
        includeRawContent,
        topic,
      });
    }),
  );

  return results;
}

export async function deduplicateSearchResults(searchResults: any[]) {
  const dedupedResults: Record<string, any> = {};

  searchResults.forEach((searchResult: any[]) => {
    searchResult.forEach((result) => {
      const url = result.url as string;
      if (!dedupedResults[url]) {
        dedupedResults[url] = result;
      }
    });
  });

  return dedupedResults;
}

export async function summarizeSearchResults(
  dedupedResults: Record<string, any>,
) {
  const summarizedResults: Record<string, WebpageSummaryResult> = {};

  for (const [url, result] of Object.entries(dedupedResults)) {
    let content: string = result["content"];
    if ("raw_content" in result) {
      content = await summarizeWebpageContent(result.raw_content);
    }

    summarizedResults[url] = {
      title: result["title"],
      content: content,
    };
  }

  return summarizedResults;
}

export async function summarizeWebpageContent(content: string) {
  const structuredModel =
    summarizationModel.withStructuredOutput(webpageSummarySchema);

  const summary = await structuredModel.invoke([
    new HumanMessage(prompt_summarizeWebpage(content, todayStr())),
  ]);

  const formattedSummary = `
  <summary>
  ${summary.summary}
  </summary>

  <key_excerpts>
  ${summary.key_excerpts}
  </key_excerpts>
  `;

  return formattedSummary;
}

export function formatSearchOutput(
  summarizedResults: Record<string, WebpageSummaryResult>,
) {
  let formattedOutput = "Search results:\n\n";

  let i = 1;
  for (const [url, result] of Object.entries(summarizedResults)) {
    formattedOutput += `\n\n--- SOURCE ${i}: ${result["title"]} ---\n`;
    formattedOutput += `URL: ${url}\n\n`;
    formattedOutput += `SUMMARY:\n${result["content"]}\n\n`;
    formattedOutput += `-`.repeat(80) + `\n`;
  }

  return formattedOutput;
}

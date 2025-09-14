import { z } from "zod/v3";

export const clarificationSchema = z
  .object({
    need_clarification: z.boolean(),
    question: z.string(),
    verification: z.string(),
  })
  .describe("User clarification needed");

export const researchQuestionSchema = z
  .object({
    research_brief: z.string().min(10).max(5000),
  })
  .describe("Research question schema");

export const researcherSchema = z
  .object({
    researcher_messages: z.array(z.any()),
    tool_call_iterations: z.number().min(0).max(20),
    research_topic: z.string().min(10).max(5000),
    compressed_research: z.string(),
    raw_notes: z.array(z.string()),
  })
  .describe("Researcher schema");

export const researcherOutputSchema = z
  .object({
    compressed_research: z.string(),
    raw_notes: z.array(z.string()),
    researcher_messages: z.array(z.any()),
  })
  .describe("Researcher output schema");

export const webpageSummarySchema = z
  .object({
    summary: z.string().min(10).max(5000),
    key_excerpts: z.string(),
  })
  .describe("Summary schema");

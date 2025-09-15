import { ChatOpenAI } from "@langchain/openai";

export const scopingModel = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

export const researchModel = new ChatOpenAI({
  model: "o4-mini",
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

export const summarizationModel = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

export const compressionModel = new ChatOpenAI({
  model: "gpt-4.1-mini",
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

export const supervisorModel = new ChatOpenAI({
  model: "gpt-4.1",
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

export const writerModel = new ChatOpenAI({
  model: "gpt-4.1",
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
  maxTokens: 32000,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

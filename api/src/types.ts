export * from './types/app.types.ts';
import { JSONSchema4 } from 'json-schema';

export type ConversationId = string;

export enum LLMProvider {
  ANTHROPIC = 'anthropic',
  OPENAI = 'openai',
  GROQ = 'groq',
  UNKNOWN = '',
}

export type LLMMessageContentParts = Array<LLMMessageContentPart>;

export type LLMMessageContentPart =
  | LLMMessageContentPartTextBlock
  | LLMMessageContentPartImageBlock
  | LLMMessageContentPartToolUseBlock;

export interface LLMMessageContentPartTextBlock {
  type: 'text';
  text: string;
}

export interface LLMMessageContentPartImageBlock {
  type: 'image';
  image_url: string;
}

export interface LLMMessageContentPartToolUseBlock {
  type: 'tool_use' | 'tool_calls';
  tool_calls: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export type LLMToolInputSchema = JSONSchema4;

export interface LLMProviderMessageResponse {
  id: string;
  type: LLMProviderMessageResponseType;
  role: LLMProviderMessageResponseRole;
  model: string;
  messageStop: LLMMessageStop;
  usage: LLMTokenUsage;
  rateLimit: LLMRateLimit;
  providerMessageResponseMeta: LLMProviderMessageResponseMeta;
  answerContent: LLMMessageContentParts;
}

export type LLMProviderMessageResponseType = 'message' | 'error';
export type LLMProviderMessageResponseRole = 'assistant' | 'user';

export interface LLMMessageStop {
  stopReason:
    | 'tool_use'
    | 'stop_sequence'
    | 'end_turn'
    | 'max_tokens'
    | 'stop'
    | 'length'
    | 'tool_calls'
    | 'content_filter';
}

export interface LLMTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface LLMRateLimit {
  requestsRemaining: number;
  requestsLimit: number;
  requestsResetDate: Date;
  tokensRemaining: number;
  tokensLimit: number;
  tokensResetDate: Date;
}

export interface LLMProviderMessageResponseMeta {
  status: number;
  statusText: string;
}

export interface LLMSpeakWithOptions {
  messages?: LLMMessage[];
  tools?: LLMTool[];
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  validateResponseCallback?: LLMValidateResponseCallback;
}

export type LLMValidateResponseCallback = (
  llmProviderMessageResponse: LLMProviderMessageResponse,
  conversation: LLMConversation
) => Promise<string | null>;

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: LLMMessageContentParts;
  tool_call_id?: string;
  providerResponse?: LLMProviderMessageResponse;
}

export interface LLMProviderMessageResponse {
  id: string;
  type: LLMProviderMessageResponseType;
  role: LLMProviderMessageResponseRole;
  model: string;
  messageStop: LLMMessageStop;
  usage: LLMTokenUsage;
  rateLimit: LLMRateLimit;
  providerMessageResponseMeta: LLMProviderMessageResponseMeta;
  answerContent: LLMMessageContentParts;
}

export interface LLMTool {
  name: string;
  description: string;
  input_schema: LLMToolInputSchema;
}

export interface LLMConversation {
  id: string;
  repoRecId: string;
  turnCount: number;
  messages: LLMMessage[];
  tools: LLMTool[];
}

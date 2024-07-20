import { LLMProvider as LLMProviderEnum } from 'shared/types.ts';
import LLM from './providers/baseLLM.ts';
import AnthropicLLM from './providers/anthropicLLM.ts';
import OpenAILLM from './providers/openAILLM.ts';

export class LLMFactory {
	static getProvider(providerName: string): LLM {
		switch (providerName.toLowerCase()) {
			case 'claude':
				return new AnthropicLLM();
			case 'openai':
				return new OpenAILLM();
			default:
				throw new Error(`Unsupported LLM provider: ${providerName}`);
		}
	}
}
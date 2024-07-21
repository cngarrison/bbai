import { simpleMerge } from '@cross/deepmerge';

export interface ConfigSchema {
	api: {
		anthropicApiKey?: string;
		openaiApiKey?: string;
		voyageaiApiKey?: string;
		environment: string;
		apiPort: number;
		ignoreLLMRequestCache?: boolean;
	};
	cli: {};
	logFile?: string;
	logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export const defaultConfig: ConfigSchema = {
	api: {
		environment: 'local',
		apiPort: 3000,
		ignoreLLMRequestCache: false,
	},
	cli: {},
	logFile: 'api.log',
	logLevel: 'info',
};

export function mergeConfigs(...configs: Partial<ConfigSchema>[]): ConfigSchema {
	const mergedConfig = simpleMerge(defaultConfig, ...configs);
	return mergedConfig as ConfigSchema;
}

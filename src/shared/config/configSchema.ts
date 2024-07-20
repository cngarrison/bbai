export interface ConfigSchema {
  api: {
    anthropicApiKey: string;
    openaiApiKey: string;
    environment: string;
    appPort: number;
    ignoreLLMRequestCache: boolean;
  };
  cli: {
    // Add CLI-specific configuration options here
  };
  // Add shared configuration options here
}

export function mergeConfigs(...configs: Partial<ConfigSchema>[]): ConfigSchema {
  return configs.reduce((acc, config) => {
    const mergedConfig = { ...acc };

    if (config.api) {
      mergedConfig.api = {
        ...mergedConfig.api,
        ...Object.fromEntries(
          Object.entries(config.api).filter(([_, v]) => v !== undefined)
        ),
      };
    }

    if (config.cli) {
      mergedConfig.cli = {
        ...mergedConfig.cli,
        ...Object.fromEntries(
          Object.entries(config.cli).filter(([_, v]) => v !== undefined)
        ),
      };
    }

    return mergedConfig;
  }, { api: {}, cli: {} } as ConfigSchema);
}

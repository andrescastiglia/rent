import { Injectable } from '@nestjs/common';
import { AiToolRegistryDepsProvider } from './ai-tool-registry-deps.provider';
import { buildAiToolDefinitions } from './openai-tools.registry';
import { AiToolDefinition } from './types/ai-tool.types';

@Injectable()
export class AiToolCatalogService {
  private readonly definitions: AiToolDefinition[];

  constructor(deps: AiToolRegistryDepsProvider) {
    this.definitions = buildAiToolDefinitions(deps);
  }

  getDefinitions(): AiToolDefinition[] {
    return this.definitions;
  }

  getDefinitionByName(name: string): AiToolDefinition | undefined {
    return this.definitions.find((tool) => tool.name === name);
  }
}

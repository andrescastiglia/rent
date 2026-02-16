import { Inject, Injectable } from '@nestjs/common';
import { buildAiToolDefinitions } from './openai-tools.registry';
import { AiToolDefinition } from './types/ai-tool.types';
import { AiToolRegistryDeps } from './openai-tools.registry';

export const AI_TOOL_REGISTRY_DEPS = Symbol('AI_TOOL_REGISTRY_DEPS');

@Injectable()
export class AiToolCatalogService {
  private readonly definitions: AiToolDefinition[];

  constructor(@Inject(AI_TOOL_REGISTRY_DEPS) deps: AiToolRegistryDeps) {
    this.definitions = buildAiToolDefinitions(deps);
  }

  getDefinitions(): AiToolDefinition[] {
    return this.definitions;
  }

  getDefinitionByName(name: string): AiToolDefinition | undefined {
    return this.definitions.find((tool) => tool.name === name);
  }
}

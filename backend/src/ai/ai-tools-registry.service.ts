import { Injectable } from '@nestjs/common';
import { zodFunction } from 'openai/helpers/zod';
import { AiToolCatalogService } from './ai-tool-catalog.service';
import { AiToolExecutorService } from './ai-tool-executor.service';
import { AiExecutionContext } from './types/ai-tool.types';

@Injectable()
export class AiToolsRegistryService {
  constructor(
    private readonly catalog: AiToolCatalogService,
    private readonly executor: AiToolExecutorService,
  ) {}

  getOpenAiTools(context: AiExecutionContext) {
    return this.catalog.getDefinitions().map((tool) =>
      zodFunction({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as any,
        function: async (args: unknown) =>
          this.executor.execute(tool.name, args, context),
      }),
    );
  }
}

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';
import { AiToolsRegistryService } from './ai-tools-registry.service';
import { AiExecutionContext } from './types/ai-tool.types';

@Injectable()
export class AiOpenAiService {
  constructor(private readonly registry: AiToolsRegistryService) {}

  async respond(prompt: string, context: AiExecutionContext) {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL;
    const baseURL = process.env.OPENAI_BASE_URL;

    if (!apiKey) {
      throw new ServiceUnavailableException(
        'OPENAI_API_KEY is not configured in backend environment',
      );
    }

    if (!model) {
      throw new ServiceUnavailableException(
        'OPENAI_MODEL is not configured in backend environment',
      );
    }

    const client = new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });

    const runner = client.chat.completions.runTools({
      model,
      messages: [{ role: 'user', content: prompt }],
      tools: this.registry.getOpenAiTools(context),
    });

    const [content, completion, usage] = await Promise.all([
      runner.finalContent(),
      runner.finalChatCompletion(),
      runner.totalUsage(),
    ]);

    return {
      model: completion.model,
      outputText: content ?? '',
      usage,
    };
  }
}

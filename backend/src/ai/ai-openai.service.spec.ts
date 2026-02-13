import { BadGatewayException, HttpException } from '@nestjs/common';
import { AiToolsRegistryService } from './ai-tools-registry.service';
import { AiOpenAiService } from './ai-openai.service';

describe('AiOpenAiService', () => {
  it('maps OpenAI quota errors to HttpException with provider message', () => {
    const service = new AiOpenAiService({} as AiToolsRegistryService);

    const mapped = (service as any).mapProviderError({
      status: 429,
      requestID: 'req_123',
      message: '429 quota exceeded',
      code: 'insufficient_quota',
      type: 'insufficient_quota',
      error: {
        message: 'You exceeded your current quota',
        code: 'insufficient_quota',
        type: 'insufficient_quota',
      },
    }) as HttpException;

    expect(mapped).toBeInstanceOf(HttpException);
    expect(mapped.getStatus()).toBe(429);
    expect(mapped.getResponse()).toEqual({
      statusCode: 429,
      message: 'You exceeded your current quota',
      error: 'OpenAIError',
      provider: 'openai',
      code: 'insufficient_quota',
      type: 'insufficient_quota',
      requestId: 'req_123',
    });
  });

  it('maps unknown errors to BadGatewayException', () => {
    const service = new AiOpenAiService({} as AiToolsRegistryService);
    const mapped = (service as any).mapProviderError(
      new Error('upstream failed'),
    ) as HttpException;

    expect(mapped).toBeInstanceOf(BadGatewayException);
    expect(mapped.getStatus()).toBe(502);
    expect(mapped.getResponse()).toEqual({
      statusCode: 502,
      message: 'upstream failed',
      error: 'BadGateway',
      provider: 'openai',
    });
  });
});

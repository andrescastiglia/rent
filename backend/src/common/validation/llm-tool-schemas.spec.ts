import {
  buildAnthropicToolSchemas,
  buildOpenAiToolSchemas,
} from './llm-tool-schemas';

describe('llm-tool-schemas', () => {
  it('builds OpenAI function tool schemas', () => {
    const schemas = buildOpenAiToolSchemas();

    expect(Array.isArray(schemas)).toBe(true);
    expect(schemas.length).toBeGreaterThan(30);
    expect(schemas[0]).toEqual(
      expect.objectContaining({
        type: 'function',
        function: expect.objectContaining({
          name: expect.any(String),
          description: expect.any(String),
          parameters: expect.any(Object),
        }),
      }),
    );
    expect(schemas.some((item) => item.function.name === 'auth_login')).toBe(
      true,
    );
    expect(schemas.some((item) => item.function.name === 'leases_create')).toBe(
      true,
    );
  });

  it('builds Anthropic input schemas', () => {
    const schemas = buildAnthropicToolSchemas();

    expect(Array.isArray(schemas)).toBe(true);
    expect(schemas.length).toBeGreaterThan(30);
    expect(schemas[0]).toEqual(
      expect.objectContaining({
        name: expect.any(String),
        description: expect.any(String),
        input_schema: expect.any(Object),
      }),
    );
    expect(schemas.some((item) => item.name === 'whatsapp_send_message')).toBe(
      true,
    );
  });
});

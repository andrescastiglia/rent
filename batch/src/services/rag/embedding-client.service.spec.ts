import { EmbeddingClientService } from "./embedding-client.service";

const vector = (value: number): number[] =>
  Array.from({ length: 1536 }, () => value);

describe("EmbeddingClientService", () => {
  it("batches requests and restores response index order", async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce({
        data: [
          { index: 1, embedding: vector(2) },
          { index: 0, embedding: vector(1) },
        ],
        model: "text-embedding-3-small",
        usage: { prompt_tokens: 5 },
      })
      .mockResolvedValueOnce({
        data: [{ index: 0, embedding: vector(3) }],
        model: "text-embedding-3-small",
        usage: { prompt_tokens: 2 },
      });
    const service = new EmbeddingClientService({
      client: { embeddings: { create } },
      requestBatchSize: 2,
    });

    const result = await service.embed(["one", "two", "three"]);

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.tokens).toBe(7);
    expect(result.embeddings.map((embedding) => embedding[0])).toEqual([
      1, 2, 3,
    ]);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ dimensions: 1536, encoding_format: "float" }),
    );
  });

  it("retries transient failures and rejects invalid dimensions", async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const create = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("rate limited"), { status: 429 }),
      )
      .mockResolvedValueOnce({
        data: [{ index: 0, embedding: [1, 2] }],
        model: "text-embedding-3-small",
      });
    const service = new EmbeddingClientService({
      client: { embeddings: { create } },
      maxAttempts: 2,
      sleep,
    });

    await expect(service.embed(["one"])).rejects.toThrow("expected 1536");
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("requires schema v1 dimensions", () => {
    expect(
      () =>
        new EmbeddingClientService({
          client: { embeddings: { create: jest.fn() } },
          dimensions: 1024,
        }),
    ).toThrow("must be 1536");
  });
});

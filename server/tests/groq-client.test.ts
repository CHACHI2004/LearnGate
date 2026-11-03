import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateGroqJson,
  GroqApiError,
  isGroqAuthenticationError,
  isGroqQuotaError,
} from "../src/services/groq-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Groq JSON client", () => {
  it("sends a chat-completions request in JSON mode and parses the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"questions":[]}' } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateGroqJson(
      "groq-test-key",
      "openai/gpt-oss-20b",
      "System instruction",
      "User prompt",
      1200,
    )).resolves.toEqual({ questions: [] });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(new Headers(options.headers).get("authorization")).toBe("Bearer groq-test-key");
    expect(JSON.parse(String(options.body))).toMatchObject({
      model: "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: "System instruction" },
        { role: "user", content: "User prompt" },
      ],
      max_tokens: 1200,
      response_format: { type: "json_object" },
    });
  });

  it("preserves HTTP status and classifies authentication and quota errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "Invalid API Key" },
    }), { status: 401 })));
    const authError = await generateGroqJson("test-key", "openai/gpt-oss-20b", "system", "prompt", 100)
      .catch((caught: unknown) => caught);

    expect(authError).toBeInstanceOf(GroqApiError);
    expect(isGroqAuthenticationError(authError)).toBe(true);

    expect(isGroqQuotaError(new GroqApiError(429, "Rate limit reached"))).toBe(true);
    expect(isGroqQuotaError(new GroqApiError(503, "The model is temporarily overloaded."))).toBe(false);
  });

  it("distinguishes a timed-out request from a network failure", async () => {
    const timeout = new Error("The operation was aborted");
    timeout.name = "TimeoutError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));

    await expect(generateGroqJson("test-key", "openai/gpt-oss-20b", "system", "prompt", 100))
      .rejects.toMatchObject<Partial<GroqApiError>>({ status: 408, failureKind: "timeout" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new Error("fetch failed"), {
      cause: { code: "ECONNRESET" },
    })));
    await expect(generateGroqJson("test-key", "openai/gpt-oss-20b", "system", "prompt", 100))
      .rejects.toMatchObject<Partial<GroqApiError>>({
        status: 408,
        failureKind: "network",
        networkCode: "ECONNRESET",
      });
  });

  it("rejects responses with no generated content or invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "" } }],
    }), { status: 200 })));
    await expect(generateGroqJson("test-key", "openai/gpt-oss-20b", "system", "prompt", 100))
      .rejects.toThrow("Groq returned no generated content.");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "not json" } }],
    }), { status: 200 })));
    await expect(generateGroqJson("test-key", "openai/gpt-oss-20b", "system", "prompt", 100))
      .rejects.toBeInstanceOf(SyntaxError);
  });
});

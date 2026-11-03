const GROQ_TIMEOUT_MS = 90_000;

export class GroqApiError extends Error {
  constructor(
    readonly status: number,
    readonly providerMessage?: string,
    readonly failureKind?: "timeout" | "network",
    readonly networkCode?: string,
  ) {
    super("Groq request failed");
    this.name = "GroqApiError";
  }
}

function getNetworkCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("cause" in error)) return undefined;
  const cause = error.cause;
  if (typeof cause !== "object" || cause === null || !("code" in cause)) return undefined;
  return typeof cause.code === "string" ? cause.code : undefined;
}

export function isGroqAuthenticationError(error: unknown): error is GroqApiError {
  return error instanceof GroqApiError
    && (error.status === 401
      || error.status === 403
      || /api[_ ]key.*(?:invalid|not valid)|(?:invalid|not valid).*api[_ ]key/i.test(error.providerMessage ?? ""));
}

export function isGroqQuotaError(error: unknown): error is GroqApiError {
  return error instanceof GroqApiError
    && (error.status === 429
      || /quota|rate.?limit|resource.?exhausted|billing/i.test(error.providerMessage ?? ""));
}

export async function generateGroqJson(
  apiKey: string,
  model: string,
  systemInstruction: string,
  prompt: string,
  maxOutputTokens: number,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: maxOutputTokens,
        response_format: { type: "json_object" },
      }),
    });
  } catch (error) {
    const failureKind = error instanceof Error
      && (error.name === "TimeoutError" || error.name === "AbortError")
      ? "timeout"
      : "network";
    throw new GroqApiError(408, undefined, failureKind, getNetworkCode(error));
  }

  if (!response.ok) {
    let providerMessage: string | undefined;
    try {
      const body: unknown = await response.json();
      if (typeof body === "object" && body !== null && "error" in body) {
        const providerError = body.error;
        if (typeof providerError === "object" && providerError !== null
          && "message" in providerError && typeof providerError.message === "string") {
          providerMessage = providerError.message;
        }
      }
    } catch {
      // Some provider errors do not include a JSON response body.
    }
    throw new GroqApiError(response.status, providerMessage);
  }

  const result: unknown = await response.json();
  if (typeof result !== "object" || result === null || !("choices" in result)
    || !Array.isArray(result.choices)) {
    throw new Error("Groq returned an unexpected response.");
  }
  const choices: unknown[] = result.choices;
  const firstChoice = choices[0];
  if (typeof firstChoice !== "object" || firstChoice === null || !("message" in firstChoice)
    || typeof firstChoice.message !== "object" || firstChoice.message === null
    || !("content" in firstChoice.message) || typeof firstChoice.message.content !== "string"
    || !firstChoice.message.content.trim()) {
    throw new Error("Groq returned no generated content.");
  }
  return JSON.parse(firstChoice.message.content);
}

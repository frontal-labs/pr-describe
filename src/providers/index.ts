import { env } from "../env";

export interface GenerateInput {
  system: string;
  prompt: string;
  schema?: string;
}

export interface GenerateOutput {
  json: string;
}

export interface Provider {
  name: string;
  generate(input: GenerateInput): Promise<GenerateOutput>;
}

export interface ProviderOptions {
  apiKey?: string;
  model?: string;
}

export function getProvider(
  name: string,
  options: ProviderOptions = {}
): Provider {
  switch (name) {
    case "anthropic":
      return new AnthropicProvider(options);
    case "openai":
    case "openai-compatible":
      return new OpenAIProvider(options);
    case "mock":
      return new MockProvider();
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

export class MockProvider implements Provider {
  name = "mock";
  async generate(_input: GenerateInput): Promise<GenerateOutput> {
    return {
      json: JSON.stringify({
        type: "feature",
        scope: "core",
        audience: "internal",
        breaking: false,
        summary_internal: "Mock change description.",
        summary_customer: "Mock change description.",
        evidence: [],
        links: [],
      }),
    };
  }
}

export class AnthropicProvider implements Provider {
  name = "anthropic";
  private apiKey: string;
  private model: string;

  constructor(options: ProviderOptions = {}) {
    this.apiKey = options.apiKey ?? env.ANTHROPIC_API_KEY ?? "";
    this.model = options.model ?? "claude-sonnet-5-5";
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    if (!this.apiKey) {
      throw new Error("Anthropic API key not set");
    }
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        temperature: 0.1,
        system: input.system,
        messages: [{ role: "user", content: input.prompt }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { content: Array<{ text: string }> };
    const text = data.content
      .map((c) => c.text)
      .join("")
      .trim();
    return { json: text };
  }
}

export class OpenAIProvider implements Provider {
  name = "openai";
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(options: ProviderOptions = {}) {
    this.apiKey = options.apiKey ?? env.OPENAI_API_KEY ?? "";
    this.model = options.model ?? "gpt-4o";
    this.baseUrl = env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    if (!this.apiKey) {
      throw new Error("OpenAI API key not set");
    }
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.1,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const text = data.choices[0]?.message?.content ?? "";
    return { json: text.trim() };
  }
}

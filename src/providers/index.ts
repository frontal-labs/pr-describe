import { env } from "../env";

export interface GenerateInput {
  prompt: string;
  schema?: string;
  system: string;
}

export interface GenerateOutput {
  json: string;
}

export interface Provider {
  generate(input: GenerateInput): Promise<GenerateOutput>;
  name: string;
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
    const record = {
      audience: "internal",
      breaking: false,
      evidence: [],
      links: [],
      scope: "core",
      summary_customer: "Mock change description.",
      summary_internal: "Mock change description.",
      type: "feature",
    };
    const description =
      "## Summary\n\nMock change description.\n\n## Changes\n\n- Mock change\n\n## Testing\n\n- Mock tests\n\n## Risks\n\n- None";
    return {
      json: `---FRONTCAL_JSON---\n${JSON.stringify(record)}\n---FRONTCAL_MD---\n${description}`,
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
      body: JSON.stringify({
        max_tokens: 4096,
        messages: [{ content: input.prompt, role: "user" }],
        model: this.model,
        system: input.system,
        temperature: 0.1,
      }),
      headers: {
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
      },
      method: "POST",
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
      body: JSON.stringify({
        messages: [
          { content: input.system, role: "system" },
          { content: input.prompt, role: "user" },
        ],
        model: this.model,
        temperature: 0.1,
      }),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
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

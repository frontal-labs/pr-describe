import {
  createGgmlNode,
  type GgmlNode,
  type JsonSchemaObject,
} from "ggml-node";

export interface TextInput {
  prompt: string;
  system: string;
}

export interface ObjectInput extends TextInput {
  schema: JsonSchemaObject;
  schemaName: string;
}

export interface Provider {
  dispose(): Promise<void>;
  generateObject(input: ObjectInput): Promise<unknown>;
  generateText(input: TextInput): Promise<string>;
  name: string;
}

export interface ProviderOptions {
  model?: string;
}

/** Model ids ggml-node can load from its registry. */
export const SUPPORTED_MODELS = [
  "qwen2.5-0.5b",
  "qwen2.5-1.5b",
  "smollm2-360m",
] as const;
export type SupportedModel = (typeof SUPPORTED_MODELS)[number];

export const DEFAULT_MODEL: SupportedModel = "qwen2.5-1.5b";

/**
 * Context window for every request. ggml-node defaults to 4096, which is too
 * small for a 4000-token diff chunk plus the instructions and the output.
 */
export const CONTEXT_SIZE = 8192;

/** Upper bound on generated tokens for one request. */
const MAX_OUTPUT_TOKENS = 1536;

export function getProvider(
  name: string,
  options: ProviderOptions = {}
): Provider {
  switch (name) {
    case "ggml-node":
      return new GgmlProvider(options);
    case "mock":
      return new MockProvider();
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

export function resolveModel(model: string | undefined): SupportedModel {
  if (model === undefined) {
    return DEFAULT_MODEL;
  }
  if (!(SUPPORTED_MODELS as readonly string[]).includes(model)) {
    throw new Error(
      `Unknown model "${model}". Supported: ${SUPPORTED_MODELS.join(", ")}`
    );
  }
  return model as SupportedModel;
}

/**
 * Runs a small language model inside the Node process via ggml-node. The model
 * loads lazily on first use and is cached on disk by ggml-node.
 */
export class GgmlProvider implements Provider {
  name = "ggml-node";
  private model: SupportedModel;
  private node: GgmlNode | null = null;

  constructor(options: ProviderOptions = {}) {
    this.model = resolveModel(options.model);
  }

  private get(): GgmlNode {
    if (!this.node) {
      this.node = createGgmlNode({
        contextSize: CONTEXT_SIZE,
        gpu: "auto",
        model: this.model,
        threads: "auto",
      });
    }
    return this.node;
  }

  async generateText({ prompt, system }: TextInput): Promise<string> {
    const out = await this.get().generate({
      maxTokens: MAX_OUTPUT_TOKENS,
      prompt,
      system,
      temperature: 0.1,
    });
    return out.text.trim();
  }

  async generateObject({
    prompt,
    system,
    schema,
    schemaName,
  }: ObjectInput): Promise<unknown> {
    const out = await this.get().object({
      maxTokens: MAX_OUTPUT_TOKENS,
      prompt,
      schema,
      schemaName,
      system,
      temperature: 0.1,
    });
    return out.object;
  }

  async dispose(): Promise<void> {
    if (this.node) {
      await this.node.unload();
      this.node = null;
    }
  }
}

export class MockProvider implements Provider {
  name = "mock";

  async generateText(_input: TextInput): Promise<string> {
    return "Mock change description.";
  }

  async generateObject(_input: ObjectInput): Promise<unknown> {
    return {
      audience: "internal",
      breaking: false,
      changes: ["Mock change"],
      evidence: [],
      links: [],
      risks: ["None"],
      scope: "core",
      summary: "Mock change description.",
      summary_customer: "Mock change description.",
      summary_internal: "Mock change description.",
      testing: ["Mock tests"],
      type: "feature",
    };
  }

  async dispose(): Promise<void> {
    // Nothing to release.
  }
}

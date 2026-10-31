import { createGgmlNode, type GgmlNode } from "ggml-node";
import {
  CONTEXT_SIZE,
  DEFAULT_MODEL,
  GENERATION_SEED,
  GGML_GPU_MODE,
  GGML_NAME,
  GGML_THREADS,
  MAX_OUTPUT_TOKENS,
  MOCK_NAME,
  TEMPERATURE,
} from "./constants";
import {
  type ModelId,
  ModelIdSchema,
  type ObjectInput,
  type Provider,
  ProviderNameSchema,
  type ProviderOptions,
  type TextInput,
} from "./types";

/**
 * The model id to load. Unset means the default. Anything else must be one of
 * the supported ids, or this throws with the full list.
 */
export function resolveModel(model: string | undefined): ModelId {
  if (model === undefined) {
    return DEFAULT_MODEL;
  }
  const result = ModelIdSchema.safeParse(model);
  if (!result.success) {
    throw new Error(
      `Unknown model "${model}". Supported: ${ModelIdSchema.options.join(", ")}`
    );
  }
  return result.data;
}

export function getProvider(
  name: string,
  options: ProviderOptions = {}
): Provider {
  const parsed = ProviderNameSchema.safeParse(name);
  if (!parsed.success) {
    throw new Error(`Unknown provider: ${name}`);
  }
  switch (parsed.data) {
    case "ggml-node":
      return new GgmlProvider(options);
    case "mock":
      return new MockProvider();
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

/**
 * Runs a small language model inside the Node process via ggml-node. The model
 * loads lazily on first use and is cached on disk by ggml-node.
 */
export class GgmlProvider implements Provider {
  name = GGML_NAME;
  private model: ModelId;
  private node: GgmlNode | null = null;

  constructor(options: ProviderOptions = {}) {
    this.model = resolveModel(options.model);
  }

  private get(): GgmlNode {
    if (!this.node) {
      this.node = createGgmlNode({
        contextSize: CONTEXT_SIZE,
        gpu: GGML_GPU_MODE,
        model: this.model,
        threads: GGML_THREADS,
      });
    }
    return this.node;
  }

  async generateText({ prompt, system }: TextInput): Promise<string> {
    const out = await this.get().generate({
      maxTokens: MAX_OUTPUT_TOKENS,
      prompt,
      seed: GENERATION_SEED,
      system,
      temperature: TEMPERATURE,
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
      seed: GENERATION_SEED,
      system,
      temperature: TEMPERATURE,
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

/** Fixed output for tests and offline runs. Not a real description. */
export class MockProvider implements Provider {
  name = MOCK_NAME;

  async generateText(_input: TextInput): Promise<string> {
    return "Mock change description.";
  }

  async generateObject(input: ObjectInput): Promise<unknown> {
    // Answer the question that was asked: the second opinion wants only type and scope.
    if (input.schemaName === "type_and_scope") {
      return { scope: "core", type: "feature" };
    }
    return {
      audience: "internal",
      breaking: false,
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

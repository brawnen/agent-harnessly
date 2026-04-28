import Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

export interface StructuredGenerationOptions<T> {
  prompt: string;
  schema: z.ZodType<T>;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  toolName?: string;
  toolDescription?: string;
}

export interface TextGenerationOptions {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMClient {
  readonly providerName: string;
  generateStructured<T>(options: StructuredGenerationOptions<T>): Promise<T>;
  generateText(options: TextGenerationOptions): Promise<string>;
}

export interface AnthropicClientOptions {
  apiKey?: string;
  model?: string;
}

function extractTextContent(content: Anthropic.Messages.Message['content']): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ');
  }

  return error instanceof Error ? error.message : String(error);
}

export class AnthropicClient implements LLMClient {
  readonly providerName = 'anthropic';

  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: AnthropicClientOptions = {}) {
    this.client = new Anthropic({
      apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
    this.model = options.model ?? process.env.HARNESSLY_ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
  }

  async generateStructured<T>(options: StructuredGenerationOptions<T>): Promise<T> {
    const toolName = options.toolName ?? 'emit_structured_output';
    const inputSchema = zodToJsonSchema(options.schema, toolName);

    const callOnce = async (extraHint?: string): Promise<T> => {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature,
        system: options.systemPrompt,
        tools: [
          {
            name: toolName,
            description: options.toolDescription ?? '按给定 JSON 结构返回最终结果',
            input_schema: inputSchema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: toolName },
        messages: [
          {
            role: 'user',
            content: extraHint ? `${options.prompt}\n\n上次返回无效：${extraHint}` : options.prompt,
          },
        ],
      });
      const toolUse = response.content.find((block) => block.type === 'tool_use');

      if (!toolUse || toolUse.type !== 'tool_use') {
        throw new Error('模型未按预期返回结构化输出');
      }

      return options.schema.parse(toolUse.input);
    };

    try {
      return await callOnce();
    } catch (error) {
      return callOnce(toErrorMessage(error));
    }
  }

  async generateText(options: TextGenerationOptions): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature,
      system: options.systemPrompt,
      messages: [
        {
          role: 'user',
          content: options.prompt,
        },
      ],
    });

    return extractTextContent(response.content);
  }
}

export function createLLMClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LLMClient | null {
  const provider = env.HARNESSLY_LLM_PROVIDER?.trim();

  if (provider && provider !== 'anthropic') {
    return null;
  }

  if (!env.ANTHROPIC_API_KEY) {
    return null;
  }

  return new AnthropicClient({
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.HARNESSLY_ANTHROPIC_MODEL,
  });
}

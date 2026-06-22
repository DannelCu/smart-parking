import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ClassifiedQuery } from './types/ai-query.types';
import { buildClassificationPrompt } from './prompts/classification.prompt';
import { buildSummaryPrompt } from './prompts/summary.prompt';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic;
  private readonly extractModel: string;
  private readonly summarizeModel: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY no está configurada en el entorno');
    }
    this.client = new Anthropic({ apiKey });
    this.extractModel =
      this.config.get<string>('AI_MODEL_EXTRACT') ?? 'claude-haiku-4-5';
    this.summarizeModel =
      this.config.get<string>('AI_MODEL_SUMMARIZE') ?? 'claude-haiku-4-5';
  }

  async ping(): Promise<string> {
    const response = await this.client.messages.create({
      model: this.extractModel,
      max_tokens: 20,
      messages: [{ role: 'user', content: 'di hola' }],
    });

    const block = response.content[0];
    return block.type === 'text' ? block.text : '';
  }

  async classifyAndExtract(question: string): Promise<ClassifiedQuery> {
    const systemPrompt = buildClassificationPrompt(new Date().toISOString());

    const response = await this.client.messages.create({
      model: this.extractModel,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: question }],
    });

    const block = response.content[0];
    const rawText = block.type === 'text' ? block.text : '';

    return this.parseClassification(rawText);
  }

  async summarize(
    question: string,
    orchestratorResult: unknown,
  ): Promise<string> {
    const systemPrompt = buildSummaryPrompt();

    const userContent = JSON.stringify({
      question,
      result: orchestratorResult,
    });

    const response = await this.client.messages.create({
      model: this.summarizeModel,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    });

    const block = response.content[0];
    return block.type === 'text' ? block.text : '';
  }

  private parseClassification(rawText: string): ClassifiedQuery {
    const cleaned = rawText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    try {
      return JSON.parse(cleaned) as ClassifiedQuery;
    } catch (error) {
      this.logger.error(
        `No se pudo parsear la respuesta de Claude como JSON: ${cleaned}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new Error(
        'La clasificación de la pregunta no devolvió un JSON válido',
      );
    }
  }
}

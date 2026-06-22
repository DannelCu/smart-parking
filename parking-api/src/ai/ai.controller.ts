import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import { OrchestratorService } from './orchestrator.service';
import { AskDto } from './dto/ask.dto';
import { AskResponse, ClassifiedQuery } from './types/ai-query.types';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly orchestrator: OrchestratorService,
  ) {}

  @Post('ask')
  @Roles(UserRole.ADMIN)
  async ask(@Body() dto: AskDto): Promise<AskResponse> {
    const classified: ClassifiedQuery = await this.aiService.classifyAndExtract(
      dto.question,
    );

    const orchestrated = await this.orchestrator.execute(classified);

    const answer = await this.aiService.summarize(dto.question, orchestrated);

    return {
      answer,
      capability: classified.capability,
      intent: classified.intent,
      resultType: orchestrated.resultType,
      data: orchestrated.data,
    };
  }
}

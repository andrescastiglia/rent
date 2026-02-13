import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ExecuteAiToolDto } from './dto/execute-ai-tool.dto';
import { AiChatRequestDto } from './dto/ai-chat-request.dto';
import { AiToolExecutorService } from './ai-tool-executor.service';
import { AiOpenAiService } from './ai-openai.service';
import { AiToolsRegistryService } from './ai-tools-registry.service';

interface AuthenticatedRequest {
  user: {
    id: string;
    companyId?: string;
    role: UserRole;
  };
}

@Controller('ai/tools')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.OWNER, UserRole.TENANT)
export class AiController {
  constructor(
    private readonly executor: AiToolExecutorService,
    private readonly registry: AiToolsRegistryService,
    private readonly openAiService: AiOpenAiService,
  ) {}

  @Get()
  listTools() {
    return {
      mode: this.executor.getMode(),
      tools: this.executor.listTools(),
    };
  }

  @Get('openai')
  listOpenAiTools(@Request() req: AuthenticatedRequest) {
    return this.registry.getOpenAiTools({
      userId: req.user.id,
      companyId: req.user.companyId,
      role: req.user.role,
    });
  }

  @Post('execute')
  async executeTool(
    @Body() dto: ExecuteAiToolDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.executor.execute(dto.toolName, dto.arguments, {
      userId: req.user.id,
      companyId: req.user.companyId,
      role: req.user.role,
    });

    return {
      toolName: dto.toolName,
      mode: this.executor.getMode(),
      result,
    };
  }

  @Post('respond')
  async respond(
    @Body() dto: AiChatRequestDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const response = await this.openAiService.respond(dto.prompt, {
      userId: req.user.id,
      companyId: req.user.companyId,
      role: req.user.role,
    });

    return {
      mode: this.executor.getMode(),
      ...response,
    };
  }
}

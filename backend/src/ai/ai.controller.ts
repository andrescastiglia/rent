import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { AiConversationsService } from './ai-conversations.service';

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
    private readonly conversationsService: AiConversationsService,
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

  @Get('conversations/:conversationId')
  async getConversation(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const conversation = await this.conversationsService.getConversationById({
      conversationId,
      userId: req.user.id,
    });

    return {
      conversationId: conversation.id,
      messages: conversation.messages,
      toolState: conversation.toolState,
      lastActivityAt: conversation.lastActivityAt,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  @Post('respond')
  async respond(
    @Body() dto: AiChatRequestDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const conversation =
      await this.conversationsService.getOrCreateConversation({
        conversationId: dto.conversationId,
        userId: req.user.id,
        companyId: req.user.companyId,
      });

    const context = {
      userId: req.user.id,
      companyId: req.user.companyId,
      conversationId: conversation.id,
      role: req.user.role,
    } as const;

    const history =
      dto.messages && dto.messages.length > 0
        ? dto.messages
        : this.conversationsService.toOpenAiHistory(conversation);

    try {
      const response = await this.openAiService.respond(
        dto.prompt,
        context,
        history,
      );

      const persisted = await this.conversationsService.appendExchange({
        conversationId: conversation.id,
        userId: req.user.id,
        userPrompt: dto.prompt,
        assistantText: response.outputText || '',
        model: response.model,
      });

      return {
        mode: this.executor.getMode(),
        conversationId: conversation.id,
        toolState: persisted.toolState,
        ...response,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'AI provider request failed';
      await this.conversationsService.appendAssistantError({
        conversationId: conversation.id,
        userId: req.user.id,
        userPrompt: dto.prompt,
        assistantError: message,
      });
      throw error;
    }
  }
}

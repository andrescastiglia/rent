import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { UserModulePermissions, UserRole } from '../users/entities/user.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ExecuteAiToolDto } from './dto/execute-ai-tool.dto';
import { AiChatRequestDto } from './dto/ai-chat-request.dto';
import { AiToolExecutorService } from './ai-tool-executor.service';
import { AiToolsRegistryService } from './ai-tools-registry.service';
import { AiConversationsService } from './ai-conversations.service';
import { AiRagRolloutService } from './rag/ai-rag-rollout.service';

interface AuthenticatedRequest {
  user: {
    id: string;
    companyId?: string;
    role: UserRole;
    roles?: UserRole[];
    permissions?: UserModulePermissions;
  };
}

@Controller('ai/tools')
@UseGuards(JwtAuthGuard)
@Roles(
  UserRole.ADMIN,
  UserRole.STAFF,
  UserRole.OWNER,
  UserRole.TENANT,
  UserRole.BUYER,
)
@Authenticated('ai')
export class AiController {
  constructor(
    private readonly executor: AiToolExecutorService,
    private readonly registry: AiToolsRegistryService,
    private readonly conversationsService: AiConversationsService,
    private readonly ragRollout: AiRagRolloutService,
  ) {}

  @Get()
  listTools(@Request() req: AuthenticatedRequest) {
    return {
      mode: this.executor.getMode(),
      tools: this.executor.listTools(req.user),
    };
  }

  @Get('openai')
  listOpenAiTools(@Request() req: AuthenticatedRequest) {
    return this.registry.getOpenAiTools({
      userId: req.user.id,
      companyId: req.user.companyId,
      role: req.user.role,
      roles: req.user.roles,
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
      roles: req.user.roles,
      conversationId: dto.conversationId,
      confirmationId: dto.confirmationId,
      confirmMutation: dto.confirm === true,
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
      companyId: req.user.companyId,
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
    if (!req.user.companyId) {
      throw new ServiceUnavailableException(
        'Authenticated user has no company',
      );
    }
    const response = await this.ragRollout.respond({
      prompt: dto.prompt,
      conversationId: dto.conversationId,
      history: dto.messages,
      context: {
        userId: req.user.id,
        companyId: req.user.companyId,
        role: req.user.role,
        roles: req.user.roles,
        permissions: req.user.permissions,
      },
    });
    return { mode: this.executor.getMode(), ...response };
  }
}

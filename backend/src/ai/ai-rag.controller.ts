import {
  Body,
  Controller,
  Post,
  Request,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserModulePermissions, UserRole } from '../users/entities/user.entity';
import { AiChatRequestDto } from './dto/ai-chat-request.dto';
import { AiRagRolloutService } from './rag/ai-rag-rollout.service';

interface AuthenticatedRequest {
  user: {
    id: string;
    companyId: string;
    role: UserRole;
    permissions?: UserModulePermissions;
  };
}

@Controller('ai')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.OWNER, UserRole.TENANT)
export class AiRagController {
  constructor(private readonly rollout: AiRagRolloutService) {}

  @Post('respond')
  respond(@Body() dto: AiChatRequestDto, @Request() req: AuthenticatedRequest) {
    if (!req.user.companyId) {
      throw new ServiceUnavailableException(
        'Authenticated user has no company',
      );
    }
    return this.rollout.respond({
      prompt: dto.prompt,
      conversationId: dto.conversationId,
      history: dto.messages,
      context: {
        userId: req.user.id,
        companyId: req.user.companyId,
        role: req.user.role,
        permissions: req.user.permissions,
      },
    });
  }
}

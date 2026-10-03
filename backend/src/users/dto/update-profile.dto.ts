import { Allow } from 'class-validator';
import { ContactNormalizationDto } from '../../contact-data/contact-data.dto';
import { UpdateUserDto, updateUserZodSchema } from './update-user.dto';

export class UpdateProfileDto
  extends ContactNormalizationDto
  implements Omit<UpdateUserDto, 'permissions'>
{
  static readonly zodSchema = updateUserZodSchema
    .omit({ permissions: true })
    .strict();

  @Allow() email?: string;
  @Allow() firstName?: string;
  @Allow() lastName?: string;
  @Allow() phone?: string;
  @Allow() avatarUrl?: string | null;
  @Allow() language?: string;
  @Allow() whatsappEnabled?: boolean;
}

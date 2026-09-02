import { UpdateUserDto, updateUserZodSchema } from './update-user.dto';

export class UpdateProfileDto implements Omit<UpdateUserDto, 'permissions'> {
  static readonly zodSchema = updateUserZodSchema
    .omit({ permissions: true })
    .strict();

  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatarUrl?: string | null;
  language?: string;
  whatsappEnabled?: boolean;
}

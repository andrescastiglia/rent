import { UserRole } from '../../users/entities/user.entity';

export class RegisterDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  phone?: string;
}

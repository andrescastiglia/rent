import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSaleFolderDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;
}

import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  body: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean = false;
}

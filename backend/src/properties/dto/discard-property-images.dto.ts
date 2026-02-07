import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class DiscardPropertyImagesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  images: string[];
}

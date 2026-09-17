import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import { detectPlatform } from '../task-rules.js';
import { MAX_LINK_LENGTH } from './submit-draft.dto.js';

/** A link whose host is instagram.com or tiktok.com (or a subdomain of either). */
export function IsVideoLink(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isVideoLink',
      target: target.constructor,
      propertyName: propertyName as string,
      options: {
        message: 'link must be an Instagram or TikTok URL',
        ...options,
      },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && detectPlatform(value) !== null,
      },
    });
  };
}

/** The Submit Link Video modal: the published video's link (required). */
export class SubmitVideoDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LINK_LENGTH)
  @IsVideoLink()
  link: string;
}

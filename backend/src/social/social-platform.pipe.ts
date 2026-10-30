import {
  Injectable,
  NotFoundException,
  type PipeTransform,
} from '@nestjs/common';
import type { SocialPlatform } from './oauth-state.js';

const PLATFORMS: readonly string[] = [
  'instagram',
  'tiktok',
] satisfies readonly SocialPlatform[];

/** The `:platform` route segment, as one of the platforms PBI-19 connects or a 404. */
@Injectable()
export class SocialPlatformPipe implements PipeTransform<
  string,
  SocialPlatform
> {
  transform(value: string): SocialPlatform {
    if (!PLATFORMS.includes(value)) {
      throw new NotFoundException();
    }
    return value as SocialPlatform;
  }
}

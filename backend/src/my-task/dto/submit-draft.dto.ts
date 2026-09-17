import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export const MAX_LINK_LENGTH = 2048;
export const MAX_NOTES_LENGTH = 1000;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** The Submit Draft modal: a link to the draft file (required) and a note for the admin. */
export class SubmitDraftDto {
  // Only http(s) with a real host: anything else is not something an admin can open.
  @Transform(trim)
  @IsNotEmpty()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(MAX_LINK_LENGTH)
  link: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(MAX_NOTES_LENGTH)
  creatorNotes?: string;
}

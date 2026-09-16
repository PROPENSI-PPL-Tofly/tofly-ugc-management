import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const CONTRACT_FILTERS = ['all', 'active', 'expired'] as const;
export const PRODUCTIVITY_FILTERS = ['all', 'good', 'watch', 'risk'] as const;

export type ContractFilter = (typeof CONTRACT_FILTERS)[number];
export type ProductivityFilter = (typeof PRODUCTIVITY_FILTERS)[number];

export const DEFAULT_PAGE_SIZE = 10;
/** An admin listing has no reason to pull the whole roster in one response. */
export const MAX_PAGE_SIZE = 50;
/** Nobody searches for a paragraph; a cap keeps a hostile query from driving the scan. */
export const MAX_SEARCH_LENGTH = 100;

/**
 * Everything the list endpoint accepts. Declared as a class so the global ValidationPipe
 * rejects unknown or malformed parameters at the edge, before any of it reaches a query.
 */
export class ListCreatorsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;

  @IsOptional()
  @IsIn(CONTRACT_FILTERS)
  contract?: ContractFilter;

  @IsOptional()
  @IsIn(PRODUCTIVITY_FILTERS)
  productivity?: ProductivityFilter;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;
}

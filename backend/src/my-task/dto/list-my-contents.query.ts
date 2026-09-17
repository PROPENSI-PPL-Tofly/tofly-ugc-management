import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** The My Task table shows five rows at a time (PRD: "Paginated at 5 rows/page"). */
export const DEFAULT_TASK_PAGE_SIZE = 5;
export const MAX_TASK_PAGE_SIZE = 50;

export class ListMyContentsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_TASK_PAGE_SIZE)
  pageSize?: number;
}

import {
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCreatorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsDateString()
  @IsNotEmpty()
  contractStart!: string;

  @IsDateString()
  @IsNotEmpty()
  contractEnd!: string;

  @IsInt()
  @Min(1)
  contentQuota!: number;

  @IsInt()
  @Min(1)
  daysBetween!: number;

  @IsInt()
  @Min(0)
  fixedRate!: number;

  @IsOptional()
  @IsDateString()
  manualSlotDate?: string;
}

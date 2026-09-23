import {
  IsDateString,
  IsNotEmpty,
  IsUUID,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

function IsDateOnly(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isDateOnly',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: string) {
          return /^\d{4}-\d{2}-\d{2}$/.test(value);
        },
        defaultMessage() {
          'deadline must be a date in YYYY-MM-DD format without time';
        },
      },
    });
  };
}

export class ManualSlotDto {
  @IsUUID()
  @IsNotEmpty()
  contentId!: string;

  @IsDateOnly({ message: 'deadline must be a date in YYYY-MM-DD format without time' })
  @IsNotEmpty()
  deadline!: string;
}

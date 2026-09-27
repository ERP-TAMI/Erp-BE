import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BomType } from '../../../common/enums/database.enums';

export function IsAbsentWhen(
  otherProp: string,
  conditionValue: any,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAbsentWhen',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const obj = args.object as any;
          if (
            obj[otherProp] === conditionValue &&
            value !== undefined &&
            value !== null
          ) {
            return false;
          }
          return true;
        },
      },
    });
  };
}

export function IsAbsent(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAbsent',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          return value === undefined;
        },
      },
    });
  };
}

export class CreateBomDto {
  @ApiProperty({
    enum: BomType,
    description: 'Loại BOM (fit | po)',
    example: BomType.FIT,
  })
  @IsEnum(BomType, { message: 'type must be either fit or po' })
  @IsNotEmpty({ message: 'type is required' })
  type: BomType;

  @ApiPropertyOptional({
    description:
      'Style UUID (bắt buộc khi type = fit, không được truyền khi type = po)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ValidateIf((o) => o.type === BomType.FIT || Boolean(o.styleId))
  @IsUUID(undefined, { message: 'styleId must be a valid UUID' })
  @IsNotEmpty({ message: 'styleId is required when type is fit' })
  @IsAbsentWhen('type', BomType.PO, {
    message: 'styleId is forbidden when type is po',
  })
  styleId?: string;

  @ApiPropertyOptional({
    description:
      'Purchase Order Product UUID (bắt buộc khi type = po, không được truyền khi type = fit)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ValidateIf((o) => o.type === BomType.PO || Boolean(o.purchaseOrderProductId))
  @IsUUID(undefined, { message: 'purchaseOrderProductId must be a valid UUID' })
  @IsNotEmpty({ message: 'purchaseOrderProductId is required when type is po' })
  @IsAbsentWhen('type', BomType.FIT, {
    message: 'purchaseOrderProductId is forbidden when type is fit',
  })
  purchaseOrderProductId?: string;

  @ApiPropertyOptional({
    description: 'Không nhận productColorId trong BOM V2',
  })
  @IsAbsent({ message: 'productColorId is not accepted in BOM V2' })
  productColorId?: any;

  @ApiPropertyOptional({
    description: 'Hạn hoàn thành mẫu / sản xuất',
    example: '2026-10-15T00:00:00.000Z',
  })
  @IsOptional()
  deadline?: Date | string | null;

  @ApiPropertyOptional({
    description: 'Ghi chú kỹ thuật R&D',
    example: 'Lưu ý độ co giãn của vải chính khi cắt',
  })
  @IsOptional()
  @IsString()
  rdNote?: string | null;
}

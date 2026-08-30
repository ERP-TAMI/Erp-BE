import { IsEnum, IsNotEmpty } from 'class-validator';
import { ProductionDocStatus } from '../../../common/enums/database.enums';

export class UpdateProductionDocStatusDto {
  @IsEnum(ProductionDocStatus)
  @IsNotEmpty()
  status: ProductionDocStatus;
}

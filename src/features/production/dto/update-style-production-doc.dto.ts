import { PartialType } from '@nestjs/mapped-types';
import { CreateStyleProductionDocDto } from './create-style-production-doc.dto';

export class UpdateStyleProductionDocDto extends PartialType(
  CreateStyleProductionDocDto,
) {}

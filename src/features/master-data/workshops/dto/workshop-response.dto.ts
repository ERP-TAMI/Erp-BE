import { ApiProperty } from '@nestjs/swagger';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { Workshop } from '../../entities/Workshop.entity';

export class WorkshopResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  workshopCode: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  manager: string | null;

  @ApiProperty({ nullable: true })
  location: string | null;

  @ApiProperty({ type: Number, minimum: 0 })
  capacity: number;

  @ApiProperty({ enum: RecordStatus })
  status: RecordStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;

  static fromEntity(workshop: Workshop): WorkshopResponseDto {
    return {
      id: workshop.id,
      workshopCode: workshop.workshopCode,
      name: workshop.name,
      manager: workshop.manager ?? null,
      location: workshop.location ?? null,
      capacity: workshop.dailyCapacity,
      status: workshop.status,
      createdAt: workshop.createdAt,
      updatedAt: workshop.updatedAt,
    };
  }
}

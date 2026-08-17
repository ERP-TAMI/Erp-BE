import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('style_sample_images')
export class StyleSampleImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'sample_round_id' })
  sampleRoundId: string;

  @Column({ type: 'uuid', name: 'document_version_id' })
  documentVersionId: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'color_name' })
  colorName: string;

  @Column({ type: 'int', default: 0, name: 'order_index' })
  orderIndex: number;
}

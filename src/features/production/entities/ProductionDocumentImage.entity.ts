import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('production_document_images')
export class ProductionDocumentImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'section_id' })
  sectionId: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'group_heading',
  })
  groupHeading: string;

  @Column({
    type: 'varchar',
    length: 30,
    nullable: true,
    name: 'heading_color',
  })
  headingColor: string;

  @Column({ type: 'uuid', name: 'document_version_id' })
  documentVersionId: string;

  @Column({ type: 'int', default: 0, name: 'group_order' })
  groupOrder: number;

  @Column({ type: 'int', default: 0, name: 'image_order' })
  imageOrder: number;
}

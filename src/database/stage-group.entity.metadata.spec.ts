import { getMetadataArgsStorage } from 'typeorm';
import { StageGroup } from '../features/master-data/entities/StageGroup.entity';
import { StageGroupItem } from '../features/master-data/entities/StageGroupItem.entity';

describe('stage group entity metadata', () => {
  it('maps nullable stage group fields to the existing schema', () => {
    const description = getMetadataArgsStorage().columns.find(
      (column) =>
        column.target === StageGroup && column.propertyName === 'description',
    );

    expect(description?.options.nullable).toBe(true);
  });

  it('hydrates generated timestamps when a stage group is saved', () => {
    const columns = getMetadataArgsStorage().columns.filter(
      (column) => column.target === StageGroup,
    );
    const byProperty = new Map(
      columns.map((column) => [column.propertyName, column]),
    );

    expect(byProperty.get('createdAt')?.mode).toBe('createDate');
    expect(byProperty.get('updatedAt')?.mode).toBe('updateDate');
  });

  it('maps independent stage group child fields to the new schema', () => {
    const columns = getMetadataArgsStorage().columns.filter(
      (column) => column.target === StageGroupItem,
    );
    const byProperty = new Map(
      columns.map((column) => [column.propertyName, column.options]),
    );

    expect(byProperty.get('id')?.type).toBe('uuid');
    expect(byProperty.get('stageGroupId')?.name).toBe('stage_group_id');
    expect(byProperty.get('itemName')?.name).toBe('item_name');
    expect(byProperty.get('description')?.nullable).toBe(true);
    expect(byProperty.has('stageId')).toBe(false);
    expect(byProperty.get('ssv')).toEqual(
      expect.objectContaining({
        type: 'numeric',
        precision: 12,
        scale: 3,
      }),
    );
  });
});

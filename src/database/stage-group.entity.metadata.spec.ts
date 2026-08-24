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

  it('maps stage group item keys and snapshots to snake_case columns', () => {
    const columns = getMetadataArgsStorage().columns.filter(
      (column) => column.target === StageGroupItem,
    );
    const byProperty = new Map(
      columns.map((column) => [column.propertyName, column.options]),
    );

    expect(byProperty.get('stageGroupId')?.name).toBe('stage_group_id');
    expect(byProperty.get('stageId')?.name).toBe('stage_id');
    expect(byProperty.get('descriptionSnapshot')?.nullable).toBe(true);
    expect(byProperty.get('ssvSnapshot')).toEqual(
      expect.objectContaining({
        name: 'ssv_snapshot',
        type: 'numeric',
        precision: 12,
        scale: 3,
      }),
    );
  });
});

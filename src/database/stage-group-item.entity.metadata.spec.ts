import { getMetadataArgsStorage } from 'typeorm';
import { RecordStatus } from '../common/enums/database.enums';
import { StageGroupItem } from '../features/master-data/entities/StageGroupItem.entity';

describe('StageGroupItem entity metadata', () => {
  it('maps an independent child operation without a Stage relation', () => {
    const columns = getMetadataArgsStorage().columns.filter(
      (column) => column.target === StageGroupItem,
    );
    const byProperty = new Map(
      columns.map((column) => [column.propertyName, column]),
    );

    expect(byProperty.get('id')?.mode).toBe('regular');
    expect(byProperty.get('id')?.options).toEqual(
      expect.objectContaining({ type: 'uuid', primary: true }),
    );
    expect(byProperty.get('stageGroupId')?.options.name).toBe('stage_group_id');
    expect(byProperty.get('itemName')?.options.name).toBe('item_name');
    expect(byProperty.get('description')?.options.nullable).toBe(true);
    expect(byProperty.get('ssv')?.options).toEqual(
      expect.objectContaining({
        type: 'numeric',
        precision: 12,
        scale: 3,
      }),
    );
    expect(byProperty.get('status')?.options).toEqual(
      expect.objectContaining({
        enumName: 'record_status',
        default: RecordStatus.ACTIVE,
      }),
    );
    expect(byProperty.has('stageId')).toBe(false);
  });
});

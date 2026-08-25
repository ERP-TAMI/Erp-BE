import { QueryRunner } from 'typeorm';
import { MakeStageGroupItemsIndependent1740000000011 } from './migrations/1740000000011-MakeStageGroupItemsIndependent';

describe('MakeStageGroupItemsIndependent migration', () => {
  const migration = new MakeStageGroupItemsIndependent1740000000011();

  it('preserves snapshots and source status while replacing the Stage FK', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await migration.up({ query } as unknown as QueryRunner);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('RENAME COLUMN stage_id TO legacy_source_stage_id');
    expect(sql).toContain('RENAME COLUMN name_snapshot TO item_name');
    expect(sql).toContain('ADD COLUMN id uuid NOT NULL');
    expect(sql).toContain('SET status = stage.status');
    expect(sql).toContain('DROP CONSTRAINT stage_group_items_stage_id_fkey');
    expect(sql).toContain('PRIMARY KEY (id)');
  });

  it('guards rollback after independent-only children are created', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await migration.down({ query } as unknown as QueryRunner);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('WHERE legacy_source_stage_id IS NULL');
    expect(sql).toContain('RAISE EXCEPTION');
    expect(sql).toContain('PRIMARY KEY (stage_group_id, stage_id)');
    expect(sql).toContain('REFERENCES stages(id) ON DELETE RESTRICT');
  });
});

import { QueryRunner } from 'typeorm';
import { RemoveDocumentPins1740000000048 } from './migrations/1740000000048-RemoveDocumentPins';

describe('RemoveDocumentPins1740000000048', () => {
  const migration = new RemoveDocumentPins1740000000048();

  it('drops the obsolete document pin table', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await migration.up({ query } as unknown as QueryRunner);

    expect(query).toHaveBeenCalledWith('DROP TABLE IF EXISTS document_pins');
  });

  it('restores the pin table when rolled back', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await migration.down({ query } as unknown as QueryRunner);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('CREATE TABLE document_pins');
    expect(sql).toContain('CREATE INDEX idx_document_pins_document_id');
  });
});

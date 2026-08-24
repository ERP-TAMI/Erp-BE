import { getMetadataArgsStorage } from 'typeorm';
import { ProductionDocument } from '../features/production/entities/ProductionDocument.entity';
import { StyleDocument } from '../features/styles/entities/StyleDocument.entity';

describe('ProductionDocument entity owner fields metadata', () => {
  const columns = getMetadataArgsStorage().columns.filter(
    (column) => column.target === ProductionDocument,
  );

  it('configures styleId as nullable uuid column', () => {
    const column = columns.find(
      (metadata) => metadata.propertyName === 'styleId',
    );

    expect(column).toBeDefined();
    expect(column?.options).toMatchObject({
      type: 'uuid',
      name: 'style_id',
      nullable: true,
    });
  });

  it('configures productId as nullable uuid column', () => {
    const column = columns.find(
      (metadata) => metadata.propertyName === 'productId',
    );

    expect(column).toBeDefined();
    expect(column?.options).toMatchObject({
      type: 'uuid',
      name: 'product_id',
      nullable: true,
    });
  });
});

describe('StyleDocument entity metadata', () => {
  const columns = getMetadataArgsStorage().columns.filter(
    (column) => column.target === StyleDocument,
  );

  it('configures linkedAt as create date column with timestamptz', () => {
    const column = columns.find(
      (metadata) => metadata.propertyName === 'linkedAt',
    );

    expect(column).toBeDefined();
    expect(column?.mode).toBe('createDate');
    expect(column?.options).toMatchObject({
      type: 'timestamptz',
      name: 'linked_at',
    });
  });
});

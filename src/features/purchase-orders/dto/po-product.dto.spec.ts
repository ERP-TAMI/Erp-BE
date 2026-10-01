import { validate } from 'class-validator';
import { CreatePoProductDto } from './po-product.dto';

describe('CreatePoProductDto', () => {
  it('rejects a missing product deadline', async () => {
    const dto = Object.assign(new CreatePoProductDto(), {
      productCode: 'PROD-001',
      productName: 'Áo Polo',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'deadline')).toBe(true);
  });

  it('accepts a valid product deadline', async () => {
    const dto = Object.assign(new CreatePoProductDto(), {
      productCode: 'PROD-001',
      productName: 'Áo Polo',
      deadline: '2026-12-23',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'deadline')).toBe(false);
  });
});

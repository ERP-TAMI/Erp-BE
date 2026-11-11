import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
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

  it('accepts colors with independent ratio values or null when not entered', async () => {
    const dto = plainToInstance(CreatePoProductDto, {
      productCode: 'PROD-001',
      productName: 'Áo Polo',
      deadline: '2026-12-23',
      colors: [
        {
          colorName: 'Đen',
          ratio: '1:2:1',
          sizes: [{ sizeLabel: 'M', quantity: 10 }],
        },
        {
          colorName: 'Trắng',
          ratio: null,
          sizes: [{ sizeLabel: 'S', quantity: 5 }],
        },
      ],
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreatePoProductDto, UpdatePoProductDto } from './po-product.dto';

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

describe('UpdatePoProductDto', () => {
  it('accepts partial colorRatios with string or null ratio values', async () => {
    const dto = plainToInstance(UpdatePoProductDto, {
      productName: 'Áo Polo Cập Nhật',
      colorRatios: [
        { id: 'color-1', ratio: '2:2:1' },
        { id: 'color-2', ratio: null },
      ],
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects colorRatios entries with empty id or ratio exceeding 100 chars', async () => {
    const emptyIdDto = plainToInstance(UpdatePoProductDto, {
      colorRatios: [{ id: '', ratio: '1:1' }],
    });
    const longRatioDto = plainToInstance(UpdatePoProductDto, {
      colorRatios: [{ id: 'color-1', ratio: 'x'.repeat(101) }],
    });

    const emptyIdErrors = await validate(emptyIdDto);
    const longRatioErrors = await validate(longRatioDto);

    expect(
      emptyIdErrors.some((error) => error.property === 'colorRatios'),
    ).toBe(true);
    expect(
      longRatioErrors.some((error) => error.property === 'colorRatios'),
    ).toBe(true);
  });
});

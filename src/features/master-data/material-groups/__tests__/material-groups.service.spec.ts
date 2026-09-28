import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { Material } from '../../entities/Material.entity';
import { MaterialGroup } from '../../entities/MaterialGroup.entity';
import { MaterialGroupsService } from '../material-groups.service';

describe('MaterialGroupsService', () => {
  const group: MaterialGroup = {
    id: '9fb4d58f-0e6d-4ed5-b122-2b9f61aae115',
    name: 'Fabric',
    status: RecordStatus.ACTIVE,
  };

  let materialGroups: jest.Mocked<Repository<MaterialGroup>>;
  let materials: jest.Mocked<Repository<Material>>;
  let normalizedNameResult: jest.Mock<Promise<MaterialGroup | null>, []>;
  let getManyAndCount: jest.Mock;
  let service: MaterialGroupsService;

  beforeEach(() => {
    normalizedNameResult = jest.fn();
    getManyAndCount = jest.fn();
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getOne: normalizedNameResult,
      getManyAndCount,
    } as unknown as SelectQueryBuilder<MaterialGroup>;

    materialGroups = {
      find: jest.fn(),
      findOneBy: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<Repository<MaterialGroup>>;
    materials = {
      countBy: jest.fn(),
    } as unknown as jest.Mocked<Repository<Material>>;
    service = new MaterialGroupsService(materialGroups, materials);
  });

  it('creates an active group with the documented fields', async () => {
    normalizedNameResult.mockResolvedValue(null);
    materialGroups.create.mockReturnValue({ ...group });
    materialGroups.save.mockResolvedValue({ ...group });

    await expect(service.create({ name: ' Fabric ' })).resolves.toMatchObject({
      name: 'Fabric',
      status: RecordStatus.ACTIVE,
    });

    expect(materialGroups.create).toHaveBeenCalledWith({
      name: 'Fabric',
      status: RecordStatus.ACTIVE,
    });
  });

  it('rejects a duplicate name after trim and case normalization', async () => {
    normalizedNameResult.mockResolvedValue(group);

    await expect(service.create({ name: ' fabric ' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects a duplicate normalized name when updating a group', async () => {
    materialGroups.findOneBy.mockResolvedValue({ ...group });
    normalizedNameResult.mockResolvedValue({
      ...group,
      id: 'f38d4470-ad4f-4da0-b13c-90999a81432f',
    });

    await expect(
      service.update(group.id, { name: ' FABRIC ' }),
    ).rejects.toThrow(ConflictException);
    expect(materialGroups.save).not.toHaveBeenCalled();
  });

  it('queries active groups for material creation lookups', async () => {
    getManyAndCount.mockResolvedValue([[group], 1]);

    await expect(
      service.findAll({ status: RecordStatus.ACTIVE }),
    ).resolves.toEqual({
      data: [group],
      meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
    });
  });

  it('renames a group without treating material references as a blocker', async () => {
    materialGroups.findOneBy.mockResolvedValue({ ...group });
    normalizedNameResult.mockResolvedValue(null);
    materialGroups.save.mockResolvedValue({
      ...group,
      name: 'New fabric',
    });

    await expect(
      service.update(group.id, { name: 'New fabric' }),
    ).resolves.toMatchObject({ name: 'New fabric' });
    expect(materials.countBy).not.toHaveBeenCalled();
    expect(materialGroups.save).toHaveBeenCalled();
  });

  it('does not hard-delete a group that is referenced by materials', async () => {
    materialGroups.findOneBy.mockResolvedValue(group);
    materials.countBy.mockResolvedValue(1);

    await expect(service.remove(group.id)).rejects.toThrow(ConflictException);
    expect(materialGroups.remove).not.toHaveBeenCalled();
  });

  it('returns a conflict if a concurrent foreign-key reference prevents deletion', async () => {
    materialGroups.findOneBy.mockResolvedValue(group);
    materials.countBy.mockResolvedValue(0);
    materialGroups.remove.mockRejectedValue({ code: '23503' });

    await expect(service.remove(group.id)).rejects.toThrow(ConflictException);
  });

  it('returns not found when the requested group does not exist', async () => {
    materialGroups.findOneBy.mockResolvedValue(null);

    await expect(service.findOne(group.id)).rejects.toThrow(NotFoundException);
  });
});

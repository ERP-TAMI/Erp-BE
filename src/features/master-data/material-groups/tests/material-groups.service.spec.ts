import { ConflictException, NotFoundException } from '@nestjs/common';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { MaterialGroup } from '../../entities/MaterialGroup.entity';
import { MaterialGroupsRepository } from '../repositories/material-groups.repository';
import { MaterialGroupsService } from '../services/material-groups.service';

describe('MaterialGroupsService', () => {
  const group: MaterialGroup = {
    id: '9fb4d58f-0e6d-4ed5-b122-2b9f61aae115',
    code: 'FABRIC',
    name: 'Fabric',
    displayOrder: 0,
    status: RecordStatus.ACTIVE,
  };

  let repository: jest.Mocked<MaterialGroupsRepository>;
  let service: MaterialGroupsService;

  beforeEach(() => {
    repository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByCode: jest.fn(),
      findByNormalizedName: jest.fn(),
      hasMaterialReference: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<MaterialGroupsRepository>;
    service = new MaterialGroupsService(repository);
  });

  it('creates an active group with a generated code when only the documented fields are provided', async () => {
    repository.findByCode.mockResolvedValue(null);
    repository.findByNormalizedName.mockResolvedValue(null);
    repository.create.mockReturnValue({ ...group });
    repository.save.mockResolvedValue({ ...group });

    await expect(
      service.create({ name: ' Fabric ', displayOrder: 0 }),
    ).resolves.toMatchObject({
      name: 'Fabric',
      status: RecordStatus.ACTIVE,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: expect.stringMatching(/^MG-[A-F0-9]{32}$/),
        name: 'Fabric',
        displayOrder: 0,
        status: RecordStatus.ACTIVE,
      }),
    );
  });

  it('rejects a duplicate code before creating a group', async () => {
    repository.findByCode.mockResolvedValue(group);

    await expect(
      service.create({ code: 'fabric', name: 'Another name', displayOrder: 1 }),
    ).rejects.toThrow(ConflictException);
  });

  it('keeps supporting an explicitly supplied code for existing API clients', async () => {
    repository.findByCode.mockResolvedValue(null);
    repository.findByNormalizedName.mockResolvedValue(null);
    repository.create.mockReturnValue({ ...group });
    repository.save.mockResolvedValue({ ...group });

    await service.create({
      code: ' fabric ',
      name: ' Fabric ',
      displayOrder: 0,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'FABRIC' }),
    );
  });

  it('rejects a duplicate name after trim and case normalization', async () => {
    repository.findByCode.mockResolvedValue(null);
    repository.findByNormalizedName.mockResolvedValue(group);

    await expect(
      service.create({ code: 'ACCESSORY', name: ' fabric ', displayOrder: 1 }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a duplicate normalized name when updating a group', async () => {
    repository.findById.mockResolvedValue({ ...group });
    repository.findByNormalizedName.mockResolvedValue({
      ...group,
      id: 'f38d4470-ad4f-4da0-b13c-90999a81432f',
    });

    await expect(
      service.update(group.id, { name: ' FABRIC ' }),
    ).rejects.toThrow(ConflictException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('passes the active filter to the repository for material creation lookups', async () => {
    repository.findAll.mockResolvedValue([group]);

    await expect(
      service.findAll({ status: RecordStatus.ACTIVE }),
    ).resolves.toEqual([group]);
    expect(repository.findAll).toHaveBeenCalledWith(RecordStatus.ACTIVE);
  });

  it('allows changing a unique code without treating material references as a blocker', async () => {
    repository.findById.mockResolvedValue({ ...group });
    repository.hasMaterialReference.mockResolvedValue(true);
    repository.findByCode.mockResolvedValue(null);
    repository.save.mockImplementation(async (materialGroup) => materialGroup);

    await expect(
      service.update(group.id, { code: 'NEW-FABRIC' }),
    ).resolves.toMatchObject({ code: 'NEW-FABRIC' });
    expect(repository.findByCode).toHaveBeenCalledWith('NEW-FABRIC');
    expect(repository.hasMaterialReference).not.toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalled();
  });

  it('does not hard-delete a group that is referenced by materials', async () => {
    repository.findById.mockResolvedValue(group);
    repository.hasMaterialReference.mockResolvedValue(true);

    await expect(service.remove(group.id)).rejects.toThrow(ConflictException);
    expect(repository.remove).not.toHaveBeenCalled();
  });

  it('returns a conflict if a concurrent foreign-key reference prevents deletion', async () => {
    repository.findById.mockResolvedValue(group);
    repository.hasMaterialReference.mockResolvedValue(false);
    repository.remove.mockRejectedValue({ code: '23503' });

    await expect(service.remove(group.id)).rejects.toThrow(ConflictException);
  });

  it('returns not found when the requested group does not exist', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(service.findOne(group.id)).rejects.toThrow(NotFoundException);
  });
});

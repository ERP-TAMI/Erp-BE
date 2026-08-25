import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StageGroup } from '../entities/StageGroup.entity';
import { StageGroupItem } from '../entities/StageGroupItem.entity';

export interface StageGroupResponse {
  id: string;
  code: string;
  name: string;
  description?: string;
  isGroup: boolean;
  items: Array<{
    id: string;
    name: string;
    description?: string;
    ssv: number;
    orderIndex: number;
  }>;
}

@Injectable()
export class StageGroupsService {
  constructor(
    @InjectRepository(StageGroup)
    private readonly stageGroupRepo: Repository<StageGroup>,
    @InjectRepository(StageGroupItem)
    private readonly stageGroupItemRepo: Repository<StageGroupItem>,
  ) {}

  async findAll(): Promise<StageGroupResponse[]> {
    const groups = await this.stageGroupRepo.find({
      order: { groupCode: 'ASC' },
    });

    const result: StageGroupResponse[] = [];
    for (const g of groups) {
      const items = await this.stageGroupItemRepo.find({
        where: { stageGroupId: g.id },
        order: { orderIndex: 'ASC' },
      });

      result.push({
        id: g.id,
        code: g.groupCode,
        name: g.groupName,
        description: g.description || undefined,
        isGroup: true,
        items: items.map((it) => ({
          id: it.stageId,
          name: it.nameSnapshot,
          description: it.descriptionSnapshot || undefined,
          ssv: Number(it.ssvSnapshot) || 0,
          orderIndex: it.orderIndex,
        })),
      });
    }

    return result;
  }

  async findOne(id: string): Promise<StageGroupResponse> {
    const g = await this.stageGroupRepo.findOne({ where: { id } });
    if (!g) throw new NotFoundException(`Nhóm công đoạn #${id} không tồn tại`);

    const items = await this.stageGroupItemRepo.find({
      where: { stageGroupId: g.id },
      order: { orderIndex: 'ASC' },
    });

    return {
      id: g.id,
      code: g.groupCode,
      name: g.groupName,
      description: g.description || undefined,
      isGroup: true,
      items: items.map((it) => ({
        id: it.stageId,
        name: it.nameSnapshot,
        description: it.descriptionSnapshot || undefined,
        ssv: Number(it.ssvSnapshot) || 0,
        orderIndex: it.orderIndex,
      })),
    };
  }
}

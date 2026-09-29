import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { Repository } from 'typeorm';
import { RequestUser } from '../../auth/jwt-payload.type';
import { BomType } from '../../../common/enums/database.enums';
import { assertPurchaseOrderWriteAccess } from '../../../common/security/purchase-order-write-access';
import { Bom } from '../entities/Bom.entity';

@Injectable()
export class PurchaseOrderBomWriteAccessGuard implements CanActivate {
  constructor(
    @InjectRepository(Bom) private readonly bomRepository: Repository<Bom>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: RequestUser;
      body?: { type?: string };
      params?: { id?: string };
    }>();

    if (!request.user) {
      return false;
    }

    if (request.body?.type === BomType.PO) {
      assertPurchaseOrderWriteAccess(request.user);
      return true;
    }

    const bomId = request.params?.id;
    if (!bomId) {
      return true;
    }

    // Let the route's ParseUUIDPipe return its normal 400 before querying PostgreSQL.
    if (!isUUID(bomId, 'loose')) {
      return true;
    }

    const bom = await this.bomRepository.findOne({
      where: { id: bomId },
      select: { id: true, bomType: true },
    });
    if (bom?.bomType === BomType.PO) {
      assertPurchaseOrderWriteAccess(request.user);
    }

    return true;
  }
}

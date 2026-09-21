import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { UserRoleCode } from '../user-management/dto/query-users.dto';
import { UpdateBomDto } from './dto/update-bom.dto';
import { UpdateBomLineDto } from './dto/update-bom-line.dto';
import { Bom } from './entities/Bom.entity';
import { BomRevision } from './entities/BomRevision.entity';
import { BomLine } from './entities/BomLine.entity';
import { BomRevisionStatus, BomType } from '../../common/enums/database.enums';

const BOM_CREATOR_ROLES = new Set<string>([
  UserRoleCode.NVKH,
  UserRoleCode.TPKH,
  UserRoleCode.SA,
]);

const BOM_DISCONTINUE_ROLES = new Set<string>([
  UserRoleCode.TPKH,
  UserRoleCode.SA,
]);

const DEADLINE_EDIT_ROLES = new Set<string>([
  UserRoleCode.NVKH,
  UserRoleCode.TPKH,
  UserRoleCode.SA,
]);

const RD_NOTE_EDIT_ROLES = new Set<string>([
  UserRoleCode.RD,
  UserRoleCode.TPKH,
  UserRoleCode.SA,
]);

function forbidden(message: string): never {
  throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message });
}

export function assertCanCreateBom(actorRole?: string | null): void {
  if (!actorRole) {
    forbidden('Bạn không có quyền tạo BOM.');
  }
  const roleUpper = actorRole.trim().toUpperCase();
  if (BOM_CREATOR_ROLES.has(roleUpper)) return;
  forbidden('Bạn không có quyền tạo BOM.');
}

export function assertCanUpdateBomHeader(
  actorRole: string | null | undefined,
  dto: UpdateBomDto,
  bom: Bom,
  currentRev?: BomRevision | null,
): void {
  if (bom.discontinuedAt) {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: 'Không thể chỉnh sửa BOM đã ngừng sử dụng.',
    });
  }

  if (
    currentRev &&
    (currentRev.status === BomRevisionStatus.CLOSED ||
      (currentRev.status as any) === 'closed')
  ) {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message:
        'Không thể chỉnh sửa thông tin BOM khi phiên bản hiện tại đã đóng (closed).',
    });
  }

  if (currentRev && currentRev.status === BomRevisionStatus.WAIT_SA_APPROVE) {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message:
        'Không thể chỉnh sửa thông tin BOM khi phiên bản đang ở bước chờ Giám Đốc duyệt (wait_sa_approve).',
    });
  }

  if (!actorRole) {
    forbidden('Bạn không có quyền cập nhật BOM.');
  }

  const roleUpper = actorRole.trim().toUpperCase();

  if (dto.deadline !== undefined) {
    if (!DEADLINE_EDIT_ROLES.has(roleUpper)) {
      forbidden('Bạn không có quyền cập nhật thời hạn BOM.');
    }
  }

  if (dto.rdNote !== undefined) {
    if (!RD_NOTE_EDIT_ROLES.has(roleUpper)) {
      forbidden('Bạn không có quyền cập nhật ghi chú R&D.');
    }
  }

  if (dto.deadline === undefined && dto.rdNote === undefined) {
    throw new BadRequestException(
      'Vui lòng cung cấp ít nhất một trường hợp lệ để cập nhật.',
    );
  }
}

export function assertCanDiscontinueBom(
  actorRole: string | null | undefined,
  bom: Bom,
): void {
  if (bom.discontinuedAt) {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: 'BOM này đã ở trạng thái ngừng sử dụng.',
    });
  }

  if (!actorRole) {
    forbidden(
      'Chỉ Trưởng phòng Kế hoạch hoặc Quản trị hệ thống mới có quyền ngừng sử dụng BOM.',
    );
  }

  const roleUpper = actorRole.trim().toUpperCase();
  if (BOM_DISCONTINUE_ROLES.has(roleUpper)) return;

  forbidden(
    'Chỉ Trưởng phòng Kế hoạch hoặc Quản trị hệ thống mới có quyền ngừng sử dụng BOM.',
  );
}

const LINE_TECHNICAL_MUTATION_ROLES = new Set<string>([
  UserRoleCode.NVKH,
  UserRoleCode.RD,
  UserRoleCode.TPKH,
]);

const LINE_UNIT_COST_MUTATION_ROLES = new Set<string>([
  UserRoleCode.ACCOUNTING,
]);

function assertBomNotDiscontinuedForLine(bom: Bom): void {
  if (bom.discontinuedAt || (bom as any).status === 'discontinued') {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: 'Không thể chỉnh sửa dòng vật tư của BOM đã ngừng sử dụng.',
    });
  }
}

function assertRevisionNotClosed(rev?: BomRevision | null): void {
  if (
    rev &&
    (rev.status === BomRevisionStatus.CLOSED ||
      (rev.status as any) === 'closed')
  ) {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: 'Không thể chỉnh sửa revision đã đóng.',
    });
  }
}

export function assertCanAddLine(
  actorRole: string | null | undefined,
  bom: Bom,
  currentRev?: BomRevision | null,
): void {
  assertBomNotDiscontinuedForLine(bom);
  assertRevisionNotClosed(currentRev);

  if (!actorRole) {
    forbidden('Bạn không có quyền thêm dòng vật tư.');
  }

  const roleUpper = actorRole.trim().toUpperCase();

  if (currentRev?.status === BomRevisionStatus.WAIT_SA_APPROVE) {
    forbidden(
      'Revision đang ở bước chờ Giám Đốc duyệt (wait_sa_approve) là chỉ đọc, không thể thêm dòng vật tư.',
    );
  }

  if (currentRev?.status === BomRevisionStatus.WAIT_ACCOUNTING) {
    forbidden('Không thể thêm dòng vật tư ở bước Kế toán (wait_accounting).');
  }

  if (currentRev?.status === BomRevisionStatus.WAIT_TPKH_CONFIRM) {
    if (roleUpper !== UserRoleCode.TPKH) {
      forbidden(
        'Chỉ Trưởng phòng Kế hoạch (TPKH) mới có quyền thêm dòng vật tư ở bước N3 (wait_tpkh_confirm).',
      );
    }
    return;
  }

  if (currentRev?.status === BomRevisionStatus.WAIT_RD) {
    if (roleUpper !== UserRoleCode.RD) {
      forbidden(
        'Chỉ Bộ phận Kỹ thuật (RD) mới có quyền thêm dòng vật tư ở bước N2 (wait_rd).',
      );
    }
    return;
  }

  if (currentRev?.status === BomRevisionStatus.WAIT_NVKH) {
    if (roleUpper !== UserRoleCode.NVKH) {
      forbidden(
        'Chỉ Nhân viên Kế hoạch (NVKH) mới có quyền thêm dòng vật tư ở bước N1 (wait_nvkh).',
      );
    }
    return;
  }

  if (LINE_TECHNICAL_MUTATION_ROLES.has(roleUpper)) {
    return;
  }

  forbidden('Vai trò của bạn không có quyền thêm dòng vật tư.');
}

export function assertCanUpdateLine(
  actorRole: string | null | undefined,
  bom: Bom,
  currentRev: BomRevision | null | undefined,
  dto: UpdateBomLineDto,
): void {
  assertBomNotDiscontinuedForLine(bom);
  assertRevisionNotClosed(currentRev);

  if (!actorRole) {
    forbidden('Bạn không có quyền cập nhật dòng vật tư.');
  }

  const roleUpper = actorRole.trim().toUpperCase();

  const isTechnicalUpdate =
    dto.materialId !== undefined ||
    dto.consumption !== undefined ||
    dto.note !== undefined ||
    dto.orderIndex !== undefined;

  const isUnitCostUpdate = dto.unitCost !== undefined;

  if (!isTechnicalUpdate && !isUnitCostUpdate) {
    throw new BadRequestException(
      'Vui lòng cung cấp ít nhất một trường để cập nhật.',
    );
  }

  if (currentRev?.status === BomRevisionStatus.WAIT_SA_APPROVE) {
    forbidden(
      'Revision đang ở bước chờ Giám Đốc duyệt (wait_sa_approve) là chỉ đọc, không thể chỉnh sửa dòng vật tư.',
    );
  }

  if (isUnitCostUpdate) {
    if (currentRev && currentRev.status !== BomRevisionStatus.WAIT_ACCOUNTING) {
      forbidden(
        'Đơn giá vật tư chỉ được phép cập nhật ở bước Kế toán (wait_accounting).',
      );
    }
    if (!LINE_UNIT_COST_MUTATION_ROLES.has(roleUpper)) {
      forbidden(
        'Chỉ Kế toán (ACCOUNTING) mới có quyền cập nhật đơn giá vật tư.',
      );
    }
  }

  if (isTechnicalUpdate) {
    if (currentRev?.status === BomRevisionStatus.WAIT_ACCOUNTING) {
      forbidden(
        'Không thể cập nhật thông số kỹ thuật ở bước Kế toán (wait_accounting).',
      );
    }

    if (currentRev?.status === BomRevisionStatus.WAIT_TPKH_CONFIRM) {
      if (roleUpper !== UserRoleCode.TPKH) {
        forbidden(
          'Chỉ Trưởng phòng Kế hoạch (TPKH) mới có quyền cập nhật thông số kỹ thuật ở bước N3 (wait_tpkh_confirm).',
        );
      }
      return;
    }

    if (currentRev?.status === BomRevisionStatus.WAIT_RD) {
      if (roleUpper !== UserRoleCode.RD) {
        forbidden(
          'Chỉ Bộ phận Kỹ thuật (RD) mới có quyền cập nhật thông số kỹ thuật ở bước N2 (wait_rd).',
        );
      }
      return;
    }

    if (currentRev?.status === BomRevisionStatus.WAIT_NVKH) {
      if (roleUpper !== UserRoleCode.NVKH) {
        forbidden(
          'Chỉ Nhân viên Kế hoạch (NVKH) mới có quyền cập nhật thông số kỹ thuật ở bước N1 (wait_nvkh).',
        );
      }
      return;
    }

    if (!LINE_TECHNICAL_MUTATION_ROLES.has(roleUpper)) {
      forbidden(
        'Vai trò của bạn không có quyền cập nhật thông số kỹ thuật vật tư.',
      );
    }
  }
}

export function assertCanDeleteLine(
  actorRole: string | null | undefined,
  bom: Bom,
  currentRev?: BomRevision | null,
): void {
  assertBomNotDiscontinuedForLine(bom);
  assertRevisionNotClosed(currentRev);

  if (!actorRole) {
    forbidden('Bạn không có quyền xóa dòng vật tư.');
  }

  const roleUpper = actorRole.trim().toUpperCase();

  if (currentRev?.status === BomRevisionStatus.WAIT_SA_APPROVE) {
    forbidden(
      'Revision đang ở bước chờ Giám Đốc duyệt (wait_sa_approve) là chỉ đọc, không thể xóa dòng vật tư.',
    );
  }

  if (currentRev?.status === BomRevisionStatus.WAIT_ACCOUNTING) {
    forbidden('Không thể xóa dòng vật tư ở bước Kế toán (wait_accounting).');
  }

  if (currentRev?.status === BomRevisionStatus.WAIT_TPKH_CONFIRM) {
    if (roleUpper !== UserRoleCode.TPKH) {
      forbidden(
        'Chỉ Trưởng phòng Kế hoạch (TPKH) mới có quyền xóa dòng vật tư ở bước N3 (wait_tpkh_confirm).',
      );
    }
    return;
  }

  if (currentRev?.status === BomRevisionStatus.WAIT_RD) {
    if (roleUpper !== UserRoleCode.RD) {
      forbidden(
        'Chỉ Bộ phận Kỹ thuật (RD) mới có quyền xóa dòng vật tư ở bước N2 (wait_rd).',
      );
    }
    return;
  }

  if (currentRev?.status === BomRevisionStatus.WAIT_NVKH) {
    if (roleUpper !== UserRoleCode.NVKH) {
      forbidden(
        'Chỉ Nhân viên Kế hoạch (NVKH) mới có quyền xóa dòng vật tư ở bước N1 (wait_nvkh).',
      );
    }
    return;
  }

  if (LINE_TECHNICAL_MUTATION_ROLES.has(roleUpper)) {
    return;
  }

  forbidden('Vai trò của bạn không có quyền xóa dòng vật tư.');
}

export function assertCanReorderLines(
  actorRole: string | null | undefined,
  bom: Bom,
  currentRev?: BomRevision | null,
): void {
  assertBomNotDiscontinuedForLine(bom);
  assertRevisionNotClosed(currentRev);

  if (!actorRole) {
    forbidden('Bạn không có quyền sắp xếp lại dòng vật tư.');
  }

  const roleUpper = actorRole.trim().toUpperCase();

  if (currentRev?.status === BomRevisionStatus.WAIT_SA_APPROVE) {
    forbidden(
      'Revision đang ở bước chờ Giám Đốc duyệt (wait_sa_approve) là chỉ đọc, không thể sắp xếp lại dòng vật tư.',
    );
  }

  if (currentRev?.status === BomRevisionStatus.WAIT_ACCOUNTING) {
    forbidden(
      'Không thể sắp xếp lại dòng vật tư ở bước Kế toán (wait_accounting).',
    );
  }

  if (currentRev?.status === BomRevisionStatus.WAIT_TPKH_CONFIRM) {
    if (roleUpper !== UserRoleCode.TPKH) {
      forbidden(
        'Chỉ Trưởng phòng Kế hoạch (TPKH) mới có quyền sắp xếp lại dòng vật tư ở bước N3 (wait_tpkh_confirm).',
      );
    }
    return;
  }

  if (currentRev?.status === BomRevisionStatus.WAIT_RD) {
    if (roleUpper !== UserRoleCode.RD) {
      forbidden(
        'Chỉ Bộ phận Kỹ thuật (RD) mới có quyền sắp xếp lại dòng vật tư ở bước N2 (wait_rd).',
      );
    }
    return;
  }

  if (currentRev?.status === BomRevisionStatus.WAIT_NVKH) {
    if (roleUpper !== UserRoleCode.NVKH) {
      forbidden(
        'Chỉ Nhân viên Kế hoạch (NVKH) mới có quyền sắp xếp lại dòng vật tư ở bước N1 (wait_nvkh).',
      );
    }
    return;
  }

  if (LINE_TECHNICAL_MUTATION_ROLES.has(roleUpper)) {
    return;
  }

  forbidden('Vai trò của bạn không có quyền sắp xếp lại dòng vật tư.');
}

// ────────────────────────────────────────────────────────────────────────────
// WORKFLOW STATE MACHINE POLICIES (PR-04)
// ───────────────────────────────────────────────────────────────────────────

export const FORWARD_TRANSITIONS: Partial<
  Record<
    BomRevisionStatus,
    { nextStatus: BomRevisionStatus; allowedRoles: Set<string> }
  >
> = {
  [BomRevisionStatus.WAIT_NVKH]: {
    nextStatus: BomRevisionStatus.WAIT_RD,
    allowedRoles: new Set([UserRoleCode.NVKH]),
  },
  [BomRevisionStatus.WAIT_RD]: {
    nextStatus: BomRevisionStatus.WAIT_TPKH_CONFIRM,
    allowedRoles: new Set([UserRoleCode.RD]),
  },
  [BomRevisionStatus.WAIT_TPKH_CONFIRM]: {
    nextStatus: BomRevisionStatus.WAIT_ACCOUNTING,
    allowedRoles: new Set([UserRoleCode.TPKH]),
  },
  [BomRevisionStatus.WAIT_ACCOUNTING]: {
    nextStatus: BomRevisionStatus.WAIT_SA_APPROVE,
    allowedRoles: new Set([UserRoleCode.ACCOUNTING]),
  },
};

export const REJECT_TRANSITIONS: Partial<
  Record<
    BomRevisionStatus,
    { allowedTargets: Set<BomRevisionStatus>; allowedRoles: Set<string> }
  >
> = {
  [BomRevisionStatus.WAIT_RD]: {
    allowedTargets: new Set([BomRevisionStatus.WAIT_NVKH]),
    allowedRoles: new Set([UserRoleCode.RD]),
  },
  [BomRevisionStatus.WAIT_TPKH_CONFIRM]: {
    allowedTargets: new Set([
      BomRevisionStatus.WAIT_RD,
      BomRevisionStatus.WAIT_NVKH,
    ]),
    allowedRoles: new Set([UserRoleCode.TPKH]),
  },
  [BomRevisionStatus.WAIT_ACCOUNTING]: {
    allowedTargets: new Set([BomRevisionStatus.WAIT_TPKH_CONFIRM]),
    allowedRoles: new Set([UserRoleCode.ACCOUNTING]),
  },
  [BomRevisionStatus.WAIT_SA_APPROVE]: {
    allowedTargets: new Set([
      BomRevisionStatus.WAIT_ACCOUNTING,
      BomRevisionStatus.WAIT_TPKH_CONFIRM,
      BomRevisionStatus.WAIT_RD,
      BomRevisionStatus.WAIT_NVKH,
    ]),
    allowedRoles: new Set([UserRoleCode.SA]),
  },
};

export function assertCanForwardBom(
  bom: Bom,
  currentRev: BomRevision,
  actorRole?: string | null,
): BomRevisionStatus {
  if (bom.discontinuedAt || (bom as any).status === 'discontinued') {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: 'Không thể chuyển trạng thái BOM đã ngừng sử dụng.',
    });
  }

  if (
    currentRev.status === BomRevisionStatus.CLOSED ||
    (currentRev.status as any) === 'closed'
  ) {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: 'Revision đã đóng (closed), không thể tiếp tục chuyển bước.',
    });
  }

  if (currentRev.status === BomRevisionStatus.WAIT_SA_APPROVE) {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message:
        'Bước wait_sa_approve không thể forward. Vui lòng sử dụng API approve để phê duyệt và đóng BOM.',
    });
  }

  const transitionRule = FORWARD_TRANSITIONS[currentRev.status];
  if (!transitionRule) {
    throw new BadRequestException(
      `Không thể forward từ trạng thái hiện tại: ${currentRev.status}`,
    );
  }

  if (!actorRole) {
    forbidden(
      `Vai trò của bạn không có quyền forward BOM tại trạng thái: ${currentRev.status}`,
    );
  }

  const roleUpper = actorRole.trim().toUpperCase();
  if (!transitionRule.allowedRoles.has(roleUpper)) {
    forbidden(
      `Vai trò của bạn không có quyền forward BOM tại trạng thái: ${currentRev.status}`,
    );
  }

  return transitionRule.nextStatus;
}

export function assertRevisionDataReadyForForward(
  currentStatus: BomRevisionStatus,
  lines: BomLine[],
): void {
  if (!lines || lines.length === 0) {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message:
        'BOM revision phải có ít nhất một dòng vật tư trước khi chuyển nấc.',
    });
  }

  for (const line of lines) {
    if (!line.materialNameSnapshot || !line.materialNameSnapshot.trim()) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: `Dòng vật tư thứ ${line.orderIndex + 1} thiếu tên vật tư snapshot.`,
      });
    }
    if (!line.materialGroupSnapshot || !line.materialGroupSnapshot.trim()) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: `Dòng vật tư "${line.materialNameSnapshot}" thiếu nhóm vật tư snapshot. Vui lòng gán nhóm vật tư cho vật tư này trước khi chuyển nấc.`,
      });
    }
    if (!line.unitSnapshot || !line.unitSnapshot.trim()) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: `Dòng vật tư "${line.materialNameSnapshot}" thiếu đơn vị tính snapshot.`,
      });
    }
  }

  if (
    currentStatus === BomRevisionStatus.WAIT_RD ||
    currentStatus === BomRevisionStatus.WAIT_TPKH_CONFIRM ||
    currentStatus === BomRevisionStatus.WAIT_ACCOUNTING
  ) {
    for (const line of lines) {
      if (
        line.consumption === null ||
        line.consumption === undefined ||
        Number(line.consumption) <= 0
      ) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: `Dòng vật tư "${line.materialNameSnapshot}" chưa có định mức tiêu hao hợp lệ (consumption phải > 0).`,
        });
      }
    }
  }

  if (currentStatus === BomRevisionStatus.WAIT_ACCOUNTING) {
    for (const line of lines) {
      if (
        line.unitCost === null ||
        line.unitCost === undefined ||
        Number(line.unitCost) < 0
      ) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: `Dòng vật tư "${line.materialNameSnapshot}" chưa có đơn giá hợp lệ (unit_cost phải khác null và >= 0).`,
        });
      }
    }
  }
}

export function assertRevisionDataReadyForApprove(lines: BomLine[]): void {
  if (!lines || lines.length === 0) {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message:
        'BOM revision phải có ít nhất một dòng vật tư trước khi phê duyệt.',
    });
  }

  for (const line of lines) {
    if (!line.materialNameSnapshot || !line.materialNameSnapshot.trim()) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: `Dòng vật tư thứ ${line.orderIndex + 1} thiếu tên vật tư snapshot.`,
      });
    }
    if (!line.materialGroupSnapshot || !line.materialGroupSnapshot.trim()) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: `Dòng vật tư "${line.materialNameSnapshot}" thiếu nhóm vật tư snapshot. Vui lòng gán nhóm vật tư cho vật tư này trước khi phê duyệt.`,
      });
    }
    if (!line.unitSnapshot || !line.unitSnapshot.trim()) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: `Dòng vật tư "${line.materialNameSnapshot}" thiếu đơn vị tính snapshot.`,
      });
    }
    if (
      line.consumption === null ||
      line.consumption === undefined ||
      Number(line.consumption) <= 0
    ) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: `Dòng vật tư "${line.materialNameSnapshot}" chưa có định mức tiêu hao hợp lệ (consumption phải > 0).`,
      });
    }
    if (
      line.unitCost === null ||
      line.unitCost === undefined ||
      Number(line.unitCost) < 0
    ) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: `Dòng vật tư "${line.materialNameSnapshot}" chưa có đơn giá hợp lệ (unit_cost phải khác null và >= 0).`,
      });
    }
  }
}

export function assertCanRejectBom(
  bom: Bom,
  currentRev: BomRevision,
  actorRole: string | null | undefined,
  targetStatus: BomRevisionStatus,
  reason: string,
): void {
  if (bom.discontinuedAt || (bom as any).status === 'discontinued') {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: 'Không thể từ chối / trả lại BOM đã ngừng sử dụng.',
    });
  }

  if (
    currentRev.status === BomRevisionStatus.CLOSED ||
    (currentRev.status as any) === 'closed'
  ) {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: 'Revision đã đóng (closed), không thể từ chối / trả lại.',
    });
  }

  const cleanReason = reason ? reason.trim() : '';
  if (!cleanReason) {
    throw new BadRequestException(
      'Lý do từ chối không được để trống hoặc chỉ chứa khoảng trắng.',
    );
  }

  if (targetStatus === currentRev.status) {
    throw new BadRequestException(
      'Không thể từ chối / trả lại về chính trạng thái hiện tại.',
    );
  }

  const rejectRule = REJECT_TRANSITIONS[currentRev.status];
  if (!rejectRule) {
    throw new BadRequestException(
      `Không thể từ chối / trả lại từ trạng thái ban đầu: ${currentRev.status}`,
    );
  }

  if (!actorRole) {
    forbidden(
      `Vai trò của bạn không có quyền trả lại BOM tại trạng thái: ${currentRev.status}`,
    );
  }

  const roleUpper = actorRole.trim().toUpperCase();
  if (!rejectRule.allowedRoles.has(roleUpper)) {
    forbidden(
      `Vai trò của bạn không có quyền trả lại BOM tại trạng thái: ${currentRev.status}`,
    );
  }

  if (!rejectRule.allowedTargets.has(targetStatus)) {
    throw new BadRequestException(
      `Không thể trả lại từ ${currentRev.status} về ${targetStatus}. Các trạng thái được phép: ${Array.from(
        rejectRule.allowedTargets,
      ).join(', ')}`,
    );
  }
}

export function assertCanApproveBom(
  bom: Bom,
  currentRev: BomRevision,
  actorRole?: string | null,
): void {
  if (bom.discontinuedAt || (bom as any).status === 'discontinued') {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: 'Không thể phê duyệt BOM đã ngừng sử dụng.',
    });
  }

  if (
    currentRev.status === BomRevisionStatus.CLOSED ||
    (currentRev.status as any) === 'closed'
  ) {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: 'Revision đã đóng (closed), không thể phê duyệt lại.',
    });
  }

  if (currentRev.status !== BomRevisionStatus.WAIT_SA_APPROVE) {
    throw new BadRequestException(
      `Chỉ có thể phê duyệt đóng BOM khi đang ở trạng thái wait_sa_approve. Trạng thái hiện tại: ${currentRev.status}`,
    );
  }

  if (!actorRole) {
    forbidden('Chỉ Quản trị hệ thống (SA) mới có quyền phê duyệt đóng BOM.');
  }

  const roleUpper = actorRole.trim().toUpperCase();
  if (roleUpper !== UserRoleCode.SA) {
    forbidden('Chỉ Quản trị hệ thống (SA) mới có quyền phê duyệt đóng BOM.');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// REVISION CREATION POLICIES (PR-05)
// ────────────────────────────────────────────────────────────────────────────

export const REVISION_CREATOR_ROLES = new Set<string>([
  UserRoleCode.NVKH,
  UserRoleCode.TPKH,
  UserRoleCode.SA,
]);

export function assertCanCreateRevision(
  actorRole: string | null | undefined,
  bom: Bom,
  currentRev?: BomRevision | null,
): void {
  if (bom.discontinuedAt || (bom as any).status === 'discontinued') {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: 'Không thể tạo revision cho BOM đã ngừng sử dụng.',
    });
  }

  if (!currentRev) {
    throw new BadRequestException('BOM chưa có revision hiện tại.');
  }

  if (
    currentRev.status !== BomRevisionStatus.CLOSED &&
    (currentRev.status as any) !== 'closed'
  ) {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: `Chỉ có thể tạo revision mới khi revision hiện tại đã đóng (closed). Trạng thái hiện tại: ${currentRev.status}`,
    });
  }

  if (!actorRole) {
    forbidden('Bạn không có quyền tạo revision mới cho BOM.');
  }

  const roleUpper = actorRole.trim().toUpperCase();
  if (!REVISION_CREATOR_ROLES.has(roleUpper)) {
    forbidden(
      'Chỉ Nhân viên Kế hoạch (NVKH), Trưởng phòng Kế hoạch (TPKH) hoặc Quản trị hệ thống (SA) mới có quyền tạo revision mới.',
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// COPY FIT BOM TO PO BOM POLICIES (PR-06)
// ────────────────────────────────────────────────────────────────────────────

export const COPY_FIT_TO_PO_ROLES = new Set<string>([
  UserRoleCode.NVKH,
  UserRoleCode.TPKH,
  UserRoleCode.SA,
]);

export function assertCanCopyFitToPo(
  targetBom: Bom,
  targetRev: BomRevision | null | undefined,
  sourceBom: Bom,
  sourceRev: BomRevision,
  actorRole?: string | null,
): void {
  if (
    targetBom.discontinuedAt ||
    (targetBom as any).status === 'discontinued'
  ) {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: 'Không thể sao chép dữ liệu vào BOM đã ngừng sử dụng.',
    });
  }

  if (targetBom.bomType !== BomType.PO) {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message:
        'Chỉ có thể sao chép Fit BOM vào PO BOM (target BOM phải có loại là po).',
    });
  }

  if (!targetRev) {
    throw new BadRequestException('Target PO BOM chưa có revision hiện tại.');
  }

  if (
    targetRev.status !== BomRevisionStatus.WAIT_NVKH &&
    (targetRev.status as any) !== 'wait_nvkh'
  ) {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: `Chỉ có thể sao chép khi revision hiện tại của PO BOM đang ở trạng thái wait_nvkh. Trạng thái hiện tại: ${targetRev.status}`,
    });
  }

  if (sourceBom.bomType !== BomType.FIT) {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: 'BOM nguồn phải là Fit BOM (source BOM type phải là fit).',
    });
  }

  if (sourceRev.bomId !== sourceBom.id) {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: 'Source revision không thuộc Fit BOM nguồn.',
    });
  }

  if (
    sourceRev.status !== BomRevisionStatus.CLOSED &&
    (sourceRev.status as any) !== 'closed'
  ) {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: `Chỉ có thể sao chép từ Fit BOM revision đã đóng (closed). Trạng thái hiện tại: ${sourceRev.status}`,
    });
  }

  if (!actorRole) {
    forbidden('Bạn không có quyền sao chép Fit BOM sang PO BOM.');
  }

  const roleUpper = actorRole.trim().toUpperCase();
  if (!COPY_FIT_TO_PO_ROLES.has(roleUpper)) {
    forbidden(
      'Chỉ Nhân viên Kế hoạch (NVKH), Trưởng phòng Kế hoạch (TPKH) hoặc Quản trị hệ thống (SA) mới có quyền sao chép Fit BOM sang PO BOM.',
    );
  }
}

import { COST_VISIBLE_ROLES } from '../boms/bom-cost-visibility';

export type EntityAuditConfig = {
  fieldLabels: Record<string, string>;
  /** Field names whose old/new values are masked unless the requester holds `sensitiveFieldsPermission` or one of `sensitiveFieldsRoles`. */
  sensitiveFields?: string[];
  sensitiveFieldsPermission?: string;
  sensitiveFieldsRoles?: readonly string[];
  /** Nhãn tiếng Việt cho giá trị enum/mã nội bộ của 1 field (VD status,
   * purpose) — không có thì oldValue/newValue hiện thẳng mã gốc (tiếng Anh)
   * ra UI lịch sử, rất khó hiểu với người dùng không kỹ thuật. */
  fieldValueLabels?: Record<string, Record<string, string>>;
  /** Field không hiện trong lịch sử — kể cả các bản ghi cũ đã lỡ lưu nó. */
  hiddenFields?: string[];
};

const PO_DOCUMENT_PURPOSE_LABELS: Record<string, string> = {
  po_original: 'PO Tổng',
  production_doc: 'PO Chi tiết',
  tech_pack: 'Techpack',
  sample_image: 'Ảnh mẫu',
  color_card: 'Bảng màu',
  material_pdf: 'Tài liệu NPL (PDF)',
  translation: 'Bản dịch',
  other: 'Khác',
};

const PO_PRODUCTION_DOC_FIELD_LABELS: Record<string, string> = {
  name: 'Tên tài liệu',
  description: 'Mô tả',
  status: 'Trạng thái',
  section1Description: 'Mô tả hình dáng',
  section1ImageUrl: 'Ảnh mô tả hình dáng',
  section2Accessories: 'Phụ liệu',
  section3Notes: 'Ghi chú',
  section4CustomerFeedback: 'Phản hồi khách hàng',
  sizeData: 'Bảng thông số kích thước',
  sections: 'Mục bổ sung',
  sizeRows: 'Bảng thông số (dòng)',
};

export const ENTITY_AUDIT_CONFIG: Record<string, EntityAuditConfig> = {
  PurchaseOrder: {
    fieldLabels: {
      poCode: 'Mã PO',
      customerPoCode: 'Mã PO khách hàng',
      customerNameSnapshot: 'Khách hàng',
      receivedDate: 'Ngày nhận PO',
      deadline: 'Hạn hoàn thành',
      note: 'Ghi chú',
      status: 'Trạng thái',
      cancellationReason: 'Lý do huỷ',
    },
    fieldValueLabels: {
      status: {
        draft: 'Nháp',
        pending_rd: 'Chờ R&D',
        in_progress: 'Đang xử lý',
        closed: 'Khóa',
        cancelled: 'Đã hủy',
      },
    },
  },
  PurchaseOrderDocument: {
    fieldLabels: { fileName: 'Tên tệp', purpose: 'Phân loại' },
    fieldValueLabels: { purpose: PO_DOCUMENT_PURPOSE_LABELS },
  },
  PurchaseOrderProduct: {
    fieldLabels: {
      productCode: 'Mã sản phẩm',
      productName: 'Tên sản phẩm',
      category: 'Dòng sản phẩm',
      materialNote: 'Ghi chú chất liệu',
      deadline: 'Hạn giao',
      as3bCmBaseDays: 'Số ngày CM cơ sở',
      structureImageVersionId: 'Ảnh sản phẩm',
      status: 'Trạng thái',
      sizes: 'Size & số lượng',
      colorName: 'Tên màu',
    },
    fieldValueLabels: {
      // Sản phẩm PO chỉ còn 2 trạng thái thực tế: Đang xử lý / Khoá.
      status: {
        draft: 'Đang xử lý',
        in_review: 'Đang xử lý',
        sampling: 'Đang xử lý',
        closed: 'Khoá',
        cancelled: 'Đã hủy',
      },
    },
  },
  PurchaseOrderProductOperationStep: {
    fieldLabels: {
      stepName: 'Tên công đoạn',
      description: 'Mô tả',
      timePerPiece: 'Thời gian/SP (giây)',
      ssv: '% công đoạn (SSV)',
      targetTotal: 'SP/1H',
      note: 'Ghi chú',
      orderIndex: 'Thứ tự',
      isGroup: 'Là nhóm công đoạn',
      parentStepId: 'Công đoạn cha',
      as3bCmBaseDays: 'Số ngày CM cơ sở',
    },
  },
  PurchaseOrderProductSampleRound: {
    fieldLabels: {
      sampleDate: 'Ngày may mẫu',
      feedback: 'Phản hồi',
      status: 'Trạng thái',
      images: 'Ảnh đính kèm',
    },
    fieldValueLabels: {
      status: {
        working: 'Đang may',
        needs_revision: 'Cần chỉnh sửa',
        approved: 'Đã duyệt',
      },
    },
  },
  PurchaseOrderProductionDocument: {
    fieldLabels: PO_PRODUCTION_DOC_FIELD_LABELS,
    fieldValueLabels: {
      status: {
        draft: 'Nháp',
        in_progress: 'Đang thực hiện',
        completed: 'Hoàn thành',
      },
    },
  },
  PurchaseOrderProductDocument: {
    fieldLabels: {
      fileName: 'Tên tệp',
      purpose: 'Phân loại',
      version: 'Phiên bản',
    },
    fieldValueLabels: { purpose: PO_DOCUMENT_PURPOSE_LABELS },
  },
  Style: {
    fieldLabels: {
      styleCode: 'Mã mẫu',
      styleName: 'Tên mẫu',
      description: 'Mô tả đặc điểm',
      category: 'Dòng sản phẩm',
      baseImageKey: 'Ảnh mẫu',
      status: 'Trạng thái',
    },
    fieldValueLabels: {
      status: {
        draft: 'Nháp',
        active: 'Hoạt động',
      },
    },
  },
  StyleOperationStep: {
    // Liên kết danh mục công đoạn luôn trùng "Tên công đoạn" (tên được chép từ
    // danh mục khi chọn) — chỉ gây nhiễu nên ẩn khỏi lịch sử.
    hiddenFields: ['stageId'],
    fieldLabels: {
      stepName: 'Tên công đoạn',
      description: 'Mô tả',
      timePerPiece: 'Thời gian/SP (giây)',
      ssv: '% công đoạn (SSV)',
      targetTotal: 'SP/1H',
      note: 'Ghi chú',
      orderIndex: 'Thứ tự',
      isGroup: 'Là nhóm công đoạn',
      groupId: 'Nhóm công đoạn',
      groupItems: 'Danh sách công đoạn con',
      parentStepId: 'Công đoạn cha',
    },
  },
  StyleDocument: {
    fieldLabels: {
      fileName: 'Tên tệp',
      purpose: 'Mục đích',
    },
    fieldValueLabels: {
      purpose: {
        po_original: 'Bản gốc đơn hàng (PO)',
        tech_pack: 'Tech pack',
        material_pdf: 'Tài liệu NPL (PDF)',
        sample_image: 'Ảnh mẫu',
        translation: 'Bản dịch',
        color_card: 'Bảng màu',
        production_doc: 'Tài liệu sản xuất',
        avatar: 'Ảnh đại diện',
        fit_attachment: 'Tệp đính kèm Mẫu Fit',
        production_doc_image: 'Ảnh tài liệu sản xuất',
        other: 'Khác',
      },
    },
  },
  StyleSampleRound: {
    fieldLabels: {
      sampleDate: 'Ngày may mẫu',
      feedback: 'Phản hồi',
      status: 'Trạng thái',
      images: 'Ảnh đính kèm',
    },
    fieldValueLabels: {
      status: {
        working: 'Đang may',
        needs_revision: 'Cần chỉnh sửa',
        approved: 'Đã duyệt',
      },
    },
  },
  ProductionDocument: {
    fieldLabels: {
      name: 'Tên tài liệu',
      description: 'Mô tả',
      status: 'Trạng thái',
      section1Description: 'Mô tả hình dáng',
      section1ImageUrl: 'Ảnh mô tả hình dáng',
      section2Accessories: 'Phụ liệu',
      section3Notes: 'Ghi chú',
      section4CustomerFeedback: 'Phản hồi khách hàng',
      sizeData: 'Bảng thông số kích thước',
    },
    fieldValueLabels: {
      status: {
        draft: 'Nháp',
        in_progress: 'Đang thực hiện',
        completed: 'Hoàn thành',
      },
    },
  },
  Bom: {
    fieldLabels: {
      deadline: 'Hạn hoàn thành',
      rdNote: 'Ghi chú R&D',
      discontinuedReason: 'Lý do ngừng sử dụng',
      currentRevisionNo: 'Phiên bản hiện hành',
      revisionNo: 'Phiên bản',
      sourceRevisionNo: 'Tạo từ phiên bản',
      changeReason: 'Lý do tạo phiên bản',
    },
  },
  // Mọi sự kiện của 1 revision (dòng + chuyển bước) dùng chung aggregate này
  // để drawer lịch sử gộp được vào 1 timeline.
  BomRevision: {
    sensitiveFields: ['unitCost'],
    sensitiveFieldsRoles: [...COST_VISIBLE_ROLES],
    fieldLabels: {
      status: 'Trạng thái',
      materialName: 'Vật tư',
      consumption: 'Định mức',
      unitCost: 'Đơn giá',
      note: 'Ghi chú',
      orderIndex: 'Thứ tự',
    },
    fieldValueLabels: {
      status: {
        wait_nvkh: 'Chờ NVKH',
        wait_rd: 'Chờ R&D',
        wait_tpkh_confirm: 'Chờ TPKH xác nhận',
        wait_accounting: 'Chờ Kế toán',
        wait_sa_approve: 'Chờ SA duyệt',
        closed: 'Đã duyệt',
      },
    },
  },
};

/**
 * Một lần lưu hàng loạt (VD bảng công đoạn: nhiều dòng tạo/sửa cùng lúc) gộp
 * chung vào 1 audit event thay vì 1 event/dòng — nhưng vẫn cần phân biệt
 * dòng nào đổi field gì. Không có cột riêng để lưu "dòng nào" trong
 * audit_event_changes, nên field-name của những entry dạng này được mã hoá
 * thành `"<nhãn dòng>::<tên field thật>"` (VD "Cắt vải::stepName") khi ghi.
 * Exported để audit.service.ts tách `groupLabel` ra khỏi `fieldLabel` khi trả
 * về cho FE, thay vì gộp chung thành 1 chuỗi hiển thị.
 */
export function splitBulkFieldName(
  fieldName: string,
): { rowLabel: string; realFieldName: string } | null {
  // Row labels may contain "::" (including legacy material names). The field
  // suffix is always the final segment, so split from the right.
  const sepIndex = fieldName.lastIndexOf('::');
  if (sepIndex === -1) return null;
  return {
    rowLabel: fieldName.slice(0, sepIndex),
    realFieldName: fieldName.slice(sepIndex + 2),
  };
}

export function getFieldLabel(
  aggregateType: string,
  fieldName: string,
): string {
  return (
    ENTITY_AUDIT_CONFIG[aggregateType]?.fieldLabels[fieldName] ?? fieldName
  );
}

/** Dịch giá trị enum/mã nội bộ sang tiếng Việt cho UI lịch sử. Giá trị không
 * có trong bảng ánh xạ (VD tên tệp, ngày tháng, số...) giữ nguyên. */
export function getFieldValueLabel(
  aggregateType: string,
  fieldName: string,
  value: string | null,
): string | null {
  if (value === null) return null;
  return (
    ENTITY_AUDIT_CONFIG[aggregateType]?.fieldValueLabels?.[fieldName]?.[
      value
    ] ?? value
  );
}

const STYLE_VIEW_PERMISSION = 'master_data.styles.view';

/** Quyền cần có để xem lịch sử từng loại dữ liệu — phải khớp quyền xem chính
 * dữ liệu đó, không thì ai đăng nhập cũng đọc được lịch sử (kể cả tài khoản
 * người dùng) chỉ bằng cách đoán aggregateType + id. Loại không có ở đây bị
 * từ chối. `null` = mọi tài khoản đã đăng nhập, dùng cho PO vì chính các
 * endpoint đọc PO cũng chỉ yêu cầu đăng nhập. */
const HISTORY_VIEW_PERMISSIONS: Record<string, string | null> = {
  Style: STYLE_VIEW_PERMISSION,
  StyleOperationStep: STYLE_VIEW_PERMISSION,
  StyleDocument: STYLE_VIEW_PERMISSION,
  StyleSampleRound: STYLE_VIEW_PERMISSION,
  ProductionDocument: STYLE_VIEW_PERMISSION,
  PurchaseOrder: null,
  PurchaseOrderDocument: null,
  PurchaseOrderProduct: null,
  PurchaseOrderProductOperationStep: null,
  PurchaseOrderProductSampleRound: null,
  PurchaseOrderProductionDocument: null,
  PurchaseOrderProductDocument: null,
  Bom: null,
  BomRevision: null,
  BomTimeline: null,
  User: 'system.users.manage',
};

export function isHistoryViewSupported(aggregateType: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    HISTORY_VIEW_PERMISSIONS,
    aggregateType,
  );
}

/** Chỉ gọi sau isHistoryViewSupported(). */
export function getHistoryViewPermission(aggregateType: string): string | null {
  return isHistoryViewSupported(aggregateType)
    ? HISTORY_VIEW_PERMISSIONS[aggregateType]
    : null;
}

export function isHiddenField(
  aggregateType: string,
  fieldName: string,
): boolean {
  return (
    ENTITY_AUDIT_CONFIG[aggregateType]?.hiddenFields?.includes(fieldName) ??
    false
  );
}

export function isSensitiveField(
  aggregateType: string,
  fieldName: string,
): boolean {
  return (
    ENTITY_AUDIT_CONFIG[aggregateType]?.sensitiveFields?.includes(fieldName) ??
    false
  );
}

export function canViewSensitiveFields(
  aggregateType: string,
  requesterPermissions: string[],
  requesterRole?: string | null,
): boolean {
  const config = ENTITY_AUDIT_CONFIG[aggregateType];
  if (config?.sensitiveFieldsRoles) {
    return (
      !!requesterRole &&
      config.sensitiveFieldsRoles.includes(requesterRole.trim().toUpperCase())
    );
  }
  const permission = config?.sensitiveFieldsPermission;
  if (!permission) return true;
  return requesterPermissions.includes(permission);
}

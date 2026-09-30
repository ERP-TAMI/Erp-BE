export type EntityAuditConfig = {
  fieldLabels: Record<string, string>;
  /** Field names whose old/new values are masked unless the requester holds `sensitiveFieldsPermission`. */
  sensitiveFields?: string[];
  sensitiveFieldsPermission?: string;
  /** Nhãn tiếng Việt cho giá trị enum/mã nội bộ của 1 field (VD status,
   * purpose) — không có thì oldValue/newValue hiện thẳng mã gốc (tiếng Anh)
   * ra UI lịch sử, rất khó hiểu với người dùng không kỹ thuật. */
  fieldValueLabels?: Record<string, Record<string, string>>;
};

export const ENTITY_AUDIT_CONFIG: Record<string, EntityAuditConfig> = {
  StyleOperationStep: {
    fieldLabels: {
      stepName: 'Tên công đoạn',
      description: 'Mô tả',
      stageId: 'Công đoạn (Stage)',
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
};

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
): boolean {
  const permission =
    ENTITY_AUDIT_CONFIG[aggregateType]?.sensitiveFieldsPermission;
  if (!permission) return true;
  return requesterPermissions.includes(permission);
}

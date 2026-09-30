export type EntityAuditConfig = {
  fieldLabels: Record<string, string>;
  /** Field names whose old/new values are masked unless the requester holds `sensitiveFieldsPermission`. */
  sensitiveFields?: string[];
  sensitiveFieldsPermission?: string;
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
  },
  StyleSampleRound: {
    fieldLabels: {
      sampleDate: 'Ngày may mẫu',
      feedback: 'Phản hồi',
      status: 'Trạng thái',
      images: 'Ảnh đính kèm',
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

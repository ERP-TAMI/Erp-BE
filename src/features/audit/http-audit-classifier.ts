/**
 * Biến 1 request HTTP thô (method + path) thành thông tin người đọc hiểu
 * được: hành động gì, trên loại đối tượng nào, id nào. Trước đây trang nhật ký
 * chỉ có "POST /auth/login" nên đăng nhập bị hiện thành "Tạo mới" — sai và
 * khó hiểu với người không làm kỹ thuật.
 */

export type HttpAuditAction =
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'create'
  | 'update'
  | 'delete'
  | 'upload'
  | 'status_change'
  | 'approve'
  | 'reject'
  | 'copy'
  | 'sync'
  | 'forward'
  | 'discontinue'
  | 'reorder'
  | 'password_change'
  | 'password_reset_request'
  | 'password_reset'
  | 'password_setup'
  | 'send_account_email';

export const ACTION_LABELS: Record<HttpAuditAction, string> = {
  login: 'Đăng nhập',
  login_failed: 'Đăng nhập thất bại',
  logout: 'Đăng xuất',
  create: 'Tạo mới',
  update: 'Cập nhật',
  delete: 'Xoá',
  upload: 'Tải tệp lên',
  status_change: 'Đổi trạng thái',
  approve: 'Phê duyệt',
  reject: 'Từ chối',
  copy: 'Sao chép',
  sync: 'Đồng bộ',
  forward: 'Chuyển tiếp',
  discontinue: 'Ngừng',
  reorder: 'Sắp xếp lại',
  password_change: 'Đổi mật khẩu',
  password_reset_request: 'Yêu cầu đặt lại mật khẩu',
  password_reset: 'Đặt lại mật khẩu',
  password_setup: 'Thiết lập mật khẩu',
  send_account_email: 'Gửi email tài khoản',
};

/** Hành động trên chính tài khoản người dùng (không có đối tượng trong path). */
export const ACCOUNT_ACTIONS: ReadonlySet<HttpAuditAction> = new Set([
  'login',
  'login_failed',
  'logout',
  'password_change',
  'password_reset_request',
  'password_reset',
  'password_setup',
]);

/** Segment URL → tên loại đối tượng. Chỉ segment có trong bảng này mới được
 * coi là "đối tượng"; các segment còn lại (api, v1, masters...) bỏ qua. */
export const RESOURCE_LABELS: Record<string, string> = {
  styles: 'Mẫu Fit',
  'operation-steps': 'Quy trình công đoạn',
  documents: 'Tài liệu',
  versions: 'Phiên bản tài liệu',
  attachments: 'Tệp đính kèm',
  'sample-rounds': 'Lần may mẫu',
  images: 'Ảnh mẫu',
  'production-docs': 'Tài liệu sản xuất',
  'production-doc': 'Tài liệu sản xuất',
  'purchase-orders': 'Đơn hàng (PO)',
  products: 'Sản phẩm',
  boms: 'Định mức (NPL)',
  'draft-boms': 'NPL nháp',
  lines: 'Dòng định mức',
  revisions: 'Phiên bản NPL',
  materials: 'Nguyên phụ liệu',
  'material-groups': 'Nhóm NPL',
  stages: 'Công đoạn',
  'stage-groups': 'Nhóm công đoạn',
  units: 'Đơn vị tính',
  'size-charts': 'Bảng size',
  workshops: 'Xưởng',
  users: 'Người dùng',
  uploads: 'Tệp tải lên',
  notifications: 'Thông báo',
};

/** Segment cuối là động từ → hành động cụ thể thay vì suy từ method. */
const KEYWORD_ACTIONS: Record<string, HttpAuditAction> = {
  confirm: 'upload',
  status: 'status_change',
  'account-status': 'status_change',
  approve: 'approve',
  reject: 'reject',
  copy: 'copy',
  'copy-from-fit': 'copy',
  resync: 'sync',
  forward: 'forward',
  discontinue: 'discontinue',
  reorder: 'reorder',
  'password-reset': 'send_account_email',
  'password-setup-email': 'send_account_email',
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function segmentsOf(path: string): string[] {
  return path.split('?')[0].split('/').filter(Boolean);
}

/**
 * Request không đáng ghi: refresh token (chạy ngầm liên tục), presign (chỉ
 * xin link upload — bước confirm sau đó mới là thao tác thật), validate
 * (chỉ kiểm tra token trước khi hiện form).
 */
export function shouldSkipHttpAudit(method: string, path: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }
  const segments = segmentsOf(path);
  const last = segments[segments.length - 1];
  return last === 'refresh' || last === 'presign' || last === 'validate';
}

export type ResourceRef = { type: string; id: string | null };

export type ClassifiedHttpRequest = {
  action: HttpAuditAction;
  /** Đối tượng bị tác động (segment tài nguyên sâu nhất trong path). */
  resource: ResourceRef | null;
  /** Các đối tượng cha có id, từ ngoài vào trong (VD Mẫu Fit chứa công đoạn). */
  ancestors: ResourceRef[];
};

function classifyAuth(
  segments: string[],
  statusCode: number | null,
): HttpAuditAction | null {
  if (segments[0] !== 'auth') return null;
  const rest = segments.slice(1).join('/');
  if (rest === 'login') {
    return statusCode !== null && statusCode >= 400 ? 'login_failed' : 'login';
  }
  if (rest === 'logout') return 'logout';
  if (rest === 'forgot-password') return 'password_reset_request';
  if (rest === 'password-reset/complete') return 'password_reset';
  if (rest === 'password-setup/complete') return 'password_setup';
  return null;
}

export function classifyHttpRequest(
  method: string,
  path: string,
  statusCode: number | null,
): ClassifiedHttpRequest {
  const segments = segmentsOf(path);

  const authAction = classifyAuth(segments, statusCode);
  if (authAction) return { action: authAction, resource: null, ancestors: [] };

  const refs: ResourceRef[] = [];
  let keywordAction: HttpAuditAction | null = null;
  let isSelf = false;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (Object.prototype.hasOwnProperty.call(RESOURCE_LABELS, segment)) {
      const next = segments[i + 1];
      const id = next && UUID_RE.test(next) ? next : null;
      refs.push({ type: segment, id });
      if (id) i++;
      continue;
    }
    if (segment === 'me') isSelf = true;
    if (Object.prototype.hasOwnProperty.call(KEYWORD_ACTIONS, segment)) {
      keywordAction = KEYWORD_ACTIONS[segment];
    }
  }

  if (isSelf && segments[segments.length - 1] === 'password') {
    return { action: 'password_change', resource: null, ancestors: [] };
  }

  const action: HttpAuditAction =
    keywordAction ??
    (method === 'POST' ? 'create' : method === 'DELETE' ? 'delete' : 'update');

  const resource = refs.length > 0 ? refs[refs.length - 1] : null;
  const ancestors = refs.slice(0, -1).filter((ref) => ref.id !== null);
  return { action, resource, ancestors };
}

/** Field thường mang tên đối tượng trong body khi tạo/sửa — dùng làm tên khi
 * path chưa có id (tạo mới) hoặc đối tượng đã bị xoá khỏi DB. */
const BODY_NAME_FIELDS = [
  'styleName',
  'stepName',
  'materialName',
  'stageName',
  'groupName',
  'productName',
  'fileName',
  'poCode',
  'fullName',
  'name',
  'title',
];

export function extractNameFromBody(
  body: Record<string, unknown> | null,
): string | null {
  if (!body) return null;
  for (const field of BODY_NAME_FIELDS) {
    const value = body[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** Bảng tra tên hiển thị theo loại đối tượng. Chỉ dùng identifier cố định
 * trong map này để ghép SQL — id luôn truyền qua tham số. */
export const RESOURCE_NAME_LOOKUPS: Record<
  string,
  { table: string; column: string }
> = {
  styles: { table: 'styles', column: 'style_name' },
  'purchase-orders': { table: 'purchase_orders', column: 'po_code' },
  products: { table: 'purchase_order_products', column: 'product_name' },
  users: { table: 'users', column: 'full_name' },
  materials: { table: 'materials', column: 'material_name' },
  'material-groups': { table: 'material_groups', column: 'name' },
  stages: { table: 'stages', column: 'stage_name' },
  'stage-groups': { table: 'stage_groups', column: 'group_name' },
  units: { table: 'units', column: 'name' },
  'size-charts': { table: 'size_charts', column: 'name' },
  workshops: { table: 'workshops', column: 'name' },
};

import {
  classifyHttpRequest,
  extractNameFromBody,
  shouldSkipHttpAudit,
} from './http-audit-classifier';

const STYLE_ID = 'ca49c0c4-b445-4f3d-9ada-0bc7da768650';
const DOC_ID = 'ffed9698-f204-401d-9a90-6b4935e2bcf0';

describe('classifyHttpRequest', () => {
  it('reads a login as a login, not a "create"', () => {
    expect(classifyHttpRequest('POST', '/auth/login', 200).action).toBe(
      'login',
    );
    expect(classifyHttpRequest('POST', '/auth/login', 401).action).toBe(
      'login_failed',
    );
  });

  it('picks the deepest resource and keeps the outer one as context', () => {
    const result = classifyHttpRequest(
      'PATCH',
      `/styles/${STYLE_ID}/production-docs/${DOC_ID}`,
      200,
    );
    expect(result.action).toBe('update');
    expect(result.resource).toEqual({ type: 'production-docs', id: DOC_ID });
    expect(result.ancestors).toEqual([{ type: 'styles', id: STYLE_ID }]);
  });

  it('uses a trailing verb segment over the HTTP method', () => {
    expect(
      classifyHttpRequest('POST', `/styles/${STYLE_ID}/documents/confirm`, 201)
        .action,
    ).toBe('upload');
    expect(
      classifyHttpRequest(
        'PATCH',
        `/styles/${STYLE_ID}/production-docs/${DOC_ID}/status`,
        200,
      ).action,
    ).toBe('status_change');
  });

  it('ignores prefix segments like masters/api', () => {
    const result = classifyHttpRequest('POST', '/masters/materials', 201);
    expect(result).toEqual({
      action: 'create',
      resource: { type: 'materials', id: null },
      ancestors: [],
    });
  });

  it('recognises a self password change', () => {
    expect(
      classifyHttpRequest('PATCH', '/system/users/me/password', 200).action,
    ).toBe('password_change');
  });
});

describe('shouldSkipHttpAudit', () => {
  it.each([
    ['GET', '/styles'],
    ['POST', '/auth/refresh'],
    ['POST', `/styles/${STYLE_ID}/documents/presign`],
    ['POST', '/auth/password-reset/validate'],
  ])('skips %s %s', (method, path) => {
    expect(shouldSkipHttpAudit(method, path)).toBe(true);
  });

  it('keeps real mutations', () => {
    expect(shouldSkipHttpAudit('PATCH', `/styles/${STYLE_ID}`)).toBe(false);
    expect(shouldSkipHttpAudit('POST', '/auth/login')).toBe(false);
  });
});

describe('extractNameFromBody', () => {
  it('takes the first known name field', () => {
    expect(extractNameFromBody({ materialName: 'Vải cotton' })).toBe(
      'Vải cotton',
    );
    expect(extractNameFromBody({ steps: [] })).toBeNull();
    expect(extractNameFromBody(null)).toBeNull();
  });
});

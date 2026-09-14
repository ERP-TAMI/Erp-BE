export type JwtPayload = {
  sub: string;
  email: string;
  roleCode: string;
  permissions: string[];
  authVersion: number;
};

export type RequestUser = {
  id: string;
  email: string;
  roleCode: string;
  permissions: string[];
};

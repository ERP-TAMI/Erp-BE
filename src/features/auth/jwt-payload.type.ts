export type JwtPayload = {
  sub: string;
  email: string;
  roleCode: string;
  permissions: string[];
};

export type RequestUser = {
  id: string;
  email: string;
  roleCode: string;
  permissions: string[];
};

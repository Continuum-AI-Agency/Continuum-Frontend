export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  createdAt: string | null;
};

export type PermissionRow = {
  user_id: string;
  brand_profile_id: string;
  role: string | null;
  brand_tier: number;
  brand_name: string | null;
};

export type AdminPagination = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  nextPage: number | null;
  lastPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

export type AdminListResponse = {
  users: AdminUser[];
  permissions: PermissionRow[];
  pagination: AdminPagination;
};

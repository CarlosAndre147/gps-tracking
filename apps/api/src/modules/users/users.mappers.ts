type CompanyLite = { id: string; name: string; cnpj: string };

export function mapUserListItem(
  user: {
    id: string;
    name: string;
    email: string;
    cpf: string;
    phone: string;
    role: string;
    isActive: boolean;
    lastSeenAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
  companies: CompanyLite[],
) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    cpf: user.cpf,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    lastSeenAt: user.lastSeenAt ? user.lastSeenAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    companies,
  };
}

export function mapUserBasic(user: {
  id: string;
  name: string;
  email: string;
  cpf: string;
  phone: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    cpf: user.cpf,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

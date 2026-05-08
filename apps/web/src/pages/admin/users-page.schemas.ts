import { isValidCnpj, isValidCpf } from "@/lib/br-documents";
import { z } from "zod";

export const strongPassword = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .regex(/[A-Z]/, "Inclua uma letra maiúscula")
  .regex(/[a-z]/, "Inclua uma letra minúscula")
  .regex(/[0-9]/, "Inclua um número");

export const createUserSchema = z
  .object({
    name: z.string().min(1, "Nome obrigatório"),
    email: z.string().email("E-mail inválido"),
    cpf: z.string().refine((v) => isValidCpf(v), "CPF inválido"),
    phone: z
      .string()
      .min(1, "Telefone obrigatório")
      .refine((v) => v.replace(/\D/g, "").length >= 10, "Telefone inválido"),
    password: strongPassword,
    confirmPassword: z.string().min(1, "Confirme a senha"),
    role: z.enum(["COMPANY_ADMIN", "USER"]),
    companyMode: z.enum(["none", "link", "create"]),
    companyIds: z.array(z.string()).default([]),
    companyName: z.string().optional(),
    companyCnpj: z.string().optional(),
    companyEmail: z.string().optional(),
    companyPhone: z.string().optional(),
  })
  .refine((d) => d.password === d.confirmPassword, { message: "Senhas não conferem", path: ["confirmPassword"] })
  .superRefine((d, ctx) => {
    if (d.companyMode === "link" && d.companyIds.length === 0) {
      ctx.addIssue({ code: "custom", message: "Selecione ao menos uma empresa", path: ["companyIds"] });
    }
    if (d.companyMode === "create") {
      if (!d.companyName?.trim()) {
        ctx.addIssue({ code: "custom", message: "Nome obrigatório", path: ["companyName"] });
      }
      if (!d.companyEmail?.trim()) {
        ctx.addIssue({ code: "custom", message: "E-mail obrigatório", path: ["companyEmail"] });
      } else if (!z.string().email().safeParse(d.companyEmail).success) {
        ctx.addIssue({ code: "custom", message: "E-mail inválido", path: ["companyEmail"] });
      }
      if (!d.companyCnpj || !isValidCnpj(d.companyCnpj)) {
        ctx.addIssue({ code: "custom", message: "CNPJ inválido", path: ["companyCnpj"] });
      }
      if (!d.companyPhone || d.companyPhone.replace(/\D/g, "").length < 10) {
        ctx.addIssue({ code: "custom", message: "Telefone inválido", path: ["companyPhone"] });
      }
    }
  });

export type CreateUserForm = z.infer<typeof createUserSchema>;

export const resetPwSchema = z
  .object({
    newPassword: strongPassword,
    confirmPassword: z.string().min(1, "Confirme a senha"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: "Senhas não conferem", path: ["confirmPassword"] });

export type ResetPwForm = z.infer<typeof resetPwSchema>;

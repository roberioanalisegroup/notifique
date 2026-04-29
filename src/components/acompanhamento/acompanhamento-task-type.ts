import type { Alvara, AlvaraGroup, AlvaraTask, Company, CompanyAlvara } from "@/types";

export type AcompanhamentoTaskRow = AlvaraTask & {
  company_alvaras:
    | (CompanyAlvara & {
        companies: Company | null;
        alvaras: (Alvara & { alvara_groups: AlvaraGroup | null }) | null;
      })
    | null;
};

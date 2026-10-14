// The supplier profile, edited in Settings.
import type { Handlers } from "../app.ts";
import type { Services } from "../services/index.ts";

export function supplierRoutes({
  supplier,
}: Pick<Services, "supplier">): Required<Pick<Handlers, "supplier.get" | "supplier.update">> {
  return {
    "supplier.get": () => supplier.get(),
    "supplier.update": ({ body }) => supplier.update(body),
  };
}

// Buyers: the BHEL units (INV-86).
import type { Handlers } from "../app.ts";
import type { Services } from "../services/index.ts";

type BuyersRoute = "buyers.list" | "buyers.create" | "buyers.update" | "buyers.delete";

export function buyersRoutes({ buyers }: Pick<Services, "buyers">): Required<Pick<Handlers, BuyersRoute>> {
  return {
    "buyers.list": () => buyers.list(),
    "buyers.create": ({ body }) => buyers.create(body),
    "buyers.update": ({ params, body }) => buyers.update(params.id, body),
    "buyers.delete": async ({ params }) => {
      await buyers.delete(params.id);
      return { ok: true };
    },
  };
}

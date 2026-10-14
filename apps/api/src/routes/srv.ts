// SRV reads and delete (SPEC-10 PR 4): flat list, by-PO list, stats, detail and delete.
import type { Handlers } from "../app.ts";
import type { SrvService } from "../services/srv.ts";

export function srvRoutes(srv: SrvService) {
  return {
    "srv.list": ({ query }) => srv.list(query),
    "srv.byPo": ({ query }) => srv.byPo(query),
    "srv.stats": ({ query }) => srv.stats(query),
    "srv.detail": ({ params }) => srv.detail(params.id),
    "srv.delete": ({ params }) => srv.delete(params.id),
  } satisfies Handlers;
}

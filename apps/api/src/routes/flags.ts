// Flags (SPEC-10 PR 5): the deviations list, open counts and acknowledge.
import type { Handlers } from "../app.ts";
import type { FlagsService } from "../services/flags.ts";

export function flagsRoutes(flags: FlagsService) {
  return {
    "flags.list": ({ query }) => flags.list(query),
    "flags.stats": () => flags.stats(),
    "flags.acknowledge": ({ params, body }) => flags.acknowledge(params.id, body.note),
  } satisfies Handlers;
}

// The settings page's reads and writes (SPEC-07 supplier, settings, buyers, BHEL password). Each write puts the
// server's answer into the cache, so the forms show what was stored.
import type { RouteInput, RouteOutput } from "@senstosales/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, apiQuery } from "../../../lib/api.ts";

export const supplierQuery = apiQuery("supplier.get");
export const settingsQuery = apiQuery("settings.get");
export const buyersQuery = apiQuery("buyers.list");
export const bhelPasswordQuery = apiQuery("settings.bhelPassword");

type Buyer = RouteOutput<"buyers.list">[number];
type BuyerBody = RouteInput<"buyers.create">["body"];

/** Save: the supplier profile and the settings, each only when it changed. One after the other, so a refused
 * profile (a field error) stops before the settings write. */
export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      supplier,
      settings,
    }: {
      supplier: RouteInput<"supplier.update">["body"] | null;
      settings: RouteInput<"settings.update">["body"] | null;
    }) => {
      if (supplier)
        queryClient.setQueryData(supplierQuery.queryKey, await api.request("supplier.update", { body: supplier }));
      if (settings)
        queryClient.setQueryData(settingsQuery.queryKey, await api.request("settings.update", { body: settings }));
    },
  });
}

/** Add or edit one buyer (legacy Buyer Management). */
export function useSaveBuyer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string | null; body: BuyerBody }) =>
      id === null ? api.request("buyers.create", { body }) : api.request("buyers.update", { params: { id }, body }),
    onSuccess: (saved: Buyer) =>
      queryClient.setQueryData(buyersQuery.queryKey, (list = []) =>
        list.some((b) => b.id === saved.id) ? list.map((b) => (b.id === saved.id ? saved : b)) : [...list, saved],
      ),
  });
}

export function useDeleteBuyer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.request("buyers.delete", { params: { id } }),
    onSuccess: (_ok, id) =>
      queryClient.setQueryData(buyersQuery.queryKey, (list = []) => list.filter((b) => b.id !== id)),
  });
}

/** Set or clear the stored BHEL portal password; the answer is only whether one is saved (INV-81). */
export function useBhelPassword() {
  const queryClient = useQueryClient();
  const store = (status: RouteOutput<"settings.bhelPassword">) =>
    queryClient.setQueryData(bhelPasswordQuery.queryKey, status);
  return {
    set: useMutation({
      mutationFn: (password: string) => api.request("settings.setBhelPassword", { body: { password } }),
      onSuccess: store,
    }),
    clear: useMutation({ mutationFn: () => api.request("settings.clearBhelPassword"), onSuccess: store }),
  };
}

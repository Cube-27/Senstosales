import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";

import { api } from "../../lib/api.ts";
import { LogOut, Monitor, Package } from "../../lib/icons.ts";
import { useToast } from "./Toast.tsx";

const ACTION = "relative rounded-lg p-2 text-muted transition-colors hover:bg-surface-sunken hover:text-foreground";

/** The header's shortcuts (Delivery Tracker, Ingest BHEL) and Logout. */
export function HeaderActions() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const logout = async (): Promise<void> => {
    try {
      await api.request("auth.logout");
    } catch {
      // A stale session must not keep the user from the login screen.
    }
    // The next user starts from the login with nothing of this session's data cached.
    queryClient.clear();
    toast("Signed Out", "Authentication session ended.", "success");
    await navigate({ to: "/auth/login" });
  };

  return (
    <div className="flex items-center gap-2">
      <Link to="/delivery-tracker" title="Delivery Tracker" aria-label="Delivery Tracker" className={ACTION}>
        <Package className="size-5" />
      </Link>
      <Link to="/po/ingest-bhel" title="Ingest BHEL" aria-label="Ingest BHEL" className={ACTION}>
        <Monitor className="size-5" />
      </Link>
      <button type="button" onClick={() => void logout()} title="Logout" aria-label="Logout" className={ACTION}>
        <LogOut className="size-5" />
      </button>
    </div>
  );
}

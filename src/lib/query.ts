import { useQuery } from "@tanstack/react-query";

import { api } from "./api";
import { useAuth } from "./auth-context";

/**
 * The single authed-query hook, shared by hooks.ts / hooks-advanced.ts /
 * hooks-features.ts (which used to each declare their own copy). It keeps the
 * richest signature — the optional `extras` (refetchOnWindowFocus /
 * refetchInterval) is required by the viva/presentation polling hooks, so the
 * canonical version MUST retain it.
 */
export function useAuthedQuery<T>(
  key: unknown[],
  path: string,
  enabled = true,
  extras?: { refetchOnWindowFocus?: boolean; refetchInterval?: number },
) {
  const { isAuthenticated } = useAuth();
  return useQuery<T>({
    queryKey: key,
    queryFn: () => api<T>(path),
    enabled: enabled && isAuthenticated,
    refetchOnWindowFocus: extras?.refetchOnWindowFocus,
    refetchInterval: extras?.refetchInterval,
  });
}

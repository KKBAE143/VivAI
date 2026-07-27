import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { report } from "./diagnostics/client";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // QueryCache/MutationCache onError are pure OBSERVERS: they do not swallow
  // the error, do not change retry behaviour, and do not affect `isError`.
  // Attaching here covers every read query plus all ~35 useMutation call sites
  // (34 of which have no onError of their own) in one place.
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        report(error, {
          kind: "query_error",
          context: { query_key: JSON.stringify(query.queryKey).slice(0, 200) },
        });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        report(error, {
          kind: "mutation_error",
          context: {
            mutation_key: JSON.stringify(mutation.options.mutationKey ?? "anonymous").slice(0, 200),
          },
        });
      },
    }),
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

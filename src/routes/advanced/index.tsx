import { createFileRoute, redirect } from "@tanstack/react-router";

// The Advanced hub has been unified into the main AI Tools hub.
export const Route = createFileRoute("/advanced/")({
  beforeLoad: () => {
    throw redirect({ to: "/ai" });
  },
});

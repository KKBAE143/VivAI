/** Path → architecture layer (ported from CodeFlow layer detection). */

import type { Layer } from "./types";

export const LAYER_COLORS: Record<Layer, string> = {
  ui: "#4d9fff",
  components: "#22d3ee",
  services: "#a78bfa",
  utils: "#00ff9d",
  data: "#ff9f43",
  config: "#ec4899",
  test: "#f59e0b",
  modules: "#a78bfa",
};

export function layerForPath(path: string): Layer {
  const l = "/" + path.toLowerCase().replace(/^\/+/, "");
  if (
    l.includes("/test") ||
    /test_\w+\.py$/.test(l) ||
    /\w+_test\.py$/.test(l) ||
    l.includes("conftest") ||
    l.includes("__tests__") ||
    l.includes(".test.") ||
    l.includes(".spec.")
  ) {
    return "test";
  }
  if (
    l.includes("/ui/") ||
    l.includes("/views/") ||
    l.includes("/pages/") ||
    l.includes("/templates/") ||
    l.includes("/static/") ||
    l.includes("/routes/")
  ) {
    return "ui";
  }
  if (l.includes("/component")) return "components";
  if (
    l.includes("/service") ||
    l.includes("/api/") ||
    l.includes("/controller") ||
    l.includes("/endpoint") ||
    l.includes("/router") ||
    l.includes("/middleware") ||
    l.includes("/handler")
  ) {
    return "services";
  }
  if (l.includes("/util") || l.includes("/helper") || l.includes("/lib/") || l.includes("/common/")) {
    return "utils";
  }
  if (
    l.includes("/data") ||
    l.includes("/model") ||
    l.includes("/store") ||
    l.includes("/schema") ||
    l.includes("/serializer") ||
    l.includes("/migration")
  ) {
    return "data";
  }
  if (l.includes("/config") || l.includes("/settings") || /settings\.py$/.test(l)) {
    return "config";
  }
  if (l.includes("/modules/")) return "modules";
  return "utils";
}

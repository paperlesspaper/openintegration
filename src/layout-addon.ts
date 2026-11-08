// Additive entry for hosts whose shared runtime includes additional integrations.
// Existing exports stay available; the embedded bridge also supports older helpers.
import { installEmbeddedRenderBridge } from "./renderEmbedded";
if (typeof window !== "undefined") installEmbeddedRenderBridge();
export { bootLayoutIntegration } from "./layout";
export { markLoading, markReady, markError } from "./ready";
export { waitForPayload } from "./runtime";

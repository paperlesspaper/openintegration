const loadingMarkerId = "website-has-loading-element";
const loadedMarkerId = "website-has-loaded";

function getDocument(): Document | undefined {
  return globalThis.document;
}

function appendHiddenMarker(id: string, text = ""): HTMLElement | undefined {
  const doc = getDocument();

  if (!doc) {
    return undefined;
  }

  const existing = doc.getElementById(id);

  if (existing) {
    return existing;
  }

  const marker = doc.createElement("div");
  marker.id = id;
  marker.textContent = text;
  marker.hidden = true;
  doc.body.append(marker);

  return marker;
}

function hasVisiblePageContent(): boolean {
  const doc = getDocument();

  if (!doc) {
    return true;
  }

  const content = Array.from(doc.body.children).filter((element) => {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (element.id === loadingMarkerId || element.id === loadedMarkerId) {
      return false;
    }

    return !element.hidden && element.textContent?.trim();
  });

  return content.length > 0;
}

export function markLoading(): void {
  appendHiddenMarker(loadingMarkerId);
}

export function markReady(): void {
  const doc = getDocument();

  if (!doc) {
    return;
  }

  doc.getElementById(loadingMarkerId)?.remove();
  appendHiddenMarker(loadedMarkerId, "ready");
}

export function markError(error?: unknown): void {
  if (error !== undefined) {
    console.error(error);
  }

  const doc = getDocument();

  if (doc && !hasVisiblePageContent()) {
    const block = doc.createElement("div");
    block.className = "pp-error";
    block.setAttribute("role", "alert");
    block.textContent = "Unable to render this integration.";
    doc.body.append(block);
  }

  markReady();
}

// src/ready.ts
var loadingMarkerId = "website-has-loading-element";
var loadedMarkerId = "website-has-loaded";
function getDocument() {
  return globalThis.document;
}
function appendHiddenMarker(id, text = "") {
  const doc = getDocument();
  if (!doc) {
    return void 0;
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
function hasVisiblePageContent() {
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
function markLoading() {
  appendHiddenMarker(loadingMarkerId);
}
function markReady() {
  const doc = getDocument();
  if (!doc) {
    return;
  }
  doc.getElementById(loadingMarkerId)?.remove();
  appendHiddenMarker(loadedMarkerId, "ready");
}
function markError(error) {
  if (error !== void 0) {
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

// src/runtime.ts
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function normalizePayload(value) {
  if (!isRecord(value)) {
    return void 0;
  }
  const data = value.data;
  if (isRecord(data) && (value.type === "INIT" || value.cmd === "message")) {
    return data;
  }
  return value;
}
function originAllowed(origin, allowedOrigins) {
  if (!allowedOrigins || allowedOrigins.length === 0) {
    return true;
  }
  return allowedOrigins.includes(origin);
}
function waitForPayload(options = {}) {
  const { timeoutMs = 500, fallback = {}, allowedOrigins } = options;
  if (typeof window === "undefined") {
    return Promise.resolve(fallback);
  }
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    const finish = (payload) => {
      if (settled) {
        return;
      }
      settled = true;
      window.removeEventListener("message", onMessage);
      if (timer) {
        clearTimeout(timer);
      }
      resolve(payload);
    };
    const onMessage = (event) => {
      if (!originAllowed(event.origin, allowedOrigins)) {
        return;
      }
      const payload = normalizePayload(event.data);
      if (payload) {
        finish(payload);
      }
    };
    window.addEventListener("message", onMessage);
    if (timeoutMs >= 0) {
      timer = setTimeout(() => finish(fallback), timeoutMs);
    }
  });
}

// src/settings.ts
function isRecord2(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function coerceQueryValue(value) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return value;
}
function mergeSettings(...sources) {
  return Object.assign({}, ...sources.filter(Boolean));
}
function getSettings(payload, defaults) {
  const settings = payload?.meta;
  if (!isRecord2(settings) || !isRecord2(settings.pluginSettings)) {
    return mergeSettings(defaults);
  }
  return mergeSettings(defaults, settings.pluginSettings);
}
function getQuerySettings(defaults) {
  if (typeof window === "undefined") {
    return mergeSettings(defaults);
  }
  const params = new URLSearchParams(window.location.search);
  const values = {};
  for (const [key, value] of params) {
    values[key] = coerceQueryValue(value);
  }
  return mergeSettings(defaults, values);
}

// src/fitText.ts
function px(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function overflows(element) {
  return element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight;
}
function fitText(element, options = {}) {
  const { min = 8, step = 1, nowrap = false } = options;
  const computed = window.getComputedStyle(element);
  const startingSize = px(computed.fontSize) || options.max || 16;
  const max = options.max ?? startingSize;
  if (nowrap) {
    element.style.whiteSpace = "nowrap";
  }
  let size = Math.min(startingSize, max);
  element.style.fontSize = `${size}px`;
  while (size > min && overflows(element)) {
    size = Math.max(min, size - step);
    element.style.fontSize = `${size}px`;
  }
}
function fitAllText(selector = ".pp-fit", options) {
  if (typeof document === "undefined") {
    return;
  }
  for (const element of document.querySelectorAll(selector)) {
    fitText(element, options);
  }
}

// src/resize.ts
function fitToScreen(element, options = {}) {
  const { padding = 0, maxScale = 1 } = options;
  const target = element ?? globalThis.document?.body;
  if (typeof window === "undefined" || !target) {
    return 1;
  }
  target.style.transform = "";
  target.style.transformOrigin = "top left";
  const rect = target.getBoundingClientRect();
  const width = rect.width || target.scrollWidth;
  const height = rect.height || target.scrollHeight;
  const availableWidth = Math.max(0, window.innerWidth - padding * 2);
  const availableHeight = Math.max(0, window.innerHeight - padding * 2);
  if (!width || !height || !availableWidth || !availableHeight) {
    return 1;
  }
  const scale = Math.min(maxScale, availableWidth / width, availableHeight / height);
  target.style.transform = `scale(${scale})`;
  return scale;
}
function fitImage(image, mode = "contain") {
  image.style.width = "100%";
  image.style.height = "100%";
  image.style.objectFit = mode;
}

// src/overflow.ts
function elementOverflows(element) {
  return element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight;
}
function detectOverflow(root) {
  const target = root ?? globalThis.document?.body;
  if (!target) {
    return {
      hasOverflow: false,
      elements: []
    };
  }
  const elements = [target, ...Array.from(target.querySelectorAll("*"))].filter(
    elementOverflows
  );
  return {
    hasOverflow: elements.length > 0,
    elements
  };
}

// src/html.ts
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

// src/manifest.ts
function isRecord3(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
function validateConfig(config) {
  const errors = [];
  const warnings = [];
  if (!isRecord3(config)) {
    return {
      valid: false,
      errors: ["config must be an object"],
      warnings
    };
  }
  if (typeof config.name !== "string" || config.name.trim() === "") {
    errors.push("name is required");
  }
  if (typeof config.version !== "string" || config.version.trim() === "") {
    errors.push("version is required");
  }
  if (typeof config.renderPage !== "string" || config.renderPage.trim() === "") {
    errors.push("renderPage is required");
  }
  if ("settingsPage" in config && typeof config.settingsPage !== "string") {
    errors.push("settingsPage must be a string");
  }
  if ("nativeSettings" in config && !isRecord3(config.nativeSettings)) {
    errors.push("nativeSettings must be an object");
  }
  if ("formSchema" in config && !isRecord3(config.formSchema)) {
    errors.push("formSchema must be an object");
  }
  if (!("description" in config)) {
    warnings.push("description is missing");
  }
  if (!("nativeSettings" in config)) {
    warnings.push("nativeSettings is missing");
  }
  if (!("formSchema" in config)) {
    warnings.push("formSchema is missing");
  }
  if (typeof config.renderPage === "string" && isHttpUrl(config.renderPage)) {
    warnings.push("renderPage should usually be relative");
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
export {
  detectOverflow,
  escapeHtml,
  fitAllText,
  fitImage,
  fitText,
  fitToScreen,
  getQuerySettings,
  getSettings,
  markError,
  markLoading,
  markReady,
  mergeSettings,
  validateConfig,
  waitForPayload
};

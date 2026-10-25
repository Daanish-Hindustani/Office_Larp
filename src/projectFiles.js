const filenamePattern = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,59}\.(html|css|js)$/i;
export const validProjectFilename = (name) => filenamePattern.test(name);
export const fileLanguage = (name) =>
  ({ html: "HTML", css: "CSS", js: "JavaScript" })[
    name.split(".").at(-1).toLowerCase()
  ];
export function newProjectFile(name) {
  if (/\.html$/i.test(name))
    return `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <title>${name}</title>\n</head>\n<body>\n  <h1>A new page</h1>\n</body>\n</html>`;
  return /\.css$/i.test(name)
    ? "/* Add your styles here. */\n"
    : "// Add your JavaScript here.\n";
}
export function readProjectFiles(id, initialHTML) {
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(`office-hours:files:${id}:v1`),
    );
    if (saved?.version === 1 && saved.files && !Array.isArray(saved.files)) {
      const entries = Object.entries(saved.files);
      if (
        entries.length <= 30 &&
        entries.every(
          ([name, code]) =>
            validProjectFilename(name) && typeof code === "string",
        ) &&
        typeof saved.files["index.html"] === "string"
      )
        return saved.files;
    }
  } catch {
    /* Fall back to the legacy single-file draft. */
  }
  let html = initialHTML;
  try {
    html = sessionStorage.getItem(`office-hours:html:${id}`) ?? html;
  } catch {}
  return {
    "index.html": html,
    "styles.css": newProjectFile("styles.css"),
    "script.js": newProjectFile("script.js"),
  };
}

// Compose local files as browser resources. No user code is evaluated by the host app or server.
export function buildProjectDocument(files, entry = "index.html") {
  if (typeof files[entry] !== "string" || !/\.html$/i.test(entry))
    throw new Error("Choose an HTML file to preview.");
  const document = new DOMParser().parseFromString(files[entry], "text/html");
  const included = new Set();
  const localName = (value) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return null;
    try {
      return decodeURIComponent(value.split(/[?#]/)[0]).replace(/^\.\//, "");
    } catch {
      throw new Error(`Invalid file reference: ${value}`);
    }
  };
  function cssFile(name) {
    const style = document.createElement("style");
    style.dataset.projectFile = name;
    style.textContent = files[name];
    included.add(name);
    return style;
  }
  function scriptFile(name) {
    const script = document.createElement("script");
    // Encoding keeps closing-script text and Unicode safe during HTML serialization.
    script.src = `data:text/javascript;charset=utf-8,${encodeURIComponent(files[name])}`;
    script.dataset.projectFile = name;
    included.add(name);
    return script;
  }
  for (const link of document.querySelectorAll(
    'link[rel="stylesheet"][href]',
  )) {
    const name = localName(link.getAttribute("href"));
    if (name === null) continue;
    if (typeof files[name] !== "string" || !/\.css$/i.test(name))
      throw new Error(`Stylesheet not found: ${name}`);
    const style = cssFile(name);
    if (link.media) style.media = link.media;
    if (link.disabled) style.disabled = true;
    link.replaceWith(style);
  }
  for (const original of document.querySelectorAll("script[src]")) {
    const name = localName(original.getAttribute("src"));
    if (name === null) continue;
    if (typeof files[name] !== "string" || !/\.js$/i.test(name))
      throw new Error(`JavaScript file not found: ${name}`);
    const script = scriptFile(name);
    for (const attr of ["type", "defer", "async", "nomodule"])
      if (original.hasAttribute(attr))
        script.setAttribute(attr, original.getAttribute(attr));
    original.replaceWith(script);
  }
  for (const name of Object.keys(files))
    if (/\.css$/i.test(name) && !included.has(name))
      document.head.append(cssFile(name));
  for (const name of Object.keys(files))
    if (/\.js$/i.test(name) && !included.has(name))
      document.body.append(scriptFile(name));
  return "<!doctype html>\n" + document.documentElement.outerHTML;
}

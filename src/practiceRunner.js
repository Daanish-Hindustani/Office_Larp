// User code runs in a terminable worker inside an opaque-origin sandbox.
// The frame's CSP blocks network requests; code is never evaluated by Node.
function workerProgram() {
  self.onmessage = async ({ data }) => {
    const display = (value) => {
      try {
        const text = JSON.stringify(value, (_, item) =>
          typeof item === "bigint" ? `${item}n` : item,
        );
        return text === undefined ? "undefined" : text.slice(0, 4000);
      } catch {
        return String(value).slice(0, 4000);
      }
    };
    try {
      const fn = new Function(
        `"use strict";\n${data.code}\n;return typeof ${data.functionName} === 'function' ? ${data.functionName} : null;`,
      )();
      if (!fn)
        throw new Error(
          `Define the ${data.functionName} function from the starter code.`,
        );
      const results = [];
      for (const test of data.cases) {
        const started = performance.now();
        try {
          const actual = await fn(...structuredClone(test.args));
          const normalize = (value) =>
            data.compare === "unordered" && Array.isArray(value)
              ? [...value].sort((a, b) => a - b)
              : value;
          results.push({
            passed:
              JSON.stringify(normalize(actual)) ===
              JSON.stringify(normalize(test.expected)),
            actual: display(actual),
            expected: display(test.expected),
            input: display(test.args),
            elapsed: Math.round((performance.now() - started) * 100) / 100,
          });
        } catch (error) {
          results.push({
            passed: false,
            input: display(test.args),
            expected: display(test.expected),
            error: String(error.message || error).slice(0, 1000),
          });
        }
      }
      self.postMessage({ results });
    } catch (error) {
      self.postMessage({
        error: String(error.message || error).slice(0, 1000),
      });
    }
  };
}
export function runPractice({ code, functionName, cases, compare }) {
  if (!/^[a-zA-Z_$][\w$]*$/.test(functionName))
    return {
      promise: Promise.reject(
        new Error(
          "This starter code can’t be run locally. Open the problem on LeetCode to test it.",
        ),
      ),
      cancel() {},
    };
  const token = crypto.randomUUID(),
    frame = document.createElement("iframe");
  frame.sandbox = "allow-scripts";
  frame.hidden = true;
  frame.title = "Isolated practice test runner";
  const workerSource = `(${workerProgram.toString()})()`;
  const payload = JSON.stringify({
    code,
    functionName,
    cases,
    compare,
  }).replace(/</g, "\\u003c");
  frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'; base-uri 'none'; form-action 'none'"><script>
    const worker = new Worker(URL.createObjectURL(new Blob([${JSON.stringify(workerSource)}], {type:'text/javascript'})));
    worker.onmessage = (event) => parent.postMessage({token:'${token}',payload:event.data},'*');
    worker.onerror = () => parent.postMessage({token:'${token}',payload:{error:'The practice runner could not start.'}},'*');
    onmessage = (event) => { if(event.data === 'stop') worker.terminate(); };
    worker.postMessage(${payload});
  </script>`;
  let finish;
  const promise = new Promise((resolve, reject) => {
    let timer;
    function clean() {
      clearTimeout(timer);
      window.removeEventListener("message", message);
      frame.contentWindow?.postMessage("stop", "*");
      frame.remove();
    }
    finish = (error, result) => {
      clean();
      error ? reject(error) : resolve(result);
    };
    function message(event) {
      if (event.source !== frame.contentWindow || event.data?.token !== token)
        return;
      const payload = event.data.payload;
      finish(payload.error ? new Error(payload.error) : null, payload);
    }
    window.addEventListener("message", message);
    timer = setTimeout(
      () =>
        finish(
          new Error(
            "Practice run stopped after 2 seconds. Check for an infinite loop, then try again.",
          ),
        ),
      2000,
    );
    document.body.appendChild(frame);
  });
  return {
    promise,
    cancel() {
      finish?.(new Error("Practice run stopped."));
    },
  };
}

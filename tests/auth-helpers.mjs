import { randomUUID } from "node:crypto";

export async function signIn(request, base, name = "Studio guest") {
  const response = await request.post(`${base}/api/auth/register`, {
    data: {
      username: `u_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
      name,
    },
  });
  if (!response.ok())
    throw new Error(`Test registration failed: ${await response.text()}`);
  return (await response.json()).user;
}
export async function signedInPage(browser, base, options) {
  const page = await browser.newPage(options);
  await signIn(page.request, base);
  return page;
}
export async function signedInContext(browser, base, options) {
  const context = await browser.newContext(options);
  await signIn(context.request, base);
  return context;
}
const apiCookies = new Map();
export async function authenticatedFetch(base, path) {
  if (!apiCookies.has(base)) {
    const response = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `u_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
        name: "API reader",
      }),
    });
    if (!response.ok) throw new Error("Test API registration failed");
    apiCookies.set(base, response.headers.get("set-cookie").split(";")[0]);
  }
  return fetch(base + path, { headers: { Cookie: apiCookies.get(base) } });
}

// Basic security headers for all Pages Functions responses (API only).
export async function onRequest(context) {
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  // Keep CSP light since this site is simple and uses inline styles in one place.
  headers.set("content-security-policy", "default-src 'self' https:; img-src 'self' https: data:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' https:;");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}


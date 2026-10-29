const WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS = 60;     // Max 60 requests per IP per minute
const ipStore = new Map();

export const config = {
  matcher: ["/:path*"],
};

export default function middleware(request) {
  const now = Date.now();
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";

  // Clean up expired entries periodically to prevent memory bloat
  if (ipStore.size > 5000) {
    for (const [key, val] of ipStore.entries()) {
      if (now > val.resetTime) ipStore.delete(key);
    }
  }

  let record = ipStore.get(ip);
  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + WINDOW_MS };
  }

  record.count += 1;
  ipStore.set(ip, record);

  const remaining = Math.max(0, MAX_REQUESTS - record.count);
  const resetSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));

  if (record.count > MAX_REQUESTS) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Retry-After": String(resetSeconds),
        "X-RateLimit-Limit": String(MAX_REQUESTS),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(resetSeconds),
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer"
      }
    });
  }

  // Pass request through to static assets with dynamic rate-limit headers
  return new Response(null, {
    headers: {
      "x-middleware-next": "1",
      "X-RateLimit-Limit": String(MAX_REQUESTS),
      "X-RateLimit-Remaining": String(remaining),
      "X-RateLimit-Reset": String(resetSeconds)
    }
  });
}
#!/usr/bin/env node
/**
 * Deterministic stand-in for "the backend this frontend proxies to".
 *
 * The pure-frontend profile has no backend in the target project, so the proxy
 * smoke test needs a target that makes the prefix-strip contract observable:
 *
 *   GET /hello            -> 200 application/json  (what the proxy must produce)
 *   GET /api/hello        -> 404 application/json  (what a proxy that forwards
 *                                                   the prefix unconsumed would get)
 *   anything else         -> 404 application/json
 *
 * Because the route table has no `/api` prefix, a 200 on `/api/hello` through the
 * dev server can only mean the prefix was stripped — which is the behaviour the
 * REWRITE in `vite-proxy-from-env` exists to produce.
 *
 * Prints one line, `STUB_BACKEND_LISTENING <port>`, so the runner can learn the
 * port after asking for `--port 0`.
 */
import { createServer } from "node:http";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const port = Number(arg("port", "0"));
const route = arg("route", "/hello");

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = createServer((req, res) => {
  const { pathname } = new URL(req.url, "http://stub.invalid");
  if (pathname === route) {
    send(res, 200, { hello: "world", route, serverSawPath: pathname });
    return;
  }
  send(res, 404, { error: "not-found", serverSawPath: pathname });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`STUB_BACKEND_LISTENING ${server.address().port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

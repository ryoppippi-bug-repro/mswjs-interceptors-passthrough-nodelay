# mswjs-interceptors-passthrough-nodelay

Minimal reproduction for [`@mswjs/interceptors`](https://github.com/mswjs/interceptors): **a passed-through connection does not inherit the client socket's `setNoDelay()`/`setKeepAlive()`.**

`node:http` (the Agent's default `noDelay: true`) and undici (`socket.setNoDelay(true)`) both disable Nagle's algorithm on the socket they own. With an interceptor applied, that socket is the intercepted one. The real socket created for passthrough (`TcpSocketController#passthrough()` → `createRealSocket()`) keeps Nagle on. A request written as headers and then body therefore waits out the peer's delayed ACK, so every passed-through request takes about **44 ms instead of under 1 ms**.

## Steps

```sh
npm ci
npm start
```

`npm start` runs `repro.mjs` twice, without and then with `HttpRequestInterceptor` applied. There are no request listeners, so every request is passed through. Each run sends 50 sequential keep-alive POSTs to a local `node:http` server, using both `http.request` and `fetch`.

## Expected

The run with the interceptor applied should be roughly as fast as the run without it.

## Actual

This output is from a real run:

```
none        http.request median 0.19 ms  p90 0.49 ms  total 13 ms (50 sequential requests)
none        fetch        median 0.61 ms  p90 1.14 ms  total 36 ms (50 sequential requests)
interceptor http.request median 44.00 ms  p90 47.52 ms  total 2221 ms (50 sequential requests)
interceptor fetch        median 43.98 ms  p90 47.66 ms  total 2177 ms (50 sequential requests)
```

When `realSocket.setNoDelay(true)` is applied to the passthrough socket, the interceptor run drops back to a median of about 0.6 ms (`http.request`) and 0.9 ms (`fetch`).

## Environment

- `@mswjs/interceptors` 0.45.9
- Node.js 24.22.0. Node 24+ is required, because 0.45.9 uses `Promise.withResolvers`.
- Linux x86_64

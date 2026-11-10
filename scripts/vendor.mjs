import { copyFile, mkdir } from "node:fs/promises";
const root = new URL("../", import.meta.url);
await mkdir(new URL("vendor/", root), { recursive: true });
for (const [from, to] of [
  ["socket.io-client/dist/socket.io.min.js", "socket.io.min.js"],
  ["@highlightjs/cdn-assets/highlight.min.js", "highlight.min.js"],
  ["@highlightjs/cdn-assets/styles/github-dark.min.css", "highlight.css"],
  ["socket.io-client/LICENSE", "socket.io.LICENSE"],
  ["@highlightjs/cdn-assets/LICENSE", "highlight.LICENSE"],
])
  await copyFile(
    new URL("node_modules/" + from, root),
    new URL("vendor/" + to, root),
  );
console.log("Local browser assets prepared.");

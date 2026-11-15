import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
await mkdir(new URL("vendor/three/", root), { recursive: true });

for (const [from, to] of [
  ["socket.io-client/dist/socket.io.min.js", "socket.io.min.js"],
  ["@highlightjs/cdn-assets/highlight.min.js", "highlight.min.js"],
  ["@highlightjs/cdn-assets/styles/github-dark.min.css", "highlight.css"],
  ["socket.io-client/LICENSE", "socket.io.LICENSE"],
  ["@highlightjs/cdn-assets/LICENSE", "highlight.LICENSE"],
  ["three/LICENSE", "three/LICENSE"],
]) {
  await copyFile(
    new URL("node_modules/" + from, root),
    new URL("vendor/" + to, root),
  );
}

const threeModules = [
  ["three/build/three.core.js", "three/three.core.js"],
  ["three/build/three.module.js", "three/three.module.js"],
  ["three/examples/jsm/loaders/GLTFLoader.js", "three/GLTFLoader.js"],
  ["three/examples/jsm/controls/OrbitControls.js", "three/OrbitControls.js"],
  [
    "three/examples/jsm/utils/BufferGeometryUtils.js",
    "three/BufferGeometryUtils.js",
  ],
  ["three/examples/jsm/utils/SkeletonUtils.js", "three/SkeletonUtils.js"],
  [
    "three/examples/jsm/libs/meshopt_decoder.module.js",
    "three/meshopt_decoder.module.js",
  ],
];

for (const [from, to] of threeModules) {
  let source = await readFile(new URL("node_modules/" + from, root), "utf8");
  source = source
    .replaceAll("from 'three'", "from './three.module.js'")
    .replaceAll('from "three"', 'from "./three.module.js"')
    .replaceAll("'../utils/BufferGeometryUtils.js'", "'./BufferGeometryUtils.js'")
    .replaceAll('"../utils/BufferGeometryUtils.js"', '"./BufferGeometryUtils.js"')
    .replaceAll("'../utils/SkeletonUtils.js'", "'./SkeletonUtils.js'")
    .replaceAll('"../utils/SkeletonUtils.js"', '"./SkeletonUtils.js"');
  await writeFile(new URL("vendor/" + to, root), source, "utf8");
}

console.log("Local browser assets prepared.");

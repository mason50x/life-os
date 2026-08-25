import { defineConfig } from "tsup";

/**
 * Ink reaches for React DevTools only when DEV=true, behind its own try/catch.
 * Bundling it would drag the whole devtools client into every install, and
 * leaving it unresolved fails the build — so it resolves to a stub that throws
 * only if something actually asks for it.
 */
const stubDevtools = {
  name: "stub-react-devtools",
  setup(build: {
    onResolve: (o: { filter: RegExp }, cb: () => { path: string; namespace: string }) => void;
    onLoad: (o: { filter: RegExp; namespace: string }, cb: () => { contents: string }) => void;
  }) {
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: "react-devtools-core",
      namespace: "stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: "export default { initialize() {}, connectToDevTools() {} };",
    }));
  },
};

/**
 * One bundled file, dependencies included. `npm i -g` then has nothing to
 * resolve or download beyond the tarball itself, which is what keeps updating
 * to a single keypress.
 */
export default defineConfig({
  entry: ["src/cli.tsx"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  bundle: true,
  noExternal: [/.*/],
  splitting: false,
  clean: true,
  banner: {
    // Some dependencies are still CommonJS and call require() for builtins.
    // Bundled into an ESM file there is no require to call, so make one.
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __nodeCreateRequire } from "node:module";',
      "const require = __nodeCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  esbuildPlugins: [stubDevtools as never],
});

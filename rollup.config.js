const typescript = require("@rollup/plugin-typescript");
const terser = require("@rollup/plugin-terser");

/**
 * @param {import("rollup").RollupOptions["output"]} options
 */
function minified(options) {
  const f = options.file;
  const lastDotIdx = f.lastIndexOf(".");

  const file = f.slice(0, lastDotIdx) + ".min" + f.slice(lastDotIdx);
  const plugins = [
    terser({ compress: true, mangle: true, sourceMap: true }),
    ...(options.plugins || []),
  ];

  return {
    ...options,
    file,
    plugins,
  };
}

/** @type {import("rollup").RollupOptions["output"]} */
const iife = {
  file: "build/index.iife.js",
  format: "iife",
  name: "Stretchy",
};

/** @type {import("rollup").RollupOptions["output"]} */
const esm = {
  file: "build/index.js",
  format: "esm",
};

/** @type {import("rollup").RollupOptions["output"]} */
const cjs = {
  file: "build/index.cjs.js",
  format: "cjs",
};

/** @type {import("rollup").RollupOptions} */
const options = {
  input: "src/index.ts",
  output: [iife, minified(iife), esm, minified(esm), cjs, minified(cjs)],
  plugins: [typescript()],
};

module.exports = options;

// data/*.json -> data/bundle.js
// Razlog: otvoren dvoklikom (file://) browser blokira fetch lokalnog JSON-a.
import { readFile, writeFile } from "node:fs/promises";

const read = async (f) => JSON.parse(await readFile(`data/${f}.json`, "utf8"));

const bundle = {
  products: await read("products"),
  categories: await read("categories"),
  demo: await read("demo"),
  protocols: await read("protocols"),
};

await writeFile(
  "data/bundle.js",
  `// generisano: node scripts/bundle.mjs — ne menjati rucno\nwindow.VECOM = ${JSON.stringify(bundle)};\n`
);

console.log(
  `bundle.js: ${bundle.products.length} proizvoda, ${bundle.protocols.length} protokola`
);

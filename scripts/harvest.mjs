import { writeFile, mkdir, access } from "node:fs/promises";

const PROJECT = "d3h45dnb";
const DATASET = "production";
const API = `https://${PROJECT}.api.sanity.io/v2021-10-21/data/query/${DATASET}`;

const groq = async (q) => {
  const r = await fetch(`${API}?query=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return (await r.json()).result;
};

// image-<hash>-<w>x<h>-<ext>  ->  cdn url
const refToUrl = (ref, w = 1200) => {
  const [, hash, dims, ext] = ref.split("-");
  return `https://cdn.sanity.io/images/${PROJECT}/${DATASET}/${hash}-${dims}.${ext}?w=${w}&fm=webp&q=85`;
};

const products = await groq(`*[_type=="product"]|order(order asc){
  _id, sku, "slug": slug.current, "name": coalesce(nameSr, name),
  "desc": coalesce(shortDescriptionSr, shortDescriptionEn),
  "nameEn": coalesce(nameEn, name), "nameDe": coalesce(nameDe, nameEn, name),
  "descEn": shortDescriptionEn, "descDe": shortDescriptionDe,
  "category": category->slug.current,
  features, accordionItems,
  "mainImage": mainImage.asset._ref,
  "images": images[].asset._ref
}`);

const categories = await groq(`*[_type=="category"]{ "slug": slug.current, "name": coalesce(nameSr, name, title) }`);

await mkdir("data", { recursive: true });
await mkdir("public/assets/products", { recursive: true });

// portable text -> plain string
const flat = (blocks) =>
  (blocks || [])
    .map((b) => (b.children || []).map((c) => c.text).join(""))
    .filter(Boolean)
    .join("\n");

const exists = async (f) => access(f).then(() => true, () => false);

const out = [];
for (const p of products) {
  const ref = p.mainImage || p.images?.[0];
  let file = null;
  if (ref) {
    // fajl ide u public/, a u JSON-u putanja kako je browser vidi
    file = `assets/products/${p.slug}.webp`;
    if (!(await exists(`public/${file}`))) {
      const buf = Buffer.from(await (await fetch(refToUrl(ref))).arrayBuffer());
      await writeFile(`public/${file}`, buf);
    }
  }
  // SR/EN/DE za sekcije sajta, specifikacija samo SR; bez Sanity meta polja
  out.push({
    sku: p.sku,
    slug: p.slug,
    name: (p.name || "").trim(),
    nameEn: (p.nameEn || p.name || "").trim(),
    nameDe: (p.nameDe || p.nameEn || p.name || "").trim(),
    desc: p.desc || "",
    descEn: p.descEn || p.desc || "",
    descDe: p.descDe || p.descEn || p.desc || "",
    category: p.category,
    features: (p.features || []).map((f) => ({
      title: f.titleSr || f.titleEn,
      titleEn: f.titleEn || f.titleSr,
      titleDe: f.titleDe || f.titleEn || f.titleSr,
      desc: f.descriptionSr || f.descriptionEn,
    })),
    specs: (p.accordionItems || []).map((a) => ({
      title: a.titleSr || a.titleEn,
      text: flat(a.contentSr?.length ? a.contentSr : a.contentEn),
    })),
    image: file,
  });
  console.log(p.slug, file ? "ok" : "bez slike");
}

await writeFile("data/products.json", JSON.stringify(out, null, 2));
await writeFile("data/categories.json", JSON.stringify(categories, null, 2));

const logo = Buffer.from(await (await fetch("https://vecom.rs/vecom-black.png")).arrayBuffer());
await writeFile("public/assets/vecom-logo.png", logo);

console.log(`\ngotovo: ${out.length} proizvoda`);

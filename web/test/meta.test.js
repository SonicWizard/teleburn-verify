// Link-preview metadata (Open Graph and Twitter cards) on every HTML page the
// site serves, and the preview image each one points at.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";

const PUBLIC = new URL("../public/", import.meta.url);
const ORIGIN = "https://teleburn.dev/";

const REQUIRED = [
  "og:type",
  "og:site_name",
  "og:title",
  "og:description",
  "og:url",
  "og:image",
  "og:image:width",
  "og:image:height",
  "og:image:type",
  "og:image:alt",
  "twitter:card",
  "twitter:title",
  "twitter:description",
  "twitter:image",
  "twitter:image:alt",
];

function attrs(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v]),
  );
}

// { "og:title": "...", ... } from <meta property|name=... content=...>, plus
// the canonical link. The pages are ours and Prettier-formatted, so a regex
// over the tags is enough; no HTML parser dependency.
function headMeta(html) {
  const head = html.slice(0, html.indexOf("</head>"));
  const meta = {};
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/g)) {
    const a = attrs(tag);
    const key = a.property ?? a.name;
    if (key) meta[key] = a.content;
  }
  for (const [tag] of head.matchAll(/<link\b[^>]*>/g)) {
    const a = attrs(tag);
    if (a.rel === "canonical") meta.canonical = a.href;
  }
  return meta;
}

// Width and height from a PNG's IHDR chunk.
function pngSize(buf) {
  assert.ok(
    buf.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
    "not a PNG",
  );
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function publicFile(url) {
  assert.ok(url.startsWith(ORIGIN), `${url} is not on ${ORIGIN}`);
  return new URL(url.slice(ORIGIN.length), PUBLIC);
}

const pages = readdirSync(PUBLIC).filter((f) => f.endsWith(".html"));

test("the site has HTML pages to check", () => {
  assert.ok(pages.includes("index.html"));
});

for (const page of pages) {
  const meta = headMeta(readFileSync(new URL(page, PUBLIC), "utf8"));

  test(`${page}: required og:* and twitter:* tags are present`, () => {
    for (const key of REQUIRED) {
      assert.ok(meta[key]?.trim(), `${key} is missing or empty`);
    }
    assert.equal(meta["og:type"], "website");
    assert.equal(meta["twitter:card"], "summary_large_image");
  });

  test(`${page}: URLs are absolute https://teleburn.dev URLs`, () => {
    for (const key of ["og:url", "canonical", "og:image", "twitter:image"]) {
      assert.ok(meta[key]?.startsWith(ORIGIN), `${key}: ${meta[key]}`);
    }
    const path = page === "index.html" ? "" : page;
    assert.equal(meta["og:url"], ORIGIN + path);
    assert.equal(meta.canonical, meta["og:url"]);
  });

  test(`${page}: preview image exists with the declared size`, () => {
    for (const key of ["og:image", "twitter:image"]) {
      const file = publicFile(meta[key]);
      const { width, height } = pngSize(readFileSync(file));
      assert.equal(String(width), meta["og:image:width"], `${key} width`);
      assert.equal(String(height), meta["og:image:height"], `${key} height`);
      assert.ok(statSync(file).size < 300 * 1024, `${key} is over 300 KB`);
    }
    assert.equal(meta["og:image:type"], "image/png");
  });
}

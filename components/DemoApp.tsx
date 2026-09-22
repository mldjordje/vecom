"use client";

import { useEffect } from "react";
import { demoData } from "@/lib/demo/data";

// slike koje se unapred čuvaju u kešu, da demo radi bez interneta posle prvog otvaranja
function offlineAssets() {
  const imgs = [...demoData.products, ...demoData.posts]
    .map((x) => x.image)
    .filter((x): x is string => Boolean(x))
    .map((x) => "/" + x.replace(/^\//, ""));
  return ["/assets/vecom-logo.png", "/assets/demo/kvar.svg", ...imgs];
}

// Ljuska je u React-u, a ekrane za sada crta demo engine (lib/demo/engine.js)
// u #app. Traka sa personama koristi data-go, koje engine hvata delegiranim klikom.
export function DemoApp() {
  useEffect(() => {
    import("@/lib/demo/engine").then(({ mount }) => mount(demoData));

    // service worker samo u produkciji — u dev-u bi keš sakrivao izmene
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then(() => caches.open("vecom-demo-v1"))
        .then((cache) => cache.addAll(offlineAssets()))
        .catch(() => {});
    }
  }, []);

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/vecom-logo.png" alt="Vecom" />
            <span className="demo-badge">
              DEMO<span className="long"> · PREDLOG</span>
            </span>
          </div>
          <nav className="personas" id="personas">
            <button data-go="#/site">Sajt</button>
            <button data-go="#/login">Kupac</button>
            <button data-go="#/admin">Admin</button>
          </nav>
        </div>
      </header>

      <main id="app" />

      <footer className="foot">
        Prototip za sastanak — bez bekenda, svi podaci su lažni osim kataloga aparata i sadržaja sa sajta vecom.rs.
        Nije zvanična Vecom aplikacija.
      </footer>

      <div className="toast" id="toast" />
    </>
  );
}

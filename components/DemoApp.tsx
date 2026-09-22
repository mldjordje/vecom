"use client";

import { useEffect } from "react";
import { demoData } from "@/lib/demo/data";

// Ljuska je u React-u, a ekrane za sada crta demo engine (lib/demo/engine.js)
// u #app. Traka sa personama koristi data-go, koje engine hvata delegiranim klikom.
export function DemoApp() {
  useEffect(() => {
    import("@/lib/demo/engine").then(({ mount }) => mount(demoData));
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
        Prototip za sastanak — bez bekenda, svi podaci su lažni osim kataloga aparata. Javni sajt ostaje
        vecom.rs; sekcije „Sajt” su predlog blokova za ubacivanje. Nije zvanična Vecom aplikacija.
      </footer>

      <div className="toast" id="toast" />
    </>
  );
}

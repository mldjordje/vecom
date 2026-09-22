import type { MetadataRoute } from "next";

// "Dodaj na početni ekran": kupčev nalog se otvara kao aplikacija, bez trake browsera
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Moj Vecom",
    short_name: "Moj Vecom",
    description: "Vaši Vecom aparati, servis, edukacija i potrošni materijal. DEMO.",
    start_url: "/#/login",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F6F2",
    theme_color: "#2E2B26",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512m", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

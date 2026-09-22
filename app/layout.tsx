import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import "./customer.css";
import "./extras.css";

// next/font skida Poppins pri build-u i servira ga sa istog domena,
// pa na sastanku ne zavisi od Google Fonts
const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vecom — prototip aplikacije za kupce i servis",
  description: "Klikabilni demo: sekcije za vecom.rs, kupčev nalog i admin. Nije zvanična Vecom aplikacija.",
  icons: { icon: "/assets/vecom-logo.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sr" className={poppins.variable}>
      <body>{children}</body>
    </html>
  );
}

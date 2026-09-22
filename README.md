# Vecom — klikabilni prototip

Demo za Vecom Beauty System: koncept novog sajta vecom.rs, kupčev nalog (Moj Vecom) i admin.
Bez bekenda, bez baze, bez prave prijave. Katalog aparata, blog objave, iskustva i česta pitanja
su pravi (preuzeti iz njihovog Sanityja, SR/EN/DE); kupci, upiti i tiketi su izmišljeni.

## Pokretanje

Next.js 16 (App Router, TypeScript), bez bekenda. Stanje je u memoriji browsera
(osim stranice Projekat, koja beleške čuva u localStorage).

```bash
npm install
npm run dev
```

Otvara se na http://localhost:4321. Produkcija: `npm run build` pa `npm start`.

**Vercel:** uvesti repo, Framework Preset **Next.js**, ostalo podrazumevano.

**Bez interneta na sastanku:** posle prvog otvaranja Vercel linka sa internetom, service worker
čuva stranicu i sve slike — demo radi i bez mreže (samo produkcija, ne `npm run dev`).

## Struktura

```
app/layout.tsx          html, Poppins (next/font), metadata, PWA meta
app/manifest.ts         manifest za "Dodaj na početni ekran"
app/pwa-icon/[size]     generisane ikone aplikacije; app/apple-icon.tsx za iOS
app/globals.css         paleta i tipografija sa vecom.rs
app/customer.css        kupčev nalog, edukacija, sertifikat, booking, admin novosti
app/extras.css          kviz, kalendar, kupci, pretraga, sadržaj sajta, Projekat, PWA
components/DemoApp.tsx  React ljuska: traka sa personama, #app, toast, service worker
lib/demo/engine.js      svi ekrani, stanje, prevodi i ruter (location.hash)
lib/demo/data.ts        uvoz JSON podataka
data/products.json      54 aparata (naziv i opis SR/EN/DE, specifikacija SR)
data/posts.json         2 prave blog objave (SR/EN, pun tekst)
data/site.json          iskustva kupaca i česta pitanja (SR/EN/DE)
data/protocols.json     6 primera protokola tretmana (SR + DE/EN)
data/demo.json          izmišljen kupac, upiti, tiketi, porudžbine, teren, brojke
public/sw.js            service worker (keš za rad bez interneta, klik na obaveštenje)
public/assets/          slike aparata i objava, logo, demo fotografija kvara
scripts/harvest.mjs     preuzimanje sadržaja sa Sanityja (samo čitanje): npm run harvest
```

Ekrani su HTML stringovi u `lib/demo/engine.js`, montirani iz React ljuske. Za pravu aplikaciju
prebacuju se u React komponente (admin po kosturu iz Vita projekta).

## Persone (traka gore desno)

### Sajt (`#/site`) — koncept novog vecom.rs

Cilj je da sajt vodimo mi, bez Sanity-ja: sve na sajtu se uređuje iz Vecom admina.
Prekidač **SR / EN / DE** je u traci okvira browsera. Beleške za Vecom (gde ide, šta menja) su na srpskom.

| Stranica | Ruta | Napomena |
|---|---|---|
| Nova početna (koncept) | `#/site/home` | istaknuti aparati (★ iz admina), programi, iskustva, novosti |
| Katalog aparata | `#/site/catalog` | filter po programu, pretraga; sakriveni u adminu se ne vide |
| Vodič kroz izbor | `#/site/guide` | 3 pitanja → predlog → upit |
| ROI kalkulator | `#/site/roi` | na EN/DE u evrima |
| Stranica aparata + upit | `#/site/product/<slug>` | upit sa izvorom i jezikom, iskustva, česta pitanja |
| Demo termin | `#/site/demo` | kalendar, termini, `.ics`, stiže u admin → Kalendar i Upiti |
| Servis i status | `#/site/service` | status po broju (probati **482**), prijava bez naloga |
| Ulaz u Moj Vecom | `#/site/portal` | dugme u zaglavlju, sekcija za vlasnike |

### Kupac (`#/login`) — Moj Vecom

Google prijava je vizuelna. Nalog ima svoj prekidač **SR / DE / EN** (nezavisno od sajta).

- Početna: stanje aparata (prstenovi garancije i sonde), brze akcije, servis, aktivnost, kurs, novosti.
- Aparat, prijava kvara sa fotografijom, praćenje servisa, potrošni, protokoli, dokumenta.
- **Edukacija** (`#/app/edu`): kurs od 20 lekcija u 5 modula, **kviz posle svakog modula**,
  **sertifikat sa QR kodom** (`#/app/edu/cert`) i javna provera (`#/verify/<broj>`).
  Za sastanak: „označi sve lekcije i kvizove kao završene”.
- **Aplikacija na telefonu:** „Dodaj na početni ekran”, obaveštenja kad admin promeni status
  servisa, potvrdi porudžbinu ili objavi novost; centar obaveštenja (zvonce).

**Video za kurs:** klipove staviti u `public/video/` i u `COURSE` u `lib/demo/engine.js`
lekciji dodati `video: "/video/01.mp4"`. Lekcija se sama označi kao odgledana kad se klip završi.

### Admin (`#/admin`)

Prijava „Sign in with Google”. Desktop radni prostor (kostur iz Vita admina) ili prikaz na telefonu.
Uloge: Prodaja i Serviser. **Globalna pretraga: Ctrl+K.**

- Pregled, Upiti, **Kalendar**, Servis, Porudžbine, Teren, Brojke
- Kupci: **Kupci i nalozi** (pozivnica pri isporuci), **Edukacija** (polaznici, zastoji, video lekcije)
- Sajt: **Katalog aparata**, **Novosti i blog**, **Iskustva i pitanja** (provera razlika u prevodima)

### Projekat (`#/project`)

Za kraj sastanka: svih 52 funkcija po grupama (sajt, nalog, admin, preuzimanje i tehnika),
uz svaku **Potrebno / Kasnije / Ne treba**, faza i beleška, plus pitanja za klijenta i sledeći koraci.
Čuva se u ovom browseru; izvoz: kopiraj rezime, `.txt`, štampa.

## Redosled na sastanku, 15 min

1. Kupac: početna, prijava kvara sa fotografijom, Edukacija → sertifikat (3)
2. Admin: prebaci na telefon → upit → Pozovi → status; tiket sa fotografijom; teren → pošalji svima (4)
3. Admin desktop: Kupci i nalozi, Katalog → izmena → „Pogledaj na sajtu” (2)
4. Sajt: nova početna → katalog → aparat na DE → upit; demo termin u kalendaru (3)
5. Projekat: prolaz kroz funkcije sa klijentom (3+)

## Granice

- Svuda stoji oznaka DEMO. Ovo je predlog, ne zvanična Vecom aplikacija.
- Nema izmišljenih cena, referenci ni brojki o poslovanju.
- Njihov Sanity se samo čita; sadržaj se koristi isključivo za ovaj demo.
- Prijava Google nalogom je samo izgled — ne otvara OAuth i ne dodiruje tuđe naloge.
- Osvežavanje stranice briše sve uneto u demou (osim beleški na stranici Projekat).

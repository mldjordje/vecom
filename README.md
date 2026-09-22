# Vecom — klikabilni prototip

Demo aplikacije za kupce, servis i admin (`app.vecom.rs` u priči) i sekcija koje se ubacuju
u postojeći sajt vecom.rs. Bez bekenda, bez baze, bez prave prijave. Katalog aparata je pravi
(54 uređaja iz njihovog Sanityja, SR/EN/DE), sve ostalo je lažno.

## Pokretanje

Next.js 16 (App Router, TypeScript), bez bekenda. Stanje je u memoriji browsera.

```bash
npm install
npm run dev
```

Otvara se na http://localhost:4321. Produkcija: `npm run build` pa `npm start`.

**Vercel:** uvesti repo, Framework Preset **Next.js** (prepoznaje sam), ostalo podrazumevano.

Poppins ide preko `next/font` — servira se sa istog domena, ne zavisi od Google Fonts.

## Struktura

```
app/layout.tsx          html, Poppins, metadata (noindex)
app/page.tsx            jedina stranica; ekrani idu preko #hash rute
app/globals.css         paleta i tipografija sa vecom.rs
components/DemoApp.tsx  React ljuska: traka sa personama, #app, toast; montira engine
lib/demo/engine.js      svi ekrani, stanje, prevodi i ruter (location.hash)
lib/demo/data.ts        uvoz JSON podataka za engine
data/products.json      54 aparata iz Sanityja (naziv i opis SR/EN/DE, specifikacija SR)
data/categories.json    8 kategorija
data/demo.json          lažni kupac, upiti, tiketi, porudžbine, teren, brojke
data/protocols.json     6 primera protokola tretmana
data/posts.json         2 prave blog objave iz Sanityja (SR/EN, sa tekstom)
app/customer.css        kupčev nalog, edukacija i sertifikat, booking, admin novosti
public/assets/products/*.webp  slike aparata, skinute lokalno
public/assets/demo/kvar.svg    "fotografija" displeja sa greškom E-04
scripts/harvest.mjs     skidanje kataloga sa Sanityja (samo čitanje)
```

Ekrani su za sada HTML stringovi u `lib/demo/engine.js`, montirani iz React ljuske.
Za pravu aplikaciju prebacuju se u React komponente jedan po jedan (admin po kosturu iz Vita projekta).

Ponovno skidanje kataloga (slike se ne skidaju ponovo ako već postoje):

```bash
npm run harvest
```

## Ekrani

Persona se menja trakom gore desno (Sajt · Kupac · Admin) — to je demo pomoć, ne deo proizvoda.

### Sajt — sekcije za vecom.rs (`#/site`)

Javni sajt ostaje vecom.rs. Ovo su **sekcije koje se ubacuju u njihov postojeći Next.js + Sanity
sajt**, prikazane u okviru browsera sa beleškom gde idu i šta menjaju.

**Jezici:** prekidač SR / EN / DE u traci okvira. Prevodi se sve što vidi posetilac
(naslovi, forme, dugmad, nazivi i opisi aparata iz Sanityja, dani, statusi servisa).
Beleške za Vecom (gde se sekcija ubacuje, oznake NOVA SEKCIJA) ostaju na srpskom.
ROI na EN/DE računa u evrima (Austrija). Upit sa EN/DE stiže u admin sa oznakom jezika.

| Sekcija | Ruta | Ubacuje se na | Stiže u admin |
|---|---|---|---|
| Vodič kroz izbor aparata | `#/site/guide` | Početna, katalog | Upiti (preko stranice aparata) |
| ROI kalkulator | `#/site/roi` | Stranica aparata, /isplativost | Upiti, izvor „Sajt · ROI” |
| Upit sa stranice aparata | `#/site/product/<slug>` | Svih 54 stranica aparata | Upiti, sa aparatom, izvorom i jezikom |
| Zakazivanje demo termina | `#/site/demo` | Kontakt, dugme na stranici aparata | Upiti, termin u belešci |
| Servis i status prijave | `#/site/service` | Nova stranica /servis | Servis, kao novi tiket |
| Ulaz u Moj Vecom | `#/site/portal` | Zaglavlje + sekcija za vlasnike | Kupčev nalog |

Za probu statusa servisa upisati broj **482**.

**Demo termin** (`#/site/demo`): kalendar u stilu Calendly — aparat sa slikom, lokacija,
mesečni kalendar (slobodni / popunjeni dani), termini pre i posle podne, podaci, sažetak
zalepljen na dnu. Potvrda ima „Dodaj u kalendar” (pravi `.ics`) i stiže u admin kao upit.

### Kupac (`#/login`)

Google dugme je vizuelno (600 ms pa ulazak kao Milica Petrović). App ljuska: svetli sidebar
na desktopu, traka sa karticama na telefonu.

- **Početna:** pozdrav i stanje, brze akcije, upozorenje za sondu (jedan klik u korpu),
  kartice aparata sa prstenovima (garancija, sonda), servis sa koracima, aktivnost,
  napredak kursa, Vecom novosti, kontakt osoba.
- **Aparat:** hero sa slikom i prstenovima, tabovi Pregled / Servis / Obuka / Specifikacija.
- **Edukacija** (`#/app/edu`): mini kurs od 20 lekcija u 5 modula (video + tekst + „zapamtite”).
  Napredak se čuva; posle poslednje lekcije otključava se **sertifikat za štampu**
  (`#/app/edu/cert`, A4 landscape). Za sastanak: link „označi sve lekcije kao odgledane”.
- **Novosti:** prave objave sa njihovog bloga (iz Sanityja) i sve što admin objavi za Moj Vecom.
- Servis, prijava kvara, potrošni, protokoli, dokumenta.

**Video za kurs:** kad se snimak iseče na 20 delova, fajlove staviti u `public/video/`
i u `COURSE` u `lib/demo/engine.js` lekciji dodati `video: "/video/01.mp4"`. Lekcija tada
prikazuje pravi plejer i sama se označava kao odgledana kad se klip završi.

### Admin (`#/admin`)

- **Prijava:** samo dugme „Sign in with Google” (vizuelno, 600 ms). U pravoj aplikaciji:
  Google OAuth, pristup samo pozvanim @vecom.rs nalozima.
- **Desktop radni prostor** (laptop, ≥ 960 px): kostur preuzet iz Vita admin demoa —
  tamni sidebar, prekidač uloga, topbar, metrika-kartice, lista + detalj za upite i servis.
- **Prikaz na telefonu:** dugme u sidebaru prebacuje u okvir telefona (traka sa karticama na dnu).
  Na pravom telefonu admin je uvek u mobilnom prikazu.
- **Uloge:** Prodaja (Jelena — pregled, upiti, servis, novosti, porudžbine, teren, brojke) i
  Serviser (Dejan — moj dan sa obilascima, servis, delovi).
- **Novosti i blog** (`#/admin/news`): prave objave iz Sanityja + nacrti; statusi objavljeno /
  zakazano / nacrt, oznake jezika (DE nedostaje i na današnjem sajtu), editor sa SR/EN/DE
  tabovima, naslovnom slikom i pregledom Google rezultata. Kanali: sajt, Moj Vecom, mejl;
  publika: svi kupci ili samo vlasnici određenog aparata. Objava za Moj Vecom odmah se vidi kod kupca.

## Redosled na sastanku, 15 min

1. Kupčev dashboard + Edukacija: lekcija → „označi sve” → sertifikat (2)
2. Prijava kvara — dugme „Uzmi demo fotografiju” pa Pošalji (2)
3. Admin: Sign in with Google → prebaci na telefon → upit → Pozovi → status; tiket #483 sa fotografijom;
   teren → garancije → pošalji svima; kratko vrati na desktop i uloga Serviser (4)
4. Sajt: stranica aparata → prebaci na DE → pošalji upit → „Vidi kako je stiglo adminu”; ROI kalkulator (2)
5. Sajt: demo termin u kalendaru; vodič kroz izbor; status servisa samo pomenuti (2)
6. Pitanja (3)

Protokole, dokumenta i porudžbine samo pomenuti.

## Granice

- Svuda stoji oznaka DEMO. Ovo je predlog, ne zvanična Vecom aplikacija.
- Nema izmišljenih cena, referenci ni brojki o poslovanju.
- Njihov Sanity se samo čita; slike i tekstovi se koriste isključivo za ovaj demo.
- Prijava Google nalogom je samo izgled — ne otvara OAuth i ne dodiruje tuđe naloge.
- Osvežavanje stranice briše sve što je unešeno u demou (stanje je u memoriji).
- Demo ne radi dvoklikom bez interneta — otvara se preko Vercel linka ili `npm run dev`.

# Vecom — klikabilni prototip

Demo aplikacije za kupce, servis i admin (`app.vecom.rs` u priči) i sekcija koje se ubacuju
u postojeći sajt vecom.rs. Bez bekenda, bez baze, bez prave prijave. Katalog aparata je pravi
(54 uređaja iz njihovog Sanityja, SR/EN/DE), sve ostalo je lažno.

## Pokretanje

**Na sastanku:** dvoklik na `index.html`. Radi offline, bez servera i bez interneta
(podaci su u `data/bundle.js`, slike lokalno u `assets/`). Jedino se Poppins font skida
sa Google Fonts — bez interneta pada na sistemski sans, izgled ostaje isti.

**Za razvoj** (ako treba server):

```bash
npx -y serve -l 4321 .
```

## Struktura

```
index.html        ljuska, traka sa personama, DEMO oznaka
styles.css        paleta i tipografija sa vecom.rs
app.js            svi ekrani, stanje, prevodi i ruter (location.hash)
data/products.json    54 aparata iz Sanityja (naziv i opis SR/EN/DE, specifikacija SR)
data/categories.json  8 kategorija
data/demo.json        lažni kupac, upiti, tiketi, porudžbine, teren, brojke
data/protocols.json   6 primera protokola tretmana
data/bundle.js        sva četiri JSON-a spojena u window.VECOM (generisano)
assets/products/*.webp  slike aparata, skinute lokalno
assets/demo/kvar.svg    "fotografija" displeja sa greškom E-04
scripts/harvest.mjs   skidanje kataloga sa Sanityja (samo čitanje)
scripts/bundle.mjs    data/*.json -> data/bundle.js
```

Posle izmene bilo kog JSON-a u `data/`:

```bash
node scripts/bundle.mjs
```

Ponovno skidanje kataloga (slike se ne skidaju ponovo ako već postoje):

```bash
node scripts/harvest.mjs
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

### Kupac (`#/login`)

Google dugme je vizuelno (600 ms pa ulazak kao Milica Petrović): početna sa dva aparata
i stanjem sonde, kartica aparata, prijava kvara sa fotografijom, potrošni materijal,
protokoli, dokumenta.

### Admin (`#/admin`)

- **Prijava:** samo dugme „Sign in with Google” (vizuelno, 600 ms). U pravoj aplikaciji:
  Google OAuth, pristup samo pozvanim @vecom.rs nalozima.
- **Desktop radni prostor** (laptop, ≥ 960 px): kostur preuzet iz Vita admin demoa —
  tamni sidebar, prekidač uloga, topbar, metrika-kartice, lista + detalj za upite i servis.
- **Prikaz na telefonu:** dugme u sidebaru prebacuje u okvir telefona (traka sa karticama na dnu).
  Na pravom telefonu admin je uvek u mobilnom prikazu.
- **Uloge:** Prodaja (Jelena — pregled, upiti, servis, porudžbine, teren, brojke) i
  Serviser (Dejan — moj dan sa obilascima, servis, delovi).

## Redosled na sastanku, 15 min

1. Kupčev dashboard (2)
2. Prijava kvara — dugme „Uzmi demo fotografiju” pa Pošalji (2)
3. Admin: Sign in with Google → prebaci na telefon → upit → Pozovi → status; tiket #483 sa fotografijom;
   teren → garancije → pošalji svima; kratko vrati na desktop i uloga Serviser (4)
4. Sajt: stranica aparata → prebaci na DE → pošalji upit → „Vidi kako je stiglo adminu”; ROI kalkulator (2)
5. Sajt: vodič kroz izbor; demo termin i status servisa samo pomenuti (2)
6. Pitanja (3)

Protokole, dokumenta i porudžbine samo pomenuti.

## Granice

- Svuda stoji oznaka DEMO. Ovo je predlog, ne zvanična Vecom aplikacija.
- Nema izmišljenih cena, referenci ni brojki o poslovanju.
- Njihov Sanity se samo čita; slike i tekstovi se koriste isključivo za ovaj demo.
- Prijava Google nalogom je samo izgled — ne otvara OAuth i ne dodiruje tuđe naloge.
- Osvežavanje stranice briše sve što je unešeno u demou (stanje je u memoriji).

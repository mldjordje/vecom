/* Vecom — klikabilni prototip, demo engine.
   Stanje u jednom objektu, ruter preko location.hash, ekrani kao HTML stringovi.
   Next.js ga montira iz components/DemoApp.tsx; ekrani se odavde mogu
   prebacivati u React komponente jedan po jedan. */

import QRCode from "qrcode";

var mounted = false;

export function mount(DATA) {
  // React StrictMode u dev-u pokrece efekat dva puta; drugi put bi dupliralo listenere
  if (mounted) return;
  mounted = true;

  var app = document.getElementById("app");
  var toastEl = document.getElementById("toast");

  /* ---------- pomocne ---------- */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function money(n) {
    return Math.round(n).toLocaleString("sr-RS") + " din";
  }

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  function dmy(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear() + ".";
  }

  function daysUntil(iso) {
    var ms = new Date(iso + "T00:00:00") - new Date(new Date().toDateString());
    return Math.round(ms / 86400000);
  }

  function danaRec(n) {
    var a = Math.abs(n) % 100, b = Math.abs(n) % 10;
    if (a > 10 && a < 20) return "dana";
    return b === 1 ? "dan" : "dana";
  }

  function meseciRec(n) {
    var a = n % 100, b = n % 10;
    if (a > 10 && a < 20) return "meseci";
    if (b === 1) return "mesec";
    if (b >= 2 && b <= 4) return "meseca";
    return "meseci";
  }

  function product(slug) {
    for (var i = 0; i < DATA.products.length; i++) {
      if (DATA.products[i].slug === slug) return DATA.products[i];
    }
    return null;
  }

  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add("on");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.remove("on"); }, 2600);
  }

  function go(hash) { location.hash = hash; }

  /* ---------- stanje ---------- */

  var S = {
    loggedIn: false,
    tickets: DATA.demo.tickets.slice(),
    inquiries: DATA.demo.inquiries.map(function (q) { return Object.assign({}, q); }),
    orders: DATA.demo.orders.slice(),
    cart: [],
    faultDraft: { slug: "sonata-4xd", type: "Greška na displeju", text: "", photo: null },
    guide: { q1: null, q2: null, q3: null, step: 0 },
    roi: { price: 1200000, perTreatment: 4500, weekly: 12, weeks: 46 },
    protoQuery: "",
    fleetFilter: null,
    devTab: null,
    course: { done: { 1: true, 2: true, 3: true }, quiz: {} },
    posts: initialPosts(),
    newsFilter: "all",
    project: loadProject(),
    pjFilter: "all",
    customers: initialCustomers(),
    custCountry: "all",
    siteCat: "all",
    siteCatQ: "",
    cuLang: "sr",
    notices: DATA.demo.notifications.map(function (n) { return { at: n.at, text: n.text, href: "#/app/news", unread: true }; }),
    bookings: initialBookings(),
    calWeek: 0,
    calLoc: "all",
    catQuery: "",
    catCat: "all",
    catHidden: {},
    catFeatured: { "sonata-4xd": true, "ultralift-hifu": true },
    catEdit: { slug: null, lang: "sr" },
    content: JSON.parse(JSON.stringify(DATA.site)),
    contentLang: "sr",
    newsEdit: { id: null, lang: "sr" },
    lang: "sr",
    adminIn: false,
    adminRole: "prodaja",
    adminView: "desktop",
    site: {
      product: "sonata-4xd",
      sent: null,
      focus: null,
      demo: { loc: "bg", device: "sonata-4xd", month: 0, date: null, slot: null },
      service: { tab: "status", query: "", found: null },
    },
  };

  var TICKET_FLOW = [
    { key: "primljeno", label: "Primljeno" },
    { key: "dijagnostika", label: "Dijagnostika" },
    { key: "deo", label: "Deo poručen" },
    { key: "popravka", label: "U popravci" },
    { key: "reseno", label: "Rešeno" },
  ];

  function flowIndex(key) {
    for (var i = 0; i < TICKET_FLOW.length; i++) if (TICKET_FLOW[i].key === key) return i;
    return 0;
  }

  function flowLabel(key) { return TICKET_FLOW[flowIndex(key)].label; }

  var INQ_FLOW = ["nov", "kontaktiran", "ponuda", "dobijeno", "izgubljeno"];
  var INQ_LABEL = {
    nov: "Nov", kontaktiran: "Kontaktiran", ponuda: "Ponuda poslata",
    dobijeno: "Dobijeno", izgubljeno: "Izgubljeno",
  };

  /* ---------- delovi prikaza ---------- */

  function thumb(p, alt) {
    if (!p || !p.image) return '<div class="thumb"></div>';
    return '<div class="thumb"><img src="' + esc(p.image) + '" alt="' + esc(alt || p.name) + '" loading="lazy"></div>';
  }

  function warrantyPill(inst) {
    var left = daysUntil(inst.warrantyUntil);
    if (left < 0) return '<span class="pill alert"><i class="dot"></i>Garancija istekla ' + dmy(inst.warrantyUntil) + "</span>";
    var cls = left < 60 ? "warn" : "ok";
    return '<span class="pill ' + cls + '"><i class="dot"></i>Garancija do ' + dmy(inst.warrantyUntil) +
      " · ostalo " + left + " " + danaRec(left) + "</span>";
  }

  function probeBlock(inst) {
    var pct = Math.round((inst.probe.used / inst.probe.total) * 100);
    var cls = pct >= 85 ? "alert" : pct >= 70 ? "warn" : "ok";
    return (
      '<div class="row spread small mb"><span>' + esc(inst.probe.name) + "</span><span>" +
      inst.probe.used.toLocaleString("sr-RS") + " / " + inst.probe.total.toLocaleString("sr-RS") + "</span></div>" +
      '<div class="bar"><i class="' + cls + '" style="width:' + pct + '%"></i></div>' +
      '<div class="tiny muted" style="margin-top:6px">Resurs iskorišćen ' + pct + "%" +
      (pct >= 70 ? " — vreme je za rezervnu" : "") + "</div>"
    );
  }

  function chart(rows) {
    var max = rows.reduce(function (m, r) { return Math.max(m, r.value); }, 1);
    return '<div class="chart">' + rows.map(function (r) {
      return '<div class="chart-row"><span class="muted">' + esc(r.label) + "</span>" +
        '<span class="bar"><i style="width:' + Math.round((r.value / max) * 100) + '%"></i></span>' +
        '<span class="v">' + r.value + "</span></div>";
    }).join("") + "</div>";
  }

  function subnav(items, current) {
    return '<nav class="subnav">' + items.map(function (it) {
      return '<a href="' + it.href + '" class="' + (it.href === current ? "on" : "") + '">' + esc(it.label) + "</a>";
    }).join("") + "</nav>";
  }

  /* ---------- jezici za sekcije sajta ----------
     Sadrzaj koji vidi posetilac ide na SR/EN/DE (sajt vecom.rs je trojezican).
     Beleske za Vecom (gde se sekcija ubacuje, oznake NOVA SEKCIJA) ostaju na srpskom. */

  var L = {
    sr: {
      guide_h: "Koji aparat vam treba?",
      guide_sub: "Tri pitanja, pa predlog iz Vecom kataloga od 54 aparata.",
      guide_back: "Nazad",
      guide_result: "Predlog za vas",
      guide_again: "Ponovi",
      guide_sku: "Šifra",
      guide_send: "Pošalji upit",
      guide_noprice: "Cene nisu na sajtu — ponudu šalje Vecom posle upita.",
      q1_t: "Šta najviše radite?",
      q1_epi: "Epilacija", q1_epi_h: "lasersko uklanjanje dlačica",
      q1_body: "Tretmani tela", q1_body_h: "celulit, oblikovanje, mišići",
      q1_face: "Tretmani lica", q1_face_h: "čišćenje, pomlađivanje, pigmentacije",
      q1_combo: "Kombinovano", q1_combo_h: "salon koji radi sve",
      q2_t: "Koliko klijenata nedeljno?",
      q2_a: "Do 20", q2_b: "20 – 50", q2_c: "Preko 50",
      q2_a_s: "do 20 klijenata", q2_b_s: "20–50 klijenata", q2_c_s: "preko 50 klijenata",
      q3_t: "Koliko prostora imate?",
      q3_a: "Do 10 m²", q3_a_h: "jedna kabina", q3_b: "Preko 10 m²", q3_b_h: "više kabina",
      why_portable: "prenosiv, staje u malu kabinu",
      why_volume: "izdržava veliki broj tretmana dnevno",
      why_default: "pokriva ono što ste izabrali",

      roi_h: "Za koliko se aparat isplati?",
      roi_sub: "Unesite svoje brojke. Računica se menja dok kucate.",
      roi_per: "Cena jednog tretmana",
      roi_week: "Tretmana nedeljno",
      roi_weeks: "Radnih nedelja godišnje",
      roi_invest: "Okvirna investicija u aparat",
      roi_range: "Raspon, ne cena Vecom aparata — tačnu cenu dobijate u ponudi.",
      roi_month: "Mesečni prihod od aparata",
      roi_24: "Za 24 meseca",
      roi_payback: "Aparat se isplati za",
      roi_mail: "Mejl",
      roi_mail_ph: "salon@primer.rs",
      roi_send: "Pošalji mi računicu na mejl",
      roi_foot: "Računica ne uključuje potrošni materijal i struju. Služi kao okvir za razgovor.",

      pp_h: "Zanima vas {name}?",
      pp_sub: "Ostavite broj — Vecom vas zove istog radnog dana.",
      f_name: "Ime i prezime", f_co: "Salon / klinika", f_tel: "Telefon", f_city: "Grad",
      ph_name: "Milica Jovanović", ph_co: "Studio M", ph_tel: "+381 6...", ph_city: "Kragujevac",
      pp_want: "Šta vas zanima",
      want_offer: "Ponuda", want_demo: "Demo u showroomu", want_training: "Obuka i protokoli",
      pp_send: "Pošalji upit",
      pp_roi_h: "Za koliko se {name} isplati?",
      pp_roi_sub: "Unesite cenu tretmana i broj klijenata.",
      pp_roi_btn: "Izračunaj",
      pp_own_h: "Već radite na {name}?",
      pp_own_sub: "Protokoli, servis i potrošni materijal u vašem Moj Vecom nalogu.",
      cta_call: "Pozovi", cta_viber: "Viber", cta_inq: "Upit",
      sent_inq_t: "Hvala, javljamo se danas",
      sent_inq_x: "Vecom vas zove istog radnog dana.",

      demo_h: "Probajte aparat pre kupovine",
      demo_sub: "Demo traje oko sat vremena, sa tretmanom na modelu. Bez obaveze.",
      demo_loc: "Lokacija", loc_bg: "Showroom Beograd", loc_nis: "Sedište Niš",
      demo_dev: "Aparat", demo_day: "Dan", demo_slot: "Termin", busy: "zauzeto",
      demo_book: "Zakaži termin", demo_pick: "Izaberite termin",
      demo_at: "u",
      sent_demo_t: "Termin je zakazan",
      sent_demo_x: "Potvrda stiže SMS-om i mejlom, podsetnik dan ranije.",
      ph_demo_name: "Ana Marković",

      svc_h: "Servis Vecom opreme",
      svc_sub: "Jedini ovlašćeni servis za Vecom aparate · garancija 24 meseca",
      svc_tab_status: "Status prijave", svc_tab_new: "Prijavi kvar",
      svc_id: "Broj prijave", svc_id_ph: "npr. 482", svc_tel: "Telefon iz prijave",
      svc_check: "Proveri status",
      svc_nf: "Prijava sa tim brojem nije pronađena.",
      svc_ticket: "Prijava",
      svc_now: "trenutni status",
      svc_last: "Poslednja poruka servisa",
      svc_serial: "Serijski broj aparata", svc_co: "Salon",
      svc_what: "Šta se dešava", svc_what_ph: "Opišite kvar, šifru greške sa displeja...",
      svc_send: "Pošalji prijavu",
      svc_acc: "Imate Moj Vecom nalog? <a href=\"#/login\">Prijava je brža</a> — aparat je već izabran i možete dodati fotografiju.",
      sent_svc_t: "Prijava #{id} je primljena",
      sent_svc_x: "Status pratite ovde po broju prijave ili u Moj Vecom nalogu.",
      ph_svc_co: "Studio Belle", ph_svc_city: "Novi Sad",
      flow_primljeno: "Primljeno", flow_dijagnostika: "Dijagnostika", flow_deo: "Deo poručen",
      flow_popravka: "U popravci", flow_reseno: "Rešeno",

      nav_products: "Proizvodi", nav_treat: "Tretmani", nav_about: "O nama", nav_contact: "Kontakt",
      my_vecom: "Moj Vecom",
      portal_h: "Kupili ste Vecom aparat? Sve je u vašem nalogu.",
      portal_sub: "Nalog dobijate automatski pri isporuci. Prijava jednim tapom, Google nalogom.",
      b1_t: "Garancija i serijski broj", b1_x: "Do kada važi, šta je servisirano, ko je obučen.",
      b2_t: "Prijava kvara sa slikom", b2_x: "Slikate displej, pošaljete, pratite status.",
      b3_t: "Protokoli tretmana", b3_x: "Parametri po problemu i fototipu, uvek pri ruci.",
      b4_t: "Potrošni jednim klikom", b4_x: "Sonda, filter, gel — samo za vaše aparate.",
      google_btn: "Prijavi se Google nalogom",

      days: ["ned", "pon", "uto", "sre", "čet", "pet", "sub"],
    },

    en: {
      guide_h: "Which device do you need?",
      guide_sub: "Three questions, then a recommendation from the Vecom catalogue of 54 devices.",
      guide_back: "Back",
      guide_result: "Our recommendation",
      guide_again: "Start over",
      guide_sku: "Code",
      guide_send: "Send inquiry",
      guide_noprice: "Prices are not listed online — Vecom sends an offer after your inquiry.",
      q1_t: "What do you do most?",
      q1_epi: "Hair removal", q1_epi_h: "laser hair removal",
      q1_body: "Body treatments", q1_body_h: "cellulite, contouring, muscle toning",
      q1_face: "Face treatments", q1_face_h: "cleansing, rejuvenation, pigmentation",
      q1_combo: "A bit of everything", q1_combo_h: "a full-service salon",
      q2_t: "How many clients per week?",
      q2_a: "Up to 20", q2_b: "20 – 50", q2_c: "Over 50",
      q2_a_s: "up to 20 clients", q2_b_s: "20–50 clients", q2_c_s: "over 50 clients",
      q3_t: "How much space do you have?",
      q3_a: "Up to 10 m²", q3_a_h: "one treatment room", q3_b: "Over 10 m²", q3_b_h: "several rooms",
      why_portable: "portable, fits a small room",
      why_volume: "built for a high number of daily treatments",
      why_default: "covers what you selected",

      roi_h: "How fast does the device pay for itself?",
      roi_sub: "Enter your own numbers. The result updates as you type.",
      roi_per: "Price per treatment",
      roi_week: "Treatments per week",
      roi_weeks: "Working weeks per year",
      roi_invest: "Approximate investment",
      roi_range: "A range, not the price of a Vecom device — you get the exact price in the offer.",
      roi_month: "Monthly revenue from the device",
      roi_24: "Over 24 months",
      roi_payback: "Pays for itself in",
      roi_mail: "Email",
      roi_mail_ph: "salon@example.com",
      roi_send: "Email me this calculation",
      roi_foot: "Consumables and electricity are not included. Use it as a starting point for the conversation.",

      pp_h: "Interested in {name}?",
      pp_sub: "Leave your number — Vecom calls you back the same working day.",
      f_name: "Full name", f_co: "Salon / clinic", f_tel: "Phone", f_city: "City",
      ph_name: "Anna Smith", ph_co: "Studio M", ph_tel: "+381 6...", ph_city: "Belgrade",
      pp_want: "I'm interested in",
      want_offer: "An offer", want_demo: "A showroom demo", want_training: "Training and protocols",
      pp_send: "Send inquiry",
      pp_roi_h: "How fast does {name} pay for itself?",
      pp_roi_sub: "Enter your treatment price and number of clients.",
      pp_roi_btn: "Calculate",
      pp_own_h: "Already working with {name}?",
      pp_own_sub: "Protocols, service and consumables in your My Vecom account.",
      cta_call: "Call", cta_viber: "Viber", cta_inq: "Inquiry",
      sent_inq_t: "Thank you, we'll be in touch today",
      sent_inq_x: "Vecom will call you back the same working day.",

      demo_h: "Try the device before you buy",
      demo_sub: "The demo takes about an hour, including a treatment on a model. No obligation.",
      demo_loc: "Location", loc_bg: "Belgrade showroom", loc_nis: "Niš headquarters",
      demo_dev: "Device", demo_day: "Day", demo_slot: "Time", busy: "booked",
      demo_book: "Book the demo", demo_pick: "Pick a time",
      demo_at: "at",
      sent_demo_t: "Your demo is booked",
      sent_demo_x: "Confirmation by SMS and email, with a reminder the day before.",
      ph_demo_name: "Anna Smith",

      svc_h: "Vecom equipment service",
      svc_sub: "The only authorised service for Vecom devices · 24-month warranty",
      svc_tab_status: "Request status", svc_tab_new: "Report a fault",
      svc_id: "Request number", svc_id_ph: "e.g. 482", svc_tel: "Phone from the request",
      svc_check: "Check status",
      svc_nf: "No request found with that number.",
      svc_ticket: "Request",
      svc_now: "current status",
      svc_last: "Latest message from service",
      svc_serial: "Device serial number", svc_co: "Salon",
      svc_what: "What is happening", svc_what_ph: "Describe the fault and any error code on the display...",
      svc_send: "Send request",
      svc_acc: "Have a My Vecom account? <a href=\"#/login\">It's faster there</a> — your device is already selected and you can add a photo.",
      sent_svc_t: "Request #{id} received",
      sent_svc_x: "Track the status here with your request number, or in your My Vecom account.",
      ph_svc_co: "Studio Belle", ph_svc_city: "Novi Sad",
      flow_primljeno: "Received", flow_dijagnostika: "Diagnostics", flow_deo: "Part ordered",
      flow_popravka: "In repair", flow_reseno: "Resolved",

      nav_products: "Products", nav_treat: "Treatments", nav_about: "About", nav_contact: "Contact",
      my_vecom: "My Vecom",
      portal_h: "Bought a Vecom device? Everything is in your account.",
      portal_sub: "You get an account automatically on delivery. Sign in with one tap using Google.",
      b1_t: "Warranty and serial number", b1_x: "How long it's valid, what was serviced, who is trained.",
      b2_t: "Report a fault with a photo", b2_x: "Snap the display, send it, follow the status.",
      b3_t: "Treatment protocols", b3_x: "Settings by concern and skin type, always at hand.",
      b4_t: "Consumables in one click", b4_x: "Probe, filter, gel — only for your devices.",
      google_btn: "Sign in with Google",

      days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    },

    de: {
      guide_h: "Welches Gerät passt zu Ihnen?",
      guide_sub: "Drei Fragen, dann ein Vorschlag aus dem Vecom-Katalog mit 54 Geräten.",
      guide_back: "Zurück",
      guide_result: "Unser Vorschlag",
      guide_again: "Neu starten",
      guide_sku: "Art.-Nr.",
      guide_send: "Anfrage senden",
      guide_noprice: "Preise stehen nicht online — Vecom schickt Ihnen nach der Anfrage ein Angebot.",
      q1_t: "Was machen Sie am häufigsten?",
      q1_epi: "Haarentfernung", q1_epi_h: "Laser-Haarentfernung",
      q1_body: "Körperbehandlungen", q1_body_h: "Cellulite, Konturierung, Muskelaufbau",
      q1_face: "Gesichtsbehandlungen", q1_face_h: "Reinigung, Verjüngung, Pigmentflecken",
      q1_combo: "Von allem etwas", q1_combo_h: "ein Studio mit vollem Angebot",
      q2_t: "Wie viele Kundinnen pro Woche?",
      q2_a: "Bis 20", q2_b: "20 – 50", q2_c: "Über 50",
      q2_a_s: "bis 20 Kundinnen", q2_b_s: "20–50 Kundinnen", q2_c_s: "über 50 Kundinnen",
      q3_t: "Wie viel Platz haben Sie?",
      q3_a: "Bis 10 m²", q3_a_h: "eine Kabine", q3_b: "Über 10 m²", q3_b_h: "mehrere Kabinen",
      why_portable: "mobil, passt in eine kleine Kabine",
      why_volume: "für viele Behandlungen pro Tag ausgelegt",
      why_default: "deckt Ihre Auswahl ab",

      roi_h: "Wann rechnet sich das Gerät?",
      roi_sub: "Geben Sie Ihre eigenen Zahlen ein. Das Ergebnis ändert sich beim Tippen.",
      roi_per: "Preis pro Behandlung",
      roi_week: "Behandlungen pro Woche",
      roi_weeks: "Arbeitswochen pro Jahr",
      roi_invest: "Ungefähre Investition",
      roi_range: "Eine Spanne, kein Vecom-Preis — den genauen Preis erhalten Sie im Angebot.",
      roi_month: "Monatlicher Umsatz mit dem Gerät",
      roi_24: "In 24 Monaten",
      roi_payback: "Amortisiert in",
      roi_mail: "E-Mail",
      roi_mail_ph: "studio@beispiel.at",
      roi_send: "Berechnung per E-Mail senden",
      roi_foot: "Verbrauchsmaterial und Strom sind nicht enthalten. Als Grundlage für das Gespräch gedacht.",

      pp_h: "Interesse an {name}?",
      pp_sub: "Hinterlassen Sie Ihre Nummer — Vecom ruft Sie am selben Werktag zurück.",
      f_name: "Vor- und Nachname", f_co: "Studio / Klinik", f_tel: "Telefon", f_city: "Stadt",
      ph_name: "Anna Huber", ph_co: "Kosmetik Studio Wien", ph_tel: "+43 6...", ph_city: "Wien",
      pp_want: "Ich interessiere mich für",
      want_offer: "Ein Angebot", want_demo: "Eine Vorführung im Showroom", want_training: "Schulung und Protokolle",
      pp_send: "Anfrage senden",
      pp_roi_h: "Wann rechnet sich {name}?",
      pp_roi_sub: "Geben Sie Behandlungspreis und Kundenzahl ein.",
      pp_roi_btn: "Berechnen",
      pp_own_h: "Sie arbeiten bereits mit {name}?",
      pp_own_sub: "Protokolle, Service und Verbrauchsmaterial in Ihrem Mein-Vecom-Konto.",
      cta_call: "Anrufen", cta_viber: "Viber", cta_inq: "Anfrage",
      sent_inq_t: "Danke, wir melden uns noch heute",
      sent_inq_x: "Vecom ruft Sie am selben Werktag zurück.",

      demo_h: "Testen Sie das Gerät vor dem Kauf",
      demo_sub: "Die Vorführung dauert etwa eine Stunde, mit Behandlung an einem Modell. Unverbindlich.",
      demo_loc: "Standort", loc_bg: "Showroom Belgrad", loc_nis: "Zentrale Niš",
      demo_dev: "Gerät", demo_day: "Tag", demo_slot: "Uhrzeit", busy: "belegt",
      demo_book: "Termin buchen", demo_pick: "Uhrzeit wählen",
      demo_at: "um",
      sent_demo_t: "Ihr Termin ist gebucht",
      sent_demo_x: "Bestätigung per SMS und E-Mail, Erinnerung am Vortag.",
      ph_demo_name: "Anna Huber",

      svc_h: "Service für Vecom-Geräte",
      svc_sub: "Der einzige autorisierte Service für Vecom-Geräte · 24 Monate Garantie",
      svc_tab_status: "Status der Meldung", svc_tab_new: "Störung melden",
      svc_id: "Meldungsnummer", svc_id_ph: "z. B. 482", svc_tel: "Telefon aus der Meldung",
      svc_check: "Status prüfen",
      svc_nf: "Keine Meldung mit dieser Nummer gefunden.",
      svc_ticket: "Meldung",
      svc_now: "aktueller Status",
      svc_last: "Letzte Nachricht vom Service",
      svc_serial: "Seriennummer des Geräts", svc_co: "Studio",
      svc_what: "Was passiert", svc_what_ph: "Beschreiben Sie die Störung und den Fehlercode am Display...",
      svc_send: "Meldung senden",
      svc_acc: "Sie haben ein Mein-Vecom-Konto? <a href=\"#/login\">Dort geht es schneller</a> — Ihr Gerät ist schon ausgewählt und Sie können ein Foto anhängen.",
      sent_svc_t: "Meldung #{id} ist eingegangen",
      sent_svc_x: "Den Status sehen Sie hier mit Ihrer Meldungsnummer oder in Ihrem Mein-Vecom-Konto.",
      ph_svc_co: "Beauty Line", ph_svc_city: "Wien",
      flow_primljeno: "Eingegangen", flow_dijagnostika: "Diagnose", flow_deo: "Teil bestellt",
      flow_popravka: "In Reparatur", flow_reseno: "Erledigt",

      nav_products: "Produkte", nav_treat: "Behandlungen", nav_about: "Über uns", nav_contact: "Kontakt",
      my_vecom: "Mein Vecom",
      portal_h: "Sie haben ein Vecom-Gerät gekauft? Alles steht in Ihrem Konto.",
      portal_sub: "Das Konto erhalten Sie automatisch bei der Lieferung. Anmeldung mit einem Tipp über Google.",
      b1_t: "Garantie und Seriennummer", b1_x: "Wie lange sie gilt, was gewartet wurde, wer geschult ist.",
      b2_t: "Störung mit Foto melden", b2_x: "Display fotografieren, senden, Status verfolgen.",
      b3_t: "Behandlungsprotokolle", b3_x: "Einstellungen nach Anliegen und Hauttyp, immer griffbereit.",
      b4_t: "Verbrauchsmaterial mit einem Klick", b4_x: "Sonde, Filter, Gel — nur für Ihre Geräte.",
      google_btn: "Mit Google anmelden",

      days: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
    },
  };

  function t(key, vars) {
    var s = (L[S.lang] && L[S.lang][key]) || L.sr[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }

  function pName(p) { return S.lang === "en" ? p.nameEn || p.name : S.lang === "de" ? p.nameDe || p.name : p.name; }
  function pDesc(p) { return S.lang === "en" ? p.descEn || p.desc : S.lang === "de" ? p.descDe || p.desc : p.desc; }
  function fTitle(f) { return S.lang === "en" ? f.titleEn || f.title : S.lang === "de" ? f.titleDe || f.title : f.title; }
  function dayName(d) { return t("days")[d.getDay()]; }

  // SR racuna u dinarima, EN i DE u evrima (Austrija, izvoz)
  var CUR = {
    sr: { locale: "sr-RS", per: 4500, perStep: 100, price: 1200000, min: 200000, max: 4000000, step: 50000 },
    en: { locale: "en-GB", per: 40, perStep: 5, price: 12000, min: 2000, max: 35000, step: 500 },
    de: { locale: "de-AT", per: 40, perStep: 5, price: 12000, min: 2000, max: 35000, step: 500 },
  };

  function cash(n) {
    var c = CUR[S.lang];
    var num = Math.round(n).toLocaleString(c.locale);
    if (S.lang === "sr") return num + " din";
    if (S.lang === "de") return num + " €";
    return "€" + num;
  }

  function monthsWord(n) {
    if (S.lang === "en") return n === 1 ? "month" : "months";
    if (S.lang === "de") return n === 1 ? "Monat" : "Monate";
    return meseciRec(n);
  }

  function setLang(lang) {
    var euro = function (l) { return l !== "sr"; };
    if (euro(lang) !== euro(S.lang)) {
      S.roi.perTreatment = CUR[lang].per;
      S.roi.price = CUR[lang].price;
    }
    S.lang = lang;
  }

  /* ---------- A1 · vodic kroz izbor ---------- */

  function guideQuestions() {
    return [
      {
        key: "q1", title: t("q1_t"),
        opts: [
          { v: "epilacija", label: t("q1_epi"), hint: t("q1_epi_h") },
          { v: "telo", label: t("q1_body"), hint: t("q1_body_h") },
          { v: "lice", label: t("q1_face"), hint: t("q1_face_h") },
          { v: "kombinovano", label: t("q1_combo"), hint: t("q1_combo_h") },
        ],
      },
      {
        key: "q2", title: t("q2_t"),
        opts: [{ v: "do20", label: t("q2_a") }, { v: "20-50", label: t("q2_b") }, { v: "50+", label: t("q2_c") }],
      },
      {
        key: "q3", title: t("q3_t"),
        opts: [
          { v: "malo", label: t("q3_a"), hint: t("q3_a_h") },
          { v: "veliko", label: t("q3_b"), hint: t("q3_b_h") },
        ],
      },
    ];
  }

  function guideResults() {
    var g = S.guide;
    var cats = { epilacija: ["laser-devices"], telo: ["body-program"], lice: ["face-program"], kombinovano: ["laser-devices", "body-program", "face-program"] };
    var wanted = cats[g.q1] || ["laser-devices"];
    var pool = DATA.products.filter(function (p) { return wanted.indexOf(p.category) >= 0; });

    // portabl aparati za mali prostor, kombo za veliki i vecu frekvenciju
    var portabl = function (p) { return /portabl|prenosni/i.test(p.name); };
    var kombo = function (p) { return /combo|exclusive|fusion|multi/i.test(p.name); };

    var scored = pool.map(function (p) {
      var s = 0;
      if (g.q3 === "malo" && portabl(p)) s += 3;
      if (g.q3 === "veliko" && kombo(p)) s += 2;
      if (g.q2 === "50+" && !portabl(p)) s += 2;
      if (g.q2 === "do20" && portabl(p)) s += 1;
      if (p.features && p.features.length) s += 1;
      if (p.image) s += 1;
      return { p: p, s: s };
    });

    scored.sort(function (a, b) { return b.s - a.s; });
    return scored.slice(0, 3).map(function (x) { return x.p; });
  }

  function guideReason(p) {
    var bits = [];
    if (/portabl|prenosni/i.test(p.name)) bits.push(t("why_portable"));
    if (S.guide.q2 === "50+") bits.push(t("why_volume"));
    if (p.features && p.features[0]) bits.push(fTitle(p.features[0]).toLowerCase());
    if (!bits.length) bits.push(t("why_default"));
    return bits.slice(0, 2).join(" · ");
  }

  function viewGuide() {
    var g = S.guide;
    var Q = guideQuestions();
    var head = "<h1>" + esc(t("guide_h")) + '</h1><p class="muted mb">' + esc(t("guide_sub")) + "</p>";

    if (g.step < 3) {
      var q = Q[g.step];
      return '<div style="max-width:620px;margin:0 auto">' + head +
        '<div class="steps">' + [0, 1, 2].map(function (i) {
          return '<i class="' + (i <= g.step ? "on" : "") + '"></i>';
        }).join("") + "</div>" +
        '<div class="card"><h2 class="mb">' + esc(q.title) + '</h2><div class="stack">' +
        q.opts.map(function (o) {
          return '<button class="opt' + (g[q.key] === o.v ? " on" : "") + '" data-guide="' + esc(q.key) + '" data-val="' + esc(o.v) + '">' +
            "<div>" + esc(o.label) + "</div>" +
            (o.hint ? '<div class="small muted">' + esc(o.hint) + "</div>" : "") + "</button>";
        }).join("") + "</div>" +
        (g.step > 0 ? '<div class="mt"><button class="btn ghost sm" data-guide-back="1">' + esc(t("guide_back")) + "</button></div>" : "") +
        "</div></div>";
    }

    var res = guideResults();
    var q1 = Q[0].opts.filter(function (o) { return o.v === g.q1; })[0];
    return "<div>" + head +
      '<div class="card mb"><div class="row spread wrap"><div><h2>' + esc(t("guide_result")) + "</h2>" +
      '<div class="small muted">' + esc(q1 ? q1.label : "") +
      " · " + esc(g.q2 === "do20" ? t("q2_a_s") : g.q2 === "50+" ? t("q2_c_s") : t("q2_b_s")) +
      " · " + esc(g.q3 === "malo" ? t("q3_a") : t("q3_b")) + "</div></div>" +
      '<button class="btn ghost sm" data-guide-reset="1">' + esc(t("guide_again")) + "</button></div></div>" +
      '<div class="grid3">' + res.map(function (p) {
        return '<div class="card">' + thumb(p, pName(p)) +
          '<h3 style="margin-top:12px">' + esc(pName(p)) + "</h3>" +
          '<div class="tiny muted mb">' + esc(t("guide_sku")) + " " + esc(p.sku) + "</div>" +
          '<p class="small muted">' + esc((pDesc(p) || "").slice(0, 130)) + "</p>" +
          '<div class="pill" style="white-space:normal">' + esc(guideReason(p)) + "</div>" +
          '<div class="mt"><button class="btn block sm" data-inquiry="' + esc(p.slug) + '">' + esc(t("guide_send")) + "</button></div>" +
          "</div>";
      }).join("") + "</div>" +
      '<p class="small muted mt">' + esc(t("guide_noprice")) + "</p>" +
      "</div>";
  }

  /* ---------- A2 · ROI kalkulator ---------- */

  function viewRoi() {
    var r = S.roi, c = CUR[S.lang];
    var monthly = (r.perTreatment * r.weekly * r.weeks) / 12;
    var y2 = r.perTreatment * r.weekly * r.weeks * 2;
    var payback = monthly > 0 ? r.price / monthly : 0;
    var months = Math.ceil(payback);

    return "<div>" +
      "<h1>" + esc(t("roi_h")) + "</h1>" +
      '<p class="muted mb">' + esc(t("roi_sub")) + "</p>" +
      '<div class="grid2">' +
      '<div class="card">' +
      '<div class="field"><label>' + esc(t("roi_per")) + " (" + (S.lang === "sr" ? "din" : "€") + ')</label><input id="roi-t" type="number" min="0" step="' + c.perStep + '" value="' + r.perTreatment + '"></div>' +
      '<div class="field"><label>' + esc(t("roi_week")) + '</label><input id="roi-w" type="number" min="0" value="' + r.weekly + '"></div>' +
      '<div class="field"><label>' + esc(t("roi_weeks")) + '</label><input id="roi-y" type="number" min="1" max="52" value="' + r.weeks + '"></div>' +
      '<div class="field"><label>' + esc(t("roi_invest")) + ": <b>" + cash(r.price) + "</b></label>" +
      '<input id="roi-p" type="range" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '" value="' + r.price + '">' +
      '<div class="tiny muted">' + esc(t("roi_range")) + "</div></div>" +
      "</div>" +
      '<div class="card">' +
      '<div class="mb"><div class="small muted">' + esc(t("roi_month")) + '</div><div class="big-num">' + cash(monthly) + "</div></div>" +
      '<div class="sep"></div>' +
      '<div class="mb"><div class="small muted">' + esc(t("roi_24")) + '</div><div class="big-num">' + cash(y2) + "</div></div>" +
      '<div class="sep"></div>' +
      '<div class="mb"><div class="small muted">' + esc(t("roi_payback")) + '</div><div class="big-num">' +
      (payback > 0 && isFinite(payback) ? months + " " + monthsWord(months) : "—") + "</div></div>" +
      '<div class="field mt"><label>' + esc(t("roi_mail")) + '</label><input id="roi-mail" placeholder="' + esc(t("roi_mail_ph")) + '"></div>' +
      '<button class="btn block" data-roi-send="1">' + esc(t("roi_send")) + "</button>" +
      "</div></div>" +
      '<p class="small muted mt">' + esc(t("roi_foot")) + "</p>" +
      "</div>";
  }

  /* ---------- A · sekcije za vecom.rs ----------
     Javni sajt ostaje njihov (Next.js + Sanity). Ovo su blokovi koji se ubacuju u njega.
     Svaka forma upisuje u isto stanje koje admin vidi. */

  var SECTIONS = [
    {
      key: "home", title: "Nova početna (koncept)", href: "#/site/home",
      url: "vecom.rs/{lang}",
      why: "Ako sajt vodimo mi: početna koja vodi do kataloga, vodiča i demo termina — sadržaj iz admina.",
      where: ["Početna strana vecom.rs"],
      does: ["Istaknuti aparati iz admina (★)", "Programi, iskustva i novosti na jednom mestu", "SR / EN / DE"],
      lands: "Posetilac ide na katalog, vodič ili demo termin",
    },
    {
      key: "catalog", title: "Katalog aparata", href: "#/site/catalog",
      url: "vecom.rs/{lang}/proizvodi",
      why: "54 aparata sa filterom po programu i pretragom po nazivu i šifri.",
      where: ["Stranica /proizvodi"],
      does: ["Pretraga po nazivu i šifri", "Filter po programu", "Sakriveni aparati se ne prikazuju"],
      lands: "Stranica aparata sa upitom",
    },
    {
      key: "guide", title: "Vodič kroz izbor aparata", href: "#/site/guide",
      url: "vecom.rs/{lang}/izbor-aparata",
      why: "54 aparata, kupac ne ume da bira. Tri pitanja i dobije 2–3 predloga.",
      where: ["Početna — ispod hero sekcije", "Katalog — iznad liste aparata"],
      does: ["Filtrira pravi katalog po kategoriji", "Predlog vodi na stranicu aparata sa već popunjenim upitom"],
      lands: "Admin → Upiti, izvor „Sajt · stranica aparata”",
    },
    {
      key: "roi", title: "ROI kalkulator", href: "#/site/roi",
      url: "vecom.rs/{lang}/isplativost",
      why: "Salon kupuje kad vidi za koliko meseci se aparat vraća.",
      where: ["Stranica svakog aparata — ispod opisa", "Posebna stranica /isplativost"],
      does: ["Računa uživo dok posetilac kuca", "Na EN/DE računa u evrima", "„Pošalji na mejl” ostavlja kontakt"],
      lands: "Admin → Upiti, izvor „Sajt · ROI”",
    },
    {
      key: "product", title: "Upit sa stranice aparata", href: "#/site/product/sonata-4xd",
      url: "vecom.rs/{lang}/proizvodi/",
      why: "Upit bez traženja kontakt stranice — aparat i kampanja se znaju unapred.",
      where: ["Svih 54 stranica aparata", "Na telefonu: lepljiva traka Pozovi · Viber · Upit"],
      does: ["Aparat je već popunjen", "Uz upit ide izvor (Google Ads, Instagram…) iz GA4/UTM i jezik", "Vlasnicima aparata nudi ulaz u Moj Vecom"],
      lands: "Admin → Upiti, sa aparatom, izvorom i jezikom",
    },
    {
      key: "demo", title: "Zakazivanje demo termina", href: "#/site/demo",
      url: "vecom.rs/{lang}/showroom",
      why: "Demo u showroomu je najjači korak do prodaje — neka ga zakažu sami.",
      where: ["Kontakt stranica", "Stranica aparata — dugme „Zakaži demo”"],
      does: ["Izbor lokacije, aparata, dana i termina", "Potvrda i podsetnik SMS-om dan ranije"],
      lands: "Admin → Upiti, sa terminom u belešci",
    },
    {
      key: "service", title: "Servis i status prijave", href: "#/site/service",
      url: "vecom.rs/{lang}/servis",
      why: "Manje poziva „dokle je stigao moj aparat” — status se vidi sam.",
      where: ["Nova stranica /servis", "Link u futeru i u garantnom listu"],
      does: ["Status prijave po broju tiketa", "Prijava kvara i bez naloga, po serijskom broju"],
      lands: "Admin → Servis, kao novi tiket",
    },
    {
      key: "portal", title: "Ulaz u Moj Vecom", href: "#/site/portal",
      url: "vecom.rs/{lang}",
      why: "Vlasnik aparata sa sajta u jednom tapu ulazi u svoj nalog.",
      where: ["Zaglavlje sajta — dugme „Moj Vecom”", "Sekcija za vlasnike na početnoj"],
      does: ["Vodi na app.vecom.rs", "Prijava Google nalogom"],
      lands: "Kupčev nalog (app.vecom.rs)",
    },
  ];

  function sectionMeta(key) {
    return SECTIONS.filter(function (s) { return s.key === key; })[0];
  }

  // prodajni aparati (bez lezajeva, stolica i polica) za forme na sajtu
  function sellableProducts() {
    return DATA.products.filter(function (p) {
      return ["laser-devices", "body-program", "face-program"].indexOf(p.category) >= 0;
    });
  }

  function addInquiry(o) {
    var id = 100 + S.inquiries.length + Math.floor(Math.random() * 900);
    S.inquiries.unshift({
      id: id,
      name: o.name || "Posetilac sajta",
      device: o.device || "—",
      city: o.city || "—",
      type: o.type || "salon",
      source: o.source + (S.lang !== "sr" ? " · " + S.lang.toUpperCase() : ""),
      at: "upravo sada",
      status: "nov",
      phone: o.phone || "—",
      note: o.note || "",
      history: [],
      fresh: true,
    });
    return id;
  }

  function val(id, fallback) {
    var el = document.getElementById(id);
    var v = el && el.value ? el.value.trim() : "";
    return v || fallback || "";
  }

  function sentBlock(title, text, adminHref) {
    return '<div class="card center">' +
      '<div class="pill ok" style="margin-bottom:12px"><i class="dot"></i>OK</div>' +
      "<h2>" + esc(title) + "</h2>" +
      '<p class="muted small">' + esc(text) + "</p>" +
      '<div class="row wrap" style="justify-content:center">' +
      '<a class="btn" href="' + adminHref + '">Vidi kako je stiglo adminu</a>' +
      '<button class="btn ghost" data-site-reset="1">Ponovo</button></div>' +
      "</div>";
  }

  function siteNav(current) {
    return subnav([{ href: "#/site", label: "Sve sekcije" }].concat(SECTIONS.map(function (s) {
      return { href: s.href, label: s.title };
    })), current);
  }

  function langSwitch() {
    return '<span class="lang">' + ["sr", "en", "de"].map(function (l) {
      return '<button class="' + (S.lang === l ? "on" : "") + '" data-lang="' + l + '">' + l.toUpperCase() + "</button>";
    }).join("") + "</span>";
  }

  function siteShell(key, inner, extraAside, urlTail) {
    var m = sectionMeta(key);
    return '<div class="wrap">' +
      siteNav(m.href) +
      '<div class="site-layout">' +
      '<div class="browser"><div class="browser-bar"><i></i><i></i><i></i>' +
      "<span>" + esc(m.url.replace("{lang}", S.lang) + (urlTail || "")) + "</span>" + langSwitch() + "</div>" +
      '<div class="browser-body" lang="' + S.lang + '">' + inner + "</div></div>" +
      '<aside class="site-notes card">' +
      '<div class="eyebrow">Sekcija za vecom.rs</div>' +
      "<h3>" + esc(m.title) + "</h3>" +
      '<p class="small muted">' + esc(m.why) + "</p>" +
      '<div class="sep"></div><div class="tiny muted">Ubacuje se na</div><ul class="notes">' +
      m.where.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul>" +
      '<div class="tiny muted">Šta radi</div><ul class="notes">' +
      m.does.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul>" +
      '<div class="tiny muted">Gde stiže</div><p class="small">' + esc(m.lands) + "</p>" +
      (extraAside || "") +
      '<div class="sep"></div><p class="tiny muted">Jezik sajta menja se gore desno u okviru (SR / EN / DE). U novom sajtu: Next.js komponenta koju vodimo mi; tekstovi i prevodi se uređuju u Vecom adminu → Sadržaj sajta, bez posebnog CMS-a.</p>' +
      "</aside></div></div>";
  }

  function viewSiteIndex() {
    return '<div class="wrap">' + siteNav("#/site") +
      '<div class="mb"><div class="eyebrow">Sajt vecom.rs</div>' +
      "<h1>Sekcije koje se ubacuju u postojeći sajt</h1>" +
      '<p class="muted" style="max-width:640px">Blokovi koji posetioca pretvaraju u upit, termin ili prijavu servisa — na srpskom, engleskom i nemačkom. Sve stiže u isti admin, iz kog se uređuje i sam sajt: aparati, novosti, iskustva i česta pitanja.</p></div>' +
      '<div class="grid3">' + SECTIONS.map(function (s, i) {
        return '<a class="card sec-card" href="' + s.href + '">' +
          '<div class="tiny muted">0' + (i + 1) + "</div>" +
          "<h3>" + esc(s.title) + "</h3>" +
          '<p class="small muted">' + esc(s.why) + "</p>" +
          '<div class="tiny muted">Stiže u: ' + esc(s.lands) + "</div></a>";
      }).join("") + "</div></div>";
  }

  /* stranica aparata: postojeci sadrzaj + nove sekcije */

  function viewSiteProduct(slug) {
    var p = product(slug) || product("sonata-4xd");
    S.site.product = p.slug;
    var sent = S.site.sent && S.site.sent.key === "product" ? S.site.sent : null;
    var nm = pName(p);

    var inner =
      (S.catHidden[p.slug] ? '<div class="cu-alert soft" style="margin-bottom:12px">' + ico("alert", 16) + '<div class="small">Aparat je sakriven u katalogu — ovo je pregled, posetioci ga ne vide.</div></div>' : "") +
      '<div class="old-tag">sadržaj stranice · uređuje se u adminu → Katalog aparata</div>' +
      '<div class="grid2 pp-top">' + thumb(p, nm) +
      "<div><h1>" + esc(nm) + "</h1>" +
      '<div class="tiny muted mb">' + esc(t("guide_sku")) + " " + esc(p.sku) + "</div>" +
      '<p class="small muted">' + esc(pDesc(p)) + "</p>" +
      (p.features && p.features.length
        ? '<ul class="notes">' + p.features.slice(0, 3).map(function (f) {
            return "<li>" + esc(fTitle(f)) + "</li>";
          }).join("") + "</ul>"
        : "") +
      "</div></div>" +

      '<div class="new-block" id="pp-form"><span class="new-tag">NOVA SEKCIJA · upit</span>' +
      (sent
        ? sentBlock(t("sent_inq_t"), t("sent_inq_x"), "#/admin/inquiry/" + sent.id)
        : "<h2>" + esc(t("pp_h", { name: nm })) + "</h2>" +
          '<p class="small muted mb">' + esc(t("pp_sub")) + "</p>" +
          '<div class="grid2">' +
          '<div class="field"><label>' + esc(t("f_name")) + '</label><input id="pp-name" placeholder="' + esc(t("ph_name")) + '"></div>' +
          '<div class="field"><label>' + esc(t("f_co")) + '</label><input id="pp-co" placeholder="' + esc(t("ph_co")) + '"></div>' +
          '<div class="field"><label>' + esc(t("f_tel")) + '</label><input id="pp-tel" placeholder="' + esc(t("ph_tel")) + '"></div>' +
          '<div class="field"><label>' + esc(t("f_city")) + '</label><input id="pp-city" placeholder="' + esc(t("ph_city")) + '"></div>' +
          "</div>" +
          '<div class="field"><label>' + esc(t("pp_want")) + '</label><select id="pp-want">' +
          ["want_offer", "want_demo", "want_training"].map(function (k) {
            return '<option value="' + esc(L.sr[k]) + '">' + esc(t(k)) + "</option>";
          }).join("") + "</select></div>" +
          '<button class="btn block" data-site-send="product">' + esc(t("pp_send")) + "</button>" +
          '<div class="tiny muted mt">Uz upit automatski ide (ne vidi posetilac): aparat ' + esc(p.name) + " · jezik " + S.lang.toUpperCase() + " · izvor Google Ads · kampanja „Epilacija — Srbija”</div>") +
      "</div>" +

      '<div class="new-block"><span class="new-tag">NOVA SEKCIJA · isplativost</span>' +
      '<div class="row spread wrap"><div><h3>' + esc(t("pp_roi_h", { name: nm })) + "</h3>" +
      '<div class="small muted">' + esc(t("pp_roi_sub")) + "</div></div>" +
      '<a class="btn ghost" href="#/site/roi">' + esc(t("pp_roi_btn")) + "</a></div></div>" +

      '<div class="new-block"><span class="new-tag">NOVA SEKCIJA · vlasnici</span>' +
      '<div class="row spread wrap"><div><h3>' + esc(t("pp_own_h", { name: nm })) + "</h3>" +
      '<div class="small muted">' + esc(t("pp_own_sub")) + "</div></div>" +
      '<a class="btn ghost" href="#/login">' + esc(t("my_vecom")) + "</a></div></div>" +

      siteTestimonials() + siteFaq() +
      '<div class="sticky-cta"><a href="tel:+381637719787">' + esc(t("cta_call")) + "</a>" +
      '<a href="viber://chat?number=%2B381692296005">' + esc(t("cta_viber")) + "</a>" +
      '<a href="#" data-site-scroll="pp-form">' + esc(t("cta_inq")) + "</a></div>";

    var aside =
      '<div class="sep"></div><div class="tiny muted">Probaj na drugom aparatu</div>' +
      '<div class="field" style="margin-top:6px"><select id="pp-switch">' +
      sellableProducts().map(function (x) {
        return '<option value="' + esc(x.slug) + '"' + (x.slug === p.slug ? " selected" : "") + ">" + esc(x.name) + "</option>";
      }).join("") + "</select></div>";

    return siteShell("product", inner, aside, p.slug);
  }

  function siteTestimonials() {
    var list = S.content.testimonials.filter(function (x) { return !x.hidden && x.message[S.lang]; });
    if (!list.length) return "";
    return '<div class="new-block"><span class="new-tag">NOVA SEKCIJA · iskustva</span>' +
      "<h3>" + esc(t("tst_h")) + '</h3><div class="grid2 mt">' + list.map(function (x) {
        return '<figure class="tst">' + stars(x.stars) + "<blockquote>" + esc(x.message[S.lang].replace(/^["“]|["”]$/g, "")) + "</blockquote>" +
          "<figcaption>" + esc(x.author) + "</figcaption></figure>";
      }).join("") + "</div></div>";
  }

  function siteFaq() {
    var list = S.content.faq.filter(function (f) { return f.q[S.lang] && f.a[S.lang]; });
    if (!list.length) return "";
    return '<div class="new-block"><span class="new-tag">NOVA SEKCIJA · česta pitanja</span>' +
      "<h3>" + esc(t("faq_h")) + '</h3><div class="mt">' + list.map(function (f) {
        return '<details class="cu-spec"><summary>' + esc(f.q[S.lang]) + '</summary><div class="small muted">' + esc(f.a[S.lang]) + "</div></details>";
      }).join("") + "</div></div>";
  }

  /* ---------- A · nova početna i katalog (koncept novog sajta) ----------
     Cilj je da sajt vodimo mi: početna i katalog čitaju isti sadržaj koji se
     uređuje u adminu (istaknuti aparati, sakriveni, iskustva, novosti). */

  var SITE2_TEXT = {
    sr: {
      h_title: "Profesionalni aparati za salone, klinike i spa — sa servisom i edukacijom.",
      h_sub: "Laserski i estetski aparati iz Niša, od 1992. Uz svaki aparat: obuka sa sertifikatom, protokoli i jedini ovlašćeni servis.",
      h_find: "Pronađi aparat", h_demo: "Zakaži demo",
      trust_1: "od 1992.", trust_2: "aparata u katalogu", trust_3: "meseci garancije", trust_4: "Srbija · Crna Gora · S. Makedonija · Austrija",
      cats_h: "Katalog po programima", cats_all: "Ceo katalog", devices_n: "aparata",
      feat_h: "Izdvajamo", feat_more: "Detalji",
      guide_band_h: "Ne znate koji aparat vam treba?", guide_band_x: "Tri pitanja i dobijate predlog iz 54 aparata.", guide_band_btn: "Pokreni vodič",
      news_h: "Novosti i saveti", owners_h: "Već imate Vecom aparat?", owners_x: "Servis, protokoli, edukacija i potrošni materijal — u vašem Moj Vecom nalogu.",
      foot_addr: "Trg kralja Aleksandra 2/4, Niš · Showroom Beograd",
      cat_h: "Katalog aparata", cat_sub: "{n} aparata · filtrirajte po programu ili potražite po nazivu i šifri.",
      cat_search: "Pretraga: Sonata, HIFU, 9100...", cat_all: "Svi", cat_none: "Nema aparata za ovu pretragu.", featured: "Izdvojeno",
    },
    en: {
      h_title: "Professional devices for salons, clinics and spas — with service and training.",
      h_sub: "Laser and aesthetic devices from Niš, since 1992. Every device comes with certified training, protocols and the only authorised service.",
      h_find: "Find a device", h_demo: "Book a demo",
      trust_1: "since 1992", trust_2: "devices in the catalogue", trust_3: "months warranty", trust_4: "Serbia · Montenegro · N. Macedonia · Austria",
      cats_h: "Catalogue by programme", cats_all: "Full catalogue", devices_n: "devices",
      feat_h: "Featured", feat_more: "Details",
      guide_band_h: "Not sure which device you need?", guide_band_x: "Three questions and you get a recommendation from 54 devices.", guide_band_btn: "Start the guide",
      news_h: "News and tips", owners_h: "Already own a Vecom device?", owners_x: "Service, protocols, training and supplies — in your My Vecom account.",
      foot_addr: "Trg kralja Aleksandra 2/4, Niš · Belgrade showroom",
      cat_h: "Device catalogue", cat_sub: "{n} devices · filter by programme or search by name and code.",
      cat_search: "Search: Sonata, HIFU, 9100...", cat_all: "All", cat_none: "No devices for this search.", featured: "Featured",
    },
    de: {
      h_title: "Professionelle Geräte für Studios, Kliniken und Spas — mit Service und Schulung.",
      h_sub: "Laser- und Ästhetikgeräte aus Niš, seit 1992. Zu jedem Gerät: Schulung mit Zertifikat, Protokolle und der einzige autorisierte Service.",
      h_find: "Gerät finden", h_demo: "Vorführung buchen",
      trust_1: "seit 1992", trust_2: "Geräte im Katalog", trust_3: "Monate Garantie", trust_4: "Serbien · Montenegro · N. Mazedonien · Österreich",
      cats_h: "Katalog nach Programmen", cats_all: "Gesamter Katalog", devices_n: "Geräte",
      feat_h: "Empfohlen", feat_more: "Details",
      guide_band_h: "Unsicher, welches Gerät passt?", guide_band_x: "Drei Fragen und Sie erhalten einen Vorschlag aus 54 Geräten.", guide_band_btn: "Ratgeber starten",
      news_h: "Neuigkeiten und Tipps", owners_h: "Sie haben bereits ein Vecom-Gerät?", owners_x: "Service, Protokolle, Schulung und Verbrauchsmaterial — in Ihrem Mein-Vecom-Konto.",
      foot_addr: "Trg kralja Aleksandra 2/4, Niš · Showroom Belgrad",
      cat_h: "Gerätekatalog", cat_sub: "{n} Geräte · nach Programm filtern oder nach Name und Nummer suchen.",
      cat_search: "Suche: Sonata, HIFU, 9100...", cat_all: "Alle", cat_none: "Keine Geräte für diese Suche.", featured: "Empfohlen",
    },
  };
  Object.keys(SITE2_TEXT).forEach(function (l) { Object.assign(L[l], SITE2_TEXT[l]); });

  var CAT_TX = {
    "laser-devices": { en: "Laser devices", de: "Lasergeräte" },
    "body-program": { en: "Body programme", de: "Körperprogramm" },
    "face-program": { en: "Face programme", de: "Gesichtsprogramm" },
    loungers: { en: "Treatment beds", de: "Behandlungsliegen" },
    chairs: { en: "Chairs", de: "Stühle" },
    shelves: { en: "Stands and trolleys", de: "Ständer und Wagen" },
    devices: { en: "Devices", de: "Geräte" },
    "wellness-equipment": { en: "Wellness equipment", de: "Wellness-Ausstattung" },
  };

  function siteCatName(slug) {
    return S.lang !== "sr" && CAT_TX[slug] ? CAT_TX[slug][S.lang] : catName(slug);
  }

  function visibleProducts() {
    return DATA.products.filter(function (p) { return !S.catHidden[p.slug]; });
  }

  function productTile(p) {
    return '<a class="sp-tile" href="#/site/product/' + esc(p.slug) + '">' +
      '<span class="sp-img">' + (p.image ? '<img src="' + esc(p.image) + '" alt="' + esc(pName(p)) + '" loading="lazy">' : "") +
      (S.catFeatured[p.slug] ? '<i class="sp-flag">' + esc(t("featured")) + "</i>" : "") + "</span>" +
      '<span class="tiny muted">' + esc(siteCatName(p.category)) + " · " + esc(p.sku) + "</span>" +
      '<b>' + esc(pName(p)) + "</b>" +
      '<span class="small muted sp-desc">' + esc(pDesc(p) || "") + "</span></a>";
  }

  function viewSiteHome() {
    var vis = visibleProducts();
    var featured = vis.filter(function (p) { return S.catFeatured[p.slug]; });
    if (featured.length < 3) featured = featured.concat(vis.filter(function (p) { return !S.catFeatured[p.slug] && p.category === "laser-devices"; }).slice(0, 3 - featured.length));
    var heroP = featured[0] || vis[0];
    var mainCats = ["laser-devices", "body-program", "face-program"];
    var otherCats = DATA.categories.map(function (c) { return c.slug; }).filter(function (s) {
      return mainCats.indexOf(s) < 0 && vis.some(function (p) { return p.category === s; });
    });
    var posts = S.posts.filter(function (p) { return p.status === "objavljeno" && p.channels.site; }).slice(0, 3);
    var tst = S.content.testimonials.filter(function (x) { return !x.hidden && x.message[S.lang]; });
    var postTitle = function (p) { return p.title[S.lang] || p.title.en || p.title.sr; };

    var catCard = function (slug, big) {
      var n = vis.filter(function (p) { return p.category === slug; }).length;
      var img = (vis.filter(function (p) { return p.category === slug && p.image; })[0] || {}).image;
      return '<a class="sh-cat' + (big ? " big" : "") + '" href="#/site/catalog" data-cat-go="' + slug + '">' +
        (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : "") +
        "<span><b>" + esc(siteCatName(slug)) + '</b><i>' + n + " " + esc(t("devices_n")) + "</i></span></a>";
    };

    var inner =
      '<div class="new-tag-inline">KONCEPT NOVE POČETNE · sadržaj iz Vecom admina</div>' +
      '<section class="sh-hero"><div><h1>' + esc(t("h_title")) + "</h1>" +
      '<p class="muted">' + esc(t("h_sub")) + "</p>" +
      '<div class="row wrap" style="gap:8px"><a class="btn" href="#/site/guide">' + esc(t("h_find")) + '</a><a class="btn ghost" href="#/site/demo">' + esc(t("h_demo")) + "</a></div></div>" +
      (heroP && heroP.image ? '<a class="sh-hero-img" href="#/site/product/' + esc(heroP.slug) + '"><img src="' + esc(heroP.image) + '" alt="' + esc(pName(heroP)) + '"><span>' + esc(pName(heroP)) + "</span></a>" : "") +
      "</section>" +
      '<div class="sh-trust"><span><b>1992</b>' + esc(t("trust_1")) + "</span><span><b>" + DATA.products.length + "</b>" + esc(t("trust_2")) + "</span><span><b>24</b>" + esc(t("trust_3")) + "</span><span>" + esc(t("trust_4")) + "</span></div>" +

      '<div class="row spread sh-h"><h2>' + esc(t("cats_h")) + '</h2><a class="panel-link" href="#/site/catalog">' + esc(t("cats_all")) + ico("chev", 14) + "</a></div>" +
      '<div class="sh-cats">' + mainCats.map(function (s) { return catCard(s, true); }).join("") + "</div>" +
      '<div class="sh-cats small-cats">' + otherCats.map(function (s) { return catCard(s, false); }).join("") + "</div>" +

      '<div class="row spread sh-h"><h2>' + esc(t("feat_h")) + "</h2></div>" +
      '<div class="sp-grid">' + featured.slice(0, 3).map(productTile).join("") + "</div>" +

      '<section class="sh-band"><div><h3>' + esc(t("guide_band_h")) + '</h3><p class="small">' + esc(t("guide_band_x")) + "</p></div>" +
      '<a class="btn" href="#/site/guide">' + esc(t("guide_band_btn")) + "</a></section>" +

      (tst.length ? '<div class="row spread sh-h"><h2>' + esc(t("tst_h")) + '</h2></div><div class="grid2">' + tst.map(function (x) {
        return '<figure class="tst">' + stars(x.stars) + "<blockquote>" + esc(x.message[S.lang].replace(/^["“]|["”]$/g, "")) + "</blockquote><figcaption>" + esc(x.author) + "</figcaption></figure>";
      }).join("") + "</div>" : "") +

      (posts.length ? '<div class="row spread sh-h"><h2>' + esc(t("news_h")) + '</h2></div><div class="sh-news">' + posts.map(function (p) {
        return '<div class="sh-post">' + (p.image ? '<img src="' + esc(p.image) + '" alt="" loading="lazy">' : "") +
          '<span class="tiny muted">' + dmy(p.date) + "</span><b>" + esc(postTitle(p)) + "</b></div>";
      }).join("") + "</div>" : "") +

      '<section class="sh-owners"><div><h3>' + esc(t("owners_h")) + '</h3><p class="small muted">' + esc(t("owners_x")) + "</p></div>" +
      '<a class="btn ghost" href="#/login">' + esc(t("my_vecom")) + "</a></section>" +

      '<footer class="sh-foot"><img src="/assets/vecom-logo.png" alt="Vecom"><span>' + esc(t("foot_addr")) + "</span>" +
      '<span>+381 63 7719 787 · +381 69 229 6005 · info@vecom.rs</span></footer>';

    return siteShell("home", inner);
  }

  function viewSiteCatalog() {
    var q = S.siteCatQ.toLowerCase().trim();
    var vis = visibleProducts();
    var cats = DATA.categories.filter(function (c) { return vis.some(function (p) { return p.category === c.slug; }); });
    var list = vis.filter(function (p) {
      return (S.siteCat === "all" || p.category === S.siteCat) &&
        (!q || (pName(p) + " " + p.name + " " + p.sku).toLowerCase().indexOf(q) >= 0);
    });

    var inner =
      '<div class="new-tag-inline">NOVA STRANICA · katalog iz Vecom admina</div>' +
      "<h1>" + esc(t("cat_h")) + '</h1><p class="small muted">' + esc(t("cat_sub", { n: vis.length })) + "</p>" +
      '<div class="field mt" style="margin-bottom:10px"><input id="sc-q" placeholder="' + esc(t("cat_search")) + '" value="' + esc(S.siteCatQ) + '"></div>' +
      '<div class="row wrap" style="gap:6px"><button class="chip-f' + (S.siteCat === "all" ? " on" : "") + '" data-site-cat="all">' + esc(t("cat_all")) + " <b>" + vis.length + "</b></button>" +
      cats.map(function (c) {
        var n = vis.filter(function (p) { return p.category === c.slug; }).length;
        return '<button class="chip-f' + (S.siteCat === c.slug ? " on" : "") + '" data-site-cat="' + c.slug + '">' + esc(siteCatName(c.slug)) + " <b>" + n + "</b></button>";
      }).join("") + "</div>" +
      (list.length ? '<div class="sp-grid mt">' + list.map(productTile).join("") + "</div>" : '<p class="small muted mt">' + esc(t("cat_none")) + "</p>");

    var aside = '<div class="sep"></div><p class="tiny muted">Sakrij aparat u adminu → Katalog aparata i nestaje odavde; ★ „Istaknut na početnoj” ga stavlja na početnu.</p>';
    return siteShell("catalog", inner, aside);
  }

  /* demo termin — kalendar u stilu Calendly: aparat → lokacija → dan i vreme → podaci */

  var BK_TEXT = {
    sr: {
      bk_dur: "60 minuta", bk_where2: "Beograd ili Niš", bk_free_note: "Bez obaveze",
      bk_s1: "Koji aparat želite da probate?", bk_other: "Drugi aparat…",
      bk_s2: "Gde vam odgovara?", bk_addr_nis: "Trg kralja Aleksandra 2/4", bk_addr_bg: "adresa stiže uz potvrdu",
      bk_s3: "Izaberite dan i vreme", bk_pick_day: "Izaberite dan u kalendaru — slobodni dani su podebljani.",
      bk_full: "popunjeno", bk_morning: "Pre podne", bk_afternoon: "Posle podne", bk_free: "slobodno",
      bk_s4: "Vaši podaci", f_email: "Mejl (nije obavezno)", ph_email: "salon@primer.rs",
      bk_sum_empty: "Izaberite dan i vreme", bk_confirm: "Potvrdi termin",
      bk_ics: "Dodaj u kalendar", bk_change: "Promeni termin",
      bk_l_when: "Kada", bk_l_where: "Gde", bk_l_dev: "Aparat", bk_l_dur: "Trajanje",
      bk_need: "Upišite ime i telefon",
    },
    en: {
      bk_dur: "60 minutes", bk_where2: "Belgrade or Niš", bk_free_note: "No obligation",
      bk_s1: "Which device would you like to try?", bk_other: "Another device…",
      bk_s2: "Where suits you?", bk_addr_nis: "Trg kralja Aleksandra 2/4", bk_addr_bg: "address sent with confirmation",
      bk_s3: "Pick a day and time", bk_pick_day: "Pick a day in the calendar — available days are in bold.",
      bk_full: "full", bk_morning: "Morning", bk_afternoon: "Afternoon", bk_free: "free",
      bk_s4: "Your details", f_email: "Email (optional)", ph_email: "salon@example.com",
      bk_sum_empty: "Pick a day and time", bk_confirm: "Confirm booking",
      bk_ics: "Add to calendar", bk_change: "Change booking",
      bk_l_when: "When", bk_l_where: "Where", bk_l_dev: "Device", bk_l_dur: "Duration",
      bk_need: "Please enter your name and phone",
    },
    de: {
      bk_dur: "60 Minuten", bk_where2: "Belgrad oder Niš", bk_free_note: "Unverbindlich",
      bk_s1: "Welches Gerät möchten Sie testen?", bk_other: "Anderes Gerät…",
      bk_s2: "Wo passt es Ihnen?", bk_addr_nis: "Trg kralja Aleksandra 2/4", bk_addr_bg: "Adresse kommt mit der Bestätigung",
      bk_s3: "Tag und Uhrzeit wählen", bk_pick_day: "Wählen Sie einen Tag — freie Tage sind fett markiert.",
      bk_full: "ausgebucht", bk_morning: "Vormittag", bk_afternoon: "Nachmittag", bk_free: "frei",
      bk_s4: "Ihre Angaben", f_email: "E-Mail (optional)", ph_email: "studio@beispiel.at",
      bk_sum_empty: "Tag und Uhrzeit wählen", bk_confirm: "Termin bestätigen",
      bk_ics: "Zum Kalender hinzufügen", bk_change: "Termin ändern",
      bk_l_when: "Wann", bk_l_where: "Wo", bk_l_dev: "Gerät", bk_l_dur: "Dauer",
      bk_need: "Bitte Name und Telefon angeben",
    },
  };
  Object.keys(BK_TEXT).forEach(function (l) { Object.assign(L[l], BK_TEXT[l]); });
  Object.assign(L.sr, { tst_h: "Iskustva kupaca", faq_h: "Česta pitanja" });
  Object.assign(L.en, { tst_h: "What our clients say", faq_h: "Frequently asked questions" });
  Object.assign(L.de, { tst_h: "Erfahrungen unserer Kunden", faq_h: "Häufige Fragen" });

  var LOCS = [
    { key: "bg", sr: "Showroom Beograd", addr: "bk_addr_bg" },
    { key: "nis", sr: "Sedište Niš", addr: "bk_addr_nis" },
  ];
  var SLOTS_AM = ["09:30", "10:30", "11:30"];
  var SLOTS_PM = ["13:00", "14:30", "16:00"];
  var BK_POPULAR = ["sonata-4xd", "ultralift-hifu", "ems-tesla-20", "body-sculpture-2"];
  var DATE_LOCALE = { sr: "sr-Latn-RS", en: "en-GB", de: "de-AT" };

  function isoDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function fromIso(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }

  // raspolozivost je izmisljena ali stabilna: isti dan uvek ima iste slobodne termine
  function dayState(d) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var limit = new Date(today); limit.setDate(limit.getDate() + 60);
    if (d <= today || d > limit || d.getDay() === 0 || d.getDay() === 6) return "off";
    if ((d.getDate() * 7) % 11 === 0) return "full";
    return "free";
  }

  function slotTaken(d, slot) {
    var i = SLOTS_AM.concat(SLOTS_PM).indexOf(slot);
    return (d.getDate() + i * 3) % 5 === 0;
  }

  function freeSlots(d) {
    return SLOTS_AM.concat(SLOTS_PM).filter(function (s) { return !slotTaken(d, s); }).length;
  }

  function niceDate(d) {
    return d.toLocaleDateString(DATE_LOCALE[S.lang], { weekday: "long", day: "numeric", month: "long" });
  }

  function bkCalendar(st) {
    var base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + st.month);
    var title = base.toLocaleDateString(DATE_LOCALE[S.lang], { month: "long", year: "numeric" });
    var days = t("days"); // ned..sub
    var head = [1, 2, 3, 4, 5, 6, 0].map(function (i) { return "<span>" + esc(days[i]) + "</span>"; }).join("");
    var first = (base.getDay() + 6) % 7; // ponedeljak = 0
    var n = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    var cells = "";
    for (var e = 0; e < first; e++) cells += '<span class="bk-d empty"></span>';
    for (var dnum = 1; dnum <= n; dnum++) {
      var d = new Date(base.getFullYear(), base.getMonth(), dnum);
      var state = dayState(d), iso = isoDate(d);
      var sel = st.date === iso;
      cells += state === "free"
        ? '<button class="bk-d free' + (sel ? " sel" : "") + '" data-bk-date="' + iso + '" title="' + freeSlots(d) + " " + esc(t("bk_free")) + '">' + dnum + "<i></i></button>"
        : '<span class="bk-d ' + state + '"' + (state === "full" ? ' title="' + esc(t("bk_full")) + '"' : "") + ">" + dnum + "</span>";
    }
    return '<div class="bk-cal">' +
      '<div class="bk-cal-h"><button class="bk-nav" data-bk-month="-1"' + (st.month <= 0 ? " disabled" : "") + ' aria-label="prev">' + ico("chevLeft", 16) + "</button>" +
      '<b>' + esc(title.charAt(0).toUpperCase() + title.slice(1)) + "</b>" +
      '<button class="bk-nav" data-bk-month="1"' + (st.month >= 1 ? " disabled" : "") + ' aria-label="next">' + ico("chev", 16) + "</button></div>" +
      '<div class="bk-wd">' + head + "</div>" +
      '<div class="bk-grid">' + cells + "</div></div>";
  }

  function bkSlots(st) {
    if (!st.date) return '<div class="bk-slots empty"><div class="small muted">' + esc(t("bk_pick_day")) + "</div></div>";
    var d = fromIso(st.date);
    var group = function (label, list) {
      return '<div class="tiny muted" style="margin:10px 0 6px">' + esc(label) + '</div><div class="bk-sl">' + list.map(function (s) {
        var taken = slotTaken(d, s);
        return '<button class="bk-slot' + (st.slot === s ? " sel" : "") + '"' + (taken ? " disabled" : "") + ' data-bk-slot="' + s + '">' + s + "</button>";
      }).join("") + "</div>";
    };
    return '<div class="bk-slots"><div class="small"><b>' + esc(niceDate(d)) + "</b></div>" +
      '<div class="tiny muted">' + freeSlots(d) + " " + esc(t("bk_free")) + "</div>" +
      group(t("bk_morning"), SLOTS_AM) + group(t("bk_afternoon"), SLOTS_PM) + "</div>";
  }

  function stepHead(n, label, done) {
    return '<div class="bk-step"><span class="bk-num' + (done ? " done" : "") + '">' + (done ? ico("check", 13) : n) + "</span><h3>" + esc(label) + "</h3></div>";
  }

  function viewSiteDemo() {
    var st = S.site.demo;
    var sent = S.site.sent && S.site.sent.key === "demo" ? S.site.sent : null;
    var dev = product(st.device);
    var loc = LOCS.filter(function (l) { return l.key === st.loc; })[0];

    if (sent) {
      var d = fromIso(sent.date);
      var inner =
        '<div class="new-block"><span class="new-tag">NOVA SEKCIJA · demo termin</span><div class="bk-done">' +
        '<div class="bk-check">' + ico("check", 30) + "</div>" +
        "<h2>" + esc(t("sent_demo_t")) + "</h2>" +
        '<p class="small muted">' + esc(t("sent_demo_x")) + "</p>" +
        '<div class="bk-ticket">' + (dev && dev.image ? '<img src="' + esc(dev.image) + '" alt="">' : "") +
        '<div class="kv grow">' +
        '<span class="k">' + esc(t("bk_l_dev")) + '</span><span class="v">' + esc(pName(dev)) + "</span>" +
        '<span class="k">' + esc(t("bk_l_when")) + '</span><span class="v">' + esc(niceDate(d)) + ", " + sent.slot + "</span>" +
        '<span class="k">' + esc(t("bk_l_where")) + '</span><span class="v">' + esc(t("loc_" + loc.key)) + "</span>" +
        '<span class="k">' + esc(t("bk_l_dur")) + '</span><span class="v">' + esc(t("bk_dur")) + "</span>" +
        "</div></div>" +
        '<div class="row wrap" style="justify-content:center;gap:8px">' +
        '<button class="btn" data-bk-ics="1">' + ico("calendar", 16) + " " + esc(t("bk_ics")) + "</button>" +
        '<button class="btn ghost" data-site-reset="1">' + esc(t("bk_change")) + "</button></div>" +
        '<div class="mt"><a class="small" href="#/admin/inquiry/' + sent.id + '">Vidi kako je stiglo adminu ›</a></div>' +
        "</div></div>";
      return siteShell("demo", inner);
    }

    var others = sellableProducts().filter(function (p) { return BK_POPULAR.indexOf(p.slug) < 0; });
    var ready = st.date && st.slot;
    var summary = ready
      ? "<b>" + esc(niceDate(fromIso(st.date))) + ", " + st.slot + "</b><span>" + esc(pName(dev)) + " · " + esc(t("loc_" + loc.key)) + "</span>"
      : "<span>" + esc(t("bk_sum_empty")) + "</span>";

    var html =
      '<div class="new-block"><span class="new-tag">NOVA SEKCIJA · demo termin</span><div class="bk">' +
      '<div class="bk-head"><h2>' + esc(t("demo_h")) + "</h2>" +
      '<p class="small muted">' + esc(t("demo_sub")) + "</p>" +
      '<div class="bk-facts"><span>' + ico("clock", 15) + esc(t("bk_dur")) + "</span><span>" + ico("pin", 15) + esc(t("bk_where2")) + "</span><span>" + ico("check", 15) + esc(t("bk_free_note")) + "</span></div></div>" +

      stepHead(1, t("bk_s1"), true) +
      '<div class="bk-devs">' + BK_POPULAR.map(function (slug) {
        var p = product(slug);
        return '<button class="bk-dev' + (st.device === slug ? " sel" : "") + '" data-bk-dev="' + slug + '">' +
          (p.image ? '<img src="' + esc(p.image) + '" alt="">' : "") + "<span>" + esc(pName(p)) + "</span></button>";
      }).join("") + "</div>" +
      '<div class="field" style="margin-top:8px"><select id="bk-dev-more"><option value="">' + esc(t("bk_other")) + "</option>" +
      others.map(function (p) {
        return '<option value="' + esc(p.slug) + '"' + (st.device === p.slug ? " selected" : "") + ">" + esc(pName(p)) + "</option>";
      }).join("") + "</select></div>" +

      stepHead(2, t("bk_s2"), true) +
      '<div class="bk-locs">' + LOCS.map(function (l) {
        return '<button class="bk-loc' + (st.loc === l.key ? " sel" : "") + '" data-bk-loc="' + l.key + '">' + ico("pin", 18) +
          '<span class="grow"><span class="small">' + esc(t("loc_" + l.key)) + '</span><span class="tiny muted">' + esc(t(l.addr)) + "</span></span></button>";
      }).join("") + "</div>" +

      stepHead(3, t("bk_s3"), !!ready) +
      '<div class="bk-when">' + bkCalendar(st) + bkSlots(st) + "</div>" +

      stepHead(4, t("bk_s4"), false) +
      '<div class="grid2">' +
      '<div class="field"><label>' + esc(t("f_name")) + '</label><input id="dm-name" placeholder="' + esc(t("ph_demo_name")) + '" value="' + esc(st.name || "") + '"></div>' +
      '<div class="field"><label>' + esc(t("f_tel")) + '</label><input id="dm-tel" placeholder="' + esc(t("ph_tel")) + '" value="' + esc(st.tel || "") + '"></div>' +
      "</div>" +
      '<div class="field"><label>' + esc(t("f_email")) + '</label><input id="dm-mail" placeholder="' + esc(t("ph_email")) + '" value="' + esc(st.mail || "") + '"></div>' +

      '<div class="bk-bar"><div class="bk-sum">' + summary + "</div>" +
      '<button class="btn" data-bk-book="1"' + (ready ? "" : " disabled") + ">" + esc(t("bk_confirm")) + "</button></div>" +
      "</div></div>";
    return siteShell("demo", html);
  }

  // cuva unete podatke kad se ekran ponovo iscrta (izbor dana, termina...)
  function keepBookingInputs() {
    var st = S.site.demo;
    if (document.getElementById("dm-name")) {
      st.name = val("dm-name");
      st.tel = val("dm-tel");
      st.mail = val("dm-mail");
    }
  }

  function downloadIcs() {
    var sent = S.site.sent;
    var dev = product(S.site.demo.device) || {};
    var loc = LOCS.filter(function (l) { return l.key === S.site.demo.loc; })[0];
    var start = sent.date.replace(/-/g, "") + "T" + sent.slot.replace(":", "") + "00";
    var h = Number(sent.slot.split(":")[0]) + 1;
    var end = sent.date.replace(/-/g, "") + "T" + pad(h) + sent.slot.split(":")[1] + "00";
    var ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Vecom demo//SR", "BEGIN:VEVENT",
      "UID:vecom-demo-" + sent.id + "@vecom.rs",
      "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z",
      "DTSTART:" + start, "DTEND:" + end,
      "SUMMARY:Vecom demo — " + pName(dev),
      "LOCATION:" + t("loc_" + loc.key),
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    a.download = "vecom-demo.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* servis i status */

  function siteTimeline(tk) {
    var cur = flowIndex(tk.status);
    return '<div class="timeline">' + TICKET_FLOW.map(function (st, i) {
      var cls = i < cur ? "done" : i === cur ? "now" : "";
      return '<div class="tl-step ' + cls + '"><div class="tl-mark"><i></i><span></span></div>' +
        '<div class="tl-body"><div class="small">' + esc(t("flow_" + st.key)) + "</div>" +
        (i === cur ? '<div class="tiny muted">' + esc(t("svc_now")) + "</div>" : "") + "</div></div>";
    }).join("") + "</div>";
  }

  function viewSiteService() {
    var sv = S.site.service;
    var sent = S.site.sent && S.site.sent.key === "service" ? S.site.sent : null;

    var tabs = '<div class="row mb">' +
      [["status", t("svc_tab_status")], ["new", t("svc_tab_new")]].map(function (x) {
        return '<button class="opt chip' + (sv.tab === x[0] ? " on" : "") + '" data-svc-tab="' + x[0] + '">' + esc(x[1]) + "</button>";
      }).join("") + "</div>";

    var body;
    if (sv.tab === "status") {
      var tk = sv.found ? ticketById(sv.found) : null;
      var lastVecom = tk ? tk.messages.filter(function (m) { return m.from === "vecom"; }).slice(-1)[0] : null;
      body =
        '<div class="grid2">' +
        '<div class="field"><label>' + esc(t("svc_id")) + '</label><input id="sv-id" placeholder="' + esc(t("svc_id_ph")) + '" value="' + esc(sv.query) + '"></div>' +
        '<div class="field"><label>' + esc(t("svc_tel")) + '</label><input id="sv-tel" placeholder="' + esc(t("ph_tel")) + '"></div>' +
        "</div>" +
        '<button class="btn" data-svc-check="1">' + esc(t("svc_check")) + "</button>" +
        (sv.query && !tk ? '<p class="small mt" style="color:var(--alert)">' + esc(t("svc_nf")) + "</p>" : "") +
        (tk
          ? '<div class="card mt"><div class="row spread mb"><h3>' + esc(t("svc_ticket")) + " #" + tk.id + "</h3>" +
            '<span class="pill"><i class="dot"></i>' + esc(t("flow_" + tk.status)) + "</span></div>" +
            '<div class="small muted mb">' + esc(pName(product(tk.slug) || { name: tk.slug })) +
            (S.lang === "sr" ? " · " + esc(tk.issue) : "") + "</div>" +
            siteTimeline(tk) +
            // poruke servisa su na srpskom, pa ih prikazujemo samo na SR verziji
            (lastVecom && S.lang === "sr" ? '<div class="msg vecom"><div class="tiny muted">' + esc(t("svc_last")) + '</div><div class="small">' + esc(lastVecom.text) + "</div></div>" : "") +
            "</div>"
          : "");
    } else if (sent) {
      body = sentBlock(t("sent_svc_t", { id: sent.id }), t("sent_svc_x"), "#/admin/ticket/" + sent.id);
    } else {
      body =
        '<div class="grid2">' +
        '<div class="field"><label>' + esc(t("svc_serial")) + '</label><input id="sv-serial" placeholder="VEC-9100-2024-113"></div>' +
        '<div class="field"><label>' + esc(t("svc_co")) + '</label><input id="sv-co" placeholder="' + esc(t("ph_svc_co")) + '"></div>' +
        '<div class="field"><label>' + esc(t("f_city")) + '</label><input id="sv-city" placeholder="' + esc(t("ph_svc_city")) + '"></div>' +
        '<div class="field"><label>' + esc(t("f_tel")) + '</label><input id="sv-phone" placeholder="' + esc(t("ph_tel")) + '"></div>' +
        "</div>" +
        '<div class="field"><label>' + esc(t("svc_what")) + '</label><textarea id="sv-text" placeholder="' + esc(t("svc_what_ph")) + '"></textarea></div>' +
        '<button class="btn block" data-svc-send="1">' + esc(t("svc_send")) + "</button>" +
        '<p class="tiny muted center mt">' + t("svc_acc") + "</p>";
    }

    var inner = '<div class="new-block"><span class="new-tag">NOVA STRANICA · servis</span>' +
      "<h2>" + esc(t("svc_h")) + "</h2>" +
      '<p class="small muted mb">' + esc(t("svc_sub")) + "</p>" +
      tabs + body + "</div>";

    var aside = '<div class="sep"></div><p class="tiny muted">Za probu statusa upišite broj <b>482</b>.</p>';
    return siteShell("service", inner, aside);
  }

  /* ulaz u Moj Vecom */

  function viewSitePortal() {
    var inner =
      '<div class="nav-mock"><img src="assets/vecom-logo.png" alt="Vecom">' +
      '<span class="nav-links"><span>' + esc(t("nav_products")) + "</span><span>" + esc(t("nav_treat")) + "</span><span>" +
      esc(t("nav_about")) + "</span><span>" + esc(t("nav_contact")) + "</span></span>" +
      '<a class="btn sm new-inline" href="#/login">' + esc(t("my_vecom")) + "</a></div>" +
      '<div class="old-tag" style="margin-top:8px">postojeće zaglavlje · novo je samo dugme „' + esc(t("my_vecom")) + "”</div>" +

      '<div class="new-block"><span class="new-tag">NOVA SEKCIJA · za vlasnike aparata</span>' +
      "<h2>" + esc(t("portal_h")) + "</h2>" +
      '<p class="small muted mb">' + esc(t("portal_sub")) + "</p>" +
      '<div class="grid2">' +
      ["b1", "b2", "b3", "b4"].map(function (k) {
        return '<div class="card card-tight"><div class="small">' + esc(t(k + "_t")) + '</div><div class="tiny muted">' + esc(t(k + "_x")) + "</div></div>";
      }).join("") + "</div>" +
      '<div class="mt" style="max-width:340px"><a class="google-btn" href="#/login" style="text-decoration:none">' + googleG() +
      "<span>" + esc(t("google_btn")) + "</span></a></div>" +
      "</div>";
    return siteShell("portal", inner);
  }

  /* ---------- B · jezik kupčevog naloga: SR / DE / EN ----------
     Nalog je nezavisan od jezika sajta (S.lang): salon iz Austrije radi na nemačkom.
     Tekst iz podataka (delovi, dokumenta, istorija servisa) prevodi tx();
     poruke u tiketima ostaju onako kako su ih ljudi napisali. */

  var CU_T = {
    sr: {
      nav_home: "Početna", nav_devices: "Moji aparati", nav_edu: "Edukacija", nav_service: "Servis", nav_parts: "Potrošni",
      nav_protocols: "Protokoli", nav_docs: "Dokumenta", nav_news: "Novosti", nav_more: "Više", nav_notices: "Obaveštenja",
      login_h: "Vecom nalog", login_sub: "Vaši aparati, garancije, servis i protokoli na jednom mestu.",
      login_google: "Prijavi se Google nalogom", or: "ili", email: "Mejl", password: "Lozinka", login_pw: "Prijava lozinkom",
      login_noacc: "Nemate nalog? Nalog dobijate automatski pri isporuci aparata.",
      login_demo: "U prototipu je prijava samo vizuelna — ne otvara pravi Google nalog.", login_wait: "Prijavljivanje…",
      support: "Vecom podrška", call: "Pozovi", logout: "Odjava", mail: "Mejl", report_fault: "Prijavi kvar",
      d: "d", ring_expired: "istekla", ring_warranty: "garancija", ring_probe: "sonda", ring_handpiece: "ručica",
      st_service: "Servis u toku · #{id}", st_nowarranty: "Radi · van garancije", st_ok: "Radi normalno", code: "šifra",
      reported: "prijavljeno", vecom_service: "Vecom servis", you: "Vi",
      act_delivered: "Isporučen i pušten u rad: {d}", act_trained: "Obuka završena: {n} · {d}",
      act_ticket: "Prijavljen kvar #{id}: {i}", act_order: "Porudžbina #{id} isporučena",
      for_owners: "za vlasnike {d}",
      hello_morning: "Dobro jutro", hello_day: "Dobar dan", hello_evening: "Dobro veče",
      q_fault_s: "sa fotografijom", q_parts_s: "sonda, filter, gel", q_proto_s: "parametri tretmana", q_call: "Pozovi Vecom",
      home_sum: "{n} aparata u radu · otvorenih servisa: {s} · sonda na Sonati je na {p}%.",
      probe_h: "Sonda na Sonati 4XD je na {p}% resursa", probe_x: "Poručite rezervnu na vreme — isporuka traje 3–5 radnih dana.",
      probe_btn: "Poruči sondu", all_devices: "Svi aparati", svc_open: "U toku", svc_ok: "Sve radi", all_services: "Svi servisi",
      svc_none: "Nema otvorenih prijava. Ako nešto ne radi, prijava traje minut.", history: "Istorija", activity: "Aktivnost",
      from_vecom: "Od Vecoma", all: "Sve", your_contact: "Vaš kontakt u Vecomu", sales_support: "Prodaja i podrška",
      devices_note: "Svaki aparat koji kupite od Vecoma automatski se pojavljuje ovde, sa garancijom, obukom i dokumentima.",
      not_found: "Nije pronađeno.", tab_overview: "Pregled", tab_training: "Obuka", tab_spec: "Specifikacija",
      svc_history: "Istorija servisa", closed: "zatvoreno", trained_h: "Obučeni za rad na aparatu", cert_issued: "Sertifikat izdat {d}",
      certificate: "Sertifikat", newcolleague_h: "Nova koleginica u salonu?", newcolleague_x: "Zakažite obuku — sertifikat stiže ovde.",
      training_sent: "Zahtev za obuku poslat Vecomu", book_training: "Zakaži obuku",
      spec_sr_only: "Tehnička specifikacija je za sada samo na srpskom.", spec_none: "Specifikacija nije dostupna.",
      data: "Podaci", serial: "Serijski broj", delivered: "Isporučeno", warranty_until: "Garancija do", quick_actions: "Brze akcije",
      order_parts: "Poruči potrošni", warranty_exp: "Garancija je istekla {d}",
      contract_x: "Servisni ugovor pokriva redovan servis i prioritet u redu.", contract_sent: "Zahtev za servisni ugovor poslat Vecomu", offer: "Ponuda",
      all_news: "Sve novosti", de_fallback: "", more_devices: "Garancija, sonda, servis, obuka",
      more_protocols: "Parametri po problemu i fototipu", more_docs: "Uputstva, sertifikati, garantni list",
      more_news: "Novi protokoli i saveti od Vecoma", more_notices: "Servis, porudžbine, nove objave",
      no_tickets: "Nema prijava.", tickets_note: "Status se menja čim servis nešto uradi — obaveštenje stiže i na mejl.",
      pwa_installed: "Moj Vecom je dodat na početni ekran",
      pwa_x: "Dodajte nalog na početni ekran — otvara se kao aplikacija, jednim tapom, bez browsera.",
      pwa_install: "Instaliraj aplikaciju", pwa_ios: "U Safariju: Podeli → Dodaj na početni ekran.",
      pwa_menu: "U meniju browsera: Instaliraj aplikaciju / Dodaj na početni ekran.", pwa_on: "Obaveštenja uključena",
      pwa_blocked: "Obaveštenja su blokirana u podešavanjima browsera.",
      pwa_ios_notif: "Na iPhone-u obaveštenja rade kad se aplikacija doda na početni ekran.", pwa_enable: "Uključi obaveštenja",
      pwa_eyebrow: "Aplikacija", pwa_h: "Moj Vecom na telefonu",
      pwa_notif_x: "Javimo vam kad servis promeni status, kad stigne porudžbina ili novi protokol.",
      just_now: "upravo sada", no_notices: "Nema obaveštenja.",
      lessons_short: "lekcija", course_done: "Kurs završen — sertifikat je spreman.", next_lesson: "Sledeća: {n}. {t}",
      continue: "Nastavi", start_course: "Počni kurs", all_lessons: "Sve lekcije", online_course: "online kurs",
      edu_intro: "{l} lekcija u {m} modula · video + tekst · sertifikat na kraju. Gledajte kad stignete, napredak se čuva.",
      edu_progress: "{n} od {l} lekcija · {p}% · kvizovi {q}/{qt}", get_cert: "Preuzmi sertifikat", continue_lesson: "Nastavi: lekcija {n}",
      video_sr: "", cert_unlocked: "Sertifikat otključan", cert_locked_x: "Sertifikat se otključava posle svih lekcija i kvizova",
      cert_teaser: "Na ime polaznika, sa brojem sertifikata, spreman za štampu", module: "Modul",
      demo_all: "označi sve lekcije i kvizove kao završene — da se na sastanku odmah pokaže sertifikat",
      play: "Pusti lekciju", lesson: "Lekcija", clip: "Klip {n}/{t} · {d} min · video se snima", next_lesson_btn: "Sledeća lekcija",
      module_quiz: "Kviz modula {n}", finish_lesson: "Završi lekciju", all_modules: "Svi moduli", watched: "Odgledano",
      remember: "Zapamtite", lesson_n: "{n}. lekcija", lessons: "Lekcije",
      quiz_row: "Kviz modula · 3 pitanja", quiz_passed_n: "Položen · {s}/3", quiz_ready: "Spreman", quiz_locked_row: "Otključava se posle lekcija",
      quiz_locked: "Kviz je zaključan", quiz_locked_x: "Prvo odgledajte sve lekcije modula {n}.", back_course: "Nazad na kurs", quiz: "Kviz",
      quiz_h: "Kviz — 3 pitanja", quiz_x: "Za prolaz su potrebna 2 tačna odgovora. Možete ponavljati koliko god treba.",
      correct: "Tačno.", wrong: "Netačno.", quiz_pass: "Položeno — {s} od 3 tačno", quiz_fail: "Nije položeno — {s} od 3 tačno",
      quiz_next_open: "Sledeći modul je otključan.", quiz_all_done: "Svi moduli su gotovi.", quiz_retry_x: "Pogledajte objašnjenja i pokušajte ponovo.",
      continue_course: "Nastavi kurs", retry_quiz: "Ponovi kviz", check_answers: "Proveri odgovore",
      verify_ok: "Sertifikat je važeći", v_number: "Broj", v_student: "Polaznik", v_salon: "Salon", v_course: "Kurs", v_issued: "Izdat",
      verify_bad: "Sertifikat nije pronađen", verify_bad_x: "Broj {id} ne postoji ili kurs još nije završen.", verify_by: "Proveru izdaje {s}",
      cert_locked: "Sertifikat još nije otključan", cert_locked_n: "Lekcije: {n}/{l} · kvizovi: {q}/{qt}. Sertifikat se otključava kad je sve gotovo.",
      print: "Štampaj / sačuvaj PDF", cert_h: "Sertifikat o završenoj obuci", cert_lead: "Dodeljuje se",
      cert_body: "za uspešno završen online kurs", cert_stats: "{l} lekcija · {m} modula · kvizovi {s}/{t} tačno", date: "Datum",
      cert_verify: "Provera sertifikata", cert_demo: "DEMO — primer sertifikata iz prototipa, nije važeći dokument",
      toast_course_done: "Kurs završen — sertifikat je otključan", toast_lesson: "Lekcija {n} odgledana",
      fault_x: "Znamo koji su vaši aparati — samo izaberite koji i opišite šta se dešava.", device: "Aparat", fault_type: "Tip kvara",
      description: "Opis", fault_ph: "Aparat se upali, posle 20 sekundi izbaci E-04...", photo: "Fotografija", demo_photo: "Uzmi demo fotografiju",
      send_report: "Pošalji prijavu", fault_note: "Prijava odmah stiže Vecomu — bez telefoniranja i bez čekanja radnog vremena.",
      toast_fault: "Prijava poslata — tiket #{id} ({d})", current_status: "trenutni status", ticket: "Tiket", reported_on: "Prijavljeno",
      type: "Tip", status: "Status", messages: "Prepiska", msg_ph: "Dopišite nešto servisu...", send_msg: "Pošalji poruku",
      parts_h: "Potrošni materijal za vaše aparate", recommended: "preporučeno", add: "Dodaj", cart: "Korpa", remove: "Ukloni", order: "Poruči",
      order_note: "Predračun stiže na mejl, cene po važećem cenovniku.", cart_empty: "Korpa je prazna.", prev_orders: "Prethodne porudžbine",
      awaiting: "čeka potvrdu", confirmed: "potvrđeno", delivered_st: "isporučeno", repeat: "Ponovi",
      proto_chips: "celulit|akne|pigmentacije|epilacija|fototip V", proto_h: "Protokoli tretmana",
      proto_ph: "Pretraga: celulit, akne, pigmentacije, fototip...", protocol: "Protokol", contra: "Kontraindikacije", combo: "Kombinacije",
      proto_none: "Nema protokola za tu pretragu.", proto_note: "Protokoli u prototipu su primeri — pravi sadržaj piše Vecom edukativni tim.",
      download: "Preuzmi",
      t_part_added: "{p} dodato u korpu", t_order_sent: "Porudžbina poslata — predračun stiže na mejl", t_reorder: "Porudžbina ponovljena",
      t_download: "Preuzimanje: {d} (u prototipu bez fajla)", t_msg_empty: "Napišite poruku", t_msg_sent: "Poruka poslata servisu",
      t_quick_part: "{p} je u korpi", t_course_all: "Sve lekcije i kvizovi označeni — sertifikat je otključan",
      t_quiz_pass: "Kviz položen — {s}/3", t_quiz_fail: "Nije položeno — {s}/3",
      n_status: "Servis #{id}: {s}", n_reply: "Servis #{id}: nova poruka od Vecoma", n_order: "Porudžbina #{id} je potvrđena — predračun stiže na mejl",
      n_post: "Nova objava: {t}", n_notif_on: "Obaveštenja su uključena. Ovako izgleda poruka kad servis promeni status.",
      t_notif_denied: "Obaveštenja nisu dozvoljena", t_notif_unsupported: "Ovaj browser ne podržava obaveštenja",
      t_install_menu: "Instalacija je dostupna iz menija browsera",
    },

    de: {
      nav_home: "Übersicht", nav_devices: "Meine Geräte", nav_edu: "Schulung", nav_service: "Service", nav_parts: "Verbrauch",
      nav_protocols: "Protokolle", nav_docs: "Dokumente", nav_news: "Neuigkeiten", nav_more: "Mehr", nav_notices: "Mitteilungen",
      login_h: "Vecom-Konto", login_sub: "Ihre Geräte, Garantien, Service und Protokolle an einem Ort.",
      login_google: "Mit Google anmelden", or: "oder", email: "E-Mail", password: "Passwort", login_pw: "Mit Passwort anmelden",
      login_noacc: "Noch kein Konto? Sie erhalten es automatisch bei der Lieferung des Geräts.",
      login_demo: "Im Prototyp ist die Anmeldung nur optisch — es wird kein echtes Google-Konto geöffnet.", login_wait: "Anmeldung…",
      support: "Vecom Support", call: "Anrufen", logout: "Abmelden", mail: "E-Mail", report_fault: "Störung melden",
      d: "T", ring_expired: "abgelaufen", ring_warranty: "Garantie", ring_probe: "Sonde", ring_handpiece: "Handstück",
      st_service: "Im Service · #{id}", st_nowarranty: "In Betrieb · ohne Garantie", st_ok: "In Betrieb", code: "Art.-Nr.",
      reported: "gemeldet am", vecom_service: "Vecom Service", you: "Sie",
      act_delivered: "Geliefert und in Betrieb genommen: {d}", act_trained: "Schulung abgeschlossen: {n} · {d}",
      act_ticket: "Störung gemeldet #{id}: {i}", act_order: "Bestellung #{id} geliefert",
      for_owners: "für Besitzer: {d}",
      hello_morning: "Guten Morgen", hello_day: "Guten Tag", hello_evening: "Guten Abend",
      q_fault_s: "mit Foto", q_parts_s: "Sonde, Filter, Gel", q_proto_s: "Behandlungsparameter", q_call: "Vecom anrufen",
      home_sum: "{n} Geräte in Betrieb · offene Servicefälle: {s} · die Sonde der Sonata steht bei {p}%.",
      probe_h: "Die Sonde der Sonata 4XD steht bei {p}% ihrer Lebensdauer", probe_x: "Bestellen Sie rechtzeitig Ersatz — die Lieferung dauert 3–5 Werktage.",
      probe_btn: "Sonde bestellen", all_devices: "Alle Geräte", svc_open: "In Bearbeitung", svc_ok: "Alles in Ordnung", all_services: "Alle Servicefälle",
      svc_none: "Keine offenen Meldungen. Wenn etwas nicht funktioniert, dauert die Meldung eine Minute.", history: "Verlauf", activity: "Aktivität",
      from_vecom: "Von Vecom", all: "Alle", your_contact: "Ihr Ansprechpartner bei Vecom", sales_support: "Vertrieb und Support",
      devices_note: "Jedes Gerät, das Sie bei Vecom kaufen, erscheint hier automatisch — mit Garantie, Schulung und Dokumenten.",
      not_found: "Nicht gefunden.", tab_overview: "Übersicht", tab_training: "Schulung", tab_spec: "Technische Daten",
      svc_history: "Serviceverlauf", closed: "abgeschlossen", trained_h: "Für das Gerät geschult", cert_issued: "Zertifikat ausgestellt am {d}",
      certificate: "Zertifikat", newcolleague_h: "Neue Kollegin im Studio?", newcolleague_x: "Buchen Sie eine Schulung — das Zertifikat erscheint hier.",
      training_sent: "Schulungsanfrage an Vecom gesendet", book_training: "Schulung buchen",
      spec_sr_only: "Die technischen Daten gibt es derzeit nur auf Serbisch.", spec_none: "Keine technischen Daten verfügbar.",
      data: "Daten", serial: "Seriennummer", delivered: "Geliefert", warranty_until: "Garantie bis", quick_actions: "Schnellzugriff",
      order_parts: "Verbrauch bestellen", warranty_exp: "Die Garantie ist am {d} abgelaufen",
      contract_x: "Ein Servicevertrag deckt die regelmäßige Wartung und Vorrang in der Warteschlange ab.", contract_sent: "Anfrage für einen Servicevertrag gesendet", offer: "Angebot",
      all_news: "Alle Neuigkeiten", de_fallback: "Dieser Beitrag ist noch nicht auf Deutsch verfügbar — hier die englische Fassung.",
      more_devices: "Garantie, Sonde, Service, Schulung", more_protocols: "Parameter nach Anliegen und Hauttyp",
      more_docs: "Anleitungen, Zertifikate, Garantieschein", more_news: "Neue Protokolle und Tipps von Vecom",
      more_notices: "Service, Bestellungen, neue Beiträge",
      no_tickets: "Keine Meldungen.", tickets_note: "Der Status ändert sich, sobald der Service etwas erledigt — Sie erhalten auch eine E-Mail.",
      pwa_installed: "Mein Vecom wurde zum Startbildschirm hinzugefügt",
      pwa_x: "Fügen Sie das Konto zum Startbildschirm hinzu — es öffnet sich wie eine App, mit einem Tipp, ohne Browser.",
      pwa_install: "App installieren", pwa_ios: "In Safari: Teilen → Zum Home-Bildschirm.",
      pwa_menu: "Im Browsermenü: App installieren / Zum Startbildschirm hinzufügen.", pwa_on: "Mitteilungen aktiv",
      pwa_blocked: "Mitteilungen sind in den Browsereinstellungen blockiert.",
      pwa_ios_notif: "Auf dem iPhone funktionieren Mitteilungen, sobald die App zum Home-Bildschirm hinzugefügt ist.", pwa_enable: "Mitteilungen aktivieren",
      pwa_eyebrow: "App", pwa_h: "Mein Vecom auf dem Handy",
      pwa_notif_x: "Wir melden uns, wenn der Service den Status ändert, eine Bestellung ankommt oder ein neues Protokoll erscheint.",
      just_now: "gerade eben", no_notices: "Keine Mitteilungen.",
      lessons_short: "Lektionen", course_done: "Kurs abgeschlossen — das Zertifikat ist bereit.", next_lesson: "Als Nächstes: {n}. {t}",
      continue: "Weiter", start_course: "Kurs starten", all_lessons: "Alle Lektionen", online_course: "Online-Kurs",
      edu_intro: "{l} Lektionen in {m} Modulen · Video + Text · Zertifikat am Ende. Lernen Sie, wann es passt — der Fortschritt wird gespeichert.",
      edu_progress: "{n} von {l} Lektionen · {p}% · Quiz {q}/{qt}", get_cert: "Zertifikat herunterladen", continue_lesson: "Weiter: Lektion {n}",
      video_sr: "Die Videos sind auf Serbisch; Untertitel auf Deutsch folgen nach der Aufnahme.",
      cert_unlocked: "Zertifikat freigeschaltet", cert_locked_x: "Das Zertifikat wird nach allen Lektionen und Quizzen freigeschaltet",
      cert_teaser: "Auf den Namen der Teilnehmerin, mit Zertifikatsnummer, druckfertig", module: "Modul",
      demo_all: "alle Lektionen und Quizze als erledigt markieren — um beim Termin sofort das Zertifikat zu zeigen",
      play: "Lektion abspielen", lesson: "Lektion", clip: "Clip {n}/{t} · {d} Min. · Video in Aufnahme", next_lesson_btn: "Nächste Lektion",
      module_quiz: "Quiz Modul {n}", finish_lesson: "Lektion abschließen", all_modules: "Alle Module", watched: "Angesehen",
      remember: "Merken Sie sich", lesson_n: "Lektion {n}", lessons: "Lektionen",
      quiz_row: "Modul-Quiz · 3 Fragen", quiz_passed_n: "Bestanden · {s}/3", quiz_ready: "Bereit", quiz_locked_row: "Nach den Lektionen verfügbar",
      quiz_locked: "Das Quiz ist gesperrt", quiz_locked_x: "Sehen Sie zuerst alle Lektionen von Modul {n} an.", back_course: "Zurück zum Kurs", quiz: "Quiz",
      quiz_h: "Quiz — 3 Fragen", quiz_x: "Zum Bestehen sind 2 richtige Antworten nötig. Sie können beliebig oft wiederholen.",
      correct: "Richtig.", wrong: "Falsch.", quiz_pass: "Bestanden — {s} von 3 richtig", quiz_fail: "Nicht bestanden — {s} von 3 richtig",
      quiz_next_open: "Das nächste Modul ist freigeschaltet.", quiz_all_done: "Alle Module sind abgeschlossen.", quiz_retry_x: "Lesen Sie die Erklärungen und versuchen Sie es erneut.",
      continue_course: "Kurs fortsetzen", retry_quiz: "Quiz wiederholen", check_answers: "Antworten prüfen",
      verify_ok: "Das Zertifikat ist gültig", v_number: "Nummer", v_student: "Teilnehmerin", v_salon: "Studio", v_course: "Kurs", v_issued: "Ausgestellt",
      verify_bad: "Zertifikat nicht gefunden", verify_bad_x: "Die Nummer {id} existiert nicht oder der Kurs ist noch nicht abgeschlossen.", verify_by: "Prüfung durch {s}",
      cert_locked: "Das Zertifikat ist noch nicht freigeschaltet", cert_locked_n: "Lektionen: {n}/{l} · Quiz: {q}/{qt}. Das Zertifikat wird freigeschaltet, wenn alles erledigt ist.",
      print: "Drucken / als PDF speichern", cert_h: "Zertifikat über die abgeschlossene Schulung", cert_lead: "Verliehen an",
      cert_body: "für den erfolgreichen Abschluss des Online-Kurses", cert_stats: "{l} Lektionen · {m} Module · Quiz {s}/{t} richtig", date: "Datum",
      cert_verify: "Zertifikat prüfen", cert_demo: "DEMO — Beispielzertifikat aus dem Prototyp, kein gültiges Dokument",
      toast_course_done: "Kurs abgeschlossen — das Zertifikat ist freigeschaltet", toast_lesson: "Lektion {n} angesehen",
      fault_x: "Wir kennen Ihre Geräte — wählen Sie einfach das Gerät und beschreiben Sie, was passiert.", device: "Gerät", fault_type: "Art der Störung",
      description: "Beschreibung", fault_ph: "Das Gerät startet, nach 20 Sekunden erscheint E-04...", photo: "Foto", demo_photo: "Demo-Foto verwenden",
      send_report: "Meldung senden", fault_note: "Die Meldung geht sofort an Vecom — ohne Anruf und ohne Warten auf die Öffnungszeiten.",
      toast_fault: "Meldung gesendet — Ticket #{id} ({d})", current_status: "aktueller Status", ticket: "Ticket", reported_on: "Gemeldet",
      type: "Art", status: "Status", messages: "Nachrichten", msg_ph: "Schreiben Sie dem Service...", send_msg: "Nachricht senden",
      parts_h: "Verbrauchsmaterial für Ihre Geräte", recommended: "empfohlen", add: "Hinzufügen", cart: "Warenkorb", remove: "Entfernen", order: "Bestellen",
      order_note: "Die Proformarechnung kommt per E-Mail, Preise laut aktueller Preisliste.", cart_empty: "Der Warenkorb ist leer.", prev_orders: "Frühere Bestellungen",
      awaiting: "wartet auf Bestätigung", confirmed: "bestätigt", delivered_st: "geliefert", repeat: "Wiederholen",
      proto_chips: "Cellulite|Akne|Pigmentflecken|Haarentfernung|Hauttyp V", proto_h: "Behandlungsprotokolle",
      proto_ph: "Suche: Cellulite, Akne, Pigmentflecken, Hauttyp...", protocol: "Protokoll", contra: "Kontraindikationen", combo: "Kombinationen",
      proto_none: "Keine Protokolle für diese Suche.", proto_note: "Die Protokolle im Prototyp sind Beispiele — die echten Inhalte schreibt das Vecom-Schulungsteam.",
      download: "Herunterladen",
      t_part_added: "{p} in den Warenkorb gelegt", t_order_sent: "Bestellung gesendet — die Proformarechnung kommt per E-Mail", t_reorder: "Bestellung wiederholt",
      t_download: "Download: {d} (im Prototyp ohne Datei)", t_msg_empty: "Bitte eine Nachricht schreiben", t_msg_sent: "Nachricht an den Service gesendet",
      t_quick_part: "{p} ist im Warenkorb", t_course_all: "Alle Lektionen und Quizze markiert — das Zertifikat ist freigeschaltet",
      t_quiz_pass: "Quiz bestanden — {s}/3", t_quiz_fail: "Nicht bestanden — {s}/3",
      n_status: "Service #{id}: {s}", n_reply: "Service #{id}: neue Nachricht von Vecom", n_order: "Bestellung #{id} bestätigt — die Proformarechnung kommt per E-Mail",
      n_post: "Neuer Beitrag: {t}", n_notif_on: "Mitteilungen sind aktiv. So sieht es aus, wenn der Service den Status ändert.",
      t_notif_denied: "Mitteilungen wurden nicht erlaubt", t_notif_unsupported: "Dieser Browser unterstützt keine Mitteilungen",
      t_install_menu: "Die Installation ist über das Browsermenü verfügbar",
    },

    en: {
      nav_home: "Home", nav_devices: "My devices", nav_edu: "Training", nav_service: "Service", nav_parts: "Supplies",
      nav_protocols: "Protocols", nav_docs: "Documents", nav_news: "News", nav_more: "More", nav_notices: "Notifications",
      login_h: "Vecom account", login_sub: "Your devices, warranties, service and protocols in one place.",
      login_google: "Sign in with Google", or: "or", email: "Email", password: "Password", login_pw: "Sign in with password",
      login_noacc: "No account yet? You get one automatically when your device is delivered.",
      login_demo: "In the prototype sign-in is visual only — no real Google account is opened.", login_wait: "Signing in…",
      support: "Vecom support", call: "Call", logout: "Sign out", mail: "Email", report_fault: "Report a fault",
      d: "d", ring_expired: "expired", ring_warranty: "warranty", ring_probe: "probe", ring_handpiece: "handpiece",
      st_service: "In service · #{id}", st_nowarranty: "Working · out of warranty", st_ok: "Working normally", code: "code",
      reported: "reported", vecom_service: "Vecom service", you: "You",
      act_delivered: "Delivered and commissioned: {d}", act_trained: "Training completed: {n} · {d}",
      act_ticket: "Fault reported #{id}: {i}", act_order: "Order #{id} delivered",
      for_owners: "for {d} owners",
      hello_morning: "Good morning", hello_day: "Good afternoon", hello_evening: "Good evening",
      q_fault_s: "with a photo", q_parts_s: "probe, filter, gel", q_proto_s: "treatment settings", q_call: "Call Vecom",
      home_sum: "{n} devices in use · open service requests: {s} · the Sonata probe is at {p}%.",
      probe_h: "The Sonata 4XD probe is at {p}% of its lifetime", probe_x: "Order a spare in time — delivery takes 3–5 working days.",
      probe_btn: "Order probe", all_devices: "All devices", svc_open: "In progress", svc_ok: "All good", all_services: "All service requests",
      svc_none: "No open requests. If something stops working, reporting it takes a minute.", history: "History", activity: "Activity",
      from_vecom: "From Vecom", all: "All", your_contact: "Your contact at Vecom", sales_support: "Sales and support",
      devices_note: "Every device you buy from Vecom appears here automatically, with warranty, training and documents.",
      not_found: "Not found.", tab_overview: "Overview", tab_training: "Training", tab_spec: "Specifications",
      svc_history: "Service history", closed: "closed", trained_h: "Trained on this device", cert_issued: "Certificate issued {d}",
      certificate: "Certificate", newcolleague_h: "New colleague at the salon?", newcolleague_x: "Book a training — the certificate arrives here.",
      training_sent: "Training request sent to Vecom", book_training: "Book training",
      spec_sr_only: "Technical specifications are currently in Serbian only.", spec_none: "No specifications available.",
      data: "Details", serial: "Serial number", delivered: "Delivered", warranty_until: "Warranty until", quick_actions: "Quick actions",
      order_parts: "Order supplies", warranty_exp: "The warranty expired on {d}",
      contract_x: "A service contract covers regular maintenance and priority in the queue.", contract_sent: "Service contract request sent to Vecom", offer: "Offer",
      all_news: "All news", de_fallback: "",
      more_devices: "Warranty, probe, service, training", more_protocols: "Settings by concern and skin type",
      more_docs: "Manuals, certificates, warranty card", more_news: "New protocols and tips from Vecom",
      more_notices: "Service, orders, new posts",
      no_tickets: "No requests.", tickets_note: "The status changes as soon as service does something — you also get an email.",
      pwa_installed: "My Vecom was added to your home screen",
      pwa_x: "Add your account to the home screen — it opens like an app, with one tap, without the browser.",
      pwa_install: "Install app", pwa_ios: "In Safari: Share → Add to Home Screen.",
      pwa_menu: "In the browser menu: Install app / Add to home screen.", pwa_on: "Notifications on",
      pwa_blocked: "Notifications are blocked in the browser settings.",
      pwa_ios_notif: "On iPhone, notifications work once the app is added to the home screen.", pwa_enable: "Turn on notifications",
      pwa_eyebrow: "App", pwa_h: "My Vecom on your phone",
      pwa_notif_x: "We let you know when service changes the status, an order arrives or a new protocol is out.",
      just_now: "just now", no_notices: "No notifications.",
      lessons_short: "lessons", course_done: "Course completed — your certificate is ready.", next_lesson: "Next: {n}. {t}",
      continue: "Continue", start_course: "Start course", all_lessons: "All lessons", online_course: "online course",
      edu_intro: "{l} lessons in {m} modules · video + text · certificate at the end. Watch when it suits you; progress is saved.",
      edu_progress: "{n} of {l} lessons · {p}% · quizzes {q}/{qt}", get_cert: "Download certificate", continue_lesson: "Continue: lesson {n}",
      video_sr: "The videos are in Serbian; English subtitles follow after filming.",
      cert_unlocked: "Certificate unlocked", cert_locked_x: "The certificate unlocks after all lessons and quizzes",
      cert_teaser: "In the participant's name, with a certificate number, ready to print", module: "Module",
      demo_all: "mark all lessons and quizzes as done — to show the certificate right away in the meeting",
      play: "Play lesson", lesson: "Lesson", clip: "Clip {n}/{t} · {d} min · video being filmed", next_lesson_btn: "Next lesson",
      module_quiz: "Module {n} quiz", finish_lesson: "Finish lesson", all_modules: "All modules", watched: "Watched",
      remember: "Remember", lesson_n: "Lesson {n}", lessons: "Lessons",
      quiz_row: "Module quiz · 3 questions", quiz_passed_n: "Passed · {s}/3", quiz_ready: "Ready", quiz_locked_row: "Unlocks after the lessons",
      quiz_locked: "The quiz is locked", quiz_locked_x: "First watch all lessons in module {n}.", back_course: "Back to course", quiz: "Quiz",
      quiz_h: "Quiz — 3 questions", quiz_x: "You need 2 correct answers to pass. You can retry as often as you like.",
      correct: "Correct.", wrong: "Incorrect.", quiz_pass: "Passed — {s} of 3 correct", quiz_fail: "Not passed — {s} of 3 correct",
      quiz_next_open: "The next module is unlocked.", quiz_all_done: "All modules are done.", quiz_retry_x: "Read the explanations and try again.",
      continue_course: "Continue course", retry_quiz: "Retry quiz", check_answers: "Check answers",
      verify_ok: "The certificate is valid", v_number: "Number", v_student: "Participant", v_salon: "Salon", v_course: "Course", v_issued: "Issued",
      verify_bad: "Certificate not found", verify_bad_x: "Number {id} does not exist or the course is not finished yet.", verify_by: "Verified by {s}",
      cert_locked: "The certificate is not unlocked yet", cert_locked_n: "Lessons: {n}/{l} · quizzes: {q}/{qt}. The certificate unlocks when everything is done.",
      print: "Print / save as PDF", cert_h: "Certificate of completed training", cert_lead: "Awarded to",
      cert_body: "for successfully completing the online course", cert_stats: "{l} lessons · {m} modules · quizzes {s}/{t} correct", date: "Date",
      cert_verify: "Verify certificate", cert_demo: "DEMO — sample certificate from the prototype, not a valid document",
      toast_course_done: "Course completed — the certificate is unlocked", toast_lesson: "Lesson {n} watched",
      fault_x: "We know your devices — just pick one and describe what is happening.", device: "Device", fault_type: "Fault type",
      description: "Description", fault_ph: "The device starts, after 20 seconds it shows E-04...", photo: "Photo", demo_photo: "Use demo photo",
      send_report: "Send report", fault_note: "The report reaches Vecom instantly — no phone calls, no waiting for office hours.",
      toast_fault: "Report sent — ticket #{id} ({d})", current_status: "current status", ticket: "Ticket", reported_on: "Reported",
      type: "Type", status: "Status", messages: "Messages", msg_ph: "Write to service...", send_msg: "Send message",
      parts_h: "Supplies for your devices", recommended: "recommended", add: "Add", cart: "Cart", remove: "Remove", order: "Order",
      order_note: "The pro forma invoice arrives by email, prices per the current price list.", cart_empty: "Your cart is empty.", prev_orders: "Previous orders",
      awaiting: "awaiting confirmation", confirmed: "confirmed", delivered_st: "delivered", repeat: "Reorder",
      proto_chips: "cellulite|acne|pigmentation|hair removal|skin type V", proto_h: "Treatment protocols",
      proto_ph: "Search: cellulite, acne, pigmentation, skin type...", protocol: "Protocol", contra: "Contraindications", combo: "Combinations",
      proto_none: "No protocols for this search.", proto_note: "The protocols in the prototype are examples — the real content is written by the Vecom training team.",
      download: "Download",
      t_part_added: "{p} added to cart", t_order_sent: "Order sent — the pro forma invoice arrives by email", t_reorder: "Order repeated",
      t_download: "Download: {d} (no file in the prototype)", t_msg_empty: "Please write a message", t_msg_sent: "Message sent to service",
      t_quick_part: "{p} is in your cart", t_course_all: "All lessons and quizzes marked — the certificate is unlocked",
      t_quiz_pass: "Quiz passed — {s}/3", t_quiz_fail: "Not passed — {s}/3",
      n_status: "Service #{id}: {s}", n_reply: "Service #{id}: new message from Vecom", n_order: "Order #{id} confirmed — the pro forma invoice arrives by email",
      n_post: "New post: {t}", n_notif_on: "Notifications are on. This is what it looks like when service changes the status.",
      t_notif_denied: "Notifications were not allowed", t_notif_unsupported: "This browser does not support notifications",
      t_install_menu: "Installation is available from the browser menu",
    },
  };

  // tekst iz demo podataka (srpski izvor → de, en)
  var CU_DATA = {
    "Redovan servis, zamena filtera": { de: "Regelwartung, Filterwechsel", en: "Regular service, filter replacement" },
    "Kalibracija ručice, provera hlađenja": { de: "Kalibrierung des Handstücks, Prüfung der Kühlung", en: "Handpiece calibration, cooling check" },
    "Zamena kabla ručice": { de: "Austausch des Handstückkabels", en: "Handpiece cable replacement" },
    "Sonda 15×20 mm": { de: "Sonde 15×20 mm", en: "Probe 15×20 mm" },
    "Ručica za kavitaciju": { de: "Kavitations-Handstück", en: "Cavitation handpiece" },
    "Filter rashladnog sistema": { de: "Filter des Kühlsystems", en: "Cooling system filter" },
    "Ručica sa kristalom": { de: "Handstück mit Kristall", en: "Handpiece with crystal" },
    "Kontaktni gel 5 l": { de: "Kontaktgel 5 l", en: "Contact gel 5 l" },
    "Pretvarač za kavitaciju": { de: "Kavitationswandler", en: "Cavitation transducer" },
    "preporučeno — istrošenost 78%": { de: "empfohlen — 78% verbraucht", en: "recommended — 78% used" },
    "menja se na 12 meseci": { de: "Wechsel alle 12 Monate", en: "replace every 12 months" },
    "rezervna": { de: "Ersatz", en: "spare" },
    "rezervni": { de: "Ersatz", en: "spare" },
    "potrošno": { de: "Verbrauchsmaterial", en: "consumable" },
    "Greška na displeju": { de: "Fehler auf dem Display", en: "Error on the display" },
    "Ne pali se": { de: "Lässt sich nicht einschalten", en: "Does not switch on" },
    "Smanjen učinak": { de: "Verminderte Leistung", en: "Reduced performance" },
    "Hlađenje / curenje": { de: "Kühlung / Undichtigkeit", en: "Cooling / leak" },
    "Hlađenje": { de: "Kühlung", en: "Cooling" },
    "Ručica / kabl": { de: "Handstück / Kabel", en: "Handpiece / cable" },
    "Drugo": { de: "Sonstiges", en: "Other" },
    "Prijava sa sajta": { de: "Meldung über die Website", en: "Reported on the website" },
    "Nova verzija protokola za Sonatu 4XD — dodat protokol za fototip V.": { de: "Neue Protokollversion für die Sonata 4XD — Protokoll für Hauttyp V hinzugefügt.", en: "New protocol version for the Sonata 4XD — protocol for skin type V added." },
    "Podsetnik: sonda je na 78% resursa, preporučujemo poručivanje rezervne.": { de: "Erinnerung: Die Sonde steht bei 78% — wir empfehlen, Ersatz zu bestellen.", en: "Reminder: the probe is at 78% — we recommend ordering a spare." },
    "danas": { de: "heute", en: "today" },
    "pre 2 dana": { de: "vor 2 Tagen", en: "2 days ago" },
    "juče": { de: "gestern", en: "yesterday" },
    "upravo sada": { de: "gerade eben", en: "just now" },
    "danas 08:30": { de: "heute 08:30", en: "today 08:30" },
    "Uputstvo za rukovanje": { de: "Bedienungsanleitung", en: "User manual" },
    "Praktikum i protokoli tretmana": { de: "Praxisleitfaden und Behandlungsprotokolle", en: "Practice guide and treatment protocols" },
    "CE sertifikat": { de: "CE-Zertifikat", en: "CE certificate" },
    "ALIMS rešenje": { de: "ALIMS-Bescheid", en: "ALIMS approval" },
    "Garantni list": { de: "Garantieschein", en: "Warranty card" },
    "Sertifikat o obuci": { de: "Schulungszertifikat", en: "Training certificate" },
  };

  // prazan string je namerno ("nema napomene na ovom jeziku"); fali ključ → srpski, pa sam ključ
  function u(key, vars) {
    var s = CU_T[S.cuLang][key];
    if (s === undefined) s = CU_T.sr[key];
    if (s === undefined) s = key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }

  function tx(s) {
    var m = CU_DATA[s];
    return m && S.cuLang !== "sr" ? m[S.cuLang] || s : s;
  }

  // kurs na nemačkom i engleskom — redosled i tačni odgovori isti kao u srpskom izvoru
  var COURSE_TX = {
    de: {
      title: "Sonata 4XD — von der ersten Behandlung bis zum Service",
      school: "Vecom Akademie",
      modules: ["Das Gerät kennenlernen", "Sicherheit", "Vorbereitung der Behandlung", "Behandlung nach Zonen", "Nach der Behandlung und Wartung"],
      lessons: [
        { t: "Willkommen: was Sie lernen", x: "Ein kurzer Überblick über den Kurs und wie Sie ihm folgen. Markieren Sie jede Lektion am Ende als angesehen — nach der letzten erhalten Sie das Zertifikat.", k: ["20 kurze Lektionen, 5 Module", "Jede Lektion: Video + Text zum Nachlesen", "Druckfertiges Zertifikat am Ende"] },
        { t: "Geräteteile und Handstück", x: "Gehäuse, Display, Handstück mit Kristall, Kühlsystem und Anschlüsse. Was Sie berühren dürfen und was nur der Service öffnet.", k: ["Das Handstück nie am Kabel ziehen", "Den Kristall nur mit dem empfohlenen Mittel reinigen", "Die Plomben am Gehäuse sichern die Garantie"] },
        { t: "Einschalten, Display und Menü", x: "Reihenfolge beim Einschalten, Aufwärmen und Kühlen, Hauptmenü und das Speichern eigener Programme pro Kundin.", k: ["Warten, bis die Kühlung die Betriebstemperatur erreicht", "Programme nach Zone und Hauttyp speichern", "Immer über das Menü ausschalten, nicht am Schalter"] },
        { t: "Kühlung und destilliertes Wasser", x: "Wie der Kühlkreislauf funktioniert, wie oft nachgefüllt wird und warum ausschließlich destilliertes Wasser verwendet wird.", k: ["Füllstand jeden Morgen prüfen", "Nur destilliertes Wasser", "Niedriger Füllstand = Fehler E-04"] },
        { t: "Schutzbrillen und Raum", x: "Brillen für Anwenderin und Kundin, Licht in der Kabine und das Entfernen spiegelnder Flächen.", k: ["Anwenderin und Kundin tragen Brillen", "Keine Spiegel in Strahlrichtung", "Hinweisschild an der Tür während des Betriebs"] },
        { t: "Kontraindikationen", x: "Wann nicht behandelt oder verschoben wird: Schwangerschaft, fotosensibilisierende Medikamente, aktive Infektionen, frische Bräune.", k: ["Immer nach Medikamenten und Isotretinoin fragen", "Frische Bräune = verschieben", "Im Zweifel nicht behandeln, Arzt fragen"] },
        { t: "Hauttypen", x: "Die Fitzpatrick-Skala von I bis VI in der Praxis und wie der Hauttyp Wellenlänge und Energie bestimmt.", k: ["Hauttyp vor jeder ersten Behandlung bestimmen", "Dunklerer Hauttyp = längere Wellenlänge", "Notiz in der Kundenkartei"] },
        { t: "Testpunkt und Einwilligung", x: "Test auf einer kleinen Fläche 48 Stunden vor der ersten Behandlung und unterschriebene Einwilligung der Kundin.", k: ["Testpunkt an einer wenig sichtbaren Stelle", "Reaktion nach 48 Std. prüfen", "Einwilligung in der Kartei aufbewahren"] },
        { t: "Beratung und Anamnese", x: "Was beim ersten Termin zu fragen ist, wie die Anzahl der Behandlungen erklärt wird und realistische Erwartungen.", k: ["6–8 Behandlungen für die meisten Zonen", "Abstand 4–6 Wochen", "Erklären, dass die Haare nach 1–2 Wochen ausfallen"] },
        { t: "Hautvorbereitung und Rasur", x: "Rasur am Vortag, kein Waxing, saubere trockene Haut ohne Creme und Deodorant.", k: ["Rasur 12–24 Std. vor der Behandlung", "Kein Wachs und Zupfen 4 Wochen vorher", "Haut sauber und trocken"] },
        { t: "Gel und Kontakt des Handstücks", x: "Wie viel Gel, wie das Handstück gehalten wird und warum voller Kontakt für Sicherheit und Wirkung wichtig ist.", k: ["Dünne gleichmäßige Gelschicht", "Handstück im rechten Winkel", "Voller Hautkontakt bei jedem Impuls"] },
        { t: "Wahl der Wellenlänge", x: "Wann 755, 808, 940 oder 1064 nm und wie die Sonata sie für unterschiedliche Follikeltiefen kombiniert.", k: ["755 nm — helle Haut, feines Haar", "808 nm — universell, dichtes Haar", "1064 nm — dunkle Hauttypen, tiefe Follikel"] },
        { t: "Gesicht und Oberlippe", x: "Kleine Zonen mit feinem Haar: kleinerer Spot, niedrigere Frequenz und besondere Vorsicht an den Augen.", k: ["Nie unterhalb des Augenbrauenknochens", "Kürzere Impulse, weniger Energie", "Nach der Behandlung kühlen"] },
        { t: "Achseln und Bikinizone", x: "Dichtes, tief verwurzeltes Haar: Parameter, Reihenfolge der Durchgänge und Komfort der Kundin.", k: ["Haut mit der freien Hand straffen", "Durchgänge kreuzweise", "Pause, wenn es unangenehm ist"] },
        { t: "Beine und Arme — In-Motion-Technik", x: "Große Zonen schnell und gleichmäßig: In-Motion-Modus, Einteilung in Felder und Kontrolle der Durchgänge.", k: ["Zone in Felder von ca. 10×10 cm teilen", "3–4 Durchgänge pro Feld", "Gleichmäßige Geschwindigkeit des Handstücks"] },
        { t: "Rücken und Brust — männliche Kunden", x: "Dichtes Haar und größere Flächen: wie Parameter und Behandlungsdauer angepasst werden.", k: ["Mit niedrigerer Energie beginnen", "Mehr Pausen wegen der Wärme", "Längeren Termin einplanen"] },
        { t: "Pflege nach der Behandlung", x: "Kühlung, beruhigende Cremes, Sonnenschutz und was die Kundin in den ersten Tagen vermeiden sollte.", k: ["LSF 50 mindestens zwei Wochen", "48 Std. keine Sauna und kein Training", "Rötung vergeht nach wenigen Stunden"] },
        { t: "Reinigung von Handstück und Filter", x: "Tägliche und wöchentliche Pflege: Kristall des Handstücks, Gehäuse und Filter des Kühlsystems.", k: ["Kristall nach jeder Kundin", "Filterwechsel alle 12 Monate", "Gerät beim Reinigen ausgeschaltet"] },
        { t: "Sonde: Impulse verfolgen und tauschen", x: "Wo die Anzahl der Impulse steht, was der Prozentsatz bedeutet und wann eine Ersatzsonde bestellt wird.", k: ["Lebensdauer im Mein-Vecom-Konto verfolgen", "Ersatz bei 75–80% bestellen", "Tausch nur durch den autorisierten Service"] },
        { t: "Fehler am Display und wann der Service kommt", x: "Die häufigsten Fehlercodes, was Sie selbst prüfen können und wie eine Störung mit Foto gemeldet wird.", k: ["E-04: Wasserstand prüfen", "Gehäuse nicht öffnen", "Störung im Konto melden, mit Foto des Displays"] },
      ],
      quiz: [
        [
          { q: "Womit wird das Kühlsystem nachgefüllt?", o: ["Leitungswasser", "Destilliertes Wasser", "Kontaktgel"], x: "Nur destilliertes Wasser — Mineralien aus dem Leitungswasser beschädigen den Kühlkreislauf." },
          { q: "Wie wird das Gerät richtig ausgeschaltet?", o: ["Am Hauptschalter", "Über das Menü", "Stecker ziehen"], x: "Über das Menü, damit die Kühlung den Zyklus vor dem Abschalten beendet." },
          { q: "Was bedeutet Fehler E-04 meistens?", o: ["Überhitztes Handstück", "Niedriger Wasserstand in der Kühlung", "Verbrauchte Sonde"], x: "E-04 betrifft den Kühlmittelfluss — zuerst den Wasserstand prüfen." },
        ],
        [
          { q: "Wer trägt eine Schutzbrille?", o: ["Nur die Kundin", "Nur die Anwenderin", "Anwenderin und Kundin"], x: "Beide, während der gesamten Behandlung." },
          { q: "Die Kundin ist frisch gebräunt. Was tun Sie?", o: ["Mit weniger Energie behandeln", "Die Behandlung verschieben", "Auf 1064 nm wechseln"], x: "Frische Bräune ist ohne Ausnahme ein Grund zum Verschieben." },
          { q: "Wie lange vor der ersten Behandlung wird der Testpunkt gemacht?", o: ["Direkt davor", "48 Stunden vorher", "Zwei Wochen vorher"], x: "48 Stunden — genug, um die Hautreaktion zu sehen." },
        ],
        [
          { q: "Wann soll sich die Kundin rasieren?", o: ["Direkt vor der Behandlung", "12–24 Stunden vorher", "Eine Woche vorher"], x: "Am Vortag: das Haar ist unter der Oberfläche, die Haut nicht gereizt." },
          { q: "Welche Wellenlänge ist für dunkle Hauttypen?", o: ["755 nm", "808 nm", "1064 nm"], x: "1064 nm dringt am tiefsten ein und erwärmt die Epidermis am wenigsten." },
          { q: "Wie groß ist der Abstand zwischen den Behandlungen?", o: ["Eine Woche", "4–6 Wochen", "Sechs Monate"], x: "4–6 Wochen, entsprechend dem Haarwachstumszyklus." },
        ],
        [
          { q: "In-Motion-Technik: wie viele Durchgänge pro Feld?", o: ["Einer", "3–4", "Zehn"], x: "3–4 gleichmäßige Durchgänge pro Feld von ca. 10×10 cm." },
          { q: "Wo wird nie behandelt?", o: ["Oberlippe", "Unterhalb des Augenbrauenknochens", "Achseln"], x: "Die Augenzone unterhalb des Knochens ist tabu." },
          { q: "Männlicher Kunde, Rücken. Wie beginnen Sie?", o: ["Mit maximaler Energie", "Mit niedrigerer Energie", "Ohne Kühlung"], x: "Mit niedrigerer Energie, dann nach Hautreaktion steigern." },
        ],
        [
          { q: "Wie lange LSF 50 nach der Behandlung?", o: ["Zwei Tage", "Mindestens zwei Wochen", "Nicht nötig"], x: "Mindestens zwei Wochen auf der behandelten Zone." },
          { q: "Wann wird eine Ersatzsonde bestellt?", o: ["Wenn sie nicht mehr funktioniert", "Bei 75–80% der Lebensdauer", "Bei 50%"], x: "Bei 75–80% — die Lieferung dauert, und die Saison wartet nicht." },
          { q: "Wer tauscht die Sonde?", o: ["Die Kosmetikerin", "Der autorisierte Service", "Jemand aus dem Studio"], x: "Nur der autorisierte Vecom-Service, wegen Garantie und Kalibrierung." },
        ],
      ],
    },

    en: {
      title: "Sonata 4XD — from the first treatment to service",
      school: "Vecom Academy",
      modules: ["Getting to know the device", "Safety", "Preparing the treatment", "Treatment by area", "Aftercare and maintenance"],
      lessons: [
        { t: "Welcome: what you will learn", x: "A short overview of the course and how to follow it. Mark each lesson as watched at the end — after the last one you get your certificate.", k: ["20 short lessons, 5 modules", "Every lesson: video + text to look back on", "Printable certificate at the end"] },
        { t: "Device parts and the handpiece", x: "Housing, display, handpiece with crystal, cooling system and connectors. What you may touch and what only service opens.", k: ["Never pull the handpiece by its cable", "Clean the crystal only with the recommended product", "The seals on the housing protect the warranty"] },
        { t: "Switching on, display and menu", x: "Start-up order, warming up and cooling, the main menu and saving your own programs per client.", k: ["Wait until the cooling reaches operating temperature", "Save programs by area and skin type", "Always switch off via the menu, not the switch"] },
        { t: "Cooling and distilled water", x: "How the cooling circuit works, how often it is topped up and why only distilled water is used.", k: ["Check the level every morning", "Distilled water only", "Low level = error E-04"] },
        { t: "Safety glasses and the room", x: "Glasses for operator and client, lighting in the room and removing reflective surfaces.", k: ["Operator and client both wear glasses", "No mirrors in the beam direction", "Sign on the door while the device is on"] },
        { t: "Contraindications", x: "When not to treat or to postpone: pregnancy, photosensitising medication, active infections, a fresh tan.", k: ["Always ask about medication and isotretinoin", "Fresh tan = postpone", "When in doubt, do not treat — ask a doctor"] },
        { t: "Skin types", x: "The Fitzpatrick scale from I to VI in practice, and how skin type sets wavelength and energy.", k: ["Assess skin type before every first treatment", "Darker skin type = longer wavelength", "Note it in the client record"] },
        { t: "Test spot and client consent", x: "A test on a small area 48 hours before the first treatment and signed client consent.", k: ["Test spot on a less visible area", "Check the reaction after 48 h", "Keep the consent in the record"] },
        { t: "Consultation and history", x: "What to ask at the first visit, how to explain the number of treatments and realistic expectations.", k: ["6–8 treatments for most areas", "4–6 weeks apart", "Explain that hair falls out after 1–2 weeks"] },
        { t: "Skin preparation and shaving", x: "Shave the day before, no waxing, clean dry skin without cream or deodorant.", k: ["Shave 12–24 h before the treatment", "No waxing or plucking for 4 weeks before", "Skin clean and dry"] },
        { t: "Gel and handpiece contact", x: "How much gel, how to hold the handpiece and why full contact matters for safety and results.", k: ["Thin even layer of gel", "Handpiece at a right angle", "Full skin contact with every pulse"] },
        { t: "Choosing the wavelength", x: "When to use 755, 808, 940 or 1064 nm and how the Sonata combines them for different follicle depths.", k: ["755 nm — light skin, fine hair", "808 nm — universal, dense hair", "1064 nm — dark skin types, deep follicles"] },
        { t: "Face and upper lip", x: "Small areas with fine hair: a smaller spot, lower frequency and extra care around the eyes.", k: ["Never below the brow bone", "Shorter pulses, less energy", "Cool after the treatment"] },
        { t: "Underarms and bikini", x: "Dense, deeply rooted hair: settings, order of passes and client comfort.", k: ["Stretch the skin with your free hand", "Passes in crossing directions", "Pause if it is uncomfortable"] },
        { t: "Legs and arms — in-motion technique", x: "Large areas quickly and evenly: in-motion mode, dividing into fields and controlling the number of passes.", k: ["Divide the area into fields of about 10×10 cm", "3–4 passes per field", "Even handpiece speed"] },
        { t: "Back and chest — male clients", x: "Dense hair and larger areas: how to adjust settings and treatment time.", k: ["Start with lower energy", "More breaks because of the heat", "Plan a longer appointment"] },
        { t: "Aftercare", x: "Cooling, soothing creams, sun protection and what the client should avoid in the first days.", k: ["SPF 50 for at least two weeks", "No sauna or gym for 48 h", "Redness fades within a few hours"] },
        { t: "Cleaning the handpiece and filter", x: "Daily and weekly care: the handpiece crystal, the housing and the cooling system filter.", k: ["Crystal after every client", "Replace the filter every 12 months", "Device off while cleaning"] },
        { t: "Probe: tracking pulses and replacement", x: "Where to see the pulse count, what the percentage means and when to order a spare probe.", k: ["Track the lifetime in your My Vecom account", "Order a spare at 75–80%", "Only authorised service replaces it"] },
        { t: "Display errors and when to call service", x: "The most common error codes, what you can check yourself and how to report a fault with a photo.", k: ["E-04: check the water level", "Do not open the housing", "Report the fault from your account, with a photo of the display"] },
      ],
      quiz: [
        [
          { q: "What is the cooling system topped up with?", o: ["Tap water", "Distilled water", "Contact gel"], x: "Distilled water only — minerals in tap water damage the cooling circuit." },
          { q: "How is the device switched off correctly?", o: ["With the main switch", "Via the menu", "By pulling the plug"], x: "Via the menu, so the cooling finishes its cycle before shutdown." },
          { q: "What does error E-04 usually mean?", o: ["Overheated handpiece", "Low water level in the cooling", "Worn-out probe"], x: "E-04 is coolant flow — check the water level first." },
        ],
        [
          { q: "Who wears safety glasses?", o: ["Only the client", "Only the operator", "Operator and client"], x: "Both, for the whole treatment." },
          { q: "The client has a fresh tan. What do you do?", o: ["Treat with lower energy", "Postpone the treatment", "Switch to 1064 nm"], x: "A fresh tan is a reason to postpone, no exceptions." },
          { q: "How long before the first treatment is the test spot done?", o: ["Right before", "48 hours before", "Two weeks before"], x: "48 hours — enough to see how the skin reacts." },
        ],
        [
          { q: "When should the client shave?", o: ["Right before the treatment", "12–24 hours before", "A week before"], x: "The day before: the hair is below the surface and the skin is not irritated." },
          { q: "Which wavelength is for dark skin types?", o: ["755 nm", "808 nm", "1064 nm"], x: "1064 nm penetrates deepest and heats the epidermis least." },
          { q: "How far apart are the treatments?", o: ["One week", "4–6 weeks", "Six months"], x: "4–6 weeks, following the hair growth cycle." },
        ],
        [
          { q: "In-motion technique: how many passes per field?", o: ["One", "3–4", "Ten"], x: "3–4 even passes per field of about 10×10 cm." },
          { q: "Where do you never treat?", o: ["Upper lip", "Below the brow bone", "Underarms"], x: "The eye area below the brow bone is off-limits." },
          { q: "Male client, back. How do you start?", o: ["With maximum energy", "With lower energy", "Without cooling"], x: "With lower energy, then increase based on the skin's reaction." },
        ],
        [
          { q: "How long SPF 50 after the treatment?", o: ["Two days", "At least two weeks", "Not needed"], x: "At least two weeks on the treated area." },
          { q: "When do you order a spare probe?", o: ["When it stops working", "At 75–80% of its lifetime", "At 50%"], x: "At 75–80% — delivery takes time and the season does not wait." },
          { q: "Who replaces the probe?", o: ["The beautician", "Authorised service", "Anyone at the salon"], x: "Only authorised Vecom service, because of warranty and calibration." },
        ],
      ],
    },
  };

  /* ---------- B0 · prijava ---------- */

  function googleG() {
    return '<svg viewBox="0 0 48 48" aria-hidden="true">' +
      '<path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.1 17.7 9.5 24 9.5z"/>' +
      '<path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.4c-.5 2.9-2.2 5.3-4.7 6.9l7.3 5.7c4.3-3.9 7.1-9.8 7.1-16.9z"/>' +
      '<path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.4 0 20.1 0 24s1 7.6 2.6 10.8l7.8-6.1z"/>' +
      '<path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.3 0-11.7-3.6-13.6-8.9l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/>' +
      "</svg>";
  }

  function cuLangSwitch() {
    return '<span class="cu-lang">' + ["sr", "de", "en"].map(function (l) {
      return '<button class="' + (S.cuLang === l ? "on" : "") + '" data-cu-lang="' + l + '">' + l.toUpperCase() + "</button>";
    }).join("") + "</span>";
  }

  function viewLogin() {
    var c = DATA.demo.company;
    return '<div class="login-wrap">' +
      '<div class="row" style="justify-content:flex-end;margin-bottom:10px">' + cuLangSwitch() + "</div>" +
      '<div class="card">' +
      '<h1 class="center" style="font-size:22px">' + esc(u("login_h")) + "</h1>" +
      '<p class="muted small center mb">' + esc(u("login_sub")) + "</p>" +
      '<button class="google-btn" id="g-btn">' + googleG() + "<span>" + esc(u("login_google")) + "</span></button>" +
      '<div class="or">' + esc(u("or")) + "</div>" +
      '<div class="field"><label>' + esc(u("email")) + '</label><input value="' + esc(c.email) + '"></div>' +
      '<div class="field"><label>' + esc(u("password")) + '</label><input type="password" value="........"></div>' +
      '<button class="btn block ghost" id="pw-btn">' + esc(u("login_pw")) + "</button>" +
      '<div class="sep"></div>' +
      '<p class="tiny muted center">' + esc(u("login_noacc")) + "</p>" +
      "</div>" +
      '<p class="tiny muted center mt">' + esc(u("login_demo")) + "</p>" +
      "</div>";
  }

  function fakeLogin() {
    var btn = document.getElementById("g-btn");
    if (btn) {
      btn.innerHTML = '<span class="spinner"></span><span>' + esc(u("login_wait")) + "</span>";
      btn.disabled = true;
    }
    setTimeout(function () {
      S.loggedIn = true;
      go("#/app");
    }, 600);
  }

  /* ---------- B · kupcev nalog ---------- */

  var CU_NAV = [
    { href: "#/app", icon: "dash", key: "nav_home" },
    { href: "#/app/devices", icon: "zap", key: "nav_devices" },
    { href: "#/app/edu", icon: "grad", key: "nav_edu" },
    { href: "#/app/tickets", icon: "wrench", key: "nav_service" },
    { href: "#/app/parts", icon: "cart", key: "nav_parts" },
    { href: "#/app/protocols", icon: "book", key: "nav_protocols" },
    { href: "#/app/docs", icon: "file", key: "nav_docs" },
    { href: "#/app/news", icon: "news", key: "nav_news" },
  ];
  var CU_TABS = [
    { href: "#/app", icon: "dash", key: "nav_home" },
    { href: "#/app/edu", icon: "grad", key: "nav_edu" },
    { href: "#/app/tickets", icon: "wrench", key: "nav_service" },
    { href: "#/app/parts", icon: "cart", key: "nav_parts" },
    { href: "#/app/more", icon: "more", key: "nav_more" },
  ];

  var VECOM_PHONE = "+381637719787";
  var VECOM_PHONE_LABEL = "+381 63 7719 787";
  var VIBER = "viber://chat?number=%2B381692296005";

  function myTickets() {
    return S.tickets.filter(function (t) { return t.company === DATA.demo.company.name; });
  }

  function myOpenTickets() {
    return myTickets().filter(function (t) { return t.status !== "reseno"; });
  }

  function instBySlug(slug) {
    return DATA.demo.installations.filter(function (i) { return i.slug === slug; })[0] || null;
  }

  function cuBadge(href) {
    if (href === "#/app/tickets") return myOpenTickets().length;
    if (href === "#/app/parts") return S.cart.reduce(function (n, c) { return n + c.qty; }, 0);
    if (href === "#/app/news") return portalPosts().length;
    return 0;
  }

  function customerShell(current, html, o) {
    o = o || {};
    var c = DATA.demo.company;
    var nav = CU_NAV.map(function (n) {
      var b = cuBadge(n.href);
      return '<a href="' + n.href + '" class="' + (n.href === current ? "on" : "") + '">' + ico(n.icon) +
        "<span>" + esc(u(n.key)) + "</span>" + (b ? '<i class="cu-badge">' + b + "</i>" : "") + "</a>";
    }).join("");
    var navHit = CU_NAV.filter(function (n) { return n.href === current; })[0];
    var title = o.title || (navHit ? u(navHit.key) : "");

    return '<div class="cu" lang="' + S.cuLang + '">' +
      '<aside class="cu-side">' +
      '<div class="cu-salon"><span class="cu-av">SL</span><div class="grow"><div class="small">' + esc(c.name) + "</div>" +
      '<div class="tiny muted">' + esc(c.contact) + " · " + esc(c.city) + "</div></div></div>" +
      '<nav class="cu-nav">' + nav + "</nav>" +
      '<div class="cu-help"><div class="tiny muted">' + esc(u("support")) + '</div><div class="small">' + VECOM_PHONE_LABEL + "</div>" +
      '<div class="row" style="gap:6px;margin-top:8px"><a class="btn sm grow" href="tel:' + VECOM_PHONE + '">' + esc(u("call")) + "</a>" +
      '<a class="btn ghost sm grow" href="' + VIBER + '">Viber</a></div></div>' +
      '<button class="cu-logout" data-logout="1">' + ico("logout", 16) + "<span>" + esc(u("logout")) + "</span></button>" +
      "</aside>" +
      '<section class="cu-main">' +
      '<header class="cu-top"><div class="grow"><div class="eyebrow">' + esc(o.eyebrow || c.name + " · " + c.city) + "</div>" +
      "<h1>" + esc(title) + "</h1></div>" +
      cuLangSwitch() +
      '<a class="adm-icon cu-bell" href="#/app/notices" aria-label="' + esc(u("nav_notices")) + '">' + ico("bell", 17) + (unreadCount() ? '<i class="cu-badge">' + unreadCount() + "</i>" : "") + "</a>" +
      (o.action || '<a class="btn sm cu-top-cta" href="#/app/fault">' + ico("alert", 15) + " " + esc(u("report_fault")) + "</a>") +
      "</header>" +
      '<div class="cu-content">' + html + "</div>" +
      "</section>" +
      '<nav class="cu-tabs">' + CU_TABS.map(function (n) {
        var on = n.href === current || (n.href === "#/app/more" && ["#/app/devices", "#/app/protocols", "#/app/docs", "#/app/news", "#/app/more", "#/app/notices"].indexOf(current) >= 0);
        var b = n.href === "#/app/tickets" || n.href === "#/app/parts" ? cuBadge(n.href) : 0;
        return '<a href="' + n.href + '" class="' + (on ? "on" : "") + '">' + ico(n.icon, 20) +
          "<span>" + esc(u(n.key)) + "</span>" + (b ? '<i class="cu-badge">' + b + "</i>" : "") + "</a>";
      }).join("") + "</nav>" +
      "</div>";
  }

  /* prsten stanja: garancija i sonda */
  function ring(pct, cls, big, small) {
    var r = 26, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct));
    return '<div class="ring ' + cls + '"><svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">' +
      '<circle cx="32" cy="32" r="' + r + '" class="ring-bg"/>' +
      '<circle cx="32" cy="32" r="' + r + '" class="ring-fg" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - p / 100)).toFixed(1) + '"/>' +
      '</svg><div class="ring-t"><b>' + esc(big) + "</b><span>" + esc(small) + "</span></div></div>";
  }

  function warrantyRing(inst) {
    var left = daysUntil(inst.warrantyUntil);
    var total = Math.round((new Date(inst.warrantyUntil) - new Date(inst.delivered)) / 86400000);
    if (left < 0) return ring(100, "alert", "0 " + u("d"), u("ring_expired"));
    return ring((left / total) * 100, left < 60 ? "warn" : "ok", left + " " + u("d"), u("ring_warranty"));
  }

  function probeRing(inst) {
    var pct = Math.round((inst.probe.used / inst.probe.total) * 100);
    return ring(pct, pct >= 85 ? "alert" : pct >= 70 ? "warn" : "ok", pct + "%", inst.probe.name.indexOf("Sonda") === 0 ? u("ring_probe") : u("ring_handpiece"));
  }

  function deviceStatus(inst) {
    var open = myOpenTickets().filter(function (t) { return t.slug === inst.slug; })[0];
    if (open) return '<span class="pill warn"><i class="dot"></i>' + esc(u("st_service", { id: open.id })) + "</span>";
    if (daysUntil(inst.warrantyUntil) < 0) return '<span class="pill"><i class="dot"></i>' + esc(u("st_nowarranty")) + "</span>";
    return '<span class="pill ok"><i class="dot"></i>' + esc(u("st_ok")) + "</span>";
  }

  function cuProductName(p) {
    return S.cuLang === "de" ? p.nameDe || p.name : S.cuLang === "en" ? p.nameEn || p.name : p.name;
  }
  function cuProductDesc(p) {
    return S.cuLang === "de" ? p.descDe || p.desc : S.cuLang === "en" ? p.descEn || p.desc : p.desc;
  }

  function deviceCard(inst) {
    var p = product(inst.slug);
    return '<button class="cu-dev" data-nav="#/app/device/' + esc(inst.slug) + '">' +
      '<div class="cu-dev-img">' + (p && p.image ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy">' : "") + "</div>" +
      '<div class="cu-dev-info">' +
      '<div class="row spread wrap" style="gap:8px"><h3>' + esc(p ? cuProductName(p) : inst.slug) + "</h3>" + deviceStatus(inst) + "</div>" +
      '<div class="tiny muted">' + esc(inst.serial) + " · " + esc(u("code")) + " " + esc(inst.sku) + "</div>" +
      '<div class="cu-rings">' + warrantyRing(inst) + probeRing(inst) + "</div>" +
      "</div></button>";
  }

  function flowL(key) { return (L[S.cuLang] && L[S.cuLang]["flow_" + key]) || flowLabel(key); }

  function miniSteps(t) {
    var cur = flowIndex(t.status);
    return '<div class="steps-h">' + TICKET_FLOW.map(function (st, i) {
      return '<div class="sh ' + (i < cur ? "done" : i === cur ? "now" : "") + '"><i></i><span>' + esc(flowL(st.key)) + "</span></div>";
    }).join("") + "</div>";
  }

  function ticketCard(t) {
    var p = product(t.slug);
    var last = t.messages[t.messages.length - 1];
    return '<button class="cu-ticket" data-nav="#/app/ticket/' + t.id + '">' +
      '<div class="row spread wrap" style="gap:8px"><div><div class="small">#' + t.id + " · " + esc(t.issue) + "</div>" +
      '<div class="tiny muted">' + esc(p ? cuProductName(p) : t.slug) + " · " + esc(u("reported")) + " " + dmy(t.opened) + "</div></div>" +
      '<span class="pill ' + (t.status === "reseno" ? "ok" : "warn") + '"><i class="dot"></i>' + esc(flowL(t.status)) + "</span></div>" +
      miniSteps(t) +
      (last ? '<div class="cu-last"><span class="tiny muted">' + esc(last.from === "vecom" ? u("vecom_service") : u("you")) + ":</span> " + esc(last.text) + "</div>" : "") +
      "</button>";
  }

  function activity() {
    var ev = [];
    DATA.demo.installations.forEach(function (i) {
      var p = product(i.slug), nm = p ? cuProductName(p) : i.slug;
      ev.push({ d: i.delivered, icon: "zap", t: u("act_delivered", { d: nm }) });
      i.trained.forEach(function (x) { ev.push({ d: x.date, icon: "users", t: u("act_trained", { n: x.name, d: nm }) }); });
      i.service.forEach(function (s) { ev.push({ d: s.date, icon: "check", t: tx(s.title) + " · " + nm }); });
    });
    myTickets().forEach(function (t) { ev.push({ d: t.opened, icon: "alert", t: u("act_ticket", { id: t.id, i: t.issue }) }); });
    ev.push({ d: "2026-06-12", icon: "box", t: u("act_order", { id: 1198 }) });
    ev.sort(function (a, b) { return a.d < b.d ? 1 : -1; });
    return ev;
  }

  function activityList(n) {
    return '<div class="cu-act">' + activity().slice(0, n).map(function (e) {
      return '<div class="cu-act-i"><span class="cu-act-ic">' + ico(e.icon, 15) + '</span><div class="grow"><div class="small">' + esc(e.t) + "</div>" +
        '<div class="tiny muted">' + dmy(e.d) + "</div></div></div>";
    }).join("") + "</div>";
  }

  // objava na jeziku naloga; nemački fali na njihovom blogu, pa pada na engleski
  function postText(p, field) {
    var v = p[field];
    return S.cuLang === "de" ? v.de || v.en || v.sr : S.cuLang === "en" ? v.en || v.sr : v.sr;
  }
  function postBody(p) {
    var b = p.body;
    return S.cuLang === "de" ? (b.de && b.de.length ? b.de : b.en && b.en.length ? b.en : b.sr)
      : S.cuLang === "en" ? (b.en && b.en.length ? b.en : b.sr) : b.sr;
  }

  function postCard(p, href) {
    return '<a class="cu-post" href="' + href + '">' +
      (p.image ? '<div class="cu-post-img"><img src="' + esc(p.image) + '" alt="" loading="lazy"></div>' : "") +
      '<div class="cu-post-b"><div class="tiny muted">' + dmy(p.date) + (p.audience !== "all" ? " · " + esc(u("for_owners", { d: (product(p.audience) || {}).name || "" })) : "") + "</div>" +
      "<h3>" + esc(postText(p, "title")) + "</h3>" +
      '<p class="small muted">' + esc(postText(p, "excerpt")) + "</p></div></a>";
  }

  function greeting() {
    var h = new Date().getHours();
    return u(h < 11 ? "hello_morning" : h < 18 ? "hello_day" : "hello_evening");
  }

  function cuToday() {
    var s = new Date().toLocaleDateString({ sr: "sr-Latn-RS", de: "de-AT", en: "en-GB" }[S.cuLang], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function viewCustomerHome() {
    var c = DATA.demo.company;
    var inst = DATA.demo.installations;
    var sonata = instBySlug("sonata-4xd");
    var probePct = Math.round((sonata.probe.used / sonata.probe.total) * 100);
    var open = myOpenTickets();
    var posts = portalPosts().slice(0, 2);

    var quick = [
      { href: "#/app/fault", icon: "alert", t: u("report_fault"), s: u("q_fault_s") },
      { href: "#/app/parts", icon: "cart", t: u("nav_parts"), s: u("q_parts_s") },
      { href: "#/app/protocols", icon: "book", t: u("nav_protocols"), s: u("q_proto_s") },
      { href: "tel:" + VECOM_PHONE, icon: "phoneCall", t: u("q_call"), s: VECOM_PHONE_LABEL },
    ];

    var html =
      '<section class="cu-hero">' +
      '<div class="cu-hero-t"><div class="eyebrow">' + esc(cuToday()) + "</div>" +
      "<h2>" + esc(greeting()) + ", " + esc(c.contact.split(" ")[0]) + ".</h2>" +
      '<p class="muted">' + esc(u("home_sum", { n: inst.length, s: open.length, p: probePct })) + "</p></div>" +
      '<div class="cu-quick">' + quick.map(function (q) {
        return '<a class="cu-q" href="' + q.href + '"><span class="cu-q-ic">' + ico(q.icon, 18) + "</span>" +
          '<span class="small">' + esc(q.t) + '</span><span class="tiny muted">' + esc(q.s) + "</span></a>";
      }).join("") + "</div></section>" +

      (probePct >= 70
        ? '<div class="cu-alert">' + ico("alert", 18) + '<div class="grow"><div class="small">' + esc(u("probe_h", { p: probePct })) + "</div>" +
          '<div class="tiny muted">' + esc(u("probe_x")) + "</div></div>" +
          '<button class="btn sm" data-quick-part="p1">' + esc(u("probe_btn")) + "</button></div>"
        : "") +

      '<div class="cu-sec"><div class="row spread"><h3>' + esc(u("nav_devices")) + '</h3><a class="panel-link" href="#/app/devices">' + esc(u("all_devices")) + ico("chev", 14) + "</a></div>" +
      '<div class="cu-devs">' + inst.map(deviceCard).join("") + "</div></div>" +

      '<div class="cu-cols">' +
      '<div class="cu-col">' +
      '<article class="panel"><div class="row spread mb"><div><div class="eyebrow">' + esc(u("nav_service")) + "</div><h3>" + esc(open.length ? u("svc_open") : u("svc_ok")) + "</h3></div>" +
      '<a class="panel-link" href="#/app/tickets">' + esc(u("all_services")) + ico("chev", 14) + "</a></div>" +
      (open.length ? '<div class="list">' + open.map(ticketCard).join("") + "</div>" : '<p class="small muted">' + esc(u("svc_none")) + "</p>") +
      "</article>" +
      '<article class="panel"><div class="eyebrow">' + esc(u("history")) + '</div><h3 class="mb">' + esc(u("activity")) + "</h3>" + activityList(5) + "</article>" +
      "</div>" +
      '<div class="cu-col">' + appCard() + courseCard() +
      '<article class="panel"><div class="row spread mb"><div><div class="eyebrow">' + esc(u("from_vecom")) + "</div><h3>" + esc(u("nav_news")) + "</h3></div>" +
      '<a class="panel-link" href="#/app/news">' + esc(u("all")) + ico("chev", 14) + "</a></div>" +
      '<div class="list">' + posts.map(function (p) { return postCard(p, "#/app/news/" + p.slug); }).join("") + "</div></article>" +
      '<article class="panel cu-contact"><div class="eyebrow">' + esc(u("your_contact")) + "</div>" +
      '<div class="row" style="margin:10px 0 12px"><span class="cu-av">JR</span><div><div class="small">' + esc(DATA.demo.admin.name) + "</div>" +
      '<div class="tiny muted">' + esc(u("sales_support")) + " · " + esc(DATA.demo.admin.email) + "</div></div></div>" +
      '<div class="grid3" style="gap:6px"><a class="btn sm" href="tel:' + VECOM_PHONE + '">' + esc(u("call")) + "</a>" +
      '<a class="btn ghost sm" href="' + VIBER + '">Viber</a>' +
      '<a class="btn ghost sm" href="mailto:' + esc(DATA.demo.admin.email) + '">' + esc(u("mail")) + "</a></div></article>" +
      "</div></div>";

    return customerShell("#/app", html);
  }

  function viewDevices() {
    return customerShell("#/app/devices",
      '<div class="cu-devs">' + DATA.demo.installations.map(deviceCard).join("") + "</div>" +
      '<p class="small muted mt">' + esc(u("devices_note")) + "</p>");
  }

  function viewDevice(slug) {
    var inst = instBySlug(slug);
    if (!inst) return customerShell("#/app/devices", '<div class="card">' + esc(u("not_found")) + "</div>");
    var p = product(slug);
    var tab = S.devTab || "pregled";
    var tabs = [["pregled", u("tab_overview")], ["servis", u("nav_service")], ["obuka", u("tab_training")], ["spec", u("tab_spec")]];
    var tickets = myTickets().filter(function (t) { return t.slug === slug; });

    var body;
    if (tab === "servis") {
      body = (tickets.length ? '<div class="list mb">' + tickets.map(ticketCard).join("") + "</div>" : "") +
        '<article class="panel"><h3 class="mb">' + esc(u("svc_history")) + '</h3><div class="cu-act">' + inst.service.map(function (s) {
          return '<div class="cu-act-i"><span class="cu-act-ic">' + ico("check", 15) + '</span><div class="grow"><div class="small">' + esc(tx(s.title)) + "</div>" +
            '<div class="tiny muted">' + dmy(s.date) + " · " + esc(u("closed")) + "</div></div></div>";
        }).join("") + "</div></article>";
    } else if (tab === "obuka") {
      body = '<article class="panel"><h3 class="mb">' + esc(u("trained_h")) + '</h3><div class="list">' + inst.trained.map(function (x) {
        return '<div class="item" style="cursor:default"><span class="cu-av sm">' + esc(initials(x.name)) + '</span><div class="grow"><div class="small">' + esc(x.name) + "</div>" +
          '<div class="tiny muted">' + esc(u("cert_issued", { d: dmy(x.date) })) + "</div></div>" +
          '<button class="btn ghost sm" data-download="' + esc(u("certificate") + " — " + x.name) + '">' + ico("download", 14) + " " + esc(u("certificate")) + "</button></div>";
      }).join("") + "</div>" +
        '<div class="cu-alert soft mt">' + ico("users", 18) + '<div class="grow"><div class="small">' + esc(u("newcolleague_h")) + '</div><div class="tiny muted">' + esc(u("newcolleague_x")) + "</div></div>" +
        '<button class="btn ghost sm" data-toast="' + esc(u("training_sent")) + '">' + esc(u("book_training")) + "</button></div></article>";
    } else if (tab === "spec") {
      body = '<article class="panel">' + (p && p.specs && p.specs.length ? p.specs.map(function (s) {
        return '<details class="cu-spec"><summary>' + esc(s.title) + '</summary><div class="small muted">' + esc(s.text) + "</div></details>";
      }).join("") + (S.cuLang !== "sr" ? '<p class="tiny muted mt">' + esc(u("spec_sr_only")) + "</p>" : "") : '<p class="small muted">' + esc(u("spec_none")) + "</p>") + "</article>";
    } else {
      body = '<div class="cu-cols"><div class="cu-col"><article class="panel"><h3 class="mb">' + esc(u("data")) + '</h3><div class="kv">' +
        '<span class="k">' + esc(u("serial")) + '</span><span class="v">' + esc(inst.serial) + "</span>" +
        '<span class="k">' + esc(u("code")) + '</span><span class="v">' + esc(inst.sku) + "</span>" +
        '<span class="k">' + esc(u("delivered")) + '</span><span class="v">' + dmy(inst.delivered) + "</span>" +
        '<span class="k">' + esc(u("warranty_until")) + '</span><span class="v">' + dmy(inst.warrantyUntil) + "</span>" +
        '<span class="k">' + esc(tx(inst.probe.name)) + '</span><span class="v">' + inst.probe.used.toLocaleString("sr-RS") + " / " + inst.probe.total.toLocaleString("sr-RS") + "</span>" +
        "</div></article></div>" +
        '<div class="cu-col"><article class="panel"><h3 class="mb">' + esc(u("quick_actions")) + '</h3><div class="cu-quick two">' +
        [["#/app/fault", "alert", u("report_fault")], ["#/app/parts", "cart", u("order_parts")], ["#/app/protocols", "book", u("nav_protocols")], ["#/app/docs", "file", u("nav_docs")]].map(function (q) {
          return '<a class="cu-q" href="' + q[0] + '"><span class="cu-q-ic">' + ico(q[1], 18) + '</span><span class="small">' + esc(q[2]) + "</span></a>";
        }).join("") + "</div></article>" +
        (daysUntil(inst.warrantyUntil) < 0
          ? '<div class="cu-alert mt">' + ico("shield", 18) + '<div class="grow"><div class="small">' + esc(u("warranty_exp", { d: dmy(inst.warrantyUntil) })) + "</div>" +
            '<div class="tiny muted">' + esc(u("contract_x")) + "</div></div>" +
            '<button class="btn sm" data-toast="' + esc(u("contract_sent")) + '">' + esc(u("offer")) + "</button></div>"
          : "") +
        "</div></div>";
    }

    var html =
      '<a class="small muted" href="#/app/devices">‹ ' + esc(u("nav_devices")) + "</a>" +
      '<section class="cu-dhero mt">' +
      '<div class="cu-dhero-img">' + (p && p.image ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '">' : "") + "</div>" +
      '<div class="cu-dhero-t">' + deviceStatus(inst) +
      "<h2>" + esc(p ? cuProductName(p) : slug) + "</h2>" +
      '<p class="small muted">' + esc(p ? cuProductDesc(p) : "") + "</p>" +
      '<div class="cu-rings">' + warrantyRing(inst) + probeRing(inst) + "</div>" +
      "</div></section>" +
      '<div class="seg mt">' + tabs.map(function (x) {
        return '<button class="' + (tab === x[0] ? "on" : "") + '" data-dev-tab="' + x[0] + '">' + esc(x[1]) + "</button>";
      }).join("") + "</div>" +
      '<div class="mt">' + body + "</div>";

    return customerShell("#/app/devices", html, { title: p ? cuProductName(p) : "", eyebrow: inst.serial });
  }

  function viewCustomerNews(slug) {
    var posts = portalPosts();
    if (slug) {
      var p = posts.filter(function (x) { return x.slug === slug; })[0];
      if (!p) return customerShell("#/app/news", '<div class="card">' + esc(u("not_found")) + "</div>");
      var body = postBody(p).map(function (b) {
        return b.style === "h2" || b.style === "h3" ? "<h3>" + esc(b.text) + "</h3>" : "<p>" + esc(b.text) + "</p>";
      }).join("");
      var fallback = S.cuLang === "de" && !(p.body.de && p.body.de.length) ? '<p class="tiny muted">' + esc(u("de_fallback")) + "</p>" : "";
      return customerShell("#/app/news",
        '<a class="small muted" href="#/app/news">‹ ' + esc(u("all_news")) + "</a>" +
        '<article class="cu-article mt">' + (p.image ? '<img src="' + esc(p.image) + '" alt="">' : "") + fallback +
        '<div class="tiny muted">' + dmy(p.date) + "</div><h2>" + esc(postText(p, "title")) + "</h2>" +
        '<p class="lead">' + esc(postText(p, "excerpt")) + "</p>" + body + "</article>",
        { eyebrow: u("from_vecom") });
    }
    return customerShell("#/app/news",
      '<div class="cu-posts">' + posts.map(function (p) { return postCard(p, "#/app/news/" + p.slug); }).join("") + "</div>",
      { eyebrow: u("from_vecom") });
  }

  function viewCustomerMore() {
    var links = [
      ["#/app/devices", "zap", u("nav_devices"), u("more_devices")],
      ["#/app/protocols", "book", u("nav_protocols"), u("more_protocols")],
      ["#/app/docs", "file", u("nav_docs"), u("more_docs")],
      ["#/app/news", "news", u("nav_news"), u("more_news")],
      ["#/app/notices", "bell", u("nav_notices"), u("more_notices")],
      ["tel:" + VECOM_PHONE, "phoneCall", u("q_call"), VECOM_PHONE_LABEL],
    ];
    return customerShell("#/app/more",
      '<div class="list">' + links.map(function (l) {
        return '<a class="item" href="' + l[0] + '" style="text-decoration:none"><span class="cu-q-ic">' + ico(l[1], 18) + "</span>" +
          '<div class="grow"><div class="small">' + esc(l[2]) + '</div><div class="tiny muted">' + esc(l[3]) + '</div></div><span class="chev">›</span></a>';
      }).join("") +
      '<button class="item" data-logout="1"><span class="cu-q-ic">' + ico("logout", 18) + '</span><div class="grow small">' + esc(u("logout")) + "</div></button></div>",
      { title: u("nav_more") });
  }

  function viewCustomerTickets() {
    var list = myTickets();
    return customerShell("#/app/tickets",
      (list.length ? '<div class="list">' + list.map(ticketCard).join("") + "</div>" : '<div class="card">' + esc(u("no_tickets")) + "</div>") +
      '<p class="small muted mt">' + esc(u("tickets_note")) + "</p>");
  }

  /* ---------- B · aplikacija na telefonu: instalacija i obaveštenja ---------- */

  var installEvt = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    installEvt = e;
    if (location.hash === "#/app") route();
  });
  window.addEventListener("appinstalled", function () {
    installEvt = null;
    toast(u("pwa_installed"));
  });

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
  function notifState() { return "Notification" in window ? Notification.permission : "unsupported"; }

  function appCard() {
    var ns = notifState();
    var install = isStandalone()
      ? ""
      : '<div class="small" style="margin:6px 0 10px">' + esc(u("pwa_x")) + "</div>" +
        (installEvt
          ? '<button class="btn sm" data-pwa-install="1">' + ico("download", 15) + " " + esc(u("pwa_install")) + "</button>"
          : '<div class="tiny muted">' + esc(isIOS() ? u("pwa_ios") : u("pwa_menu")) + "</div>");
    var notif =
      ns === "granted" ? '<span class="pill ok"><i class="dot"></i>' + esc(u("pwa_on")) + "</span>"
        : ns === "denied" ? '<div class="tiny muted">' + esc(u("pwa_blocked")) + "</div>"
          : ns === "unsupported" ? '<div class="tiny muted">' + esc(u("pwa_ios_notif")) + "</div>"
            : '<button class="btn ghost sm" data-pwa-notify="1">' + ico("bell", 15) + " " + esc(u("pwa_enable")) + "</button>";
    return '<article class="panel app-card"><div class="row" style="gap:12px"><span class="app-ic">V</span>' +
      '<div><div class="eyebrow">' + esc(u("pwa_eyebrow")) + "</div><h3>" + esc(u("pwa_h")) + "</h3></div></div>" +
      install +
      '<div class="app-notif"><div class="tiny muted">' + esc(u("pwa_notif_x")) + "</div>" + notif + "</div></article>";
  }

  function unreadCount() { return S.notices.filter(function (n) { return n.unread; }).length; }

  // obaveštenje u nalogu + sistemsko obaveštenje na telefonu, ako je dozvoljeno
  function notify(text, href) {
    S.notices.unshift({ at: u("just_now"), text: text, href: href, unread: true });
    if (notifState() !== "granted") return;
    var opts = { body: text, icon: "/pwa-icon/192", badge: "/pwa-icon/192", data: { url: "/" + (href || "#/app") } };
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(function (reg) { reg.showNotification("Moj Vecom", opts); });
    } else {
      try { new Notification("Moj Vecom", opts); } catch (e) { /* Android traži service worker */ }
    }
  }

  function viewNotices() {
    var list = S.notices.map(function (n) {
      var inner = '<span class="cu-act-ic">' + ico("bell", 15) + '</span><div class="grow"><div class="small">' + esc(tx(n.text)) + "</div>" +
        '<div class="tiny muted">' + esc(tx(n.at)) + "</div></div>" + (n.unread ? '<i class="unread-dot"></i>' : "");
      return n.href
        ? '<a class="item" href="' + n.href + '" style="text-decoration:none">' + inner + '<span class="chev">›</span></a>'
        : '<div class="item" style="cursor:default">' + inner + "</div>";
    }).join("");
    S.notices.forEach(function (n) { n.unread = false; });
    return customerShell("#/app/notices",
      '<div class="list">' + (list || '<div class="card small muted">' + esc(u("no_notices")) + "</div>") + "</div>" +
      '<div class="mt">' + appCard() + "</div>",
      { title: u("nav_notices") });
  }

  /* ---------- B · edukacija: mini kurs + sertifikat ----------
     Video se snima posle sastanka i deli na 20 delova. Dok klip ne postoji,
     lekcija prikazuje okvir "klip X/20"; kad se doda putanja u `video`,
     prikazuje se pravi <video> i lekcija se sama završava kad se odgleda.
     Tekst kursa postoji na SR/DE/EN (COURSE + COURSE_TX); snimak je na srpskom. */

  var COURSE = {
    title: "Sonata 4XD — od prvog tretmana do servisa",
    school: "Vecom Akademija",
    modules: [
      { title: "Upoznavanje sa aparatom", lessons: [
        { t: "Dobrodošli: šta ćete naučiti", d: "3:10", x: "Kratak pregled kursa i kako da ga pratite. Na kraju svake lekcije označite je kao odgledanu — posle poslednje dobijate sertifikat.", k: ["20 kratkih lekcija, 5 modula", "Svaka lekcija: video + tekst za podsetnik", "Sertifikat za štampu na kraju"] },
        { t: "Delovi aparata i ručica", d: "5:40", x: "Kućište, displej, ručica sa kristalom, rashladni sistem i priključci. Šta se sme dirati, a šta otvara samo servis.", k: ["Ručica se nikad ne vuče za kabl", "Kristal se čisti samo preporučenim sredstvom", "Plombe na kućištu čuvaju garanciju"] },
        { t: "Uključivanje, displej i meni", d: "4:25", x: "Redosled uključivanja, zagrevanje i hlađenje, glavni meni i čuvanje sopstvenih programa po klijentu.", k: ["Sačekajte da hlađenje dođe na radnu temperaturu", "Programe čuvajte po zoni i fototipu", "Isključivanje uvek preko menija, ne prekidačem"] },
        { t: "Hlađenje i destilovana voda", d: "4:50", x: "Kako radi rashladni krug, koliko često se dopunjava i zašto se koristi isključivo destilovana voda.", k: ["Nivo proveriti svakog jutra", "Samo destilovana voda", "Nizak nivo = greška E-04"] },
      ] },
      { title: "Bezbednost", lessons: [
        { t: "Zaštitne naočare i prostor", d: "3:55", x: "Naočare za operatera i klijenta, svetlo u kabini i uklanjanje reflektujućih površina.", k: ["Naočare nose i operater i klijent", "Bez ogledala u pravcu snopa", "Natpis na vratima dok aparat radi"] },
        { t: "Kontraindikacije", d: "6:20", x: "Kada se tretman ne radi ili se odlaže: trudnoća, fotosenzitivni lekovi, aktivne infekcije, sveža preplanulost.", k: ["Uvek pitati za lekove i izotretinoin", "Sveža preplanulost = odložiti", "Sumnja = ne raditi, pitati lekara"] },
        { t: "Fototipovi kože", d: "5:30", x: "Fitzpatrick skala od I do VI u praksi i kako fototip određuje talasnu dužinu i energiju.", k: ["Fototip se procenjuje pre svakog prvog tretmana", "Tamniji fototip = duža talasna dužina", "Beleška u kartonu klijenta"] },
        { t: "Test tačka i pristanak klijenta", d: "3:40", x: "Test na maloj površini 48 sati pre prvog tretmana i potpisan pristanak klijenta.", k: ["Test tačka na manje vidljivom mestu", "Pregled reakcije posle 48 h", "Pristanak se čuva u kartonu"] },
      ] },
      { title: "Priprema tretmana", lessons: [
        { t: "Konsultacija i anamneza", d: "4:15", x: "Šta pitati na prvom susretu, kako objasniti broj tretmana i realna očekivanja.", k: ["6–8 tretmana za većinu zona", "Razmak 4–6 nedelja", "Objasniti da dlaka ispada posle 1–2 nedelje"] },
        { t: "Priprema kože i brijanje", d: "3:20", x: "Brijanje dan ranije, bez depilacije voskom, čista suva koža bez krema i dezodoransa.", k: ["Brijanje 12–24 h pre tretmana", "Bez voska i čupanja 4 nedelje ranije", "Koža čista i suva"] },
        { t: "Gel i kontakt ručice", d: "3:05", x: "Koliko gela, kako se drži ručica i zašto je pun kontakt važan za bezbednost i efekat.", k: ["Tanak ravnomeran sloj gela", "Ručica pod pravim uglom", "Pun kontakt sa kožom pri svakom flešu"] },
        { t: "Izbor talasne dužine", d: "6:45", x: "Kada 755, 808, 940 ili 1064 nm i kako ih Sonata kombinuje za različite dubine folikula.", k: ["755 nm — svetla koža, tanka dlaka", "808 nm — univerzalna, gusta dlaka", "1064 nm — tamni fototipovi, duboki folikuli"] },
      ] },
      { title: "Tretmani po zonama", lessons: [
        { t: "Lice i gornja usna", d: "5:10", x: "Male zone sa tankom dlakom: manji spot, niža frekvencija i posebna pažnja oko očiju.", k: ["Nikad u zoni obrva ispod koštanog luka", "Kraći impulsi, manja energija", "Hlađenje posle tretmana"] },
        { t: "Pazuh i bikini", d: "5:35", x: "Gusta i duboko ukorenjena dlaka: parametri, redosled prolaza i komfor klijenta.", k: ["Zatezanje kože slobodnom rukom", "Prolazi u ukrštenim pravcima", "Pauza ako je neprijatno"] },
        { t: "Noge i ruke — in-motion tehnika", d: "7:20", x: "Velike zone brzo i ravnomerno: in-motion režim, podela na polja i kontrola broja prolaza.", k: ["Podelite zonu na polja od oko 10×10 cm", "3–4 prolaza po polju", "Ujednačena brzina ručice"] },
        { t: "Leđa i grudi — muški klijenti", d: "4:55", x: "Gusta dlaka i veće površine: kako prilagoditi parametre i trajanje tretmana.", k: ["Počnite nižom energijom", "Više pauza zbog toplote", "Planirajte duži termin"] },
      ] },
      { title: "Posle tretmana i održavanje", lessons: [
        { t: "Nega posle tretmana", d: "3:45", x: "Hlađenje, umirujuće kreme, zaštita od sunca i šta klijent ne sme da radi prvih dana.", k: ["SPF 50 najmanje dve nedelje", "Bez saune i teretane 48 h", "Crvenilo prolazi za nekoliko sati"] },
        { t: "Čišćenje ručice i filtera", d: "4:05", x: "Dnevno i nedeljno održavanje: kristal ručice, kućište i filter rashladnog sistema.", k: ["Kristal posle svakog klijenta", "Filter se menja na 12 meseci", "Aparat isključen pri čišćenju"] },
        { t: "Sonda: praćenje fleševa i zamena", d: "3:30", x: "Gde se vidi broj fleševa, šta znači procenat resursa i kada poručiti rezervnu sondu.", k: ["Pratite resurs u Moj Vecom nalogu", "Poručite rezervnu na 75–80%", "Zamenu radi ovlašćeni servis"] },
        { t: "Greške na displeju i kada zvati servis", d: "5:15", x: "Najčešće šifre grešaka, šta možete da proverite sami i kako se prijavljuje kvar sa fotografijom.", k: ["E-04: proverite nivo vode", "Ne otvarajte kućište", "Kvar prijavite iz naloga, sa slikom displeja"] },
      ] },
    ],
  };

  function courseLessons() {
    var out = [];
    COURSE.modules.forEach(function (m, mi) {
      m.lessons.forEach(function (l) { out.push(Object.assign({ n: out.length + 1, mi: mi, module: m.title, video: null }, l)); });
    });
    return out;
  }
  var LESSONS = courseLessons();

  // tekst kursa na jeziku naloga (SR je izvor, DE/EN iz COURSE_TX)
  function cTx() { return S.cuLang !== "sr" ? COURSE_TX[S.cuLang] : null; }
  function cTitle() { return cTx() ? cTx().title : COURSE.title; }
  function cSchool() { return cTx() ? cTx().school : COURSE.school; }
  function cModule(mi) { return cTx() ? cTx().modules[mi] : COURSE.modules[mi].title; }
  function lessonT(l) { var x = cTx(); return x ? Object.assign({}, l, x.lessons[l.n - 1]) : l; }

  function doneCount() { return LESSONS.filter(function (l) { return S.course.done[l.n]; }).length; }
  function courseDone() { return doneCount() === LESSONS.length && quizzesPassed() === QUIZ.length; }
  function nextLesson() { return LESSONS.filter(function (l) { return !S.course.done[l.n]; })[0] || LESSONS[0]; }

  function lessonRow(l, active) {
    var done = !!S.course.done[l.n];
    return '<a class="lesson' + (done ? " done" : "") + (active ? " on" : "") + '" href="#/app/edu/' + l.n + '">' +
      '<span class="lesson-n">' + (done ? ico("check", 14) : l.n) + "</span>" +
      '<span class="grow"><span class="small">' + esc(lessonT(l).t) + '</span><span class="tiny muted">' + l.d + " min</span></span></a>";
  }

  function courseCard() {
    var n = doneCount(), pct = Math.round((n / LESSONS.length) * 100);
    var nl = nextLesson();
    return '<article class="panel cu-course">' +
      '<div class="row" style="gap:16px;align-items:center">' + ring(pct, "ok", n + "/" + LESSONS.length, u("lessons_short")) +
      '<div class="grow"><div class="eyebrow">' + esc(cSchool()) + "</div><h3>" + esc(cTitle()) + "</h3>" +
      '<div class="small muted">' + esc(courseDone() ? u("course_done") : u("next_lesson", { n: nl.n, t: lessonT(nl).t })) + "</div></div></div>" +
      '<div class="row wrap mt" style="gap:8px">' +
      (courseDone()
        ? '<a class="btn sm" href="#/app/edu/cert">' + ico("grad", 15) + " " + esc(u("certificate")) + "</a>"
        : '<a class="btn sm" href="#/app/edu/' + nl.n + '">' + ico("play", 15) + " " + esc(n ? u("continue") : u("start_course")) + "</a>") +
      '<a class="btn ghost sm" href="#/app/edu">' + esc(u("all_lessons")) + "</a></div></article>";
  }

  function viewEdu() {
    var n = doneCount(), pct = Math.round((n / LESSONS.length) * 100);
    var nl = nextLesson();
    var html =
      '<section class="edu-hero">' +
      '<div class="grow"><div class="eyebrow">' + esc(cSchool()) + " · " + esc(u("online_course")) + "</div>" +
      "<h2>" + esc(cTitle()) + "</h2>" +
      '<p class="muted">' + esc(u("edu_intro", { l: LESSONS.length, m: COURSE.modules.length })) + "</p>" +
      '<div class="bar mt" style="max-width:420px"><i class="ok" style="width:' + pct + '%"></i></div>' +
      '<div class="tiny muted" style="margin-top:6px">' + esc(u("edu_progress", { n: n, l: LESSONS.length, p: pct, q: quizzesPassed(), qt: QUIZ.length })) + "</div>" +
      '<div class="row wrap mt" style="gap:8px">' +
      (courseDone()
        ? '<a class="btn" href="#/app/edu/cert">' + ico("grad", 16) + " " + esc(u("get_cert")) + "</a>"
        : '<a class="btn" href="#/app/edu/' + nl.n + '">' + ico("play", 16) + " " + esc(n ? u("continue_lesson", { n: nl.n }) : u("start_course")) + "</a>") +
      "</div>" +
      (S.cuLang !== "sr" ? '<p class="tiny muted mt">' + esc(u("video_sr")) + "</p>" : "") +
      "</div>" +
      '<div class="edu-cert-teaser' + (courseDone() ? " open" : "") + '">' + ico("grad", 26) +
      '<div class="small">' + esc(courseDone() ? u("cert_unlocked") : u("cert_locked_x")) + "</div>" +
      '<div class="tiny muted">' + esc(u("cert_teaser")) + "</div></div>" +
      "</section>" +
      '<div class="edu-modules">' + COURSE.modules.map(function (m, mi) {
        var ls = LESSONS.filter(function (l) { return l.mi === mi; });
        var md = ls.filter(function (l) { return S.course.done[l.n]; }).length;
        return '<article class="panel"><div class="row spread mb"><div><div class="eyebrow">' + esc(u("module")) + " " + (mi + 1) + "</div><h3>" + esc(cModule(mi)) + "</h3></div>" +
          '<span class="pill' + (md === ls.length ? " ok" : "") + '">' + md + "/" + ls.length + "</span></div>" +
          '<div class="lessons">' + ls.map(function (l) { return lessonRow(l, false); }).join("") + quizRow(mi) + "</div></article>";
      }).join("") + "</div>" +
      '<p class="tiny muted mt">Demo: <button class="linkish" data-course-all="1">' + esc(u("demo_all")) + "</button></p>";
    return customerShell("#/app/edu", html, { eyebrow: cSchool() });
  }

  function viewLesson(n) {
    var l0 = LESSONS[Number(n) - 1];
    if (!l0) return viewEdu();
    var l = lessonT(l0);
    var done = !!S.course.done[l.n];
    var prev = LESSONS[l.n - 2], next = LESSONS[l.n];

    var player = l.video
      ? '<video class="edu-video" src="' + esc(l.video) + '" controls playsinline data-lesson-video="' + l.n + '"></video>'
      : '<div class="edu-player" id="edu-player">' +
        '<button class="edu-play" data-course-play="' + l.n + '" aria-label="' + esc(u("play")) + '">' + ico("play", 30) + "</button>" +
        '<div class="edu-player-t"><div class="small">' + esc(u("lesson")) + " " + l.n + " · " + esc(l.t) + "</div>" +
        '<div class="tiny">' + esc(u("clip", { n: l.n, t: LESSONS.length, d: l.d })) + "</div></div>" +
        '<div class="edu-progress"><i id="edu-prog" style="width:' + (done ? 100 : 0) + '%"></i></div></div>';

    var nextBtn = done
      ? (!next || next.mi !== l.mi
        ? (quizState(l.mi).passed
          ? (next ? '<a class="btn sm" href="#/app/edu/' + next.n + '">' + esc(u("next_lesson_btn")) + " ›</a>" : '<a class="btn sm" href="#/app/edu/cert">' + ico("grad", 15) + " " + esc(u("certificate")) + "</a>")
          : '<a class="btn sm" href="#/app/edu/quiz/' + l.mi + '">' + esc(u("module_quiz", { n: l.mi + 1 })) + " ›</a>")
        : '<a class="btn sm" href="#/app/edu/' + next.n + '">' + esc(u("next_lesson_btn")) + " ›</a>")
      : '<button class="btn sm" data-course-done="' + l.n + '">' + ico("check", 15) + " " + esc(u("finish_lesson")) + "</button>";

    var html =
      '<a class="small muted" href="#/app/edu">‹ ' + esc(u("all_modules")) + "</a>" +
      '<div class="edu-layout mt">' +
      '<div class="edu-main">' + player +
      '<div class="row spread wrap mt" style="gap:10px"><div><div class="eyebrow">' + esc(u("module")) + " " + (l.mi + 1) + " · " + esc(cModule(l.mi)) + "</div>" +
      "<h2>" + l.n + ". " + esc(l.t) + "</h2></div>" +
      (done ? '<span class="pill ok"><i class="dot"></i>' + esc(u("watched")) + "</span>" : "") + "</div>" +
      '<p class="muted">' + esc(l.x) + "</p>" +
      '<article class="panel"><div class="eyebrow">' + esc(u("remember")) + '</div><ul class="edu-keys">' +
      l.k.map(function (k) { return "<li>" + ico("check", 15) + "<span>" + esc(k) + "</span></li>"; }).join("") + "</ul></article>" +
      '<div class="row spread wrap mt" style="gap:8px">' +
      (prev ? '<a class="btn ghost sm" href="#/app/edu/' + prev.n + '">‹ ' + esc(u("lesson_n", { n: prev.n })) + "</a>" : "<span></span>") +
      nextBtn + "</div></div>" +
      '<aside class="edu-side panel"><div class="row spread mb"><h3>' + esc(u("lessons")) + '</h3><span class="pill">' + doneCount() + "/" + LESSONS.length + "</span></div>" +
      '<div class="lessons">' + LESSONS.map(function (x) { return lessonRow(x, x.n === l.n); }).join("") + "</div></aside>" +
      "</div>";
    return customerShell("#/app/edu", html, { eyebrow: cSchool() });
  }

  /* kviz posle svakog modula — 3 pitanja, prolaz 2/3; sertifikat trazi sve kvizove */

  var QUIZ = [
    [
      { q: "Čime se dopunjava rashladni sistem?", o: ["Vodom iz česme", "Destilovanom vodom", "Kontaktnim gelom"], a: 1, x: "Samo destilovana voda — minerali iz česme oštećuju rashladni krug." },
      { q: "Kako se pravilno isključuje aparat?", o: ["Glavnim prekidačem", "Preko menija", "Izvlačenjem kabla"], a: 1, x: "Preko menija, da hlađenje završi ciklus pre gašenja." },
      { q: "Šta najčešće znači greška E-04?", o: ["Pregrejana ručica", "Nizak nivo vode u hlađenju", "Istrošena sonda"], a: 1, x: "E-04 je protok rashladne tečnosti — prvo proverite nivo vode." },
    ],
    [
      { q: "Ko nosi zaštitne naočare?", o: ["Samo klijent", "Samo operater", "I operater i klijent"], a: 2, x: "Oboje, tokom celog tretmana." },
      { q: "Klijentkinja je sveže preplanula. Šta radite?", o: ["Radite nižom energijom", "Odlažete tretman", "Prelazite na 1064 nm"], a: 1, x: "Sveža preplanulost je razlog za odlaganje, bez izuzetka." },
      { q: "Koliko pre prvog tretmana se radi test tačka?", o: ["Neposredno pre", "48 sati pre", "Dve nedelje pre"], a: 1, x: "48 sati — dovoljno da se vidi reakcija kože." },
    ],
    [
      { q: "Kada klijent treba da se obrije?", o: ["Neposredno pre tretmana", "12–24 sata pre", "Nedelju dana pre"], a: 1, x: "Dan ranije: dlaka je ispod površine, koža nije iritirana." },
      { q: "Koja talasna dužina je za tamne fototipove?", o: ["755 nm", "808 nm", "1064 nm"], a: 2, x: "1064 nm najdublje prodire i najmanje zagreva epidermis." },
      { q: "Koliki je razmak između tretmana?", o: ["Jedna nedelja", "4–6 nedelja", "Šest meseci"], a: 1, x: "4–6 nedelja, prema ciklusu rasta dlake." },
    ],
    [
      { q: "In-motion tehnika: koliko prolaza po polju?", o: ["Jedan", "3–4", "Deset"], a: 1, x: "3–4 ravnomerna prolaza po polju od oko 10×10 cm." },
      { q: "Gde se nikad ne radi?", o: ["Gornja usna", "Ispod koštanog luka obrva", "Pazuh"], a: 1, x: "Zona oko oka ispod koštanog luka je zabranjena." },
      { q: "Muški klijent, leđa. Kako počinjete?", o: ["Maksimalnom energijom", "Nižom energijom", "Bez hlađenja"], a: 1, x: "Nižom energijom, pa podizanje prema reakciji kože." },
    ],
    [
      { q: "Koliko dugo SPF 50 posle tretmana?", o: ["Dva dana", "Najmanje dve nedelje", "Nije potreban"], a: 1, x: "Najmanje dve nedelje, na tretiranoj zoni." },
      { q: "Kada se poručuje rezervna sonda?", o: ["Kad prestane da radi", "Na 75–80% resursa", "Na 50% resursa"], a: 1, x: "Na 75–80% — isporuka traje, a sezona ne čeka." },
      { q: "Ko menja sondu?", o: ["Kozmetičarka", "Ovlašćeni servis", "Bilo ko iz salona"], a: 1, x: "Samo ovlašćeni Vecom servis, zbog garancije i kalibracije." },
    ],
  ];

  function quizT(mi, qi) { var x = cTx(); return x ? Object.assign({}, QUIZ[mi][qi], x.quiz[mi][qi]) : QUIZ[mi][qi]; }

  function quizState(mi) {
    if (!S.course.quiz[mi]) S.course.quiz[mi] = { picked: {}, checked: false, passed: false, score: 0 };
    return S.course.quiz[mi];
  }
  function quizzesPassed() { return QUIZ.filter(function (_, mi) { return quizState(mi).passed; }).length; }
  function quizScore() { return QUIZ.reduce(function (n, _, mi) { return n + quizState(mi).score; }, 0); }
  function moduleLessonsDone(mi) {
    return LESSONS.filter(function (l) { return l.mi === mi; }).every(function (l) { return S.course.done[l.n]; });
  }

  function quizRow(mi) {
    var st = quizState(mi);
    var open = moduleLessonsDone(mi);
    return '<a class="lesson quiz' + (st.passed ? " done" : "") + (open ? "" : " locked") + '" href="' + (open ? "#/app/edu/quiz/" + mi : "#/app/edu") + '">' +
      '<span class="lesson-n">' + (st.passed ? ico("check", 14) : "?") + "</span>" +
      '<span class="grow"><span class="small">' + esc(u("quiz_row")) + '</span><span class="tiny muted">' +
      esc(st.passed ? u("quiz_passed_n", { s: st.score }) : open ? u("quiz_ready") : u("quiz_locked_row")) + "</span></span></a>";
  }

  function viewQuiz(mi) {
    mi = Number(mi);
    var qs = QUIZ[mi];
    if (!qs) return viewEdu();
    if (!moduleLessonsDone(mi)) {
      return customerShell("#/app/edu", '<div class="card center" style="max-width:520px;margin:0 auto"><h2>' + esc(u("quiz_locked")) + "</h2>" +
        '<p class="small muted">' + esc(u("quiz_locked_x", { n: mi + 1 })) + "</p>" +
        '<a class="btn" href="#/app/edu">' + esc(u("back_course")) + "</a></div>", { title: u("quiz"), eyebrow: cSchool() });
    }
    var st = quizState(mi);
    var allPicked = qs.every(function (_, qi) { return st.picked[qi] != null; });

    var html =
      '<a class="small muted" href="#/app/edu">‹ ' + esc(u("all_modules")) + "</a>" +
      '<div class="quiz mt"><div class="eyebrow">' + esc(u("module")) + " " + (mi + 1) + " · " + esc(cModule(mi)) + "</div>" +
      "<h2>" + esc(u("quiz_h")) + "</h2>" +
      '<p class="small muted">' + esc(u("quiz_x")) + "</p>" +
      qs.map(function (q0, qi) {
        var q = quizT(mi, qi);
        var pick = st.picked[qi];
        return '<article class="panel quiz-q"><div class="small"><b>' + (qi + 1) + ".</b> " + esc(q.q) + "</div>" +
          '<div class="quiz-o">' + q.o.map(function (o, oi) {
            var cls = pick === oi ? " sel" : "";
            if (st.checked) cls += oi === q.a ? " right" : pick === oi ? " wrong" : "";
            return '<button class="quiz-opt' + cls + '"' + (st.checked ? " disabled" : "") + ' data-quiz-pick="' + mi + ":" + qi + ":" + oi + '">' +
              '<span class="quiz-dot"></span>' + esc(o) + "</button>";
          }).join("") + "</div>" +
          (st.checked ? '<div class="tiny ' + (pick === q.a ? "quiz-ok" : "quiz-bad") + '">' + esc((pick === q.a ? u("correct") : u("wrong")) + " " + q.x) + "</div>" : "") +
          "</article>";
      }).join("") +
      (st.checked
        ? '<div class="quiz-result ' + (st.passed ? "ok" : "bad") + '">' + ico(st.passed ? "check" : "alert", 18) +
          '<div class="grow"><div class="small">' + esc(u(st.passed ? "quiz_pass" : "quiz_fail", { s: st.score })) + "</div>" +
          '<div class="tiny muted">' + esc(st.passed ? (mi < QUIZ.length - 1 ? u("quiz_next_open") : u("quiz_all_done")) : u("quiz_retry_x")) + "</div></div>" +
          (st.passed
            ? (courseDone() ? '<a class="btn sm" href="#/app/edu/cert">' + esc(u("certificate")) + "</a>" : '<a class="btn sm" href="#/app/edu">' + esc(u("continue_course")) + "</a>")
            : '<button class="btn sm" data-quiz-retry="' + mi + '">' + esc(u("retry_quiz")) + "</button>") +
          "</div>"
        : '<button class="btn mt" data-quiz-check="' + mi + '"' + (allPicked ? "" : " disabled") + ">" + esc(u("check_answers")) + "</button>") +
      "</div>";
    return customerShell("#/app/edu", html, { title: u("quiz"), eyebrow: cSchool() });
  }

  function verifyUrl() {
    return location.origin + location.pathname + "#/verify/" + certNumber();
  }

  // javna stranica za proveru sertifikata — na nju vodi QR kod
  function viewVerify(id) {
    var ok = id === certNumber() && courseDone();
    var c = DATA.demo.company;
    return '<div class="login-wrap" style="max-width:480px"><div class="card center">' +
      '<img src="/assets/vecom-logo.png" alt="Vecom" style="height:22px;margin:4px auto 16px;display:block">' +
      (ok
        ? '<div class="bk-check" style="margin:0 auto 10px">' + ico("check", 28) + "</div>" +
          "<h2>" + esc(u("verify_ok")) + "</h2>" +
          '<div class="kv mt" style="text-align:left">' +
          '<span class="k">' + esc(u("v_number")) + '</span><span class="v">' + esc(id) + "</span>" +
          '<span class="k">' + esc(u("v_student")) + '</span><span class="v">' + esc(c.contact) + "</span>" +
          '<span class="k">' + esc(u("v_salon")) + '</span><span class="v">' + esc(c.name + ", " + c.city) + "</span>" +
          '<span class="k">' + esc(u("v_course")) + '</span><span class="v">' + esc(cTitle()) + "</span>" +
          '<span class="k">' + esc(u("v_issued")) + '</span><span class="v">' + dmy(new Date().toISOString().slice(0, 10)) + "</span>" +
          "</div>"
        : "<h2>" + esc(u("verify_bad")) + '</h2><p class="small muted">' + esc(u("verify_bad_x", { id: id })) + "</p>") +
      '<p class="tiny muted mt">' + esc(u("verify_by", { s: cSchool() })) + " · DEMO</p>" +
      "</div></div>";
  }

  function certNumber() {
    return "VA-" + new Date().getFullYear() + "-0" + (400 + DATA.demo.company.name.length);
  }

  function viewCertificate() {
    if (!courseDone()) {
      return customerShell("#/app/edu",
        '<div class="card center" style="max-width:520px;margin:0 auto">' + ico("grad", 28) +
        '<h2 class="mt">' + esc(u("cert_locked")) + "</h2>" +
        '<p class="small muted">' + esc(u("cert_locked_n", { n: doneCount(), l: LESSONS.length, q: quizzesPassed(), qt: QUIZ.length })) + "</p>" +
        '<a class="btn" href="#/app/edu/' + nextLesson().n + '">' + esc(u("continue_course")) + "</a></div>",
        { title: u("certificate"), eyebrow: cSchool() });
    }
    var c = DATA.demo.company;
    var html =
      '<div class="row spread wrap mb no-print" style="gap:8px"><a class="small muted" href="#/app/edu">‹ ' + esc(u("nav_edu")) + "</a>" +
      '<button class="btn" data-print="1">' + ico("download", 16) + " " + esc(u("print")) + "</button></div>" +
      '<div class="cert-wrap"><div class="cert">' +
      '<img class="cert-logo" src="/assets/vecom-logo.png" alt="Vecom">' +
      '<div class="cert-kicker">' + esc(cSchool()) + "</div>" +
      "<h1>" + esc(u("cert_h")) + "</h1>" +
      '<p class="cert-lead">' + esc(u("cert_lead")) + "</p>" +
      '<div class="cert-name">' + esc(c.contact) + "</div>" +
      '<p class="cert-lead">' + esc(c.name) + ", " + esc(c.city) + "</p>" +
      '<p class="cert-body">' + esc(u("cert_body")) + "<br><b>„" + esc(cTitle()) + "”</b><br>" +
      esc(u("cert_stats", { l: LESSONS.length, m: COURSE.modules.length, s: quizScore(), t: QUIZ.length * 3 })) + "</p>" +
      '<div class="cert-foot">' +
      '<div><div class="cert-line"></div><div class="tiny">Vecom Beauty System · Niš</div></div>' +
      '<div class="cert-seal">' + ico("grad", 26) + "<span>" + esc(certNumber()) + "</span></div>" +
      '<div><div class="cert-line"></div><div class="tiny">' + esc(u("date")) + ": " + dmy(new Date().toISOString().slice(0, 10)) + "</div></div>" +
      "</div>" +
      '<div class="cert-qr"><div id="cert-qr"></div><span>' + esc(u("cert_verify")) + "</span></div>" +
      '<div class="cert-demo">' + esc(u("cert_demo")) + "</div>" +
      "</div></div>";
    return customerShell("#/app/edu", html, { title: u("certificate"), eyebrow: cSchool() });
  }

  // lazni "video": traka se puni ~2.5 s, pa se lekcija oznacava kao odgledana
  function fakePlay(n) {
    var bar = document.getElementById("edu-prog");
    var box = document.getElementById("edu-player");
    if (!bar || !box || box.classList.contains("playing")) return;
    box.classList.add("playing");
    var w = 0;
    var timer = setInterval(function () {
      w += 4;
      bar.style.width = Math.min(w, 100) + "%";
      if (w >= 100) {
        clearInterval(timer);
        finishLesson(n);
      }
    }, 100);
  }

  function finishLesson(n) {
    S.course.done[n] = true;
    toast(courseDone() ? u("toast_course_done") : u("toast_lesson", { n: n }));
    route();
  }

  /* B3 · prijava kvara */

  var FAULT_TYPES = ["Greška na displeju", "Ne pali se", "Smanjen učinak", "Hlađenje / curenje", "Ručica / kabl", "Drugo"];

  function viewFault() {
    var d = S.faultDraft;
    return customerShell("#/app/tickets",
      '<div class="card" style="max-width:620px;margin:0 auto">' +
      "<h2>" + esc(u("report_fault")) + "</h2>" +
      '<p class="small muted mb">' + esc(u("fault_x")) + "</p>" +
      '<div class="field"><label>' + esc(u("device")) + '</label><select id="fa-dev">' +
      DATA.demo.installations.map(function (i) {
        var p = product(i.slug);
        return '<option value="' + esc(i.slug) + '"' + (d.slug === i.slug ? " selected" : "") + ">" +
          esc((p ? cuProductName(p) : i.slug) + " · " + i.serial) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="field"><label>' + esc(u("fault_type")) + '</label><select id="fa-type">' +
      FAULT_TYPES.map(function (o) {
        return '<option value="' + esc(o) + '"' + (d.type === o ? " selected" : "") + ">" + esc(tx(o)) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="field"><label>' + esc(u("description")) + '</label><textarea id="fa-text" placeholder="' + esc(u("fault_ph")) + '">' + esc(d.text) + "</textarea></div>" +
      '<div class="field"><label>' + esc(u("photo")) + "</label>" +
      '<input id="fa-photo" type="file" accept="image/*" capture="environment">' +
      '<div id="fa-prev" class="mt">' +
      (d.photo ? '<a class="photo"><img src="' + esc(d.photo) + '" alt="' + esc(u("photo")) + '"></a>' : "") +
      "</div>" +
      '<button class="btn ghost sm" id="fa-demo" type="button" style="margin-top:8px">' + esc(u("demo_photo")) + "</button></div>" +
      '<button class="btn block big" id="fa-send">' + esc(u("send_report")) + "</button>" +
      '<p class="tiny muted center mt">' + esc(u("fault_note")) + "</p>" +
      "</div>",
      { title: u("report_fault") }
    );
  }

  function submitFault() {
    var d = S.faultDraft;
    var id = 483 + S.tickets.filter(function (t) { return t.id >= 483; }).length;
    var p = product(d.slug);
    var now = new Date();
    var t = {
      id: id,
      slug: d.slug,
      serial: (DATA.demo.installations.filter(function (i) { return i.slug === d.slug; })[0] || {}).serial,
      company: DATA.demo.company.name,
      city: DATA.demo.company.city,
      issue: d.text ? d.text.slice(0, 60) : d.type,
      type: d.type,
      status: "primljeno",
      opened: now.toISOString().slice(0, 10),
      photo: d.photo,
      isNew: true,
      messages: [{
        from: "kupac",
        at: dmy(now.toISOString().slice(0, 10)) + " " + pad(now.getHours()) + ":" + pad(now.getMinutes()),
        text: d.text || d.type,
      }],
    };
    S.tickets.unshift(t);
    S.faultDraft = { slug: d.slug, type: d.type, text: "", photo: null };
    toast(u("toast_fault", { id: id, d: p ? cuProductName(p) : d.slug }));
    go("#/app/ticket/" + id);
  }

  function ticketTimeline(t) {
    var cur = flowIndex(t.status);
    return '<div class="timeline">' + TICKET_FLOW.map(function (st, i) {
      var cls = i < cur ? "done" : i === cur ? "now" : "";
      return '<div class="tl-step ' + cls + '"><div class="tl-mark"><i></i><span></span></div>' +
        '<div class="tl-body"><div class="small">' + esc(flowL(st.key)) + "</div>" +
        (i === cur ? '<div class="tiny muted">' + esc(u("current_status")) + "</div>" : "") + "</div></div>";
    }).join("") + "</div>";
  }

  function ticketById(id) {
    var found = null;
    S.tickets.forEach(function (t) { if (String(t.id) === String(id)) found = t; });
    return found;
  }

  function viewTicket(id) {
    var t = ticketById(id);
    if (!t) return customerShell("#/app/tickets", '<div class="card">' + esc(u("not_found")) + "</div>");
    var p = product(t.slug);

    return customerShell("#/app/tickets",
      '<a class="small muted" href="#/app/tickets">‹ ' + esc(u("all_services")) + "</a>" +
      '<div class="grid2 mt">' +
      '<div class="card"><div class="row spread mb"><h2>' + esc(u("ticket")) + " #" + t.id + "</h2>" +
      '<span class="pill' + (t.status === "reseno" ? " ok" : "") + '"><i class="dot"></i>' + esc(flowL(t.status)) + "</span></div>" +
      '<div class="kv mb"><span class="k">' + esc(u("device")) + '</span><span class="v">' + esc(p ? cuProductName(p) : t.slug) + "</span>" +
      '<span class="k">' + esc(u("serial")) + '</span><span class="v">' + esc(t.serial || "—") + "</span>" +
      '<span class="k">' + esc(u("reported_on")) + '</span><span class="v">' + dmy(t.opened) + "</span>" +
      '<span class="k">' + esc(u("type")) + '</span><span class="v">' + esc(tx(t.type || "—")) + "</span></div>" +
      '<p class="small">' + esc(t.issue) + "</p>" +
      (t.photo ? '<a class="photo mt" href="' + esc(t.photo) + '" target="_blank" rel="noopener"><img src="' + esc(t.photo) + '" alt="' + esc(u("photo")) + '"></a>' : "") +
      "</div>" +
      '<div class="card"><h3 class="mb">' + esc(u("status")) + "</h3>" + ticketTimeline(t) + "</div>" +
      "</div>" +
      '<div class="card mt"><h3 class="mb">' + esc(u("messages")) + '</h3><div class="list">' +
      t.messages.map(function (m) {
        return '<div class="msg ' + (m.from === "vecom" ? "vecom" : "") + '">' +
          '<div class="tiny muted">' + esc(m.from === "vecom" ? u("vecom_service") : DATA.demo.company.contact) + " · " + esc(m.at) + "</div>" +
          '<div class="small">' + esc(m.text) + "</div></div>";
      }).join("") + "</div>" +
      '<div class="field mt"><textarea id="tk-msg" placeholder="' + esc(u("msg_ph")) + '"></textarea></div>' +
      '<button class="btn sm" data-ticket-msg="' + t.id + '">' + esc(u("send_msg")) + "</button>" +
      "</div>",
      { title: u("ticket") + " #" + t.id }
    );
  }

  /* B4 · potrosni */

  function viewParts() {
    var slugs = DATA.demo.installations.map(function (i) { return i.slug; });
    var parts = DATA.demo.parts.filter(function (p) { return slugs.indexOf(p.for) >= 0; });

    return customerShell("#/app/parts",
      '<div class="grid2">' +
      '<div class="card"><h2 class="mb">' + esc(u("parts_h")) + '</h2><div class="list">' +
      parts.map(function (p) {
        var dev = product(p.for);
        return '<div class="item" style="cursor:default"><div class="grow"><div>' + esc(tx(p.name)) + "</div>" +
          '<div class="tiny muted">' + esc(dev ? cuProductName(dev) : p.for) + " · " + esc(tx(p.note)) + "</div></div>" +
          (p.recommended ? '<span class="pill warn"><i class="dot"></i>' + esc(u("recommended")) + "</span>" : "") +
          '<button class="btn ghost sm" data-add-part="' + esc(p.id) + '">' + esc(u("add")) + "</button></div>";
      }).join("") + "</div></div>" +
      '<div class="card"><h3 class="mb">' + esc(u("cart")) + "</h3>" +
      (S.cart.length
        ? '<div class="list">' + S.cart.map(function (c, idx) {
            return '<div class="row spread small"><span class="grow">' + esc(tx(c.name)) + " × " + c.qty + "</span>" +
              '<button class="btn ghost sm" data-del-part="' + idx + '">' + esc(u("remove")) + "</button></div>";
          }).join("") + "</div>" +
          '<button class="btn block mt" data-order="1">' + esc(u("order")) + "</button>" +
          '<p class="tiny muted center mt">' + esc(u("order_note")) + "</p>"
        : '<p class="small muted">' + esc(u("cart_empty")) + "</p>") +
      '<div class="sep"></div><h3 class="mb">' + esc(u("prev_orders")) + '</h3><div class="list">' +
      S.orders.filter(function (o) { return o.company === DATA.demo.company.name; }).map(function (o) {
        return '<div class="row spread small"><div class="grow"><div>' + esc(o.items.split(", ").map(function (it) {
          var m = it.match(/^(.*) × (\d+)$/);
          return m ? tx(m[1]) + " × " + m[2] : it;
        }).join(", ")) + "</div>" +
          '<div class="tiny muted">' + esc(tx(o.at)) + " · " + esc(o.status === "ceka" ? u("awaiting") : o.status === "potvrdjeno" ? u("confirmed") : u("delivered_st")) + "</div></div>" +
          '<button class="btn ghost sm" data-reorder="' + o.id + '">' + esc(u("repeat")) + "</button></div>";
      }).join("") + "</div></div></div>"
    );
  }

  /* B5 · protokoli */

  function protoT(p) { return S.cuLang !== "sr" && p[S.cuLang] ? Object.assign({}, p, p[S.cuLang]) : p; }

  function viewProtocols() {
    var q = S.protoQuery.toLowerCase().trim();
    var list = DATA.protocols.map(protoT).filter(function (p) {
      if (!q) return true;
      return (p.title + " " + p.indication + " " + p.tags.join(" ")).toLowerCase().indexOf(q) >= 0;
    });
    var chips = u("proto_chips").split("|");

    return customerShell("#/app/protocols",
      '<div class="card mb"><h2 class="mb">' + esc(u("proto_h")) + "</h2>" +
      '<div class="field" style="margin:0"><input id="pr-q" placeholder="' + esc(u("proto_ph")) + '" value="' + esc(S.protoQuery) + '"></div>' +
      '<div class="row wrap mt">' + chips.map(function (c) {
        return '<button class="pill" data-proto-chip="' + esc(c) + '">' + esc(c) + "</button>";
      }).join("") + "</div></div>" +
      '<div class="grid2">' + list.map(function (p) {
        return '<div class="card"><div class="row spread wrap"><h3>' + esc(p.title) + "</h3>" +
          '<span class="pill">' + esc(p.device) + "</span></div>" +
          '<p class="small muted">' + esc(p.indication) + "</p>" +
          '<div class="kv">' + p.params.map(function (kv) {
            return '<span class="k">' + esc(kv[0]) + '</span><span class="v">' + esc(kv[1]) + "</span>";
          }).join("") + "</div>" +
          '<div class="sep"></div>' +
          '<div class="small"><b>' + esc(u("protocol")) + ":</b> " + esc(p.sessions) + "</div>" +
          '<div class="small" style="color:var(--alert)"><b>' + esc(u("contra")) + ":</b> " + esc(p.contra) + "</div>" +
          '<div class="small muted"><b>' + esc(u("combo")) + ":</b> " + esc(p.combo) + "</div>" +
          "</div>";
      }).join("") + "</div>" +
      (list.length ? "" : '<div class="card">' + esc(u("proto_none")) + "</div>") +
      '<p class="tiny muted mt">' + esc(u("proto_note")) + "</p>"
    );
  }

  /* B6 · dokumenta */

  function viewDocs() {
    return customerShell("#/app/docs",
      '<div class="card"><h2 class="mb">' + esc(u("nav_docs")) + '</h2><div class="list">' +
      DATA.demo.documents.map(function (d) {
        var name = d.name.replace(/^(.*?)( — .*)?$/, function (_, a, b) { return tx(a) + (b || ""); });
        return '<div class="item" style="cursor:default"><div class="grow"><div>' + esc(name) + "</div>" +
          '<div class="tiny muted">' + esc(d.type) + " · " + esc(d.size) + "</div></div>" +
          '<button class="btn ghost sm" data-download="' + esc(name) + '">' + esc(u("download")) + "</button></div>";
      }).join("") + "</div></div>"
    );
  }

  /* ---------- C · admin ----------
     Kostur preuzet iz Vita admin demoa (sidebar, prekidac uloga, topbar, metrike,
     lista + detalj), prenet u vanilla JS i Vecom paletu.
     Na laptopu: desktop radni prostor ili prikaz u okviru telefona.
     Na telefonu (< 960px): uvek mobilni prikaz sa trakom na dnu. */

  var ICONS = {
    dash: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    inbox: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/>',
    map: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15"/><path d="M15 6v15"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    chev: '<path d="m9 18 6-6-6-6"/>',
    chevLeft: '<path d="m15 18-6-6 6-6"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8M16 13H8M16 17H8"/>',
    news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5"/><path d="M10 6h8v4h-8z"/>',
    grad: '<path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
    play: '<path d="M6 3.5v17a1 1 0 0 0 1.5.86l14-8.5a1 1 0 0 0 0-1.72l-14-8.5A1 1 0 0 0 6 3.5z" fill="currentColor" stroke="none"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    phoneCall: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    more: '<circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/><circle cx="5" cy="12" r="1.2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  };

  function ico(name, size) {
    var s = size || 18;
    return '<svg class="ico-svg" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>";
  }

  var ADMIN_ROLES = {
    prodaja: {
      label: "Prodaja", name: DATA.demo.admin.name, role: "Prodaja i podrška", email: DATA.demo.admin.email,
      nav: [
        { href: "#/admin", icon: "dash", label: "Pregled" },
        { href: "#/admin/inquiries", icon: "inbox", label: "Upiti" },
        { href: "#/admin/calendar", icon: "calendar", label: "Kalendar" },
        { href: "#/admin/service", icon: "wrench", label: "Servis" },
        { href: "#/admin/orders", icon: "box", label: "Porudžbine" },
        { href: "#/admin/fleet", icon: "map", label: "Teren" },
        { href: "#/admin/stats", icon: "chart", label: "Brojke" },
        { href: "#/admin/customers", icon: "users", label: "Kupci i nalozi", group: "Kupci" },
        { href: "#/admin/edu", icon: "grad", label: "Edukacija", group: "Kupci" },
        { href: "#/admin/catalog", icon: "zap", label: "Katalog aparata", group: "Sajt" },
        { href: "#/admin/news", icon: "news", label: "Novosti" , group: "Sajt" },
        { href: "#/admin/content", icon: "book", label: "Iskustva i pitanja", group: "Sajt" },
      ],
      tabs: ["#/admin", "#/admin/inquiries", "#/admin/service", "#/admin/news", "#/admin/more"],
    },
    servis: {
      label: "Serviser", name: "Dejan Marković", role: "Serviser", email: "servis@vecom.rs",
      nav: [
        { href: "#/admin", icon: "calendar", label: "Moj dan" },
        { href: "#/admin/service", icon: "wrench", label: "Servis" },
        { href: "#/admin/orders", icon: "box", label: "Delovi" },
      ],
      tabs: ["#/admin", "#/admin/service", "#/admin/orders"],
    },
  };

  function roleCfg() { return ADMIN_ROLES[S.adminRole]; }

  function initials(name) {
    return name.split(" ").map(function (x) { return x[0]; }).join("").slice(0, 2);
  }

  function isDesktopAdmin() {
    return window.innerWidth >= 960 && S.adminView === "desktop";
  }

  function navBadge(href) {
    if (href === "#/admin/inquiries") return newInquiries().length;
    if (href === "#/admin/service") return openTickets().length;
    if (href === "#/admin/orders") return waitingOrders().length;
    return 0;
  }

  /* jedna ulazna tacka za sve admin ekrane */
  function adminPage(o) {
    return isDesktopAdmin() ? desktopShell(o) : phone(o.title, o.sub, o.body, o.tab);
  }

  function desktopShell(o) {
    var r = roleCfg();
    return '<div class="adm">' +
      '<aside class="adm-side">' +
      '<a class="adm-brand" href="#/admin"><img src="assets/vecom-logo.png" alt="Vecom"><span>Admin · DEMO</span></a>' +
      '<div class="adm-roles"><div class="adm-label">Demo prikaz</div><div class="adm-roles-in">' +
      Object.keys(ADMIN_ROLES).map(function (k) {
        return '<button class="' + (S.adminRole === k ? "on" : "") + '" data-admin-role="' + k + '">' + esc(ADMIN_ROLES[k].label) + "</button>";
      }).join("") + "</div></div>" +
      '<nav class="adm-nav">' + r.nav.map(function (n, i) {
        var b = navBadge(n.href);
        var grp = n.group && (i === 0 || r.nav[i - 1].group !== n.group) ? '<div class="adm-group">' + esc(n.group) + "</div>" : "";
        return grp + '<a href="' + n.href + '" class="' + (n.href === o.tab ? "on" : "") + '">' + ico(n.icon) +
          "<span>" + esc(n.label) + "</span>" + (b ? '<i class="adm-badge">' + b + "</i>" : "") + "</a>";
      }).join("") + "</nav>" +
      '<button class="adm-view" data-admin-view="phone">' + ico("phone", 16) + "<span>Prikaži na telefonu</span></button>" +
      '<div class="adm-me"><span class="adm-av">' + esc(initials(r.name)) + "</span>" +
      '<div class="grow"><div class="adm-me-n">' + esc(r.name) + '</div><div class="adm-me-r">' + esc(r.email) + "</div></div>" +
      '<button class="adm-out" data-admin-logout="1" aria-label="Odjava">' + ico("logout", 16) + "</button></div>" +
      "</aside>" +
      '<section class="adm-main">' +
      '<header class="adm-top"><div class="grow"><div class="eyebrow">' + esc(o.eyebrow || r.role) + "</div>" +
      "<h1>" + esc(o.deskTitle || o.title) + "</h1></div>" +
      '<button class="adm-search" data-search-open="1">' + ico("globe", 15) + '<span>Pretraga</span><kbd>Ctrl K</kbd></button>' +
      '<button class="adm-icon" aria-label="Obaveštenja">' + ico("bell", 17) + '<i class="adm-dot"></i></button>' +
      '<span class="adm-person"><span class="adm-av sm">' + esc(initials(r.name)) + "</span>" + esc(r.name.split(" ")[0]) + "</span>" +
      "</header>" +
      '<div class="adm-content">' + (o.wide || '<div class="adm-narrow">' + o.body + "</div>") + "</div>" +
      "</section></div>";
  }

  function phone(title, sub, body, tab) {
    var r = roleCfg();
    var more = { href: "#/admin/more", icon: "more", label: "Više" };
    var tabs = r.tabs.map(function (h) { return h === more.href ? more : r.nav.filter(function (n) { return n.href === h; })[0]; });
    // ekrani bez svoje kartice na dnu svetle pod "Više"
    if (r.tabs.indexOf(tab) < 0 && r.tabs.indexOf(more.href) >= 0) tab = more.href;
    return '<div class="wrap"><div class="phone-stage">' +
      '<div class="phone"><div class="notch"></div>' +
      '<div class="phone-head"><div class="row spread">' +
      "<div><h2 style=\"font-size:17px\">" + esc(title) + "</h2>" +
      '<div class="tiny muted">' + esc(sub) + "</div></div>" +
      '<span class="row" style="gap:6px"><button class="adm-icon sm" data-search-open="1" aria-label="Pretraga">' + ico("globe", 15) + '</button><span class="demo-badge">DEMO</span></span></div></div>' +
      '<div class="phone-body">' + body + "</div>" +
      '<nav class="tabbar" style="grid-template-columns:repeat(' + tabs.length + ',1fr)">' + tabs.map(function (n) {
        return '<a href="' + n.href + '" class="' + (n.href === tab ? "on" : "") + '">' +
          '<span class="ico">' + ico(n.icon, 19) + "</span><span>" + esc(n.label) + "</span></a>";
      }).join("") + "</nav></div>" +
      '<div class="phone-note small muted">' +
      "<b style=\"color:var(--ink)\">Admin radi sa telefona.</b><br>" +
      "Isti admin kao na desktopu, samo složen za palac: upit stigne, jedan tap na Pozovi, status se promeni, gotovo." +
      '<div class="mt"><button class="btn ghost sm" data-admin-view="desktop">' + ico("monitor", 15) + " Desktop prikaz</button></div>" +
      '<div class="row wrap mt">' + Object.keys(ADMIN_ROLES).map(function (k) {
        return '<button class="pill' + (S.adminRole === k ? " ok" : "") + '" data-admin-role="' + k + '">' + esc(ADMIN_ROLES[k].label) + "</button>";
      }).join("") + "</div>" +
      '<div class="mt"><button class="btn ghost sm" data-admin-logout="1">Odjava</button></div>' +
      "</div></div></div>";
  }

  /* prijava — samo Google, pristup za pozvane @vecom.rs naloge */
  function viewAdminLogin() {
    return '<div class="login-wrap">' +
      '<div class="card center">' +
      '<img src="assets/vecom-logo.png" alt="Vecom" style="height:24px;margin:6px auto 14px;display:block">' +
      '<h1 style="font-size:22px">Admin</h1>' +
      '<p class="muted small mb">Upiti, servis, porudžbine i aparati u terenu.</p>' +
      '<button class="google-btn" id="ga-btn">' + googleG() + "<span>Sign in with Google</span></button>" +
      '<p class="tiny muted mt">Pristup samo za pozvane @vecom.rs naloge.</p>' +
      "</div>" +
      '<p class="tiny muted center mt">U prototipu je prijava samo vizuelna — ne otvara pravi Google nalog.</p>' +
      "</div>";
  }

  function fakeAdminLogin() {
    var btn = document.getElementById("ga-btn");
    if (btn) {
      btn.innerHTML = '<span class="spinner"></span><span>Signing in…</span>';
      btn.disabled = true;
    }
    setTimeout(function () {
      S.adminIn = true;
      toast("Prijavljeni kao " + roleCfg().email);
      route();
    }, 600);
  }

  function newInquiries() { return S.inquiries.filter(function (q) { return q.status === "nov"; }); }
  function openTickets() { return S.tickets.filter(function (t) { return t.status !== "reseno"; }); }
  function waitingOrders() { return S.orders.filter(function (o) { return o.status === "ceka"; }); }
  function myTicketsAdmin() { return openTickets().filter(function (t) { return t.status !== "primljeno"; }); }

  function statTile(n, label, href) {
    return '<a class="card card-tight" style="text-decoration:none" href="' + href + '">' +
      '<div class="big-num">' + n + "</div>" +
      '<div class="tiny muted">' + esc(label) + "</div></a>";
  }

  function metric(label, value, detail, icon, href, accent) {
    return '<a class="metric' + (accent ? " accent" : "") + '" href="' + href + '">' +
      '<div class="row spread"><span class="metric-l">' + esc(label) + '</span><span class="metric-i">' + ico(icon, 17) + "</span></div>" +
      '<div class="metric-v">' + value + '</div><div class="metric-d">' + esc(detail) + "</div></a>";
  }

  function intro(eyebrow, title, copy, action) {
    return '<div class="adm-intro"><div><div class="eyebrow">' + esc(eyebrow) + "</div>" +
      "<h2>" + esc(title) + '</h2><p class="small muted">' + esc(copy) + "</p></div>" +
      (action || "") + "</div>";
  }

  function panel(eyebrow, title, body, link) {
    return '<article class="panel"><div class="row spread mb"><div><div class="eyebrow">' + esc(eyebrow) + "</div>" +
      "<h3>" + esc(title) + "</h3></div>" + (link || "") + "</div>" + body + "</article>";
  }

  function panelLink(href, label) {
    return '<a class="panel-link" href="' + href + '">' + esc(label) + ico("chev", 14) + "</a>";
  }

  function todayLong() {
    var d = new Date();
    var dani = ["Nedelja", "Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak", "Subota"];
    return dani[d.getDay()] + ", " + dmy(d.toISOString().slice(0, 10));
  }

  /* ---------- delovi lista i detalja (isti za telefon i desktop) ---------- */

  function inqRow(q, activeId) {
    var cls = q.status === "nov" ? "warn" : q.status === "dobijeno" ? "ok" : q.status === "izgubljeno" ? "alert" : "";
    return '<button class="item' + (String(activeId) === String(q.id) ? " sel" : "") + '" data-nav="#/admin/inquiry/' + q.id + '">' +
      '<div class="grow"><div class="small">' + esc(q.name) + "</div>" +
      '<div class="tiny muted">' + esc([q.device, q.city, q.source].filter(function (x) { return x && x !== "—"; }).join(" · ")) + "</div>" +
      '<div class="tiny muted">' + esc(q.at) + "</div></div>" +
      '<span class="pill ' + cls + '"><i class="dot"></i>' + esc(INQ_LABEL[q.status]) + "</span>" +
      '<span class="chev">›</span></button>';
  }

  function tkRow(t, activeId) {
    var cls = t.status === "reseno" ? "ok" : t.status === "primljeno" ? "warn" : "";
    return '<button class="item' + (String(activeId) === String(t.id) ? " sel" : "") + '" data-nav="#/admin/ticket/' + t.id + '">' +
      '<div class="grow"><div class="small">#' + t.id + " · " + esc(t.company) + (t.isNew ? " · novo" : "") + "</div>" +
      '<div class="tiny muted">' + esc(t.issue) + "</div>" +
      '<div class="tiny muted">' + esc(t.city) + " · " + dmy(t.opened) + (t.photo ? " · sa fotografijom" : "") + "</div></div>" +
      '<span class="pill ' + cls + '"><i class="dot"></i>' + esc(flowLabel(t.status)) + "</span>" +
      '<span class="chev">›</span></button>';
  }

  function inquiryDetail(q) {
    return '<div class="card"><h3>' + esc(q.name) + "</h3>" +
      '<div class="tiny muted mb">' + esc([q.type, q.city, q.source, q.at].filter(function (x) { return x && x !== "—"; }).join(" · ")) + "</div>" +
      (q.device && q.device !== "—" ? '<div class="pill mb">' + esc(q.device) + "</div>" : "") +
      '<p class="small muted">' + esc(q.note) + "</p></div>" +

      '<div class="grid3 mt call-row">' +
      '<a class="btn big" href="tel:' + esc(q.phone) + '">Pozovi</a>' +
      '<button class="btn ghost big" data-viber="' + q.id + '">Viber</button>' +
      '<a class="btn ghost big" href="mailto:?subject=Vecom%20ponuda">Mejl</a>' +
      "</div>" +

      '<div class="card mt"><h3 class="mb" style="font-size:14px">Status</h3><div class="stack status-row">' +
      INQ_FLOW.map(function (st) {
        return '<button class="opt' + (q.status === st ? " on" : "") + '" data-inq-status="' + q.id + '" data-val="' + st + '">' +
          '<div class="small">' + esc(INQ_LABEL[st]) + "</div></button>";
      }).join("") + "</div></div>" +

      '<div class="card mt"><h3 class="mb" style="font-size:14px">Beleška posle poziva</h3>' +
      '<div class="field"><textarea id="inq-note" placeholder="Šta ste se dogovorili..."></textarea></div>' +
      '<div class="row wrap"><button class="btn sm" data-inq-note="' + q.id + '">Sačuvaj</button>' +
      '<button class="btn ghost sm" data-remind="' + q.id + '">Podseti me za 3 dana</button></div>' +
      (q.history.length
        ? '<div class="sep"></div><div class="list">' + q.history.map(function (h) {
            return '<div class="msg"><div class="tiny muted">' + esc(h.at) + "</div>" +
              '<div class="small">' + esc(h.text) + "</div></div>";
          }).join("") + "</div>"
        : "") +
      "</div>";
  }

  function ticketDetail(t) {
    var p = product(t.slug);
    return '<div class="card"><div class="row spread"><h3>#' + t.id + "</h3>" +
      '<span class="pill"><i class="dot"></i>' + esc(flowLabel(t.status)) + "</span></div>" +
      '<div class="tiny muted mb">' + esc(t.company) + " · " + esc(t.city) + "</div>" +
      '<div class="kv"><span class="k">Aparat</span><span class="v">' + esc(p ? p.name : t.slug) + "</span>" +
      '<span class="k">Serijski</span><span class="v">' + esc(t.serial || "—") + "</span>" +
      '<span class="k">Prijavljeno</span><span class="v">' + dmy(t.opened) + "</span></div>" +
      '<p class="small mt">' + esc(t.issue) + "</p>" +
      (t.photo
        ? '<a class="photo" href="' + esc(t.photo) + '" target="_blank" rel="noopener"><img src="' + esc(t.photo) + '" alt="Fotografija kvara koju je poslao kupac"></a>' +
          '<div class="tiny muted" style="margin-top:6px">Fotografija koju je poslao kupac</div>'
        : "") +
      "</div>" +

      '<div class="card mt"><h3 class="mb" style="font-size:14px">Status</h3><div class="stack status-row">' +
      TICKET_FLOW.map(function (st) {
        return '<button class="opt' + (t.status === st.key ? " on" : "") + '" data-tk-status="' + t.id + '" data-val="' + st.key + '">' +
          '<div class="small">' + esc(st.label) + "</div></button>";
      }).join("") + "</div>" +
      '<div class="sep"></div>' +
      '<div class="field"><label>Serviser</label><select id="tk-eng"><option>Dejan M.</option><option>Stefan P.</option><option>Servis Niš</option></select></div>' +
      '<div class="field"><label>Deo</label><input id="tk-part" placeholder="Senzor protoka rashladne tečnosti"></div>' +
      '<button class="btn sm" data-tk-save="' + t.id + '">Sačuvaj</button>' +
      "</div>" +

      '<div class="card mt"><h3 class="mb" style="font-size:14px">Prepiska</h3><div class="list">' +
      t.messages.map(function (m) {
        return '<div class="msg ' + (m.from === "vecom" ? "vecom" : "") + '">' +
          '<div class="tiny muted">' + (m.from === "vecom" ? "Vecom" : esc(t.company)) + " · " + esc(m.at) + "</div>" +
          '<div class="small">' + esc(m.text) + "</div></div>";
      }).join("") + "</div>" +
      '<div class="field mt"><textarea id="tk-reply" placeholder="Odgovor kupcu..."></textarea></div>' +
      '<button class="btn sm" data-tk-reply="' + t.id + '">Pošalji kupcu</button></div>';
  }

  function masterDetail(listHtml, detailHtml) {
    return '<div class="md"><div class="md-list list">' + listHtml + '</div><div class="md-detail">' + detailHtml + "</div></div>";
  }

  /* ---------- ekrani ---------- */

  var FIELD_VISITS = [
    { at: "10:00", where: "Derma Klinika Vožd, Beograd", what: "Povrat aparata posle popravke, #476" },
    { at: "14:30", where: "Salon Lorena, Niš", what: "Dijagnostika na licu mesta, #482" },
  ];

  function viewAdminHome() {
    if (S.adminRole === "servis") return viewServiceDay();
    var warr = DATA.demo.fleet.filter(function (f) { return f.key === "garancija"; })[0];
    var first = DATA.demo.admin.name.split(" ")[0];

    var waiting =
      newInquiries().slice(0, 1).map(function (q) {
        return '<button class="item" data-nav="#/admin/inquiry/' + q.id + '">' +
          '<div class="grow"><div class="small">' + esc(q.name) + " · " + esc(q.device) + "</div>" +
          '<div class="tiny muted">' + esc(q.city) + " · " + esc(q.source) + " · " + esc(q.at) + "</div></div>" +
          '<span class="pill warn"><i class="dot"></i>nov</span><span class="chev">›</span></button>';
      }).join("") +
      openTickets().slice(0, 1).map(function (t) {
        return '<button class="item" data-nav="#/admin/ticket/' + t.id + '">' +
          '<div class="grow"><div class="small">#' + t.id + " · " + esc(t.company) + "</div>" +
          '<div class="tiny muted">' + esc(t.issue) + "</div></div>" +
          '<span class="pill"><i class="dot"></i>' + esc(flowLabel(t.status)) + '</span><span class="chev">›</span></button>';
      }).join("") +
      waitingOrders().slice(0, 1).map(function (o) {
        return '<button class="item" data-nav="#/admin/orders">' +
          '<div class="grow"><div class="small">Porudžbina #' + o.id + " · " + esc(o.company) + "</div>" +
          '<div class="tiny muted">' + esc(o.items) + "</div></div>" +
          '<span class="pill warn"><i class="dot"></i>čeka</span><span class="chev">›</span></button>';
      }).join("");

    var body =
      '<div class="grid2">' +
      statTile(S.inquiries.length, "upita ove nedelje", "#/admin/inquiries") +
      statTile(openTickets().length, "otvorenih tiketa", "#/admin/service") +
      statTile(waitingOrders().length, "porudžbine čekaju", "#/admin/orders") +
      statTile(warr.count, "garancija ističe", "#/admin/fleet") +
      "</div>" +
      '<h3 class="mt mb" style="font-size:14px">Čeka te</h3><div class="list">' + waiting + "</div>";

    var wide =
      intro(todayLong(), "Dobro jutro, " + first + ".",
        newInquiries().length + " nova upita i " + openTickets().length + " otvorena servisa. Najvažnije je gore levo.",
        '<a class="btn" href="#/admin/inquiries">Otvori upite</a>') +
      '<div class="grid4 mt">' +
      metric("Upiti", S.inquiries.length, newInquiries().length + " novih", "inbox", "#/admin/inquiries", true) +
      metric("Servis", openTickets().length, "otvorenih tiketa", "wrench", "#/admin/service") +
      metric("Porudžbine", waitingOrders().length, "čekaju potvrdu", "box", "#/admin/orders") +
      metric("Garancije", warr.count, "ističu za 60 dana", "shield", "#/admin/fleet") +
      "</div>" +
      '<div class="adm-grid-a mt">' +
      panel("Danas", "Čeka te", '<div class="list">' + waiting + "</div>") +
      panel("Ova nedelja", "Upiti po aparatu", chart(DATA.demo.stats.byDevice), panelLink("#/admin/stats", "Brojke")) +
      "</div>" +
      '<div class="adm-grid-b mt">' +
      panel("Servis", "Otvoreni tiketi", '<div class="list">' + openTickets().slice(0, 3).map(function (t) { return tkRow(t); }).join("") + "</div>", panelLink("#/admin/service", "Svi tiketi")) +
      '<div class="stack">' + todayPanel() + '<article class="panel soft"><div class="eyebrow">Prodajna prilika</div><div class="metric-v">' + warr.count + "</div>" +
      '<p class="small muted">salona ima garanciju koja ističe za 60 dana — pravo vreme za servisni ugovor ili novi aparat.</p>' +
      '<a class="btn ghost sm" href="#/admin/fleet" data-fleet-pre="garancija">Pogledaj listu</a></article></div>' +
      "</div>";

    return adminPage({ title: "Dobro jutro, " + first, sub: "Vecom · " + dmy(new Date().toISOString().slice(0, 10)), body: body, wide: wide, tab: "#/admin", deskTitle: "Pregled" });
  }

  function viewServiceDay() {
    var mine = myTicketsAdmin();
    var visits = FIELD_VISITS.map(function (v) {
      return '<div class="item" style="cursor:default"><b class="small" style="width:48px">' + v.at + "</b>" +
        '<div class="grow"><div class="small">' + esc(v.where) + '</div><div class="tiny muted">' + esc(v.what) + "</div></div></div>";
    }).join("");
    var list = mine.map(function (t) { return tkRow(t); }).join("");

    var body =
      '<div class="grid2">' +
      statTile(mine.length, "mojih tiketa", "#/admin/service") +
      statTile(FIELD_VISITS.length, "obilaska danas", "#/admin") +
      "</div>" +
      '<h3 class="mt mb" style="font-size:14px">Obilasci danas</h3><div class="list">' + visits + "</div>" +
      '<h3 class="mt mb" style="font-size:14px">Moji tiketi</h3><div class="list">' + list + "</div>";

    var wide =
      intro(todayLong(), "Dobro jutro, Dejane.", mine.length + " tiketa u radu i " + FIELD_VISITS.length + " obilaska na terenu danas.") +
      '<div class="grid4 mt">' +
      metric("Moji tiketi", mine.length, "u radu", "wrench", "#/admin/service", true) +
      metric("Novi", S.tickets.filter(function (t) { return t.status === "primljeno"; }).length, "čekaju dijagnostiku", "inbox", "#/admin/service") +
      metric("Obilasci", FIELD_VISITS.length, "danas na terenu", "calendar", "#/admin") +
      metric("Rešeno", 4, "ove nedelje", "shield", "#/admin/service") +
      "</div>" +
      '<div class="adm-grid-a mt">' +
      panel("Servis", "Moji tiketi", '<div class="list">' + list + "</div>", panelLink("#/admin/service", "Svi tiketi")) +
      panel("Teren", "Obilasci danas", '<div class="list">' + visits + "</div>") +
      "</div>";

    return adminPage({ title: "Moj dan", sub: "Dejan Marković · serviser", body: body, wide: wide, tab: "#/admin" });
  }

  function viewAdminInquiries() { return viewAdminInquiry(null); }

  function inquiryById(id) {
    var f = null;
    S.inquiries.forEach(function (q) { if (String(q.id) === String(id)) f = q; });
    return f;
  }

  function viewAdminInquiry(id) {
    var q = id == null ? null : inquiryById(id);
    var sub = S.inquiries.length + " ukupno · " + newInquiries().length + " novih";

    if (isDesktopAdmin()) {
      var sel = q || S.inquiries[0];
      return adminPage({
        title: "Upiti", tab: "#/admin/inquiries", eyebrow: sub,
        wide: masterDetail(S.inquiries.map(function (x) { return inqRow(x, sel.id); }).join(""), inquiryDetail(sel)),
      });
    }

    if (!q) {
      return adminPage({ title: "Upiti", sub: sub, tab: "#/admin/inquiries",
        body: '<div class="list">' + S.inquiries.map(function (x) { return inqRow(x); }).join("") + "</div>" });
    }
    return adminPage({ title: "Upit", sub: q.name, tab: "#/admin/inquiries",
      body: '<a class="small muted" href="#/admin/inquiries">‹ Upiti</a><div class="mt">' + inquiryDetail(q) + "</div>" });
  }

  function viewAdminService() { return viewAdminTicket(null); }

  function viewAdminTicket(id) {
    var t = id == null ? null : ticketById(id);
    var sub = openTickets().length + " otvorenih";

    if (isDesktopAdmin()) {
      var sel = t || S.tickets[0];
      return adminPage({
        title: "Servis", tab: "#/admin/service", eyebrow: sub,
        wide: masterDetail(S.tickets.map(function (x) { return tkRow(x, sel.id); }).join(""), ticketDetail(sel)),
      });
    }

    if (!t) {
      return adminPage({ title: "Servis", sub: sub, tab: "#/admin/service",
        body: '<div class="list">' + S.tickets.map(function (x) { return tkRow(x); }).join("") + "</div>" });
    }
    return adminPage({ title: "Tiket #" + t.id, sub: t.company, tab: "#/admin/service",
      body: '<a class="small muted" href="#/admin/service">‹ Servis</a><div class="mt">' + ticketDetail(t) + "</div>" });
  }

  function viewAdminOrders() {
    var body = '<div class="list">' + S.orders.map(function (o) {
      return '<div class="card card-tight"><div class="row spread"><div class="grow">' +
        '<div class="small">#' + o.id + " · " + esc(o.company) + "</div>" +
        '<div class="tiny muted">' + esc(o.items) + "</div>" +
        '<div class="tiny muted">' + esc(o.city) + " · " + esc(o.at) + "</div></div>" +
        '<span class="pill ' + (o.status === "ceka" ? "warn" : o.status === "odbijeno" ? "alert" : "ok") +
        '"><i class="dot"></i>' + esc(o.status === "ceka" ? "čeka" : o.status === "odbijeno" ? "odbijeno" : o.status === "potvrdjeno" ? "potvrđeno" : "isporučeno") + "</span></div>" +
        (o.status === "ceka"
          ? '<div class="row mt"><button class="btn sm grow" data-order-ok="' + o.id + '">Potvrdi</button>' +
            '<button class="btn ghost sm grow" data-order-no="' + o.id + '">Odbij</button>' +
            '<button class="btn ghost sm grow" data-order-inv="' + o.id + '">Predračun</button></div>'
          : "") +
        "</div>";
    }).join("") + "</div>";
    var title = S.adminRole === "servis" ? "Delovi i porudžbine" : "Porudžbine";
    return adminPage({
      title: title, sub: waitingOrders().length + " čeka potvrdu", body: body, tab: "#/admin/orders",
      wide: intro("Potrošni materijal", title, "Potvrdi ili odbij jednim klikom; predračun ide kupcu na mejl.") +
        '<div class="adm-narrow mt">' + body + "</div>",
    });
  }

  function fleetList(f) {
    return '<div class="card"><div class="row spread mb"><h3 style="font-size:14px">' + esc(f.label) + "</h3>" +
      '<span class="pill">' + f.count + '</span></div><div class="list">' +
      f.salons.map(function (s) {
        return '<div class="row spread small"><div class="grow"><div>' + esc(s.name) + " · " + esc(s.city) + "</div>" +
          '<div class="tiny muted">' + esc(s.device) + " · " + esc(s.detail) + "</div></div></div>";
      }).join("") +
      (f.salons.length < f.count ? '<div class="tiny muted">+ još ' + (f.count - f.salons.length) + " u listi</div>" : "") +
      "</div>" +
      '<button class="btn block mt" data-blast="' + esc(f.key) + '">Pošalji svima poruku</button>' +
      '<p class="tiny muted center" style="margin-top:8px">Mejl + Viber, tekst se priprema jednom i šalje celoj grupi.</p>' +
      "</div>";
  }

  function viewAdminFleet() {
    var sel = S.fleetFilter;
    var filters = '<div class="stack">' + DATA.demo.fleet.map(function (f) {
      return '<button class="opt' + (sel === f.key ? " on" : "") + '" data-fleet="' + esc(f.key) + '">' +
        '<div class="row spread"><span class="small">' + esc(f.label) + "</span>" +
        '<span class="pill">' + f.count + "</span></div></button>";
    }).join("") + "</div>";
    var f = sel ? DATA.demo.fleet.filter(function (x) { return x.key === sel; })[0] : null;
    var body = filters + (f ? '<div class="mt">' + fleetList(f) + "</div>" : "");

    return adminPage({
      title: "Aparati u terenu", sub: "Ko je spreman za sledeću prodaju", body: body, tab: "#/admin/fleet",
      wide: intro("Prodajna lista", "Aparati u terenu", "Nije evidencija nego lista ljudi koje treba zvati ove nedelje.") +
        '<div class="md mt"><div class="md-list">' + filters + '</div><div class="md-detail">' +
        (f ? fleetList(f) : '<div class="card muted small">Izaberite filter levo.</div>') + "</div></div>",
    });
  }

  function viewAdminStats() {
    var s = DATA.demo.stats;
    var conv = '<div class="tiny muted mt">Konverzija upit → prodaja: ' + Math.round((s.funnel[2].value / s.funnel[0].value) * 100) + "%</div>";
    var cards = [
      ["Upiti po aparatu, ove nedelje", chart(s.byDevice)],
      ["Po zemlji", chart(s.byCountry)],
      ["Po izvoru", chart(s.bySource)],
      ["Upit → ponuda → prodaja", chart(s.funnel) + conv],
    ];
    var body = cards.map(function (c, i) {
      return '<div class="card' + (i ? " mt" : "") + '"><h3 class="mb" style="font-size:14px">' + esc(c[0]) + "</h3>" + c[1] + "</div>";
    }).join("");
    return adminPage({
      title: "Brojke", sub: "Poslednjih 7 dana", body: body, tab: "#/admin/stats",
      wide: intro("Poslednjih 7 dana", "Brojke", "Odakle dolaze upiti i koliko ih postane prodaja.") +
        '<div class="grid2 mt">' + cards.map(function (c) {
          return panel("", c[0], c[1]);
        }).join("") + "</div>",
    });
  }

  /* ---------- C · novosti i blog ----------
     Prave objave iz njihovog Sanityja + dva demo nacrta. Objava se bira za:
     sajt (blog), Moj Vecom (novosti kupcima) i mejl, i za koga je (svi ili vlasnici aparata). */

  var POST_STATUS = {
    objavljeno: { label: "Objavljeno", cls: "ok" },
    zakazano: { label: "Zakazano", cls: "warn" },
    nacrt: { label: "Nacrt", cls: "" },
  };

  function initialPosts() {
    var inTwoDays = new Date(); inTwoDays.setDate(inTwoDays.getDate() + 2);
    var real = (DATA.posts || []).map(function (p, i) {
      return {
        id: "p" + i, slug: p.slug, status: "objavljeno", date: p.publishedAt.slice(0, 10), image: p.image,
        title: p.title, excerpt: p.excerpt, body: p.body, real: true,
        channels: { site: true, portal: true, mail: false }, audience: "all", author: "Vecom",
      };
    });
    var sonata = product("sonata-4xd") || {};
    var fusion = product("3xd-fusion-ii") || {};
    return real.concat([
      {
        id: "d1", slug: "novi-protokol-sonata-fototip-v", status: "zakazano", date: isoDate(inTwoDays), image: sonata.image,
        title: { sr: "Novi protokol za Sonatu 4XD: fototip V", en: "", de: "" },
        excerpt: { sr: "Dodali smo protokol za tamnije fototipove — parametri za 1064 nm i preporučen broj tretmana.", en: "", de: "" },
        body: { sr: [
          { style: "normal", text: "U praktikum za Sonatu 4XD dodat je protokol za fototip V." },
          { style: "h2", text: "Šta je novo" },
          { style: "normal", text: "Parametri za 1064 nm, trajanje impulsa i obavezna test tačka 48 sati pre prvog tretmana." },
        ], en: [], de: [] },
        channels: { site: false, portal: true, mail: true }, audience: "sonata-4xd", author: DATA.demo.admin.name,
      },
      {
        id: "d2", slug: "kako-da-sonda-traje-duze", status: "nacrt", date: isoDate(new Date()), image: fusion.image,
        title: { sr: "Kako da sonda traje duže: 5 saveta", en: "", de: "" },
        excerpt: { sr: "Pet navika koje produžavaju vek sonde i smanjuju troškove održavanja.", en: "", de: "" },
        body: { sr: [
          { style: "normal", text: "Sonda je najskuplji potrošni deo lasera. Ovih pet navika produžava njen vek." },
          { style: "h2", text: "1. Hlađenje pre prvog klijenta" },
          { style: "normal", text: "Sačekajte da rashladni sistem dođe na radnu temperaturu pre prvog fleša." },
        ], en: [], de: [] },
        channels: { site: true, portal: true, mail: false }, audience: "all", author: DATA.demo.admin.name,
      },
    ]);
  }

  // novosti koje vidi kupac: objavljene, za Moj Vecom, za sve ili za aparate koje ima
  function portalPosts() {
    var mine = DATA.demo.installations.map(function (i) { return i.slug; });
    return S.posts.filter(function (p) {
      return p.status === "objavljeno" && p.channels.portal && (p.audience === "all" || mine.indexOf(p.audience) >= 0);
    });
  }

  function postById(id) { return S.posts.filter(function (p) { return p.id === id; })[0] || null; }

  function langBadges(p) {
    return '<span class="langs">' + ["sr", "en", "de"].map(function (l) {
      var ok = p.title[l] && p.title[l].trim();
      return '<i class="' + (ok ? "ok" : "") + '" title="' + (ok ? "prevedeno" : "nema prevoda") + '">' + l.toUpperCase() + "</i>";
    }).join("") + "</span>";
  }

  function audienceLabel(p) {
    if (p.audience === "all") return "Svi kupci";
    var pr = product(p.audience);
    return "Vlasnici: " + (pr ? pr.name : p.audience);
  }

  function postRow(p, activeId) {
    var st = POST_STATUS[p.status];
    return '<button class="post-row' + (activeId === p.id ? " sel" : "") + '" data-nav="#/admin/news/' + p.id + '">' +
      '<span class="post-thumb">' + (p.image ? '<img src="' + esc(p.image) + '" alt="">' : ico("image", 18)) + "</span>" +
      '<span class="grow"><span class="small">' + esc(p.title.sr || "Bez naslova") + "</span>" +
      '<span class="tiny muted">' + dmy(p.date) + " · " + esc(audienceLabel(p)) + "</span>" +
      '<span class="post-meta"><span class="pill ' + st.cls + '"><i class="dot"></i>' + st.label + "</span>" + langBadges(p) + "</span></span>" +
      "</button>";
  }

  function newsFilterBar() {
    var f = S.newsFilter;
    return '<div class="row wrap" style="gap:6px">' + [["all", "Sve"], ["objavljeno", "Objavljeno"], ["zakazano", "Zakazano"], ["nacrt", "Nacrt"]].map(function (x) {
      var n = x[0] === "all" ? S.posts.length : S.posts.filter(function (p) { return p.status === x[0]; }).length;
      return '<button class="chip-f' + (f === x[0] ? " on" : "") + '" data-news-filter="' + x[0] + '">' + x[1] + " <b>" + n + "</b></button>";
    }).join("") + "</div>";
  }

  function filteredPosts() {
    return S.posts.filter(function (p) { return S.newsFilter === "all" || p.status === S.newsFilter; });
  }

  function viewAdminNews() {
    var list = filteredPosts();
    var missingDe = S.posts.filter(function (p) { return p.status === "objavljeno" && !p.title.de; }).length;
    var rows = list.map(function (p) { return postRow(p); }).join("") || '<p class="small muted">Nema objava u ovom filteru.</p>';
    var tip = missingDe
      ? '<div class="cu-alert soft">' + ico("globe", 18) + '<div class="grow"><div class="small">' + missingDe + " objavljene objave nemaju nemački prevod</div>" +
        '<div class="tiny muted">Sajt je na tri jezika, a Austrija je tržište — DE verzija nedostaje i na današnjem sajtu.</div></div></div>'
      : "";

    var body = '<a class="btn block" data-news-new="1">' + ico("plus", 16) + " Nova objava</a>" +
      '<div class="mt">' + newsFilterBar() + "</div>" + (tip ? '<div class="mt">' + tip + "</div>" : "") +
      '<div class="list mt">' + rows + "</div>";

    return adminPage({
      title: "Novosti", sub: S.posts.length + " objava", body: body, tab: "#/admin/news",
      wide: intro("Sajt i Moj Vecom", "Novosti i blog",
        "Jedna objava ide na blog sajta, u novosti kupcima i na mejl — ili samo vlasnicima određenog aparata.",
        '<button class="btn" data-news-new="1">' + ico("plus", 16) + " Nova objava</button>") +
        '<div class="mt">' + newsFilterBar() + "</div>" + (tip ? '<div class="mt">' + tip + "</div>" : "") +
        '<div class="post-list mt">' + rows + "</div>",
    });
  }

  function editorBody(blocks) {
    return (blocks || []).map(function (b) {
      return b.style === "h2" || b.style === "h3" ? "<h2>" + esc(b.text) + "</h2>" : "<p>" + esc(b.text) + "</p>";
    }).join("") || "<p><br></p>";
  }

  function readEditor() {
    var el = document.getElementById("ne-body");
    if (!el) return null;
    var out = [];
    Array.prototype.forEach.call(el.children, function (c) {
      var txt = c.textContent.trim();
      if (!txt) return;
      out.push({ style: /^H[1-3]$/.test(c.tagName) ? "h2" : "normal", text: txt });
    });
    if (!out.length && el.textContent.trim()) out.push({ style: "normal", text: el.textContent.trim() });
    return out;
  }

  // prenosi ono sto je uneto u editor u stanje, pre ponovnog crtanja ekrana
  // id i jezik se citaju iz DOM-a, ne iz stanja: posle klika na drugi jezik
  // stanje je vec promenjeno, a u poljima je jos tekst prethodnog jezika
  function syncEditor() {
    var ti = document.getElementById("ne-title");
    if (!ti) return;
    var p = postById(ti.getAttribute("data-id"));
    if (!p) return;
    var l = ti.getAttribute("data-l");
    p.title[l] = val("ne-title");
    p.excerpt[l] = val("ne-excerpt");
    var b = readEditor();
    if (b) p.body[l] = b;
    var aud = document.getElementById("ne-aud");
    if (aud) p.audience = aud.value;
    var dt = document.getElementById("ne-date");
    if (dt && dt.value) p.date = dt.value;
    ["site", "portal", "mail"].forEach(function (k) {
      var cb = document.getElementById("ne-ch-" + k);
      if (cb) p.channels[k] = cb.checked;
    });
  }

  function viewAdminPost(id) {
    var p = postById(id);
    if (!p) return viewAdminNews();
    if (S.newsEdit.id !== id) S.newsEdit = { id: id, lang: "sr" };
    var l = S.newsEdit.lang;
    var st = POST_STATUS[p.status];
    var slug = p.slug || "nova-objava";

    var langTabs = '<div class="seg">' + ["sr", "en", "de"].map(function (x) {
      var ok = p.title[x] && p.title[x].trim();
      return '<button class="' + (l === x ? "on" : "") + '" data-news-lang="' + x + '">' + x.toUpperCase() + (ok ? "" : " ·") + "</button>";
    }).join("") + "</div>";

    var editor =
      '<article class="panel">' +
      '<div class="row spread wrap mb" style="gap:8px">' + langTabs +
      (!p.title[l] && l !== "sr" ? '<button class="btn ghost sm" data-news-translate="' + l + '">' + ico("globe", 14) + " Pošalji na prevod</button>" : "") +
      "</div>" +
      '<div class="ne-cover">' + (p.image ? '<img src="' + esc(p.image) + '" alt="">' : '<span class="muted small">' + ico("image", 20) + " Naslovna slika</span>") +
      '<button class="btn ghost sm" data-toast="U pravoj aplikaciji: izbor slike iz galerije ili sa telefona">' + ico("image", 14) + " Promeni</button></div>" +
      '<div class="field mt"><label>Naslov (' + l.toUpperCase() + ')</label><input id="ne-title" class="ne-title" data-id="' + p.id + '" data-l="' + l + '" value="' + esc(p.title[l] || "") + '" placeholder="Naslov objave"></div>' +
      '<div class="field"><label>Kratak opis</label><textarea id="ne-excerpt" rows="2" style="min-height:0" placeholder="Jedna-dve rečenice za listu i Google">' + esc(p.excerpt[l] || "") + "</textarea></div>" +
      '<div class="field"><label>Tekst</label>' +
      '<div class="ne-tools"><button data-ne-cmd="bold"><b>B</b></button><button data-ne-cmd="italic"><i>I</i></button>' +
      '<button data-ne-cmd="h2">H2</button><button data-ne-cmd="p">¶</button><button data-ne-cmd="list">• Lista</button>' +
      '<button data-ne-cmd="link">' + ico("link", 14) + "</button></div>" +
      '<div id="ne-body" class="ne-body" contenteditable="true">' + editorBody(p.body[l]) + "</div></div>" +
      "</article>";

    var side =
      '<article class="panel"><div class="row spread"><h3>Objava</h3><span class="pill ' + st.cls + '"><i class="dot"></i>' + st.label + "</span></div>" +
      '<div class="field mt"><label>Datum objave</label><input id="ne-date" type="date" value="' + esc(p.date) + '"></div>' +
      '<div class="tiny muted" style="margin-bottom:6px">Gde se prikazuje</div>' +
      [["site", "Sajt vecom.rs — blog", "globe"], ["portal", "Moj Vecom — novosti kupcima", "users"], ["mail", "Mejl kupcima", "send"]].map(function (c) {
        return '<label class="ne-ch"><input type="checkbox" id="ne-ch-' + c[0] + '"' + (p.channels[c[0]] ? " checked" : "") + ">" + ico(c[2], 15) + "<span>" + c[1] + "</span></label>";
      }).join("") +
      '<div class="field mt"><label>Ko vidi</label><select id="ne-aud"><option value="all"' + (p.audience === "all" ? " selected" : "") + ">Svi kupci</option>" +
      sellableProducts().slice(0, 20).map(function (x) {
        return '<option value="' + esc(x.slug) + '"' + (p.audience === x.slug ? " selected" : "") + ">Vlasnici: " + esc(x.name) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="stack" style="gap:8px">' +
      '<button class="btn block" data-news-publish="' + p.id + '">' + ico("send", 15) + (p.status === "objavljeno" ? " Sačuvaj izmene" : " Objavi sada") + "</button>" +
      '<div class="row" style="gap:8px"><button class="btn ghost sm grow" data-news-schedule="' + p.id + '">' + ico("clock", 14) + " Zakaži</button>" +
      '<button class="btn ghost sm grow" data-news-draft="' + p.id + '">Nacrt</button></div></div>' +
      "</article>" +
      '<article class="panel"><div class="eyebrow">Pregled u Google pretrazi</div>' +
      '<div class="serp"><div class="serp-url">vecom.rs › ' + l + " › blog › " + esc(slug) + "</div>" +
      '<div class="serp-t">' + esc(p.title[l] || p.title.sr || "Naslov objave") + " | Vecom</div>" +
      '<div class="serp-d">' + esc((p.excerpt[l] || p.excerpt.sr || "").slice(0, 155)) + "</div></div>" +
      (p.real ? '<p class="tiny muted" style="margin-top:8px">Prava objava sa njihovog sajta, preuzeta iz Sanityja.</p>' : "") +
      "</article>";

    var back = '<a class="small muted" href="#/admin/news">‹ Novosti</a>';
    return adminPage({
      title: p.title.sr ? "Objava" : "Nova objava", sub: st.label, tab: "#/admin/news",
      body: back + '<div class="mt">' + editor + '</div><div class="stack mt">' + side + "</div>",
      wide: back + '<div class="ne-layout mt"><div>' + editor + '</div><div class="stack">' + side + "</div></div>",
      deskTitle: "Novosti i blog",
    });
  }

  function newsCommand(cmd) {
    var el = document.getElementById("ne-body");
    if (!el) return;
    if (cmd === "bold" || cmd === "italic") document.execCommand(cmd);
    else if (cmd === "h2") document.execCommand("formatBlock", false, "h2");
    else if (cmd === "p") document.execCommand("formatBlock", false, "p");
    else if (cmd === "list") document.execCommand("insertUnorderedList");
    else if (cmd === "link") toast("U pravoj aplikaciji: dodavanje linka");
  }

  function viewAdminMore() {
    var r = roleCfg();
    var rest = r.nav.filter(function (n) { return r.tabs.indexOf(n.href) < 0; });
    var body = '<div class="list">' + rest.map(function (n, i) {
      var grp = n.group && (i === 0 || rest[i - 1].group !== n.group) ? '<div class="eyebrow" style="margin:8px 0 0">' + esc(n.group) + "</div>" : "";
      var b = navBadge(n.href);
      return grp + '<a class="item" href="' + n.href + '" style="text-decoration:none"><span class="cu-q-ic">' + ico(n.icon, 18) + "</span>" +
        '<div class="grow small">' + esc(n.label) + "</div>" + (b ? '<span class="pill">' + b + "</span>" : "") + '<span class="chev">›</span></a>';
    }).join("") + "</div>";
    return adminPage({ title: "Više", sub: "Ostali ekrani", body: body, tab: "#/admin/more" });
  }

  /* ---------- C · edukacija u adminu ---------- */

  var LEARNERS = [
    { name: "Milica Petrović", salon: "Salon Lorena", city: "Niš", live: true },
    { name: "Ana Ilić", salon: "Salon Lorena", city: "Niš", done: 20, quiz: 5, last: "danas" },
    { name: "Jovana Marić", salon: "Studio Belle", city: "Novi Sad", done: 20, quiz: 5, last: "pre 3 dana" },
    { name: "Tamara Kostić", salon: "Klinika Estetica", city: "Beograd", done: 20, quiz: 5, last: "pre 5 dana" },
    { name: "Katarina Weber", salon: "Beauty Line", city: "Beč", done: 17, quiz: 4, last: "pre 2 dana" },
    { name: "Ivana Popović", salon: "Laser Centar Niš", city: "Niš", done: 14, quiz: 3, last: "juče" },
    { name: "Sandra Nikolić", salon: "Derma Klinika Vožd", city: "Beograd", done: 9, quiz: 2, last: "pre 11 dana", stale: true },
    { name: "Marija Stojanović", salon: "Epil Studio", city: "Čačak", done: 6, quiz: 1, last: "pre 16 dana", stale: true },
  ];

  function learnerView(x) {
    if (!x.live) return x;
    return Object.assign({}, x, { done: doneCount(), quiz: quizzesPassed(), last: "danas", stale: false });
  }

  function learnerStatus(x) {
    if (x.done === LESSONS.length && x.quiz === QUIZ.length) return { key: "done", label: "Sertifikat", cls: "ok" };
    if (x.stale) return { key: "stale", label: "Zastoj", cls: "alert" };
    return { key: "run", label: "U toku", cls: "warn" };
  }

  function viewAdminEdu() {
    var rows = LEARNERS.map(learnerView);
    var cnt = { done: 0, run: 0, stale: 0 };
    rows.forEach(function (x) { cnt[learnerStatus(x).key]++; });

    var list = rows.map(function (x) {
      var st = learnerStatus(x);
      var pct = Math.round((x.done / LESSONS.length) * 100);
      var action = st.key === "stale"
        ? '<button class="btn ghost sm" data-toast="Podsetnik poslat: ' + esc(x.name) + ' (mejl + Viber)">Podseti</button>'
        : st.key === "done"
          ? (x.live ? '<a class="btn ghost sm" href="#/verify/' + certNumber() + '">Sertifikat</a>' : '<button class="btn ghost sm" data-toast="Sertifikat ' + esc(x.name) + ' poslat na mejl">Sertifikat</button>')
          : "";
      return '<div class="learner"><span class="cu-av sm">' + esc(initials(x.name)) + "</span>" +
        '<div class="learner-n"><div class="small">' + esc(x.name) + (x.live ? ' <span class="pill" style="padding:0 8px">uživo iz demoa</span>' : "") + "</div>" +
        '<div class="tiny muted">' + esc(x.salon) + " · " + esc(x.city) + " · " + esc(x.last) + "</div></div>" +
        '<div class="learner-p"><div class="bar"><i class="' + (st.key === "stale" ? "alert" : "ok") + '" style="width:' + pct + '%"></i></div>' +
        '<div class="tiny muted">' + x.done + "/" + LESSONS.length + " lekcija · kvizovi " + x.quiz + "/" + QUIZ.length + "</div></div>" +
        '<span class="pill ' + st.cls + '"><i class="dot"></i>' + st.label + "</span>" + action + "</div>";
    }).join("");

    var hard = [
      ["Koja talasna dužina je za tamne fototipove?", 58],
      ["In-motion tehnika: koliko prolaza po polju?", 64],
      ["Koliko pre prvog tretmana se radi test tačka?", 71],
    ].map(function (h) {
      return '<div class="small" style="margin-top:10px">' + esc(h[0]) + "</div>" +
        '<div class="row" style="gap:10px"><div class="bar grow"><i class="' + (h[1] < 65 ? "warn" : "ok") + '" style="width:' + h[1] + '%"></i></div><span class="tiny muted">' + h[1] + "% tačno</span></div>";
    }).join("");

    var videos = COURSE.modules.map(function (m, mi) {
      var n = LESSONS.filter(function (l) { return l.mi === mi; }).length;
      return '<div class="row spread small" style="padding:8px 0;border-top:1px solid var(--line)"><span>' + (mi + 1) + ". " + esc(m.title) + "</span>" +
        '<span class="pill warn"><i class="dot"></i>0/' + n + " klipova</span></div>";
    }).join("");

    var body =
      '<div class="grid2">' +
      statTile(rows.length, "polaznika", "#/admin/edu") + statTile(cnt.done, "sertifikata", "#/admin/edu") +
      statTile(cnt.run, "u toku", "#/admin/edu") + statTile(cnt.stale, "zastoj > 10 dana", "#/admin/edu") +
      '</div><div class="list mt learners">' + list + "</div>";

    return adminPage({
      title: "Edukacija", sub: COURSE.school, body: body, tab: "#/admin/edu",
      wide: intro(COURSE.school, "Edukacija kupaca",
        "Ko gleda kurs, ko je stao na pola i ko je dobio sertifikat. Podsetnik jednim klikom.",
        '<button class="btn" data-toast="Link za kurs poslat svim kupcima Sonate 4XD">' + ico("send", 15) + " Pozovi kupce na kurs</button>") +
        '<div class="grid4 mt">' +
        metric("Polaznici", rows.length, "iz " + (new Set(rows.map(function (x) { return x.salon; }))).size + " salona", "users", "#/admin/edu", true) +
        metric("Sertifikati", cnt.done, "kurs završen", "grad", "#/admin/edu") +
        metric("U toku", cnt.run, "aktivni ove nedelje", "play", "#/admin/edu") +
        metric("Zastoj", cnt.stale, "bez aktivnosti > 10 dana", "alert", "#/admin/edu") +
        "</div>" +
        '<div class="adm-grid-a mt">' +
        panel("Kurs: " + COURSE.title, "Polaznici", '<div class="list learners">' + list + "</div>") +
        '<div class="stack">' +
        panel("Kvizovi", "Najteža pitanja", '<p class="tiny muted" style="margin:0">Gde polaznici najčešće greše — tema za sledeću obuku.</p>' + hard) +
        panel("Snimanje", "Video lekcije", '<p class="tiny muted" style="margin:0 0 6px">Kad se klipovi otpreme, lekcije ih odmah prikazuju.</p>' + videos +
          '<button class="btn ghost sm mt" data-toast="U pravoj aplikaciji: otpremanje klipa i dodela lekciji">' + ico("plus", 14) + " Otpremi video</button>") +
        "</div></div>",
    });
  }

  /* ---------- C · kalendar ---------- */

  function weekStart(offset) {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
    return d;
  }

  function initialBookings() {
    var ws = weekStart(0), nx = weekStart(1);
    var at = function (base, day) { var d = new Date(base); d.setDate(d.getDate() + day); return isoDate(d); };
    return [
      { type: "demo", date: at(ws, 1), slot: "10:30", title: "Milica Jovanović", device: "Sonata 4XD", loc: "bg", inqId: 1 },
      { type: "demo", date: at(ws, 2), slot: "13:00", title: "Dr Nenad Stanković", device: "Ultralift HIFU", loc: "bg", inqId: 2 },
      { type: "obuka", date: at(ws, 2), slot: "09:30", title: "Obuka · Salon Lorena", device: "Sonata 4XD", loc: "nis" },
      { type: "servis", date: at(ws, 3), slot: "14:30", title: "Servis · Salon Lorena", device: "Sonata 4XD", loc: "nis" },
      { type: "demo", date: at(ws, 4), slot: "11:30", title: "Wellness Hotel Vrdnik", device: "Wellness Omnia Spa", loc: "bg", inqId: 4 },
      { type: "demo", date: at(nx, 0), slot: "16:00", title: "Beauty Studio M", device: "EMS Tesla 2.0", loc: "bg", inqId: 3 },
      { type: "obuka", date: at(nx, 2), slot: "10:30", title: "Obuka · Studio Belle", device: "3XD Fusion II", loc: "nis" },
    ];
  }

  var BOOK_TYPE = { demo: "Demo", obuka: "Obuka", servis: "Servis" };
  var CAL_HOURS = [9, 10, 11, 12, 13, 14, 15, 16];

  function calEvents(dateIso, hour) {
    return S.bookings.filter(function (b) {
      return b.date === dateIso && (S.calLoc === "all" || b.loc === S.calLoc) && (hour == null || Number(b.slot.split(":")[0]) === hour);
    }).sort(function (a, b) { return a.slot < b.slot ? -1 : 1; });
  }

  function calCard(b) {
    return '<button class="cal-ev ' + b.type + '"' + (b.inqId ? ' data-nav="#/admin/inquiry/' + b.inqId + '"' : ' data-toast="' + esc(BOOK_TYPE[b.type] + " · " + b.title + " · " + b.slot) + '"') + ">" +
      "<b>" + b.slot + " · " + esc(BOOK_TYPE[b.type]) + "</b><span>" + esc(b.title) + "</span><i>" + esc(b.device) + " · " + (b.loc === "bg" ? "Beograd" : "Niš") + "</i></button>";
  }

  function viewAdminCalendar() {
    var ws = weekStart(S.calWeek);
    var days = [0, 1, 2, 3, 4].map(function (i) { var d = new Date(ws); d.setDate(d.getDate() + i); return d; });
    var todayIso = isoDate(new Date());
    var dn = ["Pon", "Uto", "Sre", "Čet", "Pet"];
    var weekLabel = dmy(isoDate(days[0])).slice(0, 6) + " – " + dmy(isoDate(days[4]));
    var total = days.reduce(function (n, d) { return n + calEvents(isoDate(d)).length; }, 0);

    var controls = '<div class="row spread wrap" style="gap:8px">' +
      '<div class="row" style="gap:6px"><button class="bk-nav" data-cal-week="-1"' + (S.calWeek <= 0 ? " disabled" : "") + ">" + ico("chevLeft", 16) + "</button>" +
      '<b class="small">' + weekLabel + "</b>" +
      '<button class="bk-nav" data-cal-week="1"' + (S.calWeek >= 4 ? " disabled" : "") + ">" + ico("chev", 16) + "</button></div>" +
      '<div class="row" style="gap:6px">' + [["all", "Sve"], ["bg", "Beograd"], ["nis", "Niš"]].map(function (x) {
        return '<button class="chip-f' + (S.calLoc === x[0] ? " on" : "") + '" data-cal-loc="' + x[0] + '">' + x[1] + "</button>";
      }).join("") + "</div></div>";

    var legend = '<div class="cal-legend">' + Object.keys(BOOK_TYPE).map(function (k) {
      return '<span><i class="' + k + '"></i>' + BOOK_TYPE[k] + "</span>";
    }).join("") + '<span class="muted">· termini sa sajta stižu ovde sami</span></div>';

    var grid = '<div class="cal-grid"><div class="cal-h"></div>' + days.map(function (d, i) {
      return '<div class="cal-h' + (isoDate(d) === todayIso ? " today" : "") + '"><b>' + dn[i] + "</b> " + d.getDate() + "." + (d.getMonth() + 1) + ".</div>";
    }).join("") +
      CAL_HOURS.map(function (h) {
        return '<div class="cal-t">' + pad(h) + ":00</div>" + days.map(function (d) {
          return '<div class="cal-c">' + calEvents(isoDate(d), h).map(calCard).join("") + "</div>";
        }).join("");
      }).join("") + "</div>";

    var agenda = days.map(function (d, i) {
      var ev = calEvents(isoDate(d));
      return '<div class="cal-day"><div class="small"><b>' + dn[i] + " " + d.getDate() + "." + (d.getMonth() + 1) + ".</b>" + (isoDate(d) === todayIso ? " · danas" : "") + "</div>" +
        (ev.length ? '<div class="stack" style="gap:6px;margin-top:6px">' + ev.map(calCard).join("") + "</div>" : '<div class="tiny muted">slobodno</div>') + "</div>";
    }).join("");

    return adminPage({
      title: "Kalendar", sub: total + " termina ove nedelje", tab: "#/admin/calendar",
      body: controls + '<div class="mt">' + legend + '</div><div class="stack mt">' + agenda + "</div>",
      wide: intro("Showroom Beograd i Niš", "Kalendar", "Demo termini sa sajta, obuke i servisne posete na jednom mestu.",
        '<button class="btn" data-toast="U pravoj aplikaciji: novi termin sa izborom kupca i aparata">' + ico("plus", 15) + " Novi termin</button>") +
        '<article class="panel mt">' + controls + '<div class="mt">' + legend + "</div>" + '<div class="mt cal-scroll">' + grid + "</div></article>",
    });
  }

  /* ---------- C · sadržaj sajta: katalog, iskustva, pitanja ----------
     Ono što danas radi Sanity: urednik menja aparat, a sajt ga odmah prikazuje. */

  function catName(slug) {
    var c = DATA.categories.filter(function (x) { return x.slug === slug; })[0];
    return c ? c.name : slug;
  }

  // prevod "fali" kad je polje prazno ili je ostala kopija drugog jezika (tako je radio harvest)
  function catLangOk(p, l) {
    if (l === "sr") return !!p.desc;
    var d = l === "en" ? p.descEn : p.descDe;
    return !!d && d !== p.desc && (l === "en" || d !== p.descEn);
  }

  function catLangBadges(p) {
    return '<span class="langs">' + ["sr", "en", "de"].map(function (l) {
      return '<i class="' + (catLangOk(p, l) ? "ok" : "") + '">' + l.toUpperCase() + "</i>";
    }).join("") + "</span>";
  }

  function viewAdminCatalog() {
    var q = S.catQuery.toLowerCase().trim();
    var list = DATA.products.filter(function (p) {
      return (S.catCat === "all" || p.category === S.catCat) &&
        (!q || (p.name + " " + p.sku + " " + p.nameEn).toLowerCase().indexOf(q) >= 0);
    });
    var cats = DATA.categories.filter(function (c) {
      return DATA.products.some(function (p) { return p.category === c.slug; });
    });
    var missing = DATA.products.filter(function (p) { return !catLangOk(p, "de") || !catLangOk(p, "en"); }).length;

    var chips = '<div class="row wrap" style="gap:6px"><button class="chip-f' + (S.catCat === "all" ? " on" : "") + '" data-cat-cat="all">Svi <b>' + DATA.products.length + "</b></button>" +
      cats.map(function (c) {
        var n = DATA.products.filter(function (p) { return p.category === c.slug; }).length;
        return '<button class="chip-f' + (S.catCat === c.slug ? " on" : "") + '" data-cat-cat="' + c.slug + '">' + esc(c.name) + " <b>" + n + "</b></button>";
      }).join("") + "</div>";

    var rows = list.map(function (p) {
      var hidden = S.catHidden[p.slug];
      return '<button class="post-row" data-nav="#/admin/catalog/' + p.slug + '">' +
        '<span class="post-thumb cat">' + (p.image ? '<img src="' + esc(p.image) + '" alt="">' : "") + "</span>" +
        '<span class="grow"><span class="small">' + esc(p.name) + (S.catFeatured[p.slug] ? " ★" : "") + "</span>" +
        '<span class="tiny muted">Šifra ' + esc(p.sku) + " · " + esc(catName(p.category)) + "</span>" +
        '<span class="post-meta"><span class="pill ' + (hidden ? "" : "ok") + '"><i class="dot"></i>' + (hidden ? "Sakriveno" : "Na sajtu") + "</span>" + catLangBadges(p) + "</span></span></button>";
    }).join("") || '<p class="small muted">Nema aparata za ovu pretragu.</p>';

    var search = '<div class="field" style="margin:0"><input id="cat-q" placeholder="Pretraga po nazivu ili šifri..." value="' + esc(S.catQuery) + '"></div>';
    var tip = missing
      ? '<div class="cu-alert soft">' + ico("globe", 18) + '<div class="grow"><div class="small">' + missing + " aparata nema pun EN ili DE opis</div>" +
        '<div class="tiny muted">Oznaka jezika je isprekidana gde prevod fali. Na sajtu se tada prikazuje drugi jezik.</div></div></div>'
      : "";

    var body = search + '<div class="mt">' + chips + "</div>" + (tip ? '<div class="mt">' + tip + "</div>" : "") + '<div class="list mt">' + rows + "</div>";
    return adminPage({
      title: "Katalog", sub: DATA.products.length + " aparata", body: body, tab: "#/admin/catalog",
      wide: intro("Sajt vecom.rs", "Katalog aparata",
        "Svih 54 aparata na tri jezika. Izmena ovde odmah menja stranicu aparata na sajtu — bez posebnog CMS-a.",
        '<button class="btn" data-toast="U pravoj aplikaciji: novi aparat sa slikama i prevodima">' + ico("plus", 15) + " Novi aparat</button>") +
        '<div class="mt">' + search + '</div><div class="mt">' + chips + "</div>" + (tip ? '<div class="mt">' + tip + "</div>" : "") +
        '<div class="post-list mt">' + rows + "</div>",
    });
  }

  function catField(p, l, base) {
    return l === "sr" ? p[base] : p[base + (l === "en" ? "En" : "De")];
  }

  function viewAdminProduct(slug) {
    var p = product(slug);
    if (!p) return viewAdminCatalog();
    if (S.catEdit.slug !== slug) S.catEdit = { slug: slug, lang: "sr" };
    var l = S.catEdit.lang;
    var feats = (p.features || []).slice(0, 4);

    var main =
      '<article class="panel">' +
      '<div class="row spread wrap mb" style="gap:8px"><div class="seg">' + ["sr", "en", "de"].map(function (x) {
        return '<button class="' + (l === x ? "on" : "") + '" data-cat-lang="' + x + '">' + x.toUpperCase() + (catLangOk(p, x) ? "" : " ·") + "</button>";
      }).join("") + "</div>" +
      (!catLangOk(p, l) ? '<button class="btn ghost sm" data-toast="Opis poslat na prevod (' + l.toUpperCase() + ')">' + ico("globe", 14) + " Pošalji na prevod</button>" : "") + "</div>" +
      '<div class="cat-edit-top"><div class="cu-dev-img">' + (p.image ? '<img src="' + esc(p.image) + '" alt="">' : "") + "</div>" +
      '<div class="grow"><div class="field"><label>Naziv (' + l.toUpperCase() + ')</label><input id="ce-name" class="ne-title" data-slug="' + esc(p.slug) + '" data-l="' + l + '" value="' + esc(catField(p, l, "name") || "") + '"></div>' +
      '<button class="btn ghost sm" data-toast="U pravoj aplikaciji: galerija slika aparata">' + ico("image", 14) + " Slike (" + (p.image ? 1 : 0) + ")</button></div></div>" +
      '<div class="field mt"><label>Kratak opis (' + l.toUpperCase() + ')</label><textarea id="ce-desc" rows="3">' + esc(catField(p, l, "desc") || "") + "</textarea></div>" +
      (feats.length
        ? '<div class="tiny muted" style="margin-bottom:6px">Ključne prednosti (' + l.toUpperCase() + ")</div>" + feats.map(function (f, i) {
            var v = l === "sr" ? f.title : l === "en" ? f.titleEn : f.titleDe;
            return '<div class="field" style="margin-bottom:6px"><input id="ce-f' + i + '" value="' + esc(v || "") + '"></div>';
          }).join("")
        : "") +
      "</article>";

    var side =
      '<article class="panel"><h3 class="mb">Na sajtu</h3>' +
      '<label class="ne-ch"><input type="checkbox" id="ce-vis"' + (S.catHidden[p.slug] ? "" : " checked") + ">" + ico("globe", 15) + "<span>Prikaži na sajtu</span></label>" +
      '<label class="ne-ch"><input type="checkbox" id="ce-feat"' + (S.catFeatured[p.slug] ? " checked" : "") + ">" + ico("zap", 15) + "<span>Istaknut na početnoj</span></label>" +
      '<div class="field mt"><label>Kategorija</label><select id="ce-cat">' + DATA.categories.map(function (c) {
        return '<option value="' + c.slug + '"' + (c.slug === p.category ? " selected" : "") + ">" + esc(c.name) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="field"><label>Šifra</label><input id="ce-sku" value="' + esc(p.sku) + '"></div>' +
      '<div class="stack" style="gap:8px"><button class="btn block" data-cat-save="' + esc(p.slug) + '">' + ico("check", 15) + " Sačuvaj</button>" +
      '<button class="btn ghost block" data-cat-view="' + esc(p.slug) + '">Pogledaj na sajtu ›</button></div></article>' +
      '<p class="tiny muted">Naziv i opis se čuvaju odmah; stranica aparata na sajtu prikazuje novu verziju na izabranom jeziku.</p>';

    var back = '<a class="small muted" href="#/admin/catalog">‹ Katalog</a>';
    return adminPage({
      title: p.name, sub: "Šifra " + p.sku, tab: "#/admin/catalog", deskTitle: "Katalog aparata",
      body: back + '<div class="mt">' + main + '</div><div class="stack mt">' + side + "</div>",
      wide: back + '<div class="ne-layout mt"><div>' + main + '</div><div class="stack">' + side + "</div></div>",
    });
  }

  // prenosi unos iz editora aparata u podatke (isti obrazac kao editor novosti)
  function syncCatalog() {
    var el = document.getElementById("ce-name");
    if (!el) return;
    var p = product(el.getAttribute("data-slug"));
    if (!p) return;
    var l = el.getAttribute("data-l");
    var suf = l === "sr" ? "" : l === "en" ? "En" : "De";
    p["name" + suf] = val("ce-name", p.name);
    p["desc" + suf] = val("ce-desc");
    (p.features || []).slice(0, 4).forEach(function (f, i) {
      var inp = document.getElementById("ce-f" + i);
      if (inp) f[l === "sr" ? "title" : "title" + suf] = inp.value.trim();
    });
    var cat = document.getElementById("ce-cat"); if (cat) p.category = cat.value;
    var sku = document.getElementById("ce-sku"); if (sku && sku.value.trim()) p.sku = sku.value.trim();
    var vis = document.getElementById("ce-vis"); if (vis) S.catHidden[p.slug] = !vis.checked;
    var feat = document.getElementById("ce-feat"); if (feat) S.catFeatured[p.slug] = feat.checked;
  }

  /* iskustva i česta pitanja */

  function numbersIn(s) { return (String(s || "").match(/\d+/g) || []).join("–"); }

  // isti broj mora da stoji u svim jezicima; razlika je znak da je prevod zastareo
  function faqMismatch(f) {
    var n = { sr: numbersIn(f.a.sr), en: numbersIn(f.a.en), de: numbersIn(f.a.de) };
    return n.sr !== n.en || n.sr !== n.de ? n : null;
  }

  function stars(n) {
    var out = "";
    for (var i = 0; i < 5; i++) out += '<span class="star' + (i < n ? " on" : "") + '">★</span>';
    return '<span class="stars">' + out + "</span>";
  }

  function viewAdminContent() {
    var l = S.contentLang;
    var langTabs = '<div class="seg">' + ["sr", "en", "de"].map(function (x) {
      return '<button class="' + (l === x ? "on" : "") + '" data-content-lang="' + x + '">' + x.toUpperCase() + "</button>";
    }).join("") + "</div>";

    var tst = S.content.testimonials.map(function (x, i) {
      return '<div class="ct-item"><div class="row spread wrap" style="gap:8px"><div class="small"><b>' + esc(x.author) + "</b> " + stars(x.stars) + "</div>" +
        '<label class="ne-ch" style="border:0;padding:0"><input type="checkbox" data-ct-vis="t' + i + '"' + (x.hidden ? "" : " checked") + "><span>Na sajtu</span></label></div>" +
        '<textarea class="ct-text" rows="3" data-ct="t:' + i + ':' + l + '">' + esc(x.message[l]) + "</textarea></div>";
    }).join("");

    var faq = S.content.faq.map(function (f, i) {
      var mm = faqMismatch(f);
      return '<div class="ct-item">' +
        (mm ? '<div class="ct-warn">' + ico("alert", 15) + "<span>Brojevi se razlikuju po jezicima: SR " + esc(mm.sr || "—") + " · EN " + esc(mm.en || "—") + " · DE " + esc(mm.de || "—") + "</span></div>" : "") +
        '<input class="ct-q" data-ct="q:' + i + ':' + l + '" value="' + esc(f.q[l]) + '" placeholder="Pitanje">' +
        '<textarea class="ct-text" rows="2" data-ct="a:' + i + ':' + l + '" placeholder="Odgovor">' + esc(f.a[l]) + "</textarea></div>";
    }).join("");

    var issues = S.content.faq.filter(faqMismatch).length;
    var tip = issues
      ? '<div class="cu-alert">' + ico("alert", 18) + '<div class="grow"><div class="small">' + issues + " odgovor ima različite brojeve u prevodima</div>" +
        '<div class="tiny muted">Primer sa današnjeg sajta: isporuka „7 do 10 dana” na srpskom, „7–14” na engleskom i nemačkom. Admin to hvata sam.</div></div></div>'
      : "";

    var save = '<button class="btn" data-content-save="1">' + ico("check", 15) + " Sačuvaj izmene</button>";
    var inner = '<div class="row spread wrap" style="gap:8px">' + langTabs + save + "</div>" + (tip ? tip : "") +
      '<div class="adm-grid-a mt">' +
      panel("Stranice aparata i početna", "Iskustva kupaca", '<div class="stack">' + tst + "</div>" +
        '<button class="btn ghost sm mt" data-toast="U pravoj aplikaciji: novo iskustvo sa slikom salona">' + ico("plus", 14) + " Dodaj iskustvo</button>") +
      panel("Stranice aparata i kontakt", "Česta pitanja", '<div class="stack">' + faq + "</div>" +
        '<button class="btn ghost sm mt" data-ct-add="1">' + ico("plus", 14) + " Novo pitanje</button>") +
      "</div>";

    return adminPage({
      title: "Iskustva i pitanja", sub: "Sadržaj sajta", tab: "#/admin/content",
      body: inner,
      wide: intro("Sajt vecom.rs", "Iskustva i česta pitanja", "Tekstovi koji se prikazuju na stranicama aparata, na tri jezika.") + '<div class="mt">' + inner + "</div>",
    });
  }

  function syncContent() {
    var els = document.querySelectorAll("[data-ct]");
    if (!els.length) return;
    Array.prototype.forEach.call(els, function (el) {
      var p = el.getAttribute("data-ct").split(":");
      var i = Number(p[1]), l = p[2];
      if (p[0] === "t") S.content.testimonials[i].message[l] = el.value;
      if (p[0] === "q") S.content.faq[i].q[l] = el.value;
      if (p[0] === "a") S.content.faq[i].a[l] = el.value;
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-ct-vis]"), function (el) {
      S.content.testimonials[Number(el.getAttribute("data-ct-vis").slice(1))].hidden = !el.checked;
    });
  }

  /* ---------- C · kupci i nalozi ----------
     Svaki kupac dobija nalog pri isporuci: admin šalje pozivnicu, kupac se prijavi Google nalogom. */

  function countryOf(city) {
    if (/Beč|Wien|Graz|Linz|Salzburg/.test(city)) return "Austrija";
    if (/Skoplje|Bitolj|Ohrid/.test(city)) return "S. Makedonija";
    if (/Podgorica|Budva|Bar/.test(city)) return "Crna Gora";
    return "Srbija";
  }

  function initialCustomers() {
    var c = DATA.demo.company;
    var list = [{
      id: "c0", name: c.name, contact: c.contact, email: c.email, city: c.city, country: "Srbija", lang: "sr",
      devices: DATA.demo.installations.map(function (i) { return (product(i.slug) || {}).name; }), status: "aktivan", last: "danas", live: true,
    }];
    var seen = {};
    seen[c.name] = true;
    DATA.demo.fleet.forEach(function (f) {
      f.salons.forEach(function (s) {
        if (seen[s.name]) { list.filter(function (x) { return x.name === s.name; })[0].devices.push(s.device); return; }
        seen[s.name] = true;
        var n = list.length;
        list.push({
          id: "c" + n, name: s.name, contact: "", email: "", city: s.city, country: countryOf(s.city),
          lang: countryOf(s.city) === "Austrija" ? "de" : "sr", devices: [s.device],
          status: n % 5 === 0 ? "bez" : n % 4 === 0 ? "pozvan" : "aktivan", last: n % 3 === 0 ? "pre 2 nedelje" : "ove nedelje",
        });
      });
    });
    list.forEach(function (x) { x.devices = x.devices.filter(function (d, i, a) { return d && a.indexOf(d) === i; }); });
    return list;
  }

  var ACC_STATUS = {
    aktivan: { label: "Nalog aktivan", cls: "ok" },
    pozvan: { label: "Pozvan · čeka prijavu", cls: "warn" },
    bez: { label: "Bez naloga", cls: "" },
  };

  function customerRow(x) {
    var st = ACC_STATUS[x.status];
    var action = x.status === "bez"
      ? '<button class="btn ghost sm" data-cust-invite="' + x.id + '">Pošalji pozivnicu</button>'
      : x.status === "pozvan"
        ? '<button class="btn ghost sm" data-cust-invite="' + x.id + '">Ponovi pozivnicu</button>'
        : '<a class="btn ghost sm" href="#/admin/customers/' + x.id + '">Otvori</a>';
    return '<div class="learner cust-row"><span class="cu-av sm">' + esc(initials(x.name)) + "</span>" +
      '<a class="learner-n" href="#/admin/customers/' + x.id + '" style="text-decoration:none"><div class="small">' + esc(x.name) + "</div>" +
      '<div class="tiny muted">' + esc(x.city + " · " + x.country) + "</div></a>" +
      '<div class="tiny muted">' + esc(x.devices.join(", ")) + "</div>" +
      '<span class="row" style="gap:6px"><span class="pill ' + st.cls + '"><i class="dot"></i>' + st.label + '</span><span class="langs"><i class="ok">' + x.lang.toUpperCase() + "</i></span></span>" +
      action + "</div>";
  }

  function viewAdminCustomers() {
    var all = S.customers;
    var countries = ["Srbija", "Crna Gora", "S. Makedonija", "Austrija"].filter(function (c) { return all.some(function (x) { return x.country === c; }); });
    var list = all.filter(function (x) { return S.custCountry === "all" || x.country === S.custCountry; });
    var cnt = function (s) { return all.filter(function (x) { return x.status === s; }).length; };

    var chips = '<div class="row wrap" style="gap:6px"><button class="chip-f' + (S.custCountry === "all" ? " on" : "") + '" data-cust-country="all">Sve zemlje <b>' + all.length + "</b></button>" +
      countries.map(function (c) {
        return '<button class="chip-f' + (S.custCountry === c ? " on" : "") + '" data-cust-country="' + c + '">' + c + " <b>" + all.filter(function (x) { return x.country === c; }).length + "</b></button>";
      }).join("") + "</div>";
    var rows = '<div class="list">' + list.map(customerRow).join("") + "</div>";
    var invite = '<a class="btn" href="#/admin/customers/new">' + ico("plus", 15) + " Pozovi kupca</a>";

    return adminPage({
      title: "Kupci", sub: all.length + " salona i klinika", tab: "#/admin/customers",
      body: invite + '<div class="mt">' + chips + '</div><div class="mt">' + rows + "</div>",
      wide: intro("Nalozi", "Kupci i nalozi", "Nalog nastaje pri isporuci: pozivnica na mejl, kupac se prijavi Google nalogom i vidi svoje aparate.", invite) +
        '<div class="grid4 mt">' +
        metric("Kupci", all.length, "salona i klinika", "users", "#/admin/customers", true) +
        metric("Aktivni nalozi", cnt("aktivan"), "koriste Moj Vecom", "check", "#/admin/customers") +
        metric("Pozvani", cnt("pozvan"), "čekaju prvu prijavu", "send", "#/admin/customers") +
        metric("Bez naloga", cnt("bez"), "pošaljite pozivnicu", "alert", "#/admin/customers") +
        "</div>" + '<div class="mt">' + chips + '</div><div class="mt">' + rows + "</div>",
    });
  }

  function viewAdminCustomer(id) {
    if (id === "new") return viewAdminCustomerNew();
    var x = S.customers.filter(function (c) { return c.id === id; })[0];
    if (!x) return viewAdminCustomers();
    var st = ACC_STATUS[x.status];
    var back = '<a class="small muted" href="#/admin/customers">‹ Kupci</a>';

    var devices, extra = "";
    if (x.live) {
      devices = DATA.demo.installations.map(function (i) {
        var p = product(i.slug);
        return '<div class="item" style="cursor:default"><span class="post-thumb cat">' + (p.image ? '<img src="' + esc(p.image) + '" alt="">' : "") + "</span>" +
          '<div class="grow"><div class="small">' + esc(p.name) + '</div><div class="tiny muted">' + esc(i.serial) + " · isporučeno " + dmy(i.delivered) + "</div></div>" +
          '<div class="cu-rings" style="margin:0">' + warrantyRing(i) + probeRing(i) + "</div></div>";
      }).join("");
      var tks = myTickets();
      var ords = S.orders.filter(function (o) { return o.company === x.name; });
      extra =
        panel("Servis", "Tiketi", '<div class="list">' + (tks.map(function (t) { return tkRow(t); }).join("") || '<p class="small muted">Nema tiketa.</p>') + "</div>") +
        panel("Potrošni", "Porudžbine", '<div class="list">' + ords.map(function (o) {
          return '<div class="row spread small"><span class="grow">#' + o.id + " · " + esc(o.items) + '</span><span class="tiny muted">' + esc(o.at) + "</span></div>";
        }).join("") + "</div>") +
        panel("Edukacija", COURSE.title, '<div class="bar"><i class="ok" style="width:' + Math.round(doneCount() / LESSONS.length * 100) + '%"></i></div>' +
          '<div class="tiny muted" style="margin-top:6px">Milica Petrović · ' + doneCount() + "/" + LESSONS.length + " lekcija · kvizovi " + quizzesPassed() + "/" + QUIZ.length + "</div>");
    } else {
      devices = x.devices.map(function (d) {
        var p = DATA.products.filter(function (q) { return q.name === d; })[0] || {};
        return '<div class="item" style="cursor:default"><span class="post-thumb cat">' + (p.image ? '<img src="' + esc(p.image) + '" alt="">' : "") + "</span>" +
          '<div class="grow"><div class="small">' + esc(d) + '</div><div class="tiny muted">u terenu</div></div></div>';
      }).join("");
    }

    var head = '<article class="panel"><div class="row spread wrap" style="gap:10px"><div class="row" style="gap:12px"><span class="cu-av">' + esc(initials(x.name)) + "</span>" +
      "<div><h3>" + esc(x.name) + '</h3><div class="tiny muted">' + esc(x.city + " · " + x.country) + (x.contact ? " · " + esc(x.contact) : "") + "</div></div></div>" +
      '<span class="pill ' + st.cls + '"><i class="dot"></i>' + st.label + "</span></div>" +
      '<div class="kv mt"><span class="k">Mejl za nalog</span><span class="v">' + esc(x.email || "—") + "</span>" +
      '<span class="k">Jezik naloga</span><span class="v">' + x.lang.toUpperCase() + "</span>" +
      '<span class="k">Poslednja aktivnost</span><span class="v">' + esc(x.last) + "</span></div>" +
      '<div class="row wrap mt" style="gap:8px">' +
      (x.live ? '<button class="btn sm" data-cust-open="' + x.id + '">' + ico("users", 14) + " Otvori nalog kao kupac</button>" : "") +
      (x.status !== "aktivan" ? '<button class="btn sm" data-cust-invite="' + x.id + '">' + ico("send", 14) + " Pošalji pozivnicu</button>" : "") +
      '<a class="btn ghost sm" href="tel:+381">' + ico("phoneCall", 14) + " Pozovi</a></div></article>";

    var body = back + '<div class="stack mt">' + head + panel("Oprema", "Aparati", '<div class="list">' + devices + "</div>") + extra + "</div>";
    return adminPage({
      title: x.name, sub: x.city, tab: "#/admin/customers", deskTitle: "Kupci i nalozi",
      body: body,
      wide: back + '<div class="adm-grid-a mt"><div class="stack">' + head + panel("Oprema", "Aparati", '<div class="list">' + devices + "</div>") + '</div><div class="stack">' + (extra || panel("Nalog", "Moj Vecom", '<p class="small muted">Kad kupac prihvati pozivnicu, ovde se vide njegovi tiketi, porudžbine i napredak na kursu.</p>')) + "</div></div>",
    });
  }

  function viewAdminCustomerNew() {
    var back = '<a class="small muted" href="#/admin/customers">‹ Kupci</a>';
    var form = '<article class="panel" style="max-width:620px"><h3 class="mb">Novi kupac — nalog pri isporuci</h3>' +
      '<div class="grid2">' +
      '<div class="field"><label>Salon / klinika</label><input id="nc-name" placeholder="Beauty Studio Graz"></div>' +
      '<div class="field"><label>Kontakt osoba</label><input id="nc-contact" placeholder="Lena Gruber"></div>' +
      '<div class="field"><label>Mejl (Google nalog)</label><input id="nc-email" placeholder="lena@studio.at"></div>' +
      '<div class="field"><label>Grad</label><input id="nc-city" placeholder="Graz"></div>' +
      "</div>" +
      '<div class="grid2"><div class="field"><label>Isporučen aparat</label><select id="nc-dev">' + sellableProducts().map(function (p) {
        return '<option value="' + esc(p.name) + '">' + esc(p.name) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="field"><label>Serijski broj</label><input id="nc-serial" placeholder="VEC-9100-2026-201"></div></div>' +
      '<div class="field"><label>Jezik naloga</label><select id="nc-lang"><option value="sr">Srpski</option><option value="de">Deutsch</option><option value="en">English</option></select></div>' +
      '<button class="btn block" data-cust-create="1">' + ico("send", 15) + " Kreiraj nalog i pošalji pozivnicu</button>" +
      '<p class="tiny muted mt">Kupac dobija mejl sa linkom, prijavi se Google nalogom i odmah vidi aparat, garanciju, kurs i dokumenta.</p></article>';
    return adminPage({ title: "Novi kupac", sub: "Nalog pri isporuci", tab: "#/admin/customers", deskTitle: "Kupci i nalozi", body: back + '<div class="mt">' + form + "</div>", wide: back + '<div class="mt">' + form + "</div>" });
  }

  /* ---------- C · globalna pretraga (Ctrl+K) ---------- */

  function searchResults(q) {
    q = q.toLowerCase().trim();
    if (q.length < 2) return [];
    var hit = function (s) { return String(s || "").toLowerCase().indexOf(q) >= 0; };
    var out = [];
    S.inquiries.forEach(function (x) { if (hit(x.name) || hit(x.device) || hit(x.city)) out.push({ g: "Upiti", t: x.name, s: x.device + " · " + x.city, h: "#/admin/inquiry/" + x.id }); });
    S.tickets.forEach(function (x) { if (hit("#" + x.id) || hit(x.company) || hit(x.issue) || hit(x.serial)) out.push({ g: "Servis", t: "#" + x.id + " · " + x.company, s: x.issue, h: "#/admin/ticket/" + x.id }); });
    S.customers.forEach(function (x) { if (hit(x.name) || hit(x.city) || hit(x.devices.join(" "))) out.push({ g: "Kupci", t: x.name, s: x.city + " · " + x.devices.join(", "), h: "#/admin/customers/" + x.id }); });
    DATA.products.forEach(function (p) { if (hit(p.name) || hit(p.sku)) out.push({ g: "Katalog", t: p.name, s: "Šifra " + p.sku, h: "#/admin/catalog/" + p.slug }); });
    S.posts.forEach(function (p) { if (hit(p.title.sr)) out.push({ g: "Novosti", t: p.title.sr, s: POST_STATUS[p.status].label, h: "#/admin/news/" + p.id }); });
    return out.slice(0, 30);
  }

  function renderSearch() {
    var box = document.getElementById("search-res");
    var inp = document.getElementById("search-q");
    if (!box || !inp) return;
    var res = searchResults(inp.value);
    if (inp.value.trim().length < 2) {
      box.innerHTML = '<div class="tiny muted" style="padding:14px">Upiti, tiketi, kupci, aparati i objave. Probajte: „Sonata”, „482”, „Beč”.</div>';
      return;
    }
    var groups = {};
    res.forEach(function (r) { (groups[r.g] = groups[r.g] || []).push(r); });
    box.innerHTML = Object.keys(groups).map(function (g) {
      return '<div class="sr-g">' + esc(g) + "</div>" + groups[g].map(function (r) {
        return '<a class="sr-i" href="' + r.h + '" data-search-go="1"><b>' + esc(r.t) + "</b><span>" + esc(r.s) + "</span></a>";
      }).join("");
    }).join("") || '<div class="tiny muted" style="padding:14px">Nema rezultata.</div>';
  }

  function openSearch() {
    if (!S.adminIn) return;
    var ov = document.getElementById("search-ov");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "search-ov";
      ov.className = "search-ov";
      ov.innerHTML = '<div class="search-box"><div class="search-in">' + ico("globe", 18) +
        '<input id="search-q" placeholder="Pretraži admin..." autocomplete="off"><kbd>Esc</kbd></div><div id="search-res" class="search-res"></div></div>';
      document.body.appendChild(ov);
      ov.addEventListener("click", function (e) { if (e.target === ov || e.target.closest("[data-search-go]")) closeSearch(); });
      document.getElementById("search-q").addEventListener("input", renderSearch);
    }
    ov.classList.add("on");
    var q = document.getElementById("search-q");
    q.value = "";
    renderSearch();
    setTimeout(function () { q.focus(); }, 10);
  }

  function closeSearch() {
    var ov = document.getElementById("search-ov");
    if (ov) ov.classList.remove("on");
  }

  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && location.hash.indexOf("#/admin") === 0) {
      e.preventDefault();
      openSearch();
    }
    if (e.key === "Escape") closeSearch();
  });

  function todayPanel() {
    var today = isoDate(new Date());
    var ev = S.bookings.filter(function (b) { return b.date === today; });
    var label = "Danas";
    if (!ev.length) {
      ev = S.bookings.filter(function (b) { return b.date > today; }).sort(function (a, b) { return (a.date + a.slot) < (b.date + b.slot) ? -1 : 1; }).slice(0, 3);
      label = "Sledeće";
    }
    return panel("Kalendar", label === "Danas" ? "Danas" : "Sledeći termini",
      ev.length ? '<div class="stack" style="gap:6px">' + ev.map(function (b) {
        return (b.date !== today ? '<div class="tiny muted">' + dmy(b.date) + "</div>" : "") + calCard(b);
      }).join("") + "</div>" : '<p class="small muted">Nema zakazanih termina.</p>',
      panelLink("#/admin/calendar", "Kalendar"));
  }

  /* ---------- D · Projekat: obim posle sastanka ----------
     Na kraju sastanka se prolazi kroz svaku funkciju: potrebno / kasnije / ne treba,
     faza i beleška. Čuva se u ovom browseru (localStorage), izvozi se kao tekst. */

  var PROJECT = [
    { key: "sajt", title: "Sajt vecom.rs", items: [
      { id: "s-home", n: "Nova početna strana", d: "Istaknuti aparati, programi, iskustva, novosti i vodič — sadržaj iz admina.", h: "#/site/home" },
      { id: "s-catalog", n: "Katalog sa filterima i pretragom", d: "54 aparata, filter po programu, pretraga po nazivu i šifri.", h: "#/site/catalog" },
      { id: "s-guide", n: "Vodič kroz izbor aparata", d: "Tri pitanja → 2–3 predloga → upit sa aparatom.", h: "#/site/guide" },
      { id: "s-roi", n: "ROI kalkulator", d: "Isplativost aparata; na EN/DE u evrima; „pošalji na mejl” ostavlja kontakt.", h: "#/site/roi" },
      { id: "s-inquiry", n: "Upit sa stranice aparata", d: "Aparat i izvor kampanje idu uz upit; na telefonu traka Pozovi · Viber · Upit.", h: "#/site/product/sonata-4xd" },
      { id: "s-faq", n: "Iskustva i česta pitanja na stranici aparata", d: "Pravi tekstovi sa današnjeg sajta, na tri jezika.", h: "#/site/product/sonata-4xd" },
      { id: "s-demo", n: "Zakazivanje demo termina", d: "Kalendar sa slobodnim terminima, dodavanje u kalendar, termin stiže u admin.", h: "#/site/demo" },
      { id: "s-service", n: "Servis i status prijave", d: "Status po broju prijave i prijava kvara bez naloga.", h: "#/site/service" },
      { id: "s-portal", n: "Ulaz „Moj Vecom” na sajtu", d: "Dugme u zaglavlju i sekcija za vlasnike aparata.", h: "#/site/portal" },
      { id: "s-lang", n: "Tri jezika: SR / EN / DE", d: "Sav tekst za posetioca i nazivi aparata na tri jezika.", h: "#/site/product/sonata-4xd" },
      { id: "s-blog", n: "Blog i novosti na sajtu", d: "Objave se pišu u adminu, bez posebnog CMS-a.", h: "#/admin/news" },
      { id: "s-track", n: "Izvor svakog upita", d: "Google Ads, Meta, Instagram, UTM i jezik uz svaki upit, veza sa GA4.", h: "" },
    ] },
    { key: "kupac", title: "Kupčev nalog (Moj Vecom)", items: [
      { id: "k-login", n: "Nalog pri isporuci + prijava Google nalogom", d: "Bez lozinke; nalog se ne pravi sam, samo pozvani kupci.", h: "#/login" },
      { id: "k-home", n: "Početna sa stanjem aparata", d: "Garancija, sonda, servis u toku, aktivnost, kontakt u Vecomu.", h: "#/app" },
      { id: "k-device", n: "Kartica aparata", d: "Serijski broj, garancija, obučeni radnici, istorija servisa, specifikacija.", h: "#/app/device/sonata-4xd" },
      { id: "k-fault", n: "Prijava kvara sa fotografijom", d: "Aparat je već izabran; slika displeja ide servisu.", h: "#/app/fault" },
      { id: "k-tickets", n: "Praćenje servisa", d: "Koraci od „primljeno” do „rešeno” i prepiska sa servisom.", h: "#/app/tickets" },
      { id: "k-parts", n: "Potrošni materijal i porudžbine", d: "Samo delovi za kupčeve aparate, preporuka za sondu, ponovi porudžbinu.", h: "#/app/parts" },
      { id: "k-protocols", n: "Protokoli tretmana", d: "Pretraga po problemu i fototipu, parametri, kontraindikacije.", h: "#/app/protocols" },
      { id: "k-docs", n: "Dokumenta", d: "Uputstva, CE, ALIMS, garantni list, sertifikati o obuci.", h: "#/app/docs" },
      { id: "k-course", n: "Video kurs (Vecom Akademija)", d: "20 lekcija u 5 modula, napredak se čuva.", h: "#/app/edu" },
      { id: "k-quiz", n: "Kvizovi posle modula", d: "3 pitanja, prolaz 2/3, objašnjenja odgovora.", h: "#/app/edu" },
      { id: "k-cert", n: "Sertifikat sa QR proverom", d: "Za štampu, na ime polaznika, sa javnom stranicom za proveru.", h: "#/app/edu/cert" },
      { id: "k-news", n: "Novosti za kupce", d: "Objave za sve ili samo za vlasnike određenog aparata.", h: "#/app/news" },
      { id: "k-app", n: "Aplikacija na telefonu i obaveštenja", d: "Dodaj na početni ekran, obaveštenja kad servis promeni status.", h: "#/app/notices" },
      { id: "k-lang", n: "Nalog na nemačkom i engleskom", d: "Za kupce iz Austrije; kurs, kviz i sertifikat takođe.", h: "#/app" },
    ] },
    { key: "admin", title: "Vecom admin", items: [
      { id: "a-login", n: "Prijava Google nalogom", d: "Samo pozvani @vecom.rs nalozi.", h: "#/admin" },
      { id: "a-home", n: "Dnevni pregled", d: "Šta čeka, brojke, termini za danas, prodajna prilika.", h: "#/admin" },
      { id: "a-inq", n: "Upiti (CRM)", d: "Pozovi / Viber / Mejl, status, beleška posle poziva, podsetnik.", h: "#/admin/inquiries" },
      { id: "a-cal", n: "Kalendar", d: "Demo termini sa sajta, obuke i servisne posete, Beograd i Niš.", h: "#/admin/calendar" },
      { id: "a-svc", n: "Servis i tiketi", d: "Fotografija kvara, status, serviser, deo, odgovor kupcu.", h: "#/admin/service" },
      { id: "a-orders", n: "Porudžbine potrošnog", d: "Potvrdi / odbij jednim klikom, predračun.", h: "#/admin/orders" },
      { id: "a-fleet", n: "Aparati u terenu (prodajna lista)", d: "Garancija ističe, sonda pri kraju, bez porudžbine, stari aparati → poruka svima.", h: "#/admin/fleet" },
      { id: "a-stats", n: "Brojke", d: "Upiti po aparatu, zemlji i izvoru, konverzija.", h: "#/admin/stats" },
      { id: "a-cust", n: "Kupci i nalozi", d: "Spisak salona, kartica kupca, pozivnica za nalog.", h: "#/admin/customers" },
      { id: "a-edu", n: "Edukacija u adminu", d: "Polaznici, zastoji, najteža pitanja, otpremanje videa.", h: "#/admin/edu" },
      { id: "a-catalog", n: "Katalog aparata (umesto Sanity-ja)", d: "Nazivi, opisi SR/EN/DE, slike, kategorije, prikaži / istakni.", h: "#/admin/catalog" },
      { id: "a-news", n: "Novosti i blog", d: "Editor na tri jezika, kanali (sajt, Moj Vecom, mejl), publika.", h: "#/admin/news" },
      { id: "a-content", n: "Iskustva i česta pitanja", d: "Uređivanje i automatska provera razlika u prevodima.", h: "#/admin/content" },
      { id: "a-roles", n: "Uloge: prodaja i serviser", d: "Svako vidi svoj posao.", h: "#/admin" },
      { id: "a-mobile", n: "Rad sa telefona", d: "Isti admin, složen za palac.", h: "#/admin" },
      { id: "a-search", n: "Globalna pretraga (Ctrl+K)", d: "Upiti, tiketi, kupci, aparati i objave iz jednog polja.", h: "#/admin" },
    ] },
    { key: "tech", title: "Preuzimanje sajta i tehnika", items: [
      { id: "t-takeover", n: "Preuzimanje sajta", d: "Domen, hosting i pristupi: GA4, GTM, Meta Pixel, Google Ads konverzije.", h: "" },
      { id: "t-migrate", n: "Prenos sadržaja iz Sanity-ja", d: "54 aparata, slike, blog, iskustva i česta pitanja — bez gubitka SEO pozicija.", h: "" },
      { id: "t-mail", n: "Mejl obaveštenja", d: "Pozivnice, status servisa, porudžbine, računica iz ROI kalkulatora.", h: "" },
      { id: "t-viber", n: "Viber poruke", d: "Poruka kupcu i „pošalji svima” iz prodajne liste.", h: "" },
      { id: "t-sms", n: "SMS podsetnici", d: "Dan pred demo termin i servisnu posetu.", h: "" },
      { id: "t-oauth", n: "Prava Google prijava", d: "OAuth, sesije, pozvani nalozi, uloge.", h: "" },
      { id: "t-hosting", n: "Hosting, backup i održavanje", d: "Vercel, baza, dnevni backup, nadzor.", h: "" },
      { id: "t-gdpr", n: "GDPR i kolačići", d: "Saglasnosti, obrada podataka kupaca, politika privatnosti na tri jezika.", h: "" },
      { id: "t-video", n: "Video kurs: snimanje i montaža", d: "20 klipova, titlovi na nemačkom i engleskom.", h: "" },
      { id: "t-training", n: "Obuka Vecom tima", d: "Rad u adminu za prodaju i servis.", h: "" },
    ] },
  ];

  var PROJECT_Q = [
    "Koliko aparata je ukupno u terenu?",
    "Vode li evidenciju serijskih brojeva — Excel, papir, ništa?",
    "Koliko servisnih prijava mesečno?",
    "Prodaju li potrošni materijal aktivno ili samo na zahtev?",
    "Postoje li protokoli tretmana digitalno ili samo štampano?",
    "Ko unosi kupce u sistem?",
    "Distributeri u MNE / MK / Austriji — treba li im svoj nalog?",
    "Ko održava sajt danas i kod koga su pristupi (domen, hosting, GA4, Ads)?",
    "Demo termini: samo showroom u Beogradu ili i Niš?",
    "Da li servis prima prijavu kvara i bez naloga?",
    "Ko snima i odobrava sadržaj video kursa?",
    "Ko još treba da vidi ovo pre odluke?",
  ];

  var PJ_STATUS = {
    need: { label: "Potrebno", cls: "ok" },
    later: { label: "Kasnije", cls: "warn" },
    no: { label: "Ne treba", cls: "alert" },
  };
  // funkcija, ne var: stanje (S) se pravi pre ovog reda, a deklaracija funkcije je već dostupna
  function pjKey() { return "vecom-projekat-v1"; }

  function loadProject() {
    var empty = { items: {}, answers: {}, next: "", client: "Vecom Beauty System" };
    try {
      var raw = window.localStorage.getItem(pjKey());
      return raw ? Object.assign(empty, JSON.parse(raw)) : empty;
    } catch (e) { return empty; }
  }
  function saveProject() {
    try { window.localStorage.setItem(pjKey(), JSON.stringify(S.project)); } catch (e) { /* privatni prozor: radi bez čuvanja */ }
  }
  function pjItem(id) { return S.project.items[id] || (S.project.items[id] = { status: "", phase: "", note: "" }); }

  function pjAll() {
    var out = [];
    PROJECT.forEach(function (g) { g.items.forEach(function (it) { out.push({ g: g, it: it, st: pjItem(it.id) }); }); });
    return out;
  }

  function pjSummary() {
    var all = pjAll();
    var line = function (x) {
      return "• [" + x.g.title + "] " + x.it.n + (x.st.phase ? " (faza " + x.st.phase + ")" : "") + (x.st.note ? " — " + x.st.note : "");
    };
    var block = function (key, label) {
      var list = all.filter(function (x) { return (x.st.status || "") === key; });
      return list.length ? label + " (" + list.length + ")\n" + list.map(line).join("\n") + "\n\n" : "";
    };
    var qa = PROJECT_Q.map(function (q, i) { var a = S.project.answers[i]; return a ? "P: " + q + "\nO: " + a : ""; }).filter(Boolean).join("\n\n");
    return "VECOM — OBIM PROJEKTA · " + dmy(new Date().toISOString().slice(0, 10)) + "\n" + S.project.client + "\n\n" +
      block("need", "POTREBNO") + block("later", "KASNIJE") + block("no", "NE TREBA") + block("", "NEODLUČENO") +
      (qa ? "PITANJA ZA KLIJENTA\n" + qa + "\n\n" : "") +
      (S.project.next ? "SLEDEĆI KORACI\n" + S.project.next + "\n" : "");
  }

  function viewProject() {
    var all = pjAll();
    var cnt = { need: 0, later: 0, no: 0, "": 0 };
    all.forEach(function (x) { cnt[x.st.status || ""]++; });
    var decided = all.length - cnt[""];
    var f = S.pjFilter;
    var base = location.origin + location.pathname;

    var head = '<section class="pj-head"><div class="grow"><div class="eyebrow">Posle sastanka</div>' +
      "<h1>Obim projekta</h1>" +
      '<p class="muted">Prođite kroz svaku funkciju: šta je potrebno, šta ide kasnije, a šta izbacujemo. Beleške se čuvaju u ovom browseru.</p>' +
      '<div class="field" style="max-width:360px;margin-top:10px"><label>Klijent</label><input id="pj-client" value="' + esc(S.project.client) + '"></div></div>' +
      '<div class="pj-stats">' + ring(all.length ? decided / all.length * 100 : 0, "ok", decided + "/" + all.length, "odlučeno") +
      '<div class="stack" style="gap:6px">' +
      Object.keys(PJ_STATUS).map(function (k) { return '<span class="pill ' + PJ_STATUS[k].cls + '"><i class="dot"></i>' + PJ_STATUS[k].label + " · " + cnt[k] + "</span>"; }).join("") +
      '<span class="pill"><i class="dot"></i>Neodlučeno · ' + cnt[""] + "</span></div></div></section>" +
      '<div class="row spread wrap pj-bar" style="gap:8px"><div class="row wrap" style="gap:6px">' +
      [["all", "Sve"], ["", "Neodlučeno"], ["need", "Potrebno"], ["later", "Kasnije"], ["no", "Ne treba"]].map(function (x) {
        return '<button class="chip-f' + (f === x[0] ? " on" : "") + '" data-pj-filter="' + x[0] + '">' + x[1] + "</button>";
      }).join("") + "</div>" +
      '<div class="row wrap" style="gap:6px"><button class="btn sm" data-pj-copy="1">' + ico("file", 14) + " Kopiraj rezime</button>" +
      '<button class="btn ghost sm" data-pj-txt="1">' + ico("download", 14) + " .txt</button>" +
      '<button class="btn ghost sm" data-pj-print="1">Štampaj</button>' +
      '<button class="btn ghost sm" data-pj-reset="1">Resetuj</button></div></div>';

    var groups = PROJECT.map(function (g) {
      var rows = g.items.filter(function (it) { return f === "all" || (pjItem(it.id).status || "") === f; });
      if (!rows.length) return "";
      var gd = g.items.filter(function (it) { return pjItem(it.id).status; }).length;
      return '<article class="panel pj-group"><div class="row spread mb"><h3>' + esc(g.title) + '</h3><span class="pill">' + gd + "/" + g.items.length + " odlučeno</span></div>" +
        rows.map(function (it) {
          var st = pjItem(it.id);
          return '<div class="pj-row' + (st.status ? " " + st.status : "") + '">' +
            '<div class="pj-main"><div class="small"><b>' + esc(it.n) + "</b></div>" +
            '<div class="tiny muted">' + esc(it.d) + "</div>" +
            (it.h ? '<a class="tiny pj-link" href="' + base + it.h + '" target="_blank" rel="noopener">Pogledaj u demou ↗</a>' : "") + "</div>" +
            '<div class="pj-ctrl"><div class="pj-seg">' + Object.keys(PJ_STATUS).map(function (k) {
              return '<button class="' + (st.status === k ? "on " + k : "") + '" data-pj-set="' + it.id + ":" + k + '">' + PJ_STATUS[k].label + "</button>";
            }).join("") + "</div>" +
            '<select data-pj-phase="' + it.id + '"><option value="">Faza —</option>' + ["1", "2", "3"].map(function (p) {
              return '<option value="' + p + '"' + (st.phase === p ? " selected" : "") + ">Faza " + p + "</option>";
            }).join("") + "</select></div>" +
            '<input class="pj-note" data-pj-note="' + it.id + '" placeholder="Beleška: šta tačno žele, izmene, cena..." value="' + esc(st.note) + '">' +
            "</div>";
        }).join("") + "</article>";
    }).join("");

    var qa = '<article class="panel"><h3 class="mb">Pitanja za klijenta</h3><div class="stack">' + PROJECT_Q.map(function (q, i) {
      return '<div class="field" style="margin:0"><label>' + (i + 1) + ". " + esc(q) + '</label><textarea rows="2" style="min-height:0" data-pj-ans="' + i + '">' + esc(S.project.answers[i] || "") + "</textarea></div>";
    }).join("") + "</div></article>";

    var next = '<article class="panel"><h3 class="mb">Sledeći koraci</h3><textarea id="pj-next" rows="4" class="pj-next" placeholder="Ponuda do..., sledeći sastanak..., šta nam šalju (pristupi, logo, cenovnik)...">' + esc(S.project.next) + "</textarea></article>";

    return '<div class="wrap pj">' + head + '<div class="stack mt">' + groups + "</div>" +
      '<div class="adm-grid-a mt">' + qa + next + "</div></div>";
  }

  // clipboard API odbija kad stranica nije u fokusu (ugrađeni pregledači) — tada stari način
  function copyFallback(text) {
    var ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) { /* nema kopiranja, rezime ostaje u .txt */ }
    ta.remove();
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { copyFallback(text); });
    }
    copyFallback(text);
    return Promise.resolve();
  }

  // unos se čuva odmah, bez ponovnog crtanja (da kursor ostane gde jeste)
  document.addEventListener("input", function (e) {
    var el = e.target;
    if (!S.project) return;
    if (el.hasAttribute && el.hasAttribute("data-pj-note")) { pjItem(el.getAttribute("data-pj-note")).note = el.value; saveProject(); }
    else if (el.hasAttribute && el.hasAttribute("data-pj-ans")) { S.project.answers[el.getAttribute("data-pj-ans")] = el.value; saveProject(); }
    else if (el.id === "pj-next") { S.project.next = el.value; saveProject(); }
    else if (el.id === "pj-client") { S.project.client = el.value; saveProject(); }
  });
  document.addEventListener("change", function (e) {
    var el = e.target;
    if (el.hasAttribute && el.hasAttribute("data-pj-phase")) { pjItem(el.getAttribute("data-pj-phase")).phase = el.value; saveProject(); }
  });

  /* ---------- ruter ---------- */

  function route() {
    // pre ponovnog crtanja: sacuvaj ono sto je korisnik uneo u booking i editor
    keepBookingInputs();
    syncEditor();
    syncCatalog();
    syncContent();
    var h = location.hash || "#/site";
    var parts = h.replace(/^#\//, "").split("/");
    var a = parts[0] || "site", b = parts[1], c = parts[2];
    var html;

    if (a === "guide" || a === "roi") { go("#/site/" + a); return; }
    if (a === "site") {
      if (b === "guide") html = siteShell("guide", viewGuide());
      else if (b === "roi") html = siteShell("roi", viewRoi());
      else if (b === "product") html = viewSiteProduct(c);
      else if (b === "home") html = viewSiteHome();
      else if (b === "catalog") html = viewSiteCatalog();
      else if (b === "demo") html = viewSiteDemo();
      else if (b === "service") html = viewSiteService();
      else if (b === "portal") html = viewSitePortal();
      else html = viewSiteIndex();
    }
    else if (a === "verify") html = viewVerify(b);
    else if (a === "project") html = viewProject();
    else if (a === "login") html = viewLogin();
    else if (a === "app") {
      if (!S.loggedIn) { go("#/login"); return; }
      if (b === "device") html = viewDevice(c);
      else if (b === "devices") html = viewDevices();
      else if (b === "edu") html = c === "cert" ? viewCertificate() : c === "quiz" ? viewQuiz(parts[3]) : c ? viewLesson(c) : viewEdu();
      else if (b === "news") html = viewCustomerNews(c);
      else if (b === "more") html = viewCustomerMore();
      else if (b === "notices") html = viewNotices();
      else if (b === "fault") html = viewFault();
      else if (b === "tickets") html = viewCustomerTickets();
      else if (b === "ticket") html = viewTicket(c);
      else if (b === "parts") html = viewParts();
      else if (b === "protocols") html = viewProtocols();
      else if (b === "docs") html = viewDocs();
      else html = viewCustomerHome();
    } else if (a === "admin") {
      if (!S.adminIn) html = viewAdminLogin();
      else if (b === "inquiries") html = viewAdminInquiries();
      else if (b === "inquiry") html = viewAdminInquiry(c);
      else if (b === "service") html = viewAdminService();
      else if (b === "ticket") html = viewAdminTicket(c);
      else if (b === "orders") html = viewAdminOrders();
      else if (b === "fleet") html = viewAdminFleet();
      else if (b === "stats") html = viewAdminStats();
      else if (b === "news") html = c ? viewAdminPost(c) : viewAdminNews();
      else if (b === "more") html = viewAdminMore();
      else if (b === "edu") html = viewAdminEdu();
      else if (b === "calendar") html = viewAdminCalendar();
      else if (b === "catalog") html = c ? viewAdminProduct(c) : viewAdminCatalog();
      else if (b === "content") html = viewAdminContent();
      else if (b === "customers") html = c ? viewAdminCustomer(c) : viewAdminCustomers();
      else html = viewAdminHome();
    } else html = viewSiteIndex();

    app.innerHTML = html;
    window.scrollTo(0, 0);
    if (S.site.focus) {
      var target = document.getElementById(S.site.focus);
      S.site.focus = null;
      if (target) target.scrollIntoView({ block: "start" });
    }
    markPersona(a);
    bindView();
  }

  function markPersona(a) {
    var map = { site: 0, guide: 0, roi: 0, verify: 0, login: 1, app: 1, admin: 2, project: 3 };
    var idx = map[a] == null ? 0 : map[a];
    var btns = document.querySelectorAll("#personas button");
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("on", i === idx);
  }

  function bindView() {
    var qr = document.getElementById("cert-qr");
    if (qr) {
      QRCode.toString(verifyUrl(), { type: "svg", margin: 0, color: { dark: "#2e2b26", light: "#ffffff" } }, function (err, svg) {
        if (!err) qr.innerHTML = svg;
      });
    }

    var scq = document.getElementById("sc-q");
    if (scq) scq.addEventListener("input", function () {
      S.siteCatQ = scq.value;
      route();
      var again = document.getElementById("sc-q");
      if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    });

    var cq = document.getElementById("cat-q");
    if (cq) cq.addEventListener("input", function () {
      S.catQuery = cq.value;
      route();
      var again = document.getElementById("cat-q");
      if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    });

    var bm = document.getElementById("bk-dev-more");
    if (bm) bm.addEventListener("change", function () { if (bm.value) { S.site.demo.device = bm.value; route(); } });

    var vid = document.querySelector("[data-lesson-video]");
    if (vid) vid.addEventListener("ended", function () { finishLesson(Number(vid.getAttribute("data-lesson-video"))); });

    var sw = document.getElementById("pp-switch");
    if (sw) sw.addEventListener("change", function () { S.site.sent = null; go("#/site/product/" + sw.value); });

    // ROI — racuna dok se kuca
    ["roi-t", "roi-w", "roi-y", "roi-p"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", function () {
        var key = { "roi-t": "perTreatment", "roi-w": "weekly", "roi-y": "weeks", "roi-p": "price" }[id];
        S.roi[key] = Number(el.value) || 0;
        var focus = document.activeElement && document.activeElement.id;
        var pos = el.selectionStart;
        route();
        var again = document.getElementById(focus);
        if (again) {
          again.focus();
          if (again.type !== "range" && pos != null) { try { again.setSelectionRange(pos, pos); } catch (e) {} }
        }
      });
    });

    var ga = document.getElementById("ga-btn");
    if (ga) ga.addEventListener("click", fakeAdminLogin);

    var g = document.getElementById("g-btn");
    if (g) g.addEventListener("click", fakeLogin);
    var pw = document.getElementById("pw-btn");
    if (pw) pw.addEventListener("click", function () { S.loggedIn = true; go("#/app"); });

    var q = document.getElementById("pr-q");
    if (q) q.addEventListener("input", function () {
      S.protoQuery = q.value;
      route();
      var again = document.getElementById("pr-q");
      if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    });

    var fp = document.getElementById("fa-photo");
    if (fp) fp.addEventListener("change", function () {
      var file = fp.files && fp.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        S.faultDraft.photo = reader.result;
        document.getElementById("fa-prev").innerHTML =
          '<a class="photo"><img src="' + reader.result + '" alt="Fotografija kvara"></a>';
      };
      reader.readAsDataURL(file);
    });

    var fd = document.getElementById("fa-demo");
    if (fd) fd.addEventListener("click", function () {
      S.faultDraft.photo = "assets/demo/kvar.svg";
      document.getElementById("fa-prev").innerHTML =
        '<a class="photo"><img src="assets/demo/kvar.svg" alt="Fotografija kvara"></a>';
    });

    var fs = document.getElementById("fa-send");
    if (fs) fs.addEventListener("click", function () {
      S.faultDraft.slug = document.getElementById("fa-dev").value;
      S.faultDraft.type = document.getElementById("fa-type").value;
      S.faultDraft.text = document.getElementById("fa-text").value;
      submitFault();
    });
  }

  /* ---------- klikovi (delegirano) ---------- */

  document.addEventListener("click", function (e) {
    var hit = e.target.closest("[data-go],[data-nav],[data-guide],[data-guide-back],[data-guide-reset]," +
      "[data-inquiry],[data-inquiry-send],[data-roi-send],[data-logout],[data-add-part],[data-del-part]," +
      "[data-order],[data-reorder],[data-download],[data-proto-chip],[data-ticket-msg],[data-inq-status]," +
      "[data-inq-note],[data-remind],[data-viber],[data-tk-status],[data-tk-save],[data-tk-reply]," +
      "[data-order-ok],[data-order-no],[data-order-inv],[data-fleet],[data-blast],[data-site-send],[data-site-reset]," +
      "[data-site-scroll],[data-svc-tab]," +
      "[data-svc-check],[data-svc-send],[data-lang],[data-admin-role],[data-admin-view],[data-admin-logout]," +
      "[data-fleet-pre],[data-bk-dev],[data-bk-loc],[data-bk-month],[data-bk-date],[data-bk-slot],[data-bk-book]," +
      "[data-bk-ics],[data-quick-part],[data-dev-tab],[data-toast],[data-course-play],[data-course-done]," +
      "[data-course-all],[data-print],[data-news-filter],[data-news-new],[data-news-lang],[data-news-translate]," +
      "[data-news-publish],[data-news-schedule],[data-news-draft],[data-ne-cmd],[data-quiz-pick],[data-quiz-check]," +
      "[data-quiz-retry],[data-cal-week],[data-cal-loc],[data-cat-cat],[data-cat-lang],[data-cat-save],[data-cat-view]," +
      "[data-content-lang],[data-content-save],[data-ct-add],[data-pwa-install],[data-pwa-notify],[data-cu-lang],[data-cat-go],[data-site-cat],[data-cust-country]," +
      "[data-cust-invite],[data-cust-open],[data-cust-create],[data-search-open],[data-pj-filter],[data-pj-set]," +
      "[data-pj-copy],[data-pj-txt],[data-pj-print],[data-pj-reset]");
    if (!hit) return;
    var d = hit.dataset;

    if (d.go) return go(d.go);

    if (d.lang) { setLang(d.lang); return route(); }
    if (d.adminRole) { S.adminRole = d.adminRole; if (location.hash === "#/admin") return route(); return go("#/admin"); }
    if (d.adminView) { S.adminView = d.adminView; return route(); }
    if (d.adminLogout) { S.adminIn = false; toast("Odjavljeni"); return go("#/admin"); }
    if (d.fleetPre) { e.preventDefault(); S.fleetFilter = d.fleetPre; return go("#/admin/fleet"); }
    if (d.nav) { if (d.nav.indexOf("#/app/device/") === 0) S.devTab = null; return go(d.nav); }

    if (d.guide) {
      S.guide[d.guide] = d.val;
      S.guide.step = Math.min(S.guide.step + 1, 3);
      return route();
    }
    if (d.guideBack) { S.guide.step = Math.max(0, S.guide.step - 1); return route(); }
    if (d.guideReset) { S.guide = { q1: null, q2: null, q3: null, step: 0 }; return route(); }

    if (d.inquiry) {
      S.site.sent = null;
      S.site.focus = "pp-form";
      return go("#/site/product/" + d.inquiry);
    }

    if (d.siteSend === "product") {
      var pp = product(S.site.product);
      var want = val("pp-want", "Ponuda");
      var co = val("pp-co");
      var pid = addInquiry({
        name: val("pp-name", co || "Posetilac sajta"),
        device: pp.name,
        city: val("pp-city"),
        phone: val("pp-tel"),
        source: "Sajt · stranica aparata",
        note: want + (co ? " · " + co : "") + ". Došao preko Google Ads, kampanja „Epilacija — Srbija”.",
      });
      S.site.sent = { key: "product", id: pid };
      toast("Upit stigao u admin → Upiti");
      return route();
    }
    if (d.siteReset) { S.site.sent = null; return route(); }
    if (d.siteScroll) {
      e.preventDefault();
      var sc = document.getElementById(d.siteScroll);
      if (sc) sc.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (d.bkDev) { S.site.demo.device = d.bkDev; return route(); }
    if (d.bkLoc) { S.site.demo.loc = d.bkLoc; return route(); }
    if (d.bkMonth) { S.site.demo.month = Math.max(0, Math.min(1, S.site.demo.month + Number(d.bkMonth))); return route(); }
    if (d.bkDate) { S.site.demo.date = d.bkDate; S.site.demo.slot = null; return route(); }
    if (d.bkSlot) { S.site.demo.slot = d.bkSlot; return route(); }
    if (d.bkBook) {
      keepBookingInputs();
      var dm = S.site.demo;
      if (!dm.name || !dm.tel) { toast(t("bk_need")); var nm = document.getElementById(dm.name ? "dm-tel" : "dm-name"); if (nm) nm.focus(); return; }
      var dev = product(dm.device);
      var loc = LOCS.filter(function (l) { return l.key === dm.loc; })[0];
      var day = fromIso(dm.date);
      var did = addInquiry({
        name: dm.name,
        device: dev.name,
        phone: dm.tel,
        city: loc.sr.replace(/^.* /, ""),
        source: "Sajt · demo termin",
        note: "Demo termin: " + L.sr.days[day.getDay()] + " " + dmy(dm.date) + " u " + dm.slot + ", " + loc.sr + "." + (dm.mail ? " Mejl: " + dm.mail : ""),
      });
      S.bookings.push({ type: "demo", date: dm.date, slot: dm.slot, title: dm.name, device: dev.name, loc: dm.loc, inqId: did });
      S.site.sent = { key: "demo", id: did, date: dm.date, slot: dm.slot };
      S.site.demo.date = null;
      S.site.demo.slot = null;
      toast("Termin stigao u admin → Upiti");
      return route();
    }
    if (d.bkIcs) { downloadIcs(); return toast(t("bk_ics") + " — vecom-demo.ics"); }

    if (d.quickPart) {
      var qp = DATA.demo.parts.filter(function (x) { return x.id === d.quickPart; })[0];
      if (!S.cart.filter(function (c) { return c.id === qp.id; }).length) S.cart.push({ id: qp.id, name: qp.name, qty: 1 });
      toast(u("t_quick_part", { p: tx(qp.name) }));
      return go("#/app/parts");
    }
    if (d.devTab) { S.devTab = d.devTab; return route(); }
    if (d.toast) return toast(d.toast);
    if (d.coursePlay) return fakePlay(Number(d.coursePlay));
    if (d.courseDone) return finishLesson(Number(d.courseDone));
    if (d.courseAll) {
      LESSONS.forEach(function (l) { S.course.done[l.n] = true; });
      QUIZ.forEach(function (qs, mi) {
        var st = quizState(mi);
        qs.forEach(function (q, qi) { st.picked[qi] = q.a; });
        st.checked = true; st.passed = true; st.score = 3;
      });
      toast(u("t_course_all"));
      return route();
    }
    if (d.quizPick) {
      var qp3 = d.quizPick.split(":").map(Number);
      quizState(qp3[0]).picked[qp3[1]] = qp3[2];
      return route();
    }
    if (d.quizCheck) {
      var qmi = Number(d.quizCheck), qst = quizState(qmi);
      qst.score = QUIZ[qmi].filter(function (q, qi) { return qst.picked[qi] === q.a; }).length;
      qst.checked = true;
      qst.passed = qst.score >= 2;
      toast(u(qst.passed ? "t_quiz_pass" : "t_quiz_fail", { s: qst.score }));
      return route();
    }
    if (d.quizRetry) { S.course.quiz[Number(d.quizRetry)] = null; return route(); }

    if (d.cuLang) { S.cuLang = d.cuLang; return route(); }
    if (d.catGo) { e.preventDefault(); S.siteCat = d.catGo; S.siteCatQ = ""; return go("#/site/catalog"); }
    if (d.siteCat) { S.siteCat = d.siteCat; return route(); }
    if (d.searchOpen) return openSearch();

    if (d.pjFilter != null) { S.pjFilter = d.pjFilter; return route(); }
    if (d.pjSet) {
      var ps = d.pjSet.split(":"), pit = pjItem(ps[0]);
      pit.status = pit.status === ps[1] ? "" : ps[1];
      saveProject();
      return route();
    }
    if (d.pjCopy) { copyText(pjSummary()).then(function () { toast("Rezime kopiran — nalepite u mejl ili beleške"); }); return; }
    if (d.pjTxt) {
      var blob = new Blob([pjSummary()], { type: "text/plain;charset=utf-8" });
      var link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "vecom-obim-projekta.txt";
      document.body.appendChild(link); link.click(); link.remove();
      return toast("Preuzeto: vecom-obim-projekta.txt");
    }
    if (d.pjPrint) {
      document.body.classList.add("print-pj");
      window.addEventListener("afterprint", function once() { document.body.classList.remove("print-pj"); window.removeEventListener("afterprint", once); });
      return window.print();
    }
    if (d.pjReset) {
      if (!window.confirm("Obrisati sve izbore i beleške na stranici Projekat?")) return;
      S.project = { items: {}, answers: {}, next: "", client: "Vecom Beauty System" };
      saveProject();
      toast("Projekat je resetovan");
      return route();
    }
    if (d.custCountry) { S.custCountry = d.custCountry; return route(); }
    if (d.custInvite) {
      var ci = S.customers.filter(function (c) { return c.id === d.custInvite; })[0];
      ci.status = "pozvan";
      toast("Pozivnica poslata: " + ci.name + " — prijava Google nalogom");
      return route();
    }
    if (d.custOpen) { S.loggedIn = true; toast("Otvoren nalog kupca: " + DATA.demo.company.name); return go("#/app"); }
    if (d.custCreate) {
      var nm2 = val("nc-name");
      if (!nm2 || !val("nc-email")) return toast("Upišite salon i mejl za nalog");
      var city2 = val("nc-city", "—");
      S.customers.unshift({
        id: "c" + Date.now(), name: nm2, contact: val("nc-contact"), email: val("nc-email"), city: city2, country: countryOf(city2),
        lang: val("nc-lang", "sr"), devices: [val("nc-dev")], status: "pozvan", last: "upravo sada",
      });
      toast("Nalog kreiran — pozivnica poslata na " + val("nc-email"));
      return go("#/admin/customers");
    }
    if (d.pwaInstall) {
      if (!installEvt) return toast(u("t_install_menu"));
      installEvt.prompt();
      installEvt.userChoice.then(function () { installEvt = null; route(); });
      return;
    }
    if (d.pwaNotify) {
      if (notifState() === "unsupported") return toast(u("t_notif_unsupported"));
      Notification.requestPermission().then(function (p) {
        if (p === "granted") notify(u("n_notif_on"), "#/app/notices");
        else toast(u("t_notif_denied"));
        route();
      });
      return;
    }
    if (d.calWeek) { S.calWeek = Math.max(0, Math.min(4, S.calWeek + Number(d.calWeek))); return route(); }
    if (d.calLoc) { S.calLoc = d.calLoc; return route(); }
    if (d.catCat) { S.catCat = d.catCat; return route(); }
    if (d.catLang) { syncCatalog(); S.catEdit.lang = d.catLang; return route(); }
    if (d.catSave) { syncCatalog(); toast("Sačuvano — " + product(d.catSave).name + " je ažuriran na sajtu"); return route(); }
    if (d.catView) {
      syncCatalog();
      setLang(S.catEdit.lang);
      S.site.sent = null;
      return go("#/site/product/" + d.catView);
    }
    if (d.contentLang) { syncContent(); S.contentLang = d.contentLang; return route(); }
    if (d.contentSave) { syncContent(); toast("Sačuvano — sajt prikazuje nove tekstove"); return route(); }
    if (d.ctAdd) {
      syncContent();
      S.content.faq.push({ q: { sr: "", en: "", de: "" }, a: { sr: "", en: "", de: "" } });
      return route();
    }
    if (d.print) return window.print();

    if (d.newsFilter) { S.newsFilter = d.newsFilter; return route(); }
    if (d.newsNew) {
      var np = { id: "n" + Date.now(), slug: "", status: "nacrt", date: isoDate(new Date()), image: null,
        title: { sr: "", en: "", de: "" }, excerpt: { sr: "", en: "", de: "" }, body: { sr: [], en: [], de: [] },
        channels: { site: true, portal: true, mail: false }, audience: "all", author: roleCfg().name };
      S.posts.unshift(np);
      return go("#/admin/news/" + np.id);
    }
    if (d.newsLang) { syncEditor(); S.newsEdit.lang = d.newsLang; return route(); }
    if (d.newsTranslate) { return toast("Objava poslata na prevod (" + d.newsTranslate.toUpperCase() + ") — stiže na odobrenje"); }
    if (d.newsPublish || d.newsSchedule || d.newsDraft) {
      syncEditor();
      var pp2 = postById(d.newsPublish || d.newsSchedule || d.newsDraft);
      if (!pp2.title.sr) { toast("Upišite naslov na srpskom"); return; }
      if (!pp2.slug) pp2.slug = pp2.title.sr.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "dj").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      pp2.status = d.newsPublish ? "objavljeno" : d.newsSchedule ? "zakazano" : "nacrt";
      var where = [pp2.channels.site ? "sajt" : "", pp2.channels.portal ? "Moj Vecom" : "", pp2.channels.mail ? "mejl" : ""].filter(Boolean).join(", ");
      if (d.newsPublish && pp2.channels.portal) notify(u("n_post", { t: pp2.title[S.cuLang] || pp2.title.sr }), "#/app/news/" + pp2.slug);
      toast(d.newsPublish ? "Objavljeno: " + (where || "nigde — izaberite kanal") : d.newsSchedule ? "Zakazano za " + dmy(pp2.date) : "Sačuvano kao nacrt");
      return route();
    }
    if (d.neCmd) { e.preventDefault(); return newsCommand(d.neCmd); }

    if (d.svcTab) { S.site.service.tab = d.svcTab; S.site.sent = null; return route(); }
    if (d.svcCheck) {
      var qid = val("sv-id").replace(/\D/g, "");
      S.site.service.query = qid;
      S.site.service.found = ticketById(qid) ? qid : null;
      return route();
    }
    if (d.svcSend) {
      var serial = val("sv-serial", "bez serijskog broja");
      var sm = serial.match(/VEC-([0-9]+)/i);
      var guess = sm ? DATA.products.filter(function (x) { return String(x.sku).indexOf(sm[1]) === 0; })[0] : null;
      var nid = 483 + S.tickets.filter(function (t) { return t.id >= 483; }).length;
      var txt = val("sv-text", "Kvar bez opisa");
      S.tickets.unshift({
        id: nid,
        slug: guess ? guess.slug : "sonata-4xd",
        serial: serial,
        company: val("sv-co", "Salon (bez naloga)"),
        city: val("sv-city", "—"),
        issue: txt.slice(0, 60),
        type: "Prijava sa sajta",
        status: "primljeno",
        opened: new Date().toISOString().slice(0, 10),
        photo: null,
        isNew: true,
        messages: [{ from: "kupac", at: "upravo sada", text: txt }],
      });
      S.site.sent = { key: "service", id: nid };
      toast("Tiket #" + nid + " stigao u admin → Servis");
      return route();
    }

    if (d.roiSend) {
      var r = S.roi;
      addInquiry({
        name: val("roi-mail", "Posetilac sa ROI kalkulatora"),
        device: "—",
        source: "Sajt · ROI",
        note: "Računao: " + money(r.perTreatment) + " po tretmanu, " + r.weekly + " nedeljno. Poslata računica na mejl.",
      });
      return toast("Računica poslata — kontakt stigao u admin → Upiti");
    }
    if (d.logout) { S.loggedIn = false; return go("#/login"); }

    if (d.addPart) {
      var part = DATA.demo.parts.filter(function (x) { return x.id === d.addPart; })[0];
      var found = S.cart.filter(function (c) { return c.id === part.id; })[0];
      if (found) found.qty++; else S.cart.push({ id: part.id, name: part.name, qty: 1 });
      toast(u("t_part_added", { p: tx(part.name) }));
      return route();
    }
    if (d.delPart) { S.cart.splice(Number(d.delPart), 1); return route(); }
    if (d.order) {
      var items = S.cart.map(function (c) { return c.name + " × " + c.qty; }).join(", ");
      S.orders.unshift({
        id: 1205 + S.orders.length, company: DATA.demo.company.name, city: DATA.demo.company.city,
        items: items, at: "upravo sada", status: "ceka",
      });
      S.cart = [];
      toast(u("t_order_sent"));
      return route();
    }
    if (d.reorder) {
      var old = S.orders.filter(function (o) { return String(o.id) === d.reorder; })[0];
      S.orders.unshift({
        id: 1205 + S.orders.length, company: old.company, city: old.city,
        items: old.items, at: "upravo sada", status: "ceka",
      });
      toast(u("t_reorder"));
      return route();
    }
    if (d.download) return toast(u("t_download", { d: d.download }));

    if (d.protoChip) { S.protoQuery = d.protoChip; return route(); }

    if (d.ticketMsg) {
      var tk = ticketById(d.ticketMsg);
      var box = document.getElementById("tk-msg");
      if (!box || !box.value.trim()) return toast(u("t_msg_empty"));
      tk.messages.push({ from: "kupac", at: "upravo sada", text: box.value.trim() });
      toast(u("t_msg_sent"));
      return route();
    }

    if (d.inqStatus) {
      var iq = inquiryById(d.inqStatus);
      iq.status = d.val;
      toast("Status: " + INQ_LABEL[d.val]);
      return route();
    }
    if (d.inqNote) {
      var iq2 = inquiryById(d.inqNote);
      var n = document.getElementById("inq-note");
      if (!n || !n.value.trim()) return toast("Napišite belešku");
      iq2.history.unshift({ at: "upravo sada", text: n.value.trim() });
      toast("Beleška sačuvana");
      return route();
    }
    if (d.remind) return toast("Podsetnik za 3 dana postavljen");
    if (d.viber) return toast("Otvara Viber sa brojem kupca (u prototipu bez poziva)");

    if (d.tkStatus) {
      var tk2 = ticketById(d.tkStatus);
      tk2.status = d.val;
      if (d.val !== "primljeno") tk2.isNew = false;
      tk2.messages.push({ from: "vecom", at: "upravo sada", text: "Status promenjen: " + flowLabel(d.val) });
      if (tk2.company === DATA.demo.company.name) notify(u("n_status", { id: tk2.id, s: flowL(d.val) }), "#/app/ticket/" + tk2.id);
      toast("Status: " + flowLabel(d.val) + " — kupac je obavešten");
      return route();
    }
    if (d.tkSave) {
      var eng = (document.getElementById("tk-eng") || {}).value;
      var partIn = (document.getElementById("tk-part") || {}).value;
      var tk3 = ticketById(d.tkSave);
      tk3.messages.push({
        from: "vecom", at: "upravo sada",
        text: "Dodeljen serviser: " + eng + (partIn ? ". Deo: " + partIn : ""),
      });
      toast("Sačuvano — serviser " + eng);
      return route();
    }
    if (d.tkReply) {
      var tk4 = ticketById(d.tkReply);
      var r = document.getElementById("tk-reply");
      if (!r || !r.value.trim()) return toast("Napišite odgovor");
      tk4.messages.push({ from: "vecom", at: "upravo sada", text: r.value.trim() });
      if (tk4.company === DATA.demo.company.name) notify(u("n_reply", { id: tk4.id }), "#/app/ticket/" + tk4.id);
      toast("Odgovor poslat kupcu");
      return route();
    }

    if (d.orderOk) {
      S.orders.forEach(function (o) {
        if (String(o.id) !== d.orderOk) return;
        o.status = "potvrdjeno";
        if (o.company === DATA.demo.company.name) notify(u("n_order", { id: o.id }), "#/app/parts");
      });
      toast("Porudžbina potvrđena");
      return route();
    }
    if (d.orderNo) {
      S.orders.forEach(function (o) { if (String(o.id) === d.orderNo) o.status = "odbijeno"; });
      toast("Porudžbina odbijena");
      return route();
    }
    if (d.orderInv) return toast("Predračun napravljen i poslat na mejl");

    if (d.fleet) { S.fleetFilter = S.fleetFilter === d.fleet ? null : d.fleet; return route(); }
    if (d.blast) {
      var f2 = DATA.demo.fleet.filter(function (x) { return x.key === d.blast; })[0];
      return toast("Poruka pripremljena za " + f2.count + " salona");
    }
  });

  // dugmad editora ne smeju da uzmu fokus, inace se gubi selekcija teksta
  document.addEventListener("mousedown", function (e) {
    if (e.target.closest("[data-ne-cmd]")) e.preventDefault();
  });

  window.addEventListener("hashchange", route);

  var wasDesktop = window.innerWidth >= 960;
  window.addEventListener("resize", function () {
    var now = window.innerWidth >= 960;
    if (now !== wasDesktop && location.hash.indexOf("#/admin") === 0) route();
    wasDesktop = now;
  });

  if (!location.hash) location.hash = "#/site";
  route();
}

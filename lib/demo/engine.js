/* Vecom — klikabilni prototip, demo engine.
   Stanje u jednom objektu, ruter preko location.hash, ekrani kao HTML stringovi.
   Next.js ga montira iz components/DemoApp.tsx; ekrani se odavde mogu
   prebacivati u React komponente jedan po jedan. */

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
    lang: "sr",
    adminIn: false,
    adminRole: "prodaja",
    adminView: "desktop",
    site: {
      product: "sonata-4xd",
      sent: null,
      focus: null,
      demo: { loc: "bg", device: "sonata-4xd", day: 0, slot: null },
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
      '<div class="sep"></div><p class="tiny muted">Jezik sajta menja se gore desno u okviru (SR / EN / DE). U njihovom sajtu: Sanity blok + Next.js komponenta, tekstovi iz Sanity-ja po jeziku.</p>' +
      "</aside></div></div>";
  }

  function viewSiteIndex() {
    return '<div class="wrap">' + siteNav("#/site") +
      '<div class="mb"><div class="eyebrow">Javni sajt ostaje vecom.rs</div>' +
      "<h1>Sekcije koje se ubacuju u postojeći sajt</h1>" +
      '<p class="muted" style="max-width:640px">Sajt se ne menja iz korena. Dodaju se blokovi koji posetioca pretvaraju u upit, termin ili prijavu servisa — na srpskom, engleskom i nemačkom — i sve stiže na jedno mesto, u admin.</p></div>' +
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
      '<div class="old-tag">postojeći sadržaj stranice</div>' +
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

  /* demo termin */

  function nextWorkdays(n) {
    var out = [], d = new Date();
    while (out.length < n) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) out.push(new Date(d));
    }
    return out;
  }

  var SLOTS = ["10:00", "11:30", "13:00", "14:30", "16:00"];
  var LOCS = [{ key: "bg", sr: "Showroom Beograd" }, { key: "nis", sr: "Sedište Niš" }];

  function viewSiteDemo() {
    var st = S.site.demo;
    var sent = S.site.sent && S.site.sent.key === "demo" ? S.site.sent : null;
    var days = nextWorkdays(6);

    var inner;
    if (sent) {
      inner = sentBlock(t("sent_demo_t"), sent.text + " " + t("sent_demo_x"), "#/admin/inquiry/" + sent.id);
    } else {
      inner =
        '<div class="new-block"><span class="new-tag">NOVA SEKCIJA · demo termin</span>' +
        "<h2>" + esc(t("demo_h")) + "</h2>" +
        '<p class="small muted mb">' + esc(t("demo_sub")) + "</p>" +
        '<div class="tiny muted">' + esc(t("demo_loc")) + '</div><div class="row wrap mb" style="margin-top:6px">' +
        LOCS.map(function (l) {
          return '<button class="opt chip' + (st.loc === l.key ? " on" : "") + '" data-demo-loc="' + l.key + '">' + esc(t("loc_" + l.key)) + "</button>";
        }).join("") + "</div>" +
        '<div class="field"><label>' + esc(t("demo_dev")) + '</label><select id="dm-dev">' +
        sellableProducts().map(function (x) {
          return '<option value="' + esc(x.slug) + '"' + (x.slug === st.device ? " selected" : "") + ">" + esc(pName(x)) + "</option>";
        }).join("") + "</select></div>" +
        '<div class="tiny muted">' + esc(t("demo_day")) + '</div><div class="days mb">' +
        days.map(function (d, i) {
          return '<button class="opt day' + (st.day === i ? " on" : "") + '" data-demo-day="' + i + '">' +
            '<div class="tiny muted">' + esc(dayName(d)) + "</div><div>" + pad(d.getDate()) + "." + pad(d.getMonth() + 1) + ".</div></button>";
        }).join("") + "</div>" +
        '<div class="tiny muted">' + esc(t("demo_slot")) + '</div><div class="row wrap mb" style="margin-top:6px">' +
        SLOTS.map(function (s, i) {
          var busy = (i + st.day) % 3 === 0; // deo termina je zauzet, da deluje stvarno
          return '<button class="opt chip' + (st.slot === s ? " on" : "") + '"' + (busy ? " disabled" : "") +
            ' data-demo-slot="' + s + '">' + s + (busy ? " · " + esc(t("busy")) : "") + "</button>";
        }).join("") + "</div>" +
        '<div class="grid2">' +
        '<div class="field"><label>' + esc(t("f_name")) + '</label><input id="dm-name" placeholder="' + esc(t("ph_demo_name")) + '"></div>' +
        '<div class="field"><label>' + esc(t("f_tel")) + '</label><input id="dm-tel" placeholder="' + esc(t("ph_tel")) + '"></div>' +
        "</div>" +
        '<button class="btn block" data-demo-book="1"' + (st.slot ? "" : " disabled") + ">" +
        esc(st.slot ? t("demo_book") : t("demo_pick")) + "</button>" +
        "</div>";
    }
    return siteShell("demo", inner);
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

  /* ---------- B0 · prijava ---------- */

  function googleG() {
    return '<svg viewBox="0 0 48 48" aria-hidden="true">' +
      '<path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.1 17.7 9.5 24 9.5z"/>' +
      '<path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.4c-.5 2.9-2.2 5.3-4.7 6.9l7.3 5.7c4.3-3.9 7.1-9.8 7.1-16.9z"/>' +
      '<path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.4 0 20.1 0 24s1 7.6 2.6 10.8l7.8-6.1z"/>' +
      '<path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.3 0-11.7-3.6-13.6-8.9l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/>' +
      "</svg>";
  }

  function viewLogin() {
    var c = DATA.demo.company;
    return '<div class="login-wrap">' +
      '<div class="card">' +
      '<h1 class="center" style="font-size:22px">Vecom nalog</h1>' +
      '<p class="muted small center mb">Vaši aparati, garancije, servis i protokoli na jednom mestu.</p>' +
      '<button class="google-btn" id="g-btn">' + googleG() + "<span>Prijavi se Google nalogom</span></button>" +
      '<div class="or">ili</div>' +
      '<div class="field"><label>Mejl</label><input value="' + esc(c.email) + '"></div>' +
      '<div class="field"><label>Lozinka</label><input type="password" value="........"></div>' +
      '<button class="btn block ghost" id="pw-btn">Prijava lozinkom</button>' +
      '<div class="sep"></div>' +
      '<p class="tiny muted center">Nemate nalog? Nalog dobijate automatski pri isporuci aparata.</p>' +
      "</div>" +
      '<p class="tiny muted center mt">U prototipu je prijava samo vizuelna — ne otvara pravi Google nalog.</p>' +
      "</div>";
  }

  function fakeLogin() {
    var btn = document.getElementById("g-btn");
    if (btn) {
      btn.innerHTML = '<span class="spinner"></span><span>Prijavljivanje…</span>';
      btn.disabled = true;
    }
    setTimeout(function () {
      S.loggedIn = true;
      go("#/app");
    }, 600);
  }

  /* ---------- B · kupcev nalog ---------- */

  function customerNav(current) {
    return subnav([
      { href: "#/app", label: "Početna" },
      { href: "#/app/tickets", label: "Servis" },
      { href: "#/app/parts", label: "Potrošni" },
      { href: "#/app/protocols", label: "Protokoli" },
      { href: "#/app/docs", label: "Dokumenta" },
    ], current);
  }

  function customerShell(current, html) {
    var c = DATA.demo.company;
    return '<div class="wrap">' +
      '<div class="row spread wrap mb"><div><h1>' + esc(c.name) + "</h1>" +
      '<div class="small muted">' + esc(c.contact) + " · " + esc(c.city) + "</div></div>" +
      '<button class="btn ghost sm" data-logout="1">Odjava</button></div>' +
      customerNav(current) + html + "</div>";
  }

  function myTickets() {
    return S.tickets.filter(function (t) { return t.company === DATA.demo.company.name; });
  }

  function viewCustomerHome() {
    var inst = DATA.demo.installations;
    var open = myTickets().filter(function (t) { return t.status !== "reseno"; });

    var cards = inst.map(function (i) {
      var p = product(i.slug);
      return '<button class="card" data-nav="#/app/device/' + esc(i.slug) + '" style="text-align:left;cursor:pointer">' +
        thumb(p) +
        '<h3 style="margin-top:12px">' + esc(p ? p.name : i.slug) + "</h3>" +
        '<div class="tiny muted mb">' + esc(i.serial) + " · šifra " + esc(i.sku) + "</div>" +
        warrantyPill(i) +
        '<div class="mt">' + probeBlock(i) + "</div>" +
        "</button>";
    }).join("");

    var notif = DATA.demo.notifications.map(function (n) {
      return '<div class="row card-tight card"><div class="grow"><div class="small">' + esc(n.text) + "</div>" +
        '<div class="tiny muted">' + esc(n.at) + "</div></div></div>";
    }).join("");

    return customerShell("#/app",
      '<div class="grid2">' + cards + "</div>" +
      '<div class="grid2 mt">' +
      '<div class="card"><div class="row spread mb"><h3>Otvoreni servisi</h3>' +
      '<a class="pill" href="#/app/fault">Prijavi kvar</a></div>' +
      (open.length
        ? '<div class="list">' + open.map(ticketRow).join("") + "</div>"
        : '<p class="small muted">Nema otvorenih prijava.</p>') +
      "</div>" +
      '<div class="card"><h3 class="mb">Obaveštenja</h3><div class="list">' + notif + "</div></div>" +
      "</div>"
    );
  }

  function ticketRow(t) {
    var p = product(t.slug);
    var cls = t.status === "reseno" ? "ok" : t.status === "primljeno" ? "warn" : "";
    return '<button class="item" data-nav="#/app/ticket/' + t.id + '">' +
      '<div class="grow"><div>#' + t.id + " · " + esc(t.issue) + "</div>" +
      '<div class="tiny muted">' + esc(p ? p.name : t.slug) + " · otvoreno " + dmy(t.opened) + "</div></div>" +
      '<span class="pill ' + cls + '"><i class="dot"></i>' + esc(flowLabel(t.status)) + "</span>" +
      '<span class="chev">›</span></button>';
  }

  function viewDevice(slug) {
    var inst = null;
    DATA.demo.installations.forEach(function (i) { if (i.slug === slug) inst = i; });
    if (!inst) return customerShell("#/app", '<div class="card">Aparat nije pronađen.</div>');
    var p = product(slug);

    return customerShell("#/app",
      '<a class="small muted" href="#/app">‹ Nazad</a>' +
      '<div class="grid2 mt">' +
      '<div class="card">' + thumb(p) + "</div>" +
      '<div class="card"><h2>' + esc(p ? p.name : slug) + "</h2>" +
      '<p class="small muted">' + esc(p ? p.desc : "") + "</p>" +
      '<div class="sep"></div>' +
      '<div class="kv">' +
      '<span class="k">Serijski broj</span><span class="v">' + esc(inst.serial) + "</span>" +
      '<span class="k">Šifra</span><span class="v">' + esc(inst.sku) + "</span>" +
      '<span class="k">Isporučeno</span><span class="v">' + dmy(inst.delivered) + "</span>" +
      "</div>" +
      '<div class="mt">' + warrantyPill(inst) + "</div>" +
      '<div class="mt">' + probeBlock(inst) + "</div>" +
      "</div></div>" +

      '<div class="grid4 mt">' +
      '<a class="btn ghost" href="#/app/fault">Prijavi kvar</a>' +
      '<a class="btn ghost" href="#/app/parts">Poruči potrošni</a>' +
      '<a class="btn ghost" href="#/app/protocols">Protokoli</a>' +
      '<a class="btn ghost" href="#/app/docs">Dokumenta</a>' +
      "</div>" +

      '<div class="grid2 mt">' +
      '<div class="card"><h3 class="mb">Obučeni za rad</h3><div class="list">' +
      inst.trained.map(function (t) {
        return '<div class="row spread small"><span>' + esc(t.name) + "</span>" +
          '<span class="muted">' + dmy(t.date) + "</span></div>";
      }).join("") + "</div></div>" +
      '<div class="card"><h3 class="mb">Istorija servisa</h3><div class="list">' +
      inst.service.map(function (s) {
        return '<div class="row spread small"><span class="grow">' + esc(s.title) + "</span>" +
          '<span class="pill ok"><i class="dot"></i>' + esc(s.status) + "</span></div>" +
          '<div class="tiny muted" style="margin-top:-6px">' + dmy(s.date) + "</div>";
      }).join("") + "</div></div>" +
      "</div>" +

      (p && p.specs && p.specs.length
        ? '<div class="card mt"><h3 class="mb">Specifikacija</h3>' +
          p.specs.map(function (s) {
            return "<details style=\"border-top:1px solid var(--line);padding:10px 0\"><summary style=\"cursor:pointer\">" +
              esc(s.title) + '</summary><div class="small muted" style="white-space:pre-line;margin-top:8px">' +
              esc(s.text) + "</div></details>";
          }).join("") + "</div>"
        : "")
    );
  }

  /* B3 · prijava kvara */

  function viewFault() {
    var d = S.faultDraft;
    var opts = ["Greška na displeju", "Ne pali se", "Smanjen učinak", "Hlađenje / curenje", "Ručica / kabl", "Drugo"];
    return customerShell("#/app",
      '<div class="card" style="max-width:620px;margin:0 auto">' +
      "<h2>Prijava kvara</h2>" +
      '<p class="small muted mb">Znamo koji su vaši aparati — samo izaberite koji i opišite šta se dešava.</p>' +
      '<div class="field"><label>Aparat</label><select id="fa-dev">' +
      DATA.demo.installations.map(function (i) {
        var p = product(i.slug);
        return '<option value="' + esc(i.slug) + '"' + (d.slug === i.slug ? " selected" : "") + ">" +
          esc((p ? p.name : i.slug) + " · " + i.serial) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="field"><label>Tip kvara</label><select id="fa-type">' +
      opts.map(function (o) {
        return '<option' + (d.type === o ? " selected" : "") + ">" + esc(o) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="field"><label>Opis</label><textarea id="fa-text" placeholder="Aparat se upali, posle 20 sekundi izbaci E-04...">' + esc(d.text) + "</textarea></div>" +
      '<div class="field"><label>Fotografija</label>' +
      '<input id="fa-photo" type="file" accept="image/*" capture="environment">' +
      '<div id="fa-prev" class="mt">' +
      (d.photo ? '<a class="photo"><img src="' + esc(d.photo) + '" alt="Fotografija kvara"></a>' : "") +
      "</div>" +
      '<button class="btn ghost sm" id="fa-demo" type="button" style="margin-top:8px">Uzmi demo fotografiju</button></div>' +
      '<button class="btn block big" id="fa-send">Pošalji prijavu</button>' +
      '<p class="tiny muted center mt">Prijava odmah stiže Vecomu — bez telefoniranja i bez čekanja radnog vremena.</p>' +
      "</div>"
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
    toast("Prijava poslata — tiket #" + id + " (" + (p ? p.name : d.slug) + ")");
    go("#/app/ticket/" + id);
  }

  function ticketTimeline(t) {
    var cur = flowIndex(t.status);
    return '<div class="timeline">' + TICKET_FLOW.map(function (st, i) {
      var cls = i < cur ? "done" : i === cur ? "now" : "";
      return '<div class="tl-step ' + cls + '"><div class="tl-mark"><i></i><span></span></div>' +
        '<div class="tl-body"><div class="small">' + esc(st.label) + "</div>" +
        (i === cur ? '<div class="tiny muted">trenutni status</div>' : "") + "</div></div>";
    }).join("") + "</div>";
  }

  function ticketById(id) {
    var found = null;
    S.tickets.forEach(function (t) { if (String(t.id) === String(id)) found = t; });
    return found;
  }

  function viewTicket(id) {
    var t = ticketById(id);
    if (!t) return customerShell("#/app/tickets", '<div class="card">Tiket nije pronađen.</div>');
    var p = product(t.slug);

    return customerShell("#/app/tickets",
      '<a class="small muted" href="#/app/tickets">‹ Svi servisi</a>' +
      '<div class="grid2 mt">' +
      '<div class="card"><div class="row spread mb"><h2>Tiket #' + t.id + "</h2>" +
      '<span class="pill' + (t.status === "reseno" ? " ok" : "") + '"><i class="dot"></i>' + esc(flowLabel(t.status)) + "</span></div>" +
      '<div class="kv mb"><span class="k">Aparat</span><span class="v">' + esc(p ? p.name : t.slug) + "</span>" +
      '<span class="k">Serijski broj</span><span class="v">' + esc(t.serial || "—") + "</span>" +
      '<span class="k">Prijavljeno</span><span class="v">' + dmy(t.opened) + "</span>" +
      '<span class="k">Tip</span><span class="v">' + esc(t.type || "—") + "</span></div>" +
      '<p class="small">' + esc(t.issue) + "</p>" +
      (t.photo ? '<a class="photo mt" href="' + esc(t.photo) + '" target="_blank" rel="noopener"><img src="' + esc(t.photo) + '" alt="Fotografija kvara"></a>' : "") +
      "</div>" +
      '<div class="card"><h3 class="mb">Status</h3>' + ticketTimeline(t) + "</div>" +
      "</div>" +
      '<div class="card mt"><h3 class="mb">Prepiska</h3><div class="list">' +
      t.messages.map(function (m) {
        return '<div class="msg ' + (m.from === "vecom" ? "vecom" : "") + '">' +
          '<div class="tiny muted">' + (m.from === "vecom" ? "Vecom servis" : DATA.demo.company.contact) + " · " + esc(m.at) + "</div>" +
          '<div class="small">' + esc(m.text) + "</div></div>";
      }).join("") + "</div>" +
      '<div class="field mt"><textarea id="tk-msg" placeholder="Dopišite nešto servisu..."></textarea></div>' +
      '<button class="btn sm" data-ticket-msg="' + t.id + '">Pošalji poruku</button>' +
      "</div>"
    );
  }

  function viewCustomerTickets() {
    var list = myTickets();
    return customerShell("#/app/tickets",
      '<div class="row spread mb"><h2>Servis</h2><a class="btn sm" href="#/app/fault">Prijavi kvar</a></div>' +
      (list.length ? '<div class="list">' + list.map(ticketRow).join("") + "</div>"
        : '<div class="card">Nema prijava.</div>')
    );
  }

  /* B4 · potrosni */

  function viewParts() {
    var slugs = DATA.demo.installations.map(function (i) { return i.slug; });
    var parts = DATA.demo.parts.filter(function (p) { return slugs.indexOf(p.for) >= 0; });

    return customerShell("#/app/parts",
      '<div class="grid2">' +
      '<div class="card"><h2 class="mb">Potrošni materijal za vaše aparate</h2><div class="list">' +
      parts.map(function (p) {
        var dev = product(p.for);
        return '<div class="item" style="cursor:default"><div class="grow"><div>' + esc(p.name) + "</div>" +
          '<div class="tiny muted">' + esc(dev ? dev.name : p.for) + " · " + esc(p.note) + "</div></div>" +
          (p.recommended ? '<span class="pill warn"><i class="dot"></i>preporučeno</span>' : "") +
          '<button class="btn ghost sm" data-add-part="' + esc(p.id) + '">Dodaj</button></div>';
      }).join("") + "</div></div>" +
      '<div class="card"><h3 class="mb">Korpa</h3>' +
      (S.cart.length
        ? '<div class="list">' + S.cart.map(function (c, idx) {
            return '<div class="row spread small"><span class="grow">' + esc(c.name) + " × " + c.qty + "</span>" +
              '<button class="btn ghost sm" data-del-part="' + idx + '">Ukloni</button></div>';
          }).join("") + "</div>" +
          '<button class="btn block mt" data-order="1">Poruči</button>' +
          '<p class="tiny muted center mt">Predračun stiže na mejl, cene po važećem cenovniku.</p>'
        : '<p class="small muted">Korpa je prazna.</p>') +
      '<div class="sep"></div><h3 class="mb">Prethodne porudžbine</h3><div class="list">' +
      S.orders.filter(function (o) { return o.company === DATA.demo.company.name; }).map(function (o) {
        return '<div class="row spread small"><div class="grow"><div>' + esc(o.items) + "</div>" +
          '<div class="tiny muted">' + esc(o.at) + " · " + esc(o.status === "ceka" ? "čeka potvrdu" : "isporučeno") + "</div></div>" +
          '<button class="btn ghost sm" data-reorder="' + o.id + '">Ponovi</button></div>';
      }).join("") + "</div></div></div>"
    );
  }

  /* B5 · protokoli */

  function viewProtocols() {
    var q = S.protoQuery.toLowerCase().trim();
    var list = DATA.protocols.filter(function (p) {
      if (!q) return true;
      return (p.title + " " + p.indication + " " + p.tags.join(" ")).toLowerCase().indexOf(q) >= 0;
    });
    var chips = ["celulit", "akne", "pigmentacije", "epilacija", "fototip V"];

    return customerShell("#/app/protocols",
      '<div class="card mb"><h2 class="mb">Protokoli tretmana</h2>' +
      '<div class="field" style="margin:0"><input id="pr-q" placeholder="Pretraga: celulit, akne, pigmentacije, fototip..." value="' + esc(S.protoQuery) + '"></div>' +
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
          '<div class="small"><b>Protokol:</b> ' + esc(p.sessions) + "</div>" +
          '<div class="small" style="color:var(--alert)"><b>Kontraindikacije:</b> ' + esc(p.contra) + "</div>" +
          '<div class="small muted"><b>Kombinacije:</b> ' + esc(p.combo) + "</div>" +
          "</div>";
      }).join("") + "</div>" +
      (list.length ? "" : '<div class="card">Nema protokola za tu pretragu.</div>') +
      '<p class="tiny muted mt">Protokoli u prototipu su primeri — pravi sadržaj piše Vecom edukativni tim.</p>'
    );
  }

  /* B6 · dokumenta */

  function viewDocs() {
    return customerShell("#/app/docs",
      '<div class="card"><h2 class="mb">Dokumenta</h2><div class="list">' +
      DATA.demo.documents.map(function (d) {
        return '<div class="item" style="cursor:default"><div class="grow"><div>' + esc(d.name) + "</div>" +
          '<div class="tiny muted">' + esc(d.type) + " · " + esc(d.size) + "</div></div>" +
          '<button class="btn ghost sm" data-download="' + esc(d.name) + '">Preuzmi</button></div>';
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
        { href: "#/admin/service", icon: "wrench", label: "Servis" },
        { href: "#/admin/orders", icon: "box", label: "Porudžbine" },
        { href: "#/admin/fleet", icon: "map", label: "Teren" },
        { href: "#/admin/stats", icon: "chart", label: "Brojke" },
      ],
      tabs: ["#/admin", "#/admin/inquiries", "#/admin/service", "#/admin/fleet", "#/admin/stats"],
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
      '<nav class="adm-nav">' + r.nav.map(function (n) {
        var b = navBadge(n.href);
        return '<a href="' + n.href + '" class="' + (n.href === o.tab ? "on" : "") + '">' + ico(n.icon) +
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
      '<button class="adm-icon" aria-label="Obaveštenja">' + ico("bell", 17) + '<i class="adm-dot"></i></button>' +
      '<span class="adm-person"><span class="adm-av sm">' + esc(initials(r.name)) + "</span>" + esc(r.name.split(" ")[0]) + "</span>" +
      "</header>" +
      '<div class="adm-content">' + (o.wide || '<div class="adm-narrow">' + o.body + "</div>") + "</div>" +
      "</section></div>";
  }

  function phone(title, sub, body, tab) {
    var r = roleCfg();
    var tabs = r.tabs.map(function (h) { return r.nav.filter(function (n) { return n.href === h; })[0]; });
    return '<div class="wrap"><div class="phone-stage">' +
      '<div class="phone"><div class="notch"></div>' +
      '<div class="phone-head"><div class="row spread">' +
      "<div><h2 style=\"font-size:17px\">" + esc(title) + "</h2>" +
      '<div class="tiny muted">' + esc(sub) + "</div></div>" +
      '<span class="demo-badge">DEMO</span></div></div>' +
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
      '<article class="panel soft"><div class="eyebrow">Prodajna prilika</div><div class="metric-v">' + warr.count + "</div>" +
      '<p class="small muted">salona ima garanciju koja ističe za 60 dana — pravo vreme za servisni ugovor ili novi aparat.</p>' +
      '<a class="btn ghost sm" href="#/admin/fleet" data-fleet-pre="garancija">Pogledaj listu</a></article>' +
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

  /* ---------- ruter ---------- */

  function route() {
    var h = location.hash || "#/site";
    var parts = h.replace(/^#\//, "").split("/");
    var a = parts[0] || "site", b = parts[1], c = parts[2];
    var html;

    if (a === "guide" || a === "roi") { go("#/site/" + a); return; }
    if (a === "site") {
      if (b === "guide") html = siteShell("guide", viewGuide());
      else if (b === "roi") html = siteShell("roi", viewRoi());
      else if (b === "product") html = viewSiteProduct(c);
      else if (b === "demo") html = viewSiteDemo();
      else if (b === "service") html = viewSiteService();
      else if (b === "portal") html = viewSitePortal();
      else html = viewSiteIndex();
    }
    else if (a === "login") html = viewLogin();
    else if (a === "app") {
      if (!S.loggedIn) { go("#/login"); return; }
      if (b === "device") html = viewDevice(c);
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
    var map = { site: 0, guide: 0, roi: 0, login: 1, app: 1, admin: 2 };
    var idx = map[a] == null ? 0 : map[a];
    var btns = document.querySelectorAll("#personas button");
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("on", i === idx);
  }

  function bindView() {
    var sw = document.getElementById("pp-switch");
    if (sw) sw.addEventListener("change", function () { S.site.sent = null; go("#/site/product/" + sw.value); });
    var dd = document.getElementById("dm-dev");
    if (dd) dd.addEventListener("change", function () { S.site.demo.device = dd.value; });

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
      "[data-site-scroll],[data-demo-loc],[data-demo-day],[data-demo-slot],[data-demo-book],[data-svc-tab]," +
      "[data-svc-check],[data-svc-send],[data-lang],[data-admin-role],[data-admin-view],[data-admin-logout]," +
      "[data-fleet-pre]");
    if (!hit) return;
    var d = hit.dataset;

    if (d.go) return go(d.go);

    if (d.lang) { setLang(d.lang); return route(); }
    if (d.adminRole) { S.adminRole = d.adminRole; if (location.hash === "#/admin") return route(); return go("#/admin"); }
    if (d.adminView) { S.adminView = d.adminView; return route(); }
    if (d.adminLogout) { S.adminIn = false; toast("Odjavljeni"); return go("#/admin"); }
    if (d.fleetPre) { e.preventDefault(); S.fleetFilter = d.fleetPre; return go("#/admin/fleet"); }
    if (d.nav) return go(d.nav);

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

    if (d.demoLoc) { S.site.demo.loc = d.demoLoc; return route(); }
    if (d.demoDay) { S.site.demo.day = Number(d.demoDay); S.site.demo.slot = null; return route(); }
    if (d.demoSlot) { S.site.demo.slot = d.demoSlot; return route(); }
    if (d.demoBook) {
      var dm = S.site.demo;
      var day = nextWorkdays(6)[dm.day];
      var dev = product(val("dm-dev", dm.device));
      var loc = LOCS.filter(function (l) { return l.key === dm.loc; })[0];
      var dd = pad(day.getDate()) + "." + pad(day.getMonth() + 1) + ".";
      var did = addInquiry({
        name: val("dm-name", "Posetilac sajta"),
        device: dev.name,
        phone: val("dm-tel"),
        city: loc.sr.replace(/^.* /, ""),
        source: "Sajt · demo termin",
        note: "Demo termin: " + L.sr.days[day.getDay()] + " " + dd + " u " + dm.slot + ", " + loc.sr + ".",
      });
      S.site.sent = {
        key: "demo", id: did,
        text: dayName(day) + " " + dd + " " + t("demo_at") + " " + dm.slot + " · " + t("loc_" + loc.key) + " · " + pName(dev) + ".",
      };
      S.site.demo.slot = null;
      toast("Termin stigao u admin → Upiti");
      return route();
    }

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
      toast(part.name + " dodato u korpu");
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
      toast("Porudžbina poslata — predračun stiže na mejl");
      return route();
    }
    if (d.reorder) {
      var old = S.orders.filter(function (o) { return String(o.id) === d.reorder; })[0];
      S.orders.unshift({
        id: 1205 + S.orders.length, company: old.company, city: old.city,
        items: old.items, at: "upravo sada", status: "ceka",
      });
      toast("Porudžbina ponovljena");
      return route();
    }
    if (d.download) return toast("Preuzimanje: " + d.download + " (u prototipu bez fajla)");

    if (d.protoChip) { S.protoQuery = d.protoChip; return route(); }

    if (d.ticketMsg) {
      var tk = ticketById(d.ticketMsg);
      var box = document.getElementById("tk-msg");
      if (!box || !box.value.trim()) return toast("Napišite poruku");
      tk.messages.push({ from: "kupac", at: "upravo sada", text: box.value.trim() });
      toast("Poruka poslata servisu");
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
      toast("Odgovor poslat kupcu");
      return route();
    }

    if (d.orderOk) {
      S.orders.forEach(function (o) { if (String(o.id) === d.orderOk) o.status = "potvrdjeno"; });
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

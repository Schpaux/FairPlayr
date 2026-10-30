<!-- GENERERT FRA roadmap/roadmap.json – IKKE REDIGER. Kjør `npm run roadmap:render`. -->

# FairPlayr roadmap

Oppdatert 2026-10-30. Kilden er [roadmap/roadmap.json](roadmap/roadmap.json); regler og felt står i [roadmap/README.md](roadmap/README.md).

## Oversikt

| | Antall |
| :- | -: |
| Oppføringer totalt | 303 |
| Ferdige (`completed`) | 134 |
| Åpne vedtatte (`committed`) | 138 |
| Til vurdering (`considering`) | 26 |
| Utsatt (`deferred`) | 5 |
| Må verifiseres | 18 |
| Offentlig synlige | 22 |

## Arbeidsrekkefølge

Produkteiers prioriterte utviklingsområder. Unntak: P0-feil som kan påvirke kampdata, datalagring eller kritisk kampfunksjonalitet, og kritiske sikkerhetssårbarheter, tas før neste reelle kamptest.

1. **ROADMAP-01** Roadmap-system som felles sannhetskilde (ferdig, implementert)
2. **BRAND-01** FairPlayr Brand Refresh (ferdig, i produksjon)
3. **WEB-01** Ny landingsside og tydelig skille mellom nettside og app (ferdig, i produksjon, etter ROADMAP-02, BRAND-01)
4. **SMART-SUBS** FairPlayr Balance – intelligent byttemotor (vedtatt, ikke startet)
5. **FIX-POLISH** Samlet feilretting og UI-polish (vedtatt, pågår)
6. **COMPETITOR-01** Funn fra konkurrentanalysen (vedtatt, ikke startet)

## Åpent arbeid per initiativ

Vedtatte oppgaver som ikke er ferdige, sortert etter prioritet. Initiativer med arbeidsrekkefølge først.

### BRAND-01: FairPlayr Brand Refresh

| ID | Prio | Status | Oppgave | Under |
| :- | :- | :- | :- | :- |
| BRAND-01d | P2 | må verifiseres | Appikon og splash for iOS/Capacitor |  |

### WEB-01: Ny landingsside og tydelig skille mellom nettside og app

| ID | Prio | Status | Oppgave | Under |
| :- | :- | :- | :- | :- |
| WEB-01a | P1 | ikke startet | Produktpresentasjon |  |
| WEB-01d | P1 | til review | Skille nettside og app med tydelig tilgang til appen |  |
| WEB-01j | P1 | ikke startet | Promofilm på nettsiden |  |
| WEB-01l | P1 | ikke startet | Juridiske avklaringer før offentlig lansering av nettsiden |  |
| WEB-01m | P1 | til review | Nettsiden oppdateres for tidligere PWA-besøkende |  |
| BRAND-01g | P2 | ikke startet | Vurder øvrig markedsføringsmateriell |  |
| WEB-01b | P2 | pågår | FairPlayr-branding på nettsiden |  |
| WEB-01c | P2 | ikke startet | Kontaktinformasjon |  |
| WEB-01g | P2 | pågår | SEO og metadata for nettsiden |  |
| WEB-01i | P2 | ikke startet | Personvernerklæring og brukervilkår på nettsiden |  |
| WEB-01k | P2 | ikke startet | Interaktiv kampdemo på nettsiden |  |
| WEB-01f | P3 | ikke startet | Markedsføring av nye funksjoner |  |
| WEB-01h | P3 | ikke startet | Rutine for å foreslå oppdatering av nettsiden |  |

### SMART-SUBS: FairPlayr Balance – intelligent byttemotor

| ID | Prio | Status | Oppgave | Under |
| :- | :- | :- | :- | :- |
| SMART-SUBS-01 | P2 | ikke startet | Posisjonsvalg i spillerens redigeringsark | FEAT-POS-01 |
| SMART-SUBS-02 | P2 | ikke startet | Flere foretrukne og tillatte posisjoner per spiller | FEAT-POS-01 |
| SMART-SUBS-03 | P2 | ikke startet | Lagre posisjonspreferanser lokalt først og synkroniser | FEAT-POS-01 |
| SMART-SUBS-04 | P2 | ikke startet | Domene: modell for bytteintervall i lagstandarder | SMART-SUBS-INTERVAL |
| SMART-SUBS-05 | P2 | ikke startet | UI for bytteintervall i lagstandarder og kampoppsett | SMART-SUBS-INTERVAL |
| SMART-SUBS-06 | P2 | ikke startet | Dynamisk beregning av byttetidspunkt | SMART-SUBS-DYNAMIC |
| SMART-SUBS-07 | P2 | ikke startet | Tilpasse livevisningen til nye forslag | SMART-SUBS-DYNAMIC |
| SMART-SUBS-08 | P2 | ikke startet | Rettferdighetsregler og tester for forslagsmotoren | SMART-SUBS-FAIR |
| SMART-SUBS-10 | P2 | ikke startet | Posisjonsmatching i forslagsfunksjonen | SMART-SUBS-POSAWARE |
| SMART-SUBS-11 | P2 | ikke startet | Implementer kapasitetsbevisst adaptiv regelmotor |  |
| SMART-SUBS-12 | P2 | ikke startet | Valider motoren mot forskningsresultatene |  |
| SMART-SUBS-09 | P3 | ikke startet | Konfigurerbar terskel for bytteforslag i UI | SMART-SUBS-FAIR |

### FIX-POLISH: Samlet feilretting og UI-polish

| ID | Prio | Status | Oppgave | Under |
| :- | :- | :- | :- | :- |
| C4-F1 | P1 | ikke startet | Slettet eller endret servermål oppdaterer ikke stillingen | FIX-DATA |
| C6-F1a | P1 | ikke startet | Designbeslutning: bane og benk i samme arbeidsområde | C6-F1 |
| C6-F1b | P1 | ikke startet | Rask plassering av spillere fra benk til bane | C6-F1 |
| C6-F1c | P1 | ikke startet | Tydelig hvem som er på banen og på benken | C6-F1 |
| C6-F1d | P1 | ikke startet | Akseptkriterier på 360×640 og 375×667 | C6-F1 |
| MATCH-02b | P1 | ikke startet | UI for målkorrigering | MATCH-02 |
| MATCH-04 | P1 | ikke startet | Flere live-rader per lag gir lesefeil | FIX-DATA |
| MATCH-08 | P1 | må verifiseres | Verifiser livssyklus og synk mot ekte Supabase | FIX-DATA |
| OFF-06 | P1 | ikke startet | Synkstatus-UI | FIX-DATA |
| SPOND-RESET-01 | P1 | ikke startet | Spond-sletting rapporterer «slettet» når kampene ikke ble slettet | FIX-DATA |
| C4-F4 | P2 | må verifiseres | Verifiser innlogget historikk og kampdetaljer mot ekte Supabase | FIX-HISTORY |
| FEAT-LINEUP-01 | P2 | ikke startet | Nye /lineup-oppsett skal bruke lagets standardformat | FIX-CLEANUP |
| MATCH-14-V1 | P2 | må verifiseres | Produksjonskontroll: ny kamp lagres og vises med riktig format | FIX-DATA |
| OFF-08 | P2 | ikke startet | Utsatt sesjon og 401 under kamp | FIX-DATA |
| POLISH-01 | P2 | ikke startet | Overflødig informasjon om pågående kamp | FIX-SETTINGS |
| POLISH-02 | P2 | ikke startet | Lik UI for skysynkronisering og Spond | FIX-SETTINGS |
| POLISH-03 | P2 | ikke startet | Spond-innstillinger på egen side | FIX-SETTINGS |
| POLISH-04 | P2 | ikke startet | Faresonen på egen side | FIX-SETTINGS |
| STAB-10 | P2 | må verifiseres | Treg menyknapp og navigasjon etter oppdatering | FIX-SETTINGS |
| TEAM-PICKER-01 | P2 | ikke startet | Én sentral lagvelger | FIX-SETTINGS |
| UI-MS-01c | P2 | ikke startet | Fjern den gamle live-visningen | UI-MS-01 |
| UI-PITCH-03 | P2 | til review | Pensjonere /lineup (U6) | FIX-CLEANUP |
| C1-F5 | P3 | ikke startet | Init-effekten i oppsettet kjører på nytt ved ny lagidentitet | FIX-SETUP |
| C1-F8 | P3 | ikke startet | Sticky bunnlinje på fysisk enhet med skjermhakk | FIX-A11Y |
| C2-F3 | P3 | ikke startet | Aktivt oppsett uten live-tilstand vises ikke | FIX-SETUP |
| C2-F4 | P3 | må verifiseres | Hjem: fokusring, VoiceOver og ekte data ikke verifisert | FIX-A11Y |
| C3-F1 | P3 | ikke startet | Teksten «Dette kan ikke angres» ved sletting av spiller | FIX-SETUP |
| C4-F2 | P3 | ikke startet | Lange sesonger i Historikk | FIX-HISTORY |
| C5-F3 | P3 | ikke startet | Stram inn Spond-feilmeldinger og skjematilstand | FIX-SETTINGS |
| C5-F4 | P3 | ikke startet | Utloggingssperren i et felles lag | FIX-SETTINGS |
| C5-F6 | P3 | må verifiseres | Innstillinger og Spond ikke testet med ekte konto | FIX-SETTINGS |
| C6-F2 | P3 | ikke startet | Servervalidering av hendelsesdata | FIX-DATA |
| C6-F3 | P3 | ikke startet | Skallet bak live er nåbart med Tab/sveip | FIX-A11Y |
| C6-F4 | P3 | må verifiseres | Verifiser live-annonseringer, zoom og viewport på enhet | FIX-A11Y |
| C6-F5 | P3 | ikke startet | Små a11y-rester fra C6 | FIX-A11Y |
| C6-F6 | P3 | ikke startet | FpButton (legacy) tegner 1 px kant | FIX-CLEANUP |
| MATCH-01 | P3 | ikke startet | Reparer enheter med skadet legacy-kamp (FP-MS2.1-A1.1) | FIX-DATA |
| MATCH-12-F1 | P3 | ikke startet | Nedtellingen i målscorer-arket viser ingen sekunder | FIX-LIVE |
| MATCH-13-F3 | P3 | ikke startet | Bedre kamptittel når motstander mangler | FIX-HISTORY |
| POLISH-05 | P3 | ikke startet | Mer logisk plassering av språk og tema | FIX-SETTINGS |
| UI-A11Y-03-F1 | P3 | ikke startet | LiveSheets på felles Sheet-primitiv | FIX-A11Y |
| UI-DEAD-01 | P3 | til review | Slett død UI-kode | FIX-CLEANUP |
| UI-FOUND-02 | P3 | ikke startet | Oppfølging fra B1-review | FIX-A11Y |

### COMPETITOR-01: Funn fra konkurrentanalysen

| ID | Prio | Status | Oppgave | Under |
| :- | :- | :- | :- | :- |
| COMPETITOR-01a | P3 | pågår | Importer konkurrentanalysen og registrer funn |  |

### INIT-AI: AI-genererte kampoppsummeringer

| ID | Prio | Status | Oppgave | Under |
| :- | :- | :- | :- | :- |
| AI-SDK-01 | P2 | ikke startet | Bytt fra @google-cloud/vertexai til @google/genai |  |
| FEAT-NAME-01-F1 | P2 | ikke startet | Entydige visningsnavn i AI-tekst, rapport og offentlig side |  |
| SEC-10-F1 | P2 | må verifiseres | Bekreft Vertex-region etter første ekte oppsummering |  |

### INIT-DEVEX: Utviklingsprosess, testing og kvalitet

| ID | Prio | Status | Oppgave | Under |
| :- | :- | :- | :- | :- |
| HK-04 | P1 | pågår | Lite ledig diskplass |  |
| E2E-CLOCK-01 | P2 | ikke startet | Tidsavhengig klokkesjekk i live-storage-full.spec.ts |  |
| E2E-DRAG-01 | P2 | ikke startet | Spøkelset ved dra-bytte henger etter i prod-e2e |  |
| HK-05 | P2 | ikke startet | Prod-smoke-spesifikasjoner ut av test-results/ |  |
| OPS-02 | P2 | ikke startet | Verifiser reproduserbart agentoppsett ved ny kloning |  |
| STAB-01 | P2 | ikke startet | Falsk klokke i live-specs |  |
| STAB-02 | P2 | må verifiseres | Ustabil match-setup-formation.spec.ts |  |
| STAB-03 | P2 | ikke startet | CI-jobb for test, typecheck og lint |  |
| STAB-04 | P2 | ikke startet | Rett lint-baselinen |  |
| STAB-08 | P2 | ikke startet | Ustabil match-lifecycle.spec.ts |  |
| HK-01 | P3 | ikke startet | Rydd rot-artefaktene |  |
| STAB-05 | P3 | ikke startet | Prod-smoke-spec gir falske feil mot produksjon |  |
| STAB-07 | P3 | ikke startet | Benken kan bli stående 1 px forskjøvet |  |
| STAB-11 | P3 | ikke startet | Ustabil Vitest i share.test.ts |  |

### INIT-IOS: iOS-app (Capacitor)

| ID | Prio | Status | Oppgave | Under |
| :- | :- | :- | :- | :- |
| OFF-03 | P1 | ikke startet | iOS uten nett: bundlet build eller service worker i WKWebView |  |
| UI-LIVE-01 | P1 | må verifiseres | Bekreft at iOS-bygget kjører Sideline-visningen |  |
| IOS-01 | P2 | ikke startet | Capacitor iOS-produksjonsløp |  |
| IOS-02 | P2 | ikke startet | Live Activities og Dynamic Island |  |
| SEC-09 | P2 | ikke startet | Kontroller native avhengighetsversjoner i iOS-bygget |  |

### INIT-OFFLINE: Offline-app og PWA

| ID | Prio | Status | Oppgave | Under |
| :- | :- | :- | :- | :- |
| OFF-04 | P1 | må verifiseres | Android 360×640 på fysisk enhet før bred lansering | OFF-13 |
| OFF-05 | P1 | må verifiseres | Adaptiv benk på iPhone Safari og i Capacitor | OFF-13 |
| OFF-07 | P1 | må verifiseres | Manuell enhetsverifisering av offline-PWA | OFF-13 |
| OFF-11 | P1 | pågår | Avstem dokumentasjon med online-first-retningen |  |
| UI-TOKENS-01-SW | P1 | må verifiseres | Service worker-oppgradering på ekte enhet |  |
| OFF-12 | P2 | må verifiseres | Skjermlås og bakgrunn under kamp: kort iPhone-kontroll | OFF-13 |
| OFF-10 | P3 | ikke startet | Småpunkter fra A2 |  |

### INIT-ROADMAP: Roadmap-forvaltning og datakvalitet

| ID | Prio | Status | Oppgave | Under |
| :- | :- | :- | :- | :- |
| OPS-01 | P2 | ikke startet | Daglig avstemming av beslutninger mot roadmapen |  |

### INIT-SECURITY: Sikkerhet og personvern

| ID | Prio | Status | Oppgave | Under |
| :- | :- | :- | :- | :- |
| SEC-01 | P0 | ikke startet | Rutinemessig nøkkelrotasjon |  |
| SEC-02 | P0 | ikke startet | Opprydding etter nøkkelrotasjon |  |
| SEC-11 | P1 | ikke startet | Videresending etter innlogging |  |
| SEC-12 | P1 | ikke startet | Sesjonsfornyelse og cookies i proxyen |  |
| SEC-06 | P2 | ikke startet | Forsvar i dybden for oppslag i sesongstatistikken |  |
| SEC-10-F3 | P2 | må verifiseres | Røyktest av skrivende flyter etter flytting til dub1 |  |
| SEC-07-F1 | P3 | ikke startet | Løft eslint-config-next til samme versjon som next |  |
| SEC-08-F1 | P3 | ikke startet | Fjern zod-override når serwist slipper ny versjon |  |
| SEC-08-F2 | P3 | ikke startet | Avhengighetsvarsler som krever major-oppgraderinger |  |
| SEC-10-F2 | P3 | ikke startet | Vertex-region for Preview og Development |  |

### INIT-SHARING: Offentlig kampdeling

| ID | Prio | Status | Oppgave | Under |
| :- | :- | :- | :- | :- |
| FEAT-SHARE-01-V1 | P2 | må verifiseres | Verifiser mål → offentlig side ende til ende i produksjon |  |
| FEAT-SHARE-05 | P2 | ikke startet | Korrekt delingsvisning etter kampslutt |  |

## Må verifiseres

Arbeid som kan være gjort eller er levert, men ikke bekreftet.

| ID | Prio | Oppgave | Initiativ |
| :- | :- | :- | :- |
| MATCH-08 | P1 | Verifiser livssyklus og synk mot ekte Supabase | FIX-POLISH |
| OFF-04 | P1 | Android 360×640 på fysisk enhet før bred lansering | INIT-OFFLINE |
| OFF-05 | P1 | Adaptiv benk på iPhone Safari og i Capacitor | INIT-OFFLINE |
| OFF-07 | P1 | Manuell enhetsverifisering av offline-PWA | INIT-OFFLINE |
| UI-LIVE-01 | P1 | Bekreft at iOS-bygget kjører Sideline-visningen | INIT-IOS |
| UI-TOKENS-01-SW | P1 | Service worker-oppgradering på ekte enhet | INIT-OFFLINE |
| BRAND-01d | P2 | Appikon og splash for iOS/Capacitor | BRAND-01 |
| C4-F4 | P2 | Verifiser innlogget historikk og kampdetaljer mot ekte Supabase | FIX-POLISH |
| FEAT-SHARE-01-V1 | P2 | Verifiser mål → offentlig side ende til ende i produksjon | INIT-SHARING |
| MATCH-14-V1 | P2 | Produksjonskontroll: ny kamp lagres og vises med riktig format | FIX-POLISH |
| OFF-12 | P2 | Skjermlås og bakgrunn under kamp: kort iPhone-kontroll | INIT-OFFLINE |
| SEC-10-F1 | P2 | Bekreft Vertex-region etter første ekte oppsummering | INIT-AI |
| SEC-10-F3 | P2 | Røyktest av skrivende flyter etter flytting til dub1 | INIT-SECURITY |
| STAB-02 | P2 | Ustabil match-setup-formation.spec.ts | INIT-DEVEX |
| STAB-10 | P2 | Treg menyknapp og navigasjon etter oppdatering | FIX-POLISH |
| C2-F4 | P3 | Hjem: fokusring, VoiceOver og ekte data ikke verifisert | FIX-POLISH |
| C5-F6 | P3 | Innstillinger og Spond ikke testet med ekte konto | FIX-POLISH |
| C6-F4 | P3 | Verifiser live-annonseringer, zoom og viewport på enhet | FIX-POLISH |

## Til vurdering

Ideer og muligheter. Ikke vedtatt; endres bare til `committed` med dokumentert beslutning.

| ID | Prio | Oppgave | Initiativ |
| :- | :- | :- | :- |
| C6-F1e | P1 | Forenkle bunnområdet i kampoppsettet | FIX-POLISH |
| BRAND-01h | P2 | Delingsbilde (Open Graph) for app og nettside | BRAND-01 |
| BRAND-01i | P2 | Varemerkeklarering og trykkprofil | BRAND-01 |
| FEAT-AI-01 | P2 | Merking av AI-tekst og bekreftelse ved regenerering | INIT-AI |
| FEAT-HIST-01 | P2 | Lokal historikk for gjestekamper | INIT-HISTORY |
| MATCH-06 | P2 | Databasetrigger som gjør completed terminal | FIX-POLISH |
| OFF-09 | P2 | Tidsgrense for forlatt kamp som blokkerer oppdateringer | INIT-OFFLINE |
| OFF-14 | P2 | Testmiljø for installert PWA bak Vercel Authentication | INIT-OFFLINE |
| OFF-15 | P2 | Kamp og Historikk uten nett | INIT-OFFLINE |
| STAB-12 | P2 | E2E-testen for oppsettrekkefølgen forventer ikke «Del kampen» | INIT-DEVEX |
| BRAND-01j | P3 | SVG-favicon | BRAND-01 |
| C3-F4 | P3 | Sette draktnummer i appen | INIT-TEAM |
| COMPETITOR-01b | P3 | Mer avansert posisjonsrotasjon | COMPETITOR-01 |
| COMPETITOR-01c | P3 | Tydeligere varsling om skjev spilletid | COMPETITOR-01 |
| COMPETITOR-01d | P3 | Gjenbruk av startoppstillinger | COMPETITOR-01 |
| COMPETITOR-01e | P3 | Cupgruppering i historikken | COMPETITOR-01 |
| COMPETITOR-01f | P3 | Videreutvikling av FairPlayr Next | COMPETITOR-01 |
| FEAT-SHARE-03 | P3 | Offentlige byttehendelser tilpasset delingsnivå | INIT-SHARING |
| FEAT-SHARE-06 | P3 | Eget subdomene for offentlig kampvisning | INIT-SHARING |
| FEAT-SPOND-01 | P3 | Kontroller read-only Spond-spillere og gjenværende synkfeil | INIT-SPOND |
| HK-02 | P3 | Usporet Xcode-workspace: commit eller ignorer | INIT-DEVEX |
| MATCH-05-F1 | P3 | Serverfeil ved start av planlagt kamp viser feil selv om kampen er startet lokalt | FIX-POLISH |
| SEC-03-F1 | P3 | Videre herding av agentvernet etter SEC-03 | INIT-SECURITY |
| STAB-13 | P3 | Ustabil enhetstest for offentlig kampsammendrag etter rettet resultat | INIT-DEVEX |
| UI-HIST-01-F1 | P3 | Historikk i to kolonner på desktop | FIX-POLISH |
| UI-LIVE-02 | P3 | To lime «neste handlinger» før avspark | FIX-POLISH |

## Utsatt

Bevisst parkert.

| ID | Prio | Oppgave | Initiativ |
| :- | :- | :- | :- |
| MATCH-07 | P2 | FP-MS2.1-A2: øvrige endringer i bytteforslag | SMART-SUBS |
| FEAT-NAME-02 | P3 | Valgfrie kallenavn på spillere | INIT-TEAM |
| FEAT-SHARE-07 | P3 | Bare nødvendige oversettelser på den offentlige kampsiden | INIT-SHARING |
| MATCH-13-F2 | P3 | Aktiv kamp startet før MATCH-13 får ingen server-ID | FIX-POLISH |
| MATCH-14-F1 | P3 | Rett format på allerede fullførte kamper | FIX-POLISH |

## Historikk

Ferdige initiativer og funksjoner, nyeste først. «≤» betyr at commiten var i produksjon senest den datoen; første lanseringsdato er ikke dokumentert.

| Dato | ID | Leveranse | Commit |
| :- | :- | :- | :- |
| 2026-10-28 (prod 2026-10-28) | WEB-01 | Ny landingsside og tydelig skille mellom nettside og app | `c5d9113` `73faea1` |
| 2026-10-27 (prod 2026-10-27) | BRAND-01 | FairPlayr Brand Refresh | `7df63a8` `2b8f4b1` |
| 2026-10-27 (prod 2026-10-27) | FEAT-SHARE-02 | Pseudonymiserte, lengre og faktatro AI-oppsummeringer i EU | `965200b` |
| 2026-10-27 (prod 2026-10-27) | FEAT-SHARE-04 | Offentlig lagoppstilling og benk | `b8181a3` |
| 2026-10-27 | ROADMAP-01 | Roadmap-system som felles sannhetskilde | `fb5cc71` `5320df8` `2813bff` |
| 2026-10-27 (prod 2026-10-27) | UI-PITCH-04 | Banekart som egen halvdel med alle linjer | `e654da5` |
| 2026-10-26 (prod 2026-10-26) | FEAT-SHARE-01 | Offentlig kamplenke med live og oppsummering | `51bae21` `3b78537` |
| 2026-10-26 (prod 2026-10-26) | INIT-SYNC | Pålitelige kampdata og synk | `4918b3c` `89e2afe` `4c37ab9` |
| 2026-10-26 (prod 2026-10-26) | OFF-01 | Offline kaldstart og synk (OFF-01a + OFF-01b) | `5cf0e28` `081c135` |
| 2026-10-25 (prod 2026-10-25) | FEAT-NEXT-01 | FairPlayr Next: handlingslinjen i livevisningen | `f934791` `6065fee` `5084316` |
| 2026-10-25 (prod 2026-10-25) | INIT-LIVE | Live kamp og byttehåndtering | `863941d` `1f40bb6` `5084316` |
| 2026-10-25 (prod 2026-10-25) | INIT-SIDELINE | Modern Sideline (helhetlig redesign) | `f934791` `6065fee` `9233ac1` |
| 2026-10-25 (prod 2026-10-25) | SIDELINE-C6 | C6: sluttføring av Modern Sideline | `9233ac1` |
| 2026-10-25 (prod 2026-10-25) | SIDELINE-LIVE | Ny livevisning (Sideline) med ring og minutter | `6065fee` `9233ac1` |
| 2026-10-22 (prod 2026-10-22) | INIT-HISTORY | Kamphistorikk og kampdetaljer | `17f4f68` `aa58088` `dded5db` |
| 2026-10-22 (prod 2026-10-23) | INIT-SPOND | Spond-integrasjon | `17e261c` `44a0894` `2bd40bb` |
| 2026-10-22 (prod ≤ 2026-10-22) | INIT-TEAM | Lag, spillere, innlogging og skylagring | `b4b738c` `090998e` `e9eee93` |
| 2026-10-22 (prod 2026-10-22) | SIDELINE-B3 | B3: tokenhygiene | `bbd3c62` |
| 2026-10-22 (prod 2026-10-22) | SIDELINE-C1 | C1: kampoppsett med oppmøte først og forhåndsvalgt tropp | `575e5ce` |
| 2026-10-22 (prod 2026-10-22) | SIDELINE-C2 | C2: Hjem og navigasjon | `1b5e6c9` |
| 2026-10-22 (prod 2026-10-22) | SIDELINE-C3 | C3: spillerliste og redigering | `77ab025` |
| 2026-10-22 (prod 2026-10-22) | SIDELINE-C4 | C4: historikk og kampdetaljer | `3457d83` |
| 2026-10-22 (prod 2026-10-23) | SIDELINE-C5 | C5: innstillinger, innlogging og Spond-UI | `85647cf` |
| 2026-10-21 (prod 2026-10-21) | INIT-PLAYTIME | Spilletidsregistrering og rettferdighet | `863941d` `84b0f26` `9d649a5` |
| 2026-10-20 (prod 2026-10-20) | FEAT-NAME-01 | Entydige visningsnavn (navnestige) | `71eed52` |
| 2026-10-20 (prod ≤ 2026-10-20) | FP-PITCH-01 | Felles bane og orientering i oppsett og live | `66285e6` |
| 2026-10-20 (prod 2026-10-20) | SIDELINE-B1 | B1: felles UI-primitiver og UI-vakt | `1b6dafa` |
| 2026-10-20 (prod 2026-10-20) | SIDELINE-B2 | B2: bekreftelser, tilgjengelighet og mobilinteraksjon | `3399872` |
| 2026-10-16 (prod ≤ 2026-10-19) | FP-MS2.1-B2 | Adaptiv, sortert innbytterbenk | `bb97887` |
| 2026-10-16 (prod 2026-10-19) | FP-MS2.1-B3 | Påfølgende bytter uten å vente på angre | `a13c8dc` |
| 2026-10-15 (prod ≤ 2026-10-19) | FP-MS2.1-B1 | Posisjonsbytte med trykk og dra | `5084316` |
| 2026-10-15 (prod ≤ 2026-10-19) | HIST-TEAMDEFAULTS-01 | Lagstandarder for kamp | `5d8ce52` `5fe72db` `7797967` |
| 2026-10-14 (prod ≤ 2026-10-19) | HIST-OFFLINE-01 | Kampen overlever nettbrudd | `e3cbc21` `d0fa167` |
| 2026-10-14 (prod ≤ 2026-10-19) | SIDELINE-FOUND | Modern Sideline: fundament og DESIGN.md | `f934791` |
| 2026-05-14 (prod ≤ 2026-10-19) | HIST-HOME-01 | Kampdag-hjem med sesongbalanse | `4971aa7` `f53ce71` |
| 2026-05-14 (prod ≤ 2026-10-19) | HIST-PITCH-01 | Halvbane-layout og bunnark (mai) | `68bb214` `8f31809` `4da7758` |
| 2026-05-14 (prod ≤ 2026-10-19) | INIT-DESIGN-V1 | Første redesign og kampdag-hjem (april–mai 2026) | `c2deb00` `276648a` `fb32210` |
| 2026-04-17 (prod ≤ 2026-10-19) | HIST-DESIGN-V1 | Wise-inspirert visuell redesign | `c2deb00` `276648a` `fb32210` |
| 2026-04-17 | HIST-LANDING-01 | Første landingsside (markedsføring i appen) | `9a221f9` `ba74404` |
| 2026-04-17 (prod ≤ 2026-10-19) | HIST-LIVE-03 | Banekart i live og trykk/dra for bytte | `31dccd4` `1f40bb6` |
| 2026-04-15 | HIST-IOS-01 | Capacitor iOS-skall | `2d2cd50` |
| 2026-04-12 (prod ≤ 2026-10-19) | HIST-AI-01 | Første AI-kampoppsummering (Vertex AI) | `62201ee` `f11139c` `aa25385` |
| 2026-04-12 (prod ≤ 2026-10-19) | HIST-HISTORY-01 | Historikk-side og felles hendelsesmodell | `17f4f68` `aa58088` `dded5db` |
| 2026-04-11 (prod ≤ 2026-10-19) | HIST-LIVE-02 | Tidsstempelbasert kampklokke og gjenoppretting | `ccf1aa8` `84b0f26` `b627040` |
| 2026-04-10 (prod ≤ 2026-10-19) | HIST-AUTH-01 | Innlogging og skylagring av lag | `090998e` `e9eee93` `8a7d35b` |
| 2026-04-10 (prod ≤ 2026-10-19) | HIST-LIVE-01 | Første live kamp med bytteassistanse | `863941d` `213e7d8` |
| 2026-04-10 (prod ≤ 2026-10-19) | HIST-MULTITEAM-01 | Flere lag per trener | `1907675` |
| 2026-04-10 (prod ≤ 2026-10-19) | HIST-SCAFFOLD | Prosjektskjelett og app-skall | `c6236d0` `93fde50` |
| 2026-04-10 (prod ≤ 2026-10-19) | HIST-SETUP-01 | Første kampoppsett | `6301024` `213e7d8` |
| 2026-04-10 (prod ≤ 2026-10-19) | HIST-SPOND-01 | Spond-tilkobling og medlemsimport | `17e261c` `ee5991e` |
| 2026-04-10 (prod ≤ 2026-10-19) | HIST-SPOND-02 | Spond-arrangementer som kamper og påmeldinger | `44a0894` `2bd40bb` `f402d7d` |
| 2026-04-10 (prod ≤ 2026-10-19) | HIST-TEAM-LOCAL | Lag og spillere lokalt (gjestemodus) | `b4b738c` |
| 2026-04-10 (prod ≤ 2026-10-19) | INIT-FOUNDATION | Grunnmur og første fungerende versjon | `1e21513` `c6236d0` `93fde50` |

## Kilder som mangler eller må importeres

- **SRC-CHATGPT** ChatGPT-samtaler: Produkteiers beslutningshistorikk i ChatGPT er ikke tilgjengelig for Claude. Beslutningene i produkteiers oppdrag ROADMAP-02 (2026-10-27) er avstemt; samtalene selv er ikke importert.
- **SRC-COMPETITOR** Konkurrentanalysen: Ikke i repoet. Fem eksempelfunn fra ROADMAP-02 er registrert (COMPETITOR-01b–f); resten importeres via COMPETITOR-01a.
- **SRC-DEPLOYS-PRE-OCT** Produksjonsdatoer før 2026-10-19: Ingen dokumentasjon av når commits fra april–oktober først ble deployet. Oppføringene bruker dates.released_no_later_than = 2026-10-19 (første dokumenterte deploy, 89e2afe).
- **SRC-TESTFLIGHT** iOS/TestFlight-bygg: Ikke dokumentert om eller når et iOS-bygg er lastet opp, eller hvilken URL det laster (UI-LIVE-01, SEC-09).
- **SRC-VERSIONS** Versjonsnumre: Repoet har ingen tagger, releases eller PR-er; package.json står på 0.1.0. Ingen historiske versjonsnumre er registrert.
- **SRC-DEVICE-TESTS** Fysiske enhetstester: Produkteier opplyser at flere enhetstester er gjennomført (OFF-04, OFF-05, OFF-07, OFF-12), men ingen testlogg eller rapport er funnet. De står som needs_verification til resultatene er dokumentert.

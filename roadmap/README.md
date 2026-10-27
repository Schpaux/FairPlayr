# FairPlayr roadmap

`roadmap/roadmap.json` er **eneste kilde** for FairPlayrs utviklingshistorikk, vedtatte oppgaver, feil, forbedringer og ideer. Den erstatter `TODO.md` (arkivert 2026-10-27, ROADMAP-01). Alt annet er avledet:

| Fil | Rolle | Redigeres? |
| :- | :- | :- |
| `roadmap/roadmap.json` | Data, én oppføring per initiativ, funksjon eller oppgave | Ja |
| `roadmap/roadmap.schema.json` | JSON Schema (felt og lovlige verdier; gir autoutfylling i VS Code) | Bare ved modellendring |
| `scripts/roadmap/lib.mjs` | Validering, Markdown-visning og offentlig utvalg (ingen avhengigheter) | Bare ved modellendring |
| `ROADMAP.md` | Generert oversikt for mennesker | **Nei**, kjør `npm run roadmap:render` |

Detaljerte planer, undersøkelser og rapporter (`FP-*.md`, `DESIGN.md`) er fortsatt dokumentasjon. Roadmapen lenker til dem som kilder, men oppgaver og status finnes bare i `roadmap.json`.

> **Repoet er offentlig.** Ikke skriv hemmeligheter, persondata, prosjekt-ID-er, deploy-ID-er eller detaljer om åpne sikkerhetssvakheter i roadmapen. Slike detaljer ligger i lokale, ikke-versjonerte filer og refereres som `local_doc`.

## Hvorfor JSON

JSON kan importeres direkte i Next.js uten ny avhengighet, valideres med JSON Schema, leses og skrives presist av både Claude og ChatGPT, og gir ryddige diffs med én oppføring per objekt. YAML ville krevd en parser og har tvetydig typing; Markdown er ikke maskinlesbart nok for en offentlig visning og validering. Lesbarheten for mennesker dekkes av den genererte `ROADMAP.md`.

## Modell

En flat liste med stabile ID-er og eksplisitte relasjoner, inspirert av initiativ → epic → oppgave (Atlassian, GitLab), men uten dyp nesting:

- **initiative**: større produktleveranse eller område (nivå 1). Kan ha `work_order` (produkteiers arbeidsrekkefølge). Unntak fra rekkefølgen: P0-feil som kan påvirke kampdata, datalagring eller kritisk kampfunksjonalitet tas før neste reelle kamptest. `depends_on` på et initiativ vises i rekkefølgen (for eksempel WEB-01 etter ROADMAP-02).
- **feature**: funksjon eller utviklingsområde under et initiativ (nivå 2).
- **task / bug / chore**: konkret oppgave, feilretting eller vedlikehold (nivå 3). Forelder er et initiativ eller en funksjon, eller ingen: en liten retting trenger ikke kunstig hierarki.

`related`, `depends_on`, `superseded_by` og `aliases` (sammenslåtte ID-er) peker på andre ID-er; de tre første godtar også et alias. `parent` må være den kanoniske ID-en. ID-er gjenbrukes aldri. Gamle TODO-ID-er er beholdt uendret.

### Beslutning og status

To uavhengige felt som aldri skal motsi hverandre:

| `decision` (produktbeslutning) | Lovlige `status` (implementering) |
| :- | :- |
| `completed`: ferdig | `implemented`, `released` |
| `committed`: besluttet at vi gjør det | `not_started`, `in_progress`, `in_review`, `implemented`, `needs_verification` |
| `considering`: mulighet som vurderes | `not_started` |
| `deferred`: vurdert og bevisst parkert | `not_started` |
| `rejected`: vurdert og valgt bort | `not_started` |

- `released` betyr i produksjon. `dates.released` brukes bare når en deploy er dokumentert; ellers `dates.released_no_later_than` (commiten var med i en senere dokumentert deploy, se under).
- `implemented` uten `released`: ferdig på `main`, men produksjon er ikke bekreftet eller ikke relevant (prosess, dokumentasjon, tester).
- `needs_verification`: kan være løst eller levert, men det er ikke bekreftet.
- `verification` på ferdige oppføringer: `production` (dokumentert produksjonskontroll av selve funksjonen), `partial`, `none` eller `not_applicable`.
- **`considering` blir aldri `committed` uten dokumentert beslutning fra produkteier.** Claude og ChatGPT foreslår, men endrer ikke beslutningsstatus på egen hånd.

### Opprinnelse og kilder

`origin` skiller `documented_implementation` (rekonstruert fra git), `owner_decision`, `legacy_todo`, `user_feedback`, `competitor_finding` og `claude_proposal`. `sources` sier hvorfor oppføringen finnes og hva som dokumenterer at den er gjort: `commit`, `migration`, `doc`, `local_doc`, `legacy_todo` (`TODO.archive-2026-10-27.md#<ID>`), `review_patch`, `owner_decision`, `url`.

### Datoer og usikkerhet

Datoer kan være `YYYY`, `YYYY-MM` eller `YYYY-MM-DD`; bruk den minst presise formen som er dokumentert. `started` er første commit, `implemented` siste commit på `main` som fullførte arbeidet. Repoet har ingen PR-er eller tagger, så «merget til main» er commit-datoen. Ingen versjonsnumre er registrert fordi ingen er dokumentert. Alt som ikke kan bekreftes skrives i `uncertainty` eller i `missing_sources` øverst i filen; **ingen dato eller versjon diktes opp**.

Main er lineær, og den første dokumenterte produksjonsdeployen er `89e2afe` (2026-10-19). Commits før den har derfor `released_no_later_than: 2026-10-19` hvis funksjonen fortsatt finnes.

## Offentlig roadmap

Den offentlige tidslinjen på landingssiden (WEB-01e) er et kuratert utvalg fra samme fil, aldri en egen liste:

- Bare oppføringer med `public.visible: true`, og bare `completed` eller `committed` (validatoren nekter ideer).
- `public.no` og `public.en` har egen, ikke-teknisk tittel og tekst (validatoren avviser kode, stier, hasher og ID-er; et ord med bare bokstavene a–f på sju tegn eller mer kan gi falsk treff).
- ID-en følger med i det offentlige utvalget som stabil nøkkel (for lenker og React-nøkler), men skal ikke vises som tekst.
- `public.milestone: true` markerer store milepæler.
- `publicRoadmap(data, locale)` i `scripts/roadmap/lib.mjs` er referanseutvalget: `upcoming` (vedtatt, ikke ferdig, sortert etter `work_order`) og `shipped` (alt `completed`, nyeste først, med `dateKind` = `released` når deployen er dokumentert, ellers `built`; initiativer dateres når området startet, `dateKind` = `started`). Ingen kilder, prioriteter eller usikkerhet går ut. Se det med `npm run roadmap:public`.

## Arbeidsflyt

1. **Før planlegging:** søk etter eksisterende oppføring (ID, alias, tittel) før du lager en ny.
2. **Ny oppgave:** legg til en oppføring med neste ledige ID i området, `origin`, `decision` (`considering` for egne forslag) og minst én kilde.
3. **Underveis:** sett `status` (`in_progress`, `in_review`) og oppdater `updated`.
4. **Når arbeidet er gjort:** legg commit-hashen i `sources`, sett `dates.implemented`, og etter dokumentert deploy `status: released`, `decision: completed`, `dates.released` og `verification`. Skriv en linje i `changelog` når beslutning eller status endres av andre grunner enn vanlig fremdrift.
5. **Større lanseringer:** vurder `public` (synlighet, tekst på norsk og engelsk, milepæl), og om landingssiden bør oppdateres (WEB-01).
6. Kjør `npm run roadmap:render` og `npm run roadmap:check`.

### Kommandoer

```bash
npm run roadmap:check    # validerer roadmap.json og at ROADMAP.md er oppdatert
npm run roadmap:render   # genererer ROADMAP.md på nytt
npm run roadmap:public   # skriver det offentlige utvalget (norsk) som JSON
node --test scripts/roadmap/roadmap.node-test.mjs   # tester for validatoren
```

Valideringen sjekker struktur, lovlige verdier, unike ID-er og aliaser, at foreldre og referanser finnes, lovlig forelder per type, ingen sirkler (forelder og `depends_on`), lovlige kombinasjoner av beslutning og status, datoformat og rekkefølge, at `released` har en commit som kilde, at commits finnes i historikken, at dokumenter og migreringer finnes, og at offentlig tekst finnes på begge språk. CI (`.github/workflows/roadmap.yml`) kjører den samme sjekken når roadmap-filene endres.

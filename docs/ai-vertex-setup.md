# Vertex AI Setup Notes (Step 1)

Dette dokumentet beskriver grunnoppsett for FairPlayr sin AI-plattform med Vertex AI.

## Mål i steg 1

- All AI-kall skjer server-side.
- Ingen sluttbruker-API-nokler.
- Auth via Google Cloud Application Default Credentials (ADC).
- En intern AI-service i kode som senere features kan bruke.

## Miljovariabler

Sett disse variablene i runtime-miljo (alle tre er obligatoriske):

- `GOOGLE_CLOUD_PROJECT`: Google Cloud prosjekt-id.
- `VERTEX_AI_LOCATION`: Vertex AI lokasjon. Bruk `europe-west3` (Frankfurt), se «Region» under. Ikke `global` eller en region utenfor EU.
- `VERTEX_AI_MODEL`: modellnavn (f.eks. `gemini-2.5-flash`).
- `AI_HEALTHCHECK_TOKEN` (valgfri, men anbefalt i produksjon): token for intern helsesjekk-endepunkt.

Tips: bruk `.env.example` i repo som mal for lokal `.env.local`.

## Region (SEC-10)

AI-kall skal behandles i EU. Koden bruker bare `VERTEX_AI_LOCATION` og bytter aldri region: et mislykket kall gir reserveteksten, ikke et nytt forsøk i en annen region. SDK-en (`@google-cloud/vertexai`) bygger endepunktet `https://<location>-aiplatform.googleapis.com`.

Grunnlag (offisiell dokumentasjon, lest 2026-10-26):

- [Locations](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations): `gemini-2.5-flash` finnes i europe-west1/-west2/-west3/-west4/-west6/-west8/-west9, europe-north1, europe-central2, europe-southwest1 og EU-multiregionen `eu` (`https://aiplatform.eu.rep.googleapis.com`). «Endpoints don't guarantee data residency or in-region ML processing»; `global` skal ikke brukes med krav til ML-behandling.
- [Data residency](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency): forpliktelse om ML-behandling for `gemini-2.5-flash` (128k) finnes for EU-multiregionen, Frankrike (`europe-west9`), Tyskland (`europe-west3`) og Storbritannia (`europe-west2`, utenfor EU). Nederland (`europe-west4`) er ikke merket, og `europe-north1`/`europe-west1` står ikke i tabellen.

Valg: `europe-west3`. Det er en vanlig regional lokasjon som SDK-en håndterer uten kodeendring. EU-multiregionen `eu` trenger et eget `apiEndpoint` (`aiplatform.eu.rep.googleapis.com`), som koden ikke setter i dag.

## Tenkebudsjett (AI-QA-01)

Gemini 2.5 tenker som standard med dynamisk budsjett opptil 8 192 tokens, og tenkningen teller mot `maxOutputTokens` (2048 for oppsummeringene). Én av sju kall i AI-QA-01 ga et tomt svar. Oppsummeringene sender derfor `generationConfig.thinkingConfig.thinkingBudget = 512` (`SUMMARY_DEFAULTS` i `generateMatchSummary.ts`, `thinkingConfigFor` i `service.ts`), bare til `gemini-2.5-*`-modeller og innenfor modellens område.

Grunnlag ([Thinking](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/thinking), lest 2026-10-27): 2.5 Flash 1–24 576 (0 slår av), 2.5 Pro 128–32 768 (kan ikke slås av), 2.5 Flash-Lite 512–24 576; uten budsjett settes det dynamisk opptil 8 192. `@google-cloud/vertexai` 1.11 har ikke feltet i typene, men sender `generationConfig` uendret til API-et. SDK-en er utfaset; bytte til `@google/genai` er en egen oppgave (se TODO).

## API-er som ma vaere aktivert

- Vertex AI API (`aiplatform.googleapis.com`)

Google Cloud-forutsetninger som ma vaere pa plass:

- Prosjekt valgt
- Billing aktivert
- Vertex AI API aktivert

## IAM for runtime-servicekonto

For Cloud Run (eller tilsvarende) skal runtime-servicekonto ha minst mulig rettigheter.

Anbefalt minimum:

- `roles/aiplatform.user`

Hvis du trenger strengere kontroll, lag en custom role med kun nodvendige `aiplatform.*` permissions for generative kall.

Unnga brede primitive roller som `Editor`/`Owner`.

## Auth-modell (ADC)

FairPlayr bruker ADC for samme autentiseringsmuster lokalt og i produksjon:

- Lokalt: bruk Google ADC i utviklermiljo.
- Produksjon: Cloud Run servicekonto brukes automatisk av ADC.

Ingen service account JSON-filer skal committes til repo.

## Verifisering

Intern helsesjekk-endepunkt:

- `GET /api/internal/ai/health`

Behavior:

- I development er endpoint aapent for rask verifisering.
- I production krever endpoint header `x-ai-healthcheck-token` som matcher `AI_HEALTHCHECK_TOKEN`.

Eksempel:

```bash
curl -H "x-ai-healthcheck-token: <token>" https://<app-host>/api/internal/ai/health
```

Forventet resultat:

- `ok: true`
- returnerer aktiv modell/lokasjon/prosjekt
- returnerer en enkel testtekst fra Vertex AI

## Kodeoversikt

- `src/lib/server/ai/config.ts`: env-lesing og validering.
- `src/lib/server/ai/vertex.ts`: Vertex AI klient med singleton.
- `src/lib/server/ai/service.ts`: generisk `generateText(...)`.
- `src/lib/server/ai/errors.ts`: AI-spesifikke feiltyper.
- `src/app/api/internal/ai/health/route.ts`: intern verifisering.

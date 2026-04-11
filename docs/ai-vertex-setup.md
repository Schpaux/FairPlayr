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
- `VERTEX_AI_LOCATION`: Vertex AI lokasjon (f.eks. `global`).
- `VERTEX_AI_MODEL`: modellnavn (f.eks. `gemini-2.5-flash`).
- `AI_HEALTHCHECK_TOKEN` (valgfri, men anbefalt i produksjon): token for intern helsesjekk-endepunkt.

Tips: bruk `.env.example` i repo som mal for lokal `.env.local`.

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

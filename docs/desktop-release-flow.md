# Desktop release flow (GoodTrading Terminal / Tauri)

Guía mínima para publicar una nueva versión de la app desktop sin panel admin ni auto-updater firmado.

## Arquitectura

| Pieza | Rol |
|-------|-----|
| `client/public/desktop-update.json` | Manifest editable en el repo (fuente de verdad) |
| `GET /desktop-update.json` | Mismo JSON servido como estático en producción (`dist/public/`) |
| `GET /api/desktop/update` | Endpoint que consume la app desktop |

**Prioridad de configuración:**

1. **Env vars** explícitas (override de emergencia)
2. **Manifest** `desktop-update.json`
3. **Defaults** seguros (`0.1.0`, no mandatory)

Env vars soportadas:

- `DESKTOP_LATEST_VERSION`
- `DESKTOP_MIN_SUPPORTED_VERSION`
- `DESKTOP_UPDATE_MANDATORY` (`true` / `false`)
- `DESKTOP_UPDATE_DOWNLOAD_URL`
- `DESKTOP_UPDATE_RELEASE_NOTES` (JSON array, o texto separado por `\n` / `|`)
- `DESKTOP_UPDATE_PUBLISHED_AT`

## 1. Bump de versión

1. Actualizar versión en `src-tauri/tauri.conf.json` (`version`).
2. Opcional: alinear `package.json` si aplica.
3. El build web embebe la versión vía `vite.config.ts` → `__GOODTRADING_APP_VERSION__`.

## 2. Build desktop

```bash
npm run build:desktop
```

- `build:desktop:web` corre antes (Tauri `beforeBuildCommand`): Vite + server bundle con `VITE_PLATFORM=desktop`.
- Instalador NSIS típico:

```
src-tauri\target\release\bundle\nsis\GoodTrading Terminal_0.1.0_x64-setup.exe
```

(Ajustar `0.1.0` al número de versión actual.)

## 3. Subir instalador

Subir el `.exe` a una URL pública HTTPS (S3, GitHub Releases, CDN, etc.).

Ejemplo:

```
https://goodtrading.app/downloads/GoodTrading-Terminal-0.1.1-x64-setup.exe
```

## 4. Actualizar manifest

Editar `client/public/desktop-update.json`:

```json
{
  "latestVersion": "0.1.1",
  "minSupportedVersion": "0.1.0",
  "mandatory": false,
  "downloadUrl": "https://goodtrading.app/downloads/GoodTrading-Terminal-0.1.1-x64-setup.exe",
  "releaseNotes": [
    "Mejoras de estabilidad",
    "Nuevo sistema de diagnóstico"
  ],
  "publishedAt": "2026-06-11T12:00:00.000Z"
}
```

Campos:

| Campo | Descripción |
|-------|-------------|
| `latestVersion` | Última versión publicada |
| `minSupportedVersion` | Por debajo → update requerido |
| `mandatory` | `true` fuerza update requerido |
| `downloadUrl` | URL del instalador |
| `releaseNotes` | Array de strings (o un string con `\n` / `\|`) |
| `publishedAt` | ISO 8601 o `null` |

Deploy a Railway (o copiar JSON a `dist/public/` en el servidor).

URL pública esperada:

```
https://goodtrading.up.railway.app/desktop-update.json
```

## 5. Validar

### API (servidor)

```bash
curl https://goodtrading.up.railway.app/api/desktop/update
curl https://goodtrading.up.railway.app/desktop-update.json
```

Escenarios:

| Manifest | App `0.1.0` | Resultado esperado |
|----------|-------------|-------------------|
| `latestVersion: 0.1.0` | 0.1.0 | `up_to_date` |
| `latestVersion: 0.1.1`, `mandatory: false` | 0.1.0 | `optional_update` |
| `minSupportedVersion: 0.1.1`, `mandatory: true` | 0.1.0 | `required_update` |
| JSON inválido / ausente | 0.1.0 | Defaults, sin 500 |

### App desktop

1. Abrir GoodTrading Desktop.
2. Revisar modal de update (si aplica) o panel **System / Diagnostics**.
3. Logs en AppData: eventos `desktop_update_*`.

### Override por env (emergencia)

En Railway, setear por ejemplo:

```
DESKTOP_LATEST_VERSION=0.1.2
DESKTOP_UPDATE_MANDATORY=true
```

El endpoint ignora el manifest para esos campos mientras la env esté definida.

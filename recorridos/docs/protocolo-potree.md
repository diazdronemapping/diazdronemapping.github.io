# Protocolo Potree v2 — postMessage entre viewer Recorridos y potree-scene.html

**Estado:** cementado 2026-07-04 · **Piezas:** `viewer/js/engines/engine-potree.js` (padre) ↔ `potree-scene.html` (iframe).

El 3D de nube de puntos corre **aislado en un iframe** (`potree-scene.html`, Potree 1.8 con data formato 2.0). El engine del viewer lo orquesta exclusivamente por `postMessage`. `targetOrigin` es `'*'` en ambas direcciones: en producción (GitHub Pages) padre e iframe son mismo origen y los mensajes no llevan datos sensibles.

## URL del iframe (parámetros)

```
../potree-scene.html?cloud=<path>&controls=external&budget=<int>
```

| Param | Semántica | Default |
|---|---|---|
| `cloud` | Path al `metadata.json` de la nube. **Whitelist**: debe empezar con `/assets/_potree/clouds/` — si no cumple se usa el default y se registra `console.warn`. | `/assets/_potree/clouds/agua-blanca-veg/metadata.json` |
| `budget` | `pointBudget` inicial (entero, clamp 100 K – 10 M). El engine manda `pointBudgetMobile ?? 500000` en móvil y `pointBudget ?? 1500000` en desktop (del manifest). | `1500000` |
| `controls` | `external` = compat con el patrón v1 del deck. En v2 el canal de comandos está **siempre activo** y la UI in-viewer (toolbar de medición, densidad, color) **permanece visible** — el viewer Recorridos no duplica controles encima del iframe. | — |

## IFRAME → PADRE · `source: 'potree-state'`

### `ready`
```json
{ "source": "potree-state", "action": "ready" }
```
Se emite tras el callback de `Potree.loadPointCloud` + primer encuadre fallback.

**⚠ Idempotencia (regla central del protocolo):** `ready` **puede llegar más de una vez** por iframe. En el deploy con service worker (`/sw-octree.js`, chunks del octree en Pages) la página hace *reload-once* para que el SW controle el primer fetch → la página recargada vuelve a emitir `ready`. El padre debe **re-inicializar en cada `ready`**: re-enviar `setView` (última vista conocida, o `savedView ?? initialView` del manifest) y cualquier otro estado. Todos los comandos son idempotentes: aplicar dos veces la misma vista/presupuesto no tiene efecto acumulativo.

### `view`
```json
{ "source": "potree-state", "action": "view",
  "position": [565582.0, 2252690.0, 2405.0],
  "target":   [565582.0, 2252935.0, 2225.0] }
```
Coordenadas en el CRS de la nube (UTM 14N · metros). Se emite:
1. **Como respuesta** a un `getView` del padre.
2. **Espontáneo**, cuando la cámara cambia — hook a `viewer.addEventListener('update', …)` con firma de posición redondeada a cm, **throttled a ≤2 mensajes/s** (500 ms). Solo se emite después del primer `ready`.

El engine cachea el último `view` recibido y `engine.getView()` lo devuelve **síncrono** — así el TourController persiste la vista en `viewState` antes de cambiar de escena sin round-trip.

### `tool`
```json
{ "source": "potree-state", "action": "tool", "tool": "distance" }
{ "source": "potree-state", "action": "tool", "tool": null }
```
Al activar una herramienta de medición (por botón in-viewer o comando externo). `tool: null` = herramienta desactivada (Limpiar / stoptool). El engine lo re-emite al bus del controller como evento `potree-tool`.

## PADRE → IFRAME · `source: 'potree-ctrl'`

| Acción | Payload | Efecto en el iframe |
|---|---|---|
| `setView` | `{ "action":"setView", "position":[x,y,z], "target":[x,y,z] }` | `viewer.scene.view.position.set(x,y,z)` + `view.lookAt(x,y,z)` — **forma de 3 args**: `THREE` no es global en Potree 1.8 (vive dentro del IIFE), no hay `THREE.Vector3` disponible. Cancela los re-encuadres fallback internos. |
| `getView` | `{ "action":"getView" }` | Responde con un mensaje `view` (arriba). |
| `setBudget` | `{ "action":"setBudget", "value": 1500000 }` | `viewer.setPointBudget(n)` + sincroniza el slider de densidad. |
| `tool` | `{ "action":"tool", "tool":"distance"\|"area"\|"height"\|"point" }` | `measuringTool.startInsertion(preset)` con los presets de la toolbar (Distancia/Área/Altura/Punto) + abre su card de medición + emite `tool`. |
| `stoptool` | `{ "action":"stoptool" }` | Cancela la inserción en curso (`cancel_insertions`) y reanuda la navegación **sin borrar** mediciones. Emite `tool: null`. |
| `clear` | `{ "action":"clear" }` | Borra todas las mediciones y sus cards. Emite `tool: null`. |

### Extensiones (compat v1, opcionales)
| Acción | Payload | Efecto |
|---|---|---|
| `color` | `{ "action":"color", "value":"rgba"\|"rgb"\|"classification"\|"elevation" }` | Cambia `material.activeAttributeName`. `rgba`/`rgb` se traduce al atributo de color **detectado** en la nube (gotcha: el mismo octree se ha cargado con el atributo nombrado `rgba` o `rgb` según la ruta de carga — el iframe detecta cuál existe en `pointcloud.pcoGeometry.pointAttributes`). |
| `density` | `{ "action":"density", "value": n }` | Alias de `setBudget` (nombre v1 del deck). |

## Secuencia típica (handshake)

```
PADRE                                IFRAME
  │  crea <iframe src="…?cloud=…&budget=…">
  │                                    │ carga libs + Potree.loadPointCloud
  │                                    │ encuadre fallback (bbox)
  │◄─── { action:'ready' } ────────────┤
  ├─── { action:'setView', … } ───────►│  vista del manifest / savedView
  │                                    │ (usuario navega…)
  │◄─── { action:'view', … } ──────────┤  espontáneo, ≤2/s
  │                                    │
  │        [reload-once del SW en producción]
  │◄─── { action:'ready' } ────────────┤  ¡otra vez!
  ├─── { action:'setView', … } ───────►│  re-aplica última vista conocida
```

## Reglas del lado del engine (padre)

- **Iframe nuevo por nube — NUNCA reasignar `.src`** de un iframe ya insertado: cada asignación mete una entrada de historial en el top-level y rompe el botón Atrás del recorrido.
- Filtrar mensajes con `e.source === iframe.contentWindow && e.data.source === 'potree-state'`.
- `show()` resuelve al **primer** `ready` (timeout 90 s → reject con mensaje claro).
- **Keep-alive:** `hide()` no destruye el iframe en desktop (el octree descargado — cientos de MB — se conserva; volver a la escena es instantáneo). En móvil (`ctx.isMobile`) sí se remueve para liberar memoria y se recrea en el próximo `show()` con la `savedView` del controller.
- Registro del SW en el iframe: solo si `navigator.serviceWorker` existe **y** `fetch('/sw-octree.js')` responde OK — en local (server plano, sin SW) el 404 hace skip silencioso, sin loops de reload.

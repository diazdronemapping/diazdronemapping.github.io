# Guía del manifest.json — Recorridos

El `manifest.json` es el ÚNICO puente entre la autoría y el viewer: el Studio (Fase 1)
lo escribe, el viewer lo lee. Nada de escenas hardcodeadas. Contrato formal:
`schema/manifest.schema.json` (validar con `python -m jsonschema` o Ajv).

## Reglas de oro

1. **Ángulos en GRADOS** (yaw −180..360, pitch −90..90). El viewer convierte a lo que
   cada motor necesite.
2. **Paths**: relativos = dentro del bundle del tour (`tours/<id>/…`) · con `/` inicial =
   raíz del sitio (assets pesados compartidos: nubes Potree, ortho tiles). El export
   self-contained de Fase 1 empaqueta los relativos y declara los absolutos "por referencia".
3. **`id` estable en TODO** (escenas y hotspots): son la identidad para deep-links
   (`#scene=<id>`) y para el round-trip de edición del builder.
4. **Forward-compat**: el viewer IGNORA con warning cualquier `type` de escena/hotspot
   que no conozca. Añadir campos es seguro; cambiar semántica de campos existentes NO
   (eso exigiría subir `manifestVersion`).
5. **Voz de los textos visibles**: comercial accesible (ver memoria del proyecto) —
   sin jerga técnica interna, sin datos inventados: solo lo verificable del proyecto.

## Tipos de escena v1

| type | Motor | Campos clave |
|---|---|---|
| `pano360` | Photo Sphere Viewer | `src` equirect 2:1 · `initialView` · `northOffset` (grados vs plan-up; `null` = sin calibrar) · `hotspots` |
| `potree` | Potree 1.8 en iframe | `cloud.path` (whitelist `/assets/_potree/clouds/`) · `pointBudget[Mobile]` · `initialView {position,target}` UTM · `tools.measure` |
| `ortho` | Leaflet | `tiles {url,tms,minZoom,maxNativeZoom,clip}` · `layers` (`predio` con `trace`, `contours` con `toggle`) · `basemap` |
| `splat` | Fase 1.5 | `src: null` = placeholder "próximamente" |

## Tipos de hotspot v1 (en panos)

- `nav` — saltar a otra escena (`target`). Posición `{yaw,pitch}`.
- `info` — pin animado (`icon: "pulse"`) que abre el panel con `content {title, html, media}`.
- `link` — URL externa.
- `polygon` — "trazo de terrenos": `positions` = vértices `{yaw,pitch}` sobre la esfera,
  `style {stroke, fill}`, `content` al clic.

Reservados para v2 (el viewer v1 los ignora): `sticker`, `model3d`, `download`,
`audioZone`, `embed`, `beforeAfter`; escenas `video360` y campo `compare`.

## Autoría a mano (mientras llega el builder)

1. Sirve el repo (`python -m http.server 8123` en la raíz) y abre
   `viewer/?tour=<id>&debug=1`.
2. El HUD muestra yaw/pitch/fov en vivo. Clic en el pano → "copiar hotspot" pega la
   posición exacta. "copiar vista" → `initialView`.
3. northOffset: ver `docs/calibracion.md` (asistente de 2 pasos del HUD).
4. Valida: `python -c "import json,jsonschema; jsonschema.validate(json.load(open('tours/<id>/manifest.json')), json.load(open('schema/manifest.schema.json')))"`.

## Checklist para un tour nuevo

- [ ] Carpeta `tours/<slug>/` con `manifest.json` + `assets/{360,thumbs,plan,geo,brand,audio}`
- [ ] Panos equirect 2:1 (ideal ≥6000px de ancho; thumbnails 320px)
- [ ] `start.sceneId` existe · cadena de `nav` sin escenas huérfanas
- [ ] Planta norte-arriba si se quiere radar (+ pins + northOffset calibrados)
- [ ] Nube nueva: convertir a Potree 2.0, subir a `/assets/_potree/clouds/<slug>/` y
      **añadirla al mapa de `sw-octree.js`** del deploy si pesa >100 MB (chunks)
- [ ] Validar contra el schema antes de publicar

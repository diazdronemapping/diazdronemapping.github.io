# Studio — guía de autoría de recorridos

El **Studio** (`recorridos/builder/`) es la app donde armas los recorridos sin
tocar código: subes panos, colocas los puntos, dibujas el terreno y guardas.
Escribe el mismo `manifest.json` que el viewer sabe leer — lo que ves en el
Studio es exactamente lo que verá el cliente (usa los mismos motores).

## Requisito

**Chrome o Edge de escritorio.** El Studio lee y escribe la carpeta del
proyecto directo en tu disco (File System Access API); Firefox/Safari no lo
soportan todavía.

## Abrir el Studio

- Publicado: `https://presentacion.dronemapping.mx/recorridos/builder/`
- Local: sirve el repo y abre `…/recorridos/builder/`

## Flujo básico

1. **Nuevo recorrido** → eliges una carpeta padre; el Studio crea ahí la carpeta
   del proyecto con su estructura (`assets/360`, `thumbs`, `plan`, `geo`, …).
   O **Abrir recorrido** para editar uno existente.
2. **＋ Agregar panorama 360** → seleccionas la foto equirectangular (2:1). Se
   copia al proyecto y se genera su miniatura. Repite por cada escena.
3. En cada escena, con la barra de arriba:
   - **✋ Navegar** — mueve la cámara para encuadrar (sin editar).
   - **↗ Ir a…** — clic donde quieras un botón que salte a otra escena; en el
     panel derecho eliges la escena destino y la etiqueta.
   - **ⓘ Info** — clic para un punto de información (título + descripción).
   - **🔗 Enlace** — clic para un enlace externo.
   - **▱ Trazar terreno** — clic en cada esquina del predio; **✓ Cerrar trazo**
     para terminar (mínimo 3 esquinas).
4. **Panel derecho (inspector)** — edita lo seleccionado:
   - Sin selección → ajustes del recorrido (título, cliente, color, visibilidad).
   - Escena → título, **Capturar vista actual** (fija cómo abre la escena),
     **Norte** para el radar (ver abajo).
   - Hotspot → sus propiedades + **Reubicar** (clic en la nueva posición) + Eliminar.
5. **Escena de inicio** — la ★ en la lista de escenas.
6. **Guardar** — escribe `manifest.json` en la carpeta. El botón muestra "•"
   cuando hay cambios sin guardar.
7. **Previsualizar** — abre el recorrido en el viewer.

## Calibrar el norte (radar de la planta)

Los panos del dron normalmente no traen brújula, así que el norte se fija a mano
(convención "plan-up": el arriba de la planta = norte). En el inspector de la
escena: (1) centra la cámara sobre un rasgo que también veas en la planta,
(2) escribe el *bearing* de ese rasgo (grados desde arriba de la planta) y pulsa
**Fijar**. El Studio calcula `northOffset = bearing − yaw actual`. Detalle en
[`calibracion.md`](calibracion.md).

## Publicar

El Studio guarda en la carpeta local. Para que el recorrido quede en línea:
copia la carpeta del tour a `F:/dm-pages-build/recorridos/tours/<slug>/` y haz
`git push` (mismo mecanismo del viewer). Las **nubes de puntos** pesan mucho y
NO viven en la carpeta del tour: se suben una vez a
`/assets/_potree/clouds/<slug>/` del sitio y, si superan 100 MB, se agregan al
mapa de `sw-octree.js` (ver [`protocolo-potree.md`](protocolo-potree.md)).

## Qué se edita dónde

| Escena | En el Studio |
|---|---|
| Panorama 360 | Todo: hotspots por clic, vista inicial, norte, terreno |
| Mapa / ortofoto | Se previsualiza; propiedades (tiles) en el inspector |
| Nube de puntos | Se previsualiza; ruta de la nube en el inspector |
| Escena 3D (splat) | Cartel "próximamente" — el motor llega en fase posterior |

## Notas técnicas

- El Studio reutiliza los motores del viewer con `editMode:true` (ver
  `engine-pano360.js`): un clic sobre un hotspot lo abre en el inspector en vez
  de ejecutar su acción; la auto-rotación se apaga mientras editas.
- Guardado atómico (`createWritable` escribe a temporal y hace swap al cerrar) →
  nunca deja un `manifest.json` a medias.
- Autosave de borrador en `localStorage` (`dm_recorridos_builder_draft_v1`).
- Modo dev (`?dev=<ruta-al-tour>/`): carga un tour por HTTP para pruebas; el
  guardado descarga el `manifest.json` en vez de escribir a disco.

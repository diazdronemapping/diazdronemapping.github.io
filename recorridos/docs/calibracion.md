# Calibración de planta, pins y northOffset — Recorridos

## Qué calibra qué

| Dato del manifest | Efecto | Herramienta |
|---|---|---|
| `plan.pins[].position` `[x,y]` px | Dónde aparece cada escena en la planta | Editar manifest + refresh |
| `scene.northOffset` (grados) | Dirección del cono del radar | Debug HUD (`?debug=1`) |
| `hotspot.position` `{yaw,pitch}` | Dónde flota cada hotspot en el pano | Debug HUD → "copiar hotspot" |

## Convención de norte (IMPORTANTE)

Los panos de Santa María **no traen GPS ni brújula** (verificado en EXIF/XMP). Por eso la
referencia de calibración es **"plan-up"**: el borde superior de `assets/plan/planta.jpg`
se trata como norte (`plan.bearing = 0`). Los `northOffset` se calibran RELATIVOS a la
planta, no al norte geográfico — el radar queda coherente con lo que el usuario ve.
Si algún día se re-exporta la planta norte-arriba real, basta re-calibrar los offsets.

`northOffset: null` = escena sin calibrar → el radar degrada con gracia (pin activo sin cono).

## Procedimiento northOffset (2 pasos, con el debug HUD)

1. En la planta, elige un rasgo visible desde el pano (esquina de edificio, eje de calle).
   Mide su **bearing** desde el pin de la escena: ángulo desde plan-up, horario.
   `bearing = atan2(dx, -dy)` con `d = rasgo - pin` en px de la planta.
2. Abre el viewer con `?debug=1`, navega a la escena, **centra la cámara en ese rasgo**,
   escribe el bearing en el HUD y pulsa `→ northOffset`. Pega el valor en el manifest.
   Verificación inmediata: el cono del radar debe apuntar al rasgo en la planta.

Precisión esperada: ±5–10° (suficiente para un radar de orientación).

## Estado actual (2026-07-04)

- **pano-01 · CALIBRADO** (`northOffset: 220`): rasgo = eje del bulevar hacia el atardecer
  (yaw 0 del pano); bearing medido en planta desde el pin (753,289) hacia el tramo SW
  del bulevar ≈ 220°.
- **pano-02..04 · pendientes**: los pins están colocados por interpretación visual de la
  toma cenital `g-32` (fuente de la planta). El pin de pano-01 (crucero con puente
  peatonal) está verificado contra la vista nadir del propio pano; el cluster
  pano-02/05..10 (bodega e interiores) requiere verificación — la rotación entre las
  tomas de marketing (g-24/g-31) y la planta no permitió anclar la bodega sin ambigüedad.
- **pano-05..10 (interiores) · `null` a propósito**: dentro de la nave el radar aporta
  poco; se calibrarán si el cliente lo pide.

## Pendiente para el SOP de captura (futuro)

Pedir al dron panos con GPS + rumbo (XMP GPano `PoseHeadingDegrees`): con eso el builder
puede colocar pins y northOffset automáticamente y esta calibración manual desaparece.

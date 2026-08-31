# Ejercicio 02: Diseñar con Datos · Sismología Planetaria 3D

## Criterio de éxito

> Quiero hacer visible la actividad sísmica mundial y su origen geológico en tiempo real. Utilizo la magnitud, la profundidad focal y el tiempo transcurrido como datos; los transformo mediante el radio del prisma, su altura columnar vertical y una escala cromática de advertencia para representar la energía liberada, el impacto tectónico y la vigencia temporal de cada sismo.

## Mappings computacionales

| Input (dato) | Regla matemática de transformación | Output visual en Three.js |
| --- | --- | --- |
| Longitud y latitud (`coords[0]`, `coords[1]`) | `lon ∈ [-180, 180] → X ∈ [-18, 18]` y `lat ∈ [-90, 90] → Z ∈ [-18, 18]` mediante `THREE.MathUtils.mapLinear()` | Posición X/Z del prisma sobre la grilla de proyección planetaria. |
| Magnitud (`props.mag`) | `radio = Math.pow(mag, 1.4) * 0.35` | Radio del cilindro/prisma: los eventos más energéticos tienen mayor presencia horizontal. |
| Profundidad focal (`coords[2]`) | `altura = max(0.08, abs(profundidadKm) * escalaProfundidad)` | Altura vertical de la columna: expresa la profundidad focal con el control de escala del usuario. |
| Tiempo del evento (`props.time`) | `horas = (ahora - time) / 3_600_000`; color HSL interpolado de cian (`h = 0.53`) a rojo-naranja (`h = 0.03`) durante 24 h | Color y emisión del prisma: cian brillante para sismos de menos de 2 h y naranja/rojo apagado para los más antiguos. |

## Datos e interacción

La visualización consulta el [USGS GeoJSON Live Feed](https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson), que reúne los sismos registrados durante el último día. Los datos se solicitan al cargar la aplicación y luego mediante polling cada **60 segundos**. El botón **Actualizar ahora** permite solicitar el feed manualmente; **Pausar auto** detiene o reanuda el ciclo automático.

Cada prisma contiene su evento GeoJSON original en `userData`. Un `THREE.Raycaster` evalúa el clic sobre el canvas y actualiza el inspector con lugar, magnitud, profundidad, fecha/hora y estado de alerta de tsunami del sismo seleccionado.

## Visualización local

1. Abre esta carpeta en VS Code.
2. Inicia un servidor local, por ejemplo con la extensión **Live Server** sobre `index.html`.
3. Abre la dirección indicada por el servidor en un navegador con conexión a internet para consultar USGS.

## Publicación

La versión publicada mediante GitHub Pages se consulta en la ruta:

```text
/exercise-02/
```

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ======================================================
// 01 — CONFIGURACIÓN Y CONSTANTES
// ======================================================
const URL_USGS = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const URL_CONTINENTES = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_coastline.geojson";
const URL_PLACAS = "https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json";
const INTERVALO_ACTUALIZACION = 60;

const ANCHO_MAPA = 140;
const ALTO_MAPA = 70;

const parametros = {
  magMin: 2.5,
  escalaProfundidad: 0.08,
};

let actualizacionAutomatica = true;
let segundosRestantes = INTERVALO_ACTUALIZACION;
let sismosData = [];
let objetosSismos = [];
let sismosAnimados = [];

// ======================================================
// 02 — ESCENA, CÁMARA Y RENDERER
// ======================================================
const viewport = document.querySelector("#viewport");
const escena = new THREE.Scene();
escena.background = new THREE.Color(0x08090d);

const camara = new THREE.PerspectiveCamera(45, viewport.clientWidth / viewport.clientHeight, 0.1, 800);
camara.position.set(0, 85, 80);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);

const controlesOrbita = new OrbitControls(camara, renderer.domElement);
controlesOrbita.enableDamping = true;
controlesOrbita.dampingFactor = 0.05;
controlesOrbita.target.set(0, 0, 0);

escena.add(new THREE.HemisphereLight(0xddeeff, 0x181a20, 1.8));
const luz = new THREE.DirectionalLight(0xffffff, 2.4);
luz.position.set(30, 90, 40);
escena.add(luz);

// ======================================================
// 03 — BASE CARTOGRÁFICA Y PLACAS
// ======================================================
const grupoBase = new THREE.Group();
escena.add(grupoBase);

const planoGeom = new THREE.PlaneGeometry(ANCHO_MAPA, ALTO_MAPA);
const planoMat = new THREE.MeshStandardMaterial({ color: 0x0f131a, roughness: 0.85, metalness: 0.1 });
const planoTierra = new THREE.Mesh(planoGeom, planoMat);
planoTierra.rotation.x = -Math.PI / 2;
planoTierra.position.y = -0.05;
grupoBase.add(planoTierra);

const grilla = new THREE.GridHelper(ANCHO_MAPA, 24, 0x1f2736, 0x141a24);
grilla.position.y = 0.005;
grupoBase.add(grilla);

function geoACartesiano(lat, lon) {
  const x = (lon / 180) * (ANCHO_MAPA / 2);
  const z = -(lat / 90) * (ALTO_MAPA / 2);
  return { x, z };
}

async function cargarContinentes() {
  try {
    const res = await fetch(URL_CONTINENTES);
    if (!res.ok) return;
    const geojson = await res.json();
    const matContinente = new THREE.LineBasicMaterial({ color: 0x5a6578, transparent: true, opacity: 0.85 });

    geojson.features.forEach((feat) => {
      const geomType = feat.geometry.type;
      const coords = feat.geometry.coordinates;
      if (geomType === "LineString") trazarLineaVectorial(coords, matContinente, 0.02);
      else if (geomType === "MultiLineString" || geomType === "Polygon") coords.forEach((l) => trazarLineaVectorial(l, matContinente, 0.02));
      else if (geomType === "MultiPolygon") coords.forEach((p) => p.forEach((l) => trazarLineaVectorial(l, matContinente, 0.02)));
    });
  } catch (e) {
    console.warn("Error cargando continentes", e);
  }
}

async function cargarPlacasTectonicas() {
  try {
    const res = await fetch(URL_PLACAS);
    if (!res.ok) return;
    const geojson = await res.json();
    const matPlaca = new THREE.LineBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.5 });
    geojson.features.forEach((feat) => trazarLineaVectorial(feat.geometry.coordinates, matPlaca, 0.04));
  } catch (e) {
    console.warn("Error cargando placas", e);
  }
}

function trazarLineaVectorial(coordenadas, material, elevacionY) {
  const puntos = coordenadas.map(([lon, lat]) => {
    const p = geoACartesiano(lat, lon);
    return new THREE.Vector3(p.x, elevacionY, p.z);
  });
  if (puntos.length > 1) {
    const geom = new THREE.BufferGeometry().setFromPoints(puntos);
    grupoBase.add(new THREE.Line(geom, material));
  }
}

const grupoSismos = new THREE.Group();
escena.add(grupoSismos);

// ======================================================
// 04 — FETCH DE DATOS VIVOS (USGS)
// ======================================================
async function cargarDatosVivos() {
  actualizarEstadoConexion("conectando");
  try {
    const respuesta = await fetch(URL_USGS, { cache: "no-store" });
    if (!respuesta.ok) throw new Error("Error en la respuesta de USGS");
    const json = await respuesta.json();
    sismosData = json.features;

    actualizarEstadoConexion("vivo");
    document.querySelector("#actualizacion-label").textContent = new Date().toLocaleTimeString("es-CL");
    generarRepresentacion();
  } catch (error) {
    console.error("Error cargando USGS:", error);
    actualizarEstadoConexion("error");
  }
}

// ======================================================
// 05 — REGLAS DE MAPPING (OPCIÓN C: ESFERAS RESONANTES)
// ======================================================
function generarRepresentacion() {
  limpiarRepresentacion();
  sismosAnimados = [];

  const filtrados = sismosData.filter((s) => (s.properties.mag || 0) >= parametros.magMin);
  const ahora = Date.now();

  filtrados.forEach((sismo, idx) => {
    const coords = sismo.geometry.coordinates;
    const props = sismo.properties;

    const lon = coords[0];
    const lat = coords[1];
    const profundidad = coords[2] || 1;
    const mag = Math.max(0.5, props.mag || 1);

    const pos = geoACartesiano(lat, lon);

    // Mappings computacionales
    const radioEsfera = Math.max(0.35, Math.pow(mag, 1.25) * 0.28);
    const alturaSuspension = Math.max(0.8, profundidad * parametros.escalaProfundidad);
    const horas = (ahora - props.time) / (1000 * 60 * 60);

    // Escala cromática de tiempo (Cian reciente a Naranja/Rojo antiguo)
    const tono = THREE.MathUtils.lerp(0.52, 0.02, Math.min(horas / 24, 1));
    const esReciente = horas < 2;

    // 1. Onda / Anillo de choque en la superficie
    const geomAnillo = new THREE.RingGeometry(radioEsfera * 0.7, radioEsfera * 1.5, 24);
    const matAnillo = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(tono, 0.95, 0.6),
      transparent: true,
      opacity: esReciente ? 0.8 : 0.35,
      side: THREE.DoubleSide,
    });
    const anillo = new THREE.Mesh(geomAnillo, matAnillo);
    anillo.rotation.x = -Math.PI / 2;
    anillo.position.set(pos.x, 0.05, pos.z);
    grupoSismos.add(anillo);

    // 2. Línea de tensión entre el hipocentro del suelo y el núcleo
    const geomLinea = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(pos.x, 0.05, pos.z),
      new THREE.Vector3(pos.x, alturaSuspension, pos.z),
    ]);
    const matLinea = new THREE.LineBasicMaterial({
      color: new THREE.Color().setHSL(tono, 0.7, 0.45),
      transparent: true,
      opacity: 0.45,
    });
    grupoSismos.add(new THREE.Line(geomLinea, matLinea));

    // 3. Núcleo de Energía (Esfera suspendida)
    const geomEsfera = new THREE.SphereGeometry(radioEsfera, 24, 24);
    const matEsfera = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(tono, 0.95, esReciente ? 0.65 : 0.45),
      roughness: 0.15,
      metalness: 0.2,
      emissive: new THREE.Color().setHSL(tono, 0.95, esReciente ? 0.5 : 0.05),
    });

    const meshEsfera = new THREE.Mesh(geomEsfera, matEsfera);
    meshEsfera.position.set(pos.x, alturaSuspension, pos.z);
    meshEsfera.userData.sismo = { ...props, profundidad, lat, lon };
    meshEsfera.userData.offset = idx;

    grupoSismos.add(meshEsfera);
    objetosSismos.push(meshEsfera);
    sismosAnimados.push({ mesh: meshEsfera, anillo: anillo, esReciente, baseScale: 1 });
  });
}

function limpiarRepresentacion() {
  objetosSismos = [];
  while (grupoSismos.children.length > 0) {
    const obj = grupoSismos.children[0];
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
    grupoSismos.remove(obj);
  }
}

// ======================================================
// 06 — INTERACCIÓN Y RAYCASTING
// ======================================================
const raycaster = new THREE.Raycaster();
const puntero = new THREE.Vector2();

renderer.domElement.addEventListener("pointerdown", (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  puntero.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  puntero.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(puntero, camara);
  const intersecciones = raycaster.intersectObjects(objetosSismos, false);

  if (intersecciones.length > 0) {
    mostrarDetalle(intersecciones[0].object.userData.sismo);
  }
});

function mostrarDetalle(s) {
  document.querySelector("#sismo-lugar").textContent = s.place;
  document.querySelector("#m-mag").textContent = `${s.mag} Mw`;
  document.querySelector("#m-prof").textContent = `${s.profundidad.toFixed(1)} km`;
  document.querySelector("#m-hora").textContent = new Date(s.time).toLocaleTimeString("es-CL");
  document.querySelector("#m-tsunami").textContent = s.tsunami ? "SÍ" : "NO";
}

document.querySelector("#mag-min").addEventListener("input", (e) => {
  parametros.magMin = Number(e.target.value);
  document.querySelector("#mag-min-valor").value = parametros.magMin.toFixed(1);
  generarRepresentacion();
});

document.querySelector("#escala-prof").addEventListener("input", (e) => {
  parametros.escalaProfundidad = Number(e.target.value);
  document.querySelector("#escala-prof-valor").value = parametros.escalaProfundidad.toFixed(2);
  generarRepresentacion();
});

document.querySelector("#actualizar").addEventListener("click", () => {
  segundosRestantes = INTERVALO_ACTUALIZACION;
  cargarDatosVivos();
});

document.querySelector("#pausar").addEventListener("click", (e) => {
  actualizacionAutomatica = !actualizacionAutomatica;
  e.target.textContent = actualizacionAutomatica ? "Pausar auto" : "Reanudar auto";
});

function actualizarEstadoConexion(tipo) {
  const estado = document.querySelector("#estado-label");
  if (tipo === "vivo") estado.innerHTML = '<i class="status-dot"></i> conectado';
  else if (tipo === "error") estado.textContent = "error conexión";
  else estado.textContent = "conectando…";
}

// Polling
setInterval(() => {
  if (!actualizacionAutomatica) return;
  segundosRestantes -= 1;
  document.querySelector("#cuenta-regresiva").textContent = `${segundosRestantes} s`;
  if (segundosRestantes <= 0) {
    segundosRestantes = INTERVALO_ACTUALIZACION;
    cargarDatosVivos();
  }
}, 1000);

// ======================================================
// 07 — RENDER LOOP CON PULSACIÓN DINÁMICA
// ======================================================
function animar() {
  requestAnimationFrame(animar);
  controlesOrbita.update();

  const t = performance.now() * 0.005;
  sismosAnimados.forEach((item) => {
    if (item.esReciente) {
      // Palpitar de escala y luz en los núcleos recientes
      const pulso = Math.sin(t * 2.5 + item.mesh.userData.offset);
      const escala = 1 + pulso * 0.22;
      item.mesh.scale.setScalar(escala);

      // Expansión rítmica del anillo de choque
      const escalaAnillo = 1 + pulso * 0.4;
      item.anillo.scale.setScalar(escalaAnillo);
      item.anillo.material.opacity = 0.45 + pulso * 0.35;
    }
  });

  renderer.render(escena, camara);
}

window.addEventListener("resize", () => {
  camara.aspect = viewport.clientWidth / viewport.clientHeight;
  camara.updateProjectionMatrix();
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
});

cargarContinentes();
cargarPlacasTectonicas();
cargarDatosVivos();
animar();
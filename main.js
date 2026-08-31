import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const USGS_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const PLATES_URL = "https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json";
const R = 28;
const POLLING_MS = 60_000;

const viewport = document.querySelector("#viewport");
const magnitudInput = document.querySelector("#mag-min");
const profundidadInput = document.querySelector("#escala-prof");
const magnitudValor = document.querySelector("#mag-min-valor");
const profundidadValor = document.querySelector("#escala-prof-valor");
const actualizarBoton = document.querySelector("#refresh-now");
const pausarBoton = document.querySelector("#toggle-auto");
const ultimaActualizacion = document.querySelector("#last-update");
const proximaConsulta = document.querySelector("#cuenta-regresiva");
const emptyInspector = document.querySelector(".empty-state");
const eventDetails = document.querySelector(".event-details");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0b0c);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 250);
camera.position.set(0, 19, 67);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;
controls.minDistance = 34;
controls.maxDistance = 115;

scene.add(new THREE.HemisphereLight(0x8bdceb, 0x0b0b0c, 1.65));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(35, 42, 28);
scene.add(keyLight);

const globe = new THREE.Mesh(
  new THREE.SphereGeometry(R, 96, 64),
  new THREE.MeshStandardMaterial({ color: 0x12141a, roughness: 0.85, metalness: 0.08 })
);
scene.add(globe);

const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(28.6, 96, 64),
  new THREE.MeshBasicMaterial({ color: 0x54dce9, transparent: true, opacity: 0.12, side: THREE.BackSide, depthWrite: false })
);
scene.add(atmosphere);

const plateGroup = new THREE.Group();
const earthquakeGroup = new THREE.Group();
scene.add(plateGroup, earthquakeGroup);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const normalY = new THREE.Vector3(0, 1, 0);
const normalZ = new THREE.Vector3(0, 0, 1);
let eventos = [];
let pausaAutomatica = false;
let proximaConsultaMs = Date.now() + POLLING_MS;
let cargando = false;
let seleccionado = null;

function geoAPunto(lat, lon, radio = R) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radio * Math.sin(phi) * Math.cos(theta),
    radio * Math.cos(phi),
    radio * Math.sin(phi) * Math.sin(theta)
  );
}

function colorPorEdad(horas) {
  const progreso = THREE.MathUtils.clamp((horas - 2) / 10, 0, 1);
  return new THREE.Color().setHSL(THREE.MathUtils.lerp(0.52, 0.035, progreso), 1, THREE.MathUtils.lerp(0.56, 0.46, progreso));
}

function crearLinea(coordenadas) {
  if (!Array.isArray(coordenadas) || coordenadas.length < 2) return;
  const puntos = coordenadas.map(([lon, lat]) => geoAPunto(lat, lon, R + 0.09));
  const geometry = new THREE.BufferGeometry().setFromPoints(puntos);
  const material = new THREE.LineBasicMaterial({ color: 0xff7043, transparent: true, opacity: 0.45, depthWrite: false });
  plateGroup.add(new THREE.Line(geometry, material));
}

function extraerLineas(geometria) {
  if (!geometria) return [];
  if (geometria.type === "LineString") return [geometria.coordinates];
  if (geometria.type === "MultiLineString") return geometria.coordinates;
  if (geometria.type === "Polygon") return geometria.coordinates;
  if (geometria.type === "MultiPolygon") return geometria.coordinates.flat();
  return [];
}

function limpiarPlacas() {
  plateGroup.clear();
}

function trazarReticulaFallback() {
  for (let lat = -60; lat <= 60; lat += 30) {
    const linea = [];
    for (let lon = -180; lon <= 180; lon += 3) linea.push([lon, lat]);
    crearLinea(linea);
  }
  for (let lon = -150; lon < 180; lon += 30) {
    const linea = [];
    for (let lat = -90; lat <= 90; lat += 3) linea.push([lon, lat]);
    crearLinea(linea);
  }
}

async function cargarPlacas() {
  try {
    const response = await fetch(PLATES_URL);
    if (!response.ok) throw new Error(`Placas: ${response.status}`);
    const data = await response.json();
    const features = data.features ?? [{ geometry: data }];
    features.forEach((feature) => extraerLineas(feature.geometry).forEach(crearLinea));
  } catch (error) {
    console.warn("No se pudieron cargar las placas tectónicas; se muestra una retícula de respaldo.", error);
    limpiarPlacas();
    trazarReticulaFallback();
  }
}

function limpiarSismos() {
  while (earthquakeGroup.children.length) {
    const item = earthquakeGroup.children.pop();
    item.traverse((child) => {
      child.geometry?.dispose();
      child.material?.dispose();
    });
  }
  seleccionado = null;
}

function crearSismo(evento) {
  const { properties, geometry } = evento;
  const [lon, lat, profundidadKm = 0] = geometry.coordinates;
  const magnitud = Number(properties.mag);
  if (!Number.isFinite(magnitud) || magnitud < Number(magnitudInput.value)) return;

  const normal = geoAPunto(lat, lon).normalize();
  const radio = Math.pow(Math.max(magnitud, 0.1), 1.3) * 0.22;
  const altura = Math.max(0.08, Math.abs(profundidadKm) * Number(profundidadInput.value));
  const edadHoras = Math.max(0, (Date.now() - properties.time) / 3_600_000);
  const color = colorPorEdad(edadHoras);
  const grupo = new THREE.Group();
  grupo.userData.evento = evento;
  grupo.userData.color = color.clone();

  const base = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(radio * 1.45, 0.18), 20),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
  );
  base.position.copy(normal).multiplyScalar(R + 0.11);
  base.quaternion.setFromUnitVectors(normalZ, normal);
  base.userData.eventGroup = grupo;

  const prisma = new THREE.Mesh(
    new THREE.CylinderGeometry(radio, radio * 0.72, altura, 12),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: edadHoras < 2 ? 1.25 : 0.25,
      roughness: 0.38,
      metalness: 0.08,
    })
  );
  prisma.position.copy(normal).multiplyScalar(R + altura / 2 + 0.12);
  prisma.quaternion.setFromUnitVectors(normalY, normal);
  prisma.userData.eventGroup = grupo;
  prisma.userData.emissiveIntensity = edadHoras < 2 ? 1.25 : 0.25;
  grupo.add(base, prisma);
  earthquakeGroup.add(grupo);
}

function renderizarSismos() {
  limpiarSismos();
  eventos.forEach(crearSismo);
}

function formatoHora(timestamp) {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

function seleccionarSismo(grupo) {
  if (seleccionado?.userData.prisma) {
    const material = seleccionado.userData.prisma.material;
    material.color.copy(seleccionado.userData.color);
    material.emissive.copy(seleccionado.userData.color);
    material.emissiveIntensity = seleccionado.userData.prisma.userData.emissiveIntensity;
  }
  seleccionado = grupo;
  const prisma = grupo.children.find((child) => child.userData.eventGroup === grupo);
  grupo.userData.prisma = prisma;
  prisma.material.color.set(0xffffff);
  prisma.material.emissive.set(0xffffff);
  prisma.material.emissiveIntensity = 1.6;

  const { properties, geometry } = grupo.userData.evento;
  emptyInspector.hidden = true;
  eventDetails.hidden = false;
  document.querySelector("#sismo-lugar").textContent = properties.place || "Sin ubicación";
  document.querySelector("#m-mag").textContent = Number(properties.mag).toFixed(1);
  document.querySelector("#m-prof").textContent = `${(geometry.coordinates[2] ?? 0).toFixed(1)} km`;
  document.querySelector("#m-hora").textContent = formatoHora(properties.time);
  document.querySelector("#m-tsunami").textContent = properties.tsunami ? "Sí" : "No";
}

function actualizarCuentaRegresiva() {
  if (pausaAutomatica) {
    proximaConsulta.textContent = "Pausada";
    return;
  }
  proximaConsulta.textContent = `${Math.max(0, Math.ceil((proximaConsultaMs - Date.now()) / 1000))} s`;
}

export async function cargarDatosVivos() {
  if (cargando) return;
  cargando = true;
  actualizarBoton.disabled = true;
  document.querySelector("#fuente-label").textContent = "USGS Earthquakes";
  try {
    const response = await fetch(USGS_URL);
    if (!response.ok) throw new Error(`USGS: ${response.status}`);
    eventos = (await response.json()).features ?? [];
    renderizarSismos();
    ultimaActualizacion.textContent = formatoHora(Date.now());
    proximaConsultaMs = Date.now() + POLLING_MS;
  } catch (error) {
    console.error("No fue posible cargar el feed de USGS.", error);
    ultimaActualizacion.textContent = "Error de conexión";
  } finally {
    cargando = false;
    actualizarBoton.disabled = false;
    actualizarCuentaRegresiva();
  }
}

function obtenerInterseccion(event) {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(earthquakeGroup.children, true)[0];
}

magnitudInput.addEventListener("input", () => {
  magnitudValor.textContent = Number(magnitudInput.value).toFixed(1);
  renderizarSismos();
});
profundidadInput.addEventListener("input", () => {
  profundidadValor.textContent = Number(profundidadInput.value).toFixed(2);
  renderizarSismos();
});
actualizarBoton.addEventListener("click", cargarDatosVivos);
pausarBoton.addEventListener("click", () => {
  pausaAutomatica = !pausaAutomatica;
  pausarBoton.textContent = pausaAutomatica ? "Reanudar auto" : "Pausar auto";
  if (!pausaAutomatica) proximaConsultaMs = Date.now() + POLLING_MS;
  actualizarCuentaRegresiva();
});

renderer.domElement.addEventListener("pointermove", (event) => {
  renderer.domElement.style.cursor = obtenerInterseccion(event) ? "pointer" : "grab";
});
renderer.domElement.addEventListener("pointerdown", (event) => {
  const hit = obtenerInterseccion(event);
  if (hit) seleccionarSismo(hit.object.userData.eventGroup);
});
window.addEventListener("resize", () => {
  camera.aspect = viewport.clientWidth / viewport.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
});

setInterval(() => {
  actualizarCuentaRegresiva();
  if (!pausaAutomatica && Date.now() >= proximaConsultaMs) cargarDatosVivos();
}, 1_000);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

cargarPlacas();
cargarDatosVivos();
actualizarCuentaRegresiva();
animate();

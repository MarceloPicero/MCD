import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const valoresIniciales = { origenX: 0, origenZ: 0, frecuencia: 1.2, amortiguacion: 0.16, velocidad: 1.2, columnas: 21, filas: 21 };
const parametros = { ...valoresIniciales };
let tiempo = 0;
let enMovimiento = true;

const viewport = document.querySelector("#viewport");
const escena = new THREE.Scene();
escena.background = new THREE.Color(0x0b0b0c);
const camara = new THREE.PerspectiveCamera(42, viewport.clientWidth / viewport.clientHeight, 0.1, 200);
camara.position.set(18, 16, 18);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);

const controlesOrbita = new OrbitControls(camara, renderer.domElement);
controlesOrbita.enableDamping = true;
controlesOrbita.target.set(0, 1.4, 0);
escena.add(new THREE.HemisphereLight(0xf3efe5, 0x202229, 1.8));
const luz = new THREE.DirectionalLight(0xffffff, 3.2);
luz.position.set(8, 14, 9);
luz.castShadow = true;
escena.add(luz);
const suelo = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 1 }));
suelo.rotation.x = -Math.PI / 2;
suelo.receiveShadow = true;
escena.add(suelo);
const grilla = new THREE.GridHelper(50, 50, 0x35383d, 0x202227);
grilla.position.y = 0.002;
escena.add(grilla);

const grupoCampo = new THREE.Group();
escena.add(grupoCampo);
const geometriaModulo = new THREE.BoxGeometry(0.72, 1, 0.72);
const modulos = [];
const origen = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xff8c42, emissiveIntensity: 1.8 }));
origen.position.y = 0.33;
escena.add(origen);

function valorOnda(x, z) {
  const distancia = Math.hypot(x - parametros.origenX, z - parametros.origenZ);
  const fase = distancia * parametros.frecuencia - tiempo * parametros.velocidad;
  return { distancia, onda: Math.sin(fase) * Math.exp(-distancia * parametros.amortiguacion) };
}

function crearCampo() {
  while (grupoCampo.children.length) grupoCampo.remove(grupoCampo.children[0]);
  modulos.length = 0;
  const separacion = 0.9;
  const ancho = (parametros.columnas - 1) * separacion;
  const profundidad = (parametros.filas - 1) * separacion;
  for (let columna = 0; columna < parametros.columnas; columna++) {
    for (let fila = 0; fila < parametros.filas; fila++) {
      const x = columna * separacion - ancho / 2;
      const z = fila * separacion - profundidad / 2;
      const modulo = new THREE.Mesh(geometriaModulo, new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 }));
      modulo.castShadow = true;
      modulo.receiveShadow = true;
      modulo.userData = { x, z };
      grupoCampo.add(modulo);
      modulos.push(modulo);
    }
  }
  actualizarCampo();
}

function actualizarCampo() {
  origen.position.set(parametros.origenX, 0.33, parametros.origenZ);
  modulos.forEach((modulo) => {
    const { x, z } = modulo.userData;
    const { distancia, onda } = valorOnda(x, z);
    const altura = Math.max(0.12, 0.65 + onda * 4.2);
    const intensidad = Math.min(1, Math.abs(onda) * 1.7 + Math.exp(-distancia * 0.75) * 0.25);
    const color = onda >= 0 ? new THREE.Color().setHSL(0.08, 0.8, 0.25 + intensidad * 0.42) : new THREE.Color().setHSL(0.56, 0.72, 0.18 + intensidad * 0.38);
    modulo.scale.y = altura;
    modulo.position.set(x, altura / 2, z);
    modulo.material.color.copy(color);
    modulo.material.emissive.copy(color).multiplyScalar(intensidad * 0.16);
  });
}

const controles = Object.fromEntries(Object.keys(parametros).map((nombre) => [nombre, document.querySelector(`#${nombre}`)]));
const valoresVisibles = Object.fromEntries(Object.keys(parametros).map((nombre) => [nombre, document.querySelector(`#${nombre}-valor`)]));
const enteros = new Set(["columnas", "filas"]);
function actualizarParametro(nombre, valor) {
  parametros[nombre] = enteros.has(nombre) ? Number.parseInt(valor, 10) : Number.parseFloat(valor);
  valoresVisibles[nombre].value = enteros.has(nombre) ? parametros[nombre] : parametros[nombre].toFixed(2);
  if (enteros.has(nombre)) crearCampo(); else actualizarCampo();
}
Object.entries(controles).forEach(([nombre, control]) => control.addEventListener("input", (evento) => actualizarParametro(nombre, evento.target.value)));
document.querySelector("#pausar").addEventListener("click", (evento) => {
  enMovimiento = !enMovimiento;
  evento.currentTarget.textContent = enMovimiento ? "Pausar" : "Reanudar";
});
document.querySelector("#restablecer").addEventListener("click", () => {
  Object.assign(parametros, valoresIniciales);
  tiempo = 0;
  Object.entries(controles).forEach(([nombre, control]) => {
    control.value = parametros[nombre];
    valoresVisibles[nombre].value = enteros.has(nombre) ? parametros[nombre] : parametros[nombre].toFixed(2);
  });
  crearCampo();
});
function animar() {
  requestAnimationFrame(animar);
  if (enMovimiento) tiempo += 0.016;
  actualizarCampo();
  controlesOrbita.update();
  renderer.render(escena, camara);
}
window.addEventListener("resize", () => {
  camara.aspect = viewport.clientWidth / viewport.clientHeight;
  camara.updateProjectionMatrix();
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
});
crearCampo();
animar();

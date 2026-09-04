import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);
camera.position.set(0, 0, 16);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

let particles;
let geometry;
let posicionesBase;
let categorias;
let parametros;

async function init() {
  try {
    const response = await fetch('./data/datos_sensoriales.json');

    if (!response.ok) {
      throw new Error(`No se pudieron cargar los datos: ${response.status}`);
    }

    const datos = await response.json();
    const factores = datos.factores_desregulacion;
    const sonido = factores.sonido.impacto_porcentaje;
    const luz = factores.luz.impacto_porcentaje;
    const tactil = factores.tactil_espacial.impacto_porcentaje;

    parametros = { sonido, luz, tactil };
    crearGUI(sonido, luz, tactil);
    crearParticulas(sonido, luz, tactil);
    animate();
  } catch (error) {
    console.error('Error al inicializar la visualizacion:', error);
  }
}

function crearGUI(maxSonido, maxLuz, maxTactil) {
  const gui = new GUI({ title: 'Estrategias de Contenci\u00f3n' });
  gui.add(parametros, 'sonido', 0, maxSonido, 1).name('Sobrecarga Sonora');
  gui.add(parametros, 'luz', 0, maxLuz, 1).name('Sobrecarga Lum\u00ednica');
  gui.add(parametros, 'tactil', 0, maxTactil, 1).name('Sobrecarga T\u00e1ctil');
}

function crearParticulas(impactoSonido, impactoLuz, impactoTactil) {
  const cantidadPorCategoria = Math.max(
    1000,
    Math.round((impactoSonido + impactoLuz + impactoTactil) * 20),
  );
  const cantidadTotal = cantidadPorCategoria * 3;
  const posiciones = new Float32Array(cantidadTotal * 3);
  const colores = new Float32Array(cantidadTotal * 3);
  const dispersion = 7;
  const colorSonido = new THREE.Color(0x2d8cff);
  const colorLuz = new THREE.Color(0xffdf3f);
  const colorTactil = new THREE.Color(0xff3b4f);

  posicionesBase = new Float32Array(cantidadTotal * 3);
  categorias = new Uint8Array(cantidadTotal);

  for (let i = 0; i < cantidadTotal; i += 1) {
    const indice = i * 3;
    const categoria = Math.floor(i / cantidadPorCategoria);
    const color = categoria === 0
      ? colorSonido
      : categoria === 1
        ? colorLuz
        : colorTactil;

    posiciones[indice] = (Math.random() - 0.5) * dispersion * 2;
    posiciones[indice + 1] = (Math.random() - 0.5) * dispersion * 1.2;
    posiciones[indice + 2] = (Math.random() - 0.5) * dispersion;
    posicionesBase[indice] = posiciones[indice];
    posicionesBase[indice + 1] = posiciones[indice + 1];
    posicionesBase[indice + 2] = posiciones[indice + 2];
    categorias[i] = categoria;
    colores[indice] = color.r;
    colores[indice + 1] = color.g;
    colores[indice + 2] = color.b;
  }

  geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colores, 3));

  const material = new THREE.PointsMaterial({
    size: 0.08,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  particles = new THREE.Points(geometry, material);
  scene.add(particles);
}

function animate() {
  requestAnimationFrame(animate);

  if (particles && parametros) {
    const posiciones = geometry.attributes.position.array;

    for (let i = 0; i < categorias.length; i += 1) {
      const indice = i * 3;
      const sobrecarga = categorias[i] === 0
        ? parametros.sonido
        : categorias[i] === 1
          ? parametros.luz
          : parametros.tactil;
      const intensidad = (sobrecarga / 100) * 0.12;

      posiciones[indice] = posicionesBase[indice] + (Math.random() - 0.5) * intensidad;
      posiciones[indice + 1] = posicionesBase[indice + 1] + (Math.random() - 0.5) * intensidad;
      posiciones[indice + 2] = posicionesBase[indice + 2] + (Math.random() - 0.5) * intensidad;
    }

    geometry.attributes.position.needsUpdate = true;
  }

  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

init();

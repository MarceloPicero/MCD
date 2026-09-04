import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const container = document.getElementById('canvas-container');
const sliderSonido = document.getElementById('slider-sonido');
const sliderLuz = document.getElementById('slider-luz');
const sliderTactil = document.getElementById('slider-tactil');

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

let geometry;
let basePositions;
let categories;
const particlesPerCategory = 1000;

async function init() {
  try {
    const response = await fetch('./data/datos_sensoriales.json');

    if (!response.ok) {
      throw new Error(`No se pudieron cargar los datos: ${response.status}`);
    }

    const datos = await response.json();
    const factores = datos.factores_desregulacion;
    const impactoSonido = factores.sonido.impacto_porcentaje;
    const impactoLuz = factores.luz.impacto_porcentaje;
    const impactoTactil = factores.tactil_espacial.impacto_porcentaje;

    sliderSonido.max = impactoSonido;
    sliderLuz.max = impactoLuz;
    sliderTactil.max = impactoTactil;
    sliderSonido.value = 0;
    sliderLuz.value = 0;
    sliderTactil.value = 0;

    crearParticulas();
    configurarSliders();
    animate();
  } catch (error) {
    console.error('Error al inicializar la visualizacion:', error);
  }
}

function crearParticulas() {
  const totalParticles = particlesPerCategory * 3;
  const positions = new Float32Array(totalParticles * 3);
  const colors = new Float32Array(totalParticles * 3);
  const volumenAula = { ancho: 14, alto: 8, profundidad: 8 };
  const colorSonido = new THREE.Color(0x2d8cff);
  const colorLuz = new THREE.Color(0xffdf3f);
  const colorTactil = new THREE.Color(0xff3b4f);

  basePositions = new Float32Array(totalParticles * 3);
  categories = new Uint8Array(totalParticles);

  for (let i = 0; i < totalParticles; i += 1) {
    const indice = i * 3;
    const categoria = Math.floor(i / particlesPerCategory);
    const color = categoria === 0
      ? colorSonido
      : categoria === 1
        ? colorLuz
        : colorTactil;

    basePositions[indice] = (Math.random() - 0.5) * volumenAula.ancho;
    basePositions[indice + 1] = (Math.random() - 0.5) * volumenAula.alto;
    basePositions[indice + 2] = (Math.random() - 0.5) * volumenAula.profundidad;
    positions[indice] = basePositions[indice];
    positions[indice + 1] = 999999;
    positions[indice + 2] = basePositions[indice + 2];
    categories[i] = categoria;
    colors[indice] = color.r;
    colors[indice + 1] = color.g;
    colors[indice + 2] = color.b;
  }

  geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.08,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  scene.add(new THREE.Points(geometry, material));
}

function updateParticles() {
  if (!geometry) return;

  const positions = geometry.attributes.position.array;
  const valores = [
    { value: Number(sliderSonido.value), max: Number(sliderSonido.max) },
    { value: Number(sliderLuz.value), max: Number(sliderLuz.max) },
    { value: Number(sliderTactil.value), max: Number(sliderTactil.max) },
  ];

  for (let i = 0; i < categories.length; i += 1) {
    const indice = i * 3;
    const categoria = categories[i];
    const indiceCategoria = i % particlesPerCategory;
    const { value, max } = valores[categoria];
    const porcentajeActivo = max > 0 ? value / max : 0;
    const limiteActivo = particlesPerCategory * porcentajeActivo;

    if (indiceCategoria < limiteActivo) {
      const turbulencia = porcentajeActivo * 0.14;
      positions[indice] = basePositions[indice] + (Math.random() - 0.5) * turbulencia;
      positions[indice + 1] = basePositions[indice + 1] + (Math.random() - 0.5) * turbulencia;
      positions[indice + 2] = basePositions[indice + 2] + (Math.random() - 0.5) * turbulencia;
    } else {
      positions[indice] = basePositions[indice];
      positions[indice + 1] = 999999;
      positions[indice + 2] = basePositions[indice + 2];
    }
  }

  geometry.attributes.position.needsUpdate = true;
}

function configurarSliders() {
  [sliderSonido, sliderLuz, sliderTactil].forEach((slider) => {
    slider.addEventListener('input', updateParticles);
  });
}

function animate() {
  requestAnimationFrame(animate);
  updateParticles();
  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

init();

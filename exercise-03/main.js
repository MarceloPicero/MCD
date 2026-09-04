import * as THREE from 'three';

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);
camera.position.set(0, 0, 16);

let particles;
let datosSensoriales;
let velocidadTurbulencia = 0.05;

async function init() {
  try {
    const response = await fetch('./data/datos_sensoriales.json');

    if (!response.ok) {
      throw new Error(`No se pudieron cargar los datos: ${response.status}`);
    }

    datosSensoriales = await response.json();
    crearParticulas(datosSensoriales.factores_desregulacion);
    configurarBotones();
    animate();
  } catch (error) {
    console.error('Error al inicializar la visualización:', error);
  }
}

function crearParticulas(factores) {
  const impactoSonido = factores.sonido.impacto_porcentaje;
  const impactoLuz = factores.luz.impacto_porcentaje;
  const impactoTactil = factores.tactil_espacial.impacto_porcentaje;
  const cantidadParticulas = impactoSonido * 50;
  const dispersion = 5 + impactoTactil / 20;
  const posiciones = new Float32Array(cantidadParticulas * 3);

  for (let i = 0; i < cantidadParticulas; i += 1) {
    const indice = i * 3;
    posiciones[indice] = (Math.random() - 0.5) * dispersion * 2;
    posiciones[indice + 1] = (Math.random() - 0.5) * dispersion * 1.2;
    posiciones[indice + 2] = (Math.random() - 0.5) * dispersion;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));

  const color = new THREE.Color().setHSL(0.62 - impactoLuz / 500, 0.85, 0.65);
  const material = new THREE.PointsMaterial({
    color,
    size: 0.07,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  particles = new THREE.Points(geometry, material);
  scene.add(particles);
}

function configurarBotones() {
  const botones = {
    'btn-acustica': 'estrategia_acustica',
    'btn-luz': 'estrategia_luminica',
    'btn-tactil': 'estrategia_tactil',
  };

  Object.entries(botones).forEach(([buttonId, estrategiaId]) => {
    document.getElementById(buttonId).addEventListener('click', () => {
      const estrategia = datosSensoriales.estrategias_contencion.find(
        ({ id }) => id === estrategiaId,
      );

      if (estrategia) {
        const factorRestante = 1 - estrategia.efectividad_porcentaje / 100;
        velocidadTurbulencia *= factorRestante;
      }
    });
  });
}

function animate() {
  requestAnimationFrame(animate);

  if (particles) {
    particles.rotation.y += velocidadTurbulencia;
    particles.rotation.x += velocidadTurbulencia * 0.35;
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

init();

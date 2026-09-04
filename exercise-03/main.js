import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const container = document.getElementById('canvas-container');
const sliderSonido = document.getElementById('slider-sonido');
const sliderLuz = document.getElementById('slider-luz');
const sliderTactil = document.getElementById('slider-tactil');
const relojHora = document.getElementById('reloj-hora');
const relojActividad = document.getElementById('reloj-actividad');
const btnPlay = document.getElementById('btn-play-simulacion');
const btnReset = document.getElementById('btn-reset-simulacion');

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

let sysSonido;
let sysLuz;
let sysTactil;
let baseSonido;
let baseLuz;
let baseTactil;
let cronograma = [];
let simulacionActiva = false;
let tiempoActualMinutos = 8 * 60;
let indiceCronograma = 0;
const particlesPerCategory = 1000;

const luzAmbiente = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(luzAmbiente);
const luzDirecta = new THREE.DirectionalLight(0xffffff, 0.8);
luzDirecta.position.set(10, 20, 15);
scene.add(luzDirecta);

const volumenAula = { ancho: 14, alto: 8, profundidad: 8 };

async function init() {
  try {
    const response = await fetch('./data/datos_sensoriales.json');

    if (!response.ok) {
      throw new Error(`No se pudieron cargar los datos: ${response.status}`);
    }

    const datos = await response.json();
    cronograma = datos.cronograma_curricular || [];
    const factores = datos.factores_desregulacion;
    const impactoSonido = factores.sonido.impacto_porcentaje;
    const impactoLuz = factores.luz.impacto_porcentaje;
    const impactoTactil = factores.tactil_espacial.impacto_porcentaje;

    // Configuramos el máximo de los sliders según la data
    sliderSonido.max = impactoSonido;
    sliderLuz.max = impactoLuz;
    sliderTactil.max = impactoTactil;
    
    // CORRECCIÓN: Inicializamos los sliders en su valor máximo para visualizar el estado de desregulación base
    sliderSonido.value = impactoSonido;
    sliderLuz.value = impactoLuz;
    sliderTactil.value = impactoTactil;

    const loader = new GLTFLoader();
    loader.load('./assets/sala.glb', function (gltf) {
      const modeloSala = gltf.scene;

      // Apoyar el modelo en la base del volumen de partículas
      modeloSala.position.y = -(volumenAula.alto / 2);

      // Girar el modelo 90 grados para adaptarlo a la orientación del volumen
      modeloSala.rotation.y = Math.PI / 2;

      // Escalar el modelo proporcionalmente.
      modeloSala.scale.set(6, 6, 6);

      scene.add(modeloSala);
    }, undefined, function (error) {
      console.error('Error al cargar el modelo 3D de la sala:', error);
    });

    crearParticulas();
    configurarSliders();
    configurarSimulacion();
    formatearHora(tiempoActualMinutos);
    actualizarActividadActual();
    animate();
  } catch (error) {
    console.error('Error al inicializar la visualizacion:', error);
  }
}

function crearParticulas() {
  const totalParticles = particlesPerCategory * 3;
  const positions = new Float32Array(totalParticles * 3);
  const colors = new Float32Array(totalParticles * 3);
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
    positions[indice + 1] = basePositions[indice + 1]; // Corregido: inician en su posición real, no ocultas
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
    size: 0.45,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    map: crearTexturaCirculo(),
    alphaTest: 0.5,
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
      const expansion = 1.0 + (porcentajeActivo * 0.8);
      const turbulencia = porcentajeActivo * 0.6;

      positions[indice] = (basePositions[indice] * expansion)
        + (Math.random() - 0.5) * turbulencia;
      positions[indice + 1] = (basePositions[indice + 1] * expansion)
        + (Math.random() - 0.5) * turbulencia;
      positions[indice + 2] = (basePositions[indice + 2] * expansion)
        + (Math.random() - 0.5) * turbulencia;
    } else {
      // Si la partícula excede el valor del slider, se oculta simulando contención
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

function configurarSimulacion() {
  btnPlay.addEventListener('click', () => {
    simulacionActiva = !simulacionActiva;
    btnPlay.textContent = simulacionActiva
      ? 'PAUSAR SIMULACI\u00d3N'
      : 'INICIAR SIMULACI\u00d3N';
  });

  btnReset.addEventListener('click', () => {
    simulacionActiva = false;
    btnPlay.textContent = 'INICIAR';
    tiempoActualMinutos = 8 * 60;
    sliderSonido.value = 0;
    sliderLuz.value = 0;
    sliderTactil.value = 0;
    relojHora.innerText = '08:00';
    relojActividad.innerText = 'Llegada y Saludo';
    updateParticles();
  });
}

function formatearHora(minutosTotales) {
  const horas = Math.floor(minutosTotales / 60);
  const minutos = Math.floor(minutosTotales % 60);
  const horaFormateada = `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;

  relojHora.textContent = horaFormateada;
  return horaFormateada;
}

function actualizarActividadActual() {
  if (cronograma.length === 0) return;

  const indiceEncontrado = cronograma.reduce((indiceActual, entrada, indice) => {
    const [horas, minutos] = entrada.hora.split(':').map(Number);
    return horas * 60 + minutos <= tiempoActualMinutos ? indice : indiceActual;
  }, 0);

  indiceCronograma = indiceEncontrado;
  relojActividad.textContent = cronograma[indiceCronograma].actividad;
}

function actualizarSimulacion() {
  if (!simulacionActiva || cronograma.length === 0) return;

  tiempoActualMinutos += 0.5;

  if (tiempoActualMinutos > 13 * 60) {
    tiempoActualMinutos = 8 * 60;
  }

  formatearHora(tiempoActualMinutos);
  actualizarActividadActual();

  const niveles = cronograma[indiceCronograma].niveles;
  sliderSonido.value = THREE.MathUtils.lerp(
    Number(sliderSonido.value),
    niveles.sonido,
    0.25,
  );
  sliderLuz.value = THREE.MathUtils.lerp(
    Number(sliderLuz.value), niveles.luz, 0.25,
  );
  sliderTactil.value = THREE.MathUtils.lerp(
    Number(sliderTactil.value), niveles.tactil, 0.25,
  );
}

function animate() {
  requestAnimationFrame(animate);
  actualizarSimulacion();
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

function crearTexturaCirculo() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');

  context.beginPath();
  context.arc(32, 32, 28, 0, Math.PI * 2, false);
  context.fillStyle = '#ffffff';
  context.fill();

  return new THREE.CanvasTexture(canvas);
}

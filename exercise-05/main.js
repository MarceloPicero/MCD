import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const container = document.getElementById('canvas-container');
const sliderSonido = document.getElementById('slider-sonido');
const sliderLuz = document.getElementById('slider-luz');
const sliderTactil = document.getElementById('slider-tactil');

const valSonido = document.getElementById('val-sonido');
const valLuz = document.getElementById('val-luz');
const valTactil = document.getElementById('val-tactil');

const mSonido = document.getElementById('m-sonido');
const mLuz = document.getElementById('m-luz');
const mTactil = document.getElementById('m-tactil');
const barSonido = document.getElementById('bar-sonido');
const barLuz = document.getElementById('bar-luz');
const barTactil = document.getElementById('bar-tactil');
const statusText = document.getElementById('status-text');

const relojHora = document.getElementById('reloj-hora');
const relojActividad = document.getElementById('reloj-actividad');
const btnPlay = document.getElementById('btn-play-simulacion');
const btnReset = document.getElementById('btn-reset-simulacion');
const btnSensores = document.getElementById('btn-sensores');

const scene = new THREE.Scene();

const aspect = (window.innerWidth - 380) / window.innerHeight;
const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
camera.position.set(0, 5, 20);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

let sysSonido, sysLuz, sysTactil;
let baseSonido, baseLuz, baseTactil;

let cronograma = [];
let simulacionActiva = false;
let sensoresActivos = false;
let tiempoActualMinutos = 8 * 60;
let indiceCronograma = 0;
const particlesPerCategory = 1000;

// Variables para captura de sensores en tiempo real
let audioAnalyser = null;
let audioContext = null;
let videoElement = null;
let videoCanvas = null;
let videoCtx = null;

const luzAmbiente = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(luzAmbiente);
const luzDirecta = new THREE.DirectionalLight(0xffffff, 0.8);
luzDirecta.position.set(10, 20, 15);
scene.add(luzDirecta);

const volumenAula = { ancho: 14, alto: 8, profundidad: 8 };

async function init() {
  try {
    const response = await fetch('./data/datos_sensoriales.json');
    if (!response.ok) throw new Error(`No se pudieron cargar los datos: ${response.status}`);

    const datos = await response.json();
    cronograma = datos.cronograma_curricular || [];

    sliderSonido.max = 90; sliderSonido.min = 30;
    sliderLuz.max = 1000; sliderLuz.min = 100;
    sliderTactil.max = 10; sliderTactil.min = 0;

    actualizarMetricasHUD();

    const loader = new GLTFLoader();
    loader.load('./assets/sala.glb', function (gltf) {
      const modeloSala = gltf.scene;
      modeloSala.position.y = -(volumenAula.alto / 2);
      modeloSala.rotation.y = Math.PI / 2;
      modeloSala.scale.set(6, 6, 6);
      scene.add(modeloSala);
    });

    crearParticulas();
    configurarSliders();
    configurarSimulacion();
    configurarSensores();
    formatearHora(tiempoActualMinutos);
    animate();
  } catch (error) {
    console.error('Error al inicializar:', error);
  }
}

// Inicializar hardware de Microfono y Camara
async function configurarSensores() {
  btnSensores.addEventListener('click', async () => {
    try {
      // 1. Activar Micrófono
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(audioStream);
      audioAnalyser = audioContext.createAnalyser();
      audioAnalyser.fftSize = 256;
      source.connect(audioAnalyser);

      // 2. Activar Cámara Web
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoElement = document.createElement('video');
      videoElement.srcObject = videoStream;
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      await videoElement.play();

      videoCanvas = document.createElement('canvas');
      videoCanvas.width = 64;
      videoCanvas.height = 64;
      videoCtx = videoCanvas.getContext('2d');

      sensoresActivos = true;
      btnSensores.textContent = "SENSORES EN VIVO ACTIVOS";
      btnSensores.style.background = "#2d8cff";
      relojActividad.textContent = "Monitoreando Entorno Físico (Mic/Cam)";
    } catch (e) {
      alert("No se pudieron activar los permisos de cámara o micrófono.");
      console.error(e);
    }
  });
}

function obtenerDatosSensoresEnVivo() {
  if (!sensoresActivos) return null;

  // Medir Audio (Micrófono) -> Decibeles simulados (30 a 90 dB)
  let dbValue = Number(sliderSonido.value);
  if (audioAnalyser) {
    const dataArray = new Uint8Array(audioAnalyser.frequencyBinCount);
    audioAnalyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
    let avg = sum / dataArray.length;
    dbValue = 30 + (avg / 255) * 60; // Mapeo gradual
  }

  // Medir Luz (Cámara) -> Lux simulados (100 a 1000 Lux)
  let luxValue = Number(sliderLuz.value);
  if (videoElement && videoCtx && videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
    videoCtx.drawImage(videoElement, 0, 0, 64, 64);
    const frame = videoCtx.getImageData(0, 0, 64, 64);
    let colorSum = 0;
    for (let i = 0; i < frame.data.length; i += 4) {
      const r = frame.data[i];
      const g = frame.data[i+1];
      const b = frame.data[i+2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b; // Luminancia perceptual
      colorSum += lum;
    }
    const avgLum = colorSum / (frame.data.length / 4);
    luxValue = 100 + (avgLum / 255) * 900; // Mapeo gradual
  }

  return { sonido: dbValue, luz: luxValue };
}

function crearTexturaCirculo() {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const context = canvas.getContext('2d');
  context.beginPath();
  context.arc(32, 32, 28, 0, Math.PI * 2, false);
  context.fillStyle = '#ffffff';
  context.fill();
  return new THREE.CanvasTexture(canvas);
}

function crearGrupoParticulas(colorHex) {
  const positions = new Float32Array(particlesPerCategory * 3);
  const basePos = new Float32Array(particlesPerCategory * 3);
  const colors = new Float32Array(particlesPerCategory * 3);
  const color = new THREE.Color(colorHex);

  for (let i = 0; i < particlesPerCategory; i++) {
    const indice = i * 3;
    basePos[indice] = (Math.random() - 0.5) * volumenAula.ancho;
    basePos[indice + 1] = (Math.random() - 0.5) * volumenAula.alto;
    basePos[indice + 2] = (Math.random() - 0.5) * volumenAula.profundidad;

    positions[indice] = basePos[indice];
    positions[indice + 1] = basePos[indice + 1];
    positions[indice + 2] = basePos[indice + 2];

    colors[indice] = color.r;
    colors[indice + 1] = color.g;
    colors[indice + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
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
    alphaTest: 0.5
  });

  const mesh = new THREE.Points(geometry, material);
  scene.add(mesh);
  return { mesh, basePos };
}

function crearParticulas() {
  const volSonido = crearGrupoParticulas(0x2d8cff);
  sysSonido = volSonido.mesh; baseSonido = volSonido.basePos;

  const volLuz = crearGrupoParticulas(0xffdf3f);
  sysLuz = volLuz.mesh; baseLuz = volLuz.basePos;

  const volTactil = crearGrupoParticulas(0xff3b4f);
  sysTactil = volTactil.mesh; baseTactil = volTactil.basePos;
}

function actualizarMetricasHUD() {
  const sVal = Number(sliderSonido.value);
  const lVal = Number(sliderLuz.value);
  const tVal = Number(sliderTactil.value);

  valSonido.textContent = Math.round(sVal);
  valLuz.textContent = Math.round(lVal);
  valTactil.textContent = tVal.toFixed(1);

  mSonido.textContent = Math.round(sVal);
  mLuz.textContent = Math.round(lVal);
  mTactil.textContent = tVal.toFixed(1);

  barSonido.style.width = `${((sVal - 30) / 60) * 100}%`;
  barLuz.style.width = `${((lVal - 100) / 900) * 100}%`;
  barTactil.style.width = `${(tVal / 10) * 100}%`;

  if (sVal > 65 || lVal > 500 || tVal > 4.0) {
    statusText.textContent = "ALERTA: SOBRECARGA CRÍTICA";
    statusText.className = "quadrant-metric status-danger";
  } else {
    statusText.textContent = "ESTADO: CONFORT REGULADO";
    statusText.className = "quadrant-metric status-safe";
  }
}

function moverGrupo(sys, base, slider, time, tipoFactor) {
  const positions = sys.geometry.attributes.position.array;
  const value = Number(slider.value);
  const max = Number(slider.max);
  const min = Number(slider.min || 0);
  const porcentajeActivo = (max - min) > 0 ? (value - min) / (max - min) : 0;

  let velocidad = time * (0.5 + porcentajeActivo * 4.0);
  let amplitud = 0.05 + (porcentajeActivo * 2.5);

  if (tipoFactor === 'tactil') {
    velocidad = time * (2.0 + porcentajeActivo * 12.0); 
    amplitud = 0.02 + (porcentajeActivo * 1.5); 
  }

  const expansion = 1.0 + (porcentajeActivo * 0.8);

  for (let i = 0; i < particlesPerCategory; i++) {
    const indice = i * 3;
    const noiseX = tipoFactor === 'tactil' ? Math.sin(time * 50 + i) * (porcentajeActivo * 0.2) : (Math.random() - 0.5) * (porcentajeActivo * 0.6);
    const noiseY = tipoFactor === 'tactil' ? Math.cos(time * 50 + i) * (porcentajeActivo * 0.2) : (Math.random() - 0.5) * (porcentajeActivo * 0.6);
    const noiseZ = tipoFactor === 'tactil' ? Math.sin(time * 40 + i) * (porcentajeActivo * 0.2) : (Math.random() - 0.5) * (porcentajeActivo * 0.6);

    const offsetX = Math.sin(velocidad + i * 1.1) * amplitud + noiseX;
    const offsetY = Math.cos(velocidad + i * 1.3) * amplitud + noiseY;
    const offsetZ = Math.sin(velocidad + i * 1.5) * amplitud + noiseZ;

    positions[indice] = (base[indice] * expansion) + offsetX;
    positions[indice + 1] = (base[indice + 1] * expansion) + offsetY;
    positions[indice + 2] = (base[indice + 2] * expansion) + offsetZ;
  }
  sys.geometry.attributes.position.needsUpdate = true;
}

function updateParticles() {
  if (!sysSonido) return;

  // Si los sensores en vivo están activos, capturamos y actualizamos los valores de forma gradual
  if (sensoresActivos) {
    const datosVivo = obtenerDatosSensoresEnVivo();
    if (datosVivo) {
      // Interpolación suave gradual (LERP) para evitar saltos bruscos en las partículas
      sliderSonido.value = THREE.MathUtils.lerp(Number(sliderSonido.value), datosVivo.sonido, 0.1);
      sliderLuz.value = THREE.MathUtils.lerp(Number(sliderLuz.value), datosVivo.luz, 0.1);
    }
  }

  const time = performance.now() * 0.001;
  moverGrupo(sysSonido, baseSonido, sliderSonido, time, 'sonido');
  moverGrupo(sysLuz, baseLuz, sliderLuz, time, 'luz');
  moverGrupo(sysTactil, baseTactil, sliderTactil, time, 'tactil');
  actualizarMetricasHUD();
}

function configurarSliders() {
  sliderSonido.addEventListener('input', updateParticles);
  sliderLuz.addEventListener('input', updateParticles);
  sliderTactil.addEventListener('input', updateParticles);
}

function configurarSimulacion() {
  btnPlay.addEventListener('click', () => {
    simulacionActiva = !simulacionActiva;
    btnPlay.textContent = simulacionActiva ? 'PAUSAR' : 'INICIAR RELOJ';
  });

  btnReset.addEventListener('click', () => {
    simulacionActiva = false;
    btnPlay.textContent = 'INICIAR RELOJ';
    tiempoActualMinutos = 8 * 60;
    sliderSonido.value = 40;
    sliderLuz.value = 300;
    sliderTactil.value = 0.0;
    relojHora.innerText = '08:00';
    relojActividad.innerText = sensoresActivos ? "Monitoreando Entorno Físico" : "Modo Manual / Simulación";
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

function actualizarSimulacion() {
  if (!simulacionActiva || cronograma.length === 0 || sensoresActivos) return;

  tiempoActualMinutos += 0.5;
  if (tiempoActualMinutos > 13 * 60) tiempoActualMinutos = 8 * 60;

  formatearHora(tiempoActualMinutos);
  
  const indiceEncontrado = cronograma.reduce((indiceActual, entrada, indice) => {
    const [horas, minutos] = entrada.hora.split(':').map(Number);
    return horas * 60 + minutos <= tiempoActualMinutos ? indice : indiceActual;
  }, 0);
  relojActividad.textContent = cronograma[indiceEncontrado].actividad;

  const niveles = cronograma[indiceEncontrado].niveles;
  const targetSonido = 30 + (niveles.sonido / 100) * 60;
  const targetLuz = 100 + (niveles.luz / 100) * 900;
  const targetTactil = (niveles.tactil / 100) * 10;

  sliderSonido.value = THREE.MathUtils.lerp(Number(sliderSonido.value), targetSonido, 0.05);
  sliderLuz.value = THREE.MathUtils.lerp(Number(sliderLuz.value), targetLuz, 0.05);
  sliderTactil.value = THREE.MathUtils.lerp(Number(sliderTactil.value), targetTactil, 0.05);
}

function animate() {
  requestAnimationFrame(animate);
  actualizarSimulacion();
  updateParticles();
  controls.update();

  if (!sysSonido) return; 

  const leftOffset = 380; 
  const w = window.innerWidth - leftOffset;
  const h = window.innerHeight;
  const halfW = w / 2;
  const halfH = h / 2;

  renderer.setScissorTest(true);

  renderer.setViewport(leftOffset, halfH, halfW, halfH);
  renderer.setScissor(leftOffset, halfH, halfW, halfH);
  sysSonido.visible = true; sysLuz.visible = false; sysTactil.visible = false;
  renderer.render(scene, camera);

  renderer.setViewport(leftOffset + halfW, halfH, halfW, halfH);
  renderer.setScissor(leftOffset + halfW, halfH, halfW, halfH);
  sysSonido.visible = false; sysLuz.visible = true; sysTactil.visible = false;
  renderer.render(scene, camera);

  renderer.setViewport(leftOffset, 0, halfW, halfH);
  renderer.setScissor(leftOffset, 0, halfW, halfH);
  sysSonido.visible = false; sysLuz.visible = false; sysTactil.visible = true;
  renderer.render(scene, camera);

  renderer.setViewport(leftOffset + halfW, 0, halfW, halfH);
  renderer.setScissor(leftOffset + halfW, 0, halfW, halfH);
  sysSonido.visible = true; sysLuz.visible = true; sysTactil.visible = true;
  renderer.render(scene, camera);

  renderer.setScissorTest(false);
}

window.addEventListener('resize', () => {
  camera.aspect = (window.innerWidth - 380) / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

init();
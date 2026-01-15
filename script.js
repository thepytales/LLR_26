import * as THREE from "https://esm.sh/three@0.160.0";
import { OrbitControls } from "https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "https://esm.sh/three@0.160.0/examples/jsm/loaders/OBJLoader.js";
import { DRACOLoader } from "https://esm.sh/three@0.160.0/examples/jsm/loaders/DRACOLoader.js";

// === 1. Setup & Settings ===
window.app = {}; 

const GLOBAL_SCALE = 0.6; 
const FURNITURE_Y_OFFSET = 0.22; 

// Settings
let settings = {
    controlsEnabled: true, 
    mouseSensitivity: 1.0,
    reducedMotion: false,
    fontScale: 1.0
};

// Input State für flüssige Bewegung
const inputState = {
    fwd: false, bwd: false, left: false, right: false,
    zoomIn: false, zoomOut: false 
};

// === ASSETS ===
const ASSETS = {
  rooms: {
    // Standard LLR (50qm) - Basiswerte
    "raummodell_leer.glb": { 
        data: null, playableArea: { x: 4.4, z: 4.3 }, area: 50, name: "LLR Standard",
        acousticTargets: { warn: 0.25, good: 0.45 } 
    },
    // Möbliert (50qm) - Basiswerte
    "LLR_möbliert(50qm).obj": { 
        data: null, playableArea: { x: 4.5, z: 4.5 }, area: 50, type: 'obj', name: "LLR Möbliert",
        acousticTargets: { warn: 0.25, good: 0.45 } 
    },
    // Großer Raum (70qm) - Etwas toleranter, da große Räume mehr Luftvolumen haben
    "leer_70qm.glb": { 
        data: null, playableArea: { x: 5.5, z: 5.5 }, area: 70, name: "Großer Raum",
        acousticTargets: { warn: 0.20, good: 0.40 } 
    },
    // Kleiner Raum (30qm) - Strenger, da Dichte höher sein muss gegen Echos
    "leer_30qm.glb": { 
        data: null, playableArea: { x: 3.5, z: 3.5 }, area: 30, name: "Kleiner Raum",
        acousticTargets: { warn: 0.35, good: 0.60 } 
    },
  },
  furniture: {
    'row_combo': { file: 'Tischplusstuhleinzeln.glb', dims: {x: 0.8, z: 1.2}, radius: 0.5, seats: 1, name: "Tisch+Stuhl", acousticBonus: 2.0 },
    'tano':      { file: 'trapezTisch.glb',           dims: {x: 1.2, z: 0.7}, radius: 0.5, seats: 1, name: "Trapeztisch", acousticBonus: 1.5 },
    'triangle':  { file: 'dreiecksTisch.glb',         dims: {x: 1.0, z: 0.9}, radius: 0.5, seats: 1, name: "Dreieckstisch", acousticBonus: 1.5 },
    'chair':     { file: 'roterStuhl.glb',            dims: {x: 0.5, z: 0.5}, radius: 0.3, seats: 1, name: "Stuhl", acousticBonus: 0.8 },
    'teacher':   { file: 'Lehrertisch.glb',           dims: {x: 1.6, z: 0.8}, radius: 0.7, seats: 0, name: "Lehrerpult", acousticBonus: 2.5 },
    'cupboard':  { file: 'runderSchrank.glb',         dims: {x: 1.2, z: 0.4}, radius: 0.6, seats: 0, name: "Regal", acousticBonus: 3.5 },
    'board':     { file: 'tafel_skaliert.glb',        dims: {x: 2.0, z: 0.2}, radius: 0.2, seats: 0, isWallItem: true, name: "Tafel", acousticBonus: 1.0 },
    
    'k1': { file: 'Tischaufstellung1.glb',    dims: {x: 1.6, z: 1.2}, radius: 0.9, seats: 2, name: "2er Ecktisch", acousticBonus: 4.0 }, 
    'k2': { file: 'Tischaufstellung2.glb',    dims: {x: 1.6, z: 1.4}, radius: 1.0, seats: 2, name: "2er Vis-a-Vis", acousticBonus: 4.0 },
    'k3': { file: 'Tischaufstellung3.glb',    dims: {x: 3.2, z: 1.6}, radius: 1.6, seats: 8, name: "8er Gruppentisch", acousticBonus: 16.0 },
    'k4': { file: 'Tischkonstellation4.glb',  dims: {x: 3.5, z: 3.5}, radius: 1.7, seats: 8, name: "8er Kreis", acousticBonus: 16.0 },
    'k5': { file: 'Tischkonstellation5.glb',  dims: {x: 2.2, z: 2.2}, radius: 1.2, seats: 4, name: "4er Ecktisch", acousticBonus: 8.0 },
    'k6': { file: 'Tischkonstellation6.glb',  dims: {x: 3.0, z: 2.0}, radius: 1.5, seats: 6, name: "6er Gruppentisch", acousticBonus: 12.0 }, 
    'k7': { file: 'Tischkonstellation7.glb',  dims: {x: 4.0, z: 3.0}, radius: 2.0, seats: 11, name: "11er U-Form", acousticBonus: 22.0 },
    'k8': { file: 'Tischkonstellation8.glb',  dims: {x: 3.5, z: 3.0}, radius: 1.8, seats: 9, name: "9er U-Form", acousticBonus: 18.0 },
  },
};

let scene, camera, renderer, controls;
let currentRoomMesh = null;
let currentRoomFile = ""; 
let currentRoomLimits = { x: 5, z: 5 }; 
let movableObjects = [];
let interactionMeshes = [];
let selectedObjects = []; 
let selectedRoot = null;
let selectionBox = null; 
let historyStack = []; 

let isVisionMode = false;
let visionMarker = null;
let visionRadiusMesh = null;
let currentVisionSeverity = 'blind'; 

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const dragOffset = new THREE.Vector3();
let isDragging = false;

const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();
const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
gltfLoader.setDRACOLoader(draco);

// === INIT ===
function init() {
  try {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1e1e1e); 

      camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
      camera.position.set(0, 16, 0.1); 

      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: "default" });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = false; 
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      document.body.appendChild(renderer.domElement);

      const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.9);
      scene.add(hemiLight);
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(5, 15, 5);
      scene.add(dirLight);
      
      const gridHelper = new THREE.GridHelper(30, 30, 0x444444, 0x333333);
      gridHelper.position.y = -0.05;
      scene.add(gridHelper);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.maxPolarAngle = Math.PI / 2 - 0.05;
      controls.minDistance = 2;
      controls.maxDistance = 60;
      controls.listenToKeyEvents(window); 

      window.addEventListener("resize", onWindowResize);
      renderer.domElement.addEventListener("mousedown", onMouseDown);
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      
      selectionBox = new THREE.BoxHelper(new THREE.Mesh(), 0x007acc); 
      selectionBox.visible = false;
      scene.add(selectionBox);

      const sel = document.getElementById('room-select');
      if(sel) sel.addEventListener('change', (e) => app.switchRoom(e.target.value));
      
      const ctrlCheck = document.getElementById('set-controls');
      if(ctrlCheck) ctrlCheck.checked = settings.controlsEnabled;

      startApp();
      
      app.updateSettings();
      setupOnScreenControls();

  } catch (err) {
      console.error("Critical Init Error:", err);
      alert("Fehler bei der Initialisierung: " + err.message);
  }
}

function startApp() {
    toggleLoader(true, "Lade Raum...");
    animate();
    loadRoomAsset("raummodell_leer.glb")
        .then((model) => {
            setupRoom(model, "raummodell_leer.glb");
        })
        .finally(() => toggleLoader(false));
}

// === ON-SCREEN CONTROLS SETUP ===
function setupOnScreenControls() {
    // Zoom/Kippen ausblenden
    const extraControls = document.querySelector('.extra-controls');
    if(extraControls) extraControls.style.display = 'none';

    // Reset Button ausblenden
    const resetBtn = document.querySelector('.btn-center');
    if(resetBtn) resetBtn.style.display = 'none';

    // Hilfsfunktion zum Binden von Events
    const bindBtn = (selector, stateKey) => {
        const el = document.querySelector(selector);
        if(!el) return;
        el.onclick = null; 
        
        el.addEventListener('mousedown', (e) => { e.preventDefault(); inputState[stateKey] = true; });
        el.addEventListener('touchstart', (e) => { e.preventDefault(); inputState[stateKey] = true; }, {passive: false});
        el.addEventListener('touchend', (e) => { e.preventDefault(); inputState[stateKey] = false; });
    };

    const clearInputs = () => Object.keys(inputState).forEach(k => inputState[k] = false);
    window.addEventListener('mouseup', clearInputs);
    window.addEventListener('touchend', clearInputs);

    // Steuerkreuz binden
    bindBtn('.btn-up', 'fwd');
    bindBtn('.btn-down', 'bwd');
    bindBtn('.btn-left', 'left');
    bindBtn('.btn-right', 'right');
}

// === CONTROL FUNCTIONS (LOOP BASED) ===
function processMovement() {
    if (!settings.controlsEnabled || isVisionMode) return;

    // Sehr langsame Geschwindigkeit für präzises Bewegen
    const moveSpeed = 0.05 * settings.mouseSensitivity;
    const zoomSpeed = 1.02; 

    // Pan / Move
    if (inputState.fwd || inputState.bwd || inputState.left || inputState.right) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0; 
        forward.normalize();
        
        if(forward.lengthSq() < 0.1) forward.set(0, 0, -1);

        const right = new THREE.Vector3();
        right.crossVectors(camera.up, forward).normalize();

        const move = new THREE.Vector3();
        if (inputState.fwd) move.add(forward);
        if (inputState.bwd) move.sub(forward);
        
        // Korrekte Richtung (Rechts = Rechts)
        if (inputState.right) move.sub(right); 
        if (inputState.left) move.add(right);
        
        if (move.lengthSq() > 0) {
            move.normalize().multiplyScalar(moveSpeed);
            camera.position.add(move);
            controls.target.add(move);
        }
    }

    // Zoom nur noch via Tastatur
    if (inputState.zoomIn) controls.dollyIn(zoomSpeed);
    if (inputState.zoomOut) controls.dollyOut(zoomSpeed);
}

window.app.moveCamera = function(x, z) {}; 
window.app.zoomCamera = function(dir) {};
window.app.tiltCamera = function(dir) {};

// === UI & SETTINGS ===
window.app.toggleSettings = function() {
    const el = document.getElementById('settings-overlay');
    el.classList.toggle('active');
};

window.app.updateSettings = function() {
    settings.controlsEnabled = document.getElementById('set-controls').checked;
    settings.mouseSensitivity = parseFloat(document.getElementById('set-rotate-speed').value);
    settings.reducedMotion = document.getElementById('set-reduced-motion').checked;
    
    const highContrast = document.getElementById('set-high-contrast').checked;
    if(highContrast) document.body.classList.add('high-contrast');
    else document.body.classList.remove('high-contrast');

    const filterVal = document.getElementById('set-color-filter').value;
    document.body.className = document.body.className.replace(/filter-\w+/g, ''); 
    if(filterVal !== 'none') document.body.classList.add('filter-' + filterVal);

    controls.rotateSpeed = settings.mouseSensitivity;
    controls.zoomSpeed = settings.mouseSensitivity;
    controls.enableDamping = !settings.reducedMotion;
    
    const osc = document.getElementById('onscreen-controls');
    if(osc) {
        if(settings.controlsEnabled) {
             osc.classList.add('visible');
             osc.style.display = 'flex'; 
        } else {
             osc.classList.remove('visible');
             osc.style.display = 'none';
        }
    }
};

window.app.setFontScale = function(delta) {
    settings.fontScale = Math.max(0.8, Math.min(1.5, settings.fontScale + delta));
    document.body.style.fontSize = (14 * settings.fontScale) + "px";
    document.getElementById('font-scale-val').innerText = Math.round(settings.fontScale * 100) + "%";
};

function updateObjectList() {
    const container = document.getElementById('object-list-container');
    container.innerHTML = "";
    if(movableObjects.length === 0) {
        container.innerHTML = "<small style='color:#888;'>Keine Objekte im Raum.</small>";
        return;
    }
    const counts = {};
    const objMap = {}; 
    movableObjects.forEach(obj => {
        const name = ASSETS.furniture[obj.userData.typeId].name;
        if(!counts[name]) { counts[name] = 0; objMap[name] = []; }
        counts[name]++;
        objMap[name].push(obj);
    });
    for(let name in counts) {
        const div = document.createElement('div');
        div.className = "object-list-item";
        div.innerHTML = `<span>${name}</span> <span>${counts[name]}x</span>`;
        div.onclick = () => {
            deselectObject();
            selectedObjects = objMap[name];
            selectObject(selectedObjects[0]); 
        };
        container.appendChild(div);
    }
}

window.app.updateAnnotation = function(text) {
    if(selectedObjects.length > 0) selectedObjects.forEach(obj => { obj.userData.annotation = text; });
};

// === HISTORY ===
function saveHistory() {
    const state = movableObjects.map(obj => ({
        typeId: obj.userData.typeId,
        x: obj.position.x,
        z: obj.position.z,
        rot: obj.rotation.y,
        annotation: obj.userData.annotation || ""
    }));
    historyStack.push(state);
    if(historyStack.length > 20) historyStack.shift(); 
}

window.app.undo = function() {
    if(historyStack.length === 0) { showNotification("Nichts zum Rückgängig machen."); return; }
    const prevState = historyStack.pop();
    movableObjects.forEach(obj => { scene.remove(obj); obj.traverse(c => { if(c.geometry) c.geometry.dispose(); }); });
    movableObjects = [];
    interactionMeshes = [];
    selectedObjects = [];
    deselectObject();
    prevState.forEach(item => {
        createFurnitureInstance(item.typeId, item.x, item.z, item.rot);
        if(item.annotation && movableObjects.length > 0) movableObjects[movableObjects.length-1].userData.annotation = item.annotation;
    });
    updateSeatCount();
    updateObjectList();
    showNotification("Schritt rückgängig gemacht.");
};

// === LOADER ===
function getOrLoadFurniture(key) {
    return new Promise((resolve) => {
        const obj = ASSETS.furniture[key];
        if (obj.data) { resolve(obj.data); return; }
        const loader = obj.file.endsWith('.obj') ? objLoader : gltfLoader;
        loader.load("models/" + obj.file, (result) => {
            const model = result.scene || result;
            model.scale.set(GLOBAL_SCALE, GLOBAL_SCALE, GLOBAL_SCALE);
            disableCullingRecursively(model);
            obj.data = model;
            resolve(model);
        }, undefined, (err) => { resolve(null); });
    });
}

function disableCullingRecursively(obj) {
    if (!obj) return;
    obj.frustumCulled = false; 
    if (obj.isMesh) {
        if(obj.material) obj.material.side = THREE.DoubleSide;
        if(obj.geometry) {
            if (obj.geometry.attributes && obj.geometry.attributes.position) {
                obj.geometry.computeBoundingSphere();
                if(!obj.geometry.boundingSphere) obj.geometry.boundingSphere = new THREE.Sphere();
                obj.geometry.boundingSphere.radius = Infinity;
            }
        }
    }
    if(obj.children && obj.children.length > 0) {
        obj.children.forEach(child => disableCullingRecursively(child));
    }
}

function loadRoomAsset(filename) {
    return new Promise((resolve, reject) => {
        const info = ASSETS.rooms[filename];
        if (info.data) { resolve(info.data); return; }
        const path = "models/";
        const loader = (info.type === 'obj' || filename.endsWith('.obj')) ? objLoader : gltfLoader;
        loader.load(path + filename, (result) => {
            const model = result.scene || result;
            model.scale.set(GLOBAL_SCALE, GLOBAL_SCALE, GLOBAL_SCALE);
            info.data = model;
            resolve(model);
        }, undefined, reject);
    });
}

window.app.switchRoom = async function(filename) {
  const roomInfo = ASSETS.rooms[filename];
  if (!roomInfo) return;
  saveHistory();
  const savedFurniture = movableObjects.map(obj => ({
      typeId: obj.userData.typeId, x: obj.position.x, z: obj.position.z, rot: obj.rotation.y
  }));
  let modelData = roomInfo.data;
  if (!modelData) {
      toggleLoader(true, "Wechsle Raum...");
      try { modelData = await loadRoomAsset(filename); } 
      catch(e) { toggleLoader(false); showNotification("Fehler beim Laden des Raumes"); return; }
      toggleLoader(false);
  }
  if (currentRoomMesh) {
      scene.remove(currentRoomMesh);
      currentRoomMesh.traverse(o => { if(o.geometry) o.geometry.dispose(); });
      currentRoomMesh = null;
  }
  window.app.clearRoom(false);
  setupRoom(modelData, filename);
  const newLimits = roomInfo.playableArea;
  const limitX = newLimits.x - 0.5; const limitZ = newLimits.z - 0.5;
  savedFurniture.forEach(async (item) => {
      if(!ASSETS.furniture[item.typeId].data) await getOrLoadFurniture(item.typeId);
      let newX = Math.max(-limitX, Math.min(limitX, item.x));
      let newZ = Math.max(-limitZ, Math.min(limitZ, item.z));
      createFurnitureInstance(item.typeId, newX, newZ, item.rot);
  });
};

function setupRoom(model, filename) {
  currentRoomFile = filename;
  const roomInfo = ASSETS.rooms[filename];
  currentRoomMesh = model.clone();
  disableCullingRecursively(currentRoomMesh);
  const box = new THREE.Box3().setFromObject(currentRoomMesh);
  const center = box.getCenter(new THREE.Vector3());
  currentRoomMesh.position.set(-center.x, 0, -center.z);
  currentRoomMesh.position.y = -box.min.y;
  scene.add(currentRoomMesh);
  currentRoomMesh.updateMatrixWorld(true);
  currentRoomLimits = roomInfo.playableArea;
  updateSeatCount();
  updateObjectList();
  window.app.setCamera('top');
  historyStack = [];
}

function toggleLoader(show, text) {
    const el = document.getElementById("loader");
    const txt = document.getElementById("loading-text");
    if(el) {
        if(show) { if(txt && text) txt.innerText = text; el.classList.add("active"); } 
        else { el.classList.remove("active"); }
    }
}

function showModal(title, htmlContent) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-content').innerHTML = htmlContent;
    document.getElementById('modal-overlay').classList.add('active');
}

function showNotification(msg) {
    const el = document.getElementById("notification");
    el.innerText = msg;
    el.classList.add("visible");
    setTimeout(() => el.classList.remove("visible"), 3000);
}

// === ANALYSIS & ACCESSIBILITY (SMART & DYNAMIC) ===
function getAccessibilityStats() {
    let minFound = Infinity;
    let acousticPoints = 0;
    let wallIssues = 0;
    
    // Raumspezifische Ziele laden
    const targets = ASSETS.rooms[currentRoomFile].acousticTargets || { warn: 0.25, good: 0.45 };
    
    // 1. Möbel-zu-Möbel Distanz (Smarte Erkennung)
    for(let i=0; i<movableObjects.length; i++) {
        const objA = movableObjects[i];
        const infoA = ASSETS.furniture[objA.userData.typeId];
        acousticPoints += (infoA.acousticBonus || 1);

        for(let j=i+1; j<movableObjects.length; j++) {
            const objB = movableObjects[j];
            const infoB = ASSETS.furniture[objB.userData.typeId];
            
            const dist = objA.position.distanceTo(objB.position);
            const r1 = infoA.radius || 0.5;
            const r2 = infoB.radius || 0.5;
            
            const gap = Math.max(0, dist - (r1 + r2));

            // Toleranz für gewollte Gruppierung: Wenn Lücke < 5cm, ignorieren.
            if (gap > 0.05) { 
                if (gap < minFound) minFound = gap;
            }
        }
    }

    if (minFound === Infinity) minFound = 2.0; 
    
    // 2. Wand-Abstand (Smarte Erkennung)
    for(let obj of movableObjects) {
        if(obj.userData.isWallItem) continue;
        const info = ASSETS.furniture[obj.userData.typeId];
        const r = info.radius || 0.5;
        
        const distX = currentRoomLimits.x - Math.abs(obj.position.x) - r;
        const distZ = currentRoomLimits.z - Math.abs(obj.position.z) - r;
        
        // Wenn Möbel an Wand steht (Abstand < 5cm), OK.
        // Problem nur, wenn Abstand > 5cm ABER < 70cm.
        const issueX = (distX > 0.05 && distX < 0.7);
        const issueZ = (distZ > 0.05 && distZ < 0.7);

        if(issueX || issueZ) wallIssues++; 
    }
    
    const minCm = movableObjects.length < 2 ? 100 : Math.round(minFound * 100);
    const roomArea = ASSETS.rooms[currentRoomFile].area || 50;
    const acousticScore = acousticPoints / roomArea; 
    
    return { minCm, wallIssues, count: movableObjects.length, acousticScore, targets };
}

window.app.checkAccessibility = function() {
    const stats = getAccessibilityStats();
    if(stats.count < 1) { showModal("Barrierefreiheit & Akustik", "Raum ist leer."); return; }

    let statusClass = stats.minCm < 70 ? "bad" : (stats.minCm < 90 ? "warn" : "good");
    let statusText = stats.minCm < 70 ? "Kritisch (<70cm)" : (stats.minCm < 90 ? "Akzeptabel (70-90cm)" : "Sehr gut (>90cm)");
    
    let acClass = "bad";
    let acText = "Viel Hall (Schlecht für Hörgeräte)";
    
    // Dynamische Ziele verwenden
    if(stats.acousticScore > stats.targets.warn) { acClass = "warn"; acText = "Akzeptabel (Mittel)"; }
    if(stats.acousticScore > stats.targets.good) { acClass = "good"; acText = "Gut gedämpft"; }

    let html = `<h4>Rollstuhlfreiheit</h4>
                <div class="report-item ${statusClass}"><span>Engster Durchgang:</span><span class="report-val">${stats.minCm} cm</span><div style="font-size:11px; opacity:0.8">${statusText}</div></div>`;
    
    if(stats.wallIssues > 0) {
        html += `<div class="report-item warn"><span>Möbel ungünstig an Wand:</span><span class="report-val">${stats.wallIssues}</span><div style="font-size:11px; opacity:0.8">Abstand zu klein für Durchgang aber nicht bündig.</div></div>`;
    }
    
    html += `<h4 style="margin-top:20px;">Akustik (Prognose)</h4>
             <div class="report-item ${acClass}"><span>Hörsamkeit:</span><div style="font-size:11px; opacity:0.8; margin-top:5px;">${acText}</div></div>
             <p style="font-size:11px; color:#888;">Hinweis: Schätzung basierend auf Möbelanzahl und Raumgröße.</p>`;

    showModal("Barrierefreiheit & Akustik", html);
};

// === VISION ===
window.app.toggleVisionMode = function() {
    isVisionMode = !isVisionMode;
    const panel = document.getElementById("vision-panel");
    const others = document.querySelectorAll(".sidebar .panel:not(#vision-panel)");
    
    if (isVisionMode) {
        if(panel) { panel.style.display = "block"; panel.classList.remove('collapsed'); }
        others.forEach(p => p.style.display = "none");
        app.setCamera('top');
        controls.enabled = false; 
        if (!visionMarker) createVisionMarker();
        visionMarker.visible = true;
        scene.add(visionMarker);
        showNotification("Seh-Simulation aktiv. Linksklick zum Platzieren.");
        app.updateVisionSettings(); 
        deselectObject(); 
    } else {
        if(panel) panel.style.display = "none";
        others.forEach(p => p.style.display = "block");
        if (visionMarker) { visionMarker.visible = false; scene.remove(visionMarker); }
        controls.enabled = true;
        app.setCamera('top');
    }
};

window.app.setVisionSeverity = function(val, btn) {
    currentVisionSeverity = val;
    const btns = document.querySelectorAll('.severity-btn');
    btns.forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    app.updateVisionSettings();
};

function createVisionMarker() {
    const group = new THREE.Group();
    const bodyGeo = new THREE.CylinderGeometry(0.05, 0.25, 1.2, 16); 
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 }); 
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.6 + 0.4; 
    group.add(body);
    const headGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 1.3 + 0.4;
    group.add(head);
    
    const vertexShader = `varying vec3 vWorldPosition; void main() { vec4 worldPosition = modelMatrix * vec4(position, 1.0); vWorldPosition = worldPosition.xyz; gl_Position = projectionMatrix * viewMatrix * worldPosition; }`;
    const fragmentShader = `uniform vec3 color; uniform vec2 limits; varying vec3 vWorldPosition; void main() { if (abs(vWorldPosition.x) > limits.x || abs(vWorldPosition.z) > limits.y) { discard; } gl_FragColor = vec4(color, 0.3); }`;
    const radiusGeo = new THREE.RingGeometry(0.1, 1, 64);
    radiusGeo.rotateX(-Math.PI / 2);
    const radiusMat = new THREE.ShaderMaterial({ uniforms: { color: { value: new THREE.Color(0x2ea043) }, limits: { value: new THREE.Vector2(currentRoomLimits.x, currentRoomLimits.z) } }, vertexShader, fragmentShader, transparent: true, side: THREE.DoubleSide });
    visionRadiusMesh = new THREE.Mesh(radiusGeo, radiusMat);
    visionRadiusMesh.position.y = 0.4; 
    group.add(visionRadiusMesh);
    visionMarker = group;
}

window.app.updateVisionSettings = function() {
    const infoBox = document.getElementById("vision-info-box");
    if(!visionRadiusMesh) return;
    let r = 8.0; let desc = ""; let col = new THREE.Color(0x2ea043);
    switch(currentVisionSeverity) {
        case 'normal': r = 10.0; desc = "Normale Sehschärfe (Visus ≥ 1.0).<br>Raum gut überblickbar."; col.setHex(0x2ea043); break;
        case 'low': r = 3.5; desc = "Sehbehinderung (Visus < 0.3).<br>Details nur nah erkennbar."; col.setHex(0xd4a72c); break;
        case 'severe': r = 1.5; desc = "Hochgradig (Visus < 0.05).<br>Orientierung an Großformen."; col.setHex(0xff8800); break;
        case 'blind': r = 1.2; desc = "Blindheit (Visus ≤ 0.02).<br>Rein taktil & auditiv."; col.setHex(0xd73a49); break;
    }
    visionRadiusMesh.scale.set(r, 1, r);
    visionRadiusMesh.material.uniforms.color.value = col;
    visionRadiusMesh.material.uniforms.limits.value.set(currentRoomLimits.x, currentRoomLimits.z);
    if(infoBox) infoBox.innerHTML = desc;
};

window.app.savePlan = function() {
    const data = {
        room: currentRoomFile,
        furniture: movableObjects.map(obj => ({ typeId: obj.userData.typeId, x: obj.position.x, z: obj.position.z, rot: obj.rotation.y, annotation: obj.userData.annotation || "" }))
    };
    const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'raumplan.json'; a.click();
};

window.app.loadFromFile = function(input) {
    const file = input.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if(data.room !== currentRoomFile) { await app.switchRoom(data.room); app.clearRoom(false); } else { app.clearRoom(false); }
            for(let item of data.furniture) {
                if(!ASSETS.furniture[item.typeId].data) await getOrLoadFurniture(item.typeId);
                createFurnitureInstance(item.typeId, item.x, item.z, item.rot);
                if(item.annotation && movableObjects.length > 0) movableObjects[movableObjects.length-1].userData.annotation = item.annotation;
            }
            showNotification("Plan geladen.");
        } catch(err) { console.error(err); showNotification("Fehler beim Laden."); }
    };
    reader.readAsText(file); input.value = '';
};

// === PDF EXPORT OPTIMIZED ===
window.app.exportPDF = async function() {
    app.setCamera('top');
    toggleLoader(true, "Generiere PDF...");
    await new Promise(r => setTimeout(r, 800));
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFillColor(0, 48, 93); doc.rect(0, 0, 210, 25, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.setFont('helvetica', 'bold');
    doc.text("Digitaler Raumplan", 15, 17);
    
    doc.setTextColor(50, 50, 50); doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    const roomName = ASSETS.rooms[currentRoomFile]?.name || "Unbekannter Raum";
    const dateStr = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    doc.text(`Erstellt am: ${dateStr}`, 15, 35);
    doc.text(`Raum: ${roomName}`, 15, 41);

    renderer.render(scene, camera);
    const imgData = renderer.domElement.toDataURL("image/jpeg", 0.95);
    const imgProps = doc.getImageProperties(imgData);
    const pdfWidth = 180;
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    doc.addImage(imgData, 'JPEG', 15, 48, pdfWidth, pdfHeight); 
    
    try {
        const logoImg = await new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = "logo/ELMeKS-Logo-Frame.svg"; });
        if(logoImg) { 
            const c = document.createElement('canvas'); c.width = logoImg.width; c.height = logoImg.height; c.getContext('2d').drawImage(logoImg, 0, 0); 
            doc.addImage(c.toDataURL('image/png'), 'PNG', 170, 5, 25, 20); 
        }
    } catch(e) {}

    let currentY = 48 + pdfHeight + 10;
    
    const stats = getAccessibilityStats();
    let statusColor = [46, 160, 67]; 
    let statusText = "Vollständig barrierefrei";
    let statusDesc = "Durchgänge > 90cm ermöglichen gute Nutzbarkeit für Rollstuhlfahrer.";

    if (stats.count < 2) { 
        statusText = "Raum ist weitestgehend leer."; 
        statusDesc = "";
        statusColor=[150,150,150]; 
    }
    else if (stats.minCm < 70) { 
        statusColor = [215, 58, 73]; 
        statusText = "Nicht barrierefrei"; 
        statusDesc = `Engster Durchgang: ${stats.minCm}cm (Empfohlen > 90cm).`;
    }
    else if (stats.minCm < 90 || stats.wallIssues > 0) { 
        statusColor = [212, 167, 44]; 
        statusText = "Eingeschränkt barrierefrei"; 
        statusDesc = `Engster Durchgang: ${stats.minCm}cm. Eingeschränkter Bewegungsradius.`;
    }

    doc.setFillColor(245, 245, 245);
    doc.setDrawColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.roundedRect(15, currentY, 180, 16, 1, 1, 'FD');
    doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.rect(15, currentY, 2, 16, 'F'); 
    doc.setFontSize(11); doc.setTextColor(0);
    doc.text(`Barrierefreiheit: ${statusText}`, 20, currentY + 6);
    doc.setFontSize(9); doc.setTextColor(80);
    doc.text(statusDesc, 20, currentY + 12);
    currentY += 20;

    let acColor = [215, 58, 73]; 
    let acText = "Akustik: Ungünstig";
    let acDesc = "Wenig schallabsorbierende Flächen. Hall erschwert Sprachverständnis.";
    
    // Dynamische PDF Logik
    if(stats.acousticScore > stats.targets.warn) { 
        acColor=[212, 167, 44]; 
        acText = "Akustik: Akzeptabel"; 
        acDesc = "Mittlere Dämpfung durch Möblierung. Bei vielen Personen ggf. laut.";
    }
    if(stats.acousticScore > stats.targets.good) { 
        acColor=[46, 160, 67]; 
        acText = "Akustik: Gut gedämpft"; 
        acDesc = "Möblierung unterstützt gute Raumakustik und Sprachverständlichkeit.";
    }
    if(stats.count < 2) { acColor=[150,150,150]; acText = "Akustik: Neutral (Leer)"; acDesc=""; }

    doc.setFillColor(245, 245, 245);
    doc.setDrawColor(acColor[0], acColor[1], acColor[2]);
    doc.roundedRect(15, currentY, 180, 16, 1, 1, 'FD');
    doc.setFillColor(acColor[0], acColor[1], acColor[2]);
    doc.rect(15, currentY, 2, 16, 'F');
    doc.setFontSize(11); doc.setTextColor(0);
    doc.text(acText, 20, currentY + 6);
    doc.setFontSize(9); doc.setTextColor(80);
    doc.text(acDesc, 20, currentY + 12);
    
    currentY += 35;

    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(0); 
    doc.text("Inventarliste & Anmerkungen", 15, currentY);
    
    const tableData = [];
    const groupedCounts = {};
    const itemNames = {};

    movableObjects.forEach(obj => { 
        const type = obj.userData.typeId;
        const name = ASSETS.furniture[type].name;
        const note = obj.userData.annotation || "";
        
        if (!note) {
            groupedCounts[type] = (groupedCounts[type] || 0) + 1;
            itemNames[type] = name;
        } else {
            tableData.push([name, note]);
        }
    });

    for (const [type, count] of Object.entries(groupedCounts)) {
        tableData.push([`${itemNames[type]} (${count}x)`, "-"]);
    }
    tableData.sort((a, b) => a[0].localeCompare(b[0]));

    doc.autoTable({ 
        head: [['Möbelstück', 'Anmerkung']], 
        body: tableData, 
        startY: currentY + 5, 
        theme: 'striped', 
        headStyles: { fillColor: [0, 48, 93] } 
    });
    
    currentY = doc.lastAutoTable.finalY + 15;
    if (currentY > 250) { doc.addPage(); currentY = 20; }
    
    doc.setFontSize(9); doc.setTextColor(100);
    doc.text("Hinweis: Dies ist eine Planungsskizze. Bitte prüfen Sie vor Ort die Fluchtwege und Sicherheitsbestimmungen.", 15, currentY);
    currentY += 8;
    
    doc.setTextColor(50);
    const textLines = [
        "Besuchen Sie uns gerne im Lehr-Lern-Raum Inklusion an der TU Dresden (Zellescher Weg 20, Seminargebäude II, Raum 21).",
        "Alle Infos finden Sie unter folgendem Link:",
        "https://tu-dresden.de/zlsb/lehramtsstudium/im-studium/studienunterstuetzende-angebote/inklusionsraums",
        " ",
        "Für nähere Informationen sowie kostenlose Materialien schauen Sie gerne in den entsprechenden OPAL-Kurs:",
        "https://bildungsportal.sachsen.de/opal/auth/RepositoryEntry/20508278784/CourseNode/1614569282320623"
    ];
    textLines.forEach(line => {
        if(line.startsWith("http")) { 
            doc.setTextColor(0, 0, 255); 
            doc.textWithLink(line, 15, currentY, { url: line }); 
            doc.setTextColor(50); 
        } else { 
            doc.text(line, 15, currentY); 
        }
        currentY += 5;
    });

    doc.save("raumplan_export.pdf");
    toggleLoader(false);
};

window.app.runWizard = async function() {
    saveHistory();
    const scenario = document.getElementById('wizard-scenario').value;
    const count = parseInt(document.getElementById('wizard-count').value);
    const lx = currentRoomLimits.x - 0.2; const lz = currentRoomLimits.z - 0.2;
    let pending = [];
    switch(scenario) {
        case 'lecture': pending = calcRows(count, lx, lz); break;
        case 'group': pending = calcGroupsK6(count, lx, lz); break;
        case 'exam': pending = calcExam(count, lx, lz); break;
        case 'circle': pending = calcCircle(count, lx, lz); break;
    }
    if (!pending || pending.length === 0) { showNotification("Raum zu klein."); return; }
    app.clearRoom(false); 
    const typeId = pending[0].id;
    if (!ASSETS.furniture[typeId].data) { toggleLoader(true, "Lade Möbel..."); await getOrLoadFurniture(typeId); toggleLoader(false); }
    pending.forEach(p => createFurnitureInstance(p.id, p.x, p.z, p.r));
};

function checkPositionValid(x, z, r, lx, lz) { const tolerance = 0.1; return (Math.abs(x) + r <= lx + tolerance) && (Math.abs(z) + r <= lz + tolerance); }
function calcRows(count, lx, lz) { const r = ASSETS.furniture['row_combo'].radius; const itemWidth = 1.4; const itemDepth = 1.8; const cols = Math.floor(((lx * 2) - 0.4) / itemWidth); if(cols < 1) return null; let res = []; const startX = -(cols * itemWidth) / 2 + (itemWidth/2); const startZ = -(Math.ceil(count/cols) * itemDepth) / 2 + (itemDepth/2); for(let i=0; i<count; i++) { const col = i % cols; const row = Math.floor(i / cols); const z = startZ + (row * itemDepth); const x = startX + (col * itemWidth); if(!checkPositionValid(x, z, r, lx, lz)) return null; res.push({id: 'row_combo', x: x, z: z, r: Math.PI}); } return res; }
function calcGroupsK6(count, lx, lz) { const groupsNeeded = Math.ceil(count / 6); const r = ASSETS.furniture['k6'].radius; let diameter = (r * 2) + 0.3; let cols = Math.floor((lx * 2) / diameter); if(groupsNeeded > cols * Math.floor((lz * 2) / diameter)) return null; let res = []; const startX = -(cols * diameter) / 2 + diameter / 2; const startZ = -(Math.ceil(groupsNeeded/cols) * diameter) / 2 + diameter / 2; for (let i = 0; i < groupsNeeded; i++) { const col = i % cols; const row = Math.floor(i / cols); const x = startX + (col * diameter); const z = startZ + (row * diameter); if(!checkPositionValid(x, z, r, lx, lz)) return null; res.push({id: 'k6', x: x, z: z, r: (col+row)%2===0 ? 0 : Math.PI/4}); } return res; }
function calcExam(count, lx, lz) { const itemWidth = 1.8; const itemDepth = 1.8; const cols = Math.floor((lx * 2) / itemWidth); if(cols < 1) return null; let res = []; const startX = -(cols * itemWidth) / 2 + (itemWidth/2); const startZ = -lz + 1.5; for(let i=0; i<count; i++) { const col = i % cols; const row = Math.floor(i / cols); const x = startX + (col * itemWidth); const z = startZ + (row * itemDepth); if(Math.abs(z) > lz - 0.5) return null; res.push({id: 'row_combo', x: x, z: z, r: Math.PI}); } return res; }
function calcCircle(count, lx, lz) { const r = ASSETS.furniture['chair'].radius; const maxRoomRadius = Math.min(lx, lz) - 1.0; if(maxRoomRadius < 1.0) return null; const angleStep = (2 * Math.PI) / count; let res = []; for(let i=0; i<count; i++) { const angle = i * angleStep; res.push({id: 'chair', x: Math.sin(angle) * maxRoomRadius, z: Math.cos(angle) * maxRoomRadius, r: angle + Math.PI}); } return res; }

window.app.addFurniture = async function (typeId) { if(isVisionMode) return; saveHistory(); if(typeId.startsWith('k')) document.body.style.cursor = 'wait'; if(!ASSETS.furniture[typeId].data) { toggleLoader(true, "Lade Objekt..."); await getOrLoadFurniture(typeId); toggleLoader(false); } createFurnitureInstance(typeId, 0, 0, 0); document.body.style.cursor = 'default'; setTimeout(() => { const lastObj = movableObjects[movableObjects.length-1]; if(lastObj) selectObject(lastObj); }, 50); };
window.app.clearRoom = function(doSave=true) { if(doSave) saveHistory(); movableObjects.forEach(obj => { scene.remove(obj); obj.traverse(c => { if(c.geometry) c.geometry.dispose(); }); }); movableObjects = []; interactionMeshes = []; deselectObject(); updateSeatCount(); updateObjectList(); };
window.app.rotateSelection = function(dir) { if(!selectedObjects || selectedObjects.length===0) return; saveHistory(); selectedObjects.forEach(obj => obj.rotation.y += (Math.PI/4) * dir); if(selectedObjects.length===1) selectionBox.update(); };
window.app.deleteSelection = function() { 
    if (selectedObjects.length > 0) { 
        saveHistory(); 
        selectedObjects.forEach(obj => {
            scene.remove(obj); 
            movableObjects = movableObjects.filter(o => o !== obj); 
            const hitbox = obj.children.find(c => c.isMesh && c.geometry.type === 'BoxGeometry'); 
            if(hitbox) interactionMeshes = interactionMeshes.filter(m => m !== hitbox); 
            obj.traverse(c => { if(c.geometry) c.geometry.dispose(); if(c.material) [].concat(c.material).forEach(m => m.dispose()); });
        });
        deselectObject(); updateSeatCount(); updateObjectList();
    } 
};

window.app.setCamera = function(mode) {
  if (isVisionMode && mode !== 'top') return; 
  if (mode === 'top') {
      smoothCameraMove(new THREE.Vector3(0, 16, 0.1), new THREE.Vector3(0, 0, 0));
  } else if (mode === 'student') {
      let board = movableObjects.find(o => o.userData.typeId === 'board');
      const targetPos = new THREE.Vector3(0, 1.2, 0); 
      const lookAtPos = board ? board.position.clone() : new THREE.Vector3(0, 1.2, -5);
      smoothCameraMove(targetPos, lookAtPos);
  } else {
      smoothCameraMove(new THREE.Vector3(8, 8, 10), new THREE.Vector3(0, 0, 0));
  }
  if (!isVisionMode) controls.enabled = true;
};

function updateSeatCount() { let total = 0; movableObjects.forEach(obj => { if(obj.userData.typeId) total += (ASSETS.furniture[obj.userData.typeId].seats || 0); }); document.getElementById("seat-count").innerText = total; }

function createFurnitureInstance(typeId, x, z, rotY) {
    const info = ASSETS.furniture[typeId];
    if (!info.data) return;
    const visual = info.data.clone();
    disableCullingRecursively(visual);
    const box = new THREE.Box3().setFromObject(visual);
    const center = new THREE.Vector3(); box.getCenter(center);
    const wrapper = new THREE.Group();
    visual.position.x = -center.x; visual.position.y = -box.min.y; visual.position.z = -center.z;
    visual.traverse(c => { if(c.isMesh && c.material) { c.material.depthWrite = true; c.material.transparent = false; }});
    wrapper.add(visual);

    const hW = info.dims ? info.dims.x : 1.0;
    const hD = info.dims ? info.dims.z : 1.0;
    const hH = 1.2;

    const hitbox = new THREE.Mesh(
        new THREE.BoxGeometry(hW, hH, hD), 
        new THREE.MeshBasicMaterial({ visible: true, colorWrite: false, depthWrite: false })
    );
    hitbox.position.y = hH / 2;
    wrapper.userData = { typeId: typeId, root: wrapper, isWallItem: !!info.isWallItem };
    hitbox.userData = { root: wrapper };
    wrapper.add(hitbox);
    wrapper.position.set(x, FURNITURE_Y_OFFSET, z); wrapper.rotation.y = rotY; wrapper.updateMatrixWorld(true);
    scene.add(wrapper); movableObjects.push(wrapper); interactionMeshes.push(hitbox); updateSeatCount(); updateObjectList();
}

function onMouseDown(event) {
  if(event.button !== 0) return; 
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  if (isVisionMode && visionMarker) {
      const planeIntersect = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
          const lx = currentRoomLimits.x; const lz = currentRoomLimits.z;
          planeIntersect.x = Math.max(-lx, Math.min(lx, planeIntersect.x));
          planeIntersect.z = Math.max(-lz, Math.min(lz, planeIntersect.z));
          visionMarker.position.copy(planeIntersect);
          isDragging = true; selectedRoot = visionMarker; 
      }
      return; 
  }

  const intersects = raycaster.intersectObjects(interactionMeshes, false);
  if (intersects.length > 0) {
    const root = intersects[0].object.userData.root;
    if(!selectedObjects.includes(root)) { 
        deselectObject(); 
        selectedObjects = [root]; 
        selectObject(root); 
    }
    if(selectedObjects.length > 0) {
        saveHistory(); isDragging = true; controls.enabled = false; 
        const planeIntersect = new THREE.Vector3(); raycaster.ray.intersectPlane(dragPlane, planeIntersect);
        dragOffset.copy(planeIntersect); selectedRoot = root; 
    }
  } else { deselectObject(); }
}

function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  if (isVisionMode && isDragging && visionMarker) {
      const planeIntersect = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
          const lx = currentRoomLimits.x; const lz = currentRoomLimits.z;
          planeIntersect.x = Math.max(-lx, Math.min(lx, planeIntersect.x));
          planeIntersect.z = Math.max(-lz, Math.min(lz, planeIntersect.z));
          visionMarker.position.copy(planeIntersect);
      }
      return;
  }

  if (isDragging && selectedObjects.length > 0 && !isVisionMode) {
      const planeIntersect = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
        const delta = new THREE.Vector3().copy(planeIntersect).sub(dragOffset);
        selectedObjects.forEach(obj => {
            let newX = obj.position.x + delta.x; let newZ = obj.position.z + delta.z;
            const isWall = obj.userData.isWallItem;
            if(!isWall) {
                const radius = ASSETS.furniture[obj.userData.typeId]?.radius || 1.0;
                const lX = currentRoomLimits.x - (radius * 0.4); const lZ = currentRoomLimits.z - (radius * 0.4);
                newX = Math.max(-lX, Math.min(lX, newX)); newZ = Math.max(-lZ, Math.min(lZ, newZ));
            }
            obj.position.set(newX, obj.userData.isWallItem ? FURNITURE_Y_OFFSET : obj.position.y, newZ);
        });
        dragOffset.copy(planeIntersect); 
        if(selectedObjects.length === 1) selectionBox.update(); 
      }
      return;
  }
  const intersects = raycaster.intersectObjects(interactionMeshes, false);
  document.body.style.cursor = (intersects.length > 0) ? "grab" : "default";
}

function onKeyDown(event) { 
    if (event.key === "Escape") { if(isVisionMode) app.toggleVisionMode(); else app.setCamera('top'); } 
    
    if (selectedObjects.length > 0 && !isVisionMode) {
        const key = event.key.toLowerCase(); 
        if (key === "r") { saveHistory(); selectedObjects.forEach(o => o.rotation.y += Math.PI/4); if(selectedObjects.length===1) selectionBox.update(); } 
        if (key === "delete" || key === "backspace") window.app.deleteSelection(); 
    }

    if(settings.controlsEnabled && !isVisionMode) {
        switch(event.key) {
            case "ArrowUp": inputState.fwd = true; break;
            case "ArrowDown": inputState.bwd = true; break;
            case "ArrowLeft": inputState.left = true; break;
            case "ArrowRight": inputState.right = true; break;
            case "+": case "=": inputState.zoomIn = true; break;
            case "-": inputState.zoomOut = true; break;
        }
    }
}

function onKeyUp(event) {
    if(settings.controlsEnabled && !isVisionMode) {
        switch(event.key) {
            case "ArrowUp": inputState.fwd = false; break;
            case "ArrowDown": inputState.bwd = false; break;
            case "ArrowLeft": inputState.left = false; break;
            case "ArrowRight": inputState.right = false; break;
            case "+": case "=": inputState.zoomIn = false; break;
            case "-": inputState.zoomOut = false; break;
        }
    }
}

function onMouseUp() { 
    if(isDragging) { isDragging = false; controls.enabled = !isVisionMode; if(isVisionMode) selectedRoot = null; 
        if(selectedObjects.length === 1) { document.getElementById('selection-details').style.display = 'block'; document.getElementById('obj-annotation').value = selectedObjects[0].userData.annotation || ""; }
    } 
    Object.keys(inputState).forEach(k => inputState[k] = false);
}

function selectObject(obj) { 
    if(selectedObjects.length === 1) {
        selectedRoot = obj; selectionBox.setFromObject(obj); selectionBox.visible = true; 
        document.getElementById('selection-details').style.display = 'block'; document.getElementById('obj-annotation').value = obj.userData.annotation || "";
    } else { selectionBox.visible = false; document.getElementById('selection-details').style.display = 'none'; }
    document.getElementById("context-menu").classList.add("visible"); updateObjectList();
}

function deselectObject() { selectedRoot = null; selectedObjects = []; selectionBox.visible = false; document.getElementById("context-menu").classList.remove("visible"); document.getElementById('selection-details').style.display = 'none'; document.querySelectorAll('.object-list-item').forEach(el => el.classList.remove('selected')); }

function smoothCameraMove(targetPos, targetLookAt) {
  if(settings.reducedMotion) { camera.position.copy(targetPos); controls.target.copy(targetLookAt); controls.update(); return; }
  const startPos = camera.position.clone(); const startLook = controls.target.clone(); const duration = 800; const startTime = performance.now();
  function loop(time) { const t = Math.min((time - startTime) / duration, 1); const ease = t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t; 
    camera.position.lerpVectors(startPos, targetPos, ease); controls.target.lerpVectors(startLook, targetLookAt, ease); controls.update();
    if (t < 1) requestAnimationFrame(loop);
  } requestAnimationFrame(loop);
}

function onWindowResize() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); }

function animate() { 
    requestAnimationFrame(animate); 
    processMovement();
    controls.update(); 
    renderer.render(scene, camera); 
}

init();
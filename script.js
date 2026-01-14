import * as THREE from "https://esm.sh/three@0.160.0";
import { OrbitControls } from "https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "https://esm.sh/three@0.160.0/examples/jsm/loaders/OBJLoader.js";
import { DRACOLoader } from "https://esm.sh/three@0.160.0/examples/jsm/loaders/DRACOLoader.js";

// === 1. Setup ===
window.app = {}; 

const GLOBAL_SCALE = 0.6; 
const HITBOX_PADDING = 0.3; 
const FURNITURE_Y_OFFSET = 0.22; 

const ASSETS = {
  rooms: {
    "raummodell_leer.glb":    { data: null, playableArea: { x: 4.4, z: 4.3 }, name: "LLR Standard" },
    "LLR_möbliert(50qm).obj": { data: null, playableArea: { x: 4.5, z: 4.5 }, type: 'obj', name: "LLR Möbliert" },
    "leer_70qm.glb":          { data: null, playableArea: { x: 5.5, z: 5.5 }, name: "Großer Raum" },
    "leer_30qm.glb":          { data: null, playableArea: { x: 3.5, z: 3.5 }, name: "Kleiner Raum" },
  },
  furniture: {
    'row_combo': { file: 'Tischplusstuhleinzeln.glb', radius: 0.6, seats: 1, name: "Tisch+Stuhl" },
    'tano':      { file: 'trapezTisch.glb', radius: 0.5, seats: 1, name: "Trapeztisch" },
    'triangle':  { file: 'dreiecksTisch.glb', radius: 0.5, seats: 1, name: "Dreieckstisch" },
    'chair':     { file: 'roterStuhl.glb', radius: 0.4, seats: 1, name: "Stuhl" },
    'teacher':   { file: 'Lehrertisch.glb', radius: 0.8, seats: 0, name: "Lehrerpult" },
    'cupboard':  { file: 'runderSchrank.glb', radius: 0.7, seats: 0, name: "Regal" },
    'board':     { file: 'tafel_skaliert.glb', radius: 0.4, seats: 0, isWallItem: true, name: "Tafel" },
    'k1': { file: 'Tischaufstellung1.glb', radius: 1.0, seats: 2, name: "2er Ecktisch" }, 
    'k2': { file: 'Tischaufstellung2.glb', radius: 1.2, seats: 2, name: "2er Vis-a-Vis" },
    'k3': { file: 'Tischaufstellung3.glb', radius: 1.8, seats: 8, name: "8er Gruppentisch" },
    'k4': { file: 'Tischkonstellation4.glb', radius: 1.8, seats: 8, name: "8er Kreis" },
    'k5': { file: 'Tischkonstellation5.glb', radius: 1.4, seats: 4, name: "4er Ecktisch" },
    'k6': { file: 'Tischkonstellation6.glb', radius: 1.8, seats: 6, name: "6er Gruppentisch" }, 
    'k7': { file: 'Tischkonstellation7.glb', radius: 2.2, seats: 11, name: "11er U-Form" },
    'k8': { file: 'Tischkonstellation8.glb', radius: 2.0, seats: 9, name: "9er U-Form" },
  },
};

let scene, camera, renderer, controls;
let currentRoomMesh = null;
let currentRoomFile = ""; 
let currentRoomLimits = { x: 5, z: 5 }; 
let movableObjects = [];
let interactionMeshes = [];
let selectedRoot = null;
let selectionBox = null; 
let historyStack = []; 

// Vision Mode Globals
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

      window.addEventListener("resize", onWindowResize);
      renderer.domElement.addEventListener("mousedown", onMouseDown);
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      window.addEventListener("keydown", onKeyDown);
      
      selectionBox = new THREE.BoxHelper(new THREE.Mesh(), 0x007acc); 
      selectionBox.visible = false;
      scene.add(selectionBox);

      const sel = document.getElementById('room-select');
      if(sel) sel.addEventListener('change', (e) => app.switchRoom(e.target.value));

      startApp();

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

// === UNDO SYSTEM ===
function saveHistory() {
    const state = movableObjects.map(obj => ({
        typeId: obj.userData.typeId,
        x: obj.position.x,
        z: obj.position.z,
        rot: obj.rotation.y
    }));
    historyStack.push(state);
    if(historyStack.length > 20) historyStack.shift(); 
}

window.app.undo = function() {
    if(historyStack.length === 0) { showNotification("Nichts zum Rückgängig machen."); return; }
    const prevState = historyStack.pop();
    movableObjects.forEach(obj => {
        scene.remove(obj);
        obj.traverse(c => { if(c.geometry) c.geometry.dispose(); });
    });
    movableObjects = [];
    interactionMeshes = [];
    deselectObject();
    prevState.forEach(item => {
        const info = ASSETS.furniture[item.typeId];
        if (info && info.data) createFurnitureInstance(item.typeId, item.x, item.z, item.rot);
    });
    updateSeatCount();
    showNotification("Schritt rückgängig gemacht.");
};

// === LOADERS ===
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

// === ROOM SWITCHING ===
window.app.switchRoom = async function(filename) {
  const roomInfo = ASSETS.rooms[filename];
  if (!roomInfo) return;
  saveHistory();
  
  const savedFurniture = movableObjects.map(obj => ({
      typeId: obj.userData.typeId,
      x: obj.position.x,
      z: obj.position.z,
      rot: obj.rotation.y
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

  movableObjects.forEach(obj => { scene.remove(obj); });
  movableObjects = [];
  interactionMeshes = [];
  
  setupRoom(modelData, filename);

  const newLimits = roomInfo.playableArea;
  const limitX = newLimits.x - 0.5;
  const limitZ = newLimits.z - 0.5;

  savedFurniture.forEach(item => {
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

// === ACCESSIBILITY LOGIC HELPER ===
function getAccessibilityStats() {
    let minFound = Infinity;
    for(let i=0; i<movableObjects.length; i++) {
        for(let j=i+1; j<movableObjects.length; j++) {
            const objA = movableObjects[i]; const objB = movableObjects[j];
            const dist = objA.position.distanceTo(objB.position);
            const r1 = (ASSETS.furniture[objA.userData.typeId].radius || 0.5) * 0.75;
            const r2 = (ASSETS.furniture[objB.userData.typeId].radius || 0.5) * 0.75;
            const gap = Math.max(0, dist - (r1 + r2));
            if(gap < minFound) minFound = gap;
        }
    }
    let wallIssues = 0;
    for(let obj of movableObjects) {
        if(obj.userData.isWallItem) continue;
        const r = (ASSETS.furniture[obj.userData.typeId].radius || 0.5) * 0.75;
        const distX = currentRoomLimits.x - Math.abs(obj.position.x) - r;
        const distZ = currentRoomLimits.z - Math.abs(obj.position.z) - r;
        if(distX < 0.1 || distZ < 0.1) wallIssues++; 
    }
    const minCm = movableObjects.length < 2 ? 100 : Math.round(minFound * 100);
    return { minCm, wallIssues, count: movableObjects.length };
}

window.app.checkWheelchair = function() {
    const stats = getAccessibilityStats();
    if(stats.count < 2) { showModal("Rollstuhlfreiheit", "Zu wenig Möbel.<br>Status: <b>Barrierefrei</b>"); return; }

    let statusClass = stats.minCm < 70 ? "bad" : (stats.minCm < 90 ? "warn" : "good");
    let statusText = stats.minCm < 70 ? "Kritisch (<70cm)" : (stats.minCm < 90 ? "Akzeptabel (70-90cm)" : "Sehr gut (>90cm)");
    let html = `<div class="report-item ${statusClass}"><span>Engster Durchgang:</span><span class="report-val">${stats.minCm} cm</span><div style="font-size:11px; opacity:0.8">${statusText}</div></div>`;
    if(stats.wallIssues > 0) html += `<div class="report-item warn"><span>Möbel an Wand:</span><span class="report-val">${stats.wallIssues}</span></div>`;
    html += "<hr style='border:0; border-top:1px solid #555; margin:15px 0;'>";
    html += (stats.minCm>=90 && stats.wallIssues===0) ? "<div style='color:#2ea043; text-align:center; font-weight:bold'>Vollständig rollstuhlgerecht.</div>" : "<div style='color:#d4a72c; text-align:center;'>Eingeschränkt oder nicht barrierefrei.</div>";
    showModal("Rollstuhlfreiheit - Ergebnis", html);
};

// === VISION MODE ===
window.app.toggleVisionMode = function() {
    isVisionMode = !isVisionMode;
    const panel = document.getElementById("vision-panel");
    const others = document.querySelectorAll(".sidebar .panel:not(#vision-panel)");
    const bottomBar = document.getElementById("bottom-bar");

    if (isVisionMode) {
        if(panel) { panel.style.display = "block"; panel.classList.remove('collapsed'); }
        others.forEach(p => p.style.display = "none");
        if(bottomBar) bottomBar.style.display = "none";

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
        if(bottomBar) bottomBar.style.display = "flex";

        if (visionMarker) {
            visionMarker.visible = false;
            scene.remove(visionMarker);
        }
        
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
    // Neutraler "Pöppel"
    const bodyGeo = new THREE.CylinderGeometry(0.05, 0.25, 1.2, 16); 
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 }); 
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.6 + 0.4; 
    group.add(body);

    const headGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 1.3 + 0.4;
    group.add(head);

    // Shader Material for Clipping
    const vertexShader = `varying vec3 vWorldPosition; void main() { vec4 worldPosition = modelMatrix * vec4(position, 1.0); vWorldPosition = worldPosition.xyz; gl_Position = projectionMatrix * viewMatrix * worldPosition; }`;
    const fragmentShader = `uniform vec3 color; uniform vec2 limits; varying vec3 vWorldPosition; void main() { if (abs(vWorldPosition.x) > limits.x || abs(vWorldPosition.z) > limits.y) { discard; } gl_FragColor = vec4(color, 0.3); }`;

    const radiusGeo = new THREE.RingGeometry(0.1, 1, 64);
    radiusGeo.rotateX(-Math.PI / 2);
    
    const radiusMat = new THREE.ShaderMaterial({
        uniforms: {
            color: { value: new THREE.Color(0x2ea043) },
            limits: { value: new THREE.Vector2(currentRoomLimits.x, currentRoomLimits.z) }
        },
        vertexShader: vertexShader, fragmentShader: fragmentShader, transparent: true, side: THREE.DoubleSide
    });

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

// === STANDARD FUNCS ===
window.app.savePlan = function() {
    const data = {
        room: currentRoomFile,
        furniture: movableObjects.map(obj => ({ typeId: obj.userData.typeId, x: obj.position.x, z: obj.position.z, rot: obj.rotation.y }))
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
            if(data.room !== currentRoomFile) { await app.switchRoom(data.room); app.clearRoom(); } else { app.clearRoom(); }
            for(let item of data.furniture) {
                if(!ASSETS.furniture[item.typeId].data) await getOrLoadFurniture(item.typeId);
                createFurnitureInstance(item.typeId, item.x, item.z, item.rot);
            }
            showNotification("Plan geladen.");
        } catch(err) { console.error(err); showNotification("Fehler beim Laden."); }
    };
    reader.readAsText(file); input.value = '';
};

// === PDF EXPORT ===
window.app.exportPDF = async function() {
    app.setCamera('top');
    toggleLoader(true, "Generiere PDF...");
    
    await new Promise(r => setTimeout(r, 800));

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Header
    doc.setFillColor(0, 48, 93); 
    doc.rect(0, 0, 210, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text("Digitaler Raumplan", 15, 17);
    
    // Info Block
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const roomName = ASSETS.rooms[currentRoomFile]?.name || "Unbekannter Raum";
    const dateStr = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    
    doc.text(`Erstellt am: ${dateStr}`, 15, 35);
    doc.text(`Raum: ${roomName}`, 15, 41);

    // Screenshot
    renderer.render(scene, camera);
    const imgData = renderer.domElement.toDataURL("image/jpeg", 0.95);
    const imgProps = doc.getImageProperties(imgData);
    const pdfWidth = 180;
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    doc.addImage(imgData, 'JPEG', 15, 48, pdfWidth, pdfHeight); 
    
    let currentY = 48 + pdfHeight + 10;

    // Accessibility Status Box
    const stats = getAccessibilityStats();
    let statusColor = [46, 160, 67]; // Green
    let statusText = "Vollständig barrierefrei (Durchgänge > 90cm)";
    
    if (stats.count < 2) {
        statusText = "Raum ist weitestgehend leer.";
    } else if (stats.minCm < 70) {
        statusColor = [215, 58, 73]; // Red
        statusText = "Nicht barrierefrei (Engstellen < 70cm)";
    } else if (stats.minCm < 90 || stats.wallIssues > 0) {
        statusColor = [212, 167, 44]; // Yellow/Orange
        statusText = "Eingeschränkt barrierefrei (Durchgänge > 70cm)";
    }

    doc.setFillColor(245, 245, 245);
    doc.setDrawColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.roundedRect(15, currentY, 180, 14, 1, 1, 'FD');
    doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.rect(15, currentY, 2, 14, 'F'); // Colored strip
    
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(`Status Barrierefreiheit: ${statusText}`, 20, currentY + 9);
    
    currentY += 22;

    // Inventory
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text("Inventarliste", 15, currentY);
    
    const inventory = {};
    movableObjects.forEach(obj => { const name = ASSETS.furniture[obj.userData.typeId].name; inventory[name] = (inventory[name] || 0) + 1; });
    const rows = Object.keys(inventory).map(key => [key, inventory[key]]);
    
    doc.autoTable({
        head: [['Möbelstück', 'Anzahl']],
        body: rows,
        startY: currentY + 5,
        theme: 'striped',
        headStyles: { fillColor: [0, 48, 93] },
        styles: { font: 'helvetica' }
    });
    
    currentY = doc.lastAutoTable.finalY + 15;

    // Footer
    if (currentY > 250) { doc.addPage(); currentY = 20; }
    
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text("Hinweis: Dies ist eine Planungsskizze. Bitte prüfen Sie vor Ort die Fluchtwege und Sicherheitsbestimmungen.", 15, currentY);
    currentY += 8;

    doc.setTextColor(50);
    doc.setFontSize(9);
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

    // Logo (Versuch)
    try {
        const logoImg = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = "logo/ELMeKS-Logo-Frame.svg";
        });
        if(logoImg) {
            const c = document.createElement('canvas');
            c.width = logoImg.width; c.height = logoImg.height;
            c.getContext('2d').drawImage(logoImg, 0, 0);
            doc.addImage(c.toDataURL('image/png'), 'PNG', 170, 5, 25, 20); // Top Right in Header
        }
    } catch(e) {}

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
window.app.clearRoom = function(doSave=true) { if(doSave) saveHistory(); movableObjects.forEach(obj => { scene.remove(obj); obj.traverse(c => { if(c.geometry) c.geometry.dispose(); }); }); movableObjects = []; interactionMeshes = []; deselectObject(); updateSeatCount(); };
window.app.rotateSelection = function(dir) { if(!selectedRoot) return; saveHistory(); selectedRoot.rotation.y += (Math.PI/4) * dir; selectionBox.update(); };
window.app.deleteSelection = function() { if (selectedRoot) { saveHistory(); scene.remove(selectedRoot); movableObjects = movableObjects.filter(o => o !== selectedRoot); const hitbox = selectedRoot.children.find(c => c.isMesh && c.geometry.type === 'BoxGeometry'); if(hitbox) interactionMeshes = interactionMeshes.filter(m => m !== hitbox); selectedRoot.traverse(c => { if(c.geometry) c.geometry.dispose(); if(c.material) [].concat(c.material).forEach(m => m.dispose()); }); deselectObject(); updateSeatCount(); } };

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
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    const wrapper = new THREE.Group();
    visual.position.x = -center.x; visual.position.y = -box.min.y; visual.position.z = -center.z;
    visual.traverse(c => { if(c.isMesh && c.material) { c.material.depthWrite = true; c.material.transparent = false; }});
    wrapper.add(visual);
    const hitW = Math.max(size.x + HITBOX_PADDING, 0.8); const hitH = Math.max(size.y + HITBOX_PADDING, 1.2); const hitD = Math.max(size.z + HITBOX_PADDING, 0.8);
    const hitbox = new THREE.Mesh(new THREE.BoxGeometry(hitW, hitH, hitD), new THREE.MeshBasicMaterial({ visible: true, colorWrite: false, depthWrite: false }));
    hitbox.position.y = hitH / 2;
    wrapper.userData = { typeId: typeId, root: wrapper, isWallItem: !!info.isWallItem };
    hitbox.userData = { root: wrapper };
    wrapper.add(hitbox);
    wrapper.position.set(x, FURNITURE_Y_OFFSET, z); wrapper.rotation.y = rotY; wrapper.updateMatrixWorld(true);
    scene.add(wrapper); movableObjects.push(wrapper); interactionMeshes.push(hitbox); updateSeatCount();
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
    saveHistory();
    isDragging = true; controls.enabled = false; selectObject(root);
    const planeIntersect = new THREE.Vector3(); raycaster.ray.intersectPlane(dragPlane, planeIntersect);
    dragOffset.copy(planeIntersect).sub(root.position);
    document.body.style.cursor = "grabbing";
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

  if (isDragging && selectedRoot && !isVisionMode) {
      const planeIntersect = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
        const rawPos = planeIntersect.sub(dragOffset);
        let newX = rawPos.x; let newZ = rawPos.z;
        const isWall = selectedRoot.userData.isWallItem;
        const limitX = currentRoomLimits.x; const limitZ = currentRoomLimits.z;
        if (isWall) {
            const wallOffset = 0.5; 
            const dRight = Math.abs(limitX - rawPos.x); const dLeft = Math.abs(-limitX - rawPos.x); const dBottom = Math.abs(limitZ - rawPos.z); const dTop = Math.abs(-limitZ - rawPos.z);
            const min = Math.min(dRight, dLeft, dBottom, dTop);
            if (min === dTop) { newZ = -limitZ + wallOffset; selectedRoot.rotation.y = 0; } else if (min === dBottom) { newZ = limitZ - wallOffset; selectedRoot.rotation.y = Math.PI; } else if (min === dRight) { newX = limitX - wallOffset; selectedRoot.rotation.y = -Math.PI / 2; } else if (min === dLeft) { newX = -limitX + wallOffset; selectedRoot.rotation.y = Math.PI / 2; }
            if (min === dTop || min === dBottom) newX = Math.max(-(limitX - 1), Math.min((limitX - 1), rawPos.x)); else newZ = Math.max(-(limitZ - 1), Math.min((limitZ - 1), rawPos.z));
            selectedRoot.position.set(newX, FURNITURE_Y_OFFSET, newZ); selectionBox.material.color.setHex(0x007acc);
        } else {
            const radius = ASSETS.furniture[selectedRoot.userData.typeId]?.radius || 1.0;
            const lX = limitX - (radius * 0.4); const lZ = limitZ - (radius * 0.4);
            newX = Math.max(-lX, Math.min(lX, newX)); newZ = Math.max(-lZ, Math.min(lZ, newZ));
            const isColliding = checkCollision({x:newX, z:newZ}, selectedRoot);
            selectedRoot.position.set(newX, FURNITURE_Y_OFFSET, newZ); selectionBox.material.color.setHex(isColliding ? 0xd73a49 : 0x007acc);
        }
        selectionBox.update();
      }
      return;
  }
  const intersects = raycaster.intersectObjects(interactionMeshes, false);
  document.body.style.cursor = (intersects.length > 0) ? "grab" : "default";
}

function checkCollision(targetPos, activeObj) { const activeId = activeObj.userData.typeId; if(activeObj.userData.isWallItem) return false; const r1 = ASSETS.furniture[activeId]?.radius || 1.0; const scaleFactor = GLOBAL_SCALE * 0.4; for (let other of movableObjects) { if (other === activeObj) continue; const otherId = other.userData.typeId; const r2 = ASSETS.furniture[otherId]?.radius || 1.0; const dx = targetPos.x - other.position.x; const dz = targetPos.z - other.position.z; if (Math.sqrt(dx*dx + dz*dz) < (r1 + r2) * scaleFactor) return true; } return false; }
function onMouseUp() { if(isDragging) { isDragging = false; controls.enabled = !isVisionMode; if(isVisionMode) selectedRoot = null; } }
function onKeyDown(event) { if (event.key === "Escape") { if(isVisionMode) app.toggleVisionMode(); else app.setCamera('top'); } if (!selectedRoot || isVisionMode) return; const key = event.key.toLowerCase(); if (key === "r") { saveHistory(); selectedRoot.rotation.y += Math.PI / 4; selectionBox.update(); } if (key === "delete" || key === "backspace") window.app.deleteSelection(); }
function selectObject(obj) { selectedRoot = obj; selectionBox.setFromObject(obj); selectionBox.visible = true; selectionBox.material.color.setHex(0x007acc); document.getElementById("context-menu").classList.add("visible"); }
function deselectObject() { selectedRoot = null; selectionBox.visible = false; document.getElementById("context-menu").classList.remove("visible"); }

function smoothCameraMove(targetPos, targetLookAt) {
  const startPos = camera.position.clone(); const startLook = controls.target.clone(); const duration = 800; const startTime = performance.now();
  function loop(time) { const t = Math.min((time - startTime) / duration, 1); const ease = t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t; 
    camera.position.lerpVectors(startPos, targetPos, ease); controls.target.lerpVectors(startLook, targetLookAt, ease); controls.update();
    if (t < 1) requestAnimationFrame(loop);
  } requestAnimationFrame(loop);
}

function onWindowResize() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); }
function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }

init();
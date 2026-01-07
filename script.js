import * as THREE from "https://esm.sh/three@0.160.0";
import { OrbitControls } from "https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "https://esm.sh/three@0.160.0/examples/jsm/loaders/DRACOLoader.js";

// === 1. Konfiguration ===
const GLOBAL_SCALE = 0.6; 
const FURNITURE_HEIGHT = 0.7; // Feste Höhe gegen Boden-Clipping
const GRID_SNAP = 0.25; // Einrasten in 25cm Schritten

const ASSETS = {
  rooms: {
    "raummodell_leer.glb": { 
        data: null, 
        playableArea: { x: 4.4, z: 4.3 } 
    },
    "raummodell_in_x_gestreckt.glb": { 
        data: null, 
        playableArea: { x: 5.3, z: 4.2 } 
    },
    "raummodell_in_z_gestreckt.glb": { 
        data: null, 
        playableArea: { x: 4.4, z: 5.1 } 
    },
    "raummodell_in_x_z_gestreckt.glb": { 
        data: null, 
        playableArea: { x: 5.3, z: 5.1 } 
    },
  },
  furniture: {
    // seats auf 2 geändert für Gruppe 2, da nun "Paartisch"
    1: { file: "Tischaufstellung1.glb", data: null, radius: 1.2, seats: 2 }, 
    2: { file: "Tischaufstellung2.glb", data: null, radius: 1.5, seats: 2 },
    3: { file: "Tischaufstellung3.glb", data: null, radius: 1.9, seats: 8 },
  },
};

const PRESETS = {
  rows: [
    // Reihen enger zusammen
    { id: 2, x: -2.0, z: -2.0, r: 0 }, { id: 2, x: 2.0, z: -2.0, r: 0 },
    { id: 2, x: -2.0, z: 0.0, r: 0 },  { id: 2, x: 2.0, z: 0.0, r: 0 },
    { id: 2, x: -2.0, z: 2.0, r: 0 },  { id: 2, x: 2.0, z: 2.0, r: 0 },
  ],
  groups: [
    { id: 3, x: -2.2, z: -2.2, r: Math.PI/4 },
    { id: 3, x: 2.2, z: -2.2, r: -Math.PI/4 },
    { id: 3, x: -2.2, z: 2.2, r: -Math.PI/4 },
    { id: 3, x: 2.2, z: 2.2, r: Math.PI/4 },
  ]
};

// === 2. Globale Variablen ===
let scene, camera, renderer, controls;
let currentRoomMesh = null;
let roomBoundaryBox = null;
let currentRoomLimits = { x: 5, z: 5 }; 
let movableObjects = [];
let interactionMeshes = [];
let selectedRoot = null;
let selectionBox = null; 
let hoveredRoot = null; // Für Hover-Effekt

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const dragOffset = new THREE.Vector3();
let isDragging = false;

// === 3. Initialisierung ===
function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202226); // Modernes Dunkelgrau

  // Kamera
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(8, 12, 12);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  // Licht
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7);
  scene.add(hemiLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight.position.set(8, 15, 8);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.radius = 3;
  scene.add(dirLight);
  const fill = new THREE.DirectionalLight(0xffffff, 0.3);
  fill.position.set(-5, 8, -5);
  scene.add(fill);

  // Boden mit Raster
  const gridHelper = new THREE.GridHelper(30, 30, 0x555555, 0x333333);
  gridHelper.position.y = 0.01;
  scene.add(gridHelper);
  
  // Dunkler Boden darunter
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(60,60), new THREE.MeshStandardMaterial({color:0x222222, roughness:0.8}));
  plane.rotation.x = -Math.PI/2;
  plane.receiveShadow = true;
  scene.add(plane);

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
  
  // UI Bindings (Wichtig!)
  document.getElementById("room-select").addEventListener("change", (e) => switchRoom(e.target.value));
  
  // Auswahl-Box
  selectionBox = new THREE.BoxHelper(new THREE.Mesh(), 0x00e5ff); // Cyan
  selectionBox.material.depthTest = false;
  selectionBox.material.transparent = true;
  selectionBox.material.opacity = 0.8;
  selectionBox.visible = false;
  scene.add(selectionBox);

  // Grenzen (Dezent)
  roomBoundaryBox = new THREE.BoxHelper(new THREE.Mesh(), 0x000000);
  roomBoundaryBox.material.opacity = 0.1;
  roomBoundaryBox.material.transparent = true;
  roomBoundaryBox.visible = true; 
  scene.add(roomBoundaryBox);

  loadAllAssets().then(() => {
    const loaderEl = document.getElementById("loader");
    if(loaderEl) {
        loaderEl.style.opacity = 0;
        setTimeout(() => loaderEl.remove(), 500);
    }
    switchRoom("raummodell_leer.glb");
    animate();
  });
}

// === 4. Asset Loader ===
async function loadAllAssets() {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  const path = "models/";
  const promises = [];
  const loadingText = document.getElementById("loading-text");
  
  // Cache Buster
  const ts = "?t=" + Date.now();

  const loadFile = (filename, targetObj) => {
    return new Promise((resolve) => {
      loader.load(path + filename + ts, (gltf) => {
          gltf.scene.scale.set(GLOBAL_SCALE, GLOBAL_SCALE, GLOBAL_SCALE);
          targetObj.data = gltf.scene;
          resolve(); 
        },
        (xhr) => {
           if(loadingText && xhr.total) loadingText.innerText = `Lade... ${Math.round(xhr.loaded/xhr.total*100)}%`;
        },
        (error) => { 
            console.error("Fehler beim Laden:", filename, error); 
            resolve(); // Trotzdem weitermachen
        }
      );
    });
  };

  for (const [file, obj] of Object.entries(ASSETS.rooms)) promises.push(loadFile(file, obj));
  for (const [id, obj] of Object.entries(ASSETS.furniture)) promises.push(loadFile(obj.file, obj));

  return Promise.all(promises);
}

// === 5. Raum Logik ===
function switchRoom(filename) {
  const roomInfo = ASSETS.rooms[filename];
  if (!roomInfo || !roomInfo.data) {
      console.warn("Raum nicht geladen:", filename);
      return;
  }

  if (currentRoomMesh) scene.remove(currentRoomMesh);
  window.app.clearRoom();

  currentRoomMesh = roomInfo.data.clone();
  
  // Auto-Zentrierung
  const box = new THREE.Box3().setFromObject(currentRoomMesh);
  const center = box.getCenter(new THREE.Vector3());
  const offsetY = -box.min.y; 

  currentRoomMesh.position.set(-center.x, offsetY, -center.z);
  
  // Grenzen setzen
  currentRoomLimits = roomInfo.playableArea;

  // Grenze visualisieren
  const debugMesh = new THREE.Mesh(
      new THREE.BoxGeometry(currentRoomLimits.x * 2, 0.1, currentRoomLimits.z * 2),
      new THREE.MeshBasicMaterial()
  );
  debugMesh.position.set(0, 0.05, 0); 
  roomBoundaryBox.setFromObject(debugMesh);
  roomBoundaryBox.update();

  currentRoomMesh.traverse((child) => {
    if (child.isMesh) {
      child.receiveShadow = true;
      child.castShadow = false;
      child.material.side = THREE.DoubleSide;
    }
  });
  scene.add(currentRoomMesh);
  window.app.setCamera('standard');
}

// === 6. App Interface ===
window.app = {};

function updateSeatCount() {
    let total = 0;
    movableObjects.forEach(obj => {
        const hitbox = obj.children.find(c => c.userData.typeId);
        if(hitbox) {
            const id = hitbox.userData.typeId;
            total += (ASSETS.furniture[id].seats || 0);
        }
    });
    document.getElementById("seat-count").innerText = total;
}

window.app.toggleUI = function() {
    document.getElementById("ui-container").classList.toggle("hidden");
};

window.app.takeScreenshot = function() {
    renderer.render(scene, camera);
    const link = document.createElement('a');
    link.download = 'raumplan.png';
    link.href = renderer.domElement.toDataURL('image/png');
    link.click();
};

function createFurniture(typeId, x, z, rotY) {
  const info = ASSETS.furniture[typeId];
  if (!info || !info.data) return;

  const group = info.data.clone();
  group.traverse((c) => { 
      if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; c.raycast = () => {}; } 
  });

  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);

  const hitbox = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({visible:false}));
  hitbox.position.set(0, size.y/2, 0);
  hitbox.userData = { root: group, typeId: typeId };
  group.add(hitbox);

  group.position.set(x, FURNITURE_HEIGHT, z);
  group.rotation.y = rotY;

  scene.add(group);
  movableObjects.push(group);
  interactionMeshes.push(hitbox);
  
  updateSeatCount();
}

window.app.addFurniture = function (typeId) {
    createFurniture(typeId, 0, 0, 0);
    const lastObj = movableObjects[movableObjects.length-1];
    if(lastObj) selectObject(lastObj);
};

window.app.loadPreset = function(name) {
    window.app.clearRoom(); 
    const layout = PRESETS[name];
    if(!layout) return;
    
    layout.forEach(item => {
        let px = item.x; let pz = item.z;
        const limX = currentRoomLimits.x - 1.0;
        const limZ = currentRoomLimits.z - 1.0;
        if (px > limX) px = limX; if (px < -limX) px = -limX;
        if (pz > limZ) pz = limZ; if (pz < -limZ) pz = -limZ;
        createFurniture(item.id, px, pz, item.r);
    });
};

window.app.clearRoom = function() {
    movableObjects.forEach(obj => scene.remove(obj));
    movableObjects = [];
    interactionMeshes = [];
    deselectObject();
    updateSeatCount();
};

window.app.rotateSelection = function(dir) {
    if(!selectedRoot) return;
    selectedRoot.rotation.y += (Math.PI/4) * dir;
    selectionBox.update();
};

window.app.deleteSelection = function() {
    deleteSelection();
};

window.app.setCamera = function(mode) {
  controls.enabled = true;
  controls.minDistance = 1;
  if (mode === 'standard') smoothCameraMove(new THREE.Vector3(8, 8, 10), new THREE.Vector3(0, 0, 0));
  else if (mode === 'top') smoothCameraMove(new THREE.Vector3(0, 16, 0.1), new THREE.Vector3(0, 0, 0));
  else if (mode === 'corner') smoothCameraMove(new THREE.Vector3(12, 8, 12), new THREE.Vector3(0, 0, 0));
};

window.app.enterPOV = function() {
  if (!selectedRoot) return;
  const pos = selectedRoot.position.clone();
  const camPos = new THREE.Vector3(pos.x, 1.7, pos.z + 1.5);
  const lookPos = new THREE.Vector3(pos.x, 1.0, pos.z - 2.0);
  smoothCameraMove(camPos, lookPos);
};

// === 7. Interaktion ===
function setEmissive(obj, color) {
    obj.traverse((c) => {
        if(c.isMesh && c.material && c.material.emissive) {
            if(color) {
                if(!c.userData.origEmissive) c.userData.origEmissive = c.material.emissive.clone();
                c.material.emissive.setHex(color);
            } else {
                if(c.userData.origEmissive) c.material.emissive.copy(c.userData.origEmissive);
                else c.material.emissive.setHex(0x000000);
            }
        }
    });
}

function onMouseDown(event) {
  if(event.button !== 0) return;
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(interactionMeshes, false);

  if (intersects.length > 0) {
    const root = intersects[0].object.userData.root;
    isDragging = true;
    controls.enabled = false;
    selectObject(root);
    const planeIntersect = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane, planeIntersect);
    dragOffset.copy(planeIntersect).sub(root.position);
    document.body.style.cursor = "grabbing";
  } else {
    deselectObject();
  }
}

function checkCollision(targetPos, activeObj) {
    const activeId = activeObj.children.find(c => c.userData.typeId)?.userData.typeId || 1;
    const r1 = ASSETS.furniture[activeId].radius * GLOBAL_SCALE; 
    for (let other of movableObjects) {
        if (other === activeObj) continue;
        const otherId = other.children.find(c => c.userData.typeId)?.userData.typeId || 1;
        const r2 = ASSETS.furniture[otherId].radius * GLOBAL_SCALE;
        const dx = targetPos.x - other.position.x;
        const dz = targetPos.z - other.position.z;
        if (Math.sqrt(dx*dx + dz*dz) < (r1 + r2) * 0.75) return true; 
    }
    return false;
}

function snap(val) { return Math.round(val / GRID_SNAP) * GRID_SNAP; }

function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  if (isDragging && selectedRoot) {
      const planeIntersect = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
        const rawPos = planeIntersect.sub(dragOffset);
        let newX = snap(rawPos.x);
        let newZ = snap(rawPos.z);

        const typeId = selectedRoot.children.find(c => c.userData.typeId)?.userData.typeId || 1;
        const radius = ASSETS.furniture[typeId].radius * GLOBAL_SCALE;
        const limitX = currentRoomLimits.x - (radius * 0.6); 
        const limitZ = currentRoomLimits.z - (radius * 0.6);

        newX = Math.max(-limitX, Math.min(limitX, newX));
        newZ = Math.max(-limitZ, Math.min(limitZ, newZ));
        
        const isColliding = checkCollision({x:newX, z:newZ}, selectedRoot);
        
        if (!isColliding) {
             selectedRoot.position.set(newX, selectedRoot.position.y, newZ);
             selectionBox.material.color.setHex(0x00e5ff); 
        } else {
             selectionBox.material.color.setHex(0xff3d00); 
        }
        selectionBox.update();
      }
      return;
  }

  const intersects = raycaster.intersectObjects(interactionMeshes, false);
  if (intersects.length > 0) {
      const root = intersects[0].object.userData.root;
      document.body.style.cursor = "grab";
      if(hoveredRoot !== root) {
          if(hoveredRoot) setEmissive(hoveredRoot, null); 
          setEmissive(root, 0x333333); 
          hoveredRoot = root;
      }
  } else {
      document.body.style.cursor = "default";
      if(hoveredRoot) {
          setEmissive(hoveredRoot, null);
          hoveredRoot = null;
      }
  }
}

function onMouseUp() { 
    isDragging = false; 
    controls.enabled = true; 
    if(hoveredRoot) document.body.style.cursor = "grab";
    else document.body.style.cursor = "default";
}

function onKeyDown(event) {
  if (event.key === "Escape") document.getElementById("ui-container").classList.remove("hidden");
  if (!selectedRoot) return;
  const key = event.key.toLowerCase();
  if (key === "r") { 
      selectedRoot.rotation.y += Math.PI / 4; 
      selectionBox.update();
  }
  if (key === "delete" || key === "backspace") deleteSelection();
}

function selectObject(obj) {
  selectedRoot = obj;
  selectionBox.setFromObject(obj);
  selectionBox.visible = true;
  selectionBox.material.color.setHex(0x00e5ff);
  document.getElementById("selection-context").classList.add("visible");
}

function deselectObject() {
  selectedRoot = null;
  selectionBox.visible = false;
  document.getElementById("selection-context").classList.remove("visible");
}

function deleteSelection() {
  if (selectedRoot) {
    if(hoveredRoot === selectedRoot) hoveredRoot = null;
    scene.remove(selectedRoot);
    movableObjects = movableObjects.filter(o => o !== selectedRoot);
    const hitbox = selectedRoot.children.find(c => c.userData && c.userData.root);
    if(hitbox) interactionMeshes = interactionMeshes.filter(m => m !== hitbox);
    deselectObject();
    updateSeatCount();
  }
}

function smoothCameraMove(targetPos, targetLookAt) {
  const startPos = camera.position.clone();
  const startLook = controls.target.clone();
  const duration = 800;
  const startTime = performance.now();
  function loop(time) {
    const t = Math.min((time - startTime) / duration, 1);
    const ease = t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t; 
    camera.position.lerpVectors(startPos, targetPos, ease);
    controls.target.lerpVectors(startLook, targetLookAt, ease);
    controls.update();
    if (t < 1) requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

init();
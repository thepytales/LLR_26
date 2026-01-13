import * as THREE from "https://esm.sh/three@0.160.0";
import { OrbitControls } from "https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "https://esm.sh/three@0.160.0/examples/jsm/loaders/OBJLoader.js";
import { DRACOLoader } from "https://esm.sh/three@0.160.0/examples/jsm/loaders/DRACOLoader.js";

// === 1. Konfiguration ===
const GLOBAL_SCALE = 0.6; 
const HITBOX_PADDING = 0.3; 
const FURNITURE_Y_OFFSET = 0.02; 

const ASSETS = {
  rooms: {
    "raummodell_leer.glb":    { data: null, playableArea: { x: 4.4, z: 4.3 } },
    "LLR_möbliert(50qm).obj": { data: null, playableArea: { x: 4.5, z: 4.5 }, type: 'obj' },
    "leer_70qm.glb":          { data: null, playableArea: { x: 5.5, z: 5.5 } },
    "leer_30qm.glb":          { data: null, playableArea: { x: 3.5, z: 3.5 } },
  },
  furniture: {
    'row_combo': { file: 'Tischplusstuhleinzeln.glb', radius: 0.8, seats: 1, width: 1.2, depth: 1.0 },
    'tano':      { file: 'trapezTisch.glb', radius: 0.5, seats: 1, width: 1.0, depth: 0.6 },
    'triangle':  { file: 'dreiecksTisch.glb', radius: 0.5, seats: 1 },
    'chair':     { file: 'roterStuhl.glb', radius: 0.35, seats: 1 },
    
    'teacher':   { file: 'Lehrertisch.glb', radius: 1.0, seats: 0 },
    'cupboard':  { file: 'runderSchrank.glb', radius: 0.8, seats: 0 },
    'board':     { file: 'tafel_skaliert.glb', radius: 0.5, seats: 0, isWallItem: true },

    'k1': { file: 'Tischaufstellung1.glb', radius: 1.0, seats: 2 }, 
    'k2': { file: 'Tischaufstellung2.glb', radius: 1.2, seats: 2 },
    'k3': { file: 'Tischaufstellung3.glb', radius: 1.8, seats: 8 },
    'k4': { file: 'Tischkonstellation4.glb', radius: 1.8, seats: 8 },
    'k5': { file: 'Tischkonstellation5.glb', radius: 1.4, seats: 4 },
    'k6': { file: 'Tischkonstellation6.glb', radius: 1.8, seats: 6 }, 
    'k7': { file: 'Tischkonstellation7.glb', radius: 2.2, seats: 11 },
    'k8': { file: 'Tischkonstellation8.glb', radius: 2.0, seats: 9 },
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
let hoveredRoot = null; 

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

// === 3. Initialisierung ===
function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1e1e1e); 

  // Kamera Near Plane auf 0.01 setzen (verhindert Abschneiden bei Zoom)
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 100);
  camera.position.set(8, 12, 12);

  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: "default" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true; // LIVE SCHATTEN
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
  scene.add(hemiLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5, 15, 5);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024; 
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.bias = -0.0001;
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

  toggleLoader(true, "Lade Raum...");
  
  // Nur Raum laden beim Start
  loadRoomAsset("raummodell_leer.glb").then((model) => {
      setupRoom(model, "raummodell_leer.glb");
      toggleLoader(false);
      
      // Background Loading für Möbel, damit sie beim ersten Klick schneller da sind
      loadFurnitureBackground();
      
      animate();
      const sel = document.getElementById('room-select');
      if(sel) sel.addEventListener('change', (e) => app.switchRoom(e.target.value));
  });
}

// === 4. Lazy & Background Loader ===
async function loadFurnitureBackground() {
  const keys = Object.keys(ASSETS.furniture);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    // Langsam nacheinander laden
    await new Promise(r => setTimeout(r, 200));
    getOrLoadFurniture(key); 
  }
}

function getOrLoadFurniture(key) {
    return new Promise((resolve) => {
        const obj = ASSETS.furniture[key];
        if (obj.data) { resolve(obj.data); return; }

        const loader = obj.file.endsWith('.obj') ? objLoader : gltfLoader;
        loader.load("models/" + obj.file, (result) => {
            const model = result.scene || result;
            model.scale.set(GLOBAL_SCALE, GLOBAL_SCALE, GLOBAL_SCALE);
            
            // === WICHTIG: CLIPPING FIX VORBEREITUNG ===
            model.traverse(c => {
                if(c.isMesh) {
                    c.frustumCulled = false; // Nie ausblenden
                    if(c.geometry) {
                        c.geometry.computeBoundingSphere();
                        // RADIUS AUF UNENDLICH SETZEN -> IMMER SICHTBAR
                        c.geometry.boundingSphere.radius = Infinity; 
                    }
                    c.castShadow = true;
                    c.receiveShadow = true;
                }
            });
            
            obj.data = model;
            resolve(model);
        });
    });
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

// === 5. Raum Logik ===
async function switchRoom(filename) {
  const roomInfo = ASSETS.rooms[filename];
  if (!roomInfo) return;
  
  let modelData = roomInfo.data;
  if (!modelData) {
      toggleLoader(true, "Wechsle Raum...");
      try { modelData = await loadRoomAsset(filename); } 
      catch(e) { toggleLoader(false); return; }
      toggleLoader(false);
  }

  if (currentRoomMesh) {
      scene.remove(currentRoomMesh);
      currentRoomMesh.traverse(o => {
          if(o.geometry) o.geometry.dispose();
      });
  }
  window.app.clearRoom();
  setupRoom(modelData, filename);
}

function setupRoom(model, filename) {
  currentRoomFile = filename;
  const roomInfo = ASSETS.rooms[filename];
  
  currentRoomMesh = model.clone();
  const box = new THREE.Box3().setFromObject(currentRoomMesh);
  const center = box.getCenter(new THREE.Vector3());
  currentRoomMesh.position.set(-center.x, 0, -center.z);

  scene.add(currentRoomMesh);
  currentRoomMesh.updateMatrixWorld(true);

  const rayOriginY = 50;
  const scanPoints = [
      new THREE.Vector3(0, rayOriginY, 0),
      new THREE.Vector3(1, rayOriginY, 1),
      new THREE.Vector3(-1, rayOriginY, -1)
  ];
  let detectedFloorY = -Infinity;
  let hitCount = 0;
  const floorRay = new THREE.Raycaster();
  floorRay.ray.direction.set(0, -1, 0);

  scanPoints.forEach(origin => {
      floorRay.ray.origin.copy(origin);
      const hits = floorRay.intersectObject(currentRoomMesh, true);
      if (hits.length > 0) {
          const y = hits[0].point.y;
          if (y > -10 && y < 10) {
              if (y > detectedFloorY) detectedFloorY = y;
              hitCount++;
          }
      }
  });

  if (hitCount > 0 && detectedFloorY !== -Infinity) currentRoomMesh.position.y -= detectedFloorY;
  else currentRoomMesh.position.y = -box.min.y;
  
  currentRoomMesh.updateMatrixWorld(true);
  currentRoomLimits = roomInfo.playableArea;
  
  currentRoomMesh.traverse((child) => {
    if (child.isMesh) {
      child.receiveShadow = true;
      child.castShadow = false;
      child.material.side = THREE.DoubleSide;
      child.frustumCulled = false; 
    }
  });

  updateSeatCount();
  window.app.setCamera('standard');
}

function toggleLoader(show, text) {
    const el = document.getElementById("loader");
    const txt = document.getElementById("loading-text");
    if(show) {
        if(txt && text) txt.innerText = text;
        el.style.opacity = 1;
        el.style.pointerEvents = "auto";
    } else {
        el.style.opacity = 0;
        el.style.pointerEvents = "none";
    }
}

// === 6. Assistent ===
window.app = {};
window.app.switchRoom = switchRoom;

function showNotification(msg) {
    const el = document.getElementById("notification");
    el.innerText = msg;
    el.classList.add("visible");
    setTimeout(() => el.classList.remove("visible"), 3000);
}

function checkBounds(positions) {
    const padding = 0.5; 
    const limitX = currentRoomLimits.x - padding;
    const limitZ = currentRoomLimits.z - padding;
    for (let p of positions) {
        if (Math.abs(p.x) > limitX || Math.abs(p.z) > limitZ) return false;
    }
    return true;
}

window.app.runWizard = async function() {
    const scenario = document.getElementById('wizard-scenario').value;
    const count = parseInt(document.getElementById('wizard-count').value);
    
    let maxSeats = 60;
    if(currentRoomFile.includes("30qm")) maxSeats = 12;
    else if(currentRoomFile.includes("raummodell_leer") || currentRoomFile.includes("50qm")) maxSeats = 16;
    else if(currentRoomFile.includes("70qm")) maxSeats = 20;

    if(scenario === 'circle' && count > maxSeats) {
        showNotification(`Für diesen Raum ist der Stuhlkreis auf ${maxSeats} Plätze begrenzt.`);
        return;
    }

    const limitX = currentRoomLimits.x - 0.5;
    const limitZ = currentRoomLimits.z - 0.5;
    let pending = [];

    switch(scenario) {
        case 'lecture': pending = calcRows(count, limitX, limitZ); break;
        case 'group': pending = calcGroupsK6(count, limitX, limitZ); break;
        case 'exam': pending = calcExam(count, limitX, limitZ); break;
        case 'circle': pending = calcCircle(count, limitX, limitZ); break;
    }

    if (!pending || pending.length === 0 || !checkBounds(pending)) {
        showNotification("Für Ihr Vorhaben brauchen Sie einen größeren Raum.");
        return;
    }

    app.clearRoom();
    
    const typeId = pending[0].id;
    // Warten bis das Asset da ist (Ladeanzeige wenn nötig)
    if (!ASSETS.furniture[typeId].data) toggleLoader(true, "Lade Möbel...");
    await getOrLoadFurniture(typeId);
    toggleLoader(false);

    pending.forEach(p => createFurnitureInstance(p.id, p.x, p.z, p.r));
};

function calcRows(count, lx, lz) {
    const itemWidth = 1.3; 
    const itemDepth = 1.8; 
    const cols = Math.floor((lx * 2) / itemWidth);
    let res = [];
    const startX = -(cols * itemWidth) / 2 + (itemWidth/2);
    const startZ = -(Math.ceil(count/cols) * itemDepth) / 2 + (itemDepth/2);
    for(let i=0; i<count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        res.push({id: 'row_combo', x: startX + (col * itemWidth), z: startZ + (row * itemDepth), r: Math.PI});
    }
    return res;
}

function calcGroupsK6(count, lx, lz) {
    const groupsNeeded = Math.ceil(count / 6);
    let res = [];
    const dist = 2.0; 
    const positions = [
        {x: -dist, z: -dist}, {x: dist, z: -dist},  
        {x: -dist, z: dist}, {x: dist, z: dist},   
        {x: 0, z: 0}, {x: 0, z: -dist}, {x: 0, z: dist}       
    ];
    if(groupsNeeded > positions.length) return null;
    
    const r = ASSETS.furniture['k6'].radius;
    for (let i = 0; i < groupsNeeded; i++) {
        const pos = positions[i];
        if((Math.abs(pos.x) + r) > lx || (Math.abs(pos.z) + r) > lz) return null;
        res.push({id: 'k6', x: pos.x, z: pos.z, r: 0});
    }
    return res;
}

function calcExam(count, lx, lz) {
    const itemWidth = 1.8; 
    const itemDepth = 1.8; 
    const cols = Math.floor((lx * 2) / itemWidth);
    let res = [];
    const startX = -(cols * itemWidth) / 2 + (itemWidth/2);
    const startZ = -lz + 1.5;
    for(let i=0; i<count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        res.push({id: 'row_combo', x: startX + (col * itemWidth), z: startZ + (row * itemDepth), r: Math.PI});
    }
    return res;
}

function calcCircle(count, lx, lz) {
    const radius = Math.min(lx, lz) - 1.0;
    const angleStep = (2 * Math.PI) / count;
    let res = [];
    for(let i=0; i<count; i++) {
        const angle = i * angleStep;
        res.push({id: 'chair', x: Math.sin(angle) * radius, z: Math.cos(angle) * radius, r: angle + Math.PI});
    }
    return res;
}

function updateSeatCount() {
    let total = 0;
    movableObjects.forEach(obj => {
        if(obj.userData.typeId) total += (ASSETS.furniture[obj.userData.typeId].seats || 0);
    });
    document.getElementById("seat-count").innerText = total;
}

window.app.toggleUI = function() { document.getElementById("ui-layer").classList.toggle("hidden"); };
window.app.takeScreenshot = function() {
    renderer.render(scene, camera);
    const link = document.createElement('a');
    link.download = 'raumplan.png';
    link.href = renderer.domElement.toDataURL('image/png');
    link.click();
};

function createFurnitureInstance(typeId, x, z, rotY) {
    const info = ASSETS.furniture[typeId];
    if (!info.data) return;

    const visual = info.data.clone();
    
    // === FINALER CLIPPING FIX AUF CLONES ===
    visual.traverse(c => {
        if(c.isMesh) {
            c.frustumCulled = false; // DEAKTIVIERT CULLING
            if(c.geometry) {
                c.geometry.computeBoundingSphere();
                c.geometry.boundingSphere.radius = Infinity; // SICHERHEITSHALBER UNENDLICH
            }
            c.castShadow = true;
            c.receiveShadow = true;
        }
    });

    const box = new THREE.Box3().setFromObject(visual);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);

    const wrapper = new THREE.Group();
    visual.position.x = -center.x; 
    visual.position.y = -box.min.y; 
    visual.position.z = -center.z;
    
    wrapper.add(visual);

    const hitW = Math.max(size.x + HITBOX_PADDING, 0.8);
    const hitH = Math.max(size.y + HITBOX_PADDING, 1.2);
    const hitD = Math.max(size.z + HITBOX_PADDING, 0.8);
    
    const hitbox = new THREE.Mesh(
        new THREE.BoxGeometry(hitW, hitH, hitD), 
        new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0 }) 
    );
    hitbox.position.y = hitH / 2;
    
    wrapper.userData = { typeId: typeId, root: wrapper, isWallItem: !!info.isWallItem };
    hitbox.userData = { root: wrapper };

    wrapper.add(hitbox);
    wrapper.position.set(x, FURNITURE_Y_OFFSET, z); 
    wrapper.rotation.y = rotY;

    scene.add(wrapper);
    movableObjects.push(wrapper);
    interactionMeshes.push(hitbox);
    
    updateSeatCount();
}

window.app.addFurniture = async function (typeId) {
    // Falls noch nicht geladen, lade jetzt mit Overlay
    if(!ASSETS.furniture[typeId].data) toggleLoader(true, "Lade Objekt...");
    await getOrLoadFurniture(typeId);
    toggleLoader(false);

    createFurnitureInstance(typeId, 0, 0, 0);
    
    setTimeout(() => {
        const lastObj = movableObjects[movableObjects.length-1];
        if(lastObj) selectObject(lastObj);
    }, 50);
};

window.app.clearRoom = function() {
    movableObjects.forEach(obj => {
        scene.remove(obj);
        obj.traverse(c => {
            if(c.geometry) c.geometry.dispose();
        });
    });
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
    if (selectedRoot) {
      if(hoveredRoot === selectedRoot) hoveredRoot = null;
      scene.remove(selectedRoot);
      movableObjects = movableObjects.filter(o => o !== selectedRoot);
      const hitbox = selectedRoot.children.find(c => c.isMesh && c.geometry.type === 'BoxGeometry');
      if(hitbox) interactionMeshes = interactionMeshes.filter(m => m !== hitbox);
      deselectObject();
      updateSeatCount();
    }
};

window.app.setCamera = function(mode) {
  controls.enabled = true;
  document.getElementById('ui-layer').style.pointerEvents = 'none'; 
  
  if (mode === 'standard') smoothCameraMove(new THREE.Vector3(8, 8, 10), new THREE.Vector3(0, 0, 0));
  else if (mode === 'top') smoothCameraMove(new THREE.Vector3(0, 16, 0.1), new THREE.Vector3(0, 0, 0));
  else if (mode === 'corner') smoothCameraMove(new THREE.Vector3(12, 8, 12), new THREE.Vector3(0, 0, 0));
};

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
    const activeId = activeObj.userData.typeId;
    if(activeObj.userData.isWallItem) return false;

    const r1 = ASSETS.furniture[activeId]?.radius || 1.0;
    const scaleFactor = GLOBAL_SCALE * 0.4; 
    for (let other of movableObjects) {
        if (other === activeObj) continue;
        const otherId = other.userData.typeId;
        const r2 = ASSETS.furniture[otherId]?.radius || 1.0;
        const dx = targetPos.x - other.position.x;
        const dz = targetPos.z - other.position.z;
        if (Math.sqrt(dx*dx + dz*dz) < (r1 + r2) * scaleFactor) return true; 
    }
    return false;
}

function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  if (isDragging && selectedRoot) {
      const planeIntersect = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
        const rawPos = planeIntersect.sub(dragOffset);
        
        let newX = rawPos.x;
        let newZ = rawPos.z;
        
        const isWall = selectedRoot.userData.isWallItem;
        const limitX = currentRoomLimits.x;
        const limitZ = currentRoomLimits.z;

        if (isWall) {
            const wallOffset = 0.5; 
            const dRight = Math.abs(limitX - rawPos.x);
            const dLeft = Math.abs(-limitX - rawPos.x);
            const dBottom = Math.abs(limitZ - rawPos.z);
            const dTop = Math.abs(-limitZ - rawPos.z);
            const min = Math.min(dRight, dLeft, dBottom, dTop);

            if (min === dTop) { newZ = -limitZ + wallOffset; selectedRoot.rotation.y = 0; }
            else if (min === dBottom) { newZ = limitZ - wallOffset; selectedRoot.rotation.y = Math.PI; }
            else if (min === dRight) { newX = limitX - wallOffset; selectedRoot.rotation.y = -Math.PI / 2; }
            else if (min === dLeft) { newX = -limitX + wallOffset; selectedRoot.rotation.y = Math.PI / 2; }

            if (min === dTop || min === dBottom) newX = Math.max(-(limitX - 1), Math.min((limitX - 1), rawPos.x));
            else newZ = Math.max(-(limitZ - 1), Math.min((limitZ - 1), rawPos.z));

            selectedRoot.position.set(newX, FURNITURE_Y_OFFSET, newZ);
            selectionBox.material.color.setHex(0x007acc);
        } else {
            const radius = ASSETS.furniture[selectedRoot.userData.typeId]?.radius || 1.0;
            const lX = limitX - (radius * 0.4); 
            const lZ = limitZ - (radius * 0.4);
            newX = Math.max(-lX, Math.min(lX, newX));
            newZ = Math.max(-lZ, Math.min(lZ, newZ));
            
            const isColliding = checkCollision({x:newX, z:newZ}, selectedRoot);
            selectedRoot.position.set(newX, FURNITURE_Y_OFFSET, newZ); 
            selectionBox.material.color.setHex(isColliding ? 0xd73a49 : 0x007acc);
        }
        selectionBox.update();
      }
      return;
  }
  const intersects = raycaster.intersectObjects(interactionMeshes, false);
  if (intersects.length > 0) {
      document.body.style.cursor = "grab";
  } else {
      document.body.style.cursor = "default";
  }
}

function onMouseUp() { 
    if(isDragging) {
        isDragging = false; 
        controls.enabled = true; 
    }
}

function onKeyDown(event) {
  if (event.key === "Escape") app.setCamera('standard'); 
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
  selectionBox.material.color.setHex(0x007acc);
  document.getElementById("context-menu").classList.add("visible");
}

function deselectObject() {
  selectedRoot = null;
  selectionBox.visible = false;
  document.getElementById("context-menu").classList.remove("visible");
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
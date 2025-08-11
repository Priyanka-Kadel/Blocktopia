window.focus();

let camera, scene, renderer, world, lastTime, stack, overhangs;
let boxHeight = 1,
  originalBoxSize = 3,
  autopilot,
  gameEnded,
  robotPrecision,
  combo = 0;

const scoreElement = document.getElementById("score");
const welcomeScreen = document.getElementById("welcome-screen");
const resultsElement = document.getElementById("results");
const startBtn = document.getElementById("start-btn");
const baseWidth = 14;

const perfectAudio = new Audio('assets/27DR015 2.m4a');
perfectAudio.volume = 1;

init();
function init() {
  autopilot = false;
  gameEnded = false;
  lastTime = 0;
  combo = 0;
  stack = [];
  overhangs = [];
  setRobotPrecision();

  world = new CANNON.World();
  world.gravity.set(0, -10, 0);
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 40;

  const aspect = window.innerWidth / window.innerHeight;
  const height = baseWidth / aspect;

  camera = new THREE.OrthographicCamera(
    baseWidth / -2, baseWidth / 2,
    height / 2, height / -2,
    0, 100
  );
  camera.position.set(6, 8, 6);
  camera.lookAt(0, 0, 0);

  scene = new THREE.Scene();

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(new THREE.Color(0x000000)); // black
  renderer.setAnimationLoop(animation);
  document.body.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight.position.set(10, 20, 0);
  scene.add(dirLight);

  window.addEventListener("resize", onWindowResize);

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("mousedown", onUserAction);
  window.addEventListener("touchstart", onUserAction);

  startBtn.addEventListener("click", () => {
    startGame();
  });
  updateScore(0);
}
function onWindowResize() {
  const aspect = window.innerWidth / window.innerHeight;
  const height = baseWidth / aspect;

  camera.left = baseWidth / -2;
  camera.right = baseWidth / 2;
  camera.top = height / 2;
  camera.bottom = height / -2;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.render(scene, camera);
}

function setRobotPrecision() {
  robotPrecision = Math.random() * 1 - 0.5;
}

function startGame() {
  autopilot = false;
  gameEnded = false;
  lastTime = 0;
  combo = 0;
  stack = [];
  overhangs = [];

  updateScore(0);

  if (welcomeScreen) welcomeScreen.style.display = "none";
  if (resultsElement) resultsElement.style.display = "none";


  while (world.bodies.length > 0) {
    world.remove(world.bodies[0]);
  }

  scene.children
    .filter(c => c.type === "Mesh" || c.type === "Group")
    .forEach(c => scene.remove(c));

  addLayer(0, 0, originalBoxSize, originalBoxSize);
  addLayer(-10, 0, originalBoxSize, originalBoxSize, "x");

  camera.position.set(4, 4, 4);
  camera.lookAt(0, 0, 0);
}

function onUserAction() {
  if (autopilot) startGame();
  else splitBlockAndAddNextOneIfOverlaps();
}

function onKeyDown(event) {
  if (event.key === " ") {
    event.preventDefault();
    onUserAction();
  }
  if (event.key.toLowerCase() === "r") {
    event.preventDefault();
    startGame();
  }
}
function addLayer(x, z, width, depth, direction) {
  const y = boxHeight * stack.length;
  const layer = generateBox(x, y, z, width, depth, false);
  layer.direction = direction;
  stack.push(layer);
}

function addOverhang(x, z, width, depth) {
  const y = boxHeight * (stack.length - 1);
  const overhang = generateBox(x, y, z, width, depth, true);
  overhangs.push(overhang);
}

function generateBox(x, y, z, width, depth, falls) {
  const geometry = new THREE.BoxGeometry(width, boxHeight, depth);
  const color = new THREE.Color(`hsl(${30 + stack.length * 4}, 100%, 50%)`);
  const material = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  scene.add(mesh);

  const shape = new CANNON.Box(new CANNON.Vec3(width / 2, boxHeight / 2, depth / 2));
  let mass = falls ? 5 : 0;
  mass *= width / originalBoxSize;
  mass *= depth / originalBoxSize;

  const body = new CANNON.Body({ mass, shape });
  body.position.set(x, y, z);
  world.addBody(body);

  return { threejs: mesh, cannonjs: body, width, depth };
}

function cutBox(topLayer, overlap, size, delta) {
  const direction = topLayer.direction;
  const newWidth = direction === "x" ? overlap : topLayer.width;
  const newDepth = direction === "z" ? overlap : topLayer.depth;

  topLayer.width = newWidth;
  topLayer.depth = newDepth;

  topLayer.threejs.scale[direction] = overlap / size;
  topLayer.threejs.position[direction] -= delta / 2;
  topLayer.cannonjs.position[direction] -= delta / 2;

  const shape = new CANNON.Box(new CANNON.Vec3(newWidth / 2, boxHeight / 2, newDepth / 2));
  topLayer.cannonjs.shapes = [];
  topLayer.cannonjs.addShape(shape);
}

function splitBlockAndAddNextOneIfOverlaps() {
  if (gameEnded) return;

  const topLayer = stack[stack.length - 1];
  const previousLayer = stack[stack.length - 2];
  const direction = topLayer.direction;
  const size = direction === "x" ? topLayer.width : topLayer.depth;
  const delta = topLayer.threejs.position[direction] - previousLayer.threejs.position[direction];

  let overhangSize = Math.abs(delta);
  const overlap = size - overhangSize;
  const EPS = 0.03;

  if (overlap > 0) {
    if (overhangSize <= EPS) {
      overhangSize = 0;
      topLayer.threejs.position[direction] = previousLayer.threejs.position[direction];
      topLayer.cannonjs.position[direction] = previousLayer.cannonjs.position[direction];
      combo++;
      celebratePerfectAlignment(combo);
    } else {
      combo = 0;
    }

    const realOverlap = size - overhangSize;
    cutBox(topLayer, realOverlap, size, delta);

    const overhangShift = (realOverlap / 2 + overhangSize / 2) * Math.sign(delta);
    const overhangX = direction === "x" ? topLayer.threejs.position.x + overhangShift : topLayer.threejs.position.x;
    const overhangZ = direction === "z" ? topLayer.threejs.position.z + overhangShift : topLayer.threejs.position.z;
    const overhangWidth = direction === "x" ? overhangSize : topLayer.width;
    const overhangDepth = direction === "z" ? overhangSize : topLayer.depth;

    if (overhangSize > 0.0001) addOverhang(overhangX, overhangZ, overhangWidth, overhangDepth);

    const nextX = direction === "x" ? topLayer.threejs.position.x : -10;
    const nextZ = direction === "z" ? topLayer.threejs.position.z : -10;
    const newWidth = topLayer.width;
    const newDepth = topLayer.depth;
    const nextDirection = direction === "x" ? "z" : "x";

    updateScore(stack.length - 1);
    addLayer(nextX, nextZ, newWidth, newDepth, nextDirection);
  } else {
    combo = 0;
    missedTheSpot();
  }
}

function missedTheSpot() {
  const topLayer = stack[stack.length - 1];
  addOverhang(topLayer.threejs.position.x, topLayer.threejs.position.z, topLayer.width, topLayer.depth);
  world.remove(topLayer.cannonjs);
  scene.remove(topLayer.threejs);
  gameEnded = true;
  if (resultsElement && !autopilot) resultsElement.style.display = "flex";
}

function updateScore(score) {
  if (scoreElement) scoreElement.innerText = score;
}


function animation(time) {
  if (!lastTime) {
    lastTime = time;
    renderer.render(scene, camera);
    return;
  }

  const timePassed = time - lastTime;

  if (gameEnded || stack.length === 0) {
    renderer.render(scene, camera);
    lastTime = time;
    return;
  }

  const baseSpeed = 0.006;
  const speed = baseSpeed + stack.length * 0.0001;

  const topLayer = stack[stack.length - 1];
  const previousLayer = stack[stack.length - 2];

  const boxShouldMove = !gameEnded && (!autopilot || (autopilot && topLayer.threejs.position[topLayer.direction] < previousLayer.threejs.position[topLayer.direction] + robotPrecision));

  if (boxShouldMove) {
    topLayer.threejs.position[topLayer.direction] += speed * timePassed;
    topLayer.cannonjs.position[topLayer.direction] += speed * timePassed;

    if (topLayer.threejs.position[topLayer.direction] > 10) {
      missedTheSpot();
    }
  } else if (autopilot) {
    splitBlockAndAddNextOneIfOverlaps();
    setRobotPrecision();
  }

  const targetY = boxHeight * (stack.length - 2) + 4;
  camera.position.y += (targetY - camera.position.y) * 0.1;

  updatePhysics(timePassed);
  renderer.render(scene, camera);

  lastTime = time;
}

function updatePhysics(timePassed) {
  world.step(timePassed / 1000);
  overhangs.forEach(el => {
    el.threejs.position.copy(el.cannonjs.position);
    el.threejs.quaternion.copy(el.cannonjs.quaternion);
  });
}

function celebratePerfectAlignment(combo = 1) {
  const topLayer = stack[stack.length - 1];
  const mesh = topLayer.threejs;


  perfectAudio.currentTime = 0;
  perfectAudio.play();


  const loader = new THREE.FontLoader();
  loader.load("https://threejs.org/examples/fonts/helvetiker_bold.typeface.json", font => {
    const group = new THREE.Group();

    const perfectGeo = new THREE.TextGeometry("PERFECT!", {
      font,
      size: 0.6,
      height: 0.1,
    });
    const perfectMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const perfectMesh = new THREE.Mesh(perfectGeo, perfectMat);
    perfectMesh.position.set(mesh.position.x - 1.5, mesh.position.y + 1.5, mesh.position.z);
    group.add(perfectMesh);

    if (combo > 1) {
      const comboGeo = new THREE.TextGeometry(`X${combo} Combo!`, {
        font,
        size: 0.4,
        height: 0.1,
      });
      const comboMat = new THREE.MeshBasicMaterial({ color: 0xff69b4 });
      const comboMesh = new THREE.Mesh(comboGeo, comboMat);
      comboMesh.position.set(mesh.position.x - 1.1, mesh.position.y + 1, mesh.position.z);
      group.add(comboMesh);
    }

    scene.add(group);

    let opacity = 1;

    function fadeText() {
      opacity -= 0.04;
      group.children.forEach(c => {
        c.material.opacity = opacity;
        c.material.transparent = true;
      });
      group.position.y += 0.02;
      if (opacity > 0) requestAnimationFrame(fadeText);
      else scene.remove(group);
    }

    fadeText();
  });


  const originalColor = mesh.material.color.clone();
  const originalScale = mesh.scale.clone();
  let t = 0;
  const duration = 18;

  function pulseFrame() {
    t++;
    const p = t / duration;
    const scaleFactor = 1 + 0.25 * Math.sin(p * Math.PI) * Math.min(combo, 4);
    mesh.scale.set(
      originalScale.x * scaleFactor,
      originalScale.y,
      originalScale.z * scaleFactor
    );
    mesh.material.color.setHSL((30 + Math.random() * 300) / 360, 1, 0.55);

    if (t < duration) requestAnimationFrame(pulseFrame);
    else {
      mesh.scale.copy(originalScale);
      mesh.material.color.copy(originalColor);
    }
  }

  pulseFrame();
}

let particles = [];
let octree;
let particleSize = 2;
let gridSize = 4;
let particleCount = 1000;
let G = 0.01;
let theta = 0.5;
const CONTROL_WIDTH = 300;
let font;

// DOM elements for controls
let particleSizeSlider, gridSizeSlider, particleCountSlider;
let particleSizeText, gridSizeText, particleCountText, particlesCountText, gridsCountText;

// MediaPipe Hands
let hands;
let video;
let handLandmarks = null;
let cameraInitialized = false;
let webcamCanvas;
let webcamContext;

// Pinch zoom variables
let pinchDistance = null;
let baseZoom = 800; // Base camera z-position
let zoomLevel = baseZoom; // Current zoom level
let deepZoomActive = false; // Toggle for deep zoom mode
let lastPinchTime = 0; // Track time of last pinch
const DOUBLE_PINCH_THRESHOLD = 300; // Time in ms for double pinch detection
const PINCH_SENSITIVITY_NORMAL = 5; // Normal zoom sensitivity
const PINCH_SENSITIVITY_DEEP = 15; // Deep zoom sensitivity

function preload() {
  font = loadFont('https://cdnjs.cloudflare.com/ajax/libs/topcoat/0.8.0/font/SourceCodePro-Regular.otf');
}

function setup() {
  createCanvas(windowWidth - CONTROL_WIDTH, windowHeight, WEBGL);
  console.log('Canvas created:', windowWidth - CONTROL_WIDTH, windowHeight);

  let controlPanel = select('#control-panel');
  console.log('Control panel selected:', controlPanel);

  video = document.getElementById('webcam-feed');
  webcamCanvas = document.getElementById('webcam-canvas');
  webcamContext = webcamCanvas.getContext('2d');

  // Create sliders and text
  particleSizeText = createP('Particle Size: 2');
  particleSizeText.parent(controlPanel);
  particleSizeText.position(20, 230);
  particleSizeSlider = createSlider(1, 10, 2, 1);
  particleSizeSlider.parent(controlPanel);
  particleSizeSlider.position(20, 260);

  gridSizeText = createP('Grid Capacity: 4');
  gridSizeText.parent(controlPanel);
  gridSizeText.position(20, 290);
  gridSizeSlider = createSlider(1, 8, 4, 1);
  gridSizeSlider.parent(controlPanel);
  gridSizeSlider.position(20, 320);

  particleCountText = createP('Particle Count: 1000');
  particleCountText.parent(controlPanel);
  particleCountText.position(20, 350);
  particleCountSlider = createSlider(100, 1000, 1000, 100);
  particleCountSlider.parent(controlPanel);
  particleCountSlider.position(20, 380);

  particlesCountText = createP('Particles: 1000');
  particlesCountText.parent(controlPanel);
  particlesCountText.position(20, 410);

  gridsCountText = createP('Grids: 0');
  gridsCountText.parent(controlPanel);
  gridsCountText.position(20, 440);

  // Style sliders
  let sliders = [particleSizeSlider, gridSizeSlider, particleCountSlider];
  sliders.forEach(slider => slider.style('width', '260px'));

  // Initialize MediaPipe Hands
  hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  hands.onResults(onHandResults);

  initializeParticles();
  ambientLight(100);
  pointLight(255, 255, 255, 0, 0, 500);
}

function windowResized() {
  resizeCanvas(windowWidth - CONTROL_WIDTH, windowHeight);
  particleSizeSlider.position(20, 260);
  gridSizeSlider.position(20, 320);
  particleCountSlider.position(20, 380);

  particleSizeText.position(20, 230);
  gridSizeText.position(20, 290);
  particleCountText.position(20, 350);
  particlesCountText.position(20, 410);
  gridsCountText.position(20, 440);
}

function draw() {
  background(0);

  if (!cameraInitialized && typeof Camera !== 'undefined') {
    const camera = new Camera(video, {
      onFrame: async () => {
        await hands.send({ image: video });
      },
      width: 280,
      height: 210
    });
    camera.start();
    cameraInitialized = true;
    console.log('Camera initialized');
  } else if (!cameraInitialized) {
    console.log('Waiting for Camera to be defined...');
  }

  // Update simulation parameters
  particleSize = particleSizeSlider.value();
  gridSize = gridSizeSlider.value();
  let newCount = particleCountSlider.value();

  if (newCount !== particles.length) {
    particleCount = newCount;
    initializeParticles();
  }

  let boundary = new Box(0, 0, 0, width/4, height/4, width/4);
  octree = new Octree(boundary, gridSize);

  for (let p of particles) {
    octree.insert(p);
  }

  let gridCount = octree.countNodes();

  // Update HTML text
  particleSizeText.html(`Particle Size: ${particleSize}`);
  gridSizeText.html(`Grid Capacity: ${gridSize}`);
  particleCountText.html(`Particle Count: ${particleCount}`);
  particlesCountText.html(`Particles: ${particles.length}`);
  gridsCountText.html(`Grids: ${gridCount}`);

  // Camera control with hand tracking
  if (handLandmarks) {
    let wrist = handLandmarks[0]; // Wrist landmark
    let x = map(wrist.x, 0, 1, -width/2, width/2);
    let y = map(wrist.y, 0, 1, -height/2, height/2);
    let z = map(wrist.z, -0.2, 0.2, -width/4, width/4);

    // Pinch zoom detection
    let thumbTip = handLandmarks[4]; // THUMB_TIP
    let indexTip = handLandmarks[8]; // INDEX_FINGER_TIP
    let currentPinchDist = dist(thumbTip.x, thumbTip.y, indexTip.x, indexTip.y);

    if (pinchDistance !== null) {
      let pinchDelta = currentPinchDist - pinchDistance;
      let sensitivity = deepZoomActive ? PINCH_SENSITIVITY_DEEP : PINCH_SENSITIVITY_NORMAL;
      zoomLevel -= pinchDelta * sensitivity * width / 10; // Scale zoom with canvas width
      zoomLevel = constrain(zoomLevel, 100, 1800); // Limit zoom range
    }
    pinchDistance = currentPinchDist;

    // Check for double pinch
    if (currentPinchDist < 0.05) { // Pinch threshold
      let currentTime = millis();
      if (currentTime - lastPinchTime < DOUBLE_PINCH_THRESHOLD) {
        deepZoomActive = !deepZoomActive; // Toggle deep zoom mode
        console.log('Double pinch detected, deep zoom:', deepZoomActive);
      }
      lastPinchTime = currentTime;
    }

    camera(x, y, z + zoomLevel, 0, 0, 0, 0, 1, 0); // Apply zoom
  } else {
    pinchDistance = null; // Reset pinch distance when no hand detected
    orbitControl(); // Fallback to mouse control
  }

  push();
  stroke(255, 0, 0);
  strokeWeight(5);
  point(0, 0, 0);
  pop();

  octree.show();
  for (let p of particles) {
    p.applyForces();
    p.update();
    p.show();
  }

  // Draw hand landmarks on webcam feed
  if (handLandmarks) {
    webcamContext.clearRect(0, 0, webcamCanvas.width, webcamCanvas.height);
    drawConnectors(webcamContext, handLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 1 });
    drawLandmarks(webcamContext, handLandmarks, { color: '#FFFFFF', lineWidth: 1 });
  }
}

function onHandResults(results) {
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    handLandmarks = results.multiHandLandmarks[0]; // First hand
  } else {
    handLandmarks = null;
  }
}

function initializeParticles() {
  particles = [];
  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle(
      random(-width/4, width/4),
      random(-height/4, height/4),
      random(-width/4, width/4),
      random(-0.5, 0.5),
      random(-0.5, 0.5),
      random(-0.5, 0.5),
      1,
      i
    ));
  }
  console.log('Particles initialized:', particles.length);
}

class Particle {
  constructor(x, y, z, vx, vy, vz, m, id) {
    this.pos = createVector(x, y, z);
    this.vel = createVector(vx, vy, vz);
    this.acc = createVector(0, 0, 0);
    this.mass = m;
    this.id = id;
    this.inSwirl = false;
  }
  
  applyForces() {
    this.acc.mult(0);
    octree.calculateForce(this);
    
    this.inSwirl = false;
    let mousePos = screenToWorld(mouseX, mouseY);
    let d = p5.Vector.sub(this.pos, mousePos);
    let distance = d.mag();
    if (distance < 100 && distance > 0) {
      this.inSwirl = true;
      let swirlForce = createVector(-d.y, d.x, d.z);
      let strength = 0.05 * (100 - distance) / distance;
      swirlForce.normalize().mult(strength);
      this.acc.add(swirlForce);
    }
  }
  
  update() {
    this.vel.add(this.acc);
    this.vel.limit(3);
    this.pos.add(this.vel);
    
    let boundaryX = width/4;
    let boundaryY = height/4;
    let boundaryZ = width/4;
    
    if (this.pos.x > boundaryX) this.pos.x = -boundaryX;
    if (this.pos.x < -boundaryX) this.pos.x = boundaryX;
    if (this.pos.y > boundaryY) this.pos.y = -boundaryY;
    if (this.pos.y < -boundaryY) this.pos.y = boundaryY;
    if (this.pos.z > boundaryZ) this.pos.z = -boundaryZ;
    if (this.pos.z < -boundaryZ) this.pos.z = boundaryZ;
  }
  
  show() {
    push();
    translate(this.pos.x, this.pos.y, this.pos.z);
    if (this.inSwirl) {
      stroke(255, 255, 0);
    } else {
      stroke(255, 0, 255);
    }
    strokeWeight(particleSize);
    point(0, 0, 0);
    
    if (this.id < 1000) {
      textFont(font);
      fill(this.inSwirl ? [255, 255, 255] : [255, 0, 255]);
      textSize(8);
      text(this.id, 5, -5);
    }
    pop();
  }
}

class Box {
  constructor(x, y, z, w, h, d) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    this.h = h;
    this.d = d;
  }
  
  contains(particle) {
    return (particle.pos.x >= this.x - this.w &&
            particle.pos.x <= this.x + this.w &&
            particle.pos.y >= this.y - this.h &&
            particle.pos.y <= this.y + this.h &&
            particle.pos.z >= this.z - this.d &&
            particle.pos.z <= this.z + this.d);
  }
}

class Octree {
  constructor(boundary, capacity) {
    this.boundary = boundary;
    this.capacity = capacity;
    this.particles = [];
    this.divided = false;
    this.centerOfMass = createVector(0, 0, 0);
    this.totalMass = 0;
  }
  
  insert(particle) {
    if (!this.boundary.contains(particle)) return false;
    
    this.centerOfMass.add(p5.Vector.mult(particle.pos, particle.mass));
    this.totalMass += particle.mass;
    
    if (this.particles.length < this.capacity) {
      this.particles.push(particle);
      return true;
    }
    
    if (!this.divided) this.subdivide();
    
    return (this.children[0].insert(particle) ||
            this.children[1].insert(particle) ||
            this.children[2].insert(particle) ||
            this.children[3].insert(particle) ||
            this.children[4].insert(particle) ||
            this.children[5].insert(particle) ||
            this.children[6].insert(particle) ||
            this.children[7].insert(particle));
  }
  
  subdivide() {
    let x = this.boundary.x;
    let y = this.boundary.y;
    let z = this.boundary.z;
    let w = this.boundary.w/2;
    let h = this.boundary.h/2;
    let d = this.boundary.d/2;
    
    this.children = [
      new Octree(new Box(x - w, y - h, z - d, w, h, d), this.capacity),
      new Octree(new Box(x + w, y - h, z - d, w, h, d), this.capacity),
      new Octree(new Box(x - w, y + h, z - d, w, h, d), this.capacity),
      new Octree(new Box(x + w, y + h, z - d, w, h, d), this.capacity),
      new Octree(new Box(x - w, y - h, z + d, w, h, d), this.capacity),
      new Octree(new Box(x + w, y - h, z + d, w, h, d), this.capacity),
      new Octree(new Box(x - w, y + h, z + d, w, h, d), this.capacity),
      new Octree(new Box(x + w, y + h, z + d, w, h, d), this.capacity)
    ];
    this.divided = true;
  }
  
  calculateForce(particle) {
    if (this.totalMass === 0) return;
    
    if (!this.divided && this.particles.length > 0) {
      for (let other of this.particles) {
        if (other !== particle) {
          let force = this.getForce(particle, other);
          particle.acc.add(force);
        }
      }
    } else if (this.totalMass > 0) {
      let s = this.boundary.w * 2;
      let com = p5.Vector.div(this.centerOfMass, this.totalMass);
      let d = p5.Vector.dist(particle.pos, com);
      
      if (d === 0 || (s/d) < theta) {
        let force = this.getForce(particle, { pos: com, mass: this.totalMass });
        particle.acc.add(force);
      } else if (this.divided) {
        for (let child of this.children) {
          child.calculateForce(particle);
        }
      }
    }
  }
  
  getForce(p1, p2) {
    let d = p5.Vector.sub(p2.pos, p1.pos);
    let distance = d.mag();
    distance = constrain(distance, 5, width/4);
    let magnitude = (G * p1.mass * p2.mass) / (distance * distance);
    return d.normalize().mult(magnitude);
  }
  
  show() {
    push();
    translate(this.boundary.x, this.boundary.y, this.boundary.z);
    stroke(0, 255, 0);
    strokeWeight(1);
    noFill();
    box(this.boundary.w * 2, this.boundary.h * 2, this.boundary.d * 2);
    pop();
    
    if (this.divided) {
      for (let child of this.children) {
        child.show();
      }
    }
  }
  
  countNodes() {
    let count = 1;
    if (this.divided) {
      for (let child of this.children) {
        count += child.countNodes();
      }
    }
    return count;
  }
}

function screenToWorld(mx, my) {
  let x = map(mx, 0, width, -width/2, width/2);
  let y = map(my, 0, height, -height/2, height/2);
  return createVector(x, y, 0);
}
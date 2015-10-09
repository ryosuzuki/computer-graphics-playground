
var container, stats;
var camera, scene, renderer;
var splineHelperObjects = [],
    splineOutline;
var splinePointsLength = 4;
var positions = [];
var options;

var geometry = new THREE.BoxGeometry( 20, 20, 20 );

var ARC_SEGMENTS = 200;
var splineMesh;

var splines = {

};
var box;
var boxHelperObjects = [];

var raycaster = new THREE.Raycaster()
var mouse = new THREE.Vector2();
var lane = null
var selection = null
var offset = new THREE.Vector3()
var objects = [];
var plane;
var hover = false;
var draggable = false;

var mouse2D;
var projector;
var oldPosition;
var dimention = 'xz';
var point;
var pos;
var oldPoint = { x:0, y:0, z:0 };
var oldPos = { x:0, y:0, z:0 };

var size = 200;

var renderStats;
var physicsStats;


var world = new CANNON.World();
var timeStep = 1.0 / 60.0;
var scale = 1;
var size = scale;
var boxBody;
var selectedBody;


function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 10000);
  camera.position.set(scale*5, scale*5, scale*5)
  scene.add( camera );

  scene.add(new THREE.AmbientLight(0xf0f0f0));
  var light = new THREE.SpotLight(0xffffff, 1.5);
  light.position.set(0, scale*7.5, scale);
  light.castShadow = true;
  light.shadowCameraNear = scale;
  light.shadowCameraFar = camera.far;
  light.shadowCameraFov = 70;
  light.shadowBias = -0.000222;
  light.shadowDarkness = 0.25;
  light.shadowMapWidth = 1024;
  light.shadowMapHeight = 1024;
  scene.add(light);
  spotlight = light;

  var gridHelper = new THREE.GridHelper(scale*5, scale/2);
  gridHelper.position.y = 0;
  gridHelper.material.opacity = 0.25;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);

  var planeGeometry = new THREE.PlaneGeometry(scale*10, scale*10, 20, 20);
  planeGeometry.rotateX( - Math.PI / 2 );
  var planeMaterial = new THREE.MeshBasicMaterial( { color: 0xeeeeee } );
  plane = new THREE.Mesh( planeGeometry, planeMaterial );
  plane.position.y = 0;
  plane.receiveShadow = true;
  scene.add( plane );

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setClearColor(0xf0f0f0);
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.shadowMap.enabled = true;
  document.getElementById('viewport').appendChild( renderer.domElement );

  controls = new THREE.OrbitControls( camera, renderer.domElement );
  controls.damping = 0.2;
  controls.addEventListener( 'change', render );

  stats = new Stats();
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.top = '10px';
  stats.domElement.style.right = '20px';
  stats.domElement.style.zIndex = 100;
  document.getElementById('viewport').appendChild(stats.domElement);

  mouse2D = new THREE.Vector3(0, 10000, 0.5);
  projector = new THREE.Projector();
  tmpVec = new THREE.Vector3();
}

function initCannon () {
  world.gravity.set(0, -10, 0);
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 10;
  world.step(timeStep);

  var groundShape = new CANNON.Plane();
  var groundBody = new CANNON.Body({ mass: 0 })
  groundBody.addShape(groundShape)
  groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(scale, 0, 0),-Math.PI/2);
  groundBody.position.y = -scale*0.5;
  world.add(groundBody)

  var mass = scale;
  var boxShape = new CANNON.Box(new CANNON.Vec3(size, size, size));
  boxBody = new CANNON.Body({ mass: mass })
  boxBody.addShape(boxShape);
  boxBody.position.set(0, 3, 0);
  world.add(boxBody);

  var selectedShape = new CANNON.Sphere(0.1);
  selectedBody = new CANNON.Body({ mass: 0 });
  selectedBody.addShape(selectedShape);
  selectedBody.collisionFilterGroup = 0;
  selectedBody.collisionFilterMask = 0;
  world.add(selectedBody)
}


function drawObject() {
  var size = scale;
  var geometry = new THREE.BoxGeometry(size, size, size);
  var material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  box = new THREE.Mesh(geometry, material);
  box.castShadow = true;
  box.receiveShadow = true;
  scene.add(box);
  objects.push(box);
  boxHelperObjects.push(box);
  positions.push(boxHelperObjects[0].position);
}

function dragObject() {
  var dragcontrols = new THREE.DragControls( camera, boxHelperObjects, renderer.domElement ); //
  dragcontrols.on( 'hoveron', function( e ) {
    hover = true;
  })
  dragcontrols.on( 'hoveroff', function( e ) {
    if (!draggable) hover = false;
  })

  document.addEventListener('mousedown', onDocumentMouseDown, false);
  document.addEventListener('mousemove', onDocumentMouseMove, false);
  document.addEventListener('mouseup', onDocumentMouseUp, false);
}

function onDocumentMouseDown (event) {
  if (!hover) return false;
  draggable = true;
  controls.enabled = false;

  var mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  var mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
  var vector = new THREE.Vector3(mouseX, mouseY, 1);
  vector.unproject(camera);

  var dir = vector.sub(camera.position).normalize()
  raycaster.set(camera.position, dir);
  var intersects = raycaster.intersectObjects(objects);
  if (intersects.length > 0) {
    selected = intersects[0].object;
    var point = intersects[0].point;
    selectedBody.position.set(point.x, point.y, point.z);

    /*
    intersector = getRealIntersector(intersects);
    if (!intersector) return false;
    point = intersector.point;
    var distance = - camera.position.z / dir.z;
    pos = camera.position.clone().add( dir.multiplyScalar( distance ) );
    if (dimention == 'xz') {
      box.position.set(point.x, box.position.y, point.z);
    } else if (dimention == 'x') {
      box.position.setX(point.x);
    } else if (dimention == 'y') {
      if (pos.y < 0) return false;
      // box.translateY((pos.y)/40)
      box.position.setY(pos.y);
    } else if (dimention == 'z') {
      box.position.setZ(point.z);
    }
    */
  }

}

function onDocumentMouseMove (event) {
  if (!hover || !draggable) return false;
  event.preventDefault();
}

function onDocumentMouseUp (event) {
  controls.enabled = true;
  draggable = false;
  hover = false;
  if (point) oldPoint = point;
  if (pos) oldPos = pos;
}

function getRealIntersector( intersects ) {
  for( i = 0; i < intersects.length; i++ ) {
    intersector = intersects[ i ];
    if ( intersector.object != box ) {
      return intersector;
    }
  }
  return null;
}

var lastCallTime = 0;
var maxSubSteps = 3;
function updatePhysics(){
  var now = Date.now() / 1000;
  if(!lastCallTime){
    world.step(timeStep);
    lastCallTime = now;
    return;
  }
  var timeSinceLastCall = now - lastCallTime;
  world.step(timeStep, timeSinceLastCall, maxSubSteps);
  lastCallTime = now;
  box.position.copy(boxBody.position);
}

function animate(){
  requestAnimationFrame(animate);
  updatePhysics();
  render();
  stats.update();
}

function render() {
  controls.update();
  renderer.clear();
  renderer.render(scene, camera);
}


$( function () {
  init();
  initCannon();
  drawObject();
  dragObject();
  animate();

  $('#init').click( function() {
    box.position.set(0,0,0)
  });
  $('#xz').click( function() {
    dimention = 'xz';
  });
  $('#x').click( function() {
    dimention = 'x';
  });
  $('#y').click( function() {
    dimention = 'y';
  });
  $('#z').click( function() {
    dimention = 'z';
  });
});



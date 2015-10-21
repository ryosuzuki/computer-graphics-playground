
var container, stats;
var camera, scene, renderer;
var splineHelperObjects = [],
    splineOutline;
var splinePointsLength = 4;
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
var ground;
var grid;
var hover = false;
var draggable = false;
var dragging = false;

var vector;
var dir;

var mouse2D;
var projector;
var oldPosition;
var dimention = 'xz';
var point;
var pos;
var selected;
var size = 200;

var renderStats;
var physicsStats;


var world = new CANNON.World();
var timeStep = 1.0 / 60.0;
var scale = 1;
var size = scale;
var boxBody;
var groundBody;
var boxBody;
var cylinderBody;
var selectedBody;
var bodies = [];
var meshes = [];
var draggableMeshes = [];

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 10000);
  camera.position.set(scale*5, scale*5, scale*5)
  camera.lookAt(new THREE.Vector3(0, 3, 0));
  scene.add( camera );

  scene.add(new THREE.AmbientLight(0xf0f0f0));
  var light = new THREE.SpotLight(0xffffff, 1.5);
  light.position.set(0, scale*7.5, scale);
  light.castShadow = true;
  light.shadowCameraNear = scale*3;
  light.shadowCameraFar = camera.far;
  light.shadowCameraFov = 70;
  light.shadowBias = -0.000222;
  light.shadowDarkness = 0.25;
  light.shadowMapWidth = 1024;
  light.shadowMapHeight = 1024;
  scene.add(light);
  spotlight = light;

  grid = new THREE.GridHelper(scale*5, scale/2);
  grid.position.y = 0.01;
  grid.material.opacity = 0.25;
  grid.material.transparent = true;
  scene.add(grid);

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
}

var vertices = [];
var faces = [];
var geometry = new THREE.Geometry();
var gearMesh;

function drawObjects () {
  gear = involuteGear(20, 10);
  var polygons = gear.polygons;
  for (var i=0; i<polygons.length; i++) {
    var polygon = polygons[i];
    var indices = polygon.vertices.map(function (vertex) {
      var vertextag = vertex.getTag();
      var vertexindex = vertices.length;
      vertices.push(new THREE.Vector3(vertex.pos.x, vertex.pos.y, vertex.pos.z));
      return vertexindex;
    });
    for (var j=2; j<indices.length; j++) {
      var a = vertices[0];
      var b = vertices[j-1];
      var c = vertices[j];
      // v = AB x BC = (b-a) x (c-a)
      // sign = v * a
      // sign < 0 -> counteclocwise
      var ab = b.subVectors(b, a);
      var bc = c.subVectors(c, b);
      var ccw = ab.crossVectors(ab, bc).dot(a);
      var face = (ccw > 0) ? new THREE.Face3(indices[0], indices[j-1], indices[j]) : new THREE.Face3(indices[0], indices[j], indices[j-1]);
      faces.push(face);
    }
  }
  geometry.vertices = vertices;
  geometry.faces = faces;
  geometry.computeBoundingSphere();
  var material = new THREE.MeshBasicMaterial( { color: 0xffff00 } );
  material.side = THREE.DoubleSide;
  gearMesh = new THREE.Mesh( geometry, material );
  gearMesh.castShadow = true;
  gearMesh.receiveShadow = true;
  scene.add(gearMesh);

}


function onDocumentMouseDown (event) {
  if (!hover) return false;
  draggable = true;
  controls.enabled = false;

  var mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  var mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
  vector = new THREE.Vector3(mouseX, mouseY, 1);
  vector.unproject(camera);
  dir = vector.sub(camera.position).normalize()
  raycaster.set(camera.position, dir);
  var intersects = raycaster.intersectObjects(objects);
  if (intersects.length > 0) {
    selected = intersects[0];
    window.hoge = selected;
    console.log(selected)
  }
}



function onDocumentMouseMove (event) {
  if (!selected) return false;
  event.preventDefault();

  selectedBody = selected.object.body;

  var mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  var mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
  vector = new THREE.Vector3(mouseX, mouseY, 1);
  vector.unproject(camera);
  dir = vector.sub(camera.position).normalize()
  raycaster.set(camera.position, dir);
  var point = raycaster.ray.intersectPlane(new THREE.Plane(groundBody.position));
  var distance = -camera.position.z / dir.z;
  pos = camera.position.clone().add(dir.multiplyScalar(distance));
  if (dimention == 'xz') {
    selectedBody.position.x = point.x;
    selectedBody.position.z = point.z;
  } else if (dimention == 'x') {
    selectedBody.position.x = point.x;
  } else if (dimention == 'y') {
    if (pos.y < scale*1.1) return false;
    selectedBody.position.y = pos.y;
  } else if (dimention == 'z') {
    selectedBody.position.z = point.z;
  }
}

function onDocumentMouseUp (event) {
  controls.enabled = true;
  hover = false;
  selected = undefined;
}

var rotate = 0;

function animate(){
  requestAnimationFrame(animate);
  rotate = rotate + 0.01;
  gearMesh.rotation.z = rotate;
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
  drawObjects();
  // dragObjects();
  animate();

  $('#init').click( function() {
    selectedBody.position.setZero();
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




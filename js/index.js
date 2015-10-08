

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
var cube;
var cubeHelperObjects = [];

var raycaster = new THREE.Raycaster()
var mouse = new THREE.Vector2();
var lane = null
var selection = null
var offset = new THREE.Vector3()
var objects = [];
var plane;
var hover = false;
var draggable = false;

init();
drawObject();
dragObject();
animate();

var mouse2D;
var projector;
var voxelPosition;
var tmpVec;

var size = 200;


function init() {
  container = document.createElement( 'div' );
  document.body.appendChild( container );
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 1, 10000 );
  camera.position.z = 1000;
  scene.add( camera );

  scene.add( new THREE.AmbientLight( 0xf0f0f0 ) );
  var light = new THREE.SpotLight( 0xffffff, 1.5 );
  light.position.set( 0, 1500, 200 );
  light.castShadow = true;
  light.shadowCameraNear = 200;
  light.shadowCameraFar = camera.far;
  light.shadowCameraFov = 70;
  light.shadowBias = -0.000222;
  light.shadowDarkness = 0.25;
  light.shadowMapWidth = 1024;
  light.shadowMapHeight = 1024;
  scene.add( light );
  spotlight = light;

  var helper = new THREE.GridHelper( 1000, 100 );
  helper.position.y = - 99;
  helper.material.opacity = 0.25;
  helper.material.transparent = true;
  scene.add( helper );

  var planeGeometry = new THREE.PlaneGeometry( 2000, 2000, 20, 20 );
  planeGeometry.rotateX( - Math.PI / 2 );
  var planeMaterial = new THREE.MeshBasicMaterial( { color: 0xeeeeee } );
  plane = new THREE.Mesh( planeGeometry, planeMaterial );
  plane.position.y = - 100;
  plane.receiveShadow = true;
  scene.add( plane );

  renderer = new THREE.WebGLRenderer( { antialias: true } );
  renderer.setClearColor( 0xf0f0f0 );
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.shadowMap.enabled = true;
  container.appendChild( renderer.domElement );

  mouse2D = new THREE.Vector3(0, 10000, 0.5);
  voxelPosition = new THREE.Vector3()
  projector = new THREE.Projector();
  tmpVec = new THREE.Vector3();
}

function drawObject() {
  var geometry = new THREE.BoxGeometry( 200, 200, 200 );
  var material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
  cube = new THREE.Mesh( geometry, material );
  cube.castShadow = true;
  cube.receiveShadow = true;
  scene.add( cube );
  cubeHelperObjects.push( cube );
  positions.push( cubeHelperObjects[0].position );
}

function dragObject() {
  controls = new THREE.OrbitControls( camera, renderer.domElement );
  controls.damping = 0.2;
  controls.addEventListener( 'change', render );

  var dragcontrols = new THREE.DragControls( camera, cubeHelperObjects, renderer.domElement ); //
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
}

function onDocumentMouseMove (event) {
  if (!hover || !draggable) return false;
  event.preventDefault();
  var mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  var mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
  var vector = new THREE.Vector3(mouseX, mouseY, 1);
  vector.unproject(camera);

  var dir = vector.sub(camera.position).normalize()
  raycaster.set(camera.position, dir);
  var intersects = raycaster.intersectObjects(scene.children);
  if (intersects.length > 0) {
    intersector = getRealIntersector(intersects);
    if (!intersector) return false;
    var point = intersector.point;
    var distance = - camera.position.z / dir.z;
    var pos = camera.position.clone().add( dir.multiplyScalar( distance ) );
    var dimention = 'z';
    if (dimention == 'xy') {
      cube.position.set(point.x, 0, point.z);
    } else if (dimention == 'x') {
      cube.position.set(point.x, 0, 0);
    } else if (dimention == 'y') {
      cube.position.set(0, 0, point.z);
    } else if (dimention == 'z') {
      if (pos.y < 0) return false;
      cube.position.set(0, pos.y, 0);
    }

  }
}

function onDocumentMouseUp (event) {
  controls.enabled = true;
  draggable = false;
  hover = false;
}

function getRealIntersector( intersects ) {
  for( i = 0; i < intersects.length; i++ ) {
    intersector = intersects[ i ];
    if ( intersector.object != cube ) {
      return intersector;
    }
  }
  return null;
}

function animate() {
  requestAnimationFrame( animate );
  render();
  controls.update();
}

function render() {
  renderer.render( scene, camera );

}

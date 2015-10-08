
String.prototype.format = function () {

  var str = this;
  for ( var i = 0; i < arguments.length; i ++ ) {

    str = str.replace( '{' + i + '}', arguments[ i ] );

  }
  return str;

}

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
var lane = null
var selection = null
var offset = new THREE.Vector3()
var objects = [];
var plane;

setup();
init();
animate();


function setup() {
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
  helper.position.y = - 199;
  helper.material.opacity = 0.25;
  helper.material.transparent = true;
  scene.add( helper );

  var planeGeometry = new THREE.PlaneGeometry( 2000, 2000, 20, 20 );
  planeGeometry.rotateX( - Math.PI / 2 );
  var planeMaterial = new THREE.MeshBasicMaterial( { color: 0xeeeeee } );
  plane = new THREE.Mesh( planeGeometry, planeMaterial );
  plane.position.y = -200;
  plane.receiveShadow = true;
  scene.add( plane );
}

function init() {

  var geometry = new THREE.BoxGeometry( 200, 200, 200 );
  var material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
  cube = new THREE.Mesh( geometry, material );
  cube.castShadow = true;
  cube.receiveShadow = true;
  scene.add( cube );
  cubeHelperObjects.push( cube );
  positions.push( cubeHelperObjects[0].position );

  renderer = new THREE.WebGLRenderer( { antialias: true } );
  renderer.setClearColor( 0xf0f0f0 );
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.shadowMap.enabled = true;
  container.appendChild( renderer.domElement );

  controls = new THREE.OrbitControls( camera, renderer.domElement );
  controls.damping = 0.2;
  controls.addEventListener( 'change', render );

  // var dragcontrols = new THREE.DragControls( camera, cubeHelperObjects, renderer.domElement ); //
  // dragcontrols.on( 'hoveron', function( e ) {
  //   console.log('FJWEOFJWEO')
  // } )
  // dragcontrols.on( 'hoveroff', function( e ) {
  //   if ( e ) console.log('hoge') //delayHideTransform();
  // } )

  document.addEventListener('mousedown', onDocumentMouseDown, false);
  document.addEventListener('mousemove', onDocumentMouseMove, false);
  document.addEventListener('mouseup', onDocumentMouseUp, false);

  function onDocumentMouseDown (event) {
    var mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    var mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
    var vector = new THREE.Vector3(mouseX, mouseY, 1);
    vector.unproject(camera);

    var dir = vector.sub(camera.position).normalize();
    var distance = - camera.position.z / dir.z;
    var pos = camera.position.clone().add( dir.multiplyScalar( distance ) );
  }

  function onDocumentMouseMove (event) {
    event.preventDefault();
    var mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    var mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
    var vector = new THREE.Vector3(mouseX, mouseY, 0.5);
    vector.unproject(camera);

    var dir = vector.sub(camera.position).normalize();
    var distance = - camera.position.z / dir.z;
    var pos = camera.position.clone().add( dir.multiplyScalar( distance ) )
    window.pos = pos
    cube.position.set(pos.x, pos.y, pos.z);
    console.log(pos);
  }

  function onDocumentMouseUp (event) {
    // Enable the controls
    controls.enabled = true;
    selection = null;
  }

}


function animate() {
  requestAnimationFrame( animate );
  render();
  controls.update();
}

function render() {
  renderer.render( scene, camera );

}

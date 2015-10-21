

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

var ground;

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
render();

var mouse2D;
var mouse = new THREE.Vector3
var projector;
var oldPosition;
var dimention = 'xz';
var point;
var pos;
var oldPoint = { x:0, y:0, z:0 };
var oldPos = { x:0, y:0, z:0 };
var selected = null;
var intersect_plane;
var _v3 = new THREE.Vector3;
var vector = new THREE.Vector3;

var size = 200;

$( function () {
  $('#init').click( function() {
    cube.position.set(0,0,0)
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



function init() {
  Physijs.scripts.worker = '/bower_components/physijs/physijs_worker.js';
  Physijs.scripts.ammo = '/bower_components/physijs/examples/js/ammo.js';

  container = document.createElement( 'div' );
  document.body.appendChild( container );

  scene = new Physijs.Scene({ fixedTimeStep: 1 / 20 });
  scene.setGravity(new THREE.Vector3( 0, -300, 0 ));
  scene.addEventListener(
    'update',
    function() {
      if (selected !== null) {
        selected.position.set(mouse.x, mouse.y, mouse.z)
        _v3.copy(mouse).sub(selected.position).multiplyScalar( 5 );
        _v3.y = 0;
        _v3.set(1, 1, 1)
        selected.setLinearVelocity(_v3);
        // selected.applyCentralImpulse(new THREE.Vector3( 0, -300, 0 ))
        // _v3.set(0, 0, 0);
        // cube.applyCentralImpulse( _v3 );
        // for ( _i = 0; _i < blocks.length; _i++ ) {
        //   blocks[_i].applyCentralImpulse( _v3 );
        // }
      }
      scene.simulate( undefined, 1 );
    }
  );

  camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 1, 10000 );
  camera.position.set(800, 800, 800)
  scene.add( camera );

  var ambient = new THREE.AmbientLight( 0xf0f0f0 )
  scene.add(ambient);
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
  helper.position.y = 1;
  helper.material.opacity = 0.25;
  helper.material.transparent = true;
  scene.add( helper );

  var planeGeometry = new THREE.PlaneGeometry( 2000, 2000, 20, 20 );
  planeGeometry.rotateX( - Math.PI / 2 );
  var planeMaterial = new THREE.MeshBasicMaterial( { color: 0xeeeeee } );
  plane = new THREE.Mesh( planeGeometry, planeMaterial );
  plane.position.y = 0;
  plane.receiveShadow = true;
  scene.add( plane );

  intersect_plane = new THREE.Mesh(
    new THREE.PlaneGeometry( 150, 150 ),
    new THREE.MeshBasicMaterial({ opacity: 0, transparent: true })
  );
  intersect_plane.rotation.x = Math.PI / -2;
  scene.add( intersect_plane );


  var groundMaterial = new Physijs.createMaterial(
    new THREE.MeshBasicMaterial({ color: 0xff0000 }),
      0.9, // high friction
      0.2 // low restitution
  );

  ground = new Physijs.BoxMesh(
    new THREE.BoxGeometry(2000, 1, 2000),
    groundMaterial,
    0, // mass
    { restitution: .2, friction: .8 }
  );
  ground.receiveShadow = true;
  scene.add(ground);

  renderer = new THREE.WebGLRenderer( { antialias: true } );
  renderer.setClearColor( 0xf0f0f0 );
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.shadowMap.enabled = true;
  container.appendChild( renderer.domElement );

  mouse2D = new THREE.Vector3(0, 10000, 0.5);
  projector = new THREE.Projector();
  tmpVec = new THREE.Vector3();

  requestAnimationFrame(render);
  scene.simulate();
}

function drawObject() {
  var geometry = new THREE.CubeGeometry(200, 200, 200);
  var material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  // cube = new THREE.Mesh( geometry, material );
  cube = new Physijs.BoxMesh(geometry, material);
  cube.castShadow = true;
  cube.receiveShadow = true;
  cube.position.y = 500;
  scene.add(cube);
  objects.push(cube);
  cubeHelperObjects.push(cube);
  positions.push(cubeHelperObjects[0].position);
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

  event.preventDefault();
  var mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  var mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
  vector = new THREE.Vector3(mouseX, mouseY, 1);
  vector.unproject(camera);
  var dir = vector.sub(camera.position).normalize()
  raycaster.set(camera.position, dir);

  var intersections = raycaster.intersectObjects(objects);
  if (intersections.length > 0) {
    selected = intersections[0].object;
    vector.set( 0, 0, 0 );
    selected.setAngularFactor(vector);
    selected.setAngularVelocity(vector);
    selected.setLinearFactor(vector);
    selected.setLinearVelocity(vector);

    // mouse.copy( intersections[0].point );
    // block_offset.subVectors( selected_block.position, mouse_position );
    // intersect_plane.position.y = mouse.y;
  }
}

function onDocumentMouseMove (event) {
  if (!hover || !draggable) return false;
  event.preventDefault();
  // var mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  // var mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
  // vector = new THREE.Vector3(mouseX, mouseY, 1);
  // vector.unproject(camera);
  // var dir = vector.sub(camera.position).normalize()
  // raycaster.set(camera.position, dir);
  // var intersections = raycaster.intersectObjects(objects);
  // if (intersections.length > 0) {
  //   mouse.copy( intersections[0].point );
  // }
  // var intersection = raycaster.intersectObject( intersect_plane );
  // mouse.copy( intersection[0].point );

  var mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  var mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
  var vector = new THREE.Vector3(mouseX, mouseY, 1);
  vector.unproject(camera);

  var dir = vector.sub(camera.position).normalize()
  raycaster.set(camera.position, dir);
  var intersections = raycaster.intersectObjects(objects);
  if (intersections.length > 0) {
    selected = intersections[0].object;
    // selected.position.y = mouse.y;
    // mouse.copy( intersections[0].point );

    point = intersections[0].point;
    var distance = - camera.position.z / dir.z;
    pos = camera.position.clone().add( dir.multiplyScalar( distance ) );
    mouse.x = point.x;
    mouse.y = 500
    mouse.z = point.z;
    /*
    if (dimention == 'xz') {
      selected.position.set(point.x, selected.position.y, point.z);
    } else if (dimention == 'x') {
      selected.position.setX(point.x);
    } else if (dimention == 'y') {
      if (pos.y < 0) return false;
      // selected.translateY((pos.y)/40)
      selected.position.setY(pos.y);
    } else if (dimention == 'z') {
      selected.position.setZ(point.z);
    }
    */
  }
}

function onDocumentMouseUp (event) {
  controls.enabled = true;
  draggable = false;
  hover = false;
  vector.set(1, 1, 1);
  selected.setAngularFactor(vector);
  selected.setLinearFactor(vector);
  // selected.setAngularFactor(vector);
  // selected.setAngularVelocity(vector);
  // selected.setLinearFactor(vector);
  // selected.setLinearVelocity(vector);

  selected = null;
  if (point) oldPoint = point;
  if (pos) oldPos = pos;
}

function render() {
  requestAnimationFrame(render);
  renderer.render(scene, camera);
  controls.update();
}



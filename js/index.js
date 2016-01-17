
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
  camera.position.set(scale*2, scale*2, scale*2)
  camera.lookAt(new THREE.Vector3(0, 3, 0));
  scene.add( camera );

  scene.add(new THREE.AmbientLight(0xf0f0f0));
  var light = new THREE.SpotLight(0xffffff, 1.5);
  light.position.set(scale*2, scale*2, -scale*2);
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

  document.addEventListener('mousedown', onDocumentMouseDown, false);
  document.addEventListener('mousemove', onDocumentMouseDown, false);
  document.addEventListener('mouseup', onDocumentMouseUp, false);
  document.addEventListener('touchstart', onDocumentTouchStart, false);

  window.addEventListener('resize', onWindowResize, false);
}

var pinionMesh;
var rackMesh;
var materials = [];
var basicMaterials = [];
THREE.ImageUtils.crossOrigin = '';
var texture = THREE.ImageUtils.loadTexture('/plaster.jpg');
// materials[2] = material


var a = new THREE.Vector3(1, 0, 0);
var b = new THREE.Vector3(0, 0, 1);
var c = new THREE.Vector3(0, 1, 0);
var ab = new THREE.Vector3();
var bc = new THREE.Vector3();
ab.subVectors(b, a);
bc.subVectors(c, b);

var normal = new THREE.Vector3();
normal.crossVectors(ab, bc)
normal.normalize()

var triangle;

function drawObjects () {
  var geometry = new THREE.BoxGeometry(size, size, size);
  geometry.verticesNeedUpdate = true;
  // for (var i = 0; i < geometry.faces.length; i ++ ) {
  //   var face = geometry.faces[i];
  //   face.color.setRGB( Math.random(), Math.random(), Math.random() );
  // }
  var boxMaterial = new THREE.MeshBasicMaterial({vertexColors: THREE.FaceColors });
  box = new THREE.Mesh(geometry, boxMaterial);

  // geometry = new THREE.BoxGeometry( size, size, size );
  // for ( var i = 0; i < geometry.faces.length; i ++ ) {
  //   geometry.faces[ i ].color.setHex( Math.random() * 0xffffff );
  // }
  // var material = new THREE.MeshBasicMaterial( { color: 0xffffff, vertexColors: THREE.FaceColors } )
  // box = new THREE.Mesh(geometry, material);

  var theta = Math.PI/8;


  // var quaternion = new THREE.Quaternion();
  // quaternion.setFromAxisAngle(normal, Math.PI/2);
  // box.rotateOnAxis(new THREE.Vector3(1,1,1).normalize(), Math.PI/2);
  // box.rotateOnAxis(new THREE.Vector3(1,0,0).normalize(), Math.PI/4);
  // box.rotateOnAxis(new THREE.Vector3(0,1,0).normalize(), Math.PI/4);

  // var theta_x = Math.abs(Math.atan(normal.z, normal.y));
  // var theta_y = Math.abs(Math.atan(normal.x, normal.z));
  // var theta_z = Math.abs(Math.atan(normal.y, normal.x));
  // box.rotation.set(theta_x, theta_y, theta_z);

  // box.material.verticesNeedUpdate = true;
  box.dynamic = true;
  box.castShadow = true;
  box.receiveShadow = true;
  // box.rotation.y = Math.PI/4;
  scene.add(box);
  objects.push(box);


  triangle = new THREE.Mesh(
    new THREE.TetrahedronGeometry(size),
    new THREE.MeshFaceMaterial(materials)
  )
  triangle.geometry.verticesNeedUpdate = true
  triangle.material.verticesNeedUpdate = true
  triangle.castShadow = true;
  triangle.receiveShadow = true;
  triangle.rotation.y = Math.PI/4;
  // scene.add(triangle);
  objects.push(triangle);

  // var meshes = [], geometry, material, mesh;

  // geometry = new THREE.BoxGeometry(size,size,size);
  // material = new THREE.MeshLambertMaterial({color: 0xCC0000});
  // mesh = new THREE.Mesh(geometry, material);
  // meshes.push(mesh);

  // mesh = new THREE.Mesh(geometry, material);
  // mesh.position.x = size*2;
  // meshes.push(mesh);
  // //merge both geometries
  // geometry = mergeMeshes(meshes);
  // mesh = new THREE.Mesh(geometry, material);
  // scene.add(mesh);

}


function changeMaterial (intersects, material) {
  window.current = intersects[0]
  var materialIndex = intersects[0].face.materialIndex;
  materials[materialIndex] = material;
  box.material = new THREE.MeshFaceMaterial(materials);
}

function getIntersects (event) {
  event.preventDefault();
  mouse.x = ( event.clientX / renderer.domElement.clientWidth ) * 2 - 1;
  mouse.y = - ( event.clientY / renderer.domElement.clientHeight ) * 2 + 1;
  raycaster.setFromCamera( mouse, camera );
  var intersects = raycaster.intersectObjects( objects );
  return intersects
}

function onDocumentMouseMove (event) {
  console.log('move')
  var intersects = getIntersects(event);
  if (intersects.length > 0) {
    var basicMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    changeMaterial(intersects, basicMaterial);
  }
}

var changedIndex = []
var oldIndex;
var currentIndex;

function mergeMeshes (meshes) {
  var combined = new THREE.Geometry();
  for (var i = 0; i < meshes.length; i++) {
    meshes[i].updateMatrix();
    combined.merge(meshes[i].geometry, meshes[i].matrix);
  }
  return combined;
}

function getAllTetra (v1, v2, v3) {
  var geometry = new THREE.Geometry();
  geometry.vertices.push(v1);
  geometry.vertices.push(v2);
  geometry.vertices.push(v3);
  geometry.faces.push(new THREE.Face3(0, 1, 2));
  geometry.verticesNeedUpdate = true;
  for (var i=0; i<10; i++) {
    for (var j=0; j<10; j++) {
      var c1 = v1.clone()
      var c2 = v2.clone()
      var c3 = v3.clone()
      var a = c1.multiplyScalar( (10-i)/10 * j/10 )
      var b = c2.multiplyScalar( (10-i)/10 * (10-j)/10 )
      var c = c3.multiplyScalar( i/10 )
      var vec = a.add(b).add(c)

      var radius = size/20;
      var height = size/10;
      var tetra = new THREE.Mesh(
        new THREE.CylinderGeometry(0, radius, height, 8, 1),
        new THREE.MeshLambertMaterial({color: 0x0000ff})
      )
      tetra.castShadow = true;
      tetra.receiveShadow = true;
      tetra.position.set(vec.x, vec.y, vec.z)
      // tetra.position.y = 0;
      // tetra.position.z = 0+(2*radius*j);
      // tetra.position.x = 0+(2*radius*i);
      geometry.mergeMesh(tetra);
    }
  }

  var all = new THREE.Mesh(
    geometry, new THREE.MeshBasicMaterial({color: 'black'}));
  all.castShadow = true;
  all.receiveShadow = true;

  scene.add(all);
  return all;
}



function onDocumentMouseUp (event) {
  console.log('up')
  var intersects = getIntersects(event);
  if (intersects.length > 0) {
    console.log(currentIndex);
    if (changedIndex.indexOf(currentIndex) == -1) {

      var v1 = current.object.geometry.vertices[current.face.a];
      var v2 = current.object.geometry.vertices[current.face.b];
      var v3 = current.object.geometry.vertices[current.face.c];
      var all = getAllTetra(v1, v2, v3);
      // console.log(all)
      // var normal = current.face.normal;
      // window.normal = normal;
      // all.setRotationFromAxisAngle(normal, Math.PI)
      // all.rotation.y = Math.atan2(-normal.z, normal.x);
      // all.rotation.z = Math.atan2(-normal.x, normal.y);
      // all.rotation.x = Math.atan2(-normal.y, normal.z);
      // all.rotation.x = Math.PI/4;
      console.log(current.face)

      // var specialMaterial = new THREE.MeshPhongMaterial({
      //   color: 'gray',
      //   map: texture,
      //   bumpMap: texture,
      //   bumpScale: 0.05
      // })
      // materials[currentIndex] = specialMaterial;
      changedIndex.push(currentIndex);
    }
  }
}

var oldColor = new THREE.Color('white');
var selectColor = new THREE.Color('yellow');

function onDocumentMouseDown( event ) {
  console.log('down')
  var intersects = getIntersects(event)
  if ( intersects.length > 0 ) {
    window.current = intersects[0]
    currentIndex = current.faceIndex;
    console.log(currentIndex);
    if (oldIndex != currentIndex) {
      if (oldIndex) {
        current.object.geometry.faces[oldIndex].color.set(oldColor);
      }
      current.object.geometry.faces[currentIndex].color.set(selectColor);
      current.object.geometry.colorsNeedUpdate = true;
      oldIndex = currentIndex;
      if (changedIndex.indexOf(currentIndex) == -1) {
      }
    }
  }
}


function animate(){
  requestAnimationFrame(animate);
  render();
  stats.update();
}

function render() {
  controls.update();
  renderer.clear();
  renderer.render(scene, camera);
}

function onWindowResize () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
}

function onDocumentTouchStart( event ) {
  event.preventDefault();
  event.clientX = event.touches[0].clientX;
  event.clientY = event.touches[0].clientY;
  onDocumentMouseDown( event );
}


$( function () {
  init();
  drawObjects();
  // dragObjects();
  animate();

  $('#plaster').click( function() {
    texture = THREE.ImageUtils.loadTexture('/plaster.jpg');
  });
  $('#map').click( function() {
    texture = THREE.ImageUtils.loadTexture('/map.jpg');
  });
  $('#stone').click( function() {
    texture = THREE.ImageUtils.loadTexture('/stone.jpg');
  });
});




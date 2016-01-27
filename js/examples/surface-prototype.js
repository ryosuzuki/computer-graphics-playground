
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
  light.position.set(scale*7, scale*7, -scale*7);
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
var texture = THREE.ImageUtils.loadTexture('/assets/plaster.jpg');
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
var cylinder;

function drawObjects () {

  cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(0, size, size*2, 20),
    new THREE.MeshBasicMaterial({vertexColors: THREE.FaceColors })
  );

  var materials = [];
  for (var i=0; i<cylinder.geometry.faces.length; i++) {
    materials.push(new THREE.MeshBasicMaterial({color: Math.random() * 0xffffff }))
  }
  // cylinder.material = new THREE.MeshFaceMaterial(materials);

  cylinder.geometry.verticesNeedUpdate = true;
  cylinder.dynamic = true;
  cylinder.castShadow = true;
  cylinder.receiveShadow = true;
  scene.add(cylinder);
  objects.push(cylinder);
}


var oldColor = new THREE.Color('white');
var selectColor = new THREE.Color('yellow');
var neighbor = []
function onDocumentMouseDown( event ) {
  var intersects = getIntersects(event)
  if ( intersects.length > 0 ) {
    // if (current !== intersects[0]) oldIndex = undefined;
    window.current = intersects[0]
    currentIndex = current.faceIndex;
    var normal = current.face.normal
    neighbor = [current.face];
    computeNeighbor(current.face);
    neighbor.forEach( function (face) {
      face.color.set(selectColor);
      current.object.geometry.colorsNeedUpdate = true;
    })


    function computeNeighbor (currentFace) {
      var currentVertices = [
        currentFace.a,
        currentFace.b,
        currentFace.c
      ];
      var currentNormal = currentFace.normal;
      var faces = current.object.geometry.faces;
      for (var i=0; i<faces.length; i++) {
        var face = faces[i];
        if (neighbor.indexOf(face) !== -1) {
          continue;
        }
        var vertices = [face.a, face.b, face.c];
        var common = _.intersection(vertices, currentVertices);
        if (common.length > 1) {
          var vec = new THREE.Vector3()
          var v = face.normal.clone();
          var sim = v.dot(currentNormal);
          console.log(sim);
          if (sim > 0) {
            neighbor.push(face);
            computeNeighbor(face);
          }
        }
      }
      return true;
    }

    /*
    if (oldIndex != currentIndex) {
      if (oldIndex && current.object.geometry.faces[oldIndex]) {
        current.object.geometry.faces[oldIndex].color.set(oldColor);
      }
      current.object.geometry.faces[currentIndex].color.set(selectColor);
      current.object.geometry.colorsNeedUpdate = true;
      oldIndex = currentIndex;
      if (changedIndex.indexOf(currentIndex) == -1) {
      }
    }
    */
  }
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

function getTexture (current) {
  var v1 = current.object.geometry.vertices[current.face.a];
  var v2 = current.object.geometry.vertices[current.face.b];
  var v3 = current.object.geometry.vertices[current.face.c];
  var pos = current.object.position;
  var normal = current.face.normal

  var geometry = new THREE.Geometry();
  geometry.vertices.push(v1);
  geometry.vertices.push(v2);
  geometry.vertices.push(v3);
  geometry.faces.push(new THREE.Face3(0, 1, 2));
  geometry.verticesNeedUpdate = true;

  var rot = current.object.rotation;
  var axis = new THREE.Vector3(0, 1, 0);
  var quaternion = new THREE.Quaternion().setFromUnitVectors(axis, normal)
  var matrix = new THREE.Matrix4().makeRotationFromQuaternion(quaternion);
  for (var i=0; i<10; i++) {
    for (var j=0; j<10; j++) {
      var c1 = v1.clone()
      var c2 = v2.clone()
      var c3 = v3.clone()
      var a = c1.multiplyScalar( (10-i)/10 * j/10 )
      var b = c2.multiplyScalar( (10-i)/10 * (10-j)/10 )
      var c = c3.multiplyScalar( i/10 )
      var point = a.add(b).add(c)

      var radius = size/20;
      var height = size/10;
      var tetra = new THREE.Mesh(
        new THREE.CylinderGeometry(0, radius, height, 8, 1),
        new THREE.MeshLambertMaterial({color: 0x0000ff})
      )
      tetra.applyMatrix(matrix);
      tetra.castShadow = true;
      tetra.receiveShadow = true;
      tetra.position.set(point.x, point.y, point.z)
      geometry.mergeMesh(tetra);
    }
  }

  var texture = new THREE.Mesh(
    geometry, new THREE.MeshBasicMaterial({color: 'yellow'}));
  texture.rotation.set(rot.x, rot.y, rot.z, rot.order)
  texture.castShadow = true;
  texture.receiveShadow = true;
  texture.position.set(pos.x, pos.y, pos.z);
  scene.add(texture);
  return texture;
}



function onDocumentMouseUp (event) {
  var intersects = getIntersects(event);
  if (intersects.length > 0) {
    if (changedIndex.indexOf(currentIndex) == -1) {
      var texture = getTexture(current);
      console.log(current.face)
      changedIndex.push(currentIndex);
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

  $('#export').click( function() {
    var exporter = new THREE.STLExporter();
    var stlString = exporter.parse( scene );
    var blob = new Blob([stlString], {type: 'text/plain'});
    saveAs(blob, 'demo.stl');
  });
});





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
    new THREE.CylinderGeometry(size, size, size*2, 20),
    new THREE.MeshBasicMaterial({vertexColors: THREE.FaceColors })
  );
  cylinder.geometry.verticesNeedUpdate = true;
  cylinder.dynamic = true;
  cylinder.castShadow = true;
  cylinder.receiveShadow = true;
  // scene.add(cylinder);
  // objects.push(cylinder);

  box = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshBasicMaterial({vertexColors: THREE.FaceColors })
  );
  box.geometry.verticesNeedUpdate = true;
  box.dynamic = true;
  box.castShadow = true;
  box.receiveShadow = true;
  scene.add(box);
  objects.push(box);



  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function () {
    if ( xhr.readyState == 4 ) {
      if ( xhr.status == 200 || xhr.status == 0 ) {
        var rep = xhr.response;
        console.log(rep);
        parseStlBinary(rep);
        mesh.material = new THREE.MeshBasicMaterial({vertexColors: THREE.FaceColors});
        mesh.geometry.verticesNeedUpdate = true;
        mesh.dynamic = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.rotation.x = 5;
        mesh.rotation.z = .25;
        console.log('done parsing');
      }
    }
  }
  xhr.onerror = function(e) {
    console.log(e);
  }
  xhr.open( "GET", 'assets/colored.stl', true );
  xhr.responseType = "arraybuffer";
  xhr.send( null );

}

var changedIndex = []
var oldIndex;
var currentIndex;


var oldColor = new THREE.Color('white');
var selectColor = new THREE.Color('yellow');

function onDocumentMouseDown( event ) {
  var intersects = getIntersects(event)
  if ( intersects.length > 0 ) {
    // if (current !== intersects[0]) oldIndex = undefined;
    window.current = intersects[0];
    currentIndex = current.faceIndex;

    var v1 = current.object.geometry.vertices[current.face.a];
    var v2 = current.object.geometry.vertices[current.face.b];
    var v3 = current.object.geometry.vertices[current.face.c];
    var pos = current.object.position;
    var faces = current.object.geometry.faces;

    var n = current.face.normal.normalize();
    var sameNormal = [];
    faces.forEach( function (face, index) {
      var m = face.normal.normalize();
      if (compareVector(n, m)) {
        face.color.set(new THREE.Color('yellow'));
        sameNormal.push(face);
      }
    });
    // console.log(sameNormal)
    current.object.geometry.colorsNeedUpdate = true;


    // var n = current.face.normal.normalize();
    // var index = current.faceIndex;
    // var sameInverse = [];
    // while (true) {
    //   var face = faces[index+1];
    //   if (!face) break;
    //   var m = face.normal.normalize();
    //   if (compareVector(n.negate(), m)) {
    //     face.color.set(new THREE.Color('yellow'));
    //     sameInverse.push(face);
    //   }
    //   index = index + 1;
    // }
    // while (true) {
    //   var face = faces[index-1];
    //   if (!face) break;
    //   var m = face.normal.normalize();
    //   if (compareVector(n.negate(), m)) {
    //     face.color.set(new THREE.Color('yellow'));
    //     sameInverse.push(face);
    //   }
    //   index = index + 1;
    // }
    // // console.log(sameNormal)
    // current.object.geometry.colorsNeedUpdate = true;


    // var n = calcurateArea(current.face);
    // var sameArea = [];
    // faces.forEach( function (face, index) {
    //   var m = calcurateArea(face);
    //   if (m.toPrecision(2) == n.toPrecision(2)) {
    //     // face.color.set(new THREE.Color('yellow'));
    //     sameArea.push(face);
    //   }
    // });
    // // console.log(sameArea)
    // current.object.geometry.colorsNeedUpdate = true;


    // var index = current.faceIndex;
    // var sameDiff = [];
    // while (true) {
    //   var face = faces[index];
    //   if (!faces[index+1] || !faces[index+2]) break;
    //   var n = calcurateDiff(index, index+1)
    //   var m = calcurateDiff(index+1, index+2)
    //   if (compareVector(n, m)) {
    //     // face.color.set(new THREE.Color('yellow'));
    //     sameDiff.push(face);
    //   }
    //   index = index + 1;
    // }
    // var index = current.faceIndex;
    // while (true) {
    //   var face = faces[index];
    //   if (!faces[index-1] || !faces[index-2]) break;
    //   var n = calcurateDiff(index, index-1)
    //   var m = calcurateDiff(index-1, index-2)
    //   if (compareVector(n, m)) {
    //     // face.color.set(new THREE.Color('yellow'));
    //     sameDiff.push(face);
    //   }
    //   index = index - 1;
    // }
    console.log(sameDiff)
    current.object.geometry.colorsNeedUpdate = true;


    function compareVector(n, m) {
      var p = 1;
      if (
        n.x.toPrecision(p) == m.x.toPrecision(p)
        && n.y.toPrecision(p) == m.y.toPrecision(p)
        && n.z.toPrecision(p) == m.z.toPrecision(p)
      ) {
        return true;
      } else {
        false;
      }
    }

    function calcurateDiff(i, j) {
      var face = current.object.geometry.faces[i];
      var next = current.object.geometry.faces[j];
      var a = face.normal.normalize();
      var b = next.normal.normalize();
      var diff = a.clone().sub(b);
      return diff;
    }


    function calcurateArea (face) {
      var va = current.object.geometry.vertices[face.a];
      var vb = current.object.geometry.vertices[face.b];
      var vc = current.object.geometry.vertices[face.c];
      var ab = vb.clone().sub(va);
      var ac = vc.clone().sub(va);
      var cross = new THREE.Vector3();
      cross.crossVectors( ab, ac );
      var area = cross.lengthSq() / 2;
      return area;
    }


    // console.log(currentIndex);
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



function getTexture (current) {
  var v1 = current.object.geometry.vertices[current.face.a];
  var v2 = current.object.geometry.vertices[current.face.b];
  var v3 = current.object.geometry.vertices[current.face.c];
  var pos = current.object.position;
  var n = current.face.normal.normalize();

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
  // console.log('up')
  var intersects = getIntersects(event);
  if (intersects.length > 0) {
    // console.log(currentIndex);
    if (changedIndex.indexOf(currentIndex) == -1) {
      // var texture = getTexture(current);
      console.log(current.face)
      // changedIndex.push(currentIndex);
    }
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




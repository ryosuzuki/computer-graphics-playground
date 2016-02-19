var objects = [];
var materials = [];
THREE.ImageUtils.crossOrigin = '';


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

function loadObjects () {
  computeUniq(geometry, function () {
    computeLaplacian(geometry, function () {
      console.log('done')
    });
  });
}

function drawObjects () {
  // drawCylinder();
  drawSTL();
}

function drawSTL () {
  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function () {
    if ( xhr.readyState == 4 ) {
      if ( xhr.status == 200 || xhr.status == 0 ) {
        var rep = xhr.response; // || xhr.mozResponseArrayBuffer;
        console.log(rep);
        parseStlBinary(rep);
        //parseStl(xhr.responseText);
        window.geometry = mesh.geometry;
        mesh.material.color.set(new THREE.Color('blue'))
        mesh.position.y = 1;
        mesh.rotation.x = 5;
        mesh.rotation.z = .25;
        // for mavin
        // mesh.scale.set(0.1, 0.1, 0.1);
        console.log('done parsing');
        loadObjects();
      }
    }
  }
  xhr.onerror = function(e) {
    console.log(e);
  }
  xhr.open( "GET", 'assets/mini_knight.stl', true );
  // xhr.open( "GET", 'assets/noah-2.stl', true );
  xhr.responseType = "arraybuffer";
  xhr.send( null );
}

function drawCylinder () {
  limit = 0.4;
  start = 13;
  cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(size, size, size*2, 20),
    new THREE.MeshBasicMaterial({vertexColors: THREE.FaceColors })
  );
  cylinder.geometry.verticesNeedUpdate = true;
  cylinder.dynamic = true;
  cylinder.castShadow = true;
  cylinder.receiveShadow = true;
  scene.add(cylinder);
  objects.push(cylinder);
  window.geometry = cylinder.geometry
  mesh = cylinder;
  mesh.material.color.set(new THREE.Color('blue'))
  loadObjects();
}

function drawBox () {
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
  window.geometry = box.geometry
  mesh = box;
}







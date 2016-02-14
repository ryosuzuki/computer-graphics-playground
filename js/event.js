
var selectMode = false;
Mousetrap.bind('command', function () {
  undoMode = false;
  selectMode = true;
  $('#mode').addClass('pink').text('Select Mode')
}, 'keydown');
Mousetrap.bind('command', function () {
  selectMode = false;
  $('#mode').removeClass('pink').text('View Mode (⌘ + Mouse)')
}, 'keyup');
Mousetrap.bind('option', function () {
  undoMode = true;
  selectMode = false;
  $('#mode').addClass('brown').text('Undo Mode');
}, 'keydown');
Mousetrap.bind('option', function () {
  undoMode = false;
  $('#mode').removeClass('brown').text('View Mode (⌘ + Mouse)');
}, 'keyup');


function onDocumentMouseUp (event) {
  var intersects = getIntersects(event);
  if (intersects.length <= 0) return false;
  console.log(current.face)
}

function onDocumentMouseDown( event ) {
  var intersects = getIntersects(event);
  if (intersects.length <= 0) return false;
  if (!selectMode && !undoMode) return false;
  window.current = intersects[0];
  currentIndex = current.faceIndex;
  p = map[current.face.a];
  q = map[current.face.b];
  compute(undoMode);
  current.object.geometry.colorsNeedUpdate = true;
}

function onDocumentMouseMove (event) {
  console.log('move')
  var intersects = getIntersects(event);
  if (intersects.length > 0) {
    var basicMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    changeMaterial(intersects, basicMaterial);
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



/*

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
 */

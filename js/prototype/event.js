
var selectMode = false;
var undoMode = false;

$(document).on('click', '#add', function (event) {
  console.log('add')
  addTexture();
});

$(document).on('click', '#mapping', function() {
  console.log('mapping')
  computeMapping();
});

$(document).on('click', '#export', function() {
  generateVoxel( function (data) {
    var blob = new Blob([data], {type: 'text/plain'});
    saveAs(blob, 'demo.stl');
  })
});

function saveGeometry () {
  $.ajax({
    url: '/save',
    method: 'POST',
    dataType: 'JSON',
    data: {
      json: geometry.uniq[0],
      // map: geometry.map
    },
    success: function (data) {
      console.log('done');
    }
  })
}

function generateVoxel (callback, client) {
  console.log('Start voxelization...')
  var cells = geometry.faces.map( function (face) {
    var map = geometry.map;
    return [map[face.a], map[face.b], map[face.c]];
  });
  var uniq = geometry.uniq;
  var positions = [];
  var mappings = [];
  for (var i=0; i<uniq.length; i++) {
    var object = uniq[i];
    var vertex = object.vertex;
    positions.push([vertex.x, vertex.y, vertex.z]);
    mappings.push([object.u, object.v]);
  }
  var json = {
    cells: cells,
    positions: positions,
    mappings: mappings,
    selected_cells: selectIndex,
    resolution: 0.02
  };
  if (client) {
    var object = voxelize(json);
    window.object = object;
    var data = normalSTL(object.voxels);
    console.log('done');
    if (callback) callback(data);
  } else {
    $.ajax({
      url: '/stl',
      method: 'POST',
      dataType: 'JSON',
      data: { json: JSON.stringify(json) },
      success: function (data) {
        console.log('done');
        if (callback) callback(data);
      }
    })
  }
}

function saveVoxel () {
  var cells = geometry.faces.map( function (face) {
    var map = geometry.map;
    return [map[face.a], map[face.b], map[face.c]];
  })
  var positions = geometry.uniq.map( function (object) {
    var vertex = object.vertex;
    return [vertex.x, vertex.y, vertex.z];
  })
  var json = { "cells": cells, "positions": positions };
}


function finishSelect () {
  if (selectIndex.length <= 0) return false;
  $('.bottom-buttons').show();
  // computeMapping();
}


var p;
var q;


function onDocumentMouseDown( event ) {
  var intersects = getIntersects(event);
  if (intersects.length <= 0) return false;
  if (!selectMode && !undoMode) return false;
  window.current = intersects[0];
  window.currentIndex = current.faceIndex;

  if (!start) start = current.face.a;
  p = map[current.face.a];
  console.log('p: ' + p);
  q = map[current.face.b];
  console.log('q: ' + q);
  Q.fcall(computeHarmonicField(geometry))
  .then(computeSelect())
  .then(colorChange())
  .then(function () {
    p = undefined;
    q = undefined;
    console.log(current);
    current.object.geometry.colorsNeedUpdate = true;
  });

  // Q.fcall(computeHarmonicField(geometry))
  // p = 917
  // 498
  // 780
  // q = 257
  // 153
  // 1298
  // Q.fcall(getField(geometry, p, q))

  // .then(computeSelect())
  // .then(colorChange())
  // .then(function () {
  //   p = undefined;
  //   q = undefined;
  //   console.log(current);
  //   current.object.geometry.colorsNeedUpdate = true;
  // });

}

function onDocumentMouseUp (event) {
  var intersects = getIntersects(event);
  if (intersects.length <= 0) return false;
  console.log(current.face)



  if (selectIndex.length > 0) {
    console.log('Select Done')
  }
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
  var intersects = raycaster.intersectObjects(objects);
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

Mousetrap.bind('command', function () {
  undoMode = false;
  selectMode = true;
  $('#mode').addClass('pink').text('Select Mode')
}, 'keydown');
Mousetrap.bind('command', function () {
  selectMode = false;
  $('#mode').removeClass('pink').text('View Mode (⌘ + Mouse)')
  finishSelect();
}, 'keyup');
Mousetrap.bind('option', function () {
  undoMode = true;
  selectMode = false;
  $('#mode').addClass('brown').text('Undo Mode');
}, 'keydown');
Mousetrap.bind('option', function () {
  undoMode = false;
  $('#mode').removeClass('brown').text('View Mode (⌘ + Mouse)');
  finishSelect();
}, 'keyup');

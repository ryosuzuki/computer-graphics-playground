var objects = [];
var materials = [];
THREE.ImageUtils.crossOrigin = '';

function loadObjects () {
  computeUniq(geometry, function () {
    computeLaplacian(geometry, function () {
      console.log('done')
    });
  });
}

function drawObjects () {
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
        mesh.scale.set(0.03, 0.03, 0.03);
        console.log('done parsing');
        loadObjects();
      }
    }
  }
  xhr.onerror = function(e) {
    console.log(e);
  }
  xhr.open( "GET", 'assets/bunny-low.stl', true );
  xhr.responseType = "arraybuffer";
  xhr.send( null );
}





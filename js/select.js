
function compute (undoMode) {
  var undoMode = undoMode;
  var N = 15;
  var t = N/2;
  var c = [];
  for (var i=0; i<N; i++) {
    c[i] = Math.exp(- Math.pow(i-t, 2) / (2*Math.pow(t, 2)) )
  }

  var c = [];
  var phi = geometry.phi;
  var a = _.sortBy(phi);
  for (var i=0; i<N; i++) {
    var q = i/N;
    var k = d3.quantile(a, q);
    c[i] = Math.exp(- Math.pow(k-t, 2) / (2*Math.pow(k, 2)) )
  }

  computeHarmonicField(geometry, function () {
    colorChange(10, undoMode)
    p = undefined;
    q = undefined;
  });
}

var selectIndex;

function colorChange (val, undoMode) {
  var color;
  var val;
  if (undoMode) {
    val = 100;
    color = 'blue';
    console.log('Undo')
  } else {
    val = 10;
    color = 'yellow';
    console.log('Select')
  }
  var faces = geometry.faces;
  geometry.phiFaces.forEach( function (p, index) {
    if (p > val) {
      var face = faces[index];
      face.color.set(new THREE.Color(color));
      geometry.colorsNeedUpdate = true;
      if (undoMode) {
        selectIndex = _.pull(selectIndex, index);
      } else {
        selectIndex = _.union(selectIndex, [index]);
      }
    }
  })
}


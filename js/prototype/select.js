var selectIndex = [];

function computeSelect () {
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
}

function colorChange (val) {
  var color;
  if (undoMode) {
    val = val/10;
    color = 'blue';
    console.log('Undo')
  } else {
    color = 'yellow';
    console.log('Select: ' + currentIndex);
  }
  var median = d3.median(geometry.phiFaces);
  var getBool = function (p) {
    if (median > 0.5) {
      return p < 50;
    } else {
      return p > 50;
    }
  }
  var faces = geometry.faces;

  geometry.phiFaces.forEach( function (p, index) {
    if (getBool(p)) {
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

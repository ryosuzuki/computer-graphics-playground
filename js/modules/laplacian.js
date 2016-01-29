
function computeHarmonicField(geometry, callback) {
  var geometry = window.geometry;
  var n = geometry.uniq.length;
  var p = Math.round(Math.random()*n);
  var q = Math.round(Math.random()*n);
  var laplacian = geometry.laplacian;
  var w = 1000;
  var b = Array.apply(null, Array(n+2)).map(Number.prototype.valueOf, 0);
  b[n] = 1;
  b[n+1] = 0;

  var A = [];
  for (var i=0; i<n; ++i) {
    var a = Array.apply(null, Array(n+2)).map(Number.prototype.valueOf, 0)
    A.push(a);
  }

  laplacian.forEach( function (value, index) {
    A[index[0]][index[1]] = value;
  });
  A[p][n] = w;
  A[q][n+1] = w;

  var A_T = numeric.transpose(A);
  var M = numeric.dot(A_T, A);
  var Minv = numeric.inv(M);
  var N = numeric.dot(Minv, A_T)
  var theta = numeric.dot(b, N);
  geometry.theta = theta;
  return callback(geometry);
}


function computeLaplacian(geometry, callback) {
  var geometry = window.geometry;
  var uniq = geometry.uniq;
  var n = uniq.length;
  var matrix = math.zeros(n, n);
  for (var i=0; i< uniq.length; i++) {
    var e = uniq[i];
    var delta = 0;
    var edges = e.edges;
    for (var j=0; j<edges.length; j++) {
      var index = edges[j];
      if (index == i) {
        delta = -1;
      } else {
        delta = 1 / edges.length;
      }
      matrix.subset(math.index(i,index), delta);
    }
  }
  geometry.laplacian = matrix;
  return callback(geometry);
}


function computeUniq(geometry, callback) {
  var geometry = window.geometry;
  var vertices = geometry.vertices;
  var map = new Array(vertices.length);
  var uniq = [];
  for (var i=0; i<vertices.length; i++) {
    var vertex = vertices[i];
    var bool = true;
    var index;
    for (var j=0; j<uniq.length; j++) {
      var e = uniq[j];
      if (vertex.equals(e.vertex)) {
        bool = false;
        e.index.push(i);
        map[i] = j;
        break;
      }
    }
    if (bool) {
      uniq.push({ index: [i], vertex: vertex });
      map[i] = uniq.length-1;
    }
  }
  window.map = map;
  window.uniq = uniq;

  var faces = geometry.faces;
  var edges = new Array(uniq.length);
  for (var j=0; j<uniq.length; j++) {
    edges[j] = [];
  }
  for (var i=0; i<faces.length; i++) {
    var face = faces[i];
    var a = map[face.a];
    var b = map[face.b];
    var c = map[face.c];

    edges[a].push(b)
    edges[a].push(c)
    edges[a] = _.uniq(edges[a])
    uniq[a].edges = edges[a];

    edges[b].push(a)
    edges[b].push(c)
    edges[b] = _.uniq(edges[b])
    uniq[b].edges = edges[b];

    edges[c].push(a)
    edges[c].push(b)
    edges[c] = _.uniq(edges[c]);
    uniq[c].edges = edges[c];

    if (!uniq[a].faces) uniq[a].faces = [];
    if (!uniq[b].faces) uniq[b].faces = [];
    if (!uniq[c].faces) uniq[c].faces = [];
    uniq[a].faces.push(i);
    uniq[b].faces.push(i);
    uniq[c].faces.push(i);
  }
  window.edges = edges;

  geometry.uniq = uniq;
  geometry.map = map;
  geometry.edges = edges;

  return callback(geometry);
}

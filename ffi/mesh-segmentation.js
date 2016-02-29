var _ = require('lodash');
var numeric = require('numeric')

var hash = {
  computeUniq: computeUniq,
  computeLaplacian: computeLaplacian,
  computeHarmonicField: computeHarmonicField
}

function computeUniq (geometry) {
  console.log('Start computeUniq')
  var vertices = geometry.vertices;
  var map = new Array(vertices.length);
  var uniq = [];
  var epsilon = Math.pow(10, -6);
  for (var i=0; i<vertices.length; i++) {
    var vertex = vertices[i];
    var bool = true;
    var index;
    for (var j=0; j<uniq.length; j++) {
      var e = uniq[j];
      if (
        Math.abs(vertex.x - e.vertex.x) < epsilon
        && Math.abs(vertex.y - e.vertex.y) < epsilon
        && Math.abs(vertex.z - e.vertex.z) < epsilon
      ) {
        bool = false;
        e.index.push(i);
        map[i] = j;
        break;
      }
    }
    if (bool) {
      uniq.push({ index: [i], vertex: vertex, id: uniq.length });
      map[i] = uniq.length-1;
    }
  }
  var faces = geometry.faces;
  var edges = new Array(uniq.length);
  var sides = new Array(uniq.length);
  for (var j=0; j<uniq.length; j++) {
    edges[j] = [];
    sides[j] = [];
  }
  for (var i=0; i<faces.length; i++) {
    var face = faces[i];
    var a = map[face.a];
    var b = map[face.b];
    var c = map[face.c];

    // edges[a].push(a)
    edges[a].push(b)
    edges[a].push(c)
    edges[a] = _.uniq(edges[a])
    sides[a].push(i);
    uniq[a].edges = edges[a];

    // edges[b].push(b)
    edges[b].push(a)
    edges[b].push(c)
    edges[b] = _.uniq(edges[b])
    uniq[b].edges = edges[b];

    // edges[c].push(c)
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
    uniq[a].faces = _.uniq(uniq[a].faces);
    uniq[b].faces = _.uniq(uniq[b].faces);
    uniq[c].faces = _.uniq(uniq[c].faces);
  }
  geometry.uniq = uniq;
  geometry.map = map;
  geometry.edges = edges;

  console.log('Finish computeUniq')
  return geometry;
}


function computeLaplacian(geometry) {
  console.log('Start Laplacian')
  var uniq = geometry.uniq;
  var n = uniq.length;

  var L = [];
  for (var i=0; i<n; ++i) {
    var zeros = Array.apply(null, Array(n)).map(Number.prototype.valueOf, 0)
    L.push(zeros);
  }

  for (var i=0; i< uniq.length; i++) {
    var e = uniq[i];
    var edges = e.edges;
    edges.forEach( function (j) {
      if (i==j) {
        L[i][j] = 1;
      } else {
        L[i][j] = -1/edges.length;
      }
    })
  }
  geometry.laplacian = L;

  console.log('Start Cholesky decomposition');
  // var ccsL = numeric.ccsSparse(L);
  // var ccsLU = numeric.ccsLUP(ccsL);
  // geometry.ccsLU = ccsLU;
  var LU = numeric.LU(L);
  geometry.LU = LU;

  console.log('Finish computeLaplacian');
  return geometry;
}


function computeHarmonicField(geometry) {
  var n = geometry.uniq.length;
  var w = 1000;
  var p, q;
  if (!p) p = 0;
  if (!q) q = n-1;
  var b = Array.apply(null, Array(n)).map(Number.prototype.valueOf, 0);
  b[p] = w;

  if (!Z) {
    var zeros = Array.apply(null, Array(n)).map(Number.prototype.valueOf, 0);
    var Z = [];
    for (var i=0; i<n; i++) {
      var z = _.clone(zeros);
      Z.push(z);
    }
  }
  var G = _.clone(Z);
  G[p][p] = w^2;
  G[q][q] = w^2;

  var LU = _.clone(geometry.LU);
  var A = numeric.add(LU.LU, G)
  LU.LU = A;
  // var phi = numeric.ccsLUPSolve(geometry.ccsLU, b);
  var phi = numeric.LUsolve(LU, b);
  geometry.phi = phi;

  geometry.phiFaces = geometry.faces.map( function (face) {
    var phi = geometry.phi;
    var a = phi[map[face.a]];
    var b = phi[map[face.b]];
    var c = phi[map[face.c]];
    return (a+b+c)/3;
  });
  return geometry;
}


module.exports = hash;

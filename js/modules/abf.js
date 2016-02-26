

function getZeros (row, column) {
  var zeros = Array.apply(null, Array(column)).map(Number.prototype.valueOf, 0);
  var Z = [];
  for (var i=0; i<row; i++) {
    var z = _.clone(zeros);
    Z.push(z);
  }
  return Z;
}

var T = geometry.faces.length;
var V = uniq.length;

var beta = [];
for (var t=0; t<T; t++) {
  var face = geometry.faces[t];
  var a = geometry.vertices[face.a];
  var b = geometry.vertices[face.b];
  var c = geometry.vertices[face.c];
  var vertices = [a, b, c];
  for (var i=0; i<3; i++) {
    var j = (i+1)%3;
    var k = (i+2)%3;
    var v_ij = new THREE.Vector3();
    var v_ik = new THREE.Vector3();
    v_ij.subVectors(vertices[j], vertices[i]).normalize();
    v_ik.subVectors(vertices[k], vertices[i]).normalize();
    var cos = v_ij.dot(v_ik);
    var beta_i = Math.acos(cos);
    beta.push(beta_i);
  }
}

var w = beta.map( function (b) {
  return 1 / (b * b)
})

var Lambda = getZeros(3*T, 3*T);
for (var i=0; i<3*T; i++) {
  Lambda[i][i] = 2 / w[i];
}

var J_1 = getZeros(V, 3*T)
for (var i=0; i<V; i++) {
  for (var j=0; j<3*T; j++) {
    if (i == Math.floor(j/3)) J_1[i][j] = 1
  }
}

var J_2 = getZeros(2*V, 3*T);
for (var i=0; i<V; i++) {
  for (var j=0; j<3*T; j++) {
    var v = uniq[i];
    var t = Math.floor(j/3);
    var face = geometry.faces[t];
    if (v.index.includes(face.a)) a_tk=face.a;
    if (v.index.includes(face.a)) a_tk=face.b;
    if (v.index.includes(face.a)) a_tk=face.c;
    if (v.index.includes(a_tk)) {
      J_2[i][j] = 1
    }
  }
}

var Flag = getZeros(V, 3*T);
for (var i=0; i<V; i++) {
  var origin = uniq[i];
  var edges = origin.edges.slice(1);
  var checked = [];
  var current = uniq[edges[0]];
  while (true) {
    var common = _.intersection(origin.faces, current.faces);
    var index = _.pullAll(common, checked)[0];
    if (!index) break;
    checked.push(index);
    var face = geometry.faces[index];
    var i0, i1, i2;
    if (origin.index.includes(face.a) && current.index.includes(face.b)) { i0 = 0; i1 = 1; i2 = 2; }
    if (origin.index.includes(face.a) && current.index.includes(face.c)) { i0 = 0; i1 = 2; i2 = 1; }
    if (origin.index.includes(face.b) && current.index.includes(face.a)) { i0 = 1; i1 = 0; i2 = 2; }
    if (origin.index.includes(face.b) && current.index.includes(face.c)) { i0 = 1; i1 = 2; i2 = 0; }
    if (origin.index.includes(face.c) && current.index.includes(face.a)) { i0 = 2; i1 = 0; i2 = 1; }
    if (origin.index.includes(face.c) && current.index.includes(face.b)) { i0 = 2; i1 = 0; i2 = 1; }
    next = uniq[map[i2]]
    current = next;
    Flag[i][3*index + i1] = 1;
    Flag[i][3*index + i2] = -1;
  }
}

function update_J2 (J_2, x) {
  for (var i=0; i<V; i++) {
    for (var j=0; j<3*T; j++) {
      var flag = Flag[i][j];
      if (flag > 0) J_2[V+i][j] = Math.cos(x[j])
      if (flag < 0) J_2[V+i][j] = - Math.cos(x[j])
    }
  }
  return J_2;
}

function update_b1 (b_1, x, lambda_1, lambda_2, lambda_3) {
  for (var i=0; i<3*T; i++) {
    var E = 2 * x[i] / w[i];

    var t = Math.floor(i/3);
    var k = i%3;
    var face = geometry.faces[t];
    var a_tk;
    if (k==0) a_tk = face.a;
    if (k==1) a_tk = face.b;
    if (k==2) a_tk = face.c;
    var v = map[a_tk];
    var C1 = lambda_1[v];
    var C2 = lambda_2[v];

    var sum = 0;
    var flags = Flag.map( function (row) {
      return row[j];
    })
    for (var j=0; j<flags.length; j++) {
      var flag = flags[j];
      if (flag>0 || flag<0) sum = sum + flag * lambda_3[j];
    }
    var C3 = sum * Math.cos(x[i]);
    b_1[i] = - (E + C1 + C2 + C3);
  }
  return b_1;
}

function update_b2 (b_2, x) {
  for (var i=0; i<T; i++) {
    b_2[i] = - (x[3*i] + x[3*i+1] + x[3*i+2] - Math.PI);
  }
  for (var i=0; i<V; i++) {
    var v = uniq[i];
    var sum = 0;
    for (var j=0; j<v.faces.length; j++) {
      var t = v.faces[j];
      var face = geometry.faces[t];
      if (v.index.includes(face.a)) k=0;
      if (v.index.includes(face.a)) k=1;
      if (v.index.includes(face.a)) k=2;
      sum = sum + x[3*t+k]
    }
    b_2[T+i] = - (sum - 2*Math.PI);
  }
  for (var i=0; i<V; i++) {
    var flags = Flag[i];
    var sum = 0;
    for (var j=0; j<flags.length; j++) {
      var flag = flags[j];
      if (flag>0 || flag<0) {
        var a_tk = x[j]
        sum = sum + flag * Math.sin(a_tk)
      }
    }
    b_2[T+V+i] = - sum;
  }
  return b_2;
}


var x = _.clone(beta);
var lambda_1 = Array.apply(null, Array(T)).map(Number.prototype.valueOf, 1)
var lambda_2 = Array.apply(null, Array(V)).map(Number.prototype.valueOf, 1)
var lambda_3 = Array.apply(null, Array(V)).map(Number.prototype.valueOf, 1)

var b_1 = Array.apply(null, Array(3*T)).map(Number.prototype.valueOf, 0)
var b_2 = Array.apply(null, Array(T + 2*V)).map(Number.prototype.valueOf, 0)

var delta_F = Math.sqrt(numeric.dot(b_1, b_1) + numeric.dot(b_2, b_2));
var epsilon = Math.pow(10, -6);

var Lambda_inv = numeric.inv(Lambda);
var J_1_transpose = numeric.transpose(J_1)
var Lambda_star = numeric.dot(numeric.dot(J_1, Lambda_inv), J_1_transpose);
var Lambda_star_inv = numeric.inv(Lambda_star);

while (delta_F < epsilon) {
  b_1 = update_b1(b_1, x, lambda_1, lambda_2, lambda_3);
  b_3 = update_b2(b_2, x);
  J_2 = update_J2(J_2, x);
  J_2_transpose = numeric.transpose(J_2);

  J_star_1 = numeric.dot(numeric.dot(J_2, Lambda_inv), J_1_transpose);
  J_star_2 = numeric.dot(numeric.dot(J_2, Lambda_inv), J_2_transpose);

  J_star_1_transpose = numeric.transpose(J_star_1);

  M = numeric.dot(J_star_1, Lambda_star_inv);
  A = numeric.dot(M, J_star_1_transpose);
  b = numeric.sub(numeric.dot(M, b_1), b_2) // <- b_1_star, b_2_star instead
  delta_lambda_2 = numeric.solve(A, b);

  temp = numeric.sub(b_1, numeric.dot(J_star_1_transpose, delta_lambda_2);
  delta_lambda_1 = numeric.dot(Lambda_star_inv, temp);

  delta_lambda_x =

  x = numeric.add(x, delta_x);
  lambda_1 = numeric.add()

}













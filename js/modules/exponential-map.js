var candidates = [];

function computeExponentialMap (start, callback) {
  console.log('Start computeExponentialMap');
  geometry.uniq.map( function (node) {
    node.distance = undefined;
    return node;
  })
  candidates = [];
  fuga = []
  initializeGamma(start);
  var s = map[start];
  // candidates = [];
  var count = 0;
  while (candidates.length > 0) {
    candidates = _.sortBy(candidates, 'distance')
    var candidate = candidates[0];
    console.log(candidate.index[0] + '->' + candidate.edges)
    for (var i=0; i<candidate.edges.length; i++) {
      var node = geometry.uniq[candidate.edges[i]];
      var result = computeDistance(node)
      if (!result.distance) continue;
      if (!node.distance || node.distance > result.distance) {
        console.log('distance: ' + result.distance)
        node.distance = result.distance
        // console.log('j: ' + result.node_j.index[0] + ', k: ' + result.node_k.index[0])
        node.theta = computeAngle(node, result.node_j, result.node_k, result.alpha);
        getUV(node)
        if (node.distance < maxDistance) {
          for (var j=0; j<node.edges.length; j++) {
            var edge = geometry.uniq[node.edges[j]]
            if (!edge.distance) candidates.push(edge);
          }
        }
        window.node = node;
      }
    }
    count++;
    // if (count > 10) break;
    candidates.shift();
  }
  console.log('Finish computeExponentialMap')
  if (callback) callback();
}

function initializeGamma (start) {
  var s = map[start];
  var origin = geometry.uniq[s];
  origin.distance = Math.pow(10, -12);
  origin.theta = 0;
  getUV(origin);
  var theta = 0;
  var neighbor = origin.edges.slice(1);
  var num = neighbor.length;
  window.origin = origin;
  var axis = geometry.uniq[neighbor[0]];
  edges = [];
  edges.push(axis);
  var prev = axis;
  var checked = [];
  var total = 0;
  while (true) {
    window.prev = prev;
    var faces = _.intersection(prev.faces, origin.faces);
    faces = _.pullAll(faces, checked);
    if (faces.length <= 0) break;
    var faceIndex = faces[0];
    var face = geometry.faces[faceIndex];
    var indexes = _.concat(origin.index, prev.index)
    var ni;
    if (_.includes(indexes, face.a) == false) ni = map[face.a];
    if (_.includes(indexes, face.b) == false) ni = map[face.b];
    if (_.includes(indexes, face.c) == false) ni = map[face.c];
    console.log(ni);
    var next = geometry.uniq[ni];
    var v1 = new THREE.Vector3()
    var v2 = new THREE.Vector3()
    v1.subVectors(axis.vertex, origin.vertex).normalize();
    v2.subVectors(next.vertex, origin.vertex).normalize();
    var cos = v1.dot(v2);
    var theta = Math.acos(cos);
    next.id = ni;
    next.theta = theta;
    next.distance = next.vertex.distanceTo(origin.vertex);

    var v1 = new THREE.Vector3()
    var v2 = new THREE.Vector3()
    v1.subVectors(prev.vertex, origin.vertex).normalize();
    v2.subVectors(next.vertex, origin.vertex).normalize();
    var cos_delta = v1.dot(v2);
    var delta = Math.acos(cos_delta);
    prev.delta = delta;

    edges.push(next);
    checked.push(faceIndex)
    prev = next;

    fuga = _.union(fuga, next.index)
  }
  edges = _.sortBy(edges, 'theta');
  var total = _.sumBy(edges, 'delta');
  for (var i=0; i<edges.length; i++) {
    var edge = edges[i];
    var node = geometry.uniq[edge.id];
    node.theta = edge.theta * (2*Math.PI) / total;
    node.delta = edge.delta * (2*Math.PI) / total;
    getUV(node);
    var output = {
      index: node.id,
      distance: (node.distance).toPrecision(2),
      theta: (node.theta/Math.PI).toPrecision(2) + ' pi',
      u: (node.uv.x).toPrecision(3),
      v: (node.uv.y).toPrecision(3)
    }
    console.log(output);
    console.log('----------');
    candidates.push(node);
  }

  window.edges = edges;
  return edges;
}

function getUV (node) {
  node.u = (node.distance / (Math.sqrt(2)*maxDistance)) * Math.cos(node.theta) + 0.5;
  node.v = (node.distance / (Math.sqrt(2)*maxDistance)) * Math.sin(node.theta) + 0.5;
  // node.u = (node.distance / maxDistance) * Math.cos(node.theta) + 0.5;
  // node.v = (node.distance / maxDistance) * Math.sin(node.theta) + 0.5;
  // node.u = node.distance*Math.cos(node.theta) + 0.5;
  // node.v = node.distance*Math.sin(node.theta) + 0.5;
  node.uv = new THREE.Vector2(node.u, node.v);
  return node;
}

function computeAngle (node, node_j, node_k, alpha) {
  var theta_j = node_j.theta;
  var theta_k = node_k.theta;
  console.log('j: ' + node_j.index[0] + ', k: ' + node_k.index[0] + ', node: ' + node.index[0])
  console.log((1-alpha).toPrecision(2) + ' * ' + theta_j.toPrecision(2) + ' + ' + alpha.toPrecision(2) + ' * ' + theta_k.toPrecision(2))

  if (theta_j == 0 && theta_k > Math.PI) {
    console.log('Hoge')
    theta_j = 2*Math.PI;
  }
  if (theta_k == 0 && theta_j > Math.PI) {
    console.log('Hoge')
    theta_k = 2*Math.PI;
  }
  var diff = theta_j - theta_k;
  // if (diff < 0) {
  //   return theta_j;
  // }
  if (diff > Math.PI) {
    if(theta_j < theta_k) {
      theta_j += 2*Math.PI;
    } else {
      theta_k += 2*Math.PI;
    }
  }
  var theta = (1-alpha)*theta_j + alpha*theta_k;
  console.log('theta: ' + theta.toPrecision(2))
  console.log('---')
  if(theta > 2*Math.PI) theta -= 2*Math.PI;
  return theta;
}

function computeDistance (node) {
  // console.log('Start computeDistance()');
  var result = {}
  for (var i=0; i<node.faces.length; i++) {
    var face = geometry.faces[node.faces[i]];
    var node_j;
    var node_k;
    if (node.index.includes(face.a)) {
      node_j = geometry.uniq[map[face.b]];
      node_k = geometry.uniq[map[face.c]];
    } else if (node.index.includes(face.b)) {
      node_j = geometry.uniq[map[face.a]];
      node_k = geometry.uniq[map[face.c]];
    } else {
      node_j = geometry.uniq[map[face.a]];
      node_k = geometry.uniq[map[face.b]];
    }
    var U_j = node_j.distance;
    var U_k = node_k.distance;
    if (!U_j || !U_k) continue;

    var v_i = node.vertex;
    var v_j = node_j.vertex;
    var v_k = node_k.vertex;
    var e_j = new THREE.Vector3()
    var e_k = new THREE.Vector3()
    var e_kj = new THREE.Vector3()
    e_j.subVectors(v_j, v_i);
    e_k.subVectors(v_k, v_i);
    e_kj.subVectors(v_k, v_j);
    var sq_ej = e_j.dot(e_j);
    var sq_ek = e_k.dot(e_k);
    var sq_ekj = e_kj.dot(e_kj);

    var e = new THREE.Vector3();
    e.crossVectors(e_j, e_k);
    var A = Math.sqrt(e.dot(e));
    var array = [U_j, U_k, Math.sqrt(sq_ekj)].sort();
    var a = array[2];
    var b = array[1];
    var c = array[0];
    var H = Math.sqrt(
      (a + (b + c)) *
      (c - (a - b)) *
      (c + (a - b)) *
      (a + (b - c))
    )
    var x_j = (A * (sq_ekj + U_k*U_k - U_j*U_j) + e_k.dot(e_kj) * H ) / ( 2 * A * sq_ekj);
    var x_k = (A * (sq_ekj + U_j*U_j - U_k*U_k) - e_j.dot(e_kj) * H ) / ( 2 * A * sq_ekj);

    if(x_j<0 || x_k<0) {
      var dijkstra_j = U_j + Math.sqrt(sq_ej);
      var dijkstra_k = U_k + Math.sqrt(sq_ek);
      if(dijkstra_j < dijkstra_k) {
        alpha = 0;
        U_i = dijkstra_j;
      } else {
        alpha = 1;
        U_i = dijkstra_k;
      }
    } else {
      var e_i = new THREE.Vector3();
      e_i.addVectors(e_j.clone().multiplyScalar(x_j) , e_k.clone().multiplyScalar(x_k));
      U_i = Math.sqrt(e_i.dot(e_i));

      var cos_jk = (U_j*U_j + U_k*U_k - sq_ekj) / (2*U_j*U_k);
      var cos_ij = (U_i*U_i + U_j*U_j - sq_ej) / (2*U_i*U_j);
      alpha = Math.acos(cos_ij) / Math.acos(cos_jk);
    }

    if (!result.distance || result.distance > U_i) {
      result.distance = U_i;
      result.alpha = alpha;
      result.node_j = node_j;
      result.node_k = node_k;
      // theta = computeAngle(node, node_j, node_k, alpha)
    }
  }
  return result;
  /*
  node.distance = distance;
  node.theta = theta;
  getUV(node);
  if (node.distance < maxDistance) {
    for (var j=0; j<node.edges.length; j++) {
      var edge = geometry.uniq[node.edges[j]]
      if (!edge.distance) candidates.push(edge);
    }
  }
  // console.log(node);
  return distance;
  */
}



  /*
  for (var i=0; i<num; i++) {
    var ip = (i+1<num) ? i+1 : 0;
    var edge = edges[i];
    var node = geometry.uniq[edges[i].index];
    var next = geometry.uniq[edges[ip].index];
    var v1 = new THREE.Vector3()
    var v2 = new THREE.Vector3()
    v1.subVectors(node.vertex, origin.vertex).normalize();
    v2.subVectors(next.vertex, origin.vertex).normalize();
    var cos_delta = v1.dot(v2);
    var delta = Math.acos(cos_delta);
    edge.delta = delta;
  }
  var total = _.sumBy(edges, 'delta');
  edges.map( function (edge) {
    return edge;
  })
  console.log(theta);

  window.edges = edges;
  var theta = 0;
  for (var i=0; i<num; i++) {
    var edge = edges[i];
    edge.delta = edge.delta * (2*Math.PI) / total;
    edge.theta = theta;
    theta = theta + edge.delta;
    var node = geometry.uniq[edge.index];
    node.distance = node.vertex.distanceTo(origin.vertex);
    node.theta = edge.theta;
    getUV(node);
    var output = {
      index: i,
      distance: (node.distance).toPrecision(2),
      theta: (theta/Math.PI).toPrecision(2) + ' pi',
      u: (node.uv.x).toPrecision(3),
      v: (node.uv.y).toPrecision(3)
    }
    console.log(output);
    console.log('----------');
    candidates.push(node);
  }
  */
  // candidates = []

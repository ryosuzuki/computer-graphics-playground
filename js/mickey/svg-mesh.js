function svgMesh3d (svgPath, opt) {
  if (typeof svgPath !== 'string') {
    throw new TypeError('must provide a string as first parameter')
  }

  opt = assign({
    delaunay: true,
    clean: true,
    exterior: false,
    randomization: 0,
    simplify: 0,
    scale: 1,
    customize: false,
  }, opt)

  var i
  // parse string as a list of operations
  var svg = parseSVG(svgPath)
  // convert curves into discrete points
  var contours = getContours(svg, opt.scale)
  // optionally simplify the path for faster triangulation and/or aesthetics
  if (opt.simplify > 0 && typeof opt.simplify === 'number') {
    for (i = 0; i < contours.length; i++) {
      contours[i] = simplify(contours[i], opt.simplify)
    }
  }

  var start = contours[0][0]
  var end = contours[0][contours.length-1]
  // if (start[0] !== end[0] || start[1] !== end[1]) debugger;

  // prepare for triangulation
  var polyline = denestPolyline(contours)
  var positions = polyline.positions
  var bounds = getBounds(positions)

  var start = positions[0]
  var end = positions[positions.length-1]
  // if (start[0] !== end[0] || start[1] !== end[1]) debugger;



  // optionally add random points for aesthetics
  var randomization = opt.randomization
  if (typeof randomization === 'number' && randomization > 0) {
    addRandomPoints(positions, bounds, randomization)
  }

  var loops = polyline.edges
  var edges = []
  for (i = 0; i < loops.length; ++i) {
    var loop = loops[i]
    for (var j = 0; j < loop.length; ++j) {
      edges.push([loop[j], loop[(j + 1) % loop.length]])
    }
  }

  // this updates points/edges so that they now form a valid PSLG
  if (opt.clean !== false) {
    cleanPSLG(positions, edges)
  }

  // triangulate mesh
  var cells = cdt2d(positions, edges, opt)
  if (opt.customize == false) {
    // rescale to [-1 ... 1]
    normalize(positions, bounds)
    // convert to 3D representation and flip on Y axis for convenience w/ OpenGL
    to3D(positions)
  } else {
    var shape = triangulateContours(contours);
    positions = shape.positions;
    cells = shape.cells;
  }

  return {
    positions: positions,
    cells: cells
  }
}

function to3D (positions) {
  for (var i = 0; i < positions.length; i++) {
    var xy = positions[i]
    xy[1] *= -1
    xy[2] = xy[2] || 0
  }
}

function addRandomPoints (positions, bounds, count) {
  var min = bounds[0]
  var max = bounds[1]

  for (var i = 0; i < count; i++) {
    positions.push([ // random [ x, y ]
      random(min[0], max[0]),
      random(min[1], max[1])
    ])
  }
}

function denestPolyline (nested) {
  var positions = []
  var edges = []

  for (var i = 0; i < nested.length; i++) {
    var path = nested[i]
    var loop = []
    for (var j = 0; j < path.length; j++) {
      var pos = path[j]
      var idx = positions.indexOf(pos)
      if (idx === -1) {
        positions.push(pos)
        idx = positions.length - 1
      }
      loop.push(idx)
    }
    edges.push(loop)
  }
  return {
    positions: positions,
    edges: edges
  }
}

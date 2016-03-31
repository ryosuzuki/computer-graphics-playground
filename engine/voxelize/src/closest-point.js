"use strict";

var closestPoint0d = require("./lib/closest_point_0d.js");
var closestPoint1d = require("./lib/closest_point_1d.js");
var closestPoint2d = require("./lib/closest_point_2d.js");
var closestPointnd = require("./lib/closest_point_nd.js");

var TMP_BUFFER = new Float64Array(4);

function closestPoint(cell, positions, x, result) {
  if(!result) {
    if(TMP_BUFFER.length < x.length) {
      TMP_BUFFER = new Float64Array(x.length);
    }
    result = TMP_BUFFER;
  }
  switch(cell.length) {
    case 0:
      for(var i=0; i<x.length; ++i) {
        result[i] = Number.NaN;
      }
      return Number.NaN;
    case 1:
      return closestPoint0d(positions[cell[0]], x, result);
    case 2:
      return closestPoint1d(positions[cell[0]], positions[cell[1]], x, result);
    case 3:
      return closestPoint2d(positions[cell[0]], positions[cell[1]], positions[cell[2]], x, result);
    default:
      return closestPointnd(cell, positions, x, result);
  }
}
module.exports = closestPoint;


var diff = new Float64Array(4);
var edge0 = new Float64Array(4);
var edge1 = new Float64Array(4);

function closestPoint2d(V0, V1, V2, point, result) {
  //Reallocate buffers if necessary
  if(diff.length < point.length) {
    diff = new Float64Array(point.length);
    edge0 = new Float64Array(point.length);
    edge1 = new Float64Array(point.length);
  }
  //Compute edges
  for(var i=0; i<point.length; ++i) {
    diff[i]  = V0[i] - point[i];
    edge0[i] = V1[i] - V0[i];
    edge1[i] = V2[i] - V0[i];
  }
  //Compute coefficients for quadratic func
  var a00 = 0.0
    , a01 = 0.0
    , a11 = 0.0
    , b0  = 0.0
    , b1  = 0.0
    , c   = 0.0;
  for(var i=0; i<point.length; ++i) {
    var e0 = edge0[i]
      , e1 = edge1[i]
      , d  = diff[i];
    a00 += e0 * e0;
    a01 += e0 * e1;
    a11 += e1 * e1;
    b0  += d * e0;
    b1  += d * e1;
    c   += d * d;
  }
  //Compute determinant/coeffs
  var det = Math.abs(a00*a11 - a01*a01);
  var s   = a01*b1 - a11*b0;
  var t   = a01*b0 - a00*b1;
  var sqrDistance;
  //Hardcoded Voronoi diagram classification
  if (s + t <= det) {
    if (s < 0) {
      if (t < 0) { // region 4
        if (b0 < 0) {
          t = 0;
          if (-b0 >= a00) {
            s = 1.0;
            sqrDistance = a00 + 2.0*b0 + c;
          } else {
            s = -b0/a00;
            sqrDistance = b0*s + c;
          }
        } else {
          s = 0;
          if (b1 >= 0) {
            t = 0;
            sqrDistance = c;
          } else if (-b1 >= a11) {
            t = 1;
            sqrDistance = a11 + 2.0*b1 + c;
          } else {
            t = -b1/a11;
            sqrDistance = b1*t + c;
          }
        }
      } else {  // region 3
        s = 0;
        if (b1 >= 0) {
          t = 0;
          sqrDistance = c;
        } else if (-b1 >= a11) {
          t = 1;
          sqrDistance = a11 + 2.0*b1 + c;
        } else {
          t = -b1/a11;
          sqrDistance = b1*t + c;
        }
      }
    } else if (t < 0) { // region 5
      t = 0;
      if (b0 >= 0) {
        s = 0;
        sqrDistance = c;
      } else if (-b0 >= a00) {
        s = 1;
        sqrDistance = a00 + 2.0*b0 + c;
      } else {
        s = -b0/a00;
        sqrDistance = b0*s + c;
      }
    } else {  // region 0
      // minimum at interior point
      var invDet = 1.0 / det;
      s *= invDet;
      t *= invDet;
      sqrDistance = s*(a00*s + a01*t + 2.0*b0) + t*(a01*s + a11*t + 2.0*b1) + c;
    }
  } else {
    var tmp0, tmp1, numer, denom;

    if (s < 0) {  // region 2
      tmp0 = a01 + b0;
      tmp1 = a11 + b1;
      if (tmp1 > tmp0) {
        numer = tmp1 - tmp0;
        denom = a00 - 2.0*a01 + a11;
        if (numer >= denom) {
          s = 1;
          t = 0;
          sqrDistance = a00 + 2.0*b0 + c;
        } else {
          s = numer/denom;
          t = 1 - s;
          sqrDistance = s*(a00*s + a01*t + 2.0*b0) +
          t*(a01*s + a11*t + 2.0*b1) + c;
        }
      } else {
        s = 0;
        if (tmp1 <= 0) {
          t = 1;
          sqrDistance = a11 + 2.0*b1 + c;
        } else if (b1 >= 0) {
          t = 0;
          sqrDistance = c;
        } else {
          t = -b1/a11;
          sqrDistance = b1*t + c;
        }
      }
    } else if (t < 0) {  // region 6
      tmp0 = a01 + b1;
      tmp1 = a00 + b0;
      if (tmp1 > tmp0) {
        numer = tmp1 - tmp0;
        denom = a00 - 2.0*a01 + a11;
        if (numer >= denom) {
          t = 1;
          s = 0;
          sqrDistance = a11 + 2.0*b1 + c;
        } else {
          t = numer/denom;
          s = 1 - t;
          sqrDistance = s*(a00*s + a01*t + 2.0*b0) +
          t*(a01*s + a11*t + 2.0*b1) + c;
        }
      } else {
        t = 0;
        if (tmp1 <= 0) {
          s = 1;
          sqrDistance = a00 + 2.0*b0 + c;
        } else if (b0 >= 0) {
          s = 0;
          sqrDistance = c;
        } else {
          s = -b0/a00;
          sqrDistance = b0*s + c;
        }
      }
    } else {  // region 1
      numer = a11 + b1 - a01 - b0;
      if (numer <= 0) {
        s = 0;
        t = 1;
        sqrDistance = a11 + 2.0*b1 + c;
      } else {
        denom = a00 - 2.0*a01 + a11;
        if (numer >= denom) {
          s = 1;
          t = 0;
          sqrDistance = a00 + 2.0*b0 + c;
        } else {
          s = numer/denom;
          t = 1 - s;
          sqrDistance = s*(a00*s + a01*t + 2.0*b0) +
          t*(a01*s + a11*t + 2.0*b1) + c;
        }
      }
    }
  }
  var u = 1.0 - s - t;
  for(var i=0; i<point.length; ++i) {
    result[i] = u * V0[i] + s * V1[i] + t * V2[i];
  }
  if(sqrDistance < 0) {
    return 0;
  }
  return sqrDistance;
}

var numeric = require("numeric");
var EPSILON = 1e-6;

//General purpose algorithm, uses quadratic programming, very slow
function closestPointnd(c, positions, x, result) {
  var D = numeric.rep([c.length, c.length], 0.0);
  var dvec = numeric.rep([c.length], 0.0);
  for(var i=0; i<c.length; ++i) {
    var pi = positions[c[i]];
    dvec[i] = numeric.dot(pi, x);
    for(var j=0; j<c.length; ++j) {
      var pj = positions[c[j]];
      D[i][j] = D[j][i] = numeric.dot(pi, pj);
    }
  }
  var A = numeric.rep([c.length, c.length+2], 0.0);
  var b = numeric.rep([c.length+2], 0.0);
  b[0] = 1.0-EPSILON;
  b[1] = -(1.0+EPSILON);
  for(var i=0; i<c.length; ++i) {
    A[i][0]   = 1;
    A[i][1]   = -1
    A[i][i+2] = 1;
  }
  for(var attempts=0; attempts<15; ++attempts) {
    var fortran_poop = numeric.solveQP(D, dvec, A, b);
    if(fortran_poop.message.length > 0) {
      //Quadratic form may be singular, perturb and resolve
      for(var i=0; i<c.length; ++i) {
        D[i][i] += 1e-8;
      }
      continue;
    } else if(isNaN(fortran_poop.value[0])) {
      break;
    } else {
      //Success!
      var solution = fortran_poop.solution;
      for(var i=0; i<x.length; ++i) {
        result[i] = 0.0;
        for(var j=0; j<solution.length; ++j) {
          result[i] += solution[j] * positions[c[j]][i];
        }
      }
      return 2.0 * fortran_poop.value[0] + numeric.dot(x,x);
    }
  }
  for(var i=0; i<x.length; ++i) {
    result[i] = Number.NaN;
  }
  return Number.NaN;
}

var EPSILON = 1e-8;

//Computes closest point to a line segment
function closestPoint1d(a, b, x, result) {
  var denom = 0.0;
  var numer = 0.0;
  for(var i=0; i<x.length; ++i) {
    var ai = a[i];
    var bi = b[i];
    var xi = x[i];
    var dd = ai - bi;
    numer += dd * (xi - bi);
    denom += dd * dd;
  }
  var t = 0.0;
  if(Math.abs(denom) > EPSILON) {
    t = numer / denom;
    if(t < 0.0) {
      t = 0.0;
    } else if(t > 1.0) {
      t = 1.0;
    }
  }
  var ti = 1.0 - t;
  var d = 0;
  for(var i=0; i<x.length; ++i) {
    var r = t * a[i] + ti * b[i];
    result[i] = r;
    var s = x[i] - r;
    d += s * s;
  }
  return d;
}

function closestPoint0d(a, x, result) {
  var d = 0.0;
  for(var i=0; i<x.length; ++i) {
    result[i] = a[i];
    var t = a[i] - x[i];
    d += t * t;
  }
  return d;
}


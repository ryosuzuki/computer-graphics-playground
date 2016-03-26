"use strict"

var ndarray = require("ndarray")
var core = require("rle-core")
var repair = require("rle-repair")
var extents = require("rle-extents")

function array2rle(offset, phase, distance) {
  var result = new core.DynamicVolume()
    , shape = phase.shape
    , nx = shape[0]
    , ny = shape[1]
    , nz = shape[2]
    , x, y, z
  if(offset) {
    if(distance) {
      for(z=0; z<nz; ++z) {
        for(y=0; y<ny; ++y) {
          for(x=0; x<nx; ++x) {
            result.push(x-offset[0], y-offset[1], z-offset[2], Math.abs(distance.get(x,y,z)), phase.get(x,y,z))
          }
          result.push(x-offset[0], y-offset[1], z-offset[2], 1.0, 0)
        }
        for(x=0; x<nx; ++x) {
          result.push(x-offset[0], y-offset[1], z-offset[2], 1.0, 0)
        }
      }
      for(y=0; y<ny; ++y) {
        for(x=0; x<nx; ++x) {
          result.push(x-offset[0], y-offset[1], z-offset[2], 1.0, 0)
        }
      }
    } else {
      for(z=0; z<nz; ++z) {
        for(y=0; y<ny; ++y) {
          for(x=0; x<nx; ++x) {
            result.push(x-offset[0], y-offset[1], z-offset[2], 1.0, phase.get(x,y,z)|0)
          }
          result.push(x-offset[0], y-offset[1], z-offset[2], 1.0, 0)
        }
        for(x=0; x<nx; ++x) {
          result.push(x-offset[0], y-offset[1], z-offset[2], 1.0, 0)
        }
      }
      for(y=0; y<ny; ++y) {
        for(x=0; x<nx; ++x) {
          result.push(x-offset[0], y-offset[1], z-offset[2], 1.0, 0)
        }
      }
    }
  } else {
    if(distance) {
      for(z=0; z<nz; ++z) {
        for(y=0; y<ny; ++y) {
          for(x=0; x<nx; ++x) {
            result.push(x, y, z, Math.abs(distance.get(x,y,z)), phase.get(x,y,z))
          }
          result.push(x, y, z, 1.0, 0)
        }
        for(x=0; x<nx; ++x) {
          result.push(x, y, z, 1.0, 0)
        }
      }
      for(y=0; y<ny; ++y) {
        for(x=0; x<nx; ++x) {
          result.push(x, y, z, 1.0, 0)
        }
      }
    } else {
      for(z=0; z<nz; ++z) {
        for(y=0; y<ny; ++y) {
          for(x=0; x<nx; ++x) {
            result.push(x, y, z, 1.0, phase.get(x,y,z)|0)
          }
          result.push(x, y, z, 1.0, 0)
        }
        for(x=0; x<nx; ++x) {
          result.push(x, y, z, 1.0, 0)
        }
      }
      for(y=0; y<ny; ++y) {
        for(x=0; x<nx; ++x) {
          result.push(x, y, z, 1.0, 0)
        }
      }
    }
  }
  repair.removeDuplicates(result)
  return result
}

module.exports = array2rle;

var totalBoxes = 10;
var xBoxes = 20;
var yBoxes = 10;
var isDrawing = false;
var drawingLine;
var snap = Snap('#svg');
var rectWidth, rectHeight, svgPos;
var animateRunning = true;


var dots = [{
  id: '#A1xpin',
  name: 'breadboard'
},{
  id: '#B2xpin',
  name: 'breadboard'
},{
  id: '#B4xpin',
  name: 'breadboard'
},{
  id: '#D4xpin',
  name: 'breadboard'
},{
  id: '#E4xpin',
  name: 'breadboard'
},{
  id: '#E6xpin',
  name: 'breadboard'
},{
  id: '#D6xpin',
  name: 'breadboard'
},{
  id: '#D7xpin',
  name: 'breadboard'
},{
  id: '#G7xpin',
  name: 'breadboard'
},{
  id: '#A9xpin',
  name: 'breadboard'
},{
  id: '#GND',
  name: 'arduino'
},{
  id: '#A9xpin',
  name: 'breadboard'
}];

var lines = [{
  start: 0,
  end  : 1,
  color: 'blue'
},{
  start: 2,
  end  : 3,
  color: 'gray'
},{
  start: 4,
  end  : 5,
  color: 'orange'
},{
  start: 6,
  end  : 7,
  color: 'red'
},{
  start: 8,
  end  : 9,
  color: 'gray'
},{
  start: 10,
  end  : 11,
  color: 'blue'
}];

var chars = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
function getElement (pos) {
  return '#' + chars[pos[1]] + pos[0] + 'xpin';
}

var breadboard;
var arduino;

var pos;
var line;

var hoge;

$(function(){

  var lx = 0;
  var ly = 0;

  moveFnc = function(dx, dy, x, y) {
    var thisBox = this.getBBox();
    // console.log(thisBox.x, thisBox.y, thisBox);
    lx = dx + this.ox;
    ly = dy + this.oy;
    this.transform('t' + lx + ',' + ly);
    // breadboard.selectAll('.hoge').remove();
    // markCells();
    updatePos(lx, ly, this.name);
    // drawLine2('#GND', '#A30xpin', 'red', thisBox);
  }
  startFnc = function(x, y, e) {  }
  endFnc = function() {
    this.ox = lx;
    this.oy = ly;
    // console.log(this.getBBox());
  };

  Snap.load("breadboard.svg", function (f) {
    breadboard = f.select("g");
    breadboard.name = 'breadboard';
    breadboard.ox = 0;
    breadboard.oy = 0;
    breadboard.attr({
      // "transform": "translate(50 200)"
    })
    snap.append(breadboard);
    drawArduino();
    breadboard.drag(moveFnc, startFnc, endFnc);
  });
});

function drawArduino() {
  Snap.load("arduino.svg", function (f) {
    arduino = f.select("g");
    arduino.name = 'arduino';
    arduino.ox = 0;
    arduino.oy = 0;
    arduino.attr({
      // "transform": "translate(500 200)"
    })
    snap.append(arduino);
    initPos();
    arduino.drag(moveFnc, startFnc, endFnc);
  });
}


function initPos() {
  dots.forEach( function (dot, index) {
    var bb = Snap(dot.id).getBBox();
    dot.init = { x: bb.cx, y: bb.cy };
    dot.pos  = dot.init;
  });
  drawLines();
}

function updatePos(lx, ly, name) {
  var updates = []
  dots.forEach( function (dot, index) {
    if (dot.name == name) {
      dot.pos = { x: dot.init.x + lx, y: dot.init.y + ly };
      updates.push(index);
    }
  });
  drawLines();
}

function drawLines() {
  lines.forEach( function (line) {
    var start = dots[line.start].pos;
    var end = dots[line.end].pos;
    if (!line.path) {
      var path = snap.line(start.x, start.y, end.x, end.y);
      path.attr({
        'stroke': line.color,
        'stroke-width': 3,
      });
      line.path = path;
    } else {
      line.path.attr({
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y
      });
    }
    dots[line.start].line = line;
    dots[line.end].line = line;
  });
}

function markCells() {
  var cell;
  var path;
  for (var i = 0; i < dots.length; i++) {



    var dot = dots[i]
    var start = { x: dot.start[0], y: dot.start[1] };
    var end   = { x: dot.end[0], y: dot.end[1] }
    var color = dot.color;
    var startId = getElement(dot.start);
    var endId = getElement(dot.end);
    drawLine(startId, endId, color);

    // [x0, y0, x1, y1]
    // 1. [x0, y0, (x0 + x1)/2, y0]
    // 2. [(x0 + x1)/2, y0, (x0 + x1)/2, y1]
    // 3. [(x0 + x1)/2, y1, x1, y1]
  };
  // drawLine2('#GND', '#A30xpin', 'red');
}


function drawLine(startId, endId, color) {
  var start = Snap(startId);
  start.attr({
    'fill': color
  });
  var end   = Snap(endId);
  end.attr({
    'fill': color
  });
  var pos = {
    start: start.getBBox(),
    end: end.getBBox()
  }
  var margin = 0; //4/rectWidth;
  var lines = [
    [pos.start.cx - margin, pos.start.cy, (pos.start.cx + pos.end.cx)/2 + margin, pos.start.cy],
    [(pos.start.cx + pos.end.cx)/2, pos.start.cy - margin, (pos.start.cx + pos.end.cx)/2, pos.end.cy + margin],
    [(pos.start.cx + pos.end.cx)/2 - margin, pos.end.cy, pos.end.cx + margin, pos.end.cy],
  ]
  lines.forEach( function (line, index) {
    var path = snap.polyline( line.map( function (i) {
      return i;
    }));
    breadboard.append(path);
    path.attr({
      'class': 'hoge',
      'stroke': color,
      'stroke-width': 3,
      'pointer-events': 'none'
    });


  });

}

function drawLine2(startId, endId, color, bbox) {
  var start = Snap(startId);
  start.attr({
    'fill': color
  });
  var end   = Snap(endId);
  end.attr({
    'fill': color
  });
  var pos = {
    start: start.getBBox(),
    end: bbox
  }
  var margin = 0; //4/rectWidth;
  var lines = [
    [pos.start.cx - margin, pos.start.cy, (pos.start.cx + pos.end.cx)/2 + margin, pos.start.cy],
    [(pos.start.cx + pos.end.cx)/2, pos.start.cy - margin, (pos.start.cx + pos.end.cx)/2, pos.end.cy + margin],
    // [(pos.start.cx + pos.end.cx)/2 - margin, pos.end.cy, pos.end.cx + margin, pos.end.cy],
    [(pos.start.cx + pos.end.cx)/2 - margin, pos.end.cy, Math.random()*100, Math.random()*100],
  ]
  lines.forEach( function (line, index) {
    var path = arduino.polyline( line.map( function (i) {
      return i;
    }));
    path.attr({
      'stroke': color,
      'stroke-width': 3,
      'pointer-events': 'none'
    });
  });

}







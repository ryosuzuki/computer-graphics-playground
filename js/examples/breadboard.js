
var totalBoxes = 10;
var xBoxes = 20;
var yBoxes = 10;
var isDrawing = false;
var drawingLine;
var snapSVG = Snap('#svg');
var rectWidth, rectHeight, svgPos;
var animateRunning = true;


var dots = [{
  'start': [0, 1],
  'end':   [8, 8],
  'color': 'green'
}, {
  'start': [1, 5],
  'end':   [5, 7],
  'color': 'black'
}]

$(function(){

  Snap.load("arduino.svg", function (f) {
    g = f.select("g");
    g.attr({
      "transform": "translate(500 200)"
    })
    snapSVG.append(g);
    g.drag();
  });

  svgPos = $('#svg').position();
  rectWidth = 40; // $('#svg').width() / totalBoxes;
  rectHeight = 40; // $('#svg').height() / totalBoxes;
  for (var i = 0; i < xBoxes; i++) {
    for (var j = 0; j < yBoxes; j++) {
      var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('id', 'rect-' + i + '-' + j);
      $('#svg').append(rect);
      $('#rect-' + i + '-' + j).attr({
        'x': i * rectWidth,
        'y': j * rectHeight,
        'width': rectWidth,
        'height': rectHeight,
        'fill': 'whiteSmoke',
        'stroke-width': '1',
        'stroke': '#ddd'
      });
    };
  };
  markCells();
});

function markCells() {
  var cell;
  var path;
  for (var i = 0; i < dots.length; i++) {
    var dot = dots[i]
    var start = { x: dot.start[0], y: dot.start[1] };
    var end   = { x: dot.end[0], y: dot.end[1] }
    var color = dot.color;
    cell = Snap('#rect-' + start.x + '-' + start.y);
    cell.attr({
      'fill': color
    });
    cell = Snap('#rect-' + end.x + '-' + end.y);
    cell.attr({
      'fill': color
    });
    var paper = snapSVG;

    var data = [0, 0, 5, 3];
    // [x0, y0, x1, y1]
    // 1. [x0, y0, (x0 + x1)/2, y0]
    // 2. [(x0 + x1)/2, y0, (x0 + x1)/2, y1]
    // 3. [(x0 + x1)/2, y1, x1, y1]

    var margin = 4/rectWidth;
    var lines = [
      [start.x - margin, start.y, (start.x + end.x)/2 + margin, start.y],
      [(start.x + end.x)/2, start.y - margin, (start.x + end.x)/2, end.y + margin],
      [(start.x + end.x)/2 - margin, end.y, end.x + margin, end.y],
    ]
    lines.forEach( function (line, index) {
      var path = snapSVG.polyline( line.map( function (i) {
        return (i * rectWidth) + rectWidth/2 ;
      }));
      path.attr({
        'stroke': color,
        'stroke-width': 8,
        'pointer-events': 'none'
      });
    });
  };
}






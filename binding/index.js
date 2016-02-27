var binding = require('./cpp/build/Release/binding');

var geometry = {
  faces: [1, 2, 3, 4, 5]
}

console.log(binding.plusOne(geometry));

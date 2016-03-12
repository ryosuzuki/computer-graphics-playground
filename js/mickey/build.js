(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('isarray')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192 // not used by this implementation

var rootParent = {}

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Due to various browser bugs, sometimes the Object implementation will be used even
 * when the browser supports typed arrays.
 *
 * Note:
 *
 *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
 *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *     incorrect length in some situations.

 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
 * get the Object implementation, which is slower but behaves correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = global.TYPED_ARRAY_SUPPORT !== undefined
  ? global.TYPED_ARRAY_SUPPORT
  : typedArraySupport()

function typedArraySupport () {
  try {
    var arr = new Uint8Array(1)
    arr.foo = function () { return 42 }
    return arr.foo() === 42 && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        arr.subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
}

function kMaxLength () {
  return Buffer.TYPED_ARRAY_SUPPORT
    ? 0x7fffffff
    : 0x3fffffff
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */
function Buffer (arg) {
  if (!(this instanceof Buffer)) {
    // Avoid going through an ArgumentsAdaptorTrampoline in the common case.
    if (arguments.length > 1) return new Buffer(arg, arguments[1])
    return new Buffer(arg)
  }

  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    this.length = 0
    this.parent = undefined
  }

  // Common case.
  if (typeof arg === 'number') {
    return fromNumber(this, arg)
  }

  // Slightly less common case.
  if (typeof arg === 'string') {
    return fromString(this, arg, arguments.length > 1 ? arguments[1] : 'utf8')
  }

  // Unusual.
  return fromObject(this, arg)
}

// TODO: Legacy, not needed anymore. Remove in next major version.
Buffer._augment = function (arr) {
  arr.__proto__ = Buffer.prototype
  return arr
}

function fromNumber (that, length) {
  that = allocate(that, length < 0 ? 0 : checked(length) | 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < length; i++) {
      that[i] = 0
    }
  }
  return that
}

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') encoding = 'utf8'

  // Assumption: byteLength() return value is always < kMaxLength.
  var length = byteLength(string, encoding) | 0
  that = allocate(that, length)

  that.write(string, encoding)
  return that
}

function fromObject (that, object) {
  if (Buffer.isBuffer(object)) return fromBuffer(that, object)

  if (isArray(object)) return fromArray(that, object)

  if (object == null) {
    throw new TypeError('must start with number, buffer, array or string')
  }

  if (typeof ArrayBuffer !== 'undefined') {
    if (object.buffer instanceof ArrayBuffer) {
      return fromTypedArray(that, object)
    }
    if (object instanceof ArrayBuffer) {
      return fromArrayBuffer(that, object)
    }
  }

  if (object.length) return fromArrayLike(that, object)

  return fromJsonObject(that, object)
}

function fromBuffer (that, buffer) {
  var length = checked(buffer.length) | 0
  that = allocate(that, length)
  buffer.copy(that, 0, 0, length)
  return that
}

function fromArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Duplicate of fromArray() to keep fromArray() monomorphic.
function fromTypedArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  // Truncating the elements is probably not what people expect from typed
  // arrays with BYTES_PER_ELEMENT > 1 but it's compatible with the behavior
  // of the old Buffer constructor.
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function fromArrayBuffer (that, array) {
  array.byteLength // this throws if `array` is not a valid ArrayBuffer

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = new Uint8Array(array)
    that.__proto__ = Buffer.prototype
  } else {
    // Fallback: Return an object instance of the Buffer class
    that = fromTypedArray(that, new Uint8Array(array))
  }
  return that
}

function fromArrayLike (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Deserialize { type: 'Buffer', data: [1,2,3,...] } into a Buffer object.
// Returns a zero-length buffer for inputs that don't conform to the spec.
function fromJsonObject (that, object) {
  var array
  var length = 0

  if (object.type === 'Buffer' && isArray(object.data)) {
    array = object.data
    length = checked(array.length) | 0
  }
  that = allocate(that, length)

  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

if (Buffer.TYPED_ARRAY_SUPPORT) {
  Buffer.prototype.__proto__ = Uint8Array.prototype
  Buffer.__proto__ = Uint8Array
  if (typeof Symbol !== 'undefined' && Symbol.species &&
      Buffer[Symbol.species] === Buffer) {
    // Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
    Object.defineProperty(Buffer, Symbol.species, {
      value: null,
      configurable: true
    })
  }
} else {
  // pre-set for values that may exist in the future
  Buffer.prototype.length = undefined
  Buffer.prototype.parent = undefined
}

function allocate (that, length) {
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = new Uint8Array(length)
    that.__proto__ = Buffer.prototype
  } else {
    // Fallback: Return an object instance of the Buffer class
    that.length = length
  }

  var fromPool = length !== 0 && length <= Buffer.poolSize >>> 1
  if (fromPool) that.parent = rootParent

  return that
}

function checked (length) {
  // Note: cannot use `length < kMaxLength` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength()) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength().toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (subject, encoding) {
  if (!(this instanceof SlowBuffer)) return new SlowBuffer(subject, encoding)

  var buf = new Buffer(subject, encoding)
  delete buf.parent
  return buf
}

Buffer.isBuffer = function isBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  var i = 0
  var len = Math.min(x, y)
  while (i < len) {
    if (a[i] !== b[i]) break

    ++i
  }

  if (i !== len) {
    x = a[i]
    y = b[i]
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!isArray(list)) throw new TypeError('list argument must be an Array of Buffers.')

  if (list.length === 0) {
    return new Buffer(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; i++) {
      length += list[i].length
    }
  }

  var buf = new Buffer(length)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

function byteLength (string, encoding) {
  if (typeof string !== 'string') string = '' + string

  var len = string.length
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'binary':
      // Deprecated
      case 'raw':
      case 'raws':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  start = start | 0
  end = end === undefined || end === Infinity ? this.length : end | 0

  if (!encoding) encoding = 'utf8'
  if (start < 0) start = 0
  if (end > this.length) end = this.length
  if (end <= start) return ''

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// The property is used by `Buffer.isBuffer` and `is-buffer` (in Safari 5-7) to detect
// Buffer instances.
Buffer.prototype._isBuffer = true

Buffer.prototype.toString = function toString () {
  var length = this.length | 0
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return 0
  return Buffer.compare(this, b)
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset) {
  if (byteOffset > 0x7fffffff) byteOffset = 0x7fffffff
  else if (byteOffset < -0x80000000) byteOffset = -0x80000000
  byteOffset >>= 0

  if (this.length === 0) return -1
  if (byteOffset >= this.length) return -1

  // Negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = Math.max(this.length + byteOffset, 0)

  if (typeof val === 'string') {
    if (val.length === 0) return -1 // special case: looking for empty string always fails
    return String.prototype.indexOf.call(this, val, byteOffset)
  }
  if (Buffer.isBuffer(val)) {
    return arrayIndexOf(this, val, byteOffset)
  }
  if (typeof val === 'number') {
    if (Buffer.TYPED_ARRAY_SUPPORT && Uint8Array.prototype.indexOf === 'function') {
      return Uint8Array.prototype.indexOf.call(this, val, byteOffset)
    }
    return arrayIndexOf(this, [ val ], byteOffset)
  }

  function arrayIndexOf (arr, val, byteOffset) {
    var foundIndex = -1
    for (var i = 0; byteOffset + i < arr.length; i++) {
      if (arr[byteOffset + i] === val[foundIndex === -1 ? 0 : i - foundIndex]) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === val.length) return byteOffset + foundIndex
      } else {
        foundIndex = -1
      }
    }
    return -1
  }

  throw new TypeError('val must be string, number or Buffer')
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(parsed)) throw new Error('Invalid hex string')
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0
    if (isFinite(length)) {
      length = length | 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    var swap = encoding
    encoding = offset
    offset = length | 0
    length = swap
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'binary':
        return binaryWrite(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xBF) ? 2
      : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function binarySlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = this.subarray(start, end)
    newBuf.__proto__ = Buffer.prototype
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
  }

  if (newBuf.length) newBuf.parent = this.parent || this

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('buffer must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = (value & 0xff)
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('index out of range')
  if (offset < 0) throw new RangeError('index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start
  var i

  if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (i = len - 1; i >= 0; i--) {
      target[i + targetStart] = this[i + start]
    }
  } else if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    // ascending copy from start
    for (i = 0; i < len; i++) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, start + len),
      targetStart
    )
  }

  return len
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function fill (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (end < start) throw new RangeError('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) throw new RangeError('start out of bounds')
  if (end < 0 || end > this.length) throw new RangeError('end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; i++) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"base64-js":2,"ieee754":3,"isarray":4}],2:[function(require,module,exports){
'use strict'

exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

function init () {
  var i
  var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  var len = code.length

  for (i = 0; i < len; i++) {
    lookup[i] = code[i]
  }

  for (i = 0; i < len; ++i) {
    revLookup[code.charCodeAt(i)] = i
  }
  revLookup['-'.charCodeAt(0)] = 62
  revLookup['_'.charCodeAt(0)] = 63
}

init()

function toByteArray (b64) {
  var i, j, l, tmp, placeHolders, arr
  var len = b64.length

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // the number of equal signs (place holders)
  // if there are two placeholders, than the two characters before it
  // represent one byte
  // if there is only one, then the three characters before it represent 2 bytes
  // this is just a cheap hack to not do indexOf twice
  placeHolders = b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0

  // base64 is 4/3 + up to two characters of the original data
  arr = new Arr(len * 3 / 4 - placeHolders)

  // if there are placeholders, only get up to the last complete 4 chars
  l = placeHolders > 0 ? len - 4 : len

  var L = 0

  for (i = 0, j = 0; i < l; i += 4, j += 3) {
    tmp = (revLookup[b64.charCodeAt(i)] << 18) | (revLookup[b64.charCodeAt(i + 1)] << 12) | (revLookup[b64.charCodeAt(i + 2)] << 6) | revLookup[b64.charCodeAt(i + 3)]
    arr[L++] = (tmp & 0xFF0000) >> 16
    arr[L++] = (tmp & 0xFF00) >> 8
    arr[L++] = tmp & 0xFF
  }

  if (placeHolders === 2) {
    tmp = (revLookup[b64.charCodeAt(i)] << 2) | (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[L++] = tmp & 0xFF
  } else if (placeHolders === 1) {
    tmp = (revLookup[b64.charCodeAt(i)] << 10) | (revLookup[b64.charCodeAt(i + 1)] << 4) | (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[L++] = (tmp >> 8) & 0xFF
    arr[L++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var output = ''
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    output += lookup[tmp >> 2]
    output += lookup[(tmp << 4) & 0x3F]
    output += '=='
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + (uint8[len - 1])
    output += lookup[tmp >> 10]
    output += lookup[(tmp >> 4) & 0x3F]
    output += lookup[(tmp << 2) & 0x3F]
    output += '='
  }

  parts.push(output)

  return parts.join('')
}

},{}],3:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],4:[function(require,module,exports){
var toString = {}.toString;

module.exports = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};

},{}],5:[function(require,module,exports){
// Implementation of the Greiner-Hormann polygon clipping algorithm
//

var segseg = require('segseg');
var preprocessPolygon = require("point-in-big-polygon");
var area = require('2d-polygon-area');
var sign = require('signum');
var abs = Math.abs;

function copy(a) {
  var l = a.length;
  var out = new Array(l);
  for (var i = 0; i<l; i++) {
    out[i] = a[i].slice();
  }
  return out;
}

function Node(vec, alpha, intersection) {
  this.vec = vec;
  this.alpha = alpha || 0;
  this.intersect = !!intersection;
}

Node.prototype = {
  vec: null,
  next: null,
  next: null,
  prev: null,
  nextPoly: null,
  neighbor: null,
  intersect: null,
  entry: null,
  visited : false,
  alpha : 0,

  nextNonIntersection : function nodeNextNonIntersection() {
    var a = this;
    while(a && a.intersect) {
      a = a.next;
    }
    return a;
  },

  last : function nodeLast() {
    var a = this;
    while (a.next && a.next !== this) {
      a = a.next;
    }
    return a;
  },

  createLoop : function nodeCreateLoop() {
    var last = this.last();
    last.prev.next = this;
    this.prev = last.prev;
  },

  firstNodeOfInterest : function nodeFirstNodeOfInterest() {
    var a = this;

    if (a) {
      do {
        a=a.next;
      } while(a!==this && (!a.intersect || a.intersect && a.visited));
    }

    return a;
  },

  insertBetween : function nodeInsertBetween(first, last) {
    var a = first;
    while(a !== last && a.alpha < this.alpha) {
      a = a.next;
    }

    this.next = a;
    this.prev = a.prev;
    if (this.prev) {
      this.prev.next = this;
    }

    this.next.prev = this;
  }
};


function createLinkedList(vecs) {
  var l = vecs.length;
  var ret, where;
  for (var i=0; i<l; i++) {
    var current = vecs[i];
    if (!ret) {
      where = ret = new Node(current);
    } else {
      where.next = new Node(current);
      where.next.prev = where;
      where = where.next;
    }
  }

  return ret;
}

function distance(v1, v2) {
  var x = v1[0] - v2[0];
  var y = v1[1] - v2[1];
  return Math.sqrt(x*x + y*y);
}

function clean(array) {
  var seen = {};
  var cur = array.length - 1;
  while (cur--) {
    var c = array[cur];
    var p = array[cur+1];
    if (c[0] === p[0] && c[1] === p[1]) {
      array.splice(cur, 1);
    }
  }
  return array;
}


function identifyIntersections(subjectList, clipList) {
  var subject, clip;
  var auxs = subjectList.last();
  auxs.next = new Node(subjectList.vec, auxs);
  auxs.next.prev = auxs;

  var auxc = clipList.last();
  auxc.next = new Node(clipList.vec, auxc);
  auxc.next.prev = auxc;

  var found = false;
  for(subject = subjectList; subject.next; subject = subject.next) {
    if(!subject.intersect) {
      for(clip = clipList; clip.next; clip = clip.next) {
        if(!clip.intersect) {

          var a = subject.vec,
              b = subject.next.nextNonIntersection().vec,
              c = clip.vec,
              d = clip.next.nextNonIntersection().vec;

          var i = segseg(a, b, c, d);

          if(i && i !== true) {
            found = true;
            var intersectionSubject = new Node(i, distance(a, i) / distance(a, b), true);
            var intersectionClip = new Node(i, distance(c, i) / distance(c, d), true);
            intersectionSubject.neighbor = intersectionClip;
            intersectionClip.neighbor = intersectionSubject;
            intersectionSubject.insertBetween(subject, subject.next.nextNonIntersection());
            intersectionClip.insertBetween(clip, clip.next.nextNonIntersection());
          }
        }
      }
    }
  }

  return found;
};

function identifyIntersectionType(subjectList, clipList, clipTest, subjectTest, type) {
  var subject, clip;
  var se = clipTest(subjectList.vec) < 0;
  if (type === 'and') {
    se = !se;
  }

  for(subject = subjectList; subject.next; subject = subject.next) {
    if(subject.intersect) {
      subject.entry = se;
      se = !se;
    }
  }

  var ce = subjectTest(clipList.vec) > 0;
  if (type === 'or') {
    ce = !ce;
  }

  for(clip = clipList; clip.next; clip = clip.next) {
    if(clip.intersect) {
      clip.entry = ce;
      ce = !ce;
    }
  }
};

function collectClipResults(subjectList, clipList) {
  subjectList.createLoop();
  clipList.createLoop();

  var crt, results = [], result;

  while ((crt = subjectList.firstNodeOfInterest()) !== subjectList) {
    result = [];
    for (; !crt.visited; crt = crt.neighbor) {

      result.push(crt.vec);
      var forward = crt.entry
      while(true) {
        crt.visited = true;
        crt = forward ? crt.next : crt.prev;

        if(crt.intersect) {
          crt.visited = true;
          break;
        } else {
          result.push(crt.vec);
        }
      }
    }

    results.push(clean(result));
  }

  return results;
};

function polygonBoolean(subjectPoly, clipPoly, operation) {

  var subjectList = createLinkedList(subjectPoly);
  var clipList = createLinkedList(clipPoly);
  var clipContains = preprocessPolygon([clipPoly]);
  var subjectContains = preprocessPolygon([subjectPoly]);

  var subject, clip, res;

  // Phase 1: Identify and store intersections between the subject
  //          and clip polygons
  var isects = identifyIntersections(subjectList, clipList);

  if (isects) {
    // Phase 2: walk the resulting linked list and mark each intersection
    //          as entering or exiting
    identifyIntersectionType(
      subjectList,
      clipList,
      clipContains,
      subjectContains,
      operation
    );

    // Phase 3: collect resulting polygons
    res = collectClipResults(subjectList, clipList);
  } else {
    // No intersections

    var inner = clipContains(subjectPoly[0]) < 0;
    var outer = subjectContains(clipPoly[0]) < 0;

    // TODO: slice will not copy the vecs

    res = [];
    switch (operation) {
      case 'or':
        if (!inner && !outer) {
          res.push(copy(subjectPoly));
          res.push(copy(clipPoly));
        } else if (inner) {
          res.push(copy(clipPoly));
        } else if (outer) {
          res.push(copy(subjectPoly));
        }
      break;

      case 'and':
        if (inner) {
          res.push(copy(subjectPoly))
        } else if (outer) {
          res.push(copy(clipPoly));
        } else {
          throw new Error('woops')
        }
      break;

      case 'not':
        var sclone = copy(subjectPoly);
        var cclone = copy(clipPoly);

        var sarea = area(sclone);
        var carea = area(cclone);
        if (sign(sarea) === sign(carea)) {
          if (outer) {
            cclone.reverse();
          } else if (inner) {
            sclone.reverse();
          }
        }

        res.push(sclone);

        if (abs(sarea) > abs(carea)) {
          res.push(cclone);
        } else {
          res.unshift(cclone);
        }

      break
    }
  }

  return res;
};

module.exports = polygonBoolean;

},{"2d-polygon-area":6,"point-in-big-polygon":17,"segseg":18,"signum":19}],6:[function(require,module,exports){
module.exports = area;

var e0 = [0, 0];
var e1 = [0, 0];

function area(a) {
  var area = 0;
  var first = a[0];

  var l = a.length;
  for (var i=2; i<l; i++) {
    var p = a[i-1];
    var c = a[i];
    e0[0] = first[0] - c[0];
    e0[1] = first[1] - c[1];
    e1[0] = first[0] - p[0];
    e1[1] = first[1] - p[1];

    area += (e0[0] * e1[1]) - (e0[1] * e1[0]);
  }
  return area/2;
}

},{}],7:[function(require,module,exports){
"use strict"

module.exports = fastTwoSum

function fastTwoSum(a, b, result) {
  var x = a + b
  var bv = x - a
  var av = x - bv
  var br = b - bv
  var ar = a - av
  if(result) {
    result[0] = ar + br
    result[1] = x
    return result
  }
  return [ar+br, x]
}
},{}],8:[function(require,module,exports){
"use strict"

var twoProduct = require("two-product")
var twoSum = require("two-sum")

module.exports = scaleLinearExpansion

function scaleLinearExpansion(e, scale) {
  var n = e.length
  if(n === 1) {
    var ts = twoProduct(e[0], scale)
    if(ts[0]) {
      return ts
    }
    return [ ts[1] ]
  }
  var g = new Array(2 * n)
  var q = [0.1, 0.1]
  var t = [0.1, 0.1]
  var count = 0
  twoProduct(e[0], scale, q)
  if(q[0]) {
    g[count++] = q[0]
  }
  for(var i=1; i<n; ++i) {
    twoProduct(e[i], scale, t)
    var pq = q[1]
    twoSum(pq, t[0], q)
    if(q[0]) {
      g[count++] = q[0]
    }
    var a = t[1]
    var b = q[1]
    var x = a + b
    var bv = x - a
    var y = b - bv
    q[1] = x
    if(y) {
      g[count++] = y
    }
  }
  if(q[1]) {
    g[count++] = q[1]
  }
  if(count === 0) {
    g[count++] = 0.0
  }
  g.length = count
  return g
}
},{"two-product":11,"two-sum":7}],9:[function(require,module,exports){
"use strict"

module.exports = robustSubtract

//Easy case: Add two scalars
function scalarScalar(a, b) {
  var x = a + b
  var bv = x - a
  var av = x - bv
  var br = b - bv
  var ar = a - av
  var y = ar + br
  if(y) {
    return [y, x]
  }
  return [x]
}

function robustSubtract(e, f) {
  var ne = e.length|0
  var nf = f.length|0
  if(ne === 1 && nf === 1) {
    return scalarScalar(e[0], -f[0])
  }
  var n = ne + nf
  var g = new Array(n)
  var count = 0
  var eptr = 0
  var fptr = 0
  var abs = Math.abs
  var ei = e[eptr]
  var ea = abs(ei)
  var fi = -f[fptr]
  var fa = abs(fi)
  var a, b
  if(ea < fa) {
    b = ei
    eptr += 1
    if(eptr < ne) {
      ei = e[eptr]
      ea = abs(ei)
    }
  } else {
    b = fi
    fptr += 1
    if(fptr < nf) {
      fi = -f[fptr]
      fa = abs(fi)
    }
  }
  if((eptr < ne && ea < fa) || (fptr >= nf)) {
    a = ei
    eptr += 1
    if(eptr < ne) {
      ei = e[eptr]
      ea = abs(ei)
    }
  } else {
    a = fi
    fptr += 1
    if(fptr < nf) {
      fi = -f[fptr]
      fa = abs(fi)
    }
  }
  var x = a + b
  var bv = x - a
  var y = b - bv
  var q0 = y
  var q1 = x
  var _x, _bv, _av, _br, _ar
  while(eptr < ne && fptr < nf) {
    if(ea < fa) {
      a = ei
      eptr += 1
      if(eptr < ne) {
        ei = e[eptr]
        ea = abs(ei)
      }
    } else {
      a = fi
      fptr += 1
      if(fptr < nf) {
        fi = -f[fptr]
        fa = abs(fi)
      }
    }
    b = q0
    x = a + b
    bv = x - a
    y = b - bv
    if(y) {
      g[count++] = y
    }
    _x = q1 + x
    _bv = _x - q1
    _av = _x - _bv
    _br = x - _bv
    _ar = q1 - _av
    q0 = _ar + _br
    q1 = _x
  }
  while(eptr < ne) {
    a = ei
    b = q0
    x = a + b
    bv = x - a
    y = b - bv
    if(y) {
      g[count++] = y
    }
    _x = q1 + x
    _bv = _x - q1
    _av = _x - _bv
    _br = x - _bv
    _ar = q1 - _av
    q0 = _ar + _br
    q1 = _x
    eptr += 1
    if(eptr < ne) {
      ei = e[eptr]
    }
  }
  while(fptr < nf) {
    a = fi
    b = q0
    x = a + b
    bv = x - a
    y = b - bv
    if(y) {
      g[count++] = y
    }
    _x = q1 + x
    _bv = _x - q1
    _av = _x - _bv
    _br = x - _bv
    _ar = q1 - _av
    q0 = _ar + _br
    q1 = _x
    fptr += 1
    if(fptr < nf) {
      fi = -f[fptr]
    }
  }
  if(q0) {
    g[count++] = q0
  }
  if(q1) {
    g[count++] = q1
  }
  if(!count) {
    g[count++] = 0.0
  }
  g.length = count
  return g
}
},{}],10:[function(require,module,exports){
"use strict"

module.exports = linearExpansionSum

//Easy case: Add two scalars
function scalarScalar(a, b) {
  var x = a + b
  var bv = x - a
  var av = x - bv
  var br = b - bv
  var ar = a - av
  var y = ar + br
  if(y) {
    return [y, x]
  }
  return [x]
}

function linearExpansionSum(e, f) {
  var ne = e.length|0
  var nf = f.length|0
  if(ne === 1 && nf === 1) {
    return scalarScalar(e[0], f[0])
  }
  var n = ne + nf
  var g = new Array(n)
  var count = 0
  var eptr = 0
  var fptr = 0
  var abs = Math.abs
  var ei = e[eptr]
  var ea = abs(ei)
  var fi = f[fptr]
  var fa = abs(fi)
  var a, b
  if(ea < fa) {
    b = ei
    eptr += 1
    if(eptr < ne) {
      ei = e[eptr]
      ea = abs(ei)
    }
  } else {
    b = fi
    fptr += 1
    if(fptr < nf) {
      fi = f[fptr]
      fa = abs(fi)
    }
  }
  if((eptr < ne && ea < fa) || (fptr >= nf)) {
    a = ei
    eptr += 1
    if(eptr < ne) {
      ei = e[eptr]
      ea = abs(ei)
    }
  } else {
    a = fi
    fptr += 1
    if(fptr < nf) {
      fi = f[fptr]
      fa = abs(fi)
    }
  }
  var x = a + b
  var bv = x - a
  var y = b - bv
  var q0 = y
  var q1 = x
  var _x, _bv, _av, _br, _ar
  while(eptr < ne && fptr < nf) {
    if(ea < fa) {
      a = ei
      eptr += 1
      if(eptr < ne) {
        ei = e[eptr]
        ea = abs(ei)
      }
    } else {
      a = fi
      fptr += 1
      if(fptr < nf) {
        fi = f[fptr]
        fa = abs(fi)
      }
    }
    b = q0
    x = a + b
    bv = x - a
    y = b - bv
    if(y) {
      g[count++] = y
    }
    _x = q1 + x
    _bv = _x - q1
    _av = _x - _bv
    _br = x - _bv
    _ar = q1 - _av
    q0 = _ar + _br
    q1 = _x
  }
  while(eptr < ne) {
    a = ei
    b = q0
    x = a + b
    bv = x - a
    y = b - bv
    if(y) {
      g[count++] = y
    }
    _x = q1 + x
    _bv = _x - q1
    _av = _x - _bv
    _br = x - _bv
    _ar = q1 - _av
    q0 = _ar + _br
    q1 = _x
    eptr += 1
    if(eptr < ne) {
      ei = e[eptr]
    }
  }
  while(fptr < nf) {
    a = fi
    b = q0
    x = a + b
    bv = x - a
    y = b - bv
    if(y) {
      g[count++] = y
    }
    _x = q1 + x
    _bv = _x - q1
    _av = _x - _bv
    _br = x - _bv
    _ar = q1 - _av
    q0 = _ar + _br
    q1 = _x
    fptr += 1
    if(fptr < nf) {
      fi = f[fptr]
    }
  }
  if(q0) {
    g[count++] = q0
  }
  if(q1) {
    g[count++] = q1
  }
  if(!count) {
    g[count++] = 0.0
  }
  g.length = count
  return g
}
},{}],11:[function(require,module,exports){
"use strict"

module.exports = twoProduct

var SPLITTER = +(Math.pow(2, 27) + 1.0)

function twoProduct(a, b, result) {
  var x = a * b

  var c = SPLITTER * a
  var abig = c - a
  var ahi = c - abig
  var alo = a - ahi

  var d = SPLITTER * b
  var bbig = d - b
  var bhi = d - bbig
  var blo = b - bhi

  var err1 = x - (ahi * bhi)
  var err2 = err1 - (alo * bhi)
  var err3 = err2 - (ahi * blo)

  var y = alo * blo - err3

  if(result) {
    result[0] = y
    result[1] = x
    return result
  }

  return [ y, x ]
}
},{}],12:[function(require,module,exports){
"use strict"

var twoProduct = require("two-product")
var robustSum = require("robust-sum")
var robustScale = require("robust-scale")
var robustSubtract = require("robust-subtract")

var NUM_EXPAND = 5

var EPSILON     = 1.1102230246251565e-16
var ERRBOUND3   = (3.0 + 16.0 * EPSILON) * EPSILON
var ERRBOUND4   = (7.0 + 56.0 * EPSILON) * EPSILON

function cofactor(m, c) {
  var result = new Array(m.length-1)
  for(var i=1; i<m.length; ++i) {
    var r = result[i-1] = new Array(m.length-1)
    for(var j=0,k=0; j<m.length; ++j) {
      if(j === c) {
        continue
      }
      r[k++] = m[i][j]
    }
  }
  return result
}

function matrix(n) {
  var result = new Array(n)
  for(var i=0; i<n; ++i) {
    result[i] = new Array(n)
    for(var j=0; j<n; ++j) {
      result[i][j] = ["m", j, "[", (n-i-1), "]"].join("")
    }
  }
  return result
}

function sign(n) {
  if(n & 1) {
    return "-"
  }
  return ""
}

function generateSum(expr) {
  if(expr.length === 1) {
    return expr[0]
  } else if(expr.length === 2) {
    return ["sum(", expr[0], ",", expr[1], ")"].join("")
  } else {
    var m = expr.length>>1
    return ["sum(", generateSum(expr.slice(0, m)), ",", generateSum(expr.slice(m)), ")"].join("")
  }
}

function determinant(m) {
  if(m.length === 2) {
    return [["sum(prod(", m[0][0], ",", m[1][1], "),prod(-", m[0][1], ",", m[1][0], "))"].join("")]
  } else {
    var expr = []
    for(var i=0; i<m.length; ++i) {
      expr.push(["scale(", generateSum(determinant(cofactor(m, i))), ",", sign(i), m[0][i], ")"].join(""))
    }
    return expr
  }
}

function orientation(n) {
  var pos = []
  var neg = []
  var m = matrix(n)
  var args = []
  for(var i=0; i<n; ++i) {
    if((i&1)===0) {
      pos.push.apply(pos, determinant(cofactor(m, i)))
    } else {
      neg.push.apply(neg, determinant(cofactor(m, i)))
    }
    args.push("m" + i)
  }
  var posExpr = generateSum(pos)
  var negExpr = generateSum(neg)
  var funcName = "orientation" + n + "Exact"
  var code = ["function ", funcName, "(", args.join(), "){var p=", posExpr, ",n=", negExpr, ",d=sub(p,n);\
return d[d.length-1];};return ", funcName].join("")
  var proc = new Function("sum", "prod", "scale", "sub", code)
  return proc(robustSum, twoProduct, robustScale, robustSubtract)
}

var orientation3Exact = orientation(3)
var orientation4Exact = orientation(4)

var CACHED = [
  function orientation0() { return 0 },
  function orientation1() { return 0 },
  function orientation2(a, b) {
    return b[0] - a[0]
  },
  function orientation3(a, b, c) {
    var l = (a[1] - c[1]) * (b[0] - c[0])
    var r = (a[0] - c[0]) * (b[1] - c[1])
    var det = l - r
    var s
    if(l > 0) {
      if(r <= 0) {
        return det
      } else {
        s = l + r
      }
    } else if(l < 0) {
      if(r >= 0) {
        return det
      } else {
        s = -(l + r)
      }
    } else {
      return det
    }
    var tol = ERRBOUND3 * s
    if(det >= tol || det <= -tol) {
      return det
    }
    return orientation3Exact(a, b, c)
  },
  function orientation4(a,b,c,d) {
    var adx = a[0] - d[0]
    var bdx = b[0] - d[0]
    var cdx = c[0] - d[0]
    var ady = a[1] - d[1]
    var bdy = b[1] - d[1]
    var cdy = c[1] - d[1]
    var adz = a[2] - d[2]
    var bdz = b[2] - d[2]
    var cdz = c[2] - d[2]
    var bdxcdy = bdx * cdy
    var cdxbdy = cdx * bdy
    var cdxady = cdx * ady
    var adxcdy = adx * cdy
    var adxbdy = adx * bdy
    var bdxady = bdx * ady
    var det = adz * (bdxcdy - cdxbdy)
            + bdz * (cdxady - adxcdy)
            + cdz * (adxbdy - bdxady)
    var permanent = (Math.abs(bdxcdy) + Math.abs(cdxbdy)) * Math.abs(adz)
                  + (Math.abs(cdxady) + Math.abs(adxcdy)) * Math.abs(bdz)
                  + (Math.abs(adxbdy) + Math.abs(bdxady)) * Math.abs(cdz)
    var tol = ERRBOUND4 * permanent
    if ((det > tol) || (-det > tol)) {
      return det
    }
    return orientation4Exact(a,b,c,d)
  }
]

function slowOrient(args) {
  var proc = CACHED[args.length]
  if(!proc) {
    proc = CACHED[args.length] = orientation(args.length)
  }
  return proc.apply(undefined, args)
}

function generateOrientationProc() {
  while(CACHED.length <= NUM_EXPAND) {
    CACHED.push(orientation(CACHED.length))
  }
  var args = []
  var procArgs = ["slow"]
  for(var i=0; i<=NUM_EXPAND; ++i) {
    args.push("a" + i)
    procArgs.push("o" + i)
  }
  var code = [
    "function getOrientation(", args.join(), "){switch(arguments.length){case 0:case 1:return 0;"
  ]
  for(var i=2; i<=NUM_EXPAND; ++i) {
    code.push("case ", i, ":return o", i, "(", args.slice(0, i).join(), ");")
  }
  code.push("}var s=new Array(arguments.length);for(var i=0;i<arguments.length;++i){s[i]=arguments[i]};return slow(s);}return getOrientation")
  procArgs.push(code.join(""))

  var proc = Function.apply(undefined, procArgs)
  module.exports = proc.apply(undefined, [slowOrient].concat(CACHED))
  for(var i=0; i<=NUM_EXPAND; ++i) {
    module.exports[i] = CACHED[i]
  }
}

generateOrientationProc()
},{"robust-scale":8,"robust-subtract":9,"robust-sum":10,"two-product":11}],13:[function(require,module,exports){
"use strict"

module.exports = orderSegments

var orient = require("robust-orientation")

function horizontalOrder(a, b) {
  var bl, br
  if(b[0][0] < b[1][0]) {
    bl = b[0]
    br = b[1]
  } else if(b[0][0] > b[1][0]) {
    bl = b[1]
    br = b[0]
  } else {
    var alo = Math.min(a[0][1], a[1][1])
    var ahi = Math.max(a[0][1], a[1][1])
    var blo = Math.min(b[0][1], b[1][1])
    var bhi = Math.max(b[0][1], b[1][1])
    if(ahi < blo) {
      return ahi - blo
    }
    if(alo > bhi) {
      return alo - bhi
    }
    return ahi - bhi
  }
  var al, ar
  if(a[0][1] < a[1][1]) {
    al = a[0]
    ar = a[1]
  } else {
    al = a[1]
    ar = a[0]
  }
  var d = orient(br, bl, al)
  if(d) {
    return d
  }
  d = orient(br, bl, ar)
  if(d) {
    return d
  }
  return ar - br
}

function orderSegments(b, a) {
  var al, ar
  if(a[0][0] < a[1][0]) {
    al = a[0]
    ar = a[1]
  } else if(a[0][0] > a[1][0]) {
    al = a[1]
    ar = a[0]
  } else {
    return horizontalOrder(a, b)
  }
  var bl, br
  if(b[0][0] < b[1][0]) {
    bl = b[0]
    br = b[1]
  } else if(b[0][0] > b[1][0]) {
    bl = b[1]
    br = b[0]
  } else {
    return -horizontalOrder(b, a)
  }
  var d1 = orient(al, ar, br)
  var d2 = orient(al, ar, bl)
  if(d1 < 0) {
    if(d2 <= 0) {
      return d1
    }
  } else if(d1 > 0) {
    if(d2 >= 0) {
      return d1
    }
  } else if(d2) {
    return d2
  }
  d1 = orient(br, bl, ar)
  d2 = orient(br, bl, al)
  if(d1 < 0) {
    if(d2 <= 0) {
      return d1
    }
  } else if(d1 > 0) {
    if(d2 >= 0) {
      return d1
    }
  } else if(d2) {
    return d2
  }
  return ar[0] - br[0]
}
},{"robust-orientation":12}],14:[function(require,module,exports){
"use strict"

function compileSearch(funcName, predicate, reversed, extraArgs, useNdarray, earlyOut) {
  var code = [
    "function ", funcName, "(a,l,h,", extraArgs.join(","),  "){",
earlyOut ? "" : "var i=", (reversed ? "l-1" : "h+1"),
";while(l<=h){\
var m=(l+h)>>>1,x=a", useNdarray ? ".get(m)" : "[m]"]
  if(earlyOut) {
    if(predicate.indexOf("c") < 0) {
      code.push(";if(x===y){return m}else if(x<=y){")
    } else {
      code.push(";var p=c(x,y);if(p===0){return m}else if(p<=0){")
    }
  } else {
    code.push(";if(", predicate, "){i=m;")
  }
  if(reversed) {
    code.push("l=m+1}else{h=m-1}")
  } else {
    code.push("h=m-1}else{l=m+1}")
  }
  code.push("}")
  if(earlyOut) {
    code.push("return -1};")
  } else {
    code.push("return i};")
  }
  return code.join("")
}

function compileBoundsSearch(predicate, reversed, suffix, earlyOut) {
  var result = new Function([
  compileSearch("A", "x" + predicate + "y", reversed, ["y"], false, earlyOut),
  compileSearch("B", "x" + predicate + "y", reversed, ["y"], true, earlyOut),
  compileSearch("P", "c(x,y)" + predicate + "0", reversed, ["y", "c"], false, earlyOut),
  compileSearch("Q", "c(x,y)" + predicate + "0", reversed, ["y", "c"], true, earlyOut),
"function dispatchBsearch", suffix, "(a,y,c,l,h){\
if(a.shape){\
if(typeof(c)==='function'){\
return Q(a,(l===undefined)?0:l|0,(h===undefined)?a.shape[0]-1:h|0,y,c)\
}else{\
return B(a,(c===undefined)?0:c|0,(l===undefined)?a.shape[0]-1:l|0,y)\
}}else{\
if(typeof(c)==='function'){\
return P(a,(l===undefined)?0:l|0,(h===undefined)?a.length-1:h|0,y,c)\
}else{\
return A(a,(c===undefined)?0:c|0,(l===undefined)?a.length-1:l|0,y)\
}}}\
return dispatchBsearch", suffix].join(""))
  return result()
}

module.exports = {
  ge: compileBoundsSearch(">=", false, "GE"),
  gt: compileBoundsSearch(">", false, "GT"),
  lt: compileBoundsSearch("<", true, "LT"),
  le: compileBoundsSearch("<=", true, "LE"),
  eq: compileBoundsSearch("-", true, "EQ", true)
}

},{}],15:[function(require,module,exports){
"use strict"

module.exports = createRBTree

var RED   = 0
var BLACK = 1

function RBNode(color, key, value, left, right, count) {
  this._color = color
  this.key = key
  this.value = value
  this.left = left
  this.right = right
  this._count = count
}

function cloneNode(node) {
  return new RBNode(node._color, node.key, node.value, node.left, node.right, node._count)
}

function repaint(color, node) {
  return new RBNode(color, node.key, node.value, node.left, node.right, node._count)
}

function recount(node) {
  node._count = 1 + (node.left ? node.left._count : 0) + (node.right ? node.right._count : 0)
}

function RedBlackTree(compare, root) {
  this._compare = compare
  this.root = root
}

var proto = RedBlackTree.prototype

Object.defineProperty(proto, "keys", {
  get: function() {
    var result = []
    this.forEach(function(k,v) {
      result.push(k)
    })
    return result
  }
})

Object.defineProperty(proto, "values", {
  get: function() {
    var result = []
    this.forEach(function(k,v) {
      result.push(v)
    })
    return result
  }
})

//Returns the number of nodes in the tree
Object.defineProperty(proto, "length", {
  get: function() {
    if(this.root) {
      return this.root._count
    }
    return 0
  }
})

//Insert a new item into the tree
proto.insert = function(key, value) {
  var cmp = this._compare
  //Find point to insert new node at
  var n = this.root
  var n_stack = []
  var d_stack = []
  while(n) {
    var d = cmp(key, n.key)
    n_stack.push(n)
    d_stack.push(d)
    if(d <= 0) {
      n = n.left
    } else {
      n = n.right
    }
  }
  //Rebuild path to leaf node
  n_stack.push(new RBNode(RED, key, value, null, null, 1))
  for(var s=n_stack.length-2; s>=0; --s) {
    var n = n_stack[s]
    if(d_stack[s] <= 0) {
      n_stack[s] = new RBNode(n._color, n.key, n.value, n_stack[s+1], n.right, n._count+1)
    } else {
      n_stack[s] = new RBNode(n._color, n.key, n.value, n.left, n_stack[s+1], n._count+1)
    }
  }
  //Rebalance tree using rotations
  //console.log("start insert", key, d_stack)
  for(var s=n_stack.length-1; s>1; --s) {
    var p = n_stack[s-1]
    var n = n_stack[s]
    if(p._color === BLACK || n._color === BLACK) {
      break
    }
    var pp = n_stack[s-2]
    if(pp.left === p) {
      if(p.left === n) {
        var y = pp.right
        if(y && y._color === RED) {
          //console.log("LLr")
          p._color = BLACK
          pp.right = repaint(BLACK, y)
          pp._color = RED
          s -= 1
        } else {
          //console.log("LLb")
          pp._color = RED
          pp.left = p.right
          p._color = BLACK
          p.right = pp
          n_stack[s-2] = p
          n_stack[s-1] = n
          recount(pp)
          recount(p)
          if(s >= 3) {
            var ppp = n_stack[s-3]
            if(ppp.left === pp) {
              ppp.left = p
            } else {
              ppp.right = p
            }
          }
          break
        }
      } else {
        var y = pp.right
        if(y && y._color === RED) {
          //console.log("LRr")
          p._color = BLACK
          pp.right = repaint(BLACK, y)
          pp._color = RED
          s -= 1
        } else {
          //console.log("LRb")
          p.right = n.left
          pp._color = RED
          pp.left = n.right
          n._color = BLACK
          n.left = p
          n.right = pp
          n_stack[s-2] = n
          n_stack[s-1] = p
          recount(pp)
          recount(p)
          recount(n)
          if(s >= 3) {
            var ppp = n_stack[s-3]
            if(ppp.left === pp) {
              ppp.left = n
            } else {
              ppp.right = n
            }
          }
          break
        }
      }
    } else {
      if(p.right === n) {
        var y = pp.left
        if(y && y._color === RED) {
          //console.log("RRr", y.key)
          p._color = BLACK
          pp.left = repaint(BLACK, y)
          pp._color = RED
          s -= 1
        } else {
          //console.log("RRb")
          pp._color = RED
          pp.right = p.left
          p._color = BLACK
          p.left = pp
          n_stack[s-2] = p
          n_stack[s-1] = n
          recount(pp)
          recount(p)
          if(s >= 3) {
            var ppp = n_stack[s-3]
            if(ppp.right === pp) {
              ppp.right = p
            } else {
              ppp.left = p
            }
          }
          break
        }
      } else {
        var y = pp.left
        if(y && y._color === RED) {
          //console.log("RLr")
          p._color = BLACK
          pp.left = repaint(BLACK, y)
          pp._color = RED
          s -= 1
        } else {
          //console.log("RLb")
          p.left = n.right
          pp._color = RED
          pp.right = n.left
          n._color = BLACK
          n.right = p
          n.left = pp
          n_stack[s-2] = n
          n_stack[s-1] = p
          recount(pp)
          recount(p)
          recount(n)
          if(s >= 3) {
            var ppp = n_stack[s-3]
            if(ppp.right === pp) {
              ppp.right = n
            } else {
              ppp.left = n
            }
          }
          break
        }
      }
    }
  }
  //Return new tree
  n_stack[0]._color = BLACK
  return new RedBlackTree(cmp, n_stack[0])
}


//Visit all nodes inorder
function doVisitFull(visit, node) {
  if(node.left) {
    var v = doVisitFull(visit, node.left)
    if(v) { return v }
  }
  var v = visit(node.key, node.value)
  if(v) { return v }
  if(node.right) {
    return doVisitFull(visit, node.right)
  }
}

//Visit half nodes in order
function doVisitHalf(lo, compare, visit, node) {
  var l = compare(lo, node.key)
  if(l <= 0) {
    if(node.left) {
      var v = doVisitHalf(lo, compare, visit, node.left)
      if(v) { return v }
    }
    var v = visit(node.key, node.value)
    if(v) { return v }
  }
  if(node.right) {
    return doVisitHalf(lo, compare, visit, node.right)
  }
}

//Visit all nodes within a range
function doVisit(lo, hi, compare, visit, node) {
  var l = compare(lo, node.key)
  var h = compare(hi, node.key)
  var v
  if(l <= 0) {
    if(node.left) {
      v = doVisit(lo, hi, compare, visit, node.left)
      if(v) { return v }
    }
    if(h > 0) {
      v = visit(node.key, node.value)
      if(v) { return v }
    }
  }
  if(h > 0 && node.right) {
    return doVisit(lo, hi, compare, visit, node.right)
  }
}


proto.forEach = function rbTreeForEach(visit, lo, hi) {
  if(!this.root) {
    return
  }
  switch(arguments.length) {
    case 1:
      return doVisitFull(visit, this.root)
    break

    case 2:
      return doVisitHalf(lo, this._compare, visit, this.root)
    break

    case 3:
      if(this._compare(lo, hi) >= 0) {
        return
      }
      return doVisit(lo, hi, this._compare, visit, this.root)
    break
  }
}

//First item in list
Object.defineProperty(proto, "begin", {
  get: function() {
    var stack = []
    var n = this.root
    while(n) {
      stack.push(n)
      n = n.left
    }
    return new RedBlackTreeIterator(this, stack)
  }
})

//Last item in list
Object.defineProperty(proto, "end", {
  get: function() {
    var stack = []
    var n = this.root
    while(n) {
      stack.push(n)
      n = n.right
    }
    return new RedBlackTreeIterator(this, stack)
  }
})

//Find the ith item in the tree
proto.at = function(idx) {
  if(idx < 0) {
    return new RedBlackTreeIterator(this, [])
  }
  var n = this.root
  var stack = []
  while(true) {
    stack.push(n)
    if(n.left) {
      if(idx < n.left._count) {
        n = n.left
        continue
      }
      idx -= n.left._count
    }
    if(!idx) {
      return new RedBlackTreeIterator(this, stack)
    }
    idx -= 1
    if(n.right) {
      if(idx >= n.right._count) {
        break
      }
      n = n.right
    } else {
      break
    }
  }
  return new RedBlackTreeIterator(this, [])
}

proto.ge = function(key) {
  var cmp = this._compare
  var n = this.root
  var stack = []
  var last_ptr = 0
  while(n) {
    var d = cmp(key, n.key)
    stack.push(n)
    if(d <= 0) {
      last_ptr = stack.length
    }
    if(d <= 0) {
      n = n.left
    } else {
      n = n.right
    }
  }
  stack.length = last_ptr
  return new RedBlackTreeIterator(this, stack)
}

proto.gt = function(key) {
  var cmp = this._compare
  var n = this.root
  var stack = []
  var last_ptr = 0
  while(n) {
    var d = cmp(key, n.key)
    stack.push(n)
    if(d < 0) {
      last_ptr = stack.length
    }
    if(d < 0) {
      n = n.left
    } else {
      n = n.right
    }
  }
  stack.length = last_ptr
  return new RedBlackTreeIterator(this, stack)
}

proto.lt = function(key) {
  var cmp = this._compare
  var n = this.root
  var stack = []
  var last_ptr = 0
  while(n) {
    var d = cmp(key, n.key)
    stack.push(n)
    if(d > 0) {
      last_ptr = stack.length
    }
    if(d <= 0) {
      n = n.left
    } else {
      n = n.right
    }
  }
  stack.length = last_ptr
  return new RedBlackTreeIterator(this, stack)
}

proto.le = function(key) {
  var cmp = this._compare
  var n = this.root
  var stack = []
  var last_ptr = 0
  while(n) {
    var d = cmp(key, n.key)
    stack.push(n)
    if(d >= 0) {
      last_ptr = stack.length
    }
    if(d < 0) {
      n = n.left
    } else {
      n = n.right
    }
  }
  stack.length = last_ptr
  return new RedBlackTreeIterator(this, stack)
}

//Finds the item with key if it exists
proto.find = function(key) {
  var cmp = this._compare
  var n = this.root
  var stack = []
  while(n) {
    var d = cmp(key, n.key)
    stack.push(n)
    if(d === 0) {
      return new RedBlackTreeIterator(this, stack)
    }
    if(d <= 0) {
      n = n.left
    } else {
      n = n.right
    }
  }
  return new RedBlackTreeIterator(this, [])
}

//Removes item with key from tree
proto.remove = function(key) {
  var iter = this.find(key)
  if(iter) {
    return iter.remove()
  }
  return this
}

//Returns the item at `key`
proto.get = function(key) {
  var cmp = this._compare
  var n = this.root
  while(n) {
    var d = cmp(key, n.key)
    if(d === 0) {
      return n.value
    }
    if(d <= 0) {
      n = n.left
    } else {
      n = n.right
    }
  }
  return
}

//Iterator for red black tree
function RedBlackTreeIterator(tree, stack) {
  this.tree = tree
  this._stack = stack
}

var iproto = RedBlackTreeIterator.prototype

//Test if iterator is valid
Object.defineProperty(iproto, "valid", {
  get: function() {
    return this._stack.length > 0
  }
})

//Node of the iterator
Object.defineProperty(iproto, "node", {
  get: function() {
    if(this._stack.length > 0) {
      return this._stack[this._stack.length-1]
    }
    return null
  },
  enumerable: true
})

//Makes a copy of an iterator
iproto.clone = function() {
  return new RedBlackTreeIterator(this.tree, this._stack.slice())
}

//Swaps two nodes
function swapNode(n, v) {
  n.key = v.key
  n.value = v.value
  n.left = v.left
  n.right = v.right
  n._color = v._color
  n._count = v._count
}

//Fix up a double black node in a tree
function fixDoubleBlack(stack) {
  var n, p, s, z
  for(var i=stack.length-1; i>=0; --i) {
    n = stack[i]
    if(i === 0) {
      n._color = BLACK
      return
    }
    //console.log("visit node:", n.key, i, stack[i].key, stack[i-1].key)
    p = stack[i-1]
    if(p.left === n) {
      //console.log("left child")
      s = p.right
      if(s.right && s.right._color === RED) {
        //console.log("case 1: right sibling child red")
        s = p.right = cloneNode(s)
        z = s.right = cloneNode(s.right)
        p.right = s.left
        s.left = p
        s.right = z
        s._color = p._color
        n._color = BLACK
        p._color = BLACK
        z._color = BLACK
        recount(p)
        recount(s)
        if(i > 1) {
          var pp = stack[i-2]
          if(pp.left === p) {
            pp.left = s
          } else {
            pp.right = s
          }
        }
        stack[i-1] = s
        return
      } else if(s.left && s.left._color === RED) {
        //console.log("case 1: left sibling child red")
        s = p.right = cloneNode(s)
        z = s.left = cloneNode(s.left)
        p.right = z.left
        s.left = z.right
        z.left = p
        z.right = s
        z._color = p._color
        p._color = BLACK
        s._color = BLACK
        n._color = BLACK
        recount(p)
        recount(s)
        recount(z)
        if(i > 1) {
          var pp = stack[i-2]
          if(pp.left === p) {
            pp.left = z
          } else {
            pp.right = z
          }
        }
        stack[i-1] = z
        return
      }
      if(s._color === BLACK) {
        if(p._color === RED) {
          //console.log("case 2: black sibling, red parent", p.right.value)
          p._color = BLACK
          p.right = repaint(RED, s)
          return
        } else {
          //console.log("case 2: black sibling, black parent", p.right.value)
          p.right = repaint(RED, s)
          continue
        }
      } else {
        //console.log("case 3: red sibling")
        s = cloneNode(s)
        p.right = s.left
        s.left = p
        s._color = p._color
        p._color = RED
        recount(p)
        recount(s)
        if(i > 1) {
          var pp = stack[i-2]
          if(pp.left === p) {
            pp.left = s
          } else {
            pp.right = s
          }
        }
        stack[i-1] = s
        stack[i] = p
        if(i+1 < stack.length) {
          stack[i+1] = n
        } else {
          stack.push(n)
        }
        i = i+2
      }
    } else {
      //console.log("right child")
      s = p.left
      if(s.left && s.left._color === RED) {
        //console.log("case 1: left sibling child red", p.value, p._color)
        s = p.left = cloneNode(s)
        z = s.left = cloneNode(s.left)
        p.left = s.right
        s.right = p
        s.left = z
        s._color = p._color
        n._color = BLACK
        p._color = BLACK
        z._color = BLACK
        recount(p)
        recount(s)
        if(i > 1) {
          var pp = stack[i-2]
          if(pp.right === p) {
            pp.right = s
          } else {
            pp.left = s
          }
        }
        stack[i-1] = s
        return
      } else if(s.right && s.right._color === RED) {
        //console.log("case 1: right sibling child red")
        s = p.left = cloneNode(s)
        z = s.right = cloneNode(s.right)
        p.left = z.right
        s.right = z.left
        z.right = p
        z.left = s
        z._color = p._color
        p._color = BLACK
        s._color = BLACK
        n._color = BLACK
        recount(p)
        recount(s)
        recount(z)
        if(i > 1) {
          var pp = stack[i-2]
          if(pp.right === p) {
            pp.right = z
          } else {
            pp.left = z
          }
        }
        stack[i-1] = z
        return
      }
      if(s._color === BLACK) {
        if(p._color === RED) {
          //console.log("case 2: black sibling, red parent")
          p._color = BLACK
          p.left = repaint(RED, s)
          return
        } else {
          //console.log("case 2: black sibling, black parent")
          p.left = repaint(RED, s)
          continue
        }
      } else {
        //console.log("case 3: red sibling")
        s = cloneNode(s)
        p.left = s.right
        s.right = p
        s._color = p._color
        p._color = RED
        recount(p)
        recount(s)
        if(i > 1) {
          var pp = stack[i-2]
          if(pp.right === p) {
            pp.right = s
          } else {
            pp.left = s
          }
        }
        stack[i-1] = s
        stack[i] = p
        if(i+1 < stack.length) {
          stack[i+1] = n
        } else {
          stack.push(n)
        }
        i = i+2
      }
    }
  }
}

//Removes item at iterator from tree
iproto.remove = function() {
  var stack = this._stack
  if(stack.length === 0) {
    return this.tree
  }
  //First copy path to node
  var cstack = new Array(stack.length)
  var n = stack[stack.length-1]
  cstack[cstack.length-1] = new RBNode(n._color, n.key, n.value, n.left, n.right, n._count)
  for(var i=stack.length-2; i>=0; --i) {
    var n = stack[i]
    if(n.left === stack[i+1]) {
      cstack[i] = new RBNode(n._color, n.key, n.value, cstack[i+1], n.right, n._count)
    } else {
      cstack[i] = new RBNode(n._color, n.key, n.value, n.left, cstack[i+1], n._count)
    }
  }

  //Get node
  n = cstack[cstack.length-1]
  //console.log("start remove: ", n.value)

  //If not leaf, then swap with previous node
  if(n.left && n.right) {
    //console.log("moving to leaf")

    //First walk to previous leaf
    var split = cstack.length
    n = n.left
    while(n.right) {
      cstack.push(n)
      n = n.right
    }
    //Copy path to leaf
    var v = cstack[split-1]
    cstack.push(new RBNode(n._color, v.key, v.value, n.left, n.right, n._count))
    cstack[split-1].key = n.key
    cstack[split-1].value = n.value

    //Fix up stack
    for(var i=cstack.length-2; i>=split; --i) {
      n = cstack[i]
      cstack[i] = new RBNode(n._color, n.key, n.value, n.left, cstack[i+1], n._count)
    }
    cstack[split-1].left = cstack[split]
  }
  //console.log("stack=", cstack.map(function(v) { return v.value }))

  //Remove leaf node
  n = cstack[cstack.length-1]
  if(n._color === RED) {
    //Easy case: removing red leaf
    //console.log("RED leaf")
    var p = cstack[cstack.length-2]
    if(p.left === n) {
      p.left = null
    } else if(p.right === n) {
      p.right = null
    }
    cstack.pop()
    for(var i=0; i<cstack.length; ++i) {
      cstack[i]._count--
    }
    return new RedBlackTree(this.tree._compare, cstack[0])
  } else {
    if(n.left || n.right) {
      //Second easy case:  Single child black parent
      //console.log("BLACK single child")
      if(n.left) {
        swapNode(n, n.left)
      } else if(n.right) {
        swapNode(n, n.right)
      }
      //Child must be red, so repaint it black to balance color
      n._color = BLACK
      for(var i=0; i<cstack.length-1; ++i) {
        cstack[i]._count--
      }
      return new RedBlackTree(this.tree._compare, cstack[0])
    } else if(cstack.length === 1) {
      //Third easy case: root
      //console.log("ROOT")
      return new RedBlackTree(this.tree._compare, null)
    } else {
      //Hard case: Repaint n, and then do some nasty stuff
      //console.log("BLACK leaf no children")
      for(var i=0; i<cstack.length; ++i) {
        cstack[i]._count--
      }
      var parent = cstack[cstack.length-2]
      fixDoubleBlack(cstack)
      //Fix up links
      if(parent.left === n) {
        parent.left = null
      } else {
        parent.right = null
      }
    }
  }
  return new RedBlackTree(this.tree._compare, cstack[0])
}

//Returns key
Object.defineProperty(iproto, "key", {
  get: function() {
    if(this._stack.length > 0) {
      return this._stack[this._stack.length-1].key
    }
    return
  },
  enumerable: true
})

//Returns value
Object.defineProperty(iproto, "value", {
  get: function() {
    if(this._stack.length > 0) {
      return this._stack[this._stack.length-1].value
    }
    return
  },
  enumerable: true
})


//Returns the position of this iterator in the sorted list
Object.defineProperty(iproto, "index", {
  get: function() {
    var idx = 0
    var stack = this._stack
    if(stack.length === 0) {
      var r = this.tree.root
      if(r) {
        return r._count
      }
      return 0
    } else if(stack[stack.length-1].left) {
      idx = stack[stack.length-1].left._count
    }
    for(var s=stack.length-2; s>=0; --s) {
      if(stack[s+1] === stack[s].right) {
        ++idx
        if(stack[s].left) {
          idx += stack[s].left._count
        }
      }
    }
    return idx
  },
  enumerable: true
})

//Advances iterator to next element in list
iproto.next = function() {
  var stack = this._stack
  if(stack.length === 0) {
    return
  }
  var n = stack[stack.length-1]
  if(n.right) {
    n = n.right
    while(n) {
      stack.push(n)
      n = n.left
    }
  } else {
    stack.pop()
    while(stack.length > 0 && stack[stack.length-1].right === n) {
      n = stack[stack.length-1]
      stack.pop()
    }
  }
}

//Checks if iterator is at end of tree
Object.defineProperty(iproto, "hasNext", {
  get: function() {
    var stack = this._stack
    if(stack.length === 0) {
      return false
    }
    if(stack[stack.length-1].right) {
      return true
    }
    for(var s=stack.length-1; s>0; --s) {
      if(stack[s-1].left === stack[s]) {
        return true
      }
    }
    return false
  }
})

//Update value
iproto.update = function(value) {
  var stack = this._stack
  if(stack.length === 0) {
    throw new Error("Can't update empty node!")
  }
  var cstack = new Array(stack.length)
  var n = stack[stack.length-1]
  cstack[cstack.length-1] = new RBNode(n._color, n.key, value, n.left, n.right, n._count)
  for(var i=stack.length-2; i>=0; --i) {
    n = stack[i]
    if(n.left === stack[i+1]) {
      cstack[i] = new RBNode(n._color, n.key, n.value, cstack[i+1], n.right, n._count)
    } else {
      cstack[i] = new RBNode(n._color, n.key, n.value, n.left, cstack[i+1], n._count)
    }
  }
  return new RedBlackTree(this.tree._compare, cstack[0])
}

//Moves iterator backward one element
iproto.prev = function() {
  var stack = this._stack
  if(stack.length === 0) {
    return
  }
  var n = stack[stack.length-1]
  if(n.left) {
    n = n.left
    while(n) {
      stack.push(n)
      n = n.right
    }
  } else {
    stack.pop()
    while(stack.length > 0 && stack[stack.length-1].left === n) {
      n = stack[stack.length-1]
      stack.pop()
    }
  }
}

//Checks if iterator is at start of tree
Object.defineProperty(iproto, "hasPrev", {
  get: function() {
    var stack = this._stack
    if(stack.length === 0) {
      return false
    }
    if(stack[stack.length-1].left) {
      return true
    }
    for(var s=stack.length-1; s>0; --s) {
      if(stack[s-1].right === stack[s]) {
        return true
      }
    }
    return false
  }
})

//Default comparison function
function defaultCompare(a, b) {
  if(a < b) {
    return -1
  }
  if(a > b) {
    return 1
  }
  return 0
}

//Build a tree
function createRBTree(compare) {
  return new RedBlackTree(compare || defaultCompare, null)
}
},{}],16:[function(require,module,exports){
"use strict"

module.exports = createSlabDecomposition

var bounds = require("binary-search-bounds")
var createRBTree = require("functional-red-black-tree")
var orient = require("robust-orientation")
var orderSegments = require("./lib/order-segments")

function SlabDecomposition(slabs, coordinates, horizontal) {
  this.slabs = slabs
  this.coordinates = coordinates
  this.horizontal = horizontal
}

var proto = SlabDecomposition.prototype

function compareHorizontal(e, y) {
  return e.y - y
}

function searchBucket(root, p) {
  var lastNode = null
  while(root) {
    var seg = root.key
    var l, r
    if(seg[0][0] < seg[1][0]) {
      l = seg[0]
      r = seg[1]
    } else {
      l = seg[1]
      r = seg[0]
    }
    var o = orient(l, r, p)
    if(o < 0) {
      root = root.left
    } else if(o > 0) {
      if(p[0] !== seg[1][0]) {
        lastNode = root
        root = root.right
      } else {
        var val = searchBucket(root.right, p)
        if(val) {
          return val
        }
        root = root.left
      }
    } else {
      if(p[0] !== seg[1][0]) {
        return root
      } else {
        var val = searchBucket(root.right, p)
        if(val) {
          return val
        }
        root = root.left
      }
    }
  }
  return lastNode
}

proto.castUp = function(p) {
  var bucket = bounds.le(this.coordinates, p[0])
  if(bucket < 0) {
    return -1
  }
  var root = this.slabs[bucket]
  var hitNode = searchBucket(this.slabs[bucket], p)
  var lastHit = -1
  if(hitNode) {
    lastHit = hitNode.value
  }
  //Edge case: need to handle horizontal segments (sucks)
  if(this.coordinates[bucket] === p[0]) {
    var lastSegment = null
    if(hitNode) {
      lastSegment = hitNode.key
    }
    if(bucket > 0) {
      var otherHitNode = searchBucket(this.slabs[bucket-1], p)
      if(otherHitNode) {
        if(lastSegment) {
          if(orderSegments(otherHitNode.key, lastSegment) > 0) {
            lastSegment = otherHitNode.key
            lastHit = otherHitNode.value
          }
        } else {
          lastHit = otherHitNode.value
          lastSegment = otherHitNode.key
        }
      }
    }
    var horiz = this.horizontal[bucket]
    if(horiz.length > 0) {
      var hbucket = bounds.ge(horiz, p[1], compareHorizontal)
      if(hbucket < horiz.length) {
        var e = horiz[hbucket]
        if(p[1] === e.y) {
          if(e.closed) {
            return e.index
          } else {
            while(hbucket < horiz.length-1 && horiz[hbucket+1].y === p[1]) {
              hbucket = hbucket+1
              e = horiz[hbucket]
              if(e.closed) {
                return e.index
              }
            }
            if(e.y === p[1] && !e.start) {
              hbucket = hbucket+1
              if(hbucket >= horiz.length) {
                return lastHit
              }
              e = horiz[hbucket]
            }
          }
        }
        //Check if e is above/below last segment
        if(e.start) {
          if(lastSegment) {
            var o = orient(lastSegment[0], lastSegment[1], [p[0], e.y])
            if(lastSegment[0][0] > lastSegment[1][0]) {
              o = -o
            }
            if(o > 0) {
              lastHit = e.index
            }
          } else {
            lastHit = e.index
          }
        } else if(e.y !== p[1]) {
          lastHit = e.index
        }
      }
    }
  }
  return lastHit
}

function IntervalSegment(y, index, start, closed) {
  this.y = y
  this.index = index
  this.start = start
  this.closed = closed
}

function Event(x, segment, create, index) {
  this.x = x
  this.segment = segment
  this.create = create
  this.index = index
}


function createSlabDecomposition(segments) {
  var numSegments = segments.length
  var numEvents = 2 * numSegments
  var events = new Array(numEvents)
  for(var i=0; i<numSegments; ++i) {
    var s = segments[i]
    var f = s[0][0] < s[1][0]
    events[2*i] = new Event(s[0][0], s, f, i)
    events[2*i+1] = new Event(s[1][0], s, !f, i)
  }
  events.sort(function(a,b) {
    var d = a.x - b.x
    if(d) {
      return d
    }
    d = a.create - b.create
    if(d) {
      return d
    }
    return Math.min(a.segment[0][1], a.segment[1][1]) - Math.min(b.segment[0][1], b.segment[1][1])
  })
  var tree = createRBTree(orderSegments)
  var slabs = []
  var lines = []
  var horizontal = []
  var lastX = -Infinity
  for(var i=0; i<numEvents; ) {
    var x = events[i].x
    var horiz = []
    while(i < numEvents) {
      var e = events[i]
      if(e.x !== x) {
        break
      }
      i += 1
      if(e.segment[0][0] === e.x && e.segment[1][0] === e.x) {
        if(e.create) {
          if(e.segment[0][1] < e.segment[1][1]) {
            horiz.push(new IntervalSegment(
                e.segment[0][1],
                e.index,
                true,
                true))
            horiz.push(new IntervalSegment(
                e.segment[1][1],
                e.index,
                false,
                false))
          } else {
            horiz.push(new IntervalSegment(
                e.segment[1][1],
                e.index,
                true,
                false))
            horiz.push(new IntervalSegment(
                e.segment[0][1],
                e.index,
                false,
                true))
          }
        }
      } else {
        if(e.create) {
          tree = tree.insert(e.segment, e.index)
        } else {
          tree = tree.remove(e.segment)
        }
      }
    }
    slabs.push(tree.root)
    lines.push(x)
    horizontal.push(horiz)
  }
  return new SlabDecomposition(slabs, lines, horizontal)
}
},{"./lib/order-segments":13,"binary-search-bounds":14,"functional-red-black-tree":15,"robust-orientation":12}],17:[function(require,module,exports){
"use strict"

module.exports = preprocessPolygon

var orient = require("robust-orientation")
var makeSlabs = require("slab-decomposition")

function dummyFunction(p) {
  return -1
}

function createClassifyPoint(segments, slabs, outside, orientation) {
  function classifyPoint(p) {
    var index = slabs.castUp(p)
    if(index < 0) {
      return outside
    }
    var seg = segments[index]
    if(!orientation) {
      return orient(p, seg[0], seg[1])
    } else {
      return orient(p, seg[1], seg[0])
    }
  }
  return classifyPoint
}

function preprocessPolygon(loops, orientation) {
  orientation = !!orientation

  //Compute number of loops
  var numLoops = loops.length
  var numSegments = 0
  for(var i=0; i<numLoops; ++i) {
    numSegments += loops[i].length
  }

  //Degenerate case: All loops are empty
  if(numSegments === 0) {
    return dummyFunction
  }

  //Unpack segments
  var segments = new Array(numSegments)
  var ptr = 0
  for(var i=0; i<numLoops; ++i) {
    var loop = loops[i]
    var numVertices = loop.length
    for(var s=numVertices-1,t=0; t<numVertices; s=(t++)) {
      segments[ptr++] = [loop[s], loop[t]]
    }
  }

  //Build slab decomposition
  var slabs = makeSlabs(segments)

  //Find outer orientation
  var outside
  var root = slabs.slabs[0]
  if(root) {
    while(root.left) {
      root = root.left
    }
    var h = root.key
    if(h[0][0] < h[1][0]) {
      outside = -1
    } else {
      outside = 1
    }
  } else {
    var h = segments[slabs.horizontal[0][0].index]
    if(h[0][1] < h[1][1]) {
      outside = 1
    } else {
      outside = -1
    }
  }
  if(orientation) {
    outside = -outside
  }

  //Return classification function
  return createClassifyPoint(segments, slabs, outside, orientation)
}
},{"robust-orientation":12,"slab-decomposition":16}],18:[function(require,module,exports){
/*  Ported from Mukesh Prasad's public domain code:
 *    http://tog.acm.org/resources/GraphicsGems/gemsii/xlines.c
 *
 *   This function computes whether two line segments,
 *   respectively joining the input points (x1,y1) -- (x2,y2)
 *   and the input points (x3,y3) -- (x4,y4) intersect.
 *   If the lines intersect, the return value is an array
 *   containing coordinates of the point of intersection.
 *
 *   Params
 *        x1, y1,  x2, y2   Coordinates of endpoints of one segment.
 *        x3, y3,  x4, y4   Coordinates of endpoints of other segment.
 *
 *   Also Accepts:
 *    4 objects with the minimal object structure { x: .., y: ..}
 *    4 arrays where [0] is x and [1] is y
 *
 *   The value returned by the function is one of:
 *
 *        undefined - no intersection
 *        array     - intersection
 *        true      - colinear
 */

function segseg(x1, y1, x2, y2, x3, y3, x4, y4) {

  if (arguments.length === 4) {
    var p1 = x1;
    var p2 = y1;
    var p3 = x2;
    var p4 = y2;

    // assume array [x, y]
    if (p1.length && p1.length === 2) {
      x1 = p1[0];
      y1 = p1[1];
      x2 = p2[0];
      y2 = p2[1];
      x3 = p3[0];
      y3 = p3[1];
      x4 = p4[0];
      y4 = p4[1];

    // assume object with obj.x and obj.y
    } else {
      x1 = p1.x;
      y1 = p1.y;
      x2 = p2.x;
      y2 = p2.y;
      x3 = p3.x;
      y3 = p3.y;
      x4 = p4.x;
      y4 = p4.y;
    }
  }


  var a1, a2, b1, b2, c1, c2; // Coefficients of line eqns.
  var r1, r2, r3, r4;         // 'Sign' values
  var denom, offset;          // Intermediate values
  var x, y;                   // Intermediate return values

  // Compute a1, b1, c1, where line joining points 1 and 2
  // is "a1 x  +  b1 y  +  c1  =  0".
  a1 = y2 - y1;
  b1 = x1 - x2;
  c1 = x2 * y1 - x1 * y2;

  // Compute r3 and r4.
  r3 = a1 * x3 + b1 * y3 + c1;
  r4 = a1 * x4 + b1 * y4 + c1;

  // Check signs of r3 and r4.  If both point 3 and point 4 lie on
  // same side of line 1, the line segments do not intersect.
  if ( r3 !== 0 && r4 !== 0 && ((r3 >= 0 && r4 >= 0) || (r3 < 0 && r4 < 0))) {
    return; // no intersection
  }


  // Compute a2, b2, c2
  a2 = y4 - y3;
  b2 = x3 - x4;
  c2 = x4 * y3 - x3 * y4;

  // Compute r1 and r2
  r1 = a2 * x1 + b2 * y1 + c2;
  r2 = a2 * x2 + b2 * y2 + c2;

  // Check signs of r1 and r2.  If both point 1 and point 2 lie
  // on same side of second line segment, the line segments do
  // not intersect.
  if (r1 !== 0 && r2 !== 0 && ((r1 >= 0 && r2 >= 0) || (r1 < 0 && r2 < 0))) {
    return; // no intersections
  }

  // Line segments intersect: compute intersection point.
  denom = a1 * b2 - a2 * b1;

  if ( denom === 0 ) {
    return true;
  }

  offset = denom < 0 ? - denom / 2 : denom / 2;

  x = b1 * c2 - b2 * c1;
  y = a2 * c1 - a1 * c2;

  return [
    ( x < 0 ? x : x ) / denom,
    ( y < 0 ? y : y ) / denom,
  ];
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = segseg;
}

if (typeof window !== 'undefined') {
  window.segseg = window.segseg || segseg;
}

},{}],19:[function(require,module,exports){
"use strict"

module.exports = function signum(x) {
  if(x < 0) { return -1 }
  if(x > 0) { return 1 }
  return 0.0
}
},{}],20:[function(require,module,exports){
module.exports = function (points,signed) {
  var l = points.length
  var det = 0
  var isSigned = signed || false

  points = points.map(normalize)
  if (points[0] != points[points.length -1])
    points = points.concat(points[0])

  for (var i = 0; i < l; i++)
    det += points[i].x * points[i + 1].y
      - points[i].y * points[i + 1].x
  if (isSigned)
    return det / 2
  else
    return Math.abs(det) / 2
}

function normalize(point) {
  if (Array.isArray(point))
    return {
      x: point[0],
      y: point[1]
    }
  else
    return point
}

},{}],21:[function(require,module,exports){
'use strict'

module.exports = findBounds

function findBounds(points) {
  var n = points.length
  if(n === 0) {
    return [[], []]
  }
  var d = points[0].length
  var lo = points[0].slice()
  var hi = points[0].slice()
  for(var i=1; i<n; ++i) {
    var p = points[i]
    for(var j=0; j<d; ++j) {
      var x = p[j]
      lo[j] = Math.min(lo[j], x)
      hi[j] = Math.max(hi[j], x)
    }
  }
  return [lo, hi]
}
},{}],22:[function(require,module,exports){
'use strict'

var monotoneTriangulate = require('./lib/monotone')
var makeIndex = require('./lib/triangulation')
var delaunayFlip = require('./lib/delaunay')
var filterTriangulation = require('./lib/filter')

module.exports = cdt2d

function canonicalizeEdge(e) {
  return [Math.min(e[0], e[1]), Math.max(e[0], e[1])]
}

function compareEdge(a, b) {
  return a[0]-b[0] || a[1]-b[1]
}

function canonicalizeEdges(edges) {
  return edges.map(canonicalizeEdge).sort(compareEdge)
}

function getDefault(options, property, dflt) {
  if(property in options) {
    return options[property]
  }
  return dflt
}

function cdt2d(points, edges, options) {

  if(!Array.isArray(edges)) {
    options = edges || {}
    edges = []
  } else {
    options = options || {}
    edges = edges || []
  }

  //Parse out options
  var delaunay = !!getDefault(options, 'delaunay', true)
  var interior = !!getDefault(options, 'interior', true)
  var exterior = !!getDefault(options, 'exterior', true)
  var infinity = !!getDefault(options, 'infinity', false)

  //Handle trivial case
  if((!interior && !exterior) || points.length === 0) {
    return []
  }

  //Construct initial triangulation
  var cells = monotoneTriangulate(points, edges)

  //If delaunay refinement needed, then improve quality by edge flipping
  if(delaunay || interior !== exterior || infinity) {

    //Index all of the cells to support fast neighborhood queries
    var triangulation = makeIndex(points.length, canonicalizeEdges(edges))
    for(var i=0; i<cells.length; ++i) {
      var f = cells[i]
      triangulation.addTriangle(f[0], f[1], f[2])
    }

    //Run edge flipping
    if(delaunay) {
      delaunayFlip(points, triangulation)
    }

    //Filter points
    if(!exterior) {
      return filterTriangulation(triangulation, -1)
    } else if(!interior) {
      return filterTriangulation(triangulation,  1, infinity)
    } else if(infinity) {
      return filterTriangulation(triangulation, 0, infinity)
    } else {
      return triangulation.cells()
    }

  } else {
    return cells
  }
}

},{"./lib/delaunay":23,"./lib/filter":24,"./lib/monotone":25,"./lib/triangulation":26}],23:[function(require,module,exports){
'use strict'

var inCircle = require('robust-in-sphere')[4]
var bsearch = require('binary-search-bounds')

module.exports = delaunayRefine

function testFlip(points, triangulation, stack, a, b, x) {
  var y = triangulation.opposite(a, b)

  //Test boundary edge
  if(y < 0) {
    return
  }

  //Swap edge if order flipped
  if(b < a) {
    var tmp = a
    a = b
    b = tmp
    tmp = x
    x = y
    y = tmp
  }

  //Test if edge is constrained
  if(triangulation.isConstraint(a, b)) {
    return
  }

  //Test if edge is delaunay
  if(inCircle(points[a], points[b], points[x], points[y]) < 0) {
    stack.push(a, b)
  }
}

//Assume edges are sorted lexicographically
function delaunayRefine(points, triangulation) {
  var stack = []

  var numPoints = points.length
  var stars = triangulation.stars
  for(var a=0; a<numPoints; ++a) {
    var star = stars[a]
    for(var j=1; j<star.length; j+=2) {
      var b = star[j]

      //If order is not consistent, then skip edge
      if(b < a) {
        continue
      }

      //Check if edge is constrained
      if(triangulation.isConstraint(a, b)) {
        continue
      }

      //Find opposite edge
      var x = star[j-1], y = -1
      for(var k=1; k<star.length; k+=2) {
        if(star[k-1] === b) {
          y = star[k]
          break
        }
      }

      //If this is a boundary edge, don't flip it
      if(y < 0) {
        continue
      }

      //If edge is in circle, flip it
      if(inCircle(points[a], points[b], points[x], points[y]) < 0) {
        stack.push(a, b)
      }
    }
  }

  while(stack.length > 0) {
    var b = stack.pop()
    var a = stack.pop()

    //Find opposite pairs
    var x = -1, y = -1
    var star = stars[a]
    for(var i=1; i<star.length; i+=2) {
      var s = star[i-1]
      var t = star[i]
      if(s === b) {
        y = t
      } else if(t === b) {
        x = s
      }
    }

    //If x/y are both valid then skip edge
    if(x < 0 || y < 0) {
      continue
    }

    //If edge is now delaunay, then don't flip it
    if(inCircle(points[a], points[b], points[x], points[y]) >= 0) {
      continue
    }

    //Flip the edge
    triangulation.flip(a, b)

    //Test flipping neighboring edges
    testFlip(points, triangulation, stack, x, a, y)
    testFlip(points, triangulation, stack, a, y, x)
    testFlip(points, triangulation, stack, y, b, x)
    testFlip(points, triangulation, stack, b, x, y)
  }
}

},{"binary-search-bounds":27,"robust-in-sphere":28}],24:[function(require,module,exports){
'use strict'

var bsearch = require('binary-search-bounds')

module.exports = classifyFaces

function FaceIndex(cells, neighbor, constraint, flags, active, next, boundary) {
  this.cells       = cells
  this.neighbor    = neighbor
  this.flags       = flags
  this.constraint  = constraint
  this.active      = active
  this.next        = next
  this.boundary    = boundary
}

var proto = FaceIndex.prototype

function compareCell(a, b) {
  return a[0] - b[0] ||
         a[1] - b[1] ||
         a[2] - b[2]
}

proto.locate = (function() {
  var key = [0,0,0]
  return function(a, b, c) {
    var x = a, y = b, z = c
    if(b < c) {
      if(b < a) {
        x = b
        y = c
        z = a
      }
    } else if(c < a) {
      x = c
      y = a
      z = b
    }
    if(x < 0) {
      return -1
    }
    key[0] = x
    key[1] = y
    key[2] = z
    return bsearch.eq(this.cells, key, compareCell)
  }
})()

function indexCells(triangulation, infinity) {
  //First get cells and canonicalize
  var cells = triangulation.cells()
  var nc = cells.length
  for(var i=0; i<nc; ++i) {
    var c = cells[i]
    var x = c[0], y = c[1], z = c[2]
    if(y < z) {
      if(y < x) {
        c[0] = y
        c[1] = z
        c[2] = x
      }
    } else if(z < x) {
      c[0] = z
      c[1] = x
      c[2] = y
    }
  }
  cells.sort(compareCell)

  //Initialize flag array
  var flags = new Array(nc)
  for(var i=0; i<flags.length; ++i) {
    flags[i] = 0
  }

  //Build neighbor index, initialize queues
  var active = []
  var next   = []
  var neighbor = new Array(3*nc)
  var constraint = new Array(3*nc)
  var boundary = null
  if(infinity) {
    boundary = []
  }
  var index = new FaceIndex(
    cells,
    neighbor,
    constraint,
    flags,
    active,
    next,
    boundary)
  for(var i=0; i<nc; ++i) {
    var c = cells[i]
    for(var j=0; j<3; ++j) {
      var x = c[j], y = c[(j+1)%3]
      var a = neighbor[3*i+j] = index.locate(y, x, triangulation.opposite(y, x))
      var b = constraint[3*i+j] = triangulation.isConstraint(x, y)
      if(a < 0) {
        if(b) {
          next.push(i)
        } else {
          active.push(i)
          flags[i] = 1
        }
        if(infinity) {
          boundary.push([y, x, -1])
        }
      }
    }
  }
  return index
}

function filterCells(cells, flags, target) {
  var ptr = 0
  for(var i=0; i<cells.length; ++i) {
    if(flags[i] === target) {
      cells[ptr++] = cells[i]
    }
  }
  cells.length = ptr
  return cells
}

function classifyFaces(triangulation, target, infinity) {
  var index = indexCells(triangulation, infinity)

  if(target === 0) {
    if(infinity) {
      return index.cells.concat(index.boundary)
    } else {
      return index.cells
    }
  }

  var side = 1
  var active = index.active
  var next = index.next
  var flags = index.flags
  var cells = index.cells
  var constraint = index.constraint
  var neighbor = index.neighbor

  while(active.length > 0 || next.length > 0) {
    while(active.length > 0) {
      var t = active.pop()
      if(flags[t] === -side) {
        continue
      }
      flags[t] = side
      var c = cells[t]
      for(var j=0; j<3; ++j) {
        var f = neighbor[3*t+j]
        if(f >= 0 && flags[f] === 0) {
          if(constraint[3*t+j]) {
            next.push(f)
          } else {
            active.push(f)
            flags[f] = side
          }
        }
      }
    }

    //Swap arrays and loop
    var tmp = next
    next = active
    active = tmp
    next.length = 0
    side = -side
  }

  var result = filterCells(cells, flags, target)
  if(infinity) {
    return result.concat(index.boundary)
  }
  return result
}

},{"binary-search-bounds":27}],25:[function(require,module,exports){
'use strict'

var bsearch = require('binary-search-bounds')
var orient = require('robust-orientation')[3]

var EVENT_POINT = 0
var EVENT_END   = 1
var EVENT_START = 2

module.exports = monotoneTriangulate

//A partial convex hull fragment, made of two unimonotone polygons
function PartialHull(a, b, idx, lowerIds, upperIds) {
  this.a = a
  this.b = b
  this.idx = idx
  this.lowerIds = lowerIds
  this.upperIds = upperIds
}

//An event in the sweep line procedure
function Event(a, b, type, idx) {
  this.a    = a
  this.b    = b
  this.type = type
  this.idx  = idx
}

//This is used to compare events for the sweep line procedure
// Points are:
//  1. sorted lexicographically
//  2. sorted by type  (point < end < start)
//  3. segments sorted by winding order
//  4. sorted by index
function compareEvent(a, b) {
  var d =
    (a.a[0] - b.a[0]) ||
    (a.a[1] - b.a[1]) ||
    (a.type - b.type)
  if(d) { return d }
  if(a.type !== EVENT_POINT) {
    d = orient(a.a, a.b, b.b)
    if(d) { return d }
  }
  return a.idx - b.idx
}

function testPoint(hull, p) {
  return orient(hull.a, hull.b, p)
}

function addPoint(cells, hulls, points, p, idx) {
  var lo = bsearch.lt(hulls, p, testPoint)
  var hi = bsearch.gt(hulls, p, testPoint)
  for(var i=lo; i<hi; ++i) {
    var hull = hulls[i]

    //Insert p into lower hull
    var lowerIds = hull.lowerIds
    var m = lowerIds.length
    while(m > 1 && orient(
        points[lowerIds[m-2]],
        points[lowerIds[m-1]],
        p) > 0) {
      cells.push(
        [lowerIds[m-1],
         lowerIds[m-2],
         idx])
      m -= 1
    }
    lowerIds.length = m
    lowerIds.push(idx)

    //Insert p into upper hull
    var upperIds = hull.upperIds
    var m = upperIds.length
    while(m > 1 && orient(
        points[upperIds[m-2]],
        points[upperIds[m-1]],
        p) < 0) {
      cells.push(
        [upperIds[m-2],
         upperIds[m-1],
         idx])
      m -= 1
    }
    upperIds.length = m
    upperIds.push(idx)
  }
}

function findSplit(hull, edge) {
  var d
  if(hull.a[0] < edge.a[0]) {
    d = orient(hull.a, hull.b, edge.a)
  } else {
    d = orient(edge.b, edge.a, hull.a)
  }
  if(d) { return d }
  if(edge.b[0] < hull.b[0]) {
    d = orient(hull.a, hull.b, edge.b)
  } else {
    d = orient(edge.b, edge.a, hull.b)
  }
  return d || hull.idx - edge.idx
}

function splitHulls(hulls, points, event) {
  var splitIdx = bsearch.le(hulls, event, findSplit)
  var hull = hulls[splitIdx]
  var upperIds = hull.upperIds
  var x = upperIds[upperIds.length-1]
  hull.upperIds = [x]
  hulls.splice(splitIdx+1, 0,
    new PartialHull(event.a, event.b, event.idx, [x], upperIds))
}


function mergeHulls(hulls, points, event) {
  //Swap pointers for merge search
  var tmp = event.a
  event.a = event.b
  event.b = tmp
  var mergeIdx = bsearch.eq(hulls, event, findSplit)
  var upper = hulls[mergeIdx]
  var lower = hulls[mergeIdx-1]
  lower.upperIds = upper.upperIds
  hulls.splice(mergeIdx, 1)
}


function monotoneTriangulate(points, edges) {

  var numPoints = points.length
  var numEdges = edges.length

  var events = []

  //Create point events
  for(var i=0; i<numPoints; ++i) {
    events.push(new Event(
      points[i],
      null,
      EVENT_POINT,
      i))
  }

  //Create edge events
  for(var i=0; i<numEdges; ++i) {
    var e = edges[i]
    var a = points[e[0]]
    var b = points[e[1]]
    if(a[0] < b[0]) {
      events.push(
        new Event(a, b, EVENT_START, i),
        new Event(b, a, EVENT_END, i))
    } else if(a[0] > b[0]) {
      events.push(
        new Event(b, a, EVENT_START, i),
        new Event(a, b, EVENT_END, i))
    }
  }

  //Sort events
  events.sort(compareEvent)

  //Initialize hull
  var minX = events[0].a[0] - (1 + Math.abs(events[0].a[0])) * Math.pow(2, -52)
  var hull = [ new PartialHull([minX, 1], [minX, 0], -1, [], [], [], []) ]

  //Process events in order
  var cells = []
  for(var i=0, numEvents=events.length; i<numEvents; ++i) {
    var event = events[i]
    var type = event.type
    if(type === EVENT_POINT) {
      addPoint(cells, hull, points, event.a, event.idx)
    } else if(type === EVENT_START) {
      splitHulls(hull, points, event)
    } else {
      mergeHulls(hull, points, event)
    }
  }

  //Return triangulation
  return cells
}

},{"binary-search-bounds":27,"robust-orientation":39}],26:[function(require,module,exports){
'use strict'

var bsearch = require('binary-search-bounds')

module.exports = createTriangulation

function Triangulation(stars, edges) {
  this.stars = stars
  this.edges = edges
}

var proto = Triangulation.prototype

function removePair(list, j, k) {
  for(var i=1, n=list.length; i<n; i+=2) {
    if(list[i-1] === j && list[i] === k) {
      list[i-1] = list[n-2]
      list[i] = list[n-1]
      list.length = n - 2
      return
    }
  }
}

proto.isConstraint = (function() {
  var e = [0,0]
  function compareLex(a, b) {
    return a[0] - b[0] || a[1] - b[1]
  }
  return function(i, j) {
    e[0] = Math.min(i,j)
    e[1] = Math.max(i,j)
    return bsearch.eq(this.edges, e, compareLex) >= 0
  }
})()

proto.removeTriangle = function(i, j, k) {
  var stars = this.stars
  removePair(stars[i], j, k)
  removePair(stars[j], k, i)
  removePair(stars[k], i, j)
}

proto.addTriangle = function(i, j, k) {
  var stars = this.stars
  stars[i].push(j, k)
  stars[j].push(k, i)
  stars[k].push(i, j)
}

proto.opposite = function(j, i) {
  var list = this.stars[i]
  for(var k=1, n=list.length; k<n; k+=2) {
    if(list[k] === j) {
      return list[k-1]
    }
  }
  return -1
}

proto.flip = function(i, j) {
  var a = this.opposite(i, j)
  var b = this.opposite(j, i)
  this.removeTriangle(i, j, a)
  this.removeTriangle(j, i, b)
  this.addTriangle(i, b, a)
  this.addTriangle(j, a, b)
}

proto.edges = function() {
  var stars = this.stars
  var result = []
  for(var i=0, n=stars.length; i<n; ++i) {
    var list = stars[i]
    for(var j=0, m=list.length; j<m; j+=2) {
      result.push([list[j], list[j+1]])
    }
  }
  return result
}

proto.cells = function() {
  var stars = this.stars
  var result = []
  for(var i=0, n=stars.length; i<n; ++i) {
    var list = stars[i]
    for(var j=0, m=list.length; j<m; j+=2) {
      var s = list[j]
      var t = list[j+1]
      if(i < Math.min(s, t)) {
        result.push([i, s, t])
      }
    }
  }
  return result
}

function createTriangulation(numVerts, edges) {
  var stars = new Array(numVerts)
  for(var i=0; i<numVerts; ++i) {
    stars[i] = []
  }
  return new Triangulation(stars, edges)
}

},{"binary-search-bounds":27}],27:[function(require,module,exports){
"use strict"

function compileSearch(funcName, predicate, reversed, extraArgs, earlyOut) {
  var code = [
    "function ", funcName, "(a,l,h,", extraArgs.join(","),  "){",
earlyOut ? "" : "var i=", (reversed ? "l-1" : "h+1"),
";while(l<=h){\
var m=(l+h)>>>1,x=a[m]"]
  if(earlyOut) {
    if(predicate.indexOf("c") < 0) {
      code.push(";if(x===y){return m}else if(x<=y){")
    } else {
      code.push(";var p=c(x,y);if(p===0){return m}else if(p<=0){")
    }
  } else {
    code.push(";if(", predicate, "){i=m;")
  }
  if(reversed) {
    code.push("l=m+1}else{h=m-1}")
  } else {
    code.push("h=m-1}else{l=m+1}")
  }
  code.push("}")
  if(earlyOut) {
    code.push("return -1};")
  } else {
    code.push("return i};")
  }
  return code.join("")
}

function compileBoundsSearch(predicate, reversed, suffix, earlyOut) {
  var result = new Function([
  compileSearch("A", "x" + predicate + "y", reversed, ["y"], earlyOut),
  compileSearch("P", "c(x,y)" + predicate + "0", reversed, ["y", "c"], earlyOut),
"function dispatchBsearch", suffix, "(a,y,c,l,h){\
if(typeof(c)==='function'){\
return P(a,(l===void 0)?0:l|0,(h===void 0)?a.length-1:h|0,y,c)\
}else{\
return A(a,(c===void 0)?0:c|0,(l===void 0)?a.length-1:l|0,y)\
}}\
return dispatchBsearch", suffix].join(""))
  return result()
}

module.exports = {
  ge: compileBoundsSearch(">=", false, "GE"),
  gt: compileBoundsSearch(">", false, "GT"),
  lt: compileBoundsSearch("<", true, "LT"),
  le: compileBoundsSearch("<=", true, "LE"),
  eq: compileBoundsSearch("-", true, "EQ", true)
}

},{}],28:[function(require,module,exports){
"use strict"

var twoProduct = require("two-product")
var robustSum = require("robust-sum")
var robustDiff = require("robust-subtract")
var robustScale = require("robust-scale")

var NUM_EXPAND = 6

function cofactor(m, c) {
  var result = new Array(m.length-1)
  for(var i=1; i<m.length; ++i) {
    var r = result[i-1] = new Array(m.length-1)
    for(var j=0,k=0; j<m.length; ++j) {
      if(j === c) {
        continue
      }
      r[k++] = m[i][j]
    }
  }
  return result
}

function matrix(n) {
  var result = new Array(n)
  for(var i=0; i<n; ++i) {
    result[i] = new Array(n)
    for(var j=0; j<n; ++j) {
      result[i][j] = ["m", j, "[", (n-i-2), "]"].join("")
    }
  }
  return result
}

function generateSum(expr) {
  if(expr.length === 1) {
    return expr[0]
  } else if(expr.length === 2) {
    return ["sum(", expr[0], ",", expr[1], ")"].join("")
  } else {
    var m = expr.length>>1
    return ["sum(", generateSum(expr.slice(0, m)), ",", generateSum(expr.slice(m)), ")"].join("")
  }
}

function makeProduct(a, b) {
  if(a.charAt(0) === "m") {
    if(b.charAt(0) === "w") {
      var toks = a.split("[")
      return ["w", b.substr(1), "m", toks[0].substr(1)].join("")
    } else {
      return ["prod(", a, ",", b, ")"].join("")
    }
  } else {
    return makeProduct(b, a)
  }
}

function sign(s) {
  if(s & 1 !== 0) {
    return "-"
  }
  return ""
}

function determinant(m) {
  if(m.length === 2) {
    return [["diff(", makeProduct(m[0][0], m[1][1]), ",", makeProduct(m[1][0], m[0][1]), ")"].join("")]
  } else {
    var expr = []
    for(var i=0; i<m.length; ++i) {
      expr.push(["scale(", generateSum(determinant(cofactor(m, i))), ",", sign(i), m[0][i], ")"].join(""))
    }
    return expr
  }
}

function makeSquare(d, n) {
  var terms = []
  for(var i=0; i<n-2; ++i) {
    terms.push(["prod(m", d, "[", i, "],m", d, "[", i, "])"].join(""))
  }
  return generateSum(terms)
}

function orientation(n) {
  var pos = []
  var neg = []
  var m = matrix(n)
  for(var i=0; i<n; ++i) {
    m[0][i] = "1"
    m[n-1][i] = "w"+i
  }
  for(var i=0; i<n; ++i) {
    if((i&1)===0) {
      pos.push.apply(pos,determinant(cofactor(m, i)))
    } else {
      neg.push.apply(neg,determinant(cofactor(m, i)))
    }
  }
  var posExpr = generateSum(pos)
  var negExpr = generateSum(neg)
  var funcName = "exactInSphere" + n
  var funcArgs = []
  for(var i=0; i<n; ++i) {
    funcArgs.push("m" + i)
  }
  var code = ["function ", funcName, "(", funcArgs.join(), "){"]
  for(var i=0; i<n; ++i) {
    code.push("var w",i,"=",makeSquare(i,n),";")
    for(var j=0; j<n; ++j) {
      if(j !== i) {
        code.push("var w",i,"m",j,"=scale(w",i,",m",j,"[0]);")
      }
    }
  }
  code.push("var p=", posExpr, ",n=", negExpr, ",d=diff(p,n);return d[d.length-1];}return ", funcName)
  var proc = new Function("sum", "diff", "prod", "scale", code.join(""))
  return proc(robustSum, robustDiff, twoProduct, robustScale)
}

function inSphere0() { return 0 }
function inSphere1() { return 0 }
function inSphere2() { return 0 }

var CACHED = [
  inSphere0,
  inSphere1,
  inSphere2
]

function slowInSphere(args) {
  var proc = CACHED[args.length]
  if(!proc) {
    proc = CACHED[args.length] = orientation(args.length)
  }
  return proc.apply(undefined, args)
}

function generateInSphereTest() {
  while(CACHED.length <= NUM_EXPAND) {
    CACHED.push(orientation(CACHED.length))
  }
  var args = []
  var procArgs = ["slow"]
  for(var i=0; i<=NUM_EXPAND; ++i) {
    args.push("a" + i)
    procArgs.push("o" + i)
  }
  var code = [
    "function testInSphere(", args.join(), "){switch(arguments.length){case 0:case 1:return 0;"
  ]
  for(var i=2; i<=NUM_EXPAND; ++i) {
    code.push("case ", i, ":return o", i, "(", args.slice(0, i).join(), ");")
  }
  code.push("}var s=new Array(arguments.length);for(var i=0;i<arguments.length;++i){s[i]=arguments[i]};return slow(s);}return testInSphere")
  procArgs.push(code.join(""))

  var proc = Function.apply(undefined, procArgs)

  module.exports = proc.apply(undefined, [slowInSphere].concat(CACHED))
  for(var i=0; i<=NUM_EXPAND; ++i) {
    module.exports[i] = CACHED[i]
  }
}

generateInSphereTest()
},{"robust-scale":30,"robust-subtract":31,"robust-sum":32,"two-product":33}],29:[function(require,module,exports){
arguments[4][7][0].apply(exports,arguments)
},{"dup":7}],30:[function(require,module,exports){
arguments[4][8][0].apply(exports,arguments)
},{"dup":8,"two-product":33,"two-sum":29}],31:[function(require,module,exports){
arguments[4][9][0].apply(exports,arguments)
},{"dup":9}],32:[function(require,module,exports){
arguments[4][10][0].apply(exports,arguments)
},{"dup":10}],33:[function(require,module,exports){
arguments[4][11][0].apply(exports,arguments)
},{"dup":11}],34:[function(require,module,exports){
arguments[4][7][0].apply(exports,arguments)
},{"dup":7}],35:[function(require,module,exports){
arguments[4][8][0].apply(exports,arguments)
},{"dup":8,"two-product":38,"two-sum":34}],36:[function(require,module,exports){
arguments[4][9][0].apply(exports,arguments)
},{"dup":9}],37:[function(require,module,exports){
arguments[4][10][0].apply(exports,arguments)
},{"dup":10}],38:[function(require,module,exports){
arguments[4][11][0].apply(exports,arguments)
},{"dup":11}],39:[function(require,module,exports){
arguments[4][12][0].apply(exports,arguments)
},{"dup":12,"robust-scale":35,"robust-subtract":36,"robust-sum":37,"two-product":38}],40:[function(require,module,exports){
'use strict'

module.exports = cleanPSLG

var UnionFind = require('union-find')
var boxIntersect = require('box-intersect')
var compareCell = require('compare-cell')
var segseg = require('robust-segment-intersect')
var rat = require('big-rat')
var ratCmp = require('big-rat/cmp')
var ratToFloat = require('big-rat/to-float')
var ratVec = require('rat-vec')
var nextafter = require('nextafter')

var solveIntersection = require('./lib/rat-seg-intersect')

//Bounds on a rational number when rounded to a float
function boundRat(r) {
  var f = ratToFloat(r)
  var cmp = ratCmp(rat(f), r)
  if(cmp < 0) {
    return [f, nextafter(f, Infinity)]
  } else if(cmp > 0) {
    return [nextafter(f, -Infinity), f]
  } else {
    return [f, f]
  }
}

//Convert a list of edges in a pslg to bounding boxes
function boundEdges(points, edges) {
  var bounds = new Array(edges.length)
  for(var i=0; i<edges.length; ++i) {
    var e = edges[i]
    var a = points[e[0]]
    var b = points[e[1]]
    bounds[i] = [
      Math.min(a[0], b[0]),
      Math.min(a[1], b[1]),
      Math.max(a[0], b[0]),
      Math.max(a[1], b[1]) ]
  }
  return bounds
}

//Convert a list of points into bounding boxes by duplicating coords
function boundPoints(points) {
  var bounds = new Array(points.length)
  for(var i=0; i<points.length; ++i) {
    var p = points[i]
    bounds[i] = [ p[0], p[1], p[0], p[1] ]
  }
  return bounds
}

//Find all pairs of crossing edges in a pslg (given edge bounds)
function getCrossings(points, edges, edgeBounds) {
  var result = []
  boxIntersect(edgeBounds, function(i, j) {
    var e = edges[i]
    var f = edges[j]
    if(e[0] === f[0] || e[0] === f[1] ||
       e[1] === f[0] || e[1] === f[1]) {
         return
    }
    var a = points[e[0]]
    var b = points[e[1]]
    var c = points[f[0]]
    var d = points[f[1]]
    if(segseg(a, b, c, d)) {
      result.push([i, j])
    }
  })
  return result
}

//Find all pairs of crossing vertices in a pslg (given edge/vert bounds)
function getTJunctions(points, edges, edgeBounds, vertBounds) {
  var result = []
  boxIntersect(edgeBounds, vertBounds, function(i, v) {
    var e = edges[i]
    if(e[0] === v || e[1] === v) {
      return
    }
    var p = points[v]
    var a = points[e[0]]
    var b = points[e[1]]
    if(segseg(a, b, p, p)) {
      result.push([i, v])
    }
  })
  return result
}


//Cut edges along crossings/tjunctions
function cutEdges(floatPoints, edges, crossings, junctions, useColor) {

  //Convert crossings into tjunctions by constructing rational points
  var ratPoints = []
  for(var i=0; i<crossings.length; ++i) {
    var crossing = crossings[i]
    var e = crossing[0]
    var f = crossing[1]
    var ee = edges[e]
    var ef = edges[f]
    var x = solveIntersection(
      ratVec(floatPoints[ee[0]]),
      ratVec(floatPoints[ee[1]]),
      ratVec(floatPoints[ef[0]]),
      ratVec(floatPoints[ef[1]]))
    if(!x) {
      //Segments are parallel, should already be handled by t-junctions
      continue
    }
    var idx = ratPoints.length + floatPoints.length
    ratPoints.push(x)
    junctions.push([e, idx], [f, idx])
  }

  //Sort tjunctions
  function getPoint(idx) {
    if(idx >= floatPoints.length) {
      return ratPoints[idx-floatPoints.length]
    }
    var p = floatPoints[idx]
    return [ rat(p[0]), rat(p[1]) ]
  }
  junctions.sort(function(a, b) {
    if(a[0] !== b[0]) {
      return a[0] - b[0]
    }
    var u = getPoint(a[1])
    var v = getPoint(b[1])
    return ratCmp(u[0], v[0]) || ratCmp(u[1], v[1])
  })

  //Split edges along junctions
  for(var i=junctions.length-1; i>=0; --i) {
    var junction = junctions[i]
    var e = junction[0]

    var edge = edges[e]
    var s = edge[0]
    var t = edge[1]

    //Check if edge is not lexicographically sorted
    var a = floatPoints[s]
    var b = floatPoints[t]
    if(((a[0] - b[0]) || (a[1] - b[1])) < 0) {
      var tmp = s
      s = t
      t = tmp
    }

    //Split leading edge
    edge[0] = s
    var last = edge[1] = junction[1]

    //If we are grouping edges by color, remember to track data
    var color
    if(useColor) {
      color = edge[2]
    }

    //Split other edges
    while(i > 0 && junctions[i-1][0] === e) {
      var junction = junctions[--i]
      var next = junction[1]
      if(useColor) {
        edges.push([last, next, color])
      } else {
        edges.push([last, next])
      }
      last = next
    }

    //Add final edge
    if(useColor) {
      edges.push([last, t, color])
    } else {
      edges.push([last, t])
    }
  }

  //Return constructed rational points
  return ratPoints
}

//Merge overlapping points
function dedupPoints(floatPoints, ratPoints, floatBounds) {
  var numPoints = floatPoints.length + ratPoints.length
  var uf        = new UnionFind(numPoints)

  //Compute rational bounds
  var bounds = floatBounds
  for(var i=0; i<ratPoints.length; ++i) {
    var p = ratPoints[i]
    var xb = boundRat(p[0])
    var yb = boundRat(p[1])
    bounds.push([ xb[0], yb[0], xb[1], yb[1] ])
    floatPoints.push([ ratToFloat(p[0]), ratToFloat(p[1]) ])
  }

  //Link all points with over lapping boxes
  boxIntersect(bounds, function(i, j) {
    uf.link(i, j)
  })

  //Call find on each point to get a relabeling
  var ptr = 0
  var noDupes = true
  var labels = new Array(numPoints)
  for(var i=0; i<numPoints; ++i) {
    var j = uf.find(i)
    if(j === i) {
      //If not a duplicate, then don't bother
      labels[i] = ptr
      floatPoints[ptr++] = floatPoints[i]
    } else {
      //Clear no-dupes flag, zero out label
      noDupes = false
      labels[i] = -1
    }
  }
  floatPoints.length = ptr

  //If no duplicates, return null to signal termination
  if(noDupes) {
    return null
  }

  //Do a second pass to fix up missing labels
  for(var i=0; i<numPoints; ++i) {
    if(labels[i] < 0) {
      labels[i] = labels[uf.find(i)]
    }
  }

  //Return resulting union-find data structure
  return labels
}

function compareLex2(a,b) { return (a[0]-b[0]) || (a[1]-b[1]) }
function compareLex3(a,b) {
  var d = (a[0] - b[0]) || (a[1] - b[1])
  if(d) {
    return d
  }
  if(a[2] < b[2]) {
    return -1
  } else if(a[2] > b[2]) {
    return 1
  }
  return 0
}

//Remove duplicate edge labels
function dedupEdges(edges, labels, useColor) {
  if(edges.length === 0) {
    return
  }
  if(labels) {
    for(var i=0; i<edges.length; ++i) {
      var e = edges[i]
      var a = labels[e[0]]
      var b = labels[e[1]]
      e[0] = Math.min(a, b)
      e[1] = Math.max(a, b)
    }
  } else {
    for(var i=0; i<edges.length; ++i) {
      var e = edges[i]
      var a = e[0]
      var b = e[1]
      e[0] = Math.min(a, b)
      e[1] = Math.max(a, b)
    }
  }
  if(useColor) {
    edges.sort(compareLex3)
  } else {
    edges.sort(compareLex2)
  }
  var ptr = 1
  for(var i=1; i<edges.length; ++i) {
    var prev = edges[i-1]
    var next = edges[i]
    if(next[0] === prev[0] && next[1] === prev[1] &&
      (!useColor || next[2] === prev[2])) {
      continue
    }
    edges[ptr++] = next
  }
  edges.length = ptr
}

//Repeat until convergence
function snapRound(points, edges, useColor) {

  // 1. find edge crossings
  var edgeBounds = boundEdges(points, edges)
  var crossings  = getCrossings(points, edges, edgeBounds)

  // 2. find t-junctions
  var vertBounds = boundPoints(points)
  var tjunctions = getTJunctions(points, edges, edgeBounds, vertBounds)

  // 3. cut edges, construct rational points
  var ratPoints  = cutEdges(points, edges, crossings, tjunctions, useColor)

  // 4. dedupe verts
  var labels     = dedupPoints(points, ratPoints, vertBounds)

  // 6. dedupe edges
  dedupEdges(edges, labels, useColor)

  // 5. check termination
  if(!labels) {
    return (crossings.length > 0 || tjunctions.length > 0)
  }

  // More iterations necessary
  return true
}

//Main loop, runs PSLG clean up until completion
function cleanPSLG(points, edges, colors) {
  var modified = false

  //If using colors, augment edges with color data
  var prevEdges
  if(colors) {
    prevEdges = edges
    var augEdges = new Array(edges.length)
    for(var i=0; i<edges.length; ++i) {
      var e = edges[i]
      augEdges[i] = [e[0], e[1], colors[i]]
    }
    edges = augEdges
  }

  //Run snap rounding until convergence
  while(snapRound(points, edges, !!colors)) {
    modified = true
  }

  //Strip color tags
  if(!!colors && modified) {
    prevEdges.length = 0
    colors.length = 0
    for(var i=0; i<edges.length; ++i) {
      var e = edges[i]
      prevEdges.push([e[0], e[1]])
      colors.push(e[2])
    }
  }

  return modified
}

},{"./lib/rat-seg-intersect":41,"big-rat":45,"big-rat/cmp":43,"big-rat/to-float":60,"box-intersect":61,"compare-cell":71,"nextafter":72,"rat-vec":75,"robust-segment-intersect":84,"union-find":85}],41:[function(require,module,exports){
'use strict'

//TODO: Move this to a separate module

module.exports = solveIntersection

var ratMul = require('big-rat/mul')
var ratDiv = require('big-rat/div')
var ratSub = require('big-rat/sub')
var ratSign = require('big-rat/sign')
var rvSub = require('rat-vec/sub')
var rvAdd = require('rat-vec/add')
var rvMuls = require('rat-vec/muls')

var toFloat = require('big-rat/to-float')

function ratPerp(a, b) {
  return ratSub(ratMul(a[0], b[1]), ratMul(a[1], b[0]))
}

//Solve for intersection
//  x = a + t (b-a)
//  (x - c) ^ (d-c) = 0
//  (t * (b-a) + (a-c) ) ^ (d-c) = 0
//  t * (b-a)^(d-c) = (d-c)^(a-c)
//  t = (d-c)^(a-c) / (b-a)^(d-c)

function solveIntersection(a, b, c, d) {
  var ba = rvSub(b, a)
  var dc = rvSub(d, c)

  var baXdc = ratPerp(ba, dc)

  if(ratSign(baXdc) === 0) {
    return null
  }

  var ac = rvSub(a, c)
  var dcXac = ratPerp(dc, ac)

  var t = ratDiv(dcXac, baXdc)

  return rvAdd(a, rvMuls(ba, t))
}

},{"big-rat/div":44,"big-rat/mul":54,"big-rat/sign":58,"big-rat/sub":59,"big-rat/to-float":60,"rat-vec/add":74,"rat-vec/muls":76,"rat-vec/sub":77}],42:[function(require,module,exports){
'use strict'

var rationalize = require('./lib/rationalize')

module.exports = add

function add(a, b) {
  return rationalize(
    a[0].mul(b[1]).add(b[0].mul(a[1])),
    a[1].mul(b[1]))
}

},{"./lib/rationalize":52}],43:[function(require,module,exports){
'use strict'

module.exports = cmp

function cmp(a, b) {
    return a[0].mul(b[1]).cmp(b[0].mul(a[1]))
}

},{}],44:[function(require,module,exports){
'use strict'

var rationalize = require('./lib/rationalize')

module.exports = div

function div(a, b) {
  return rationalize(a[0].mul(b[1]), a[1].mul(b[0]))
}

},{"./lib/rationalize":52}],45:[function(require,module,exports){
'use strict'

var isRat = require('./is-rat')
var isBN = require('./lib/is-bn')
var num2bn = require('./lib/num-to-bn')
var str2bn = require('./lib/str-to-bn')
var rationalize = require('./lib/rationalize')
var div = require('./div')

module.exports = makeRational

function makeRational(numer, denom) {
  if(isRat(numer)) {
    if(denom) {
      return div(numer, makeRational(denom))
    }
    return [numer[0].clone(), numer[1].clone()]
  }
  var shift = 0
  var a, b
  if(isBN(numer)) {
    a = numer.clone()
  } else if(typeof numer === 'string') {
    a = str2bn(numer)
  } else if(numer === 0) {
    return [num2bn(0), num2bn(1)]
  } else if(numer === Math.floor(numer)) {
    a = num2bn(numer)
  } else {
    while(numer !== Math.floor(numer)) {
      numer = numer * Math.pow(2, 256)
      shift -= 256
    }
    a = num2bn(numer)
  }
  if(isRat(denom)) {
    a.mul(denom[1])
    b = denom[0].clone()
  } else if(isBN(denom)) {
    b = denom.clone()
  } else if(typeof denom === 'string') {
    b = str2bn(denom)
  } else if(!denom) {
    b = num2bn(1)
  } else if(denom === Math.floor(denom)) {
    b = num2bn(denom)
  } else {
    while(denom !== Math.floor(denom)) {
      denom = denom * Math.pow(2, 256)
      shift += 256
    }
    b = num2bn(denom)
  }
  if(shift > 0) {
    a = a.shln(shift)
  } else if(shift < 0) {
    b = b.shln(-shift)
  }
  return rationalize(a, b)
}

},{"./div":44,"./is-rat":46,"./lib/is-bn":50,"./lib/num-to-bn":51,"./lib/rationalize":52,"./lib/str-to-bn":53}],46:[function(require,module,exports){
'use strict'

var isBN = require('./lib/is-bn')

module.exports = isRat

function isRat(x) {
  return Array.isArray(x) && x.length === 2 && isBN(x[0]) && isBN(x[1])
}

},{"./lib/is-bn":50}],47:[function(require,module,exports){
'use strict'

var bn = require('bn.js')

module.exports = sign

function sign(x) {
  return x.cmp(new bn(0))
}

},{"bn.js":56}],48:[function(require,module,exports){
'use strict'

module.exports = bn2num

//TODO: Make this better
function bn2num(b) {
  var l = b.length
  var words = b.words
  var out = 0
  if (l === 1) {
    out = words[0]
  } else if (l === 2) {
    out = words[0] + (words[1] * 0x4000000)
  } else {
    var out = 0
    for (var i = 0; i < l; i++) {
      var w = words[i]
      out += w * Math.pow(0x4000000, i)
    }
  }
  return b.sign ? -out : out
}

},{}],49:[function(require,module,exports){
'use strict'

var db = require('double-bits')
var ctz = require('bit-twiddle').countTrailingZeros

module.exports = ctzNumber

//Counts the number of trailing zeros
function ctzNumber(x) {
  var l = ctz(db.lo(x))
  if(l < 32) {
    return l
  }
  var h = ctz(db.hi(x))
  if(h > 20) {
    return 52
  }
  return h + 32
}

},{"bit-twiddle":55,"double-bits":57}],50:[function(require,module,exports){
'use strict'

var BN = require('bn.js')

module.exports = isBN

//Test if x is a bignumber
//FIXME: obviously this is the wrong way to do it
function isBN(x) {
  return x && typeof x === 'object' && Boolean(x.words)
}

},{"bn.js":56}],51:[function(require,module,exports){
'use strict'

var BN = require('bn.js')
var db = require('double-bits')

module.exports = num2bn

function num2bn(x) {
  var e = db.exponent(x)
  if(e < 52) {
    return new BN(x)
  } else {
    return (new BN(x * Math.pow(2, 52-e))).shln(e-52)
  }
}

},{"bn.js":56,"double-bits":57}],52:[function(require,module,exports){
'use strict'

var num2bn = require('./num-to-bn')
var sign = require('./bn-sign')

module.exports = rationalize

function rationalize(numer, denom) {
  var snumer = sign(numer)
  var sdenom = sign(denom)
  if(snumer === 0) {
    return [num2bn(0), num2bn(1)]
  }
  if(sdenom === 0) {
    return [num2bn(0), num2bn(0)]
  }
  if(sdenom < 0) {
    numer = numer.neg()
    denom = denom.neg()
  }
  var d = numer.gcd(denom)
  if(d.cmpn(1)) {
    return [ numer.div(d), denom.div(d) ]
  }
  return [ numer, denom ]
}

},{"./bn-sign":47,"./num-to-bn":51}],53:[function(require,module,exports){
'use strict'

var BN = require('bn.js')

module.exports = str2BN

function str2BN(x) {
  return new BN(x)
}

},{"bn.js":56}],54:[function(require,module,exports){
'use strict'

var rationalize = require('./lib/rationalize')

module.exports = mul

function mul(a, b) {
  return rationalize(a[0].mul(b[0]), a[1].mul(b[1]))
}

},{"./lib/rationalize":52}],55:[function(require,module,exports){
/**
 * Bit twiddling hacks for JavaScript.
 *
 * Author: Mikola Lysenko
 *
 * Ported from Stanford bit twiddling hack library:
 *    http://graphics.stanford.edu/~seander/bithacks.html
 */

"use strict"; "use restrict";

//Number of bits in an integer
var INT_BITS = 32;

//Constants
exports.INT_BITS  = INT_BITS;
exports.INT_MAX   =  0x7fffffff;
exports.INT_MIN   = -1<<(INT_BITS-1);

//Returns -1, 0, +1 depending on sign of x
exports.sign = function(v) {
  return (v > 0) - (v < 0);
}

//Computes absolute value of integer
exports.abs = function(v) {
  var mask = v >> (INT_BITS-1);
  return (v ^ mask) - mask;
}

//Computes minimum of integers x and y
exports.min = function(x, y) {
  return y ^ ((x ^ y) & -(x < y));
}

//Computes maximum of integers x and y
exports.max = function(x, y) {
  return x ^ ((x ^ y) & -(x < y));
}

//Checks if a number is a power of two
exports.isPow2 = function(v) {
  return !(v & (v-1)) && (!!v);
}

//Computes log base 2 of v
exports.log2 = function(v) {
  var r, shift;
  r =     (v > 0xFFFF) << 4; v >>>= r;
  shift = (v > 0xFF  ) << 3; v >>>= shift; r |= shift;
  shift = (v > 0xF   ) << 2; v >>>= shift; r |= shift;
  shift = (v > 0x3   ) << 1; v >>>= shift; r |= shift;
  return r | (v >> 1);
}

//Computes log base 10 of v
exports.log10 = function(v) {
  return  (v >= 1000000000) ? 9 : (v >= 100000000) ? 8 : (v >= 10000000) ? 7 :
          (v >= 1000000) ? 6 : (v >= 100000) ? 5 : (v >= 10000) ? 4 :
          (v >= 1000) ? 3 : (v >= 100) ? 2 : (v >= 10) ? 1 : 0;
}

//Counts number of bits
exports.popCount = function(v) {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return ((v + (v >>> 4) & 0xF0F0F0F) * 0x1010101) >>> 24;
}

//Counts number of trailing zeros
function countTrailingZeros(v) {
  var c = 32;
  v &= -v;
  if (v) c--;
  if (v & 0x0000FFFF) c -= 16;
  if (v & 0x00FF00FF) c -= 8;
  if (v & 0x0F0F0F0F) c -= 4;
  if (v & 0x33333333) c -= 2;
  if (v & 0x55555555) c -= 1;
  return c;
}
exports.countTrailingZeros = countTrailingZeros;

//Rounds to next power of 2
exports.nextPow2 = function(v) {
  v += v === 0;
  --v;
  v |= v >>> 1;
  v |= v >>> 2;
  v |= v >>> 4;
  v |= v >>> 8;
  v |= v >>> 16;
  return v + 1;
}

//Rounds down to previous power of 2
exports.prevPow2 = function(v) {
  v |= v >>> 1;
  v |= v >>> 2;
  v |= v >>> 4;
  v |= v >>> 8;
  v |= v >>> 16;
  return v - (v>>>1);
}

//Computes parity of word
exports.parity = function(v) {
  v ^= v >>> 16;
  v ^= v >>> 8;
  v ^= v >>> 4;
  v &= 0xf;
  return (0x6996 >>> v) & 1;
}

var REVERSE_TABLE = new Array(256);

(function(tab) {
  for(var i=0; i<256; ++i) {
    var v = i, r = i, s = 7;
    for (v >>>= 1; v; v >>>= 1) {
      r <<= 1;
      r |= v & 1;
      --s;
    }
    tab[i] = (r << s) & 0xff;
  }
})(REVERSE_TABLE);

//Reverse bits in a 32 bit word
exports.reverse = function(v) {
  return  (REVERSE_TABLE[ v         & 0xff] << 24) |
          (REVERSE_TABLE[(v >>> 8)  & 0xff] << 16) |
          (REVERSE_TABLE[(v >>> 16) & 0xff] << 8)  |
           REVERSE_TABLE[(v >>> 24) & 0xff];
}

//Interleave bits of 2 coordinates with 16 bits.  Useful for fast quadtree codes
exports.interleave2 = function(x, y) {
  x &= 0xFFFF;
  x = (x | (x << 8)) & 0x00FF00FF;
  x = (x | (x << 4)) & 0x0F0F0F0F;
  x = (x | (x << 2)) & 0x33333333;
  x = (x | (x << 1)) & 0x55555555;

  y &= 0xFFFF;
  y = (y | (y << 8)) & 0x00FF00FF;
  y = (y | (y << 4)) & 0x0F0F0F0F;
  y = (y | (y << 2)) & 0x33333333;
  y = (y | (y << 1)) & 0x55555555;

  return x | (y << 1);
}

//Extracts the nth interleaved component
exports.deinterleave2 = function(v, n) {
  v = (v >>> n) & 0x55555555;
  v = (v | (v >>> 1))  & 0x33333333;
  v = (v | (v >>> 2))  & 0x0F0F0F0F;
  v = (v | (v >>> 4))  & 0x00FF00FF;
  v = (v | (v >>> 16)) & 0x000FFFF;
  return (v << 16) >> 16;
}


//Interleave bits of 3 coordinates, each with 10 bits.  Useful for fast octree codes
exports.interleave3 = function(x, y, z) {
  x &= 0x3FF;
  x  = (x | (x<<16)) & 4278190335;
  x  = (x | (x<<8))  & 251719695;
  x  = (x | (x<<4))  & 3272356035;
  x  = (x | (x<<2))  & 1227133513;

  y &= 0x3FF;
  y  = (y | (y<<16)) & 4278190335;
  y  = (y | (y<<8))  & 251719695;
  y  = (y | (y<<4))  & 3272356035;
  y  = (y | (y<<2))  & 1227133513;
  x |= (y << 1);

  z &= 0x3FF;
  z  = (z | (z<<16)) & 4278190335;
  z  = (z | (z<<8))  & 251719695;
  z  = (z | (z<<4))  & 3272356035;
  z  = (z | (z<<2))  & 1227133513;

  return x | (z << 2);
}

//Extracts nth interleaved component of a 3-tuple
exports.deinterleave3 = function(v, n) {
  v = (v >>> n)       & 1227133513;
  v = (v | (v>>>2))   & 3272356035;
  v = (v | (v>>>4))   & 251719695;
  v = (v | (v>>>8))   & 4278190335;
  v = (v | (v>>>16))  & 0x3FF;
  return (v<<22)>>22;
}

//Computes next combination in colexicographic order (this is mistakenly called nextPermutation on the bit twiddling hacks page)
exports.nextCombination = function(v) {
  var t = v | (v - 1);
  return (t + 1) | (((~t & -~t) - 1) >>> (countTrailingZeros(v) + 1));
}


},{}],56:[function(require,module,exports){
(function (module, exports) {

'use strict';

// Utils

function assert(val, msg) {
  if (!val)
    throw new Error(msg || 'Assertion failed');
}

// Could use `inherits` module, but don't want to move from single file
// architecture yet.
function inherits(ctor, superCtor) {
  ctor.super_ = superCtor;
  var TempCtor = function () {};
  TempCtor.prototype = superCtor.prototype;
  ctor.prototype = new TempCtor();
  ctor.prototype.constructor = ctor;
}

// BN

function BN(number, base, endian) {
  // May be `new BN(bn)` ?
  if (number !== null &&
      typeof number === 'object' &&
      Array.isArray(number.words)) {
    return number;
  }

  this.sign = false;
  this.words = null;
  this.length = 0;

  // Reduction context
  this.red = null;

  if (base === 'le' || base === 'be') {
    endian = base;
    base = 10;
  }

  if (number !== null)
    this._init(number || 0, base || 10, endian || 'be');
}
if (typeof module === 'object')
  module.exports = BN;
else
  exports.BN = BN;

BN.BN = BN;
BN.wordSize = 26;

BN.prototype._init = function init(number, base, endian) {
  if (typeof number === 'number') {
    return this._initNumber(number, base, endian);
  } else if (typeof number === 'object') {
    return this._initArray(number, base, endian);
  }
  if (base === 'hex')
    base = 16;
  assert(base === (base | 0) && base >= 2 && base <= 36);

  number = number.toString().replace(/\s+/g, '');
  var start = 0;
  if (number[0] === '-')
    start++;

  if (base === 16)
    this._parseHex(number, start);
  else
    this._parseBase(number, base, start);

  if (number[0] === '-')
    this.sign = true;

  this.strip();

  if (endian !== 'le')
    return;

  this._initArray(this.toArray(), base, endian);
};

BN.prototype._initNumber = function _initNumber(number, base, endian) {
  if (number < 0) {
    this.sign = true;
    number = -number;
  }
  if (number < 0x4000000) {
    this.words = [ number & 0x3ffffff ];
    this.length = 1;
  } else if (number < 0x10000000000000) {
    this.words = [
      number & 0x3ffffff,
      (number / 0x4000000) & 0x3ffffff
    ];
    this.length = 2;
  } else {
    assert(number < 0x20000000000000); // 2 ^ 53 (unsafe)
    this.words = [
      number & 0x3ffffff,
      (number / 0x4000000) & 0x3ffffff,
      1
    ];
    this.length = 3;
  }

  if (endian !== 'le')
    return;

  // Reverse the bytes
  this._initArray(this.toArray(), base, endian);
};

BN.prototype._initArray = function _initArray(number, base, endian) {
  // Perhaps a Uint8Array
  assert(typeof number.length === 'number');
  if (number.length <= 0) {
    this.words = [ 0 ];
    this.length = 1;
    return this;
  }

  this.length = Math.ceil(number.length / 3);
  this.words = new Array(this.length);
  for (var i = 0; i < this.length; i++)
    this.words[i] = 0;

  var off = 0;
  if (endian === 'be') {
    for (var i = number.length - 1, j = 0; i >= 0; i -= 3) {
      var w = number[i] | (number[i - 1] << 8) | (number[i - 2] << 16);
      this.words[j] |= (w << off) & 0x3ffffff;
      this.words[j + 1] = (w >>> (26 - off)) & 0x3ffffff;
      off += 24;
      if (off >= 26) {
        off -= 26;
        j++;
      }
    }
  } else if (endian === 'le') {
    for (var i = 0, j = 0; i < number.length; i += 3) {
      var w = number[i] | (number[i + 1] << 8) | (number[i + 2] << 16);
      this.words[j] |= (w << off) & 0x3ffffff;
      this.words[j + 1] = (w >>> (26 - off)) & 0x3ffffff;
      off += 24;
      if (off >= 26) {
        off -= 26;
        j++;
      }
    }
  }
  return this.strip();
};

function parseHex(str, start, end) {
  var r = 0;
  var len = Math.min(str.length, end);
  for (var i = start; i < len; i++) {
    var c = str.charCodeAt(i) - 48;

    r <<= 4;

    // 'a' - 'f'
    if (c >= 49 && c <= 54)
      r |= c - 49 + 0xa;

    // 'A' - 'F'
    else if (c >= 17 && c <= 22)
      r |= c - 17 + 0xa;

    // '0' - '9'
    else
      r |= c & 0xf;
  }
  return r;
}

BN.prototype._parseHex = function _parseHex(number, start) {
  // Create possibly bigger array to ensure that it fits the number
  this.length = Math.ceil((number.length - start) / 6);
  this.words = new Array(this.length);
  for (var i = 0; i < this.length; i++)
    this.words[i] = 0;

  // Scan 24-bit chunks and add them to the number
  var off = 0;
  for (var i = number.length - 6, j = 0; i >= start; i -= 6) {
    var w = parseHex(number, i, i + 6);
    this.words[j] |= (w << off) & 0x3ffffff;
    this.words[j + 1] |= w >>> (26 - off) & 0x3fffff;
    off += 24;
    if (off >= 26) {
      off -= 26;
      j++;
    }
  }
  if (i + 6 !== start) {
    var w = parseHex(number, start, i + 6);
    this.words[j] |= (w << off) & 0x3ffffff;
    this.words[j + 1] |= w >>> (26 - off) & 0x3fffff;
  }
  this.strip();
};

function parseBase(str, start, end, mul) {
  var r = 0;
  var len = Math.min(str.length, end);
  for (var i = start; i < len; i++) {
    var c = str.charCodeAt(i) - 48;

    r *= mul;

    // 'a'
    if (c >= 49)
      r += c - 49 + 0xa;

    // 'A'
    else if (c >= 17)
      r += c - 17 + 0xa;

    // '0' - '9'
    else
      r += c;
  }
  return r;
}

BN.prototype._parseBase = function _parseBase(number, base, start) {
  // Initialize as zero
  this.words = [ 0 ];
  this.length = 1;

  // Find length of limb in base
  for (var limbLen = 0, limbPow = 1; limbPow <= 0x3ffffff; limbPow *= base)
    limbLen++;
  limbLen--;
  limbPow = (limbPow / base) | 0;

  var total = number.length - start;
  var mod = total % limbLen;
  var end = Math.min(total, total - mod) + start;

  var word = 0;
  for (var i = start; i < end; i += limbLen) {
    word = parseBase(number, i, i + limbLen, base);

    this.imuln(limbPow);
    if (this.words[0] + word < 0x4000000)
      this.words[0] += word;
    else
      this._iaddn(word);
  }

  if (mod !== 0) {
    var pow = 1;
    var word = parseBase(number, i, number.length, base);

    for (var i = 0; i < mod; i++)
      pow *= base;
    this.imuln(pow);
    if (this.words[0] + word < 0x4000000)
      this.words[0] += word;
    else
      this._iaddn(word);
  }
};

BN.prototype.copy = function copy(dest) {
  dest.words = new Array(this.length);
  for (var i = 0; i < this.length; i++)
    dest.words[i] = this.words[i];
  dest.length = this.length;
  dest.sign = this.sign;
  dest.red = this.red;
};

BN.prototype.clone = function clone() {
  var r = new BN(null);
  this.copy(r);
  return r;
};

// Remove leading `0` from `this`
BN.prototype.strip = function strip() {
  while (this.length > 1 && this.words[this.length - 1] === 0)
    this.length--;
  return this._normSign();
};

BN.prototype._normSign = function _normSign() {
  // -0 = 0
  if (this.length === 1 && this.words[0] === 0)
    this.sign = false;
  return this;
};

BN.prototype.inspect = function inspect() {
  return (this.red ? '<BN-R: ' : '<BN: ') + this.toString(16) + '>';
};

/*

var zeros = [];
var groupSizes = [];
var groupBases = [];

var s = '';
var i = -1;
while (++i < BN.wordSize) {
  zeros[i] = s;
  s += '0';
}
groupSizes[0] = 0;
groupSizes[1] = 0;
groupBases[0] = 0;
groupBases[1] = 0;
var base = 2 - 1;
while (++base < 36 + 1) {
  var groupSize = 0;
  var groupBase = 1;
  while (groupBase < (1 << BN.wordSize) / base) {
    groupBase *= base;
    groupSize += 1;
  }
  groupSizes[base] = groupSize;
  groupBases[base] = groupBase;
}

*/

var zeros = [
  '',
  '0',
  '00',
  '000',
  '0000',
  '00000',
  '000000',
  '0000000',
  '00000000',
  '000000000',
  '0000000000',
  '00000000000',
  '000000000000',
  '0000000000000',
  '00000000000000',
  '000000000000000',
  '0000000000000000',
  '00000000000000000',
  '000000000000000000',
  '0000000000000000000',
  '00000000000000000000',
  '000000000000000000000',
  '0000000000000000000000',
  '00000000000000000000000',
  '000000000000000000000000',
  '0000000000000000000000000'
];

var groupSizes = [
  0, 0,
  25, 16, 12, 11, 10, 9, 8,
  8, 7, 7, 7, 7, 6, 6,
  6, 6, 6, 6, 6, 5, 5,
  5, 5, 5, 5, 5, 5, 5,
  5, 5, 5, 5, 5, 5, 5
];

var groupBases = [
  0, 0,
  33554432, 43046721, 16777216, 48828125, 60466176, 40353607, 16777216,
  43046721, 10000000, 19487171, 35831808, 62748517, 7529536, 11390625,
  16777216, 24137569, 34012224, 47045881, 64000000, 4084101, 5153632,
  6436343, 7962624, 9765625, 11881376, 14348907, 17210368, 20511149,
  24300000, 28629151, 33554432, 39135393, 45435424, 52521875, 60466176
];

BN.prototype.toString = function toString(base, padding) {
  base = base || 10;
  if (base === 16 || base === 'hex') {
    var out = '';
    var off = 0;
    var padding = padding | 0 || 1;
    var carry = 0;
    for (var i = 0; i < this.length; i++) {
      var w = this.words[i];
      var word = (((w << off) | carry) & 0xffffff).toString(16);
      carry = (w >>> (24 - off)) & 0xffffff;
      if (carry !== 0 || i !== this.length - 1)
        out = zeros[6 - word.length] + word + out;
      else
        out = word + out;
      off += 2;
      if (off >= 26) {
        off -= 26;
        i--;
      }
    }
    if (carry !== 0)
      out = carry.toString(16) + out;
    while (out.length % padding !== 0)
      out = '0' + out;
    if (this.sign)
      out = '-' + out;
    return out;
  } else if (base === (base | 0) && base >= 2 && base <= 36) {
    // var groupSize = Math.floor(BN.wordSize * Math.LN2 / Math.log(base));
    var groupSize = groupSizes[base];
    // var groupBase = Math.pow(base, groupSize);
    var groupBase = groupBases[base];
    var out = '';
    var c = this.clone();
    c.sign = false;
    while (c.cmpn(0) !== 0) {
      var r = c.modn(groupBase).toString(base);
      c = c.idivn(groupBase);

      if (c.cmpn(0) !== 0)
        out = zeros[groupSize - r.length] + r + out;
      else
        out = r + out;
    }
    if (this.cmpn(0) === 0)
      out = '0' + out;
    if (this.sign)
      out = '-' + out;
    return out;
  } else {
    assert(false, 'Base should be between 2 and 36');
  }
};

BN.prototype.toJSON = function toJSON() {
  return this.toString(16);
};

BN.prototype.toArray = function toArray(endian) {
  this.strip();
  var res = new Array(this.byteLength());
  res[0] = 0;

  var q = this.clone();
  if (endian !== 'le') {
    // Assume big-endian
    for (var i = 0; q.cmpn(0) !== 0; i++) {
      var b = q.andln(0xff);
      q.ishrn(8);

      res[res.length - i - 1] = b;
    }
  } else {
    // Assume little-endian
    for (var i = 0; q.cmpn(0) !== 0; i++) {
      var b = q.andln(0xff);
      q.ishrn(8);

      res[i] = b;
    }
  }

  return res;
};

if (Math.clz32) {
  BN.prototype._countBits = function _countBits(w) {
    return 32 - Math.clz32(w);
  };
} else {
  BN.prototype._countBits = function _countBits(w) {
    var t = w;
    var r = 0;
    if (t >= 0x1000) {
      r += 13;
      t >>>= 13;
    }
    if (t >= 0x40) {
      r += 7;
      t >>>= 7;
    }
    if (t >= 0x8) {
      r += 4;
      t >>>= 4;
    }
    if (t >= 0x02) {
      r += 2;
      t >>>= 2;
    }
    return r + t;
  };
}

BN.prototype._zeroBits = function _zeroBits(w) {
  // Short-cut
  if (w === 0)
    return 26;

  var t = w;
  var r = 0;
  if ((t & 0x1fff) === 0) {
    r += 13;
    t >>>= 13;
  }
  if ((t & 0x7f) === 0) {
    r += 7;
    t >>>= 7;
  }
  if ((t & 0xf) === 0) {
    r += 4;
    t >>>= 4;
  }
  if ((t & 0x3) === 0) {
    r += 2;
    t >>>= 2;
  }
  if ((t & 0x1) === 0)
    r++;
  return r;
};

// Return number of used bits in a BN
BN.prototype.bitLength = function bitLength() {
  var hi = 0;
  var w = this.words[this.length - 1];
  var hi = this._countBits(w);
  return (this.length - 1) * 26 + hi;
};

// Number of trailing zero bits
BN.prototype.zeroBits = function zeroBits() {
  if (this.cmpn(0) === 0)
    return 0;

  var r = 0;
  for (var i = 0; i < this.length; i++) {
    var b = this._zeroBits(this.words[i]);
    r += b;
    if (b !== 26)
      break;
  }
  return r;
};

BN.prototype.byteLength = function byteLength() {
  return Math.ceil(this.bitLength() / 8);
};

// Return negative clone of `this`
BN.prototype.neg = function neg() {
  if (this.cmpn(0) === 0)
    return this.clone();

  var r = this.clone();
  r.sign = !this.sign;
  return r;
};


// Or `num` with `this` in-place
BN.prototype.ior = function ior(num) {
  this.sign = this.sign || num.sign;

  while (this.length < num.length)
    this.words[this.length++] = 0;

  for (var i = 0; i < num.length; i++)
    this.words[i] = this.words[i] | num.words[i];

  return this.strip();
};


// Or `num` with `this`
BN.prototype.or = function or(num) {
  if (this.length > num.length)
    return this.clone().ior(num);
  else
    return num.clone().ior(this);
};


// And `num` with `this` in-place
BN.prototype.iand = function iand(num) {
  this.sign = this.sign && num.sign;

  // b = min-length(num, this)
  var b;
  if (this.length > num.length)
    b = num;
  else
    b = this;

  for (var i = 0; i < b.length; i++)
    this.words[i] = this.words[i] & num.words[i];

  this.length = b.length;

  return this.strip();
};


// And `num` with `this`
BN.prototype.and = function and(num) {
  if (this.length > num.length)
    return this.clone().iand(num);
  else
    return num.clone().iand(this);
};


// Xor `num` with `this` in-place
BN.prototype.ixor = function ixor(num) {
  this.sign = this.sign || num.sign;

  // a.length > b.length
  var a;
  var b;
  if (this.length > num.length) {
    a = this;
    b = num;
  } else {
    a = num;
    b = this;
  }

  for (var i = 0; i < b.length; i++)
    this.words[i] = a.words[i] ^ b.words[i];

  if (this !== a)
    for (; i < a.length; i++)
      this.words[i] = a.words[i];

  this.length = a.length;

  return this.strip();
};


// Xor `num` with `this`
BN.prototype.xor = function xor(num) {
  if (this.length > num.length)
    return this.clone().ixor(num);
  else
    return num.clone().ixor(this);
};


// Set `bit` of `this`
BN.prototype.setn = function setn(bit, val) {
  assert(typeof bit === 'number' && bit >= 0);

  var off = (bit / 26) | 0;
  var wbit = bit % 26;

  while (this.length <= off)
    this.words[this.length++] = 0;

  if (val)
    this.words[off] = this.words[off] | (1 << wbit);
  else
    this.words[off] = this.words[off] & ~(1 << wbit);

  return this.strip();
};


// Add `num` to `this` in-place
BN.prototype.iadd = function iadd(num) {
  // negative + positive
  if (this.sign && !num.sign) {
    this.sign = false;
    var r = this.isub(num);
    this.sign = !this.sign;
    return this._normSign();

  // positive + negative
  } else if (!this.sign && num.sign) {
    num.sign = false;
    var r = this.isub(num);
    num.sign = true;
    return r._normSign();
  }

  // a.length > b.length
  var a;
  var b;
  if (this.length > num.length) {
    a = this;
    b = num;
  } else {
    a = num;
    b = this;
  }

  var carry = 0;
  for (var i = 0; i < b.length; i++) {
    var r = a.words[i] + b.words[i] + carry;
    this.words[i] = r & 0x3ffffff;
    carry = r >>> 26;
  }
  for (; carry !== 0 && i < a.length; i++) {
    var r = a.words[i] + carry;
    this.words[i] = r & 0x3ffffff;
    carry = r >>> 26;
  }

  this.length = a.length;
  if (carry !== 0) {
    this.words[this.length] = carry;
    this.length++;
  // Copy the rest of the words
  } else if (a !== this) {
    for (; i < a.length; i++)
      this.words[i] = a.words[i];
  }

  return this;
};

// Add `num` to `this`
BN.prototype.add = function add(num) {
  if (num.sign && !this.sign) {
    num.sign = false;
    var res = this.sub(num);
    num.sign = true;
    return res;
  } else if (!num.sign && this.sign) {
    this.sign = false;
    var res = num.sub(this);
    this.sign = true;
    return res;
  }

  if (this.length > num.length)
    return this.clone().iadd(num);
  else
    return num.clone().iadd(this);
};

// Subtract `num` from `this` in-place
BN.prototype.isub = function isub(num) {
  // this - (-num) = this + num
  if (num.sign) {
    num.sign = false;
    var r = this.iadd(num);
    num.sign = true;
    return r._normSign();

  // -this - num = -(this + num)
  } else if (this.sign) {
    this.sign = false;
    this.iadd(num);
    this.sign = true;
    return this._normSign();
  }

  // At this point both numbers are positive
  var cmp = this.cmp(num);

  // Optimization - zeroify
  if (cmp === 0) {
    this.sign = false;
    this.length = 1;
    this.words[0] = 0;
    return this;
  }

  // a > b
  var a;
  var b;
  if (cmp > 0) {
    a = this;
    b = num;
  } else {
    a = num;
    b = this;
  }

  var carry = 0;
  for (var i = 0; i < b.length; i++) {
    var r = a.words[i] - b.words[i] + carry;
    carry = r >> 26;
    this.words[i] = r & 0x3ffffff;
  }
  for (; carry !== 0 && i < a.length; i++) {
    var r = a.words[i] + carry;
    carry = r >> 26;
    this.words[i] = r & 0x3ffffff;
  }

  // Copy rest of the words
  if (carry === 0 && i < a.length && a !== this)
    for (; i < a.length; i++)
      this.words[i] = a.words[i];
  this.length = Math.max(this.length, i);

  if (a !== this)
    this.sign = true;

  return this.strip();
};

// Subtract `num` from `this`
BN.prototype.sub = function sub(num) {
  return this.clone().isub(num);
};

/*
// NOTE: This could be potentionally used to generate loop-less multiplications
function _genCombMulTo(alen, blen) {
  var len = alen + blen - 1;
  var src = [
    'var a = this.words, b = num.words, o = out.words, c = 0, w, ' +
        'mask = 0x3ffffff, shift = 0x4000000;',
    'out.length = ' + len + ';'
  ];
  for (var k = 0; k < len; k++) {
    var minJ = Math.max(0, k - alen + 1);
    var maxJ = Math.min(k, blen - 1);

    for (var j = minJ; j <= maxJ; j++) {
      var i = k - j;
      var mul = 'a[' + i + '] * b[' + j + ']';

      if (j === minJ) {
        src.push('w = ' + mul + ' + c;');
        src.push('c = (w / shift) | 0;');
      } else {
        src.push('w += ' + mul + ';');
        src.push('c += (w / shift) | 0;');
      }
      src.push('w &= mask;');
    }
    src.push('o[' + k + '] = w;');
  }
  src.push('if (c !== 0) {',
           '  o[' + k + '] = c;',
           '  out.length++;',
           '}',
           'return out;');

  return src.join('\n');
}
*/

BN.prototype._smallMulTo = function _smallMulTo(num, out) {
  out.sign = num.sign !== this.sign;
  out.length = this.length + num.length;

  var carry = 0;
  for (var k = 0; k < out.length - 1; k++) {
    // Sum all words with the same `i + j = k` and accumulate `ncarry`,
    // note that ncarry could be >= 0x3ffffff
    var ncarry = carry >>> 26;
    var rword = carry & 0x3ffffff;
    var maxJ = Math.min(k, num.length - 1);
    for (var j = Math.max(0, k - this.length + 1); j <= maxJ; j++) {
      var i = k - j;
      var a = this.words[i] | 0;
      var b = num.words[j] | 0;
      var r = a * b;

      var lo = r & 0x3ffffff;
      ncarry = (ncarry + ((r / 0x4000000) | 0)) | 0;
      lo = (lo + rword) | 0;
      rword = lo & 0x3ffffff;
      ncarry = (ncarry + (lo >>> 26)) | 0;
    }
    out.words[k] = rword;
    carry = ncarry;
  }
  if (carry !== 0) {
    out.words[k] = carry;
  } else {
    out.length--;
  }

  return out.strip();
};

BN.prototype._bigMulTo = function _bigMulTo(num, out) {
  out.sign = num.sign !== this.sign;
  out.length = this.length + num.length;

  var carry = 0;
  var hncarry = 0;
  for (var k = 0; k < out.length - 1; k++) {
    // Sum all words with the same `i + j = k` and accumulate `ncarry`,
    // note that ncarry could be >= 0x3ffffff
    var ncarry = hncarry;
    hncarry = 0;
    var rword = carry & 0x3ffffff;
    var maxJ = Math.min(k, num.length - 1);
    for (var j = Math.max(0, k - this.length + 1); j <= maxJ; j++) {
      var i = k - j;
      var a = this.words[i] | 0;
      var b = num.words[j] | 0;
      var r = a * b;

      var lo = r & 0x3ffffff;
      ncarry = (ncarry + ((r / 0x4000000) | 0)) | 0;
      lo = (lo + rword) | 0;
      rword = lo & 0x3ffffff;
      ncarry = (ncarry + (lo >>> 26)) | 0;

      hncarry += ncarry >>> 26;
      ncarry &= 0x3ffffff;
    }
    out.words[k] = rword;
    carry = ncarry;
    ncarry = hncarry;
  }
  if (carry !== 0) {
    out.words[k] = carry;
  } else {
    out.length--;
  }

  return out.strip();
};

BN.prototype.mulTo = function mulTo(num, out) {
  var res;
  if (this.length + num.length < 63)
    res = this._smallMulTo(num, out);
  else
    res = this._bigMulTo(num, out);
  return res;
};

// Multiply `this` by `num`
BN.prototype.mul = function mul(num) {
  var out = new BN(null);
  out.words = new Array(this.length + num.length);
  return this.mulTo(num, out);
};

// In-place Multiplication
BN.prototype.imul = function imul(num) {
  if (this.cmpn(0) === 0 || num.cmpn(0) === 0) {
    this.words[0] = 0;
    this.length = 1;
    return this;
  }

  var tlen = this.length;
  var nlen = num.length;

  this.sign = num.sign !== this.sign;
  this.length = this.length + num.length;
  this.words[this.length - 1] = 0;

  for (var k = this.length - 2; k >= 0; k--) {
    // Sum all words with the same `i + j = k` and accumulate `carry`,
    // note that carry could be >= 0x3ffffff
    var carry = 0;
    var rword = 0;
    var maxJ = Math.min(k, nlen - 1);
    for (var j = Math.max(0, k - tlen + 1); j <= maxJ; j++) {
      var i = k - j;
      var a = this.words[i];
      var b = num.words[j];
      var r = a * b;

      var lo = r & 0x3ffffff;
      carry += (r / 0x4000000) | 0;
      lo += rword;
      rword = lo & 0x3ffffff;
      carry += lo >>> 26;
    }
    this.words[k] = rword;
    this.words[k + 1] += carry;
    carry = 0;
  }

  // Propagate overflows
  var carry = 0;
  for (var i = 1; i < this.length; i++) {
    var w = this.words[i] + carry;
    this.words[i] = w & 0x3ffffff;
    carry = w >>> 26;
  }

  return this.strip();
};

BN.prototype.imuln = function imuln(num) {
  assert(typeof num === 'number');

  // Carry
  var carry = 0;
  for (var i = 0; i < this.length; i++) {
    var w = this.words[i] * num;
    var lo = (w & 0x3ffffff) + (carry & 0x3ffffff);
    carry >>= 26;
    carry += (w / 0x4000000) | 0;
    // NOTE: lo is 27bit maximum
    carry += lo >>> 26;
    this.words[i] = lo & 0x3ffffff;
  }

  if (carry !== 0) {
    this.words[i] = carry;
    this.length++;
  }

  return this;
};

BN.prototype.muln = function muln(num) {
  return this.clone().imuln(num);
};

// `this` * `this`
BN.prototype.sqr = function sqr() {
  return this.mul(this);
};

// `this` * `this` in-place
BN.prototype.isqr = function isqr() {
  return this.mul(this);
};

// Shift-left in-place
BN.prototype.ishln = function ishln(bits) {
  assert(typeof bits === 'number' && bits >= 0);
  var r = bits % 26;
  var s = (bits - r) / 26;
  var carryMask = (0x3ffffff >>> (26 - r)) << (26 - r);

  if (r !== 0) {
    var carry = 0;
    for (var i = 0; i < this.length; i++) {
      var newCarry = this.words[i] & carryMask;
      var c = (this.words[i] - newCarry) << r;
      this.words[i] = c | carry;
      carry = newCarry >>> (26 - r);
    }
    if (carry) {
      this.words[i] = carry;
      this.length++;
    }
  }

  if (s !== 0) {
    for (var i = this.length - 1; i >= 0; i--)
      this.words[i + s] = this.words[i];
    for (var i = 0; i < s; i++)
      this.words[i] = 0;
    this.length += s;
  }

  return this.strip();
};

// Shift-right in-place
// NOTE: `hint` is a lowest bit before trailing zeroes
// NOTE: if `extended` is present - it will be filled with destroyed bits
BN.prototype.ishrn = function ishrn(bits, hint, extended) {
  assert(typeof bits === 'number' && bits >= 0);
  var h;
  if (hint)
    h = (hint - (hint % 26)) / 26;
  else
    h = 0;

  var r = bits % 26;
  var s = Math.min((bits - r) / 26, this.length);
  var mask = 0x3ffffff ^ ((0x3ffffff >>> r) << r);
  var maskedWords = extended;

  h -= s;
  h = Math.max(0, h);

  // Extended mode, copy masked part
  if (maskedWords) {
    for (var i = 0; i < s; i++)
      maskedWords.words[i] = this.words[i];
    maskedWords.length = s;
  }

  if (s === 0) {
    // No-op, we should not move anything at all
  } else if (this.length > s) {
    this.length -= s;
    for (var i = 0; i < this.length; i++)
      this.words[i] = this.words[i + s];
  } else {
    this.words[0] = 0;
    this.length = 1;
  }

  var carry = 0;
  for (var i = this.length - 1; i >= 0 && (carry !== 0 || i >= h); i--) {
    var word = this.words[i];
    this.words[i] = (carry << (26 - r)) | (word >>> r);
    carry = word & mask;
  }

  // Push carried bits as a mask
  if (maskedWords && carry !== 0)
    maskedWords.words[maskedWords.length++] = carry;

  if (this.length === 0) {
    this.words[0] = 0;
    this.length = 1;
  }

  this.strip();

  return this;
};

// Shift-left
BN.prototype.shln = function shln(bits) {
  return this.clone().ishln(bits);
};

// Shift-right
BN.prototype.shrn = function shrn(bits) {
  return this.clone().ishrn(bits);
};

// Test if n bit is set
BN.prototype.testn = function testn(bit) {
  assert(typeof bit === 'number' && bit >= 0);
  var r = bit % 26;
  var s = (bit - r) / 26;
  var q = 1 << r;

  // Fast case: bit is much higher than all existing words
  if (this.length <= s) {
    return false;
  }

  // Check bit and return
  var w = this.words[s];

  return !!(w & q);
};

// Return only lowers bits of number (in-place)
BN.prototype.imaskn = function imaskn(bits) {
  assert(typeof bits === 'number' && bits >= 0);
  var r = bits % 26;
  var s = (bits - r) / 26;

  assert(!this.sign, 'imaskn works only with positive numbers');

  if (r !== 0)
    s++;
  this.length = Math.min(s, this.length);

  if (r !== 0) {
    var mask = 0x3ffffff ^ ((0x3ffffff >>> r) << r);
    this.words[this.length - 1] &= mask;
  }

  return this.strip();
};

// Return only lowers bits of number
BN.prototype.maskn = function maskn(bits) {
  return this.clone().imaskn(bits);
};

// Add plain number `num` to `this`
BN.prototype.iaddn = function iaddn(num) {
  assert(typeof num === 'number');
  if (num < 0)
    return this.isubn(-num);

  // Possible sign change
  if (this.sign) {
    if (this.length === 1 && this.words[0] < num) {
      this.words[0] = num - this.words[0];
      this.sign = false;
      return this;
    }

    this.sign = false;
    this.isubn(num);
    this.sign = true;
    return this;
  }

  // Add without checks
  return this._iaddn(num);
};

BN.prototype._iaddn = function _iaddn(num) {
  this.words[0] += num;

  // Carry
  for (var i = 0; i < this.length && this.words[i] >= 0x4000000; i++) {
    this.words[i] -= 0x4000000;
    if (i === this.length - 1)
      this.words[i + 1] = 1;
    else
      this.words[i + 1]++;
  }
  this.length = Math.max(this.length, i + 1);

  return this;
};

// Subtract plain number `num` from `this`
BN.prototype.isubn = function isubn(num) {
  assert(typeof num === 'number');
  if (num < 0)
    return this.iaddn(-num);

  if (this.sign) {
    this.sign = false;
    this.iaddn(num);
    this.sign = true;
    return this;
  }

  this.words[0] -= num;

  // Carry
  for (var i = 0; i < this.length && this.words[i] < 0; i++) {
    this.words[i] += 0x4000000;
    this.words[i + 1] -= 1;
  }

  return this.strip();
};

BN.prototype.addn = function addn(num) {
  return this.clone().iaddn(num);
};

BN.prototype.subn = function subn(num) {
  return this.clone().isubn(num);
};

BN.prototype.iabs = function iabs() {
  this.sign = false;

  return this;
};

BN.prototype.abs = function abs() {
  return this.clone().iabs();
};

BN.prototype._ishlnsubmul = function _ishlnsubmul(num, mul, shift) {
  // Bigger storage is needed
  var len = num.length + shift;
  var i;
  if (this.words.length < len) {
    var t = new Array(len);
    for (var i = 0; i < this.length; i++)
      t[i] = this.words[i];
    this.words = t;
  } else {
    i = this.length;
  }

  // Zeroify rest
  this.length = Math.max(this.length, len);
  for (; i < this.length; i++)
    this.words[i] = 0;

  var carry = 0;
  for (var i = 0; i < num.length; i++) {
    var w = this.words[i + shift] + carry;
    var right = num.words[i] * mul;
    w -= right & 0x3ffffff;
    carry = (w >> 26) - ((right / 0x4000000) | 0);
    this.words[i + shift] = w & 0x3ffffff;
  }
  for (; i < this.length - shift; i++) {
    var w = this.words[i + shift] + carry;
    carry = w >> 26;
    this.words[i + shift] = w & 0x3ffffff;
  }

  if (carry === 0)
    return this.strip();

  // Subtraction overflow
  assert(carry === -1);
  carry = 0;
  for (var i = 0; i < this.length; i++) {
    var w = -this.words[i] + carry;
    carry = w >> 26;
    this.words[i] = w & 0x3ffffff;
  }
  this.sign = true;

  return this.strip();
};

BN.prototype._wordDiv = function _wordDiv(num, mode) {
  var shift = this.length - num.length;

  var a = this.clone();
  var b = num;

  // Normalize
  var bhi = b.words[b.length - 1];
  var bhiBits = this._countBits(bhi);
  shift = 26 - bhiBits;
  if (shift !== 0) {
    b = b.shln(shift);
    a.ishln(shift);
    bhi = b.words[b.length - 1];
  }

  // Initialize quotient
  var m = a.length - b.length;
  var q;

  if (mode !== 'mod') {
    q = new BN(null);
    q.length = m + 1;
    q.words = new Array(q.length);
    for (var i = 0; i < q.length; i++)
      q.words[i] = 0;
  }

  var diff = a.clone()._ishlnsubmul(b, 1, m);
  if (!diff.sign) {
    a = diff;
    if (q)
      q.words[m] = 1;
  }

  for (var j = m - 1; j >= 0; j--) {
    var qj = a.words[b.length + j] * 0x4000000 + a.words[b.length + j - 1];

    // NOTE: (qj / bhi) is (0x3ffffff * 0x4000000 + 0x3ffffff) / 0x2000000 max
    // (0x7ffffff)
    qj = Math.min((qj / bhi) | 0, 0x3ffffff);

    a._ishlnsubmul(b, qj, j);
    while (a.sign) {
      qj--;
      a.sign = false;
      a._ishlnsubmul(b, 1, j);
      if (a.cmpn(0) !== 0)
        a.sign = !a.sign;
    }
    if (q)
      q.words[j] = qj;
  }
  if (q)
    q.strip();
  a.strip();

  // Denormalize
  if (mode !== 'div' && shift !== 0)
    a.ishrn(shift);
  return { div: q ? q : null, mod: a };
};

BN.prototype.divmod = function divmod(num, mode) {
  assert(num.cmpn(0) !== 0);

  if (this.sign && !num.sign) {
    var res = this.neg().divmod(num, mode);
    var div;
    var mod;
    if (mode !== 'mod')
      div = res.div.neg();
    if (mode !== 'div')
      mod = res.mod.cmpn(0) === 0 ? res.mod : num.sub(res.mod);
    return {
      div: div,
      mod: mod
    };
  } else if (!this.sign && num.sign) {
    var res = this.divmod(num.neg(), mode);
    var div;
    if (mode !== 'mod')
      div = res.div.neg();
    return { div: div, mod: res.mod };
  } else if (this.sign && num.sign) {
    return this.neg().divmod(num.neg(), mode);
  }

  // Both numbers are positive at this point

  // Strip both numbers to approximate shift value
  if (num.length > this.length || this.cmp(num) < 0)
    return { div: new BN(0), mod: this };

  // Very short reduction
  if (num.length === 1) {
    if (mode === 'div')
      return { div: this.divn(num.words[0]), mod: null };
    else if (mode === 'mod')
      return { div: null, mod: new BN(this.modn(num.words[0])) };
    return {
      div: this.divn(num.words[0]),
      mod: new BN(this.modn(num.words[0]))
    };
  }

  return this._wordDiv(num, mode);
};

// Find `this` / `num`
BN.prototype.div = function div(num) {
  return this.divmod(num, 'div').div;
};

// Find `this` % `num`
BN.prototype.mod = function mod(num) {
  return this.divmod(num, 'mod').mod;
};

// Find Round(`this` / `num`)
BN.prototype.divRound = function divRound(num) {
  var dm = this.divmod(num);

  // Fast case - exact division
  if (dm.mod.cmpn(0) === 0)
    return dm.div;

  var mod = dm.div.sign ? dm.mod.isub(num) : dm.mod;

  var half = num.shrn(1);
  var r2 = num.andln(1);
  var cmp = mod.cmp(half);

  // Round down
  if (cmp < 0 || r2 === 1 && cmp === 0)
    return dm.div;

  // Round up
  return dm.div.sign ? dm.div.isubn(1) : dm.div.iaddn(1);
};

BN.prototype.modn = function modn(num) {
  assert(num <= 0x3ffffff);
  var p = (1 << 26) % num;

  var acc = 0;
  for (var i = this.length - 1; i >= 0; i--)
    acc = (p * acc + this.words[i]) % num;

  return acc;
};

// In-place division by number
BN.prototype.idivn = function idivn(num) {
  assert(num <= 0x3ffffff);

  var carry = 0;
  for (var i = this.length - 1; i >= 0; i--) {
    var w = this.words[i] + carry * 0x4000000;
    this.words[i] = (w / num) | 0;
    carry = w % num;
  }

  return this.strip();
};

BN.prototype.divn = function divn(num) {
  return this.clone().idivn(num);
};

BN.prototype.egcd = function egcd(p) {
  assert(!p.sign);
  assert(p.cmpn(0) !== 0);

  var x = this;
  var y = p.clone();

  if (x.sign)
    x = x.mod(p);
  else
    x = x.clone();

  // A * x + B * y = x
  var A = new BN(1);
  var B = new BN(0);

  // C * x + D * y = y
  var C = new BN(0);
  var D = new BN(1);

  var g = 0;

  while (x.isEven() && y.isEven()) {
    x.ishrn(1);
    y.ishrn(1);
    ++g;
  }

  var yp = y.clone();
  var xp = x.clone();

  while (x.cmpn(0) !== 0) {
    while (x.isEven()) {
      x.ishrn(1);
      if (A.isEven() && B.isEven()) {
        A.ishrn(1);
        B.ishrn(1);
      } else {
        A.iadd(yp).ishrn(1);
        B.isub(xp).ishrn(1);
      }
    }

    while (y.isEven()) {
      y.ishrn(1);
      if (C.isEven() && D.isEven()) {
        C.ishrn(1);
        D.ishrn(1);
      } else {
        C.iadd(yp).ishrn(1);
        D.isub(xp).ishrn(1);
      }
    }

    if (x.cmp(y) >= 0) {
      x.isub(y);
      A.isub(C);
      B.isub(D);
    } else {
      y.isub(x);
      C.isub(A);
      D.isub(B);
    }
  }

  return {
    a: C,
    b: D,
    gcd: y.ishln(g)
  };
};

// This is reduced incarnation of the binary EEA
// above, designated to invert members of the
// _prime_ fields F(p) at a maximal speed
BN.prototype._invmp = function _invmp(p) {
  assert(!p.sign);
  assert(p.cmpn(0) !== 0);

  var a = this;
  var b = p.clone();

  if (a.sign)
    a = a.mod(p);
  else
    a = a.clone();

  var x1 = new BN(1);
  var x2 = new BN(0);

  var delta = b.clone();

  while (a.cmpn(1) > 0 && b.cmpn(1) > 0) {
    while (a.isEven()) {
      a.ishrn(1);
      if (x1.isEven())
        x1.ishrn(1);
      else
        x1.iadd(delta).ishrn(1);
    }
    while (b.isEven()) {
      b.ishrn(1);
      if (x2.isEven())
        x2.ishrn(1);
      else
        x2.iadd(delta).ishrn(1);
    }
    if (a.cmp(b) >= 0) {
      a.isub(b);
      x1.isub(x2);
    } else {
      b.isub(a);
      x2.isub(x1);
    }
  }
  if (a.cmpn(1) === 0)
    return x1;
  else
    return x2;
};

BN.prototype.gcd = function gcd(num) {
  if (this.cmpn(0) === 0)
    return num.clone();
  if (num.cmpn(0) === 0)
    return this.clone();

  var a = this.clone();
  var b = num.clone();
  a.sign = false;
  b.sign = false;

  // Remove common factor of two
  for (var shift = 0; a.isEven() && b.isEven(); shift++) {
    a.ishrn(1);
    b.ishrn(1);
  }

  do {
    while (a.isEven())
      a.ishrn(1);
    while (b.isEven())
      b.ishrn(1);

    var r = a.cmp(b);
    if (r < 0) {
      // Swap `a` and `b` to make `a` always bigger than `b`
      var t = a;
      a = b;
      b = t;
    } else if (r === 0 || b.cmpn(1) === 0) {
      break;
    }

    a.isub(b);
  } while (true);

  return b.ishln(shift);
};

// Invert number in the field F(num)
BN.prototype.invm = function invm(num) {
  return this.egcd(num).a.mod(num);
};

BN.prototype.isEven = function isEven() {
  return (this.words[0] & 1) === 0;
};

BN.prototype.isOdd = function isOdd() {
  return (this.words[0] & 1) === 1;
};

// And first word and num
BN.prototype.andln = function andln(num) {
  return this.words[0] & num;
};

// Increment at the bit position in-line
BN.prototype.bincn = function bincn(bit) {
  assert(typeof bit === 'number');
  var r = bit % 26;
  var s = (bit - r) / 26;
  var q = 1 << r;

  // Fast case: bit is much higher than all existing words
  if (this.length <= s) {
    for (var i = this.length; i < s + 1; i++)
      this.words[i] = 0;
    this.words[s] |= q;
    this.length = s + 1;
    return this;
  }

  // Add bit and propagate, if needed
  var carry = q;
  for (var i = s; carry !== 0 && i < this.length; i++) {
    var w = this.words[i];
    w += carry;
    carry = w >>> 26;
    w &= 0x3ffffff;
    this.words[i] = w;
  }
  if (carry !== 0) {
    this.words[i] = carry;
    this.length++;
  }
  return this;
};

BN.prototype.cmpn = function cmpn(num) {
  var sign = num < 0;
  if (sign)
    num = -num;

  if (this.sign && !sign)
    return -1;
  else if (!this.sign && sign)
    return 1;

  num &= 0x3ffffff;
  this.strip();

  var res;
  if (this.length > 1) {
    res = 1;
  } else {
    var w = this.words[0];
    res = w === num ? 0 : w < num ? -1 : 1;
  }
  if (this.sign)
    res = -res;
  return res;
};

// Compare two numbers and return:
// 1 - if `this` > `num`
// 0 - if `this` == `num`
// -1 - if `this` < `num`
BN.prototype.cmp = function cmp(num) {
  if (this.sign && !num.sign)
    return -1;
  else if (!this.sign && num.sign)
    return 1;

  var res = this.ucmp(num);
  if (this.sign)
    return -res;
  else
    return res;
};

// Unsigned comparison
BN.prototype.ucmp = function ucmp(num) {
  // At this point both numbers have the same sign
  if (this.length > num.length)
    return 1;
  else if (this.length < num.length)
    return -1;

  var res = 0;
  for (var i = this.length - 1; i >= 0; i--) {
    var a = this.words[i];
    var b = num.words[i];

    if (a === b)
      continue;
    if (a < b)
      res = -1;
    else if (a > b)
      res = 1;
    break;
  }
  return res;
};

//
// A reduce context, could be using montgomery or something better, depending
// on the `m` itself.
//
BN.red = function red(num) {
  return new Red(num);
};

BN.prototype.toRed = function toRed(ctx) {
  assert(!this.red, 'Already a number in reduction context');
  assert(!this.sign, 'red works only with positives');
  return ctx.convertTo(this)._forceRed(ctx);
};

BN.prototype.fromRed = function fromRed() {
  assert(this.red, 'fromRed works only with numbers in reduction context');
  return this.red.convertFrom(this);
};

BN.prototype._forceRed = function _forceRed(ctx) {
  this.red = ctx;
  return this;
};

BN.prototype.forceRed = function forceRed(ctx) {
  assert(!this.red, 'Already a number in reduction context');
  return this._forceRed(ctx);
};

BN.prototype.redAdd = function redAdd(num) {
  assert(this.red, 'redAdd works only with red numbers');
  return this.red.add(this, num);
};

BN.prototype.redIAdd = function redIAdd(num) {
  assert(this.red, 'redIAdd works only with red numbers');
  return this.red.iadd(this, num);
};

BN.prototype.redSub = function redSub(num) {
  assert(this.red, 'redSub works only with red numbers');
  return this.red.sub(this, num);
};

BN.prototype.redISub = function redISub(num) {
  assert(this.red, 'redISub works only with red numbers');
  return this.red.isub(this, num);
};

BN.prototype.redShl = function redShl(num) {
  assert(this.red, 'redShl works only with red numbers');
  return this.red.shl(this, num);
};

BN.prototype.redMul = function redMul(num) {
  assert(this.red, 'redMul works only with red numbers');
  this.red._verify2(this, num);
  return this.red.mul(this, num);
};

BN.prototype.redIMul = function redIMul(num) {
  assert(this.red, 'redMul works only with red numbers');
  this.red._verify2(this, num);
  return this.red.imul(this, num);
};

BN.prototype.redSqr = function redSqr() {
  assert(this.red, 'redSqr works only with red numbers');
  this.red._verify1(this);
  return this.red.sqr(this);
};

BN.prototype.redISqr = function redISqr() {
  assert(this.red, 'redISqr works only with red numbers');
  this.red._verify1(this);
  return this.red.isqr(this);
};

// Square root over p
BN.prototype.redSqrt = function redSqrt() {
  assert(this.red, 'redSqrt works only with red numbers');
  this.red._verify1(this);
  return this.red.sqrt(this);
};

BN.prototype.redInvm = function redInvm() {
  assert(this.red, 'redInvm works only with red numbers');
  this.red._verify1(this);
  return this.red.invm(this);
};

// Return negative clone of `this` % `red modulo`
BN.prototype.redNeg = function redNeg() {
  assert(this.red, 'redNeg works only with red numbers');
  this.red._verify1(this);
  return this.red.neg(this);
};

BN.prototype.redPow = function redPow(num) {
  assert(this.red && !num.red, 'redPow(normalNum)');
  this.red._verify1(this);
  return this.red.pow(this, num);
};

// Prime numbers with efficient reduction
var primes = {
  k256: null,
  p224: null,
  p192: null,
  p25519: null
};

// Pseudo-Mersenne prime
function MPrime(name, p) {
  // P = 2 ^ N - K
  this.name = name;
  this.p = new BN(p, 16);
  this.n = this.p.bitLength();
  this.k = new BN(1).ishln(this.n).isub(this.p);

  this.tmp = this._tmp();
}

MPrime.prototype._tmp = function _tmp() {
  var tmp = new BN(null);
  tmp.words = new Array(Math.ceil(this.n / 13));
  return tmp;
};

MPrime.prototype.ireduce = function ireduce(num) {
  // Assumes that `num` is less than `P^2`
  // num = HI * (2 ^ N - K) + HI * K + LO = HI * K + LO (mod P)
  var r = num;
  var rlen;

  do {
    this.split(r, this.tmp);
    r = this.imulK(r);
    r = r.iadd(this.tmp);
    rlen = r.bitLength();
  } while (rlen > this.n);

  var cmp = rlen < this.n ? -1 : r.ucmp(this.p);
  if (cmp === 0) {
    r.words[0] = 0;
    r.length = 1;
  } else if (cmp > 0) {
    r.isub(this.p);
  } else {
    r.strip();
  }

  return r;
};

MPrime.prototype.split = function split(input, out) {
  input.ishrn(this.n, 0, out);
};

MPrime.prototype.imulK = function imulK(num) {
  return num.imul(this.k);
};

function K256() {
  MPrime.call(
    this,
    'k256',
    'ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffe fffffc2f');
}
inherits(K256, MPrime);

K256.prototype.split = function split(input, output) {
  // 256 = 9 * 26 + 22
  var mask = 0x3fffff;

  var outLen = Math.min(input.length, 9);
  for (var i = 0; i < outLen; i++)
    output.words[i] = input.words[i];
  output.length = outLen;

  if (input.length <= 9) {
    input.words[0] = 0;
    input.length = 1;
    return;
  }

  // Shift by 9 limbs
  var prev = input.words[9];
  output.words[output.length++] = prev & mask;

  for (var i = 10; i < input.length; i++) {
    var next = input.words[i];
    input.words[i - 10] = ((next & mask) << 4) | (prev >>> 22);
    prev = next;
  }
  input.words[i - 10] = prev >>> 22;
  input.length -= 9;
};

K256.prototype.imulK = function imulK(num) {
  // K = 0x1000003d1 = [ 0x40, 0x3d1 ]
  num.words[num.length] = 0;
  num.words[num.length + 1] = 0;
  num.length += 2;

  // bounded at: 0x40 * 0x3ffffff + 0x3d0 = 0x100000390
  var hi;
  var lo = 0;
  for (var i = 0; i < num.length; i++) {
    var w = num.words[i];
    hi = w * 0x40;
    lo += w * 0x3d1;
    hi += (lo / 0x4000000) | 0;
    lo &= 0x3ffffff;

    num.words[i] = lo;

    lo = hi;
  }

  // Fast length reduction
  if (num.words[num.length - 1] === 0) {
    num.length--;
    if (num.words[num.length - 1] === 0)
      num.length--;
  }
  return num;
};

function P224() {
  MPrime.call(
    this,
    'p224',
    'ffffffff ffffffff ffffffff ffffffff 00000000 00000000 00000001');
}
inherits(P224, MPrime);

function P192() {
  MPrime.call(
    this,
    'p192',
    'ffffffff ffffffff ffffffff fffffffe ffffffff ffffffff');
}
inherits(P192, MPrime);

function P25519() {
  // 2 ^ 255 - 19
  MPrime.call(
    this,
    '25519',
    '7fffffffffffffff ffffffffffffffff ffffffffffffffff ffffffffffffffed');
}
inherits(P25519, MPrime);

P25519.prototype.imulK = function imulK(num) {
  // K = 0x13
  var carry = 0;
  for (var i = 0; i < num.length; i++) {
    var hi = num.words[i] * 0x13 + carry;
    var lo = hi & 0x3ffffff;
    hi >>>= 26;

    num.words[i] = lo;
    carry = hi;
  }
  if (carry !== 0)
    num.words[num.length++] = carry;
  return num;
};

// Exported mostly for testing purposes, use plain name instead
BN._prime = function prime(name) {
  // Cached version of prime
  if (primes[name])
    return primes[name];

  var prime;
  if (name === 'k256')
    prime = new K256();
  else if (name === 'p224')
    prime = new P224();
  else if (name === 'p192')
    prime = new P192();
  else if (name === 'p25519')
    prime = new P25519();
  else
    throw new Error('Unknown prime ' + name);
  primes[name] = prime;

  return prime;
};

//
// Base reduction engine
//
function Red(m) {
  if (typeof m === 'string') {
    var prime = BN._prime(m);
    this.m = prime.p;
    this.prime = prime;
  } else {
    this.m = m;
    this.prime = null;
  }
}

Red.prototype._verify1 = function _verify1(a) {
  assert(!a.sign, 'red works only with positives');
  assert(a.red, 'red works only with red numbers');
};

Red.prototype._verify2 = function _verify2(a, b) {
  assert(!a.sign && !b.sign, 'red works only with positives');
  assert(a.red && a.red === b.red,
         'red works only with red numbers');
};

Red.prototype.imod = function imod(a) {
  if (this.prime)
    return this.prime.ireduce(a)._forceRed(this);
  return a.mod(this.m)._forceRed(this);
};

Red.prototype.neg = function neg(a) {
  var r = a.clone();
  r.sign = !r.sign;
  return r.iadd(this.m)._forceRed(this);
};

Red.prototype.add = function add(a, b) {
  this._verify2(a, b);

  var res = a.add(b);
  if (res.cmp(this.m) >= 0)
    res.isub(this.m);
  return res._forceRed(this);
};

Red.prototype.iadd = function iadd(a, b) {
  this._verify2(a, b);

  var res = a.iadd(b);
  if (res.cmp(this.m) >= 0)
    res.isub(this.m);
  return res;
};

Red.prototype.sub = function sub(a, b) {
  this._verify2(a, b);

  var res = a.sub(b);
  if (res.cmpn(0) < 0)
    res.iadd(this.m);
  return res._forceRed(this);
};

Red.prototype.isub = function isub(a, b) {
  this._verify2(a, b);

  var res = a.isub(b);
  if (res.cmpn(0) < 0)
    res.iadd(this.m);
  return res;
};

Red.prototype.shl = function shl(a, num) {
  this._verify1(a);
  return this.imod(a.shln(num));
};

Red.prototype.imul = function imul(a, b) {
  this._verify2(a, b);
  return this.imod(a.imul(b));
};

Red.prototype.mul = function mul(a, b) {
  this._verify2(a, b);
  return this.imod(a.mul(b));
};

Red.prototype.isqr = function isqr(a) {
  return this.imul(a, a);
};

Red.prototype.sqr = function sqr(a) {
  return this.mul(a, a);
};

Red.prototype.sqrt = function sqrt(a) {
  if (a.cmpn(0) === 0)
    return a.clone();

  var mod3 = this.m.andln(3);
  assert(mod3 % 2 === 1);

  // Fast case
  if (mod3 === 3) {
    var pow = this.m.add(new BN(1)).ishrn(2);
    var r = this.pow(a, pow);
    return r;
  }

  // Tonelli-Shanks algorithm (Totally unoptimized and slow)
  //
  // Find Q and S, that Q * 2 ^ S = (P - 1)
  var q = this.m.subn(1);
  var s = 0;
  while (q.cmpn(0) !== 0 && q.andln(1) === 0) {
    s++;
    q.ishrn(1);
  }
  assert(q.cmpn(0) !== 0);

  var one = new BN(1).toRed(this);
  var nOne = one.redNeg();

  // Find quadratic non-residue
  // NOTE: Max is such because of generalized Riemann hypothesis.
  var lpow = this.m.subn(1).ishrn(1);
  var z = this.m.bitLength();
  z = new BN(2 * z * z).toRed(this);
  while (this.pow(z, lpow).cmp(nOne) !== 0)
    z.redIAdd(nOne);

  var c = this.pow(z, q);
  var r = this.pow(a, q.addn(1).ishrn(1));
  var t = this.pow(a, q);
  var m = s;
  while (t.cmp(one) !== 0) {
    var tmp = t;
    for (var i = 0; tmp.cmp(one) !== 0; i++)
      tmp = tmp.redSqr();
    assert(i < m);
    var b = this.pow(c, new BN(1).ishln(m - i - 1));

    r = r.redMul(b);
    c = b.redSqr();
    t = t.redMul(c);
    m = i;
  }

  return r;
};

Red.prototype.invm = function invm(a) {
  var inv = a._invmp(this.m);
  if (inv.sign) {
    inv.sign = false;
    return this.imod(inv).redNeg();
  } else {
    return this.imod(inv);
  }
};

Red.prototype.pow = function pow(a, num) {
  var w = [];

  if (num.cmpn(0) === 0)
    return new BN(1);

  var q = num.clone();

  while (q.cmpn(0) !== 0) {
    w.push(q.andln(1));
    q.ishrn(1);
  }

  // Skip leading zeroes
  var res = a;
  for (var i = 0; i < w.length; i++, res = this.sqr(res))
    if (w[i] !== 0)
      break;

  if (++i < w.length) {
    for (var q = this.sqr(res); i < w.length; i++, q = this.sqr(q)) {
      if (w[i] === 0)
        continue;
      res = this.mul(res, q);
    }
  }

  return res;
};

Red.prototype.convertTo = function convertTo(num) {
  var r = num.mod(this.m);
  if (r === num)
    return r.clone();
  else
    return r;
};

Red.prototype.convertFrom = function convertFrom(num) {
  var res = num.clone();
  res.red = null;
  return res;
};

//
// Montgomery method engine
//

BN.mont = function mont(num) {
  return new Mont(num);
};

function Mont(m) {
  Red.call(this, m);

  this.shift = this.m.bitLength();
  if (this.shift % 26 !== 0)
    this.shift += 26 - (this.shift % 26);
  this.r = new BN(1).ishln(this.shift);
  this.r2 = this.imod(this.r.sqr());
  this.rinv = this.r._invmp(this.m);

  this.minv = this.rinv.mul(this.r).isubn(1).div(this.m);
  this.minv.sign = true;
  this.minv = this.minv.mod(this.r);
}
inherits(Mont, Red);

Mont.prototype.convertTo = function convertTo(num) {
  return this.imod(num.shln(this.shift));
};

Mont.prototype.convertFrom = function convertFrom(num) {
  var r = this.imod(num.mul(this.rinv));
  r.red = null;
  return r;
};

Mont.prototype.imul = function imul(a, b) {
  if (a.cmpn(0) === 0 || b.cmpn(0) === 0) {
    a.words[0] = 0;
    a.length = 1;
    return a;
  }

  var t = a.imul(b);
  var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
  var u = t.isub(c).ishrn(this.shift);
  var res = u;
  if (u.cmp(this.m) >= 0)
    res = u.isub(this.m);
  else if (u.cmpn(0) < 0)
    res = u.iadd(this.m);

  return res._forceRed(this);
};

Mont.prototype.mul = function mul(a, b) {
  if (a.cmpn(0) === 0 || b.cmpn(0) === 0)
    return new BN(0)._forceRed(this);

  var t = a.mul(b);
  var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
  var u = t.isub(c).ishrn(this.shift);
  var res = u;
  if (u.cmp(this.m) >= 0)
    res = u.isub(this.m);
  else if (u.cmpn(0) < 0)
    res = u.iadd(this.m);

  return res._forceRed(this);
};

Mont.prototype.invm = function invm(a) {
  // (AR)^-1 * R^2 = (A^-1 * R^-1) * R^2 = A^-1 * R
  var res = this.imod(a._invmp(this.m).mul(this.r2));
  return res._forceRed(this);
};

})(typeof module === 'undefined' || module, this);

},{}],57:[function(require,module,exports){
(function (Buffer){
var hasTypedArrays = false
if(typeof Float64Array !== "undefined") {
  var DOUBLE_VIEW = new Float64Array(1)
    , UINT_VIEW   = new Uint32Array(DOUBLE_VIEW.buffer)
  DOUBLE_VIEW[0] = 1.0
  hasTypedArrays = true
  if(UINT_VIEW[1] === 0x3ff00000) {
    //Use little endian
    module.exports = function doubleBitsLE(n) {
      DOUBLE_VIEW[0] = n
      return [ UINT_VIEW[0], UINT_VIEW[1] ]
    }
    function toDoubleLE(lo, hi) {
      UINT_VIEW[0] = lo
      UINT_VIEW[1] = hi
      return DOUBLE_VIEW[0]
    }
    module.exports.pack = toDoubleLE
    function lowUintLE(n) {
      DOUBLE_VIEW[0] = n
      return UINT_VIEW[0]
    }
    module.exports.lo = lowUintLE
    function highUintLE(n) {
      DOUBLE_VIEW[0] = n
      return UINT_VIEW[1]
    }
    module.exports.hi = highUintLE
  } else if(UINT_VIEW[0] === 0x3ff00000) {
    //Use big endian
    module.exports = function doubleBitsBE(n) {
      DOUBLE_VIEW[0] = n
      return [ UINT_VIEW[1], UINT_VIEW[0] ]
    }
    function toDoubleBE(lo, hi) {
      UINT_VIEW[1] = lo
      UINT_VIEW[0] = hi
      return DOUBLE_VIEW[0]
    }
    module.exports.pack = toDoubleBE
    function lowUintBE(n) {
      DOUBLE_VIEW[0] = n
      return UINT_VIEW[1]
    }
    module.exports.lo = lowUintBE
    function highUintBE(n) {
      DOUBLE_VIEW[0] = n
      return UINT_VIEW[0]
    }
    module.exports.hi = highUintBE
  } else {
    hasTypedArrays = false
  }
}
if(!hasTypedArrays) {
  var buffer = new Buffer(8)
  module.exports = function doubleBits(n) {
    buffer.writeDoubleLE(n, 0, true)
    return [ buffer.readUInt32LE(0, true), buffer.readUInt32LE(4, true) ]
  }
  function toDouble(lo, hi) {
    buffer.writeUInt32LE(lo, 0, true)
    buffer.writeUInt32LE(hi, 4, true)
    return buffer.readDoubleLE(0, true)
  }
  module.exports.pack = toDouble
  function lowUint(n) {
    buffer.writeDoubleLE(n, 0, true)
    return buffer.readUInt32LE(0, true)
  }
  module.exports.lo = lowUint
  function highUint(n) {
    buffer.writeDoubleLE(n, 0, true)
    return buffer.readUInt32LE(4, true)
  }
  module.exports.hi = highUint
}

module.exports.sign = function(n) {
  return module.exports.hi(n) >>> 31
}

module.exports.exponent = function(n) {
  var b = module.exports.hi(n)
  return ((b<<1) >>> 21) - 1023
}

module.exports.fraction = function(n) {
  var lo = module.exports.lo(n)
  var hi = module.exports.hi(n)
  var b = hi & ((1<<20) - 1)
  if(hi & 0x7ff00000) {
    b += (1<<20)
  }
  return [lo, b]
}

module.exports.denormalized = function(n) {
  var hi = module.exports.hi(n)
  return !(hi & 0x7ff00000)
}
}).call(this,require("buffer").Buffer)
},{"buffer":1}],58:[function(require,module,exports){
'use strict'

var bnsign = require('./lib/bn-sign')

module.exports = sign

function sign(x) {
  return bnsign(x[0]) * bnsign(x[1])
}

},{"./lib/bn-sign":47}],59:[function(require,module,exports){
'use strict'

var rationalize = require('./lib/rationalize')

module.exports = sub

function sub(a, b) {
  return rationalize(a[0].mul(b[1]).sub(a[1].mul(b[0])), a[1].mul(b[1]))
}

},{"./lib/rationalize":52}],60:[function(require,module,exports){
'use strict'

var bn2num = require('./lib/bn-to-num')
var ctz = require('./lib/ctz')

module.exports = roundRat

//Round a rational to the closest float
function roundRat(f) {
  var a = f[0]
  var b = f[1]
  if(a.cmpn(0) === 0) {
    return 0
  }
  var h = a.divmod(b)
  var iv = h.div
  var x = bn2num(iv)
  var ir = h.mod
  if(ir.cmpn(0) === 0) {
    return x
  }
  if(x) {
    var s = ctz(x) + 4
    var y = bn2num(ir.shln(s).divRound(b))

    // flip the sign of y if x is negative
    if (x<0) {
      y = -y;
    }

    return x + y * Math.pow(2, -s)
  } else {
    var ybits = b.bitLength() - ir.bitLength() + 53
    var y = bn2num(ir.shln(ybits).divRound(b))
    if(ybits < 1023) {
      return y * Math.pow(2, -ybits)
    }
    y *= Math.pow(2, -1023)
    return y * Math.pow(2, 1023-ybits)
  }
}

},{"./lib/bn-to-num":48,"./lib/ctz":49}],61:[function(require,module,exports){
'use strict'

module.exports = boxIntersectWrapper

var pool = require('typedarray-pool')
var sweep = require('./lib/sweep')
var boxIntersectIter = require('./lib/intersect')

function boxEmpty(d, box) {
  for(var j=0; j<d; ++j) {
    if(!(box[j] <= box[j+d])) {
      return true
    }
  }
  return false
}

//Unpack boxes into a flat typed array, remove empty boxes
function convertBoxes(boxes, d, data, ids) {
  var ptr = 0
  var count = 0
  for(var i=0, n=boxes.length; i<n; ++i) {
    var b = boxes[i]
    if(boxEmpty(d, b)) {
      continue
    }
    for(var j=0; j<2*d; ++j) {
      data[ptr++] = b[j]
    }
    ids[count++] = i
  }
  return count
}

//Perform type conversions, check bounds
function boxIntersect(red, blue, visit, full) {
  var n = red.length
  var m = blue.length

  //If either array is empty, then we can skip this whole thing
  if(n <= 0 || m <= 0) {
    return
  }

  //Compute dimension, if it is 0 then we skip
  var d = (red[0].length)>>>1
  if(d <= 0) {
    return
  }

  var retval

  //Convert red boxes
  var redList  = pool.mallocDouble(2*d*n)
  var redIds   = pool.mallocInt32(n)
  n = convertBoxes(red, d, redList, redIds)

  if(n > 0) {
    if(d === 1 && full) {
      //Special case: 1d complete
      sweep.init(n)
      retval = sweep.sweepComplete(
        d, visit,
        0, n, redList, redIds,
        0, n, redList, redIds)
    } else {

      //Convert blue boxes
      var blueList = pool.mallocDouble(2*d*m)
      var blueIds  = pool.mallocInt32(m)
      m = convertBoxes(blue, d, blueList, blueIds)

      if(m > 0) {
        sweep.init(n+m)

        if(d === 1) {
          //Special case: 1d bipartite
          retval = sweep.sweepBipartite(
            d, visit,
            0, n, redList,  redIds,
            0, m, blueList, blueIds)
        } else {
          //General case:  d>1
          retval = boxIntersectIter(
            d, visit,    full,
            n, redList,  redIds,
            m, blueList, blueIds)
        }

        pool.free(blueList)
        pool.free(blueIds)
      }
    }

    pool.free(redList)
    pool.free(redIds)
  }

  return retval
}


var RESULT

function appendItem(i,j) {
  RESULT.push([i,j])
}

function intersectFullArray(x) {
  RESULT = []
  boxIntersect(x, x, appendItem, true)
  return RESULT
}

function intersectBipartiteArray(x, y) {
  RESULT = []
  boxIntersect(x, y, appendItem, false)
  return RESULT
}

//User-friendly wrapper, handle full input and no-visitor cases
function boxIntersectWrapper(arg0, arg1, arg2) {
  var result
  switch(arguments.length) {
    case 1:
      return intersectFullArray(arg0)
    case 2:
      if(typeof arg1 === 'function') {
        return boxIntersect(arg0, arg0, arg1, true)
      } else {
        return intersectBipartiteArray(arg0, arg1)
      }
    case 3:
      return boxIntersect(arg0, arg1, arg2, false)
    default:
      throw new Error('box-intersect: Invalid arguments')
  }
}
},{"./lib/intersect":63,"./lib/sweep":67,"typedarray-pool":70}],62:[function(require,module,exports){
'use strict'

var DIMENSION   = 'd'
var AXIS        = 'ax'
var VISIT       = 'vv'
var FLIP        = 'fp'

var ELEM_SIZE   = 'es'

var RED_START   = 'rs'
var RED_END     = 're'
var RED_BOXES   = 'rb'
var RED_INDEX   = 'ri'
var RED_PTR     = 'rp'

var BLUE_START  = 'bs'
var BLUE_END    = 'be'
var BLUE_BOXES  = 'bb'
var BLUE_INDEX  = 'bi'
var BLUE_PTR    = 'bp'

var RETVAL      = 'rv'

var INNER_LABEL = 'Q'

var ARGS = [
  DIMENSION,
  AXIS,
  VISIT,
  RED_START,
  RED_END,
  RED_BOXES,
  RED_INDEX,
  BLUE_START,
  BLUE_END,
  BLUE_BOXES,
  BLUE_INDEX
]

function generateBruteForce(redMajor, flip, full) {
  var funcName = 'bruteForce' +
    (redMajor ? 'Red' : 'Blue') +
    (flip ? 'Flip' : '') +
    (full ? 'Full' : '')

  var code = ['function ', funcName, '(', ARGS.join(), '){',
    'var ', ELEM_SIZE, '=2*', DIMENSION, ';']

  var redLoop =
    'for(var i=' + RED_START + ',' + RED_PTR + '=' + ELEM_SIZE + '*' + RED_START + ';' +
        'i<' + RED_END +';' +
        '++i,' + RED_PTR + '+=' + ELEM_SIZE + '){' +
        'var x0=' + RED_BOXES + '[' + AXIS + '+' + RED_PTR + '],' +
            'x1=' + RED_BOXES + '[' + AXIS + '+' + RED_PTR + '+' + DIMENSION + '],' +
            'xi=' + RED_INDEX + '[i];'

  var blueLoop =
    'for(var j=' + BLUE_START + ',' + BLUE_PTR + '=' + ELEM_SIZE + '*' + BLUE_START + ';' +
        'j<' + BLUE_END + ';' +
        '++j,' + BLUE_PTR + '+=' + ELEM_SIZE + '){' +
        'var y0=' + BLUE_BOXES + '[' + AXIS + '+' + BLUE_PTR + '],' +
            (full ? 'y1=' + BLUE_BOXES + '[' + AXIS + '+' + BLUE_PTR + '+' + DIMENSION + '],' : '') +
            'yi=' + BLUE_INDEX + '[j];'

  if(redMajor) {
    code.push(redLoop, INNER_LABEL, ':', blueLoop)
  } else {
    code.push(blueLoop, INNER_LABEL, ':', redLoop)
  }

  if(full) {
    code.push('if(y1<x0||x1<y0)continue;')
  } else if(flip) {
    code.push('if(y0<=x0||x1<y0)continue;')
  } else {
    code.push('if(y0<x0||x1<y0)continue;')
  }

  code.push('for(var k='+AXIS+'+1;k<'+DIMENSION+';++k){'+
    'var r0='+RED_BOXES+'[k+'+RED_PTR+'],'+
        'r1='+RED_BOXES+'[k+'+DIMENSION+'+'+RED_PTR+'],'+
        'b0='+BLUE_BOXES+'[k+'+BLUE_PTR+'],'+
        'b1='+BLUE_BOXES+'[k+'+DIMENSION+'+'+BLUE_PTR+'];'+
      'if(r1<b0||b1<r0)continue ' + INNER_LABEL + ';}' +
      'var ' + RETVAL + '=' + VISIT + '(')

  if(flip) {
    code.push('yi,xi')
  } else {
    code.push('xi,yi')
  }

  code.push(');if(' + RETVAL + '!==void 0)return ' + RETVAL + ';}}}')

  return {
    name: funcName,
    code: code.join('')
  }
}

function bruteForcePlanner(full) {
  var funcName = 'bruteForce' + (full ? 'Full' : 'Partial')
  var prefix = []
  var fargs = ARGS.slice()
  if(!full) {
    fargs.splice(3, 0, FLIP)
  }

  var code = ['function ' + funcName + '(' + fargs.join() + '){']

  function invoke(redMajor, flip) {
    var res = generateBruteForce(redMajor, flip, full)
    prefix.push(res.code)
    code.push('return ' + res.name + '(' + ARGS.join() + ');')
  }

  code.push('if(' + RED_END + '-' + RED_START + '>' +
                    BLUE_END + '-' + BLUE_START + '){')

  if(full) {
    invoke(true, false)
    code.push('}else{')
    invoke(false, false)
  } else {
    code.push('if(' + FLIP + '){')
    invoke(true, true)
    code.push('}else{')
    invoke(true, false)
    code.push('}}else{if(' + FLIP + '){')
    invoke(false, true)
    code.push('}else{')
    invoke(false, false)
    code.push('}')
  }
  code.push('}}return ' + funcName)

  var codeStr = prefix.join('') + code.join('')
  var proc = new Function(codeStr)
  return proc()
}


exports.partial = bruteForcePlanner(false)
exports.full    = bruteForcePlanner(true)
},{}],63:[function(require,module,exports){
'use strict'

module.exports = boxIntersectIter

var pool = require('typedarray-pool')
var bits = require('bit-twiddle')
var bruteForce = require('./brute')
var bruteForcePartial = bruteForce.partial
var bruteForceFull = bruteForce.full
var sweep = require('./sweep')
var findMedian = require('./median')
var genPartition = require('./partition')

//Twiddle parameters
var BRUTE_FORCE_CUTOFF    = 128       //Cut off for brute force search
var SCAN_CUTOFF           = (1<<22)   //Cut off for two way scan
var SCAN_COMPLETE_CUTOFF  = (1<<22)

//Partition functions
var partitionInteriorContainsInterval = genPartition(
  '!(lo>=p0)&&!(p1>=hi)',
  ['p0', 'p1'])

var partitionStartEqual = genPartition(
  'lo===p0',
  ['p0'])

var partitionStartLessThan = genPartition(
  'lo<p0',
  ['p0'])

var partitionEndLessThanEqual = genPartition(
  'hi<=p0',
  ['p0'])

var partitionContainsPoint = genPartition(
  'lo<=p0&&p0<=hi',
  ['p0'])

var partitionContainsPointProper = genPartition(
  'lo<p0&&p0<=hi',
  ['p0'])

//Frame size for iterative loop
var IFRAME_SIZE = 6
var DFRAME_SIZE = 2

//Data for box statck
var INIT_CAPACITY = 1024
var BOX_ISTACK  = pool.mallocInt32(INIT_CAPACITY)
var BOX_DSTACK  = pool.mallocDouble(INIT_CAPACITY)

//Initialize iterative loop queue
function iterInit(d, count) {
  var levels = (8 * bits.log2(count+1) * (d+1))|0
  var maxInts = bits.nextPow2(IFRAME_SIZE*levels)
  if(BOX_ISTACK.length < maxInts) {
    pool.free(BOX_ISTACK)
    BOX_ISTACK = pool.mallocInt32(maxInts)
  }
  var maxDoubles = bits.nextPow2(DFRAME_SIZE*levels)
  if(BOX_DSTACK < maxDoubles) {
    pool.free(BOX_DSTACK)
    BOX_DSTACK = pool.mallocDouble(maxDoubles)
  }
}

//Append item to queue
function iterPush(ptr,
  axis,
  redStart, redEnd,
  blueStart, blueEnd,
  state,
  lo, hi) {

  var iptr = IFRAME_SIZE * ptr
  BOX_ISTACK[iptr]   = axis
  BOX_ISTACK[iptr+1] = redStart
  BOX_ISTACK[iptr+2] = redEnd
  BOX_ISTACK[iptr+3] = blueStart
  BOX_ISTACK[iptr+4] = blueEnd
  BOX_ISTACK[iptr+5] = state

  var dptr = DFRAME_SIZE * ptr
  BOX_DSTACK[dptr]   = lo
  BOX_DSTACK[dptr+1] = hi
}

//Special case:  Intersect single point with list of intervals
function onePointPartial(
  d, axis, visit, flip,
  redStart, redEnd, red, redIndex,
  blueOffset, blue, blueId) {

  var elemSize = 2 * d
  var bluePtr  = blueOffset * elemSize
  var blueX    = blue[bluePtr + axis]

red_loop:
  for(var i=redStart, redPtr=redStart*elemSize; i<redEnd; ++i, redPtr+=elemSize) {
    var r0 = red[redPtr+axis]
    var r1 = red[redPtr+axis+d]
    if(blueX < r0 || r1 < blueX) {
      continue
    }
    if(flip && blueX === r0) {
      continue
    }
    var redId = redIndex[i]
    for(var j=axis+1; j<d; ++j) {
      var r0 = red[redPtr+j]
      var r1 = red[redPtr+j+d]
      var b0 = blue[bluePtr+j]
      var b1 = blue[bluePtr+j+d]
      if(r1 < b0 || b1 < r0) {
        continue red_loop
      }
    }
    var retval
    if(flip) {
      retval = visit(blueId, redId)
    } else {
      retval = visit(redId, blueId)
    }
    if(retval !== void 0) {
      return retval
    }
  }
}

//Special case:  Intersect one point with list of intervals
function onePointFull(
  d, axis, visit,
  redStart, redEnd, red, redIndex,
  blueOffset, blue, blueId) {

  var elemSize = 2 * d
  var bluePtr  = blueOffset * elemSize
  var blueX    = blue[bluePtr + axis]

red_loop:
  for(var i=redStart, redPtr=redStart*elemSize; i<redEnd; ++i, redPtr+=elemSize) {
    var redId = redIndex[i]
    if(redId === blueId) {
      continue
    }
    var r0 = red[redPtr+axis]
    var r1 = red[redPtr+axis+d]
    if(blueX < r0 || r1 < blueX) {
      continue
    }
    for(var j=axis+1; j<d; ++j) {
      var r0 = red[redPtr+j]
      var r1 = red[redPtr+j+d]
      var b0 = blue[bluePtr+j]
      var b1 = blue[bluePtr+j+d]
      if(r1 < b0 || b1 < r0) {
        continue red_loop
      }
    }
    var retval = visit(redId, blueId)
    if(retval !== void 0) {
      return retval
    }
  }
}

//The main box intersection routine
function boxIntersectIter(
  d, visit, initFull,
  xSize, xBoxes, xIndex,
  ySize, yBoxes, yIndex) {

  //Reserve memory for stack
  iterInit(d, xSize + ySize)

  var top  = 0
  var elemSize = 2 * d
  var retval

  iterPush(top++,
      0,
      0, xSize,
      0, ySize,
      initFull ? 16 : 0,
      -Infinity, Infinity)
  if(!initFull) {
    iterPush(top++,
      0,
      0, ySize,
      0, xSize,
      1,
      -Infinity, Infinity)
  }

  while(top > 0) {
    top  -= 1

    var iptr = top * IFRAME_SIZE
    var axis      = BOX_ISTACK[iptr]
    var redStart  = BOX_ISTACK[iptr+1]
    var redEnd    = BOX_ISTACK[iptr+2]
    var blueStart = BOX_ISTACK[iptr+3]
    var blueEnd   = BOX_ISTACK[iptr+4]
    var state     = BOX_ISTACK[iptr+5]

    var dptr = top * DFRAME_SIZE
    var lo        = BOX_DSTACK[dptr]
    var hi        = BOX_DSTACK[dptr+1]

    //Unpack state info
    var flip      = (state & 1)
    var full      = !!(state & 16)

    //Unpack indices
    var red       = xBoxes
    var redIndex  = xIndex
    var blue      = yBoxes
    var blueIndex = yIndex
    if(flip) {
      red         = yBoxes
      redIndex    = yIndex
      blue        = xBoxes
      blueIndex   = xIndex
    }

    if(state & 2) {
      redEnd = partitionStartLessThan(
        d, axis,
        redStart, redEnd, red, redIndex,
        hi)
      if(redStart >= redEnd) {
        continue
      }
    }
    if(state & 4) {
      redStart = partitionEndLessThanEqual(
        d, axis,
        redStart, redEnd, red, redIndex,
        lo)
      if(redStart >= redEnd) {
        continue
      }
    }

    var redCount  = redEnd  - redStart
    var blueCount = blueEnd - blueStart

    if(full) {
      if(d * redCount * (redCount + blueCount) < SCAN_COMPLETE_CUTOFF) {
        retval = sweep.scanComplete(
          d, axis, visit,
          redStart, redEnd, red, redIndex,
          blueStart, blueEnd, blue, blueIndex)
        if(retval !== void 0) {
          return retval
        }
        continue
      }
    } else {
      if(d * Math.min(redCount, blueCount) < BRUTE_FORCE_CUTOFF) {
        //If input small, then use brute force
        retval = bruteForcePartial(
            d, axis, visit, flip,
            redStart,  redEnd,  red,  redIndex,
            blueStart, blueEnd, blue, blueIndex)
        if(retval !== void 0) {
          return retval
        }
        continue
      } else if(d * redCount * blueCount < SCAN_CUTOFF) {
        //If input medium sized, then use sweep and prune
        retval = sweep.scanBipartite(
          d, axis, visit, flip,
          redStart, redEnd, red, redIndex,
          blueStart, blueEnd, blue, blueIndex)
        if(retval !== void 0) {
          return retval
        }
        continue
      }
    }

    //First, find all red intervals whose interior contains (lo,hi)
    var red0 = partitionInteriorContainsInterval(
      d, axis,
      redStart, redEnd, red, redIndex,
      lo, hi)

    //Lower dimensional case
    if(redStart < red0) {

      if(d * (red0 - redStart) < BRUTE_FORCE_CUTOFF) {
        //Special case for small inputs: use brute force
        retval = bruteForceFull(
          d, axis+1, visit,
          redStart, red0, red, redIndex,
          blueStart, blueEnd, blue, blueIndex)
        if(retval !== void 0) {
          return retval
        }
      } else if(axis === d-2) {
        if(flip) {
          retval = sweep.sweepBipartite(
            d, visit,
            blueStart, blueEnd, blue, blueIndex,
            redStart, red0, red, redIndex)
        } else {
          retval = sweep.sweepBipartite(
            d, visit,
            redStart, red0, red, redIndex,
            blueStart, blueEnd, blue, blueIndex)
        }
        if(retval !== void 0) {
          return retval
        }
      } else {
        iterPush(top++,
          axis+1,
          redStart, red0,
          blueStart, blueEnd,
          flip,
          -Infinity, Infinity)
        iterPush(top++,
          axis+1,
          blueStart, blueEnd,
          redStart, red0,
          flip^1,
          -Infinity, Infinity)
      }
    }

    //Divide and conquer phase
    if(red0 < redEnd) {

      //Cut blue into 3 parts:
      //
      //  Points < mid point
      //  Points = mid point
      //  Points > mid point
      //
      var blue0 = findMedian(
        d, axis,
        blueStart, blueEnd, blue, blueIndex)
      var mid = blue[elemSize * blue0 + axis]
      var blue1 = partitionStartEqual(
        d, axis,
        blue0, blueEnd, blue, blueIndex,
        mid)

      //Right case
      if(blue1 < blueEnd) {
        iterPush(top++,
          axis,
          red0, redEnd,
          blue1, blueEnd,
          (flip|4) + (full ? 16 : 0),
          mid, hi)
      }

      //Left case
      if(blueStart < blue0) {
        iterPush(top++,
          axis,
          red0, redEnd,
          blueStart, blue0,
          (flip|2) + (full ? 16 : 0),
          lo, mid)
      }

      //Center case (the hard part)
      if(blue0 + 1 === blue1) {
        //Optimization: Range with exactly 1 point, use a brute force scan
        if(full) {
          retval = onePointFull(
            d, axis, visit,
            red0, redEnd, red, redIndex,
            blue0, blue, blueIndex[blue0])
        } else {
          retval = onePointPartial(
            d, axis, visit, flip,
            red0, redEnd, red, redIndex,
            blue0, blue, blueIndex[blue0])
        }
        if(retval !== void 0) {
          return retval
        }
      } else if(blue0 < blue1) {
        var red1
        if(full) {
          //If full intersection, need to handle special case
          red1 = partitionContainsPoint(
            d, axis,
            red0, redEnd, red, redIndex,
            mid)
          if(red0 < red1) {
            var redX = partitionStartEqual(
              d, axis,
              red0, red1, red, redIndex,
              mid)
            if(axis === d-2) {
              //Degenerate sweep intersection:
              //  [red0, redX] with [blue0, blue1]
              if(red0 < redX) {
                retval = sweep.sweepComplete(
                  d, visit,
                  red0, redX, red, redIndex,
                  blue0, blue1, blue, blueIndex)
                if(retval !== void 0) {
                  return retval
                }
              }

              //Normal sweep intersection:
              //  [redX, red1] with [blue0, blue1]
              if(redX < red1) {
                retval = sweep.sweepBipartite(
                  d, visit,
                  redX, red1, red, redIndex,
                  blue0, blue1, blue, blueIndex)
                if(retval !== void 0) {
                  return retval
                }
              }
            } else {
              if(red0 < redX) {
                iterPush(top++,
                  axis+1,
                  red0, redX,
                  blue0, blue1,
                  16,
                  -Infinity, Infinity)
              }
              if(redX < red1) {
                iterPush(top++,
                  axis+1,
                  redX, red1,
                  blue0, blue1,
                  0,
                  -Infinity, Infinity)
                iterPush(top++,
                  axis+1,
                  blue0, blue1,
                  redX, red1,
                  1,
                  -Infinity, Infinity)
              }
            }
          }
        } else {
          if(flip) {
            red1 = partitionContainsPointProper(
              d, axis,
              red0, redEnd, red, redIndex,
              mid)
          } else {
            red1 = partitionContainsPoint(
              d, axis,
              red0, redEnd, red, redIndex,
              mid)
          }
          if(red0 < red1) {
            if(axis === d-2) {
              if(flip) {
                retval = sweep.sweepBipartite(
                  d, visit,
                  blue0, blue1, blue, blueIndex,
                  red0, red1, red, redIndex)
              } else {
                retval = sweep.sweepBipartite(
                  d, visit,
                  red0, red1, red, redIndex,
                  blue0, blue1, blue, blueIndex)
              }
            } else {
              iterPush(top++,
                axis+1,
                red0, red1,
                blue0, blue1,
                flip,
                -Infinity, Infinity)
              iterPush(top++,
                axis+1,
                blue0, blue1,
                red0, red1,
                flip^1,
                -Infinity, Infinity)
            }
          }
        }
      }
    }
  }
}
},{"./brute":62,"./median":64,"./partition":65,"./sweep":67,"bit-twiddle":68,"typedarray-pool":70}],64:[function(require,module,exports){
'use strict'

module.exports = findMedian

var genPartition = require('./partition')

var partitionStartLessThan = genPartition('lo<p0', ['p0'])

var PARTITION_THRESHOLD = 8   //Cut off for using insertion sort in findMedian

//Base case for median finding:  Use insertion sort
function insertionSort(d, axis, start, end, boxes, ids) {
  var elemSize = 2 * d
  var boxPtr = elemSize * (start+1) + axis
  for(var i=start+1; i<end; ++i, boxPtr+=elemSize) {
    var x = boxes[boxPtr]
    for(var j=i, ptr=elemSize*(i-1);
        j>start && boxes[ptr+axis] > x;
        --j, ptr-=elemSize) {
      //Swap
      var aPtr = ptr
      var bPtr = ptr+elemSize
      for(var k=0; k<elemSize; ++k, ++aPtr, ++bPtr) {
        var y = boxes[aPtr]
        boxes[aPtr] = boxes[bPtr]
        boxes[bPtr] = y
      }
      var tmp = ids[j]
      ids[j] = ids[j-1]
      ids[j-1] = tmp
    }
  }
}

//Find median using quick select algorithm
//  takes O(n) time with high probability
function findMedian(d, axis, start, end, boxes, ids) {
  if(end <= start+1) {
    return start
  }

  var lo       = start
  var hi       = end
  var mid      = ((end + start) >>> 1)
  var elemSize = 2*d
  var pivot    = mid
  var value    = boxes[elemSize*mid+axis]

  while(lo < hi) {
    if(hi - lo < PARTITION_THRESHOLD) {
      insertionSort(d, axis, lo, hi, boxes, ids)
      value = boxes[elemSize*mid+axis]
      break
    }

    //Select pivot using median-of-3
    var count  = hi - lo
    var pivot0 = (Math.random()*count+lo)|0
    var value0 = boxes[elemSize*pivot0 + axis]
    var pivot1 = (Math.random()*count+lo)|0
    var value1 = boxes[elemSize*pivot1 + axis]
    var pivot2 = (Math.random()*count+lo)|0
    var value2 = boxes[elemSize*pivot2 + axis]
    if(value0 <= value1) {
      if(value2 >= value1) {
        pivot = pivot1
        value = value1
      } else if(value0 >= value2) {
        pivot = pivot0
        value = value0
      } else {
        pivot = pivot2
        value = value2
      }
    } else {
      if(value1 >= value2) {
        pivot = pivot1
        value = value1
      } else if(value2 >= value0) {
        pivot = pivot0
        value = value0
      } else {
        pivot = pivot2
        value = value2
      }
    }

    //Swap pivot to end of array
    var aPtr = elemSize * (hi-1)
    var bPtr = elemSize * pivot
    for(var i=0; i<elemSize; ++i, ++aPtr, ++bPtr) {
      var x = boxes[aPtr]
      boxes[aPtr] = boxes[bPtr]
      boxes[bPtr] = x
    }
    var y = ids[hi-1]
    ids[hi-1] = ids[pivot]
    ids[pivot] = y

    //Partition using pivot
    pivot = partitionStartLessThan(
      d, axis,
      lo, hi-1, boxes, ids,
      value)

    //Swap pivot back
    var aPtr = elemSize * (hi-1)
    var bPtr = elemSize * pivot
    for(var i=0; i<elemSize; ++i, ++aPtr, ++bPtr) {
      var x = boxes[aPtr]
      boxes[aPtr] = boxes[bPtr]
      boxes[bPtr] = x
    }
    var y = ids[hi-1]
    ids[hi-1] = ids[pivot]
    ids[pivot] = y

    //Swap pivot to last pivot
    if(mid < pivot) {
      hi = pivot-1
      while(lo < hi &&
        boxes[elemSize*(hi-1)+axis] === value) {
        hi -= 1
      }
      hi += 1
    } else if(pivot < mid) {
      lo = pivot + 1
      while(lo < hi &&
        boxes[elemSize*lo+axis] === value) {
        lo += 1
      }
    } else {
      break
    }
  }

  //Make sure pivot is at start
  return partitionStartLessThan(
    d, axis,
    start, mid, boxes, ids,
    boxes[elemSize*mid+axis])
}
},{"./partition":65}],65:[function(require,module,exports){
'use strict'

module.exports = genPartition

var code = 'for(var j=2*a,k=j*c,l=k,m=c,n=b,o=a+b,p=c;d>p;++p,k+=j){var _;if($)if(m===p)m+=1,l+=j;else{for(var s=0;j>s;++s){var t=e[k+s];e[k+s]=e[l],e[l++]=t}var u=f[p];f[p]=f[m],f[m++]=u}}return m'

function genPartition(predicate, args) {
  var fargs ='abcdef'.split('').concat(args)
  var reads = []
  if(predicate.indexOf('lo') >= 0) {
    reads.push('lo=e[k+n]')
  }
  if(predicate.indexOf('hi') >= 0) {
    reads.push('hi=e[k+o]')
  }
  fargs.push(
    code.replace('_', reads.join())
        .replace('$', predicate))
  return Function.apply(void 0, fargs)
}
},{}],66:[function(require,module,exports){
'use strict';

//This code is extracted from ndarray-sort
//It is inlined here as a temporary workaround

module.exports = wrapper;

var INSERT_SORT_CUTOFF = 32

function wrapper(data, n0) {
  if (n0 <= 4*INSERT_SORT_CUTOFF) {
    insertionSort(0, n0 - 1, data);
  } else {
    quickSort(0, n0 - 1, data);
  }
}

function insertionSort(left, right, data) {
  var ptr = 2*(left+1)
  for(var i=left+1; i<=right; ++i) {
    var a = data[ptr++]
    var b = data[ptr++]
    var j = i
    var jptr = ptr-2
    while(j-- > left) {
      var x = data[jptr-2]
      var y = data[jptr-1]
      if(x < a) {
        break
      } else if(x === a && y < b) {
        break
      }
      data[jptr]   = x
      data[jptr+1] = y
      jptr -= 2
    }
    data[jptr]   = a
    data[jptr+1] = b
  }
}

function swap(i, j, data) {
  i *= 2
  j *= 2
  var x = data[i]
  var y = data[i+1]
  data[i] = data[j]
  data[i+1] = data[j+1]
  data[j] = x
  data[j+1] = y
}

function move(i, j, data) {
  i *= 2
  j *= 2
  data[i] = data[j]
  data[i+1] = data[j+1]
}

function rotate(i, j, k, data) {
  i *= 2
  j *= 2
  k *= 2
  var x = data[i]
  var y = data[i+1]
  data[i] = data[j]
  data[i+1] = data[j+1]
  data[j] = data[k]
  data[j+1] = data[k+1]
  data[k] = x
  data[k+1] = y
}

function shufflePivot(i, j, px, py, data) {
  i *= 2
  j *= 2
  data[i] = data[j]
  data[j] = px
  data[i+1] = data[j+1]
  data[j+1] = py
}

function compare(i, j, data) {
  i *= 2
  j *= 2
  var x = data[i],
      y = data[j]
  if(x < y) {
    return false
  } else if(x === y) {
    return data[i+1] > data[j+1]
  }
  return true
}

function comparePivot(i, y, b, data) {
  i *= 2
  var x = data[i]
  if(x < y) {
    return true
  } else if(x === y) {
    return data[i+1] < b
  }
  return false
}

function quickSort(left, right, data) {
  var sixth = (right - left + 1) / 6 | 0,
      index1 = left + sixth,
      index5 = right - sixth,
      index3 = left + right >> 1,
      index2 = index3 - sixth,
      index4 = index3 + sixth,
      el1 = index1,
      el2 = index2,
      el3 = index3,
      el4 = index4,
      el5 = index5,
      less = left + 1,
      great = right - 1,
      tmp = 0
  if(compare(el1, el2, data)) {
    tmp = el1
    el1 = el2
    el2 = tmp
  }
  if(compare(el4, el5, data)) {
    tmp = el4
    el4 = el5
    el5 = tmp
  }
  if(compare(el1, el3, data)) {
    tmp = el1
    el1 = el3
    el3 = tmp
  }
  if(compare(el2, el3, data)) {
    tmp = el2
    el2 = el3
    el3 = tmp
  }
  if(compare(el1, el4, data)) {
    tmp = el1
    el1 = el4
    el4 = tmp
  }
  if(compare(el3, el4, data)) {
    tmp = el3
    el3 = el4
    el4 = tmp
  }
  if(compare(el2, el5, data)) {
    tmp = el2
    el2 = el5
    el5 = tmp
  }
  if(compare(el2, el3, data)) {
    tmp = el2
    el2 = el3
    el3 = tmp
  }
  if(compare(el4, el5, data)) {
    tmp = el4
    el4 = el5
    el5 = tmp
  }

  var pivot1X = data[2*el2]
  var pivot1Y = data[2*el2+1]
  var pivot2X = data[2*el4]
  var pivot2Y = data[2*el4+1]

  var ptr0 = 2 * el1;
  var ptr2 = 2 * el3;
  var ptr4 = 2 * el5;
  var ptr5 = 2 * index1;
  var ptr6 = 2 * index3;
  var ptr7 = 2 * index5;
  for (var i1 = 0; i1 < 2; ++i1) {
    var x = data[ptr0+i1];
    var y = data[ptr2+i1];
    var z = data[ptr4+i1];
    data[ptr5+i1] = x;
    data[ptr6+i1] = y;
    data[ptr7+i1] = z;
  }

  move(index2, left, data)
  move(index4, right, data)
  for (var k = less; k <= great; ++k) {
    if (comparePivot(k, pivot1X, pivot1Y, data)) {
      if (k !== less) {
        swap(k, less, data)
      }
      ++less;
    } else {
      if (!comparePivot(k, pivot2X, pivot2Y, data)) {
        while (true) {
          if (!comparePivot(great, pivot2X, pivot2Y, data)) {
            if (--great < k) {
              break;
            }
            continue;
          } else {
            if (comparePivot(great, pivot1X, pivot1Y, data)) {
              rotate(k, less, great, data)
              ++less;
              --great;
            } else {
              swap(k, great, data)
              --great;
            }
            break;
          }
        }
      }
    }
  }
  shufflePivot(left, less-1, pivot1X, pivot1Y, data)
  shufflePivot(right, great+1, pivot2X, pivot2Y, data)
  if (less - 2 - left <= INSERT_SORT_CUTOFF) {
    insertionSort(left, less - 2, data);
  } else {
    quickSort(left, less - 2, data);
  }
  if (right - (great + 2) <= INSERT_SORT_CUTOFF) {
    insertionSort(great + 2, right, data);
  } else {
    quickSort(great + 2, right, data);
  }
  if (great - less <= INSERT_SORT_CUTOFF) {
    insertionSort(less, great, data);
  } else {
    quickSort(less, great, data);
  }
}
},{}],67:[function(require,module,exports){
'use strict'

module.exports = {
  init:           sqInit,
  sweepBipartite: sweepBipartite,
  sweepComplete:  sweepComplete,
  scanBipartite:  scanBipartite,
  scanComplete:   scanComplete
}

var pool  = require('typedarray-pool')
var bits  = require('bit-twiddle')
var isort = require('./sort')

//Flag for blue
var BLUE_FLAG = (1<<28)

//1D sweep event queue stuff (use pool to save space)
var INIT_CAPACITY      = 1024
var RED_SWEEP_QUEUE    = pool.mallocInt32(INIT_CAPACITY)
var RED_SWEEP_INDEX    = pool.mallocInt32(INIT_CAPACITY)
var BLUE_SWEEP_QUEUE   = pool.mallocInt32(INIT_CAPACITY)
var BLUE_SWEEP_INDEX   = pool.mallocInt32(INIT_CAPACITY)
var COMMON_SWEEP_QUEUE = pool.mallocInt32(INIT_CAPACITY)
var COMMON_SWEEP_INDEX = pool.mallocInt32(INIT_CAPACITY)
var SWEEP_EVENTS       = pool.mallocDouble(INIT_CAPACITY * 8)

//Reserves memory for the 1D sweep data structures
function sqInit(count) {
  var rcount = bits.nextPow2(count)
  if(RED_SWEEP_QUEUE.length < rcount) {
    pool.free(RED_SWEEP_QUEUE)
    RED_SWEEP_QUEUE = pool.mallocInt32(rcount)
  }
  if(RED_SWEEP_INDEX.length < rcount) {
    pool.free(RED_SWEEP_INDEX)
    RED_SWEEP_INDEX = pool.mallocInt32(rcount)
  }
  if(BLUE_SWEEP_QUEUE.length < rcount) {
    pool.free(BLUE_SWEEP_QUEUE)
    BLUE_SWEEP_QUEUE = pool.mallocInt32(rcount)
  }
  if(BLUE_SWEEP_INDEX.length < rcount) {
    pool.free(BLUE_SWEEP_INDEX)
    BLUE_SWEEP_INDEX = pool.mallocInt32(rcount)
  }
  if(COMMON_SWEEP_QUEUE.length < rcount) {
    pool.free(COMMON_SWEEP_QUEUE)
    COMMON_SWEEP_QUEUE = pool.mallocInt32(rcount)
  }
  if(COMMON_SWEEP_INDEX.length < rcount) {
    pool.free(COMMON_SWEEP_INDEX)
    COMMON_SWEEP_INDEX = pool.mallocInt32(rcount)
  }
  var eventLength = 8 * rcount
  if(SWEEP_EVENTS.length < eventLength) {
    pool.free(SWEEP_EVENTS)
    SWEEP_EVENTS = pool.mallocDouble(eventLength)
  }
}

//Remove an item from the active queue in O(1)
function sqPop(queue, index, count, item) {
  var idx = index[item]
  var top = queue[count-1]
  queue[idx] = top
  index[top] = idx
}

//Insert an item into the active queue in O(1)
function sqPush(queue, index, count, item) {
  queue[count] = item
  index[item]  = count
}

//Recursion base case: use 1D sweep algorithm
function sweepBipartite(
    d, visit,
    redStart,  redEnd, red, redIndex,
    blueStart, blueEnd, blue, blueIndex) {

  //store events as pairs [coordinate, idx]
  //
  //  red create:  -(idx+1)
  //  red destroy: idx
  //  blue create: -(idx+BLUE_FLAG)
  //  blue destroy: idx+BLUE_FLAG
  //
  var ptr      = 0
  var elemSize = 2*d
  var istart   = d-1
  var iend     = elemSize-1

  for(var i=redStart; i<redEnd; ++i) {
    var idx = redIndex[i]
    var redOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = red[redOffset+istart]
    SWEEP_EVENTS[ptr++] = -(idx+1)
    SWEEP_EVENTS[ptr++] = red[redOffset+iend]
    SWEEP_EVENTS[ptr++] = idx
  }

  for(var i=blueStart; i<blueEnd; ++i) {
    var idx = blueIndex[i]+BLUE_FLAG
    var blueOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = blue[blueOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
    SWEEP_EVENTS[ptr++] = blue[blueOffset+iend]
    SWEEP_EVENTS[ptr++] = idx
  }

  //process events from left->right
  var n = ptr >>> 1
  isort(SWEEP_EVENTS, n)

  var redActive  = 0
  var blueActive = 0
  for(var i=0; i<n; ++i) {
    var e = SWEEP_EVENTS[2*i+1]|0
    if(e >= BLUE_FLAG) {
      //blue destroy event
      e = (e-BLUE_FLAG)|0
      sqPop(BLUE_SWEEP_QUEUE, BLUE_SWEEP_INDEX, blueActive--, e)
    } else if(e >= 0) {
      //red destroy event
      sqPop(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive--, e)
    } else if(e <= -BLUE_FLAG) {
      //blue create event
      e = (-e-BLUE_FLAG)|0
      for(var j=0; j<redActive; ++j) {
        var retval = visit(RED_SWEEP_QUEUE[j], e)
        if(retval !== void 0) {
          return retval
        }
      }
      sqPush(BLUE_SWEEP_QUEUE, BLUE_SWEEP_INDEX, blueActive++, e)
    } else {
      //red create event
      e = (-e-1)|0
      for(var j=0; j<blueActive; ++j) {
        var retval = visit(e, BLUE_SWEEP_QUEUE[j])
        if(retval !== void 0) {
          return retval
        }
      }
      sqPush(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive++, e)
    }
  }
}

//Complete sweep
function sweepComplete(d, visit,
  redStart, redEnd, red, redIndex,
  blueStart, blueEnd, blue, blueIndex) {

  var ptr      = 0
  var elemSize = 2*d
  var istart   = d-1
  var iend     = elemSize-1

  for(var i=redStart; i<redEnd; ++i) {
    var idx = (redIndex[i]+1)<<1
    var redOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = red[redOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
    SWEEP_EVENTS[ptr++] = red[redOffset+iend]
    SWEEP_EVENTS[ptr++] = idx
  }

  for(var i=blueStart; i<blueEnd; ++i) {
    var idx = (blueIndex[i]+1)<<1
    var blueOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = blue[blueOffset+istart]
    SWEEP_EVENTS[ptr++] = (-idx)|1
    SWEEP_EVENTS[ptr++] = blue[blueOffset+iend]
    SWEEP_EVENTS[ptr++] = idx|1
  }

  //process events from left->right
  var n = ptr >>> 1
  isort(SWEEP_EVENTS, n)

  var redActive    = 0
  var blueActive   = 0
  var commonActive = 0
  for(var i=0; i<n; ++i) {
    var e     = SWEEP_EVENTS[2*i+1]|0
    var color = e&1
    if(i < n-1 && (e>>1) === (SWEEP_EVENTS[2*i+3]>>1)) {
      color = 2
      i += 1
    }

    if(e < 0) {
      //Create event
      var id = -(e>>1) - 1

      //Intersect with common
      for(var j=0; j<commonActive; ++j) {
        var retval = visit(COMMON_SWEEP_QUEUE[j], id)
        if(retval !== void 0) {
          return retval
        }
      }

      if(color !== 0) {
        //Intersect with red
        for(var j=0; j<redActive; ++j) {
          var retval = visit(RED_SWEEP_QUEUE[j], id)
          if(retval !== void 0) {
            return retval
          }
        }
      }

      if(color !== 1) {
        //Intersect with blue
        for(var j=0; j<blueActive; ++j) {
          var retval = visit(BLUE_SWEEP_QUEUE[j], id)
          if(retval !== void 0) {
            return retval
          }
        }
      }

      if(color === 0) {
        //Red
        sqPush(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive++, id)
      } else if(color === 1) {
        //Blue
        sqPush(BLUE_SWEEP_QUEUE, BLUE_SWEEP_INDEX, blueActive++, id)
      } else if(color === 2) {
        //Both
        sqPush(COMMON_SWEEP_QUEUE, COMMON_SWEEP_INDEX, commonActive++, id)
      }
    } else {
      //Destroy event
      var id = (e>>1) - 1
      if(color === 0) {
        //Red
        sqPop(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive--, id)
      } else if(color === 1) {
        //Blue
        sqPop(BLUE_SWEEP_QUEUE, BLUE_SWEEP_INDEX, blueActive--, id)
      } else if(color === 2) {
        //Both
        sqPop(COMMON_SWEEP_QUEUE, COMMON_SWEEP_INDEX, commonActive--, id)
      }
    }
  }
}

//Sweep and prune/scanline algorithm:
//  Scan along axis, detect intersections
//  Brute force all boxes along axis
function scanBipartite(
  d, axis, visit, flip,
  redStart,  redEnd, red, redIndex,
  blueStart, blueEnd, blue, blueIndex) {

  var ptr      = 0
  var elemSize = 2*d
  var istart   = axis
  var iend     = axis+d

  var redShift  = 1
  var blueShift = 1
  if(flip) {
    blueShift = BLUE_FLAG
  } else {
    redShift  = BLUE_FLAG
  }

  for(var i=redStart; i<redEnd; ++i) {
    var idx = i + redShift
    var redOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = red[redOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
    SWEEP_EVENTS[ptr++] = red[redOffset+iend]
    SWEEP_EVENTS[ptr++] = idx
  }
  for(var i=blueStart; i<blueEnd; ++i) {
    var idx = i + blueShift
    var blueOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = blue[blueOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
  }

  //process events from left->right
  var n = ptr >>> 1
  isort(SWEEP_EVENTS, n)

  var redActive    = 0
  for(var i=0; i<n; ++i) {
    var e = SWEEP_EVENTS[2*i+1]|0
    if(e < 0) {
      var idx   = -e
      var isRed = false
      if(idx >= BLUE_FLAG) {
        isRed = !flip
        idx -= BLUE_FLAG
      } else {
        isRed = !!flip
        idx -= 1
      }
      if(isRed) {
        sqPush(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive++, idx)
      } else {
        var blueId  = blueIndex[idx]
        var bluePtr = elemSize * idx

        var b0 = blue[bluePtr+axis+1]
        var b1 = blue[bluePtr+axis+1+d]

red_loop:
        for(var j=0; j<redActive; ++j) {
          var oidx   = RED_SWEEP_QUEUE[j]
          var redPtr = elemSize * oidx

          if(b1 < red[redPtr+axis+1] ||
             red[redPtr+axis+1+d] < b0) {
            continue
          }

          for(var k=axis+2; k<d; ++k) {
            if(blue[bluePtr + k + d] < red[redPtr + k] ||
               red[redPtr + k + d] < blue[bluePtr + k]) {
              continue red_loop
            }
          }

          var redId  = redIndex[oidx]
          var retval
          if(flip) {
            retval = visit(blueId, redId)
          } else {
            retval = visit(redId, blueId)
          }
          if(retval !== void 0) {
            return retval
          }
        }
      }
    } else {
      sqPop(RED_SWEEP_QUEUE, RED_SWEEP_INDEX, redActive--, e - redShift)
    }
  }
}

function scanComplete(
  d, axis, visit,
  redStart,  redEnd, red, redIndex,
  blueStart, blueEnd, blue, blueIndex) {

  var ptr      = 0
  var elemSize = 2*d
  var istart   = axis
  var iend     = axis+d

  for(var i=redStart; i<redEnd; ++i) {
    var idx = i + BLUE_FLAG
    var redOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = red[redOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
    SWEEP_EVENTS[ptr++] = red[redOffset+iend]
    SWEEP_EVENTS[ptr++] = idx
  }
  for(var i=blueStart; i<blueEnd; ++i) {
    var idx = i + 1
    var blueOffset = elemSize*i
    SWEEP_EVENTS[ptr++] = blue[blueOffset+istart]
    SWEEP_EVENTS[ptr++] = -idx
  }

  //process events from left->right
  var n = ptr >>> 1
  isort(SWEEP_EVENTS, n)

  var redActive    = 0
  for(var i=0; i<n; ++i) {
    var e = SWEEP_EVENTS[2*i+1]|0
    if(e < 0) {
      var idx   = -e
      if(idx >= BLUE_FLAG) {
        RED_SWEEP_QUEUE[redActive++] = idx - BLUE_FLAG
      } else {
        idx -= 1
        var blueId  = blueIndex[idx]
        var bluePtr = elemSize * idx

        var b0 = blue[bluePtr+axis+1]
        var b1 = blue[bluePtr+axis+1+d]

red_loop:
        for(var j=0; j<redActive; ++j) {
          var oidx   = RED_SWEEP_QUEUE[j]
          var redId  = redIndex[oidx]

          if(redId === blueId) {
            break
          }

          var redPtr = elemSize * oidx
          if(b1 < red[redPtr+axis+1] ||
            red[redPtr+axis+1+d] < b0) {
            continue
          }
          for(var k=axis+2; k<d; ++k) {
            if(blue[bluePtr + k + d] < red[redPtr + k] ||
               red[redPtr + k + d]   < blue[bluePtr + k]) {
              continue red_loop
            }
          }

          var retval = visit(redId, blueId)
          if(retval !== void 0) {
            return retval
          }
        }
      }
    } else {
      var idx = e - BLUE_FLAG
      for(var j=redActive-1; j>=0; --j) {
        if(RED_SWEEP_QUEUE[j] === idx) {
          for(var k=j+1; k<redActive; ++k) {
            RED_SWEEP_QUEUE[k-1] = RED_SWEEP_QUEUE[k]
          }
          break
        }
      }
      --redActive
    }
  }
}
},{"./sort":66,"bit-twiddle":68,"typedarray-pool":70}],68:[function(require,module,exports){
arguments[4][55][0].apply(exports,arguments)
},{"dup":55}],69:[function(require,module,exports){
"use strict"

function dupe_array(count, value, i) {
  var c = count[i]|0
  if(c <= 0) {
    return []
  }
  var result = new Array(c), j
  if(i === count.length-1) {
    for(j=0; j<c; ++j) {
      result[j] = value
    }
  } else {
    for(j=0; j<c; ++j) {
      result[j] = dupe_array(count, value, i+1)
    }
  }
  return result
}

function dupe_number(count, value) {
  var result, i
  result = new Array(count)
  for(i=0; i<count; ++i) {
    result[i] = value
  }
  return result
}

function dupe(count, value) {
  if(typeof value === "undefined") {
    value = 0
  }
  switch(typeof count) {
    case "number":
      if(count > 0) {
        return dupe_number(count|0, value)
      }
    break
    case "object":
      if(typeof (count.length) === "number") {
        return dupe_array(count, value, 0)
      }
    break
  }
  return []
}

module.exports = dupe
},{}],70:[function(require,module,exports){
(function (global,Buffer){
'use strict'

var bits = require('bit-twiddle')
var dup = require('dup')

//Legacy pool support
if(!global.__TYPEDARRAY_POOL) {
  global.__TYPEDARRAY_POOL = {
      UINT8   : dup([32, 0])
    , UINT16  : dup([32, 0])
    , UINT32  : dup([32, 0])
    , INT8    : dup([32, 0])
    , INT16   : dup([32, 0])
    , INT32   : dup([32, 0])
    , FLOAT   : dup([32, 0])
    , DOUBLE  : dup([32, 0])
    , DATA    : dup([32, 0])
    , UINT8C  : dup([32, 0])
    , BUFFER  : dup([32, 0])
  }
}

var hasUint8C = (typeof Uint8ClampedArray) !== 'undefined'
var POOL = global.__TYPEDARRAY_POOL

//Upgrade pool
if(!POOL.UINT8C) {
  POOL.UINT8C = dup([32, 0])
}
if(!POOL.BUFFER) {
  POOL.BUFFER = dup([32, 0])
}

//New technique: Only allocate from ArrayBufferView and Buffer
var DATA    = POOL.DATA
  , BUFFER  = POOL.BUFFER

exports.free = function free(array) {
  if(Buffer.isBuffer(array)) {
    BUFFER[bits.log2(array.length)].push(array)
  } else {
    if(Object.prototype.toString.call(array) !== '[object ArrayBuffer]') {
      array = array.buffer
    }
    if(!array) {
      return
    }
    var n = array.length || array.byteLength
    var log_n = bits.log2(n)|0
    DATA[log_n].push(array)
  }
}

function freeArrayBuffer(buffer) {
  if(!buffer) {
    return
  }
  var n = buffer.length || buffer.byteLength
  var log_n = bits.log2(n)
  DATA[log_n].push(buffer)
}

function freeTypedArray(array) {
  freeArrayBuffer(array.buffer)
}

exports.freeUint8 =
exports.freeUint16 =
exports.freeUint32 =
exports.freeInt8 =
exports.freeInt16 =
exports.freeInt32 =
exports.freeFloat32 =
exports.freeFloat =
exports.freeFloat64 =
exports.freeDouble =
exports.freeUint8Clamped =
exports.freeDataView = freeTypedArray

exports.freeArrayBuffer = freeArrayBuffer

exports.freeBuffer = function freeBuffer(array) {
  BUFFER[bits.log2(array.length)].push(array)
}

exports.malloc = function malloc(n, dtype) {
  if(dtype === undefined || dtype === 'arraybuffer') {
    return mallocArrayBuffer(n)
  } else {
    switch(dtype) {
      case 'uint8':
        return mallocUint8(n)
      case 'uint16':
        return mallocUint16(n)
      case 'uint32':
        return mallocUint32(n)
      case 'int8':
        return mallocInt8(n)
      case 'int16':
        return mallocInt16(n)
      case 'int32':
        return mallocInt32(n)
      case 'float':
      case 'float32':
        return mallocFloat(n)
      case 'double':
      case 'float64':
        return mallocDouble(n)
      case 'uint8_clamped':
        return mallocUint8Clamped(n)
      case 'buffer':
        return mallocBuffer(n)
      case 'data':
      case 'dataview':
        return mallocDataView(n)

      default:
        return null
    }
  }
  return null
}

function mallocArrayBuffer(n) {
  var n = bits.nextPow2(n)
  var log_n = bits.log2(n)
  var d = DATA[log_n]
  if(d.length > 0) {
    return d.pop()
  }
  return new ArrayBuffer(n)
}
exports.mallocArrayBuffer = mallocArrayBuffer

function mallocUint8(n) {
  return new Uint8Array(mallocArrayBuffer(n), 0, n)
}
exports.mallocUint8 = mallocUint8

function mallocUint16(n) {
  return new Uint16Array(mallocArrayBuffer(2*n), 0, n)
}
exports.mallocUint16 = mallocUint16

function mallocUint32(n) {
  return new Uint32Array(mallocArrayBuffer(4*n), 0, n)
}
exports.mallocUint32 = mallocUint32

function mallocInt8(n) {
  return new Int8Array(mallocArrayBuffer(n), 0, n)
}
exports.mallocInt8 = mallocInt8

function mallocInt16(n) {
  return new Int16Array(mallocArrayBuffer(2*n), 0, n)
}
exports.mallocInt16 = mallocInt16

function mallocInt32(n) {
  return new Int32Array(mallocArrayBuffer(4*n), 0, n)
}
exports.mallocInt32 = mallocInt32

function mallocFloat(n) {
  return new Float32Array(mallocArrayBuffer(4*n), 0, n)
}
exports.mallocFloat32 = exports.mallocFloat = mallocFloat

function mallocDouble(n) {
  return new Float64Array(mallocArrayBuffer(8*n), 0, n)
}
exports.mallocFloat64 = exports.mallocDouble = mallocDouble

function mallocUint8Clamped(n) {
  if(hasUint8C) {
    return new Uint8ClampedArray(mallocArrayBuffer(n), 0, n)
  } else {
    return mallocUint8(n)
  }
}
exports.mallocUint8Clamped = mallocUint8Clamped

function mallocDataView(n) {
  return new DataView(mallocArrayBuffer(n), 0, n)
}
exports.mallocDataView = mallocDataView

function mallocBuffer(n) {
  n = bits.nextPow2(n)
  var log_n = bits.log2(n)
  var cache = BUFFER[log_n]
  if(cache.length > 0) {
    return cache.pop()
  }
  return new Buffer(n)
}
exports.mallocBuffer = mallocBuffer

exports.clearCache = function clearCache() {
  for(var i=0; i<32; ++i) {
    POOL.UINT8[i].length = 0
    POOL.UINT16[i].length = 0
    POOL.UINT32[i].length = 0
    POOL.INT8[i].length = 0
    POOL.INT16[i].length = 0
    POOL.INT32[i].length = 0
    POOL.FLOAT[i].length = 0
    POOL.DOUBLE[i].length = 0
    POOL.UINT8C[i].length = 0
    DATA[i].length = 0
    BUFFER[i].length = 0
  }
}
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer)
},{"bit-twiddle":68,"buffer":1,"dup":69}],71:[function(require,module,exports){
module.exports = compareCells

var min = Math.min

function compareInt(a, b) {
  return a - b
}

function compareCells(a, b) {
  var n = a.length
    , t = a.length - b.length
  if(t) {
    return t
  }
  switch(n) {
    case 0:
      return 0
    case 1:
      return a[0] - b[0]
    case 2:
      return (a[0]+a[1]-b[0]-b[1]) ||
             min(a[0],a[1]) - min(b[0],b[1])
    case 3:
      var l1 = a[0]+a[1]
        , m1 = b[0]+b[1]
      t = l1+a[2] - (m1+b[2])
      if(t) {
        return t
      }
      var l0 = min(a[0], a[1])
        , m0 = min(b[0], b[1])
      return min(l0, a[2]) - min(m0, b[2]) ||
             min(l0+a[2], l1) - min(m0+b[2], m1)
    case 4:
      var aw=a[0], ax=a[1], ay=a[2], az=a[3]
        , bw=b[0], bx=b[1], by=b[2], bz=b[3]
      return (aw+ax+ay+az)-(bw+bx+by+bz) ||
             min(aw,ax,ay,az)-min(bw,bx,by,bz,bw) ||
             min(aw+ax,aw+ay,aw+az,ax+ay,ax+az,ay+az) -
               min(bw+bx,bw+by,bw+bz,bx+by,bx+bz,by+bz) ||
             min(aw+ax+ay,aw+ax+az,aw+ay+az,ax+ay+az) -
               min(bw+bx+by,bw+bx+bz,bw+by+bz,bx+by+bz)
    default:
      var as = a.slice().sort(compareInt)
      var bs = b.slice().sort(compareInt)
      for(var i=0; i<n; ++i) {
        t = as[i] - bs[i]
        if(t) {
          return t
        }
      }
      return 0
  }
}

},{}],72:[function(require,module,exports){
"use strict"

var doubleBits = require("double-bits")

var SMALLEST_DENORM = Math.pow(2, -1074)
var UINT_MAX = (-1)>>>0

module.exports = nextafter

function nextafter(x, y) {
  if(isNaN(x) || isNaN(y)) {
    return NaN
  }
  if(x === y) {
    return x
  }
  if(x === 0) {
    if(y < 0) {
      return -SMALLEST_DENORM
    } else {
      return SMALLEST_DENORM
    }
  }
  var hi = doubleBits.hi(x)
  var lo = doubleBits.lo(x)
  if((y > x) === (x > 0)) {
    if(lo === UINT_MAX) {
      hi += 1
      lo = 0
    } else {
      lo += 1
    }
  } else {
    if(lo === 0) {
      lo = UINT_MAX
      hi -= 1
    } else {
      lo -= 1
    }
  }
  return doubleBits.pack(lo, hi)
}
},{"double-bits":73}],73:[function(require,module,exports){
arguments[4][57][0].apply(exports,arguments)
},{"buffer":1,"dup":57}],74:[function(require,module,exports){
'use strict'

var bnadd = require('big-rat/add')

module.exports = add

function add(a, b) {
  var n = a.length
  var r = new Array(n)
    for(var i=0; i<n; ++i) {
    r[i] = bnadd(a[i], b[i])
  }
  return r
}

},{"big-rat/add":42}],75:[function(require,module,exports){
'use strict'

module.exports = float2rat

var rat = require('big-rat')

function float2rat(v) {
  var result = new Array(v.length)
  for(var i=0; i<v.length; ++i) {
    result[i] = rat(v[i])
  }
  return result
}

},{"big-rat":45}],76:[function(require,module,exports){
'use strict'

var rat = require('big-rat')
var mul = require('big-rat/mul')

module.exports = muls

function muls(a, x) {
  var s = rat(x)
  var n = a.length
  var r = new Array(n)
  for(var i=0; i<n; ++i) {
    r[i] = mul(a[i], s)
  }
  return r
}

},{"big-rat":45,"big-rat/mul":54}],77:[function(require,module,exports){
'use strict'

var bnsub = require('big-rat/sub')

module.exports = sub

function sub(a, b) {
  var n = a.length
  var r = new Array(n)
    for(var i=0; i<n; ++i) {
    r[i] = bnsub(a[i], b[i])
  }
  return r
}

},{"big-rat/sub":59}],78:[function(require,module,exports){
arguments[4][7][0].apply(exports,arguments)
},{"dup":7}],79:[function(require,module,exports){
arguments[4][8][0].apply(exports,arguments)
},{"dup":8,"two-product":82,"two-sum":78}],80:[function(require,module,exports){
arguments[4][9][0].apply(exports,arguments)
},{"dup":9}],81:[function(require,module,exports){
arguments[4][10][0].apply(exports,arguments)
},{"dup":10}],82:[function(require,module,exports){
arguments[4][11][0].apply(exports,arguments)
},{"dup":11}],83:[function(require,module,exports){
arguments[4][12][0].apply(exports,arguments)
},{"dup":12,"robust-scale":79,"robust-subtract":80,"robust-sum":81,"two-product":82}],84:[function(require,module,exports){
"use strict"

module.exports = segmentsIntersect

var orient = require("robust-orientation")[3]

function checkCollinear(a0, a1, b0, b1) {

  for(var d=0; d<2; ++d) {
    var x0 = a0[d]
    var y0 = a1[d]
    var l0 = Math.min(x0, y0)
    var h0 = Math.max(x0, y0)

    var x1 = b0[d]
    var y1 = b1[d]
    var l1 = Math.min(x1, y1)
    var h1 = Math.max(x1, y1)

    if(h1 < l0 || h0 < l1) {
      return false
    }
  }

  return true
}

function segmentsIntersect(a0, a1, b0, b1) {
  var x0 = orient(a0, b0, b1)
  var y0 = orient(a1, b0, b1)
  if((x0 > 0 && y0 > 0) || (x0 < 0 && y0 < 0)) {
    return false
  }

  var x1 = orient(b0, a0, a1)
  var y1 = orient(b1, a0, a1)
  if((x1 > 0 && y1 > 0) || (x1 < 0 && y1 < 0)) {
    return false
  }

  //Check for degenerate collinear case
  if(x0 === 0 && y0 === 0 && x1 === 0 && y1 === 0) {
    return checkCollinear(a0, a1, b0, b1)
  }

  return true
}
},{"robust-orientation":83}],85:[function(require,module,exports){
"use strict"; "use restrict";

module.exports = UnionFind;

function UnionFind(count) {
  this.roots = new Array(count);
  this.ranks = new Array(count);

  for(var i=0; i<count; ++i) {
    this.roots[i] = i;
    this.ranks[i] = 0;
  }
}

var proto = UnionFind.prototype

Object.defineProperty(proto, "length", {
  "get": function() {
    return this.roots.length
  }
})

proto.makeSet = function() {
  var n = this.roots.length;
  this.roots.push(n);
  this.ranks.push(0);
  return n;
}

proto.find = function(x) {
  var x0 = x
  var roots = this.roots;
  while(roots[x] !== x) {
    x = roots[x]
  }
  while(roots[x0] !== x) {
    var y = roots[x0]
    roots[x0] = x
    x0 = y
  }
  return x;
}

proto.link = function(x, y) {
  var xr = this.find(x)
    , yr = this.find(y);
  if(xr === yr) {
    return;
  }
  var ranks = this.ranks
    , roots = this.roots
    , xd    = ranks[xr]
    , yd    = ranks[yr];
  if(xd < yd) {
    roots[xr] = yr;
  } else if(yd < xd) {
    roots[yr] = xr;
  } else {
    roots[yr] = xr;
    ++ranks[xr];
  }
}
},{}],86:[function(require,module,exports){
"use strict"

var almostEqual = require('almost-equal')
var dup         = require('dup')

module.exports = {
  fromList:       fromList,
  fromDictionary: fromDictionary,
  fromDense:      fromDense,
  fromNDArray:    fromNDArray
}

var EPSILON = almostEqual.DBL_EPSILON

function CSRMatrix(rows, row_ptrs, columns, column_ptrs, data) {
  this.rows = rows
  this.row_ptrs = row_ptrs
  this.columns = columns
  this.column_ptrs = column_ptrs
  this.data = data
}

var proto = CSRMatrix.prototype

Object.defineProperty(proto, "rowCount", {
  get: function() {
    return this.rows[this.rows.length-1]
  }
})

Object.defineProperty(proto, "columnCount", {
  get: function() {
    return this.columns[this.columns.length-1]
  }
})

function applyImpl(rows, row_ptrs, columns, column_ptrs, data, vector, result) {
  var cptr = 0, dptr = 0, last_r = 0
  for(var i=0, rlen=rows.length-1; i<rlen; ++i) {
    var r = rows[i]
    var next_c = row_ptrs[i+1]
    var s = 0.0
    while(++last_r < r) {
      result[last_r] = 0.0
    }
    while(cptr < next_c) {
      var c = columns[cptr]
      var next_d = column_ptrs[++cptr]
      while(dptr < next_d) {
        s += data[dptr++] * vector[c++]
      }
    }
    result[r] = s
  }
  var len = result.length
  while(++last_r < len) {
    result[last_r] = 0.0
  }
}

proto.apply = function(vector, result) {
  applyImpl(
    this.rows,
    this.row_ptrs,
    this.columns,
    this.column_ptrs,
    this.data,
    vector,
    result)
  return result
}

proto.transpose = function() {
  var items = this.toList()
  for(var i=0; i<items.length; ++i) {
    var it = items[i]
    var tmp = it[0]
    it[0] = it[1]
    it[1] = tmp
  }
  return fromList(items, this.columnCount, this.rowCount)
}

proto.toList = function() {
  var result = []
  for(var i=0, ilen=this.rows.length-1; i<ilen; ++i) {
    var r = this.rows[i];
    for(var j=this.row_ptrs[i], jlen=this.row_ptrs[i+1]; j<jlen; ++j) {
      var c = this.columns[j]
      for(var k=this.column_ptrs[j], klen=this.column_ptrs[j+1]; k<klen; ++k) {
        var d = this.data[k]
        result.push([r, c++, d])
      }
    }
  }
  return result
}

proto.toDictionary = function() {
  var result = {}
  for(var i=0, ilen=this.rows.length-1; i<ilen; ++i) {
    var r = this.rows[i];
    for(var j=this.row_ptrs[i], jlen=this.row_ptrs[i+1]; j<jlen; ++j) {
      var c = this.columns[j]
      for(var k=this.column_ptrs[j], klen=this.column_ptrs[j+1]; k<klen; ++k) {
        var d = this.data[k]
        result[[r, c++]] = d
      }
    }
  }
  return result
}

proto.toDense = function() {
  var result = dup([this.rowCount, this.columnCount], 0.0)
  for(var i=0, ilen=this.rows.length-1; i<ilen; ++i) {
    var r = this.rows[i];
    for(var j=this.row_ptrs[i], jlen=this.row_ptrs[i+1]; j<jlen; ++j) {
      var c = this.columns[j]
      for(var k=this.column_ptrs[j], klen=this.column_ptrs[j+1]; k<klen; ++k) {
        var d = this.data[k]
        result[r][c++] = d
      }
    }
  }
  return result
}

CSRMatrix.prototype.toNDArray = function(result) {
  for(var i=0, ilen=this.rows.length-1; i<ilen; ++i) {
    var r = this.rows[i];
    for(var j=this.row_ptrs[i], jlen=this.row_ptrs[i+1]; j<jlen; ++j) {
      var c = this.columns[j]
      for(var k=this.column_ptrs[j], klen=this.column_ptrs[j+1]; k<klen; ++k) {
        var d = this.data[k]
        result.set(r, c++, d)
      }
    }
  }
  return result
}

function compareKey(a, b) {
  return (a[0]-b[0]) || (a[1]-b[1])
}

function removeDuplicates(items, nrows, ncols) {
  var i=0, ptr=0
  items.sort(compareKey)
  while(i < items.length) {
    var it = items[i++]
    if(it[0] >= nrows || it[1] >= ncols) {
      continue
    }
    while(i < items.length && compareKey(items[i], it) === 0) {
      it[2] += items[i++][2]
    }
    if(Math.abs(it[2]) > EPSILON) {
      items[ptr++] = it
    }
  }
  items.length = ptr
  return items
}

function fromList(items, nrows, ncols) {
  items = removeDuplicates(items, nrows || Infinity, ncols || Infinity)
  var rows = []
    , row_ptrs = []
    , cols = []
    , col_ptrs = []
    , data = new Float64Array(items.length)
  nrows = nrows || 0
  ncols = ncols || 0
  for(var i=0; i<items.length; ++i) {
    var item = items[i]
    if(i === 0 || item[0] !== items[i-1][0]) {
      rows.push(item[0])
      row_ptrs.push(cols.length)
      cols.push(item[1])
      col_ptrs.push(i)
    } else if(item[1] !== items[i-1][1]+1) {
      cols.push(item[1])
      col_ptrs.push(i)
    }
    nrows = Math.max(nrows, item[0]+1)
    ncols = Math.max(ncols, item[1]+1)
    data[i] = item[2]
  }
  rows.push(nrows)
  row_ptrs.push(cols.length)
  cols.push(ncols)
  col_ptrs.push(data.length)
  return new CSRMatrix(
    new Uint32Array(rows),
    new Uint32Array(row_ptrs),
    new Uint32Array(cols),
    new Uint32Array(col_ptrs),
    data)
}

function fromDictionary(dict, rows, cols) {
  return fromList(Object.keys(dict).map(function(item) {
    var parts = item.split(',')
    return [parts[0]|0, parts[1]|0, dict[item]]
  }), rows, cols)
}

function fromDense(matrix) {
  var list = []
  var rows = matrix.length
  if(rows === 0) {
    return fromList([], 0, 0)
  }
  var cols = matrix[0].length
  for(var i=0; i<rows; ++i) {
    var row = matrix[i]
    for(var j=0; j<cols; ++j) {
      var v = row[j]
      if(Math.abs(v) > EPSILON) {
        list.push([i,j,v])
      }
    }
  }
  return fromList(list, rows, cols)
}

function fromNDArray(array) {
  var list = []
  var rows = array.shape[0]
  var cols = array.shape[1]
  if(array.stride[1] > array.stride[0]) {
    for(var j=0; j<cols; ++j) {
      for(var i=0; i<rows; ++i) {
        list.push([i, j, array.get(i,j)])
      }
    }
  } else {
    for(var i=0; i<rows; ++i) {
      for(var j=0; j<cols; ++j) {
        list.push([i, j, array.get(i,j)])
      }
    }
  }
  return fromList(list, rows, cols)
}

},{"almost-equal":87,"dup":88}],87:[function(require,module,exports){
"use strict"

var abs = Math.abs
  , min = Math.min

function almostEqual(a, b, absoluteError, relativeError) {
  var d = abs(a - b)
  if(d <= absoluteError) {
    return true
  }
  if(d <= relativeError * min(abs(a), abs(b))) {
    return true
  }
  return a === b
}

almostEqual.FLT_EPSILON = 1.19209290e-7
almostEqual.DBL_EPSILON = 2.2204460492503131e-16

module.exports = almostEqual

},{}],88:[function(require,module,exports){
arguments[4][69][0].apply(exports,arguments)
},{"dup":69}],89:[function(require,module,exports){
module.exports = function drawTriangles(ctx, positions, cells, start, end) {
    var v = positions
    start = (start|0)
    end = typeof end === 'number' ? (end|0) : cells.length

    for (; start < end && start < cells.length; start++) {
        var f = cells[start]
        var v0 = v[f[0]],
            v1 = v[f[1]],
            v2 = v[f[2]]
        ctx.moveTo(v0[0], v0[1])
        ctx.lineTo(v1[0], v1[1])
        ctx.lineTo(v2[0], v2[1])
        ctx.lineTo(v0[0], v0[1])
    }
}
},{}],90:[function(require,module,exports){
var parseXml = require('xml-parse-from-string')

function extractSvgPath (svgDoc) {
  // concat all the <path> elements to form an SVG path string
  if (typeof svgDoc === 'string') {
    svgDoc = parseXml(svgDoc)
  }
  if (!svgDoc || typeof svgDoc.getElementsByTagName !== 'function') {
    throw new Error('could not get an XML document from the specified SVG contents')
  }

  var paths = Array.prototype.slice.call(svgDoc.getElementsByTagName('path'))
  return paths.reduce(function (prev, path) {
    var d = path.getAttribute('d') || ''
    return prev + ' ' + d.replace(/\s+/g, ' ').trim()
  }, '').trim()
}

module.exports = function () {
  throw new Error('use extract-svg-path/transform to inline SVG contents into your bundle')
}

module.exports.parse = extractSvgPath

//deprecated
module.exports.fromString = extractSvgPath

},{"xml-parse-from-string":91}],91:[function(require,module,exports){
module.exports = (function xmlparser() {
  //common browsers
  if (typeof window.DOMParser !== 'undefined') {
    return function(str) {
      var parser = new window.DOMParser()
      return parser.parseFromString(str, 'application/xml')
    }
  }

  //IE8 fallback
  if (typeof window.ActiveXObject !== 'undefined'
      && new window.ActiveXObject('Microsoft.XMLDOM')) {
    return function(str) {
      var xmlDoc = new window.ActiveXObject("Microsoft.XMLDOM")
      xmlDoc.async = "false"
      xmlDoc.loadXML(str)
      return xmlDoc
    }
  }

  //last resort fallback
  return function(str) {
    var div = document.createElement('div')
    div.innerHTML = str
    return div
  }
})()
},{}],92:[function(require,module,exports){
module.exports = {
  union: require('./lib/union'),
  intersect: require('./lib/intersect'),
  subtract: require('./lib/subtract'),

  // include utils to make things easier
  utils: require('./lib/util')
};

},{"./lib/intersect":94,"./lib/subtract":96,"./lib/union":97,"./lib/util":98}],93:[function(require,module,exports){
var Ring = require('./ring');
var Vertex = require('./vertex');
var pip = require('point-in-polygon');
var util = require('./util');

/**
 * Greiner-Hormann clipping uses 3 phases:
 *
 * 1. Find intersection vertices, build data structure
 * 2. Mark vertices as entry/exit points
 * 3. Build Polygons
 *
 * We additionally add in some special case handling
 * after intersection detection, because GH won't handle
 * cases where one of the polygons fully encloses the other,
 * or the two polygons are totally disjoint
 */
module.exports = function (subject, clipper, sForward, cForward) {
  sForward = !!sForward;
  cForward = !!cForward;

  var mode = detectMode(sForward, cForward);
  var sPoints = Ring.fromArray(subject);
  var cPoints = Ring.fromArray(clipper);

  /**
   * PHASE ONE: Identify Intersections
   */
  buildIntersectionLists(sPoints, cPoints, subject, clipper);
  markDegensAsIntersect(sPoints);

  /**
   * OPTIMIZATION / EDGE CASES: check for known cases where we can bail out early
   */
  var maybeResult = checkQuitCases(sPoints, cPoints, subject, clipper, mode);
  if (maybeResult) return maybeResult;

  /**
   * PHASE TWO: Identify Entry/Exit (Includes Degeneracy labelling logic)
   */
  setEntryExit(sPoints);

  /**
   * PHASE THREE: Build clipped polys
   */
  return buildPolygons(sPoints, sForward, cForward);
};

/**
 * s_forward and c_forward can be manipulated to change the operation
 * applied to the subject / clipper. This method provides a string
 * representation of the mode for easy reference.
 *
 *  Operation        | s_forward   | c_forward
 * -----------------------------------------------
 *  Union            | false       | false
 *  Intersect        | true        | true
 *  Subtract (A - B) | false       | true
 *  Subtract (B - A) | true        | false
 *
 * @param  {bool} sForward whether to traverse the subject polygon in forward order
 * @param  {bool} cForward whether to traverse the clip polygon in forward order
 * @return {string}           the string description of the selected clip mode
 */
function detectMode(sForward, cForward) {
  var mode;

  if (!sForward && !cForward) {
    mode = 'union';
  } else if (sForward && cForward) {
    mode = 'intersect';
  } else if (!sForward && cForward) {
    mode = 'subtractB'; // A - B
  } else if (sForward && !cForward) {
    mode = 'subtractA'; // B - A
  }
  return mode;
}

/**
 * Handles some cases here we can bail out without fully computing the intersection.
 *
 * @return {array|null} the result polygons, if an edge case was handled
 */
function checkQuitCases(sPoints, cPoints, subject, clipper, mode) {
  var totalS = sPoints.count();
  var totalC = cPoints.count();

  // No intersections exist
  if (sPoints.count('intersect', true) === 0) {
    switch (mode) {
      case 'union':
        if (sPoints.count('type', 'in') === totalS) {
          return [[clipper]];
        } else if (cPoints.count('type', 'in') === totalC) {
          return [[subject]];
        }
        // Return both shapes as a multipolygon
        return [[subject], [clipper]];
        break;
      case 'intersect':
        // There's no intersection, return nothing.
        return [];
        break;
      case 'subtractB':
        // If B is inside of A, it's a hole.
        if (cPoints.first.type === 'in') {
          return [[subject, clipper]];
        }
        if (sPoints.count('type', 'in') === totalS) {
          return [];
        }

        // Otherwise it's disjoint, so we ignore it.
        return [[subject]];
        break;
      case 'subtractA':
        // If A is inside of B, it's a hole.
        if (sPoints.first.type === 'in') {
          return [[clipper, subject]];
        }
        if (cPoints.first.type === 'in') {
          return [];
        }
        // Otherwise it's disjoint, so we ignore it.
        return [[clipper]];
        break;
    }
  }

  // All points are degenerate. The shapes may be spatially equal.
  // The intersect === 1 is a dumb hack for certain cases where (probably because of
  // floating point errors) a single point of a polygon we generated is touching
  // an edge. This is probably a sign of a bigger issue in intersection detection,
  // but we'll wait and see how that goes
  if (totalS === sPoints.count('degenerate', true) || sPoints.count('intersect', true) === 1) {
    switch (mode) {
      case 'subtractA':
        // If all points in the clip are also degenerate, these shapes
        // are equal.
        if (totalC === cPoints.count('degenerate', true)) {
          return [];
        }
        return [[clipper]];
        break;
      case 'subtractB':
        // If all points in the clip are also degenerate, these shapes
        // are equal.
        if (totalC === cPoints.count('degenerate', true)) {
          return [];
        }
        return [[subject]];
        break;
      default:
        return [[subject]];
    }
  }
}


/**
 * Builds the list of Polygon(s) representing the desired overlap of
 * the subject/clipper.
 *
 * @param  {[type]} sPoints [description]
 * @return {[type]}         [description]
 */
function buildPolygons(sPoints, sForward, cForward) {
  var curr = sPoints.first;
  var polylist = [];
  var onclip = false;
  var endir = 'next';
  var exdir = 'prev';

  while ((curr = sPoints.firstIntersect())) {
    var poly = [[curr.x, curr.y]];

    do {
      if (onclip) {
        endir = cForward ? 'next' : 'prev';
        exdir = cForward ? 'prev' : 'next';
      } else {
        endir = sForward ? 'next' : 'prev';
        exdir = sForward ? 'prev' : 'next';
      }

      curr.checked = true;
      if (curr.neighbor) {
        curr.neighbor.checked = true;
      }

      if (curr.entry) {
        do {
          curr = curr[endir];
          poly.push([curr.x, curr.y]);
        } while (!curr.intersect);
      } else {
        do {
          curr = curr[exdir];
          poly.push([curr.x, curr.y]);
        } while (!curr.intersect);
      }

      // Jump to the other list
      curr = curr.neighbor;
      onclip = !onclip;

    } while (!curr.checked);

    if (!util.pointsEqual(poly[0], poly[poly.length - 1])) {
      poly.push(poly[0]);
    } else if (poly.length < 4) {
      continue;
    }
    polylist.push({geom: poly, isHole: false});
  }

  // Generate a graph of which polygons own which other polygons (detect holes)
  var result = [];
  var graph = {};
  for (var i = 0; i < polylist.length; i++) {
    if (!graph[i]) { graph[i] = []; }

    for (var j = 0; j < polylist.length; j++) {
      if (i === j) {
        continue;
      }
      // Because we just generated the intersections, we know that
      // none of these results can intersect eachother, so we only need to
      // run PIP on a single point of each poly.
      if (pip(polylist[j].geom[0], polylist[i].geom)) {
        polylist[j].isHole = true;
        graph[i].push(j);
      }
    }
  }

  // Construct polys with their holes
  for (var key in graph) {
    if (polylist[key].isHole) {
      continue;
    }
    var p = [polylist[key].geom];
    for (var idx = 0; idx < graph[key].length; idx++) {
      p.push(polylist[graph[key][idx]].geom);
    }
    result.push(p);
  }
  return result;
}

/**
 * Builds vertex lists for the subject and clipper. Essentially
 * the way this will work is that it will detect intersections by
 * comparing each pair of lines between the subject / clipper, then
 * injecting intersection vertices (marked by the "intersects" property)
 * in the appropriate spots in each coordinate list.
 *
 * Once this is complete, our subject and clipper coordinate lists will
 * each contain, in traversable order, every vertex, including ones for
 * each point where the other polygon intersected.
 *
 * @param  {[type]} sPoints [description]
 * @param  {[type]} cPoints [description]
 * @return {[type]}         [description]
 */
function buildIntersectionLists(sPoints, cPoints, sPoly, cPoly) {
  var sCurr = sPoints.first;

  do {
    setPointRelativeLocation(sCurr, cPoly);
    var cCurr = cPoints.first;
    if (!sCurr.intersect) {
      do {
        setPointRelativeLocation(cCurr, sPoly);
        if (!cCurr.intersect) {
          var sEnd = sPoints.nextNonIntersect(sCurr.next);
          var cEnd = cPoints.nextNonIntersect(cCurr.next);
          var intersect = lineIntersects(sCurr, sEnd, cCurr, cEnd);

          if (intersect) {
            cCurr = handleIntersection(sPoints, cPoints, sCurr, sEnd, cCurr, cEnd, intersect);
          }
        }

        cCurr = cCurr.next;
      } while (cCurr !== cPoints.first);
    }

    sCurr = sCurr.next;
  } while (sCurr !== sPoints.first);
}

/**
 * Loop back through, ensuring that all degenerate vertices
 * are marked as intersections.
 *
 * @param  {Ring} points [description]
 * @return {[type]}        [description]
 */
function markDegensAsIntersect(points) {
  var curr = points.first;

  do {
    if (curr.degenerate) {
      curr.intersect = true;
      curr.neighbor.intersect = true;
    }
    curr = curr.next;
  } while ((curr !== points.first))
}

/**
 * Handle inserting / replacing points appropriately for
 * a found intersection
 *
 * @param  {Ring}   sPoints   Subject Ring
 * @param  {Ring}   cPoints   Clip Ring
 * @param  {Vertex} sCurr     Start of the Subject line
 * @param  {Vertex} sEnd      End of the Subject line
 * @param  {Vertex} cCurr     Start of the Clip line
 * @param  {Vertex} cEnd      End of the Clip line
 * @param  {Object} intersect Object representing an intersection
 * @return {[type]}           [description]
 */
function handleIntersection(sPoints, cPoints, sCurr, sEnd, cCurr, cEnd, intersect) {
  var sPt, cPt;
  var sBetween = (intersect.alphaA > 0) && intersect.alphaA < 1;
  var cBetween = (intersect.alphaB > 0) && intersect.alphaB < 1;

  if (sBetween && cBetween) {
    sPt = new Vertex(intersect.x, intersect.y, intersect.alphaA, true);
    cPt = new Vertex(intersect.x, intersect.y, intersect.alphaB, true);
    sPoints.insert(sPt, sCurr, sEnd);
    cPoints.insert(cPt, cCurr, cEnd);
  } else {
    // Handle various degeneracy cases for the subject point
    if (sBetween) {
      sPt = new Vertex(intersect.x, intersect.y, intersect.alphaA, true, true);
      sPoints.insert(sPt, sCurr, sPoints.nextNonIntersect(sCurr.next));
    } else if (intersect.alphaA === 0) {
      sCurr.intersect = true;
      sCurr.degenerate = true;
      sCurr.alpha = intersect.alphaA;
      sPt = sCurr;
    } else if (intersect.alphaA === 1) {
      // End points get marked as degenerate but don't get marked as intersects.
      // This allows us to catch them later, and still use them for generating
      // lines to test against the other polygon
      sEnd.intersect = false;
      sEnd.degenerate = true;
      sEnd.alpha = intersect.alphaA;
      sPt = sEnd;
    }

    // Handle various degeneracy cases for the clip point
    if (cBetween) {
      cPt = new Vertex(intersect.x, intersect.y, intersect.alphaB, true, true);
      cPoints.insert(cPt, cCurr, cPoints.nextNonIntersect(cCurr.next));
    } else if (intersect.alphaB === 0) {
      cCurr.intersect = true;
      cCurr.degenerate = true;
      cCurr.alpha = intersect.alphaB;
      cPt = cCurr;
    } else if (intersect.alphaB === 1) {
      // End points get marked as degenerate but don't get marked as intersects.
      // This allows us to catch them later, and still use them for generating
      // lines to test against the other polygon
      cEnd.intersect = false;
      cEnd.degenerate = true;
      cEnd.alpha = intersect.alphaB;
      cPt = cEnd;
      if (cCurr.next !== cPoints.first) {
        cCurr = cCurr.next;
      }
    }
  }

  if (!sPt.intersect) cPt.intersect = false;
  if (!cPt.intersect) sPt.intersect = false;

  // Neighbors are used to jump back and forth between the lists
  if (sPt && cPt) {
    sPt.neighbor = cPt;
    cPt.neighbor = sPt;
    // Intersections are always "on" a line
    sPt.type = 'on';
    cPt.type = 'on';
  }
  return cCurr;
}

/**
 * Set a point in or out compared to the other polygon:
 * - if it's a subject point, compare to the clip polygon,
 * - if it's a clip point, compare to the subject polygon
 *
 * @param {Vertex}  pt   Point to check against the poly
 * @param {Polygon} poly Check if pt is within this poly
 */
function setPointRelativeLocation(pt, poly) {
  if (!pt.type) {
    if (pip([pt.x, pt.y], poly)) {
      pt.type = 'in';
    } else {
      pt.type = 'out';
    }
  }
}

/**
 * Handle setting entry/exit flags for each intersection. This is
 * where a large part of degeneracy handling happens - the original
 * GH algorithm uses very simple entry/exit handling, which won't work
 * for our degenerate cases.
 *
 * http://arxiv-web3.library.cornell.edu/pdf/1211.3376v1.pdf
 *
 * @param {Ring}    sPoints The subject polygon's vertices
 */
function setEntryExit(sPoints) {
  var first = sPoints.first;
  var curr = first;

  do {
    if (curr.intersect && curr.neighbor) {
      handleEnEx(curr);
      handleEnEx(curr.neighbor);

      // If this and the neighbor share the same entry / exit flag values
      // we need to throw them out and relabel
      switch (curr.entryPair()) {
        case 'en/en':
          curr.remove = true;
          curr.type = 'in';
          curr.neighbor.type = 'in';
          curr.intersect = false;
          curr.neighbor.intersect = false;
          break;
        case 'ex/ex':
          curr.remove = true;
          curr.type = 'out';
          curr.neighbor.type = 'out';
          curr.intersect = false;
          curr.neighbor.intersect = false;
          break;
      }
    }

    curr = curr.next;
  } while ((curr !== first))
}

/**
 * Handles deciding the entry / exit flag setting for a given point.
 * This is probably where most of the things could be wrong
 *
 * @param  {Vertex} curr The vertex to flag
 */
function handleEnEx(curr) {
  var cp = curr.pairing();
  switch (cp) {
    case 'in/out':
    case 'on/out':
    case 'in/on':
      curr.entry = false;
      break;
    case 'out/in':
    case 'on/in':
    case 'out/on':
      curr.entry = true;
      break;
    case 'out/out':
    case 'in/in':
    case 'on/on':
      var np = curr.neighbor.pairing();
      if (np === 'out/out' || np === 'in/in' || np === 'on/on' || (cp === 'on/on' && np === 'on/out' && curr.degenerate)) {
        curr.remove = true;
        curr.neighbor.remove = true;
        curr.neighbor.intersect = false;
        curr.intersect = false;
      } else {
        handleEnEx(curr.neighbor);
        curr.entry = !curr.neighbor.entry;
      }
      break;
    default:
      // This shouldn't ever happen - It's here to confirm nothing stupid is happening.
      console.error('UNKNOWN TYPE', curr.pairing());
  }
}


/**
 * Take two lines (each represented by the respective
 * start and end), and tells you where they intersect,
 * as well as the intersection alphas
 *
 * @param  {Vertex} start1 [description]
 * @param  {Vertex} end1   [description]
 * @param  {Vertex} start2 [description]
 * @param  {Vertex} end2   [description]
 * @return {[type]}        [description]
 */
function lineIntersects(start1, end1, start2, end2) {
  // if the lines intersect, the result contains the x and y of the intersection (treating the lines as infinite) and booleans for whether line segment 1 or line segment 2 contain the point
  var denominator, a, b, numerator1, numerator2,
    result = {
      x: null,
      y: null,
      onLine1: false,
      onLine2: false,
      alphaA: null,
      alphaB: null
    };

  denominator = ((end2.y - start2.y) * (end1.x - start1.x)) - ((end2.x - start2.x) * (end1.y - start1.y));
  if (denominator === 0) {
    if (start1.equals(start2)) {
      result.x = start1.x;
      result.y = start1.y;
      result.alphaA = 0;
      result.alphaB = 0;
      return result;
    }
    return false;
  }

  a = start1.y - start2.y;
  b = start1.x - start2.x;
  numerator1 = ((end2.x - start2.x) * a) - ((end2.y - start2.y) * b);
  numerator2 = ((end1.x - start1.x) * a) - ((end1.y - start1.y) * b);
  a = numerator1 / denominator;
  b = numerator2 / denominator;

  // if we cast these lines infinitely in both directions, they intersect here:
  result.x = start1.x + (a * (end1.x - start1.x));
  result.y = start1.y + (a * (end1.y - start1.y));
  result.alphaA = a;
  result.alphaB = b;

  // TODO: any better way to handle this?
  if (result.alphaA > 0.99999999999999) {
    result.alphaA = 1;
  }
  if (result.alphaB > 0.99999999999999) {
    result.alphaB = 1;
  }
  if (result.alphaA < 0.00000000000001) {
    result.alphaA = 0;
  }
  if (result.alphaB < 0.00000000000001) {
    result.alphaB = 0;
  }

  // if line1 is a segment and line2 is infinite, they intersect if:
  if (a >= 0 && a <= 1) {
    result.onLine1 = true;
  }
  // if line2 is a segment and line1 is infinite, they intersect if:
  if (b >= 0 && b <= 1) {
    result.onLine2 = true;
  }
  // if line1 and line2 are segments, they intersect if both of the above are true
  if (result.onLine1 && result.onLine2) {
    return result;
  } else {
    return false;
  }
}

},{"./ring":95,"./util":98,"./vertex":99,"point-in-polygon":100}],94:[function(require,module,exports){
var ghClipping = require('./greiner-hormann');
var union = require('./union');
var utils = require('./util');
var subtract = require('./subtract');

module.exports = function (subject, clipper) {
  subject = utils.clone(subject);
  clipper = utils.clone(clipper);
  var sHulls = utils.outerHulls(subject);
  var cHulls = utils.outerHulls(clipper);
  var holes = utils.holes(subject).concat(utils.holes(clipper));
  var result = [];

  for (var i = 0; i < sHulls.length; i++) {
    for (var j = 0; j < cHulls.length; j++) {
      var test = ghClipping(sHulls[i], cHulls[j], true, true);
      if (Array.isArray(test)) {
        result = result.concat(test);
      }
    }
  }

  // Union all the holes then subtract them rom the result
  if (holes.length > 0) {
    var holeUnion = union(utils.wrapToPolygons(holes));
    return subtract(result, utils.wrapToPolygons(utils.outerHulls(holeUnion)));
  }

  return result;
};

},{"./greiner-hormann":93,"./subtract":96,"./union":97,"./util":98}],95:[function(require,module,exports){
var Vertex = require('./vertex');
var clockwise = require('turf-is-clockwise');

/**
 * Ring is a circular doubly-linked list; Every node
 * has a next and a prev, even if it's the only node in the list.
 *
 * This supports some search methods that need to wrap back to the start of the list.
 */
function Ring() {
  this.first = null;
}

Ring.prototype.count = function (countkey, countval) {
  var curr = this.first;
  var count = 0;
  while (true) {
    if (countkey) {
      if (curr[countkey] === countval) count++;
    } else {
      count++;
    }
    curr = curr.next;

    if (curr === this.first) break;
  }
  return count;
};


/**
 * Takes an array of coordinates and constructs a Ring
 *
 * @param  {array} coordinates   the array of coordinates to convert to a Ring
 * @return {Ring}
 */
Ring.fromArray = function (coordinates) {
  var ring = new Ring();

  if (!clockwise(coordinates)) coordinates = coordinates.reverse();

  for (var i = 0; i < (coordinates.length - 1); i++) {
    var elem = coordinates[i];
    ring.push(new Vertex(elem[0], elem[1]));
  }

  return ring;
};

/**
 * Push a vertex into the ring's list. This
 * just updates pointers to put the point at
 * the end of the list
 *
 * @param  {Vertex} vertex the vertex to push
 */
Ring.prototype.push = function (vertex) {
  if (!this.first) {
    this.first = vertex;
    this.first.prev = vertex;
    this.first.next = vertex;
  } else {
    var next = this.first;
    var prev = next.prev;
    next.prev = vertex;
    vertex.next = next;
    vertex.prev = prev;
    prev.next = vertex;
  }
};

/**
 * Insert a vertex between specific vertices
 *
 * If there are intersection points, inbetween
 * start and end, the new vertex is inserted
 * based on it's alpha value
 *
 * @param  {Vertex} vertex the vertex to insert
 * @param  {Vertex} start  the "leftmost" vertex this point could be inserted next to
 * @param  {Vertex} end    the "rightmost" vertex this could could be inserted next to
 */
Ring.prototype.insert = function (vertex, start, end) {
  var curr = start.next;

  while (curr !== end && curr.alpha < vertex.alpha) {
    curr = curr.next;
  }

  // Insert just before the "curr" value
  vertex.next = curr;
  var prev = curr.prev;
  vertex.prev = prev;
  prev.next = vertex;
  curr.prev = vertex;
};

/**
 * Start at the start vertex, and get the next
 * point that isn't an intersection
 *
 * @param  {Vertex} start the vertex to start searching at
 * @return {Vertex} the next non-intersect
 */
Ring.prototype.nextNonIntersect = function (start) {
  var curr = start;
  while (curr.intersect && curr !== this.first) {
    curr = curr.next;
  }
  return curr;
};

/**
 * Returns the first unchecked intersection in the list
 *
 * @return {Vertex|bool}
 */
Ring.prototype.firstIntersect = function () {
  var curr =  this.first;

  while (true) {
    if (curr.intersect && !curr.checked) return curr;
    curr = curr.next;
    if (curr === this.first) break;
  }
  return false;
};

/**
 * Converts the Ring into an array
 *
 * @return {array} array representation of the ring
 */
Ring.prototype.toArray = function () {
  var curr = this.first;
  var points = [];

  do {
    points.push([curr.x, curr.y]);
    curr = curr.next;
  } while (curr !== this.first);

  return points;
};




/**
 * Utility method for logging points
 *
 * @param  {[type]} sPoints [description]
 * @param  {[type]} cPoints [description]
 * @return {[type]}         [description]
 */
Ring.prototype.log = function () {
  console.log('POINTS');
  console.log('-----------------');
  var curr = this.first;
  do {
    curr.log();
    curr = curr.next;
  } while (curr !== this.first)
  console.log('-----------------');
};

/**
 * Utility method for logging intersecions and degenerate points
 *
 * @param  {[type]} sPoints [description]
 * @return {[type]}         [description]
 */
Ring.prototype.logIntersections = function () {
  console.log('-------------------');
  console.log('INTERSECTION LIST: ');
  console.log('-------------------');
  var curr = this.first;
  do {
    if (curr.intersect || curr.degenerate) {
      curr.log();
    }
    curr = curr.next;
  } while ((curr !== this.first))
  console.log('');
};


module.exports = Ring;

},{"./vertex":99,"turf-is-clockwise":101}],96:[function(require,module,exports){
var util = require('./util');
var ghClipping = require('./greiner-hormann');

function intersect(hulls, holes) {
  var result = [];
  for (var i = 0; i < hulls.length; i++) {
    for (var j = 0; j < holes.length; j++) {
      var test = ghClipping(hulls[i], holes[j], true, true);
      if (Array.isArray(test)) {
        result = result.concat(test);
      }
    }
  }
  return result;
}

function subtract(subject, clip, skiploop) {
  skiploop = !!skiploop;
  subject = util.clone(subject);
  clip = util.clone(clip);

  var sHulls = util.outerHulls(subject);
  var cHulls = util.outerHulls(clip);
  var cHoles = util.holes(clip);

  // TODO:
  // If there are any holes in the subject, subtract those as well
  // If there are any holes in the clip, which overlap the original
  // subject, these should be unioned in. This means we'll have to
  // check polygon within-ness for each clip hole

  // first intersect any holes in clip against the hulls in the subject.
  // If there are results from these, then these holes overlap the subject,
  // meaning they (or some part of them) will be saved in the final output as
  // outer hulls
  if (cHoles.length > 0) {
    cHoles = intersect(sHulls, cHoles);
  }

  if (util.isPolygon(subject)) {
    subject = [subject];
  } else {
    subject = util.wrapToPolygons(subject);
  }

  for (var i = 0; i < cHulls.length; i++) {
    var ilen = subject.length;
    for (var j = 0; j < subject.length; j++) {
      var test = ghClipping(subject[j][0], cHulls[i], false, true);
      if (test.length === 0) {
        subject.splice(j, 1);
        j--;
        continue;
      }

      subject[j][0] = test[0][0];

      // Copy in each hole (if there were any) for the primary hull
      for (var k = 1; k < test[0].length; k++) {
        subject[j].push(test[0][k]);
      }

      // If there are any additional polygons in the result,
      // they were newly created by intersecting this hole.
      // Push the new polygon (hull and any holes) straight
      // into the intersect list
      for (var l = 1; l < test.length; l++) {
        subject.splice(j + l, null, test[l]);
      }
      j += (test.length - 1);
    }

    // If the length has changed, this hole created
    // new intersection polygons, which means it's not a hole
    // anymore (it crossed the polys, now it's boundary is
    // part of the new intersection hulls). Therefore, we
    // remove this hole from the list so it won't be returned.
    if (ilen !== subject.length) {
      cHulls.splice(i, 1);
      i--;
    }
  }

  // Union remaining clip-polygon holes if they exist.
  if (cHoles.length > 0) {
    subject = subject.concat(util.wrapToPolygons(cHoles));
  }

  // Re-cut everything against the subject's holes to be
  // 100% certain they don't change any information in the output
  var sHoles = util.unionRings(util.holes(subject), []);

  if (sHoles.length > 0 && !skiploop) {
    return subtract(util.wrapToPolygons(util.outerHulls(subject)), util.wrapToPolygons(sHoles), true);
  }

  return subject;
}


module.exports = subtract;

},{"./greiner-hormann":93,"./util":98}],97:[function(require,module,exports){
var utils = require('./util');
var subtract = require('./subtract');

/**
 * Iteratively join all rings in the passed set.
 *
 * @param  {array} rings An array of polygon rings
 * @return {[type]}       [description]
 */


/**
 * Method for subtracting hulls from holes. This is used
 * before calculating the union to ensure correctly shaped
 * holes in all of the input polygons
 *
 * @param  {[type]} coords [description]
 * @param  {[type]} j      [description]
 * @param  {[type]} i      [description]
 * @return {[type]}        [description]
 */
function clipHoles(coords, hullIdx, holeIdx) {
  var hulls = utils.outerHulls(coords[hullIdx]);
  var holes = utils.holes(coords[holeIdx]);
  if (holes.length > 0) {
    var newholes = subtract(utils.wrapToPolygons(holes), hulls);
    coords[holeIdx].splice(1);
    coords[holeIdx] = coords[holeIdx].concat(utils.outerHulls(newholes));
  }
}

// TODO: make this support polys + holes. Right now
// it takes an array of rings, not array of polys.
//
// TODO: think about the function signature here? Should it be
// traditional "union A + B", or is passing a set of things to union more useful
//
// TODO: think about using the approach here: http://blog.cleverelephant.ca/2009/01/must-faster-unions-in-postgis-14.html
// to make things faster for complex / very degenerate sets
module.exports = function (coords, coords2) {
  if (typeof coords2 !== 'undefined' && coords2 !== null) {
    // TODO: make this more robust. This will fail in some cases
    if (!utils.isMultiPolygon(coords)) {
      coords = [coords];
    }
    if (!utils.isMultiPolygon(coords2)) {
      coords2 = [coords2];
    }
    coords = coords.concat(coords2);
  }

  coords = utils.clone(coords);
  // Preprocess the holes. This covers cases such as the one here:
  // https://github.com/tchannel/greiner-hormann/issues/7
  for (var i = 0; i < coords.length; i++) {
    for (var j = i + 1; j < coords.length; j++) {
      clipHoles(coords, j, i);
      clipHoles(coords, i, j);
    }
  }

  var hulls = utils.outerHulls(coords);
  var holes = utils.holes(coords);
  // Union all hulls. Holes is passed in, to handle cases where the union
  // generates new holes (they'll be pushed into the holes array)
  hulls = utils.wrapToPolygons(utils.unionRings(hulls, holes));

  // Union all holes - If holes overlap, they should be joined
  if (holes.length > 0) {
    holes = utils.unionRings(holes);
    holes = utils.wrapToPolygons(holes);
    // Subtract all rings from the unioned set
    return subtract(hulls, holes);
  }

  return hulls;
};

},{"./subtract":96,"./util":98}],98:[function(require,module,exports){
if (!Array.isArray) {
  Array.isArray = function (arg) {
    return Object.prototype.toString.call(arg) === '[object Array]';
  };
}

// deep clone an array of coordinates / polygons
exports.clone = function cloneArray(array) {
  var newArray = array.slice();

  for (var i = 0; i < newArray.length; i++) {
    if (Array.isArray(newArray[i])) {
      newArray[i] = cloneArray(newArray[i]);
    }
  }

  return newArray;
};

// Wrap an array of geometries to an array of polygons
exports.wrapToPolygons = function (array) {
  var wrapped = [];
  for (var i = 0; i < array.length; i++) {
    if (exports.isRing(array[i])) {
      wrapped.push([array[i]]);
    } else if (exports.isMultiPolygon(array[i])) {
      wrapped.concat(array[i]);
    } else if (exports.isPolygon(array[i])) {
      wrapped.push(array[i]);
    }
  }
  return wrapped;
};

// Unwrap polygons to an array of rings
exports.unwrap = function (array) {
  var unwrapped = [];
  for (var i = 0; i < array.length; i++) {
    for (var j = 0; j < array[i].length; j++) {
      unwrapped.push(array[i][j]);
    }
  }
};


/**
 * Count array depth (used to check for geom type)
 *
 * @param  {[type]} collection [description]
 * @return {[type]}            [description]
 */
exports.depth = function (collection) {
  function depth(collection, num) {
    if (Array.isArray(collection)) {
      return depth(collection[0], num + 1);
    }
    return num;
  }

  return depth(collection, 0);
};


exports.isMultiPolygon = function (poly) {
  if (exports.depth(poly) === 4) {
    return true;
  }
  return false;
};


exports.isPolygon = function (poly) {
  if (exports.depth(poly) === 3) {
    return true;
  }
  return false;
};

exports.isRing = function (poly) {
  if (exports.depth(poly) === 2) {
    return true;
  }
  return false;
};

/**
 * Takes a list of polygons / multipolygons and returns only the outer hulls
 *
 * @param  {[type]} collection [description]
 * @return {[type]}            [description]
 */
exports.outerHulls = function (collection) {
  var hulls = [];

  if (exports.isPolygon(collection)) {
    return [collection[0]];
  }

  for (var i = 0; i < collection.length; i++) {
    if (exports.isMultiPolygon(collection[i])) {
      // Each polygon
      for (var j = 0; j < collection[i].length; j++) {
        hulls.push(collection[i][j][0]);
      }
    } else if (exports.isPolygon(collection[i])) {
      hulls.push(collection[i][0]);
    } else if (exports.isRing(collection[i])) {
      hulls.push(collection[i]);
    }
  }

  return hulls;
};

/**
 * Takes a list of multipolygons / polygons and returns only the holes
 *
 * @param  {[type]} collection [description]
 * @return {[type]}            [description]
 */
exports.holes = function (collection) {
  var holes = [];

  if (exports.isPolygon(collection)) {
    return collection.slice(1);
  }

  for (var i = 0; i < collection.length; i++) {
    if (exports.isMultiPolygon(collection[i])) {
      // Each polygon
      for (var j = 0; j < collection[i].length; j++) {
        for (var k = 1; k < collection[i][j].length; k++) {
          holes.push(collection[i][j][k]);
        }
      }
    } else if (exports.isPolygon(collection[i])) {
      for (var l = 1; l < collection[i].length; l++) {
        holes.push(collection[i][l]);
      }
    }
  }

  return holes;
};


exports.pointsEqual = function (pt1, pt2) {
  if (pt1[0] === pt2[0] && pt1[1] === pt2[1]) {
    return true;
  }
  return false;
};

/**
 * Iteratively join all rings in the passed set.
 *
 * @param  {array} rings An array of polygon rings
 * @return {[type]}       [description]
 */
exports.unionRings = function (rings, holes) {
  var ghClipping = require('./greiner-hormann');

  for (var i = 0; i < rings.length; i++) {
    for (var j = i + 1; j < rings.length; j++) {
      if (i === j) {
        continue;
      }
      var test = ghClipping(rings[i], rings[j], false, false);

      // If the length is 1, we joined the two areas, so replace
      // rings[i] with the new shape, and remove rings[j]
      // Then reset the j iterator so we can make sure that none of
      // the previous rings will now overlap the new rings[i]
      if (test.length === 1) {
        rings[i] = test[0][0];
        rings.splice(j, 1);
        j = i;

        // If there are holes, copy them into the holes array.
        for (var idx = 1; idx < test[0].length; idx++) {
          holes.push(test[0][idx]);
        }
      }
    }
  }
  return rings;
};

},{"./greiner-hormann":93}],99:[function(require,module,exports){
function Vertex(x, y, alpha, intersect, degenerate) {
  this.x = x;
  this.y = y;
  this.alpha = alpha || 0.0;
  this.intersect = intersect || false;
  this.entry = true; // Set to true by default, for degeneracy handling
  this.checked = false;
  this.degenerate = degenerate || false;
  this.neighbor = null;
  this.next = null;
  this.prev = null;
  this.type = null; // can be 'in', 'out', 'on'
  this.remove = false;
}

/**
 * Returns a string representing the types of the previous and next vertices.
 * For example, if the prev vertex had type 'in' and the next had type 'out',
 * the pairing would be 'in/out'. This matches the way pairs are referenced in
 * the Greiner-Hormann Degeneracy paper.
 *
 * @return {String} the pairing description
 */
Vertex.prototype.pairing = function () {
  return this.prev.type + '/' + this.next.type;
};

/**
 * Returns a string representing the entry / exit flag of this vertex and it's neighbor
 * For example, if the current vertex was flagged entry = true and it's neighbor was flagged
 * entry = false, the entryPair would be 'en/ex' (short for 'entry/exit'). This matches the
 * way flags are referenced in the Greiner-Hormann Degeneracy paper.
 *
 * @return {String} the entry/exit pair string
 */
Vertex.prototype.entryPair = function () {
  var entry = this.entry ? 'en' : 'ex';
  var nEntry = this.neighbor.entry ? 'en' : 'ex';

  return entry + '/' + nEntry;
};

/**
 * Determine if this vertex is equal to another
 *
 * @param  {Vertex} other the vertex to compare with
 * @return {bool}   whether or not the vertices are equal
 */
Vertex.prototype.equals = function (other) {
  if (this.x === other.x && this.y === other.y) {
    return true;
  }
  return false;
};

/**
 * Utility method to log the vertex, only for debugging
 */
Vertex.prototype.log = function () {
  console.log(
    'INTERSECT: ' + (this.intersect ? 'Yes' : 'No ') +
    ' ENTRY: ' + (this.entry ? 'Yes' : 'No ') +
    ' DEGEN: ' + (this.degenerate ? 'Yes' : 'No ') +
    ' TYPE: ' + String(this.prev.type + ' ').slice(0, 3) +
    ' / ' + String(this.type + ' ').slice(0, 3) +
    ' / ' + String(this.next.type + ' ').slice(0, 3) +
    ' ENTRY: ' + this.entryPair() +
    ' ALPHA: ' + this.alpha.toPrecision(3) +
    ' REMOVE: ' + (this.remove ? 'Yes' : 'No') + ' ' +
    this.x + ', ' + this.y
  );
};


module.exports = Vertex;

},{}],100:[function(require,module,exports){
module.exports = function (point, vs) {
    // ray-casting algorithm based on
    // http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html

    var x = point[0], y = point[1];

    var inside = false;
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        var xi = vs[i][0], yi = vs[i][1];
        var xj = vs[j][0], yj = vs[j][1];

        var intersect = ((yi > y) != (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }

    return inside;
};

},{}],101:[function(require,module,exports){
module.exports = function(ring){
  var sum = 0;
  var i = 1;
  var len = ring.length;
  var prev,cur;
  while(i<len){
    prev = cur||ring[0];
    cur = ring[i];
    sum += ((cur[0]-prev[0])*(cur[1]+prev[1]));
    i++;
  }
  return sum > 0;
}
},{}],102:[function(require,module,exports){
var xhr = require('xhr');

module.exports = function (opts, cb) {
    if (typeof opts === 'string') opts = { uri: opts };

    xhr(opts, function (err, res, body) {
        if (err) return cb(err);
        if (!/^2/.test(res.statusCode)) {
            return cb(new Error('http status code: ' + res.statusCode));
        }
        var div = document.createElement('div');
        div.innerHTML = body;
        var svg = div.querySelector('svg');
        if (!svg) return cb(new Error('svg not present in resource'));
        cb(null, svg);
    });
};

},{"xhr":103}],103:[function(require,module,exports){
var window = require("global/window")
var once = require("once")
var parseHeaders = require('parse-headers')

var messages = {
    "0": "Internal XMLHttpRequest Error",
    "4": "4xx Client Error",
    "5": "5xx Server Error"
}

var XHR = window.XMLHttpRequest || noop
var XDR = "withCredentials" in (new XHR()) ? XHR : window.XDomainRequest

module.exports = createXHR

function createXHR(options, callback) {
    if (typeof options === "string") {
        options = { uri: options }
    }

    options = options || {}
    callback = once(callback)

    var xhr = options.xhr || null

    if (!xhr) {
        if (options.cors || options.useXDR) {
            xhr = new XDR()
        }else{
            xhr = new XHR()
        }
    }

    var uri = xhr.url = options.uri || options.url
    var method = xhr.method = options.method || "GET"
    var body = options.body || options.data
    var headers = xhr.headers = options.headers || {}
    var sync = !!options.sync
    var isJson = false
    var key
    var load = options.response ? loadResponse : loadXhr

    if ("json" in options) {
        isJson = true
        headers["Accept"] = "application/json"
        if (method !== "GET" && method !== "HEAD") {
            headers["Content-Type"] = "application/json"
            body = JSON.stringify(options.json)
        }
    }

    xhr.onreadystatechange = readystatechange
    xhr.onload = load
    xhr.onerror = error
    // IE9 must have onprogress be set to a unique function.
    xhr.onprogress = function () {
        // IE must die
    }
    // hate IE
    xhr.ontimeout = noop
    xhr.open(method, uri, !sync)
                                    //backward compatibility
    if (options.withCredentials || (options.cors && options.withCredentials !== false)) {
        xhr.withCredentials = true
    }

    // Cannot set timeout with sync request
    if (!sync) {
        xhr.timeout = "timeout" in options ? options.timeout : 5000
    }

    if (xhr.setRequestHeader) {
        for(key in headers){
            if(headers.hasOwnProperty(key)){
                xhr.setRequestHeader(key, headers[key])
            }
        }
    } else if (options.headers) {
        throw new Error("Headers cannot be set on an XDomainRequest object")
    }

    if ("responseType" in options) {
        xhr.responseType = options.responseType
    }

    if ("beforeSend" in options &&
        typeof options.beforeSend === "function"
    ) {
        options.beforeSend(xhr)
    }

    xhr.send(body)

    return xhr

    function readystatechange() {
        if (xhr.readyState === 4) {
            load()
        }
    }

    function getBody() {
        // Chrome with requestType=blob throws errors arround when even testing access to responseText
        var body = null

        if (xhr.response) {
            body = xhr.response
        } else if (xhr.responseType === 'text' || !xhr.responseType) {
            body = xhr.responseText || xhr.responseXML
        }

        if (isJson) {
            try {
                body = JSON.parse(body)
            } catch (e) {}
        }

        return body
    }

    function getStatusCode() {
        return xhr.status === 1223 ? 204 : xhr.status
    }

    // if we're getting a none-ok statusCode, build & return an error
    function errorFromStatusCode(status, body) {
        var error = null
        if (status === 0 || (status >= 400 && status < 600)) {
            var message = (typeof body === "string" ? body : false) ||
                messages[String(status).charAt(0)]
            error = new Error(message)
            error.statusCode = status
        }

        return error
    }

    // will load the data & process the response in a special response object
    function loadResponse() {
        var status = getStatusCode()
        var body = getBody()
        var error = errorFromStatusCode(status, body)
        var response = {
            body: body,
            statusCode: status,
            statusText: xhr.statusText,
            raw: xhr
        }
        if(xhr.getAllResponseHeaders){ //remember xhr can in fact be XDR for CORS in IE
            response.headers = parseHeaders(xhr.getAllResponseHeaders())
        } else {
            response.headers = {}
        }

        callback(error, response, response.body)
    }

    // will load the data and add some response properties to the source xhr
    // and then respond with that
    function loadXhr() {
        var status = getStatusCode()
        var error = errorFromStatusCode(status)

        xhr.status = xhr.statusCode = status
        xhr.body = getBody()
        xhr.headers = parseHeaders(xhr.getAllResponseHeaders())

        callback(error, xhr, xhr.body)
    }

    function error(evt) {
        callback(evt, xhr)
    }
}


function noop() {}

},{"global/window":104,"once":105,"parse-headers":109}],104:[function(require,module,exports){
(function (global){
if (typeof window !== "undefined") {
    module.exports = window;
} else if (typeof global !== "undefined") {
    module.exports = global;
} else if (typeof self !== "undefined"){
    module.exports = self;
} else {
    module.exports = {};
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],105:[function(require,module,exports){
module.exports = once

once.proto = once(function () {
  Object.defineProperty(Function.prototype, 'once', {
    value: function () {
      return once(this)
    },
    configurable: true
  })
})

function once (fn) {
  var called = false
  return function () {
    if (called) return
    called = true
    return fn.apply(this, arguments)
  }
}

},{}],106:[function(require,module,exports){
var isFunction = require('is-function')

module.exports = forEach

var toString = Object.prototype.toString
var hasOwnProperty = Object.prototype.hasOwnProperty

function forEach(list, iterator, context) {
    if (!isFunction(iterator)) {
        throw new TypeError('iterator must be a function')
    }

    if (arguments.length < 3) {
        context = this
    }

    if (toString.call(list) === '[object Array]')
        forEachArray(list, iterator, context)
    else if (typeof list === 'string')
        forEachString(list, iterator, context)
    else
        forEachObject(list, iterator, context)
}

function forEachArray(array, iterator, context) {
    for (var i = 0, len = array.length; i < len; i++) {
        if (hasOwnProperty.call(array, i)) {
            iterator.call(context, array[i], i, array)
        }
    }
}

function forEachString(string, iterator, context) {
    for (var i = 0, len = string.length; i < len; i++) {
        // no such thing as a sparse string.
        iterator.call(context, string.charAt(i), i, string)
    }
}

function forEachObject(object, iterator, context) {
    for (var k in object) {
        if (hasOwnProperty.call(object, k)) {
            iterator.call(context, object[k], k, object)
        }
    }
}

},{"is-function":107}],107:[function(require,module,exports){
module.exports = isFunction

var toString = Object.prototype.toString

function isFunction (fn) {
  var string = toString.call(fn)
  return string === '[object Function]' ||
    (typeof fn === 'function' && string !== '[object RegExp]') ||
    (typeof window !== 'undefined' &&
     // IE8 and below
     (fn === window.setTimeout ||
      fn === window.alert ||
      fn === window.confirm ||
      fn === window.prompt))
};

},{}],108:[function(require,module,exports){

exports = module.exports = trim;

function trim(str){
  return str.replace(/^\s*|\s*$/g, '');
}

exports.left = function(str){
  return str.replace(/^\s*/, '');
};

exports.right = function(str){
  return str.replace(/\s*$/, '');
};

},{}],109:[function(require,module,exports){
var trim = require('trim')
  , forEach = require('for-each')
  , isArray = function(arg) {
      return Object.prototype.toString.call(arg) === '[object Array]';
    }

module.exports = function (headers) {
  if (!headers)
    return {}

  var result = {}

  forEach(
      trim(headers).split('\n')
    , function (row) {
        var index = row.indexOf(':')
          , key = trim(row.slice(0, index)).toLowerCase()
          , value = trim(row.slice(index + 1))

        if (typeof(result[key]) === 'undefined') {
          result[key] = value
        } else if (isArray(result[key])) {
          result[key].push(value)
        } else {
          result[key] = [ result[key], value ]
        }
      }
  )

  return result
}
},{"for-each":106,"trim":108}],110:[function(require,module,exports){
'use strict'

var pool = require('typedarray-pool')

module.exports = meshLaplacian

function hypot(x, y, z) {
  return Math.sqrt(
    Math.pow(x, 2) +
    Math.pow(y, 2) +
    Math.pow(z, 2))
}

function compareEntry(a, b) {
  return (a[0]-b[0]) || (a[1]-b[1])
}

function meshLaplacian(cells, positions) {
  var numVerts = positions.length
  var numCells = cells.length

  var areas = pool.mallocDouble(numVerts)
  for(var i=0; i<numVerts; ++i) {
    areas[i] = 0
  }

  var entries = []
  for(var i=0; i<numCells; ++i) {
    var cell = cells[i]
    var ia = cell[0]
    var ib = cell[1]
    var ic = cell[2]

    var a  = positions[ia]
    var b  = positions[ib]
    var c  = positions[ic]

    var abx = a[0] - b[0]
    var aby = a[1] - b[1]
    var abz = a[2] - b[2]

    var bcx = b[0] - c[0]
    var bcy = b[1] - c[1]
    var bcz = b[2] - c[2]

    var cax = c[0] - a[0]
    var cay = c[1] - a[1]
    var caz = c[2] - a[2]

    var area = 0.5 * hypot(
      aby * caz - abz * cay,
      abz * cax - abx * caz,
      abx * cay - aby * cax)

    //Skip thin triangles
    if(area < 1e-8) {
      continue
    }

    var w = -0.5 / area
    var wa = w * (abx * cax + aby * cay + abz * caz)
    var wb = w * (bcx * abx + bcy * aby + bcz * abz)
    var wc = w * (cax * bcx + cay * bcy + caz * bcz)

    var varea = area / 3
    areas[ia] += varea
    areas[ib] += varea
    areas[ic] += varea

    entries.push(
      [ib,ic,wa],
      [ic,ib,wa],
      [ic,ia,wb],
      [ia,ic,wb],
      [ia,ib,wc],
      [ib,ia,wc]
    )
  }

  var weights = pool.mallocDouble(numVerts)
  for(var i=0; i<numVerts; ++i) {
    weights[i] = 0
  }

  entries.sort(compareEntry)

  var ptr = 0
  for(var i=0; i<entries.length; ) {
    var entry = entries[i++]
    while(
      i < entries.length &&
      entries[i][0] === entry[0] &&
      entries[i][1] === entry[1] ) {
        entry[2] += entries[i++][2]
    }
    entry[2] /= areas[entry[0]]
    weights[entry[0]] += entry[2]
    entries[ptr++] = entry
  }
  entries.length = ptr

  for(var i=0; i<numVerts; ++i) {
    entries.push([i, i, -weights[i]])
  }

  pool.free(areas)
  pool.free(weights)

  return entries
}

},{"typedarray-pool":113}],111:[function(require,module,exports){
arguments[4][55][0].apply(exports,arguments)
},{"dup":55}],112:[function(require,module,exports){
arguments[4][69][0].apply(exports,arguments)
},{"dup":69}],113:[function(require,module,exports){
arguments[4][70][0].apply(exports,arguments)
},{"bit-twiddle":111,"buffer":1,"dup":70}],114:[function(require,module,exports){
module.exports = reindex

function reindex(array) {
  var pos = []
  var cel = []

  var i = 0
  var c = 0
  while (i < array.length) {
    cel.push([c++, c++, c++])
    pos.push([
        array[i++]
      , array[i++]
      , array[i++]
    ], [
        array[i++]
      , array[i++]
      , array[i++]
    ], [
        array[i++]
      , array[i++]
      , array[i++]
    ])
  }

  return {
      positions: pos
    , cells: cel
  }
}

},{}],115:[function(require,module,exports){
var getBounds = require('bound-points')
var unlerp = require('unlerp')

module.exports = normalizePathScale
function normalizePathScale (positions, bounds) {
  if (!Array.isArray(positions)) {
    throw new TypeError('must specify positions as first argument')
  }
  if (!Array.isArray(bounds)) {
    bounds = getBounds(positions)
  }

  var min = bounds[0]
  var max = bounds[1]

  var width = max[0] - min[0]
  var height = max[1] - min[1]

  var aspectX = width > height ? 1 : (height / width)
  var aspectY = width > height ? (width / height) : 1

  if (max[0] - min[0] === 0 || max[1] - min[1] === 0) {
    return positions // div by zero; leave positions unchanged
  }

  for (var i = 0; i < positions.length; i++) {
    var pos = positions[i]
    pos[0] = (unlerp(min[0], max[0], pos[0]) * 2 - 1) / aspectX
    pos[1] = (unlerp(min[1], max[1], pos[1]) * 2 - 1) / aspectY
  }
  return positions
}
},{"bound-points":21,"unlerp":116}],116:[function(require,module,exports){
module.exports = function range(min, max, value) {
  return (value - min) / (max - min)
}
},{}],117:[function(require,module,exports){
/* eslint-disable no-unused-vars */
'use strict';
var hasOwnProperty = Object.prototype.hasOwnProperty;
var propIsEnumerable = Object.prototype.propertyIsEnumerable;

function toObject(val) {
  if (val === null || val === undefined) {
    throw new TypeError('Object.assign cannot be called with null or undefined');
  }

  return Object(val);
}

module.exports = Object.assign || function (target, source) {
  var from;
  var to = toObject(target);
  var symbols;

  for (var s = 1; s < arguments.length; s++) {
    from = Object(arguments[s]);

    for (var key in from) {
      if (hasOwnProperty.call(from, key)) {
        to[key] = from[key];
      }
    }

    if (Object.getOwnPropertySymbols) {
      symbols = Object.getOwnPropertySymbols(from);
      for (var i = 0; i < symbols.length; i++) {
        if (propIsEnumerable.call(from, symbols[i])) {
          to[symbols[i]] = from[symbols[i]];
        }
      }
    }
  }

  return to;
};

},{}],118:[function(require,module,exports){

module.exports = parse

/**
 * expected argument lengths
 * @type {Object}
 */

var length = {a: 7, c: 6, h: 1, l: 2, m: 2, q: 4, s: 4, t: 2, v: 1, z: 0}

/**
 * segment pattern
 * @type {RegExp}
 */

var segment = /([astvzqmhlc])([^astvzqmhlc]*)/ig

/**
 * parse an svg path data string. Generates an Array
 * of commands where each command is an Array of the
 * form `[command, arg1, arg2, ...]`
 *
 * @param {String} path
 * @return {Array}
 */

function parse(path) {
  var data = []
  path.replace(segment, function(_, command, args){
    var type = command.toLowerCase()
    args = parseValues(args)

    // overloaded moveTo
    if (type == 'm' && args.length > 2) {
      data.push([command].concat(args.splice(0, 2)))
      type = 'l'
      command = command == 'm' ? 'l' : 'L'
    }

    while (true) {
      if (args.length == length[type]) {
        args.unshift(command)
        return data.push(args)
      }
      if (args.length < length[type]) throw new Error('malformed path data')
      data.push([command].concat(args.splice(0, length[type])))
    }
  })
  return data
}

function parseValues(args){
  args = args.match(/-?[.0-9]+(?:e[-+]?\d+)?/ig)
  return args ? args.map(Number) : []
}

},{}],119:[function(require,module,exports){
//http://www.blackpawn.com/texts/pointinpoly/
module.exports = function pointInTriangle(point, triangle) {
    //compute vectors & dot products
    var cx = point[0], cy = point[1],
        t0 = triangle[0], t1 = triangle[1], t2 = triangle[2],
        v0x = t2[0]-t0[0], v0y = t2[1]-t0[1],
        v1x = t1[0]-t0[0], v1y = t1[1]-t0[1],
        v2x = cx-t0[0], v2y = cy-t0[1],
        dot00 = v0x*v0x + v0y*v0y,
        dot01 = v0x*v1x + v0y*v1y,
        dot02 = v0x*v2x + v0y*v2y,
        dot11 = v1x*v1x + v1y*v1y,
        dot12 = v1x*v2x + v1y*v2y

    // Compute barycentric coordinates
    var b = (dot00 * dot11 - dot01 * dot01),
        inv = b === 0 ? 0 : (1 / b),
        u = (dot11*dot02 - dot01*dot12) * inv,
        v = (dot00*dot12 - dot01*dot02) * inv
    return u>=0 && v>=0 && (u+v < 1)
}
},{}],120:[function(require,module,exports){
'use strict';
module.exports = function (min, max) {
  if (max === undefined) {
    max = min;
    min = 0;
  }

  if (typeof min !== 'number' || typeof max !== 'number') {
    throw new TypeError('Expected all arguments to be numbers');
  }

  return Math.random() * (max - min) + min;
};

},{}],121:[function(require,module,exports){
// square distance from a point to a segment
function getSqSegDist(p, p1, p2) {
    var x = p1[0],
        y = p1[1],
        dx = p2[0] - x,
        dy = p2[1] - y;

    if (dx !== 0 || dy !== 0) {

        var t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);

        if (t > 1) {
            x = p2[0];
            y = p2[1];

        } else if (t > 0) {
            x += dx * t;
            y += dy * t;
        }
    }

    dx = p[0] - x;
    dy = p[1] - y;

    return dx * dx + dy * dy;
}

function simplifyDPStep(points, first, last, sqTolerance, simplified) {
    var maxSqDist = sqTolerance,
        index;

    for (var i = first + 1; i < last; i++) {
        var sqDist = getSqSegDist(points[i], points[first], points[last]);

        if (sqDist > maxSqDist) {
            index = i;
            maxSqDist = sqDist;
        }
    }

    if (maxSqDist > sqTolerance) {
        if (index - first > 1) simplifyDPStep(points, first, index, sqTolerance, simplified);
        simplified.push(points[index]);
        if (last - index > 1) simplifyDPStep(points, index, last, sqTolerance, simplified);
    }
}

// simplification using Ramer-Douglas-Peucker algorithm
module.exports = function simplifyDouglasPeucker(points, tolerance) {
    if (points.length<=1)
        return points;
    tolerance = typeof tolerance === 'number' ? tolerance : 1;
    var sqTolerance = tolerance * tolerance;

    var last = points.length - 1;

    var simplified = [points[0]];
    simplifyDPStep(points, 0, last, sqTolerance, simplified);
    simplified.push(points[last]);

    return simplified;
}

},{}],122:[function(require,module,exports){
var simplifyRadialDist = require('./radial-distance')
var simplifyDouglasPeucker = require('./douglas-peucker')

//simplifies using both algorithms
module.exports = function simplify(points, tolerance) {
    points = simplifyRadialDist(points, tolerance);
    points = simplifyDouglasPeucker(points, tolerance);
    return points;
}

module.exports.radialDistance = simplifyRadialDist;
module.exports.douglasPeucker = simplifyDouglasPeucker;
},{"./douglas-peucker":121,"./radial-distance":123}],123:[function(require,module,exports){
function getSqDist(p1, p2) {
    var dx = p1[0] - p2[0],
        dy = p1[1] - p2[1];

    return dx * dx + dy * dy;
}

// basic distance-based simplification
module.exports = function simplifyRadialDist(points, tolerance) {
    if (points.length<=1)
        return points;
    tolerance = typeof tolerance === 'number' ? tolerance : 1;
    var sqTolerance = tolerance * tolerance;

    var prevPoint = points[0],
        newPoints = [prevPoint],
        point;

    for (var i = 1, len = points.length; i < len; i++) {
        point = points[i];

        if (getSqDist(point, prevPoint) > sqTolerance) {
            newPoints.push(point);
            prevPoint = point;
        }
    }

    if (prevPoint !== point) newPoints.push(point);

    return newPoints;
}
},{}],124:[function(require,module,exports){
// expose module classes

exports.intersect = require('./lib/intersect');
exports.shape = require('./lib/IntersectionParams').newShape;
},{"./lib/IntersectionParams":126,"./lib/intersect":127}],125:[function(require,module,exports){
/**
 *  Intersection
 */
function Intersection(status) {
    this.init(status);
}

/**
 *  init
 *
 *  @param {String} status
 *  @returns {Intersection}
 */
Intersection.prototype.init = function(status) {
    this.status = status;
    this.points = [];
};

/**
 *  appendPoint
 *
 *  @param {Point2D} point
 */
Intersection.prototype.appendPoint = function(point) {
    this.points.push(point);
};

/**
 *  appendPoints
 *
 *  @param {Array<Point2D>} points
 */
Intersection.prototype.appendPoints = function(points) {
    this.points = this.points.concat(points);
};

module.exports = Intersection;

},{}],126:[function(require,module,exports){
var Point2D = require('kld-affine').Point2D;


/**
    getArcParameters

    @param {Point2D} startPoint
    @param {Point2D} endPoint
    @param {Number} rx
    @param {Number} ry
    @param {Number} angle - in degrees
    @param {Boolean} arcFlag
    @param {Boolean} sweepFlag
    @returns {{ center: Point2D, rx: Number, ry: Number, theta1: Number, deltaTheta: Number }}
*/
function getArcParameters(startPoint, endPoint, rx, ry, angle, arcFlag, sweepFlag) {
    function radian(ux, uy, vx, vy) {
        var dot = ux * vx + uy * vy;
        var mod = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
        var rad = Math.acos(dot / mod);
        if (ux * vy - uy * vx < 0.0) rad = -rad;
        return rad;
    }
    angle = angle * Math.PI / 180;
    var c = Math.cos(angle);
    var s = Math.sin(angle);
    var TOLERANCE = 1e-6;
    var halfDiff = startPoint.subtract(endPoint).divide(2);
    var x1p = halfDiff.x * c + halfDiff.y * s;
    var y1p = halfDiff.x * -s + halfDiff.y * c;
    var x1px1p = x1p * x1p;
    var y1py1p = y1p * y1p;
    var lambda = (x1px1p / (rx * rx)) + (y1py1p / (ry * ry));
    var factor;
    if (lambda > 1) {
        factor = Math.sqrt(lambda);
        rx *= factor;
        ry *= factor;
    }
    var rxrx = rx * rx;
    var ryry = ry * ry;
    var rxy1 = rxrx * y1py1p;
    var ryx1 = ryry * x1px1p;
    factor = (rxrx * ryry - rxy1 - ryx1) / (rxy1 + ryx1);
    if (Math.abs(factor) < TOLERANCE) factor = 0;
    var sq = Math.sqrt(factor);
    if (arcFlag == sweepFlag) sq = -sq;
    var mid = startPoint.add(endPoint).divide(2);
    var cxp = sq * rx * y1p / ry;
    var cyp = sq * -ry * x1p / rx;
    //return new Point2D(cxp * c - cyp * s + mid.x, cxp * s + cyp * c + mid.y);

    var xcr1 = (x1p - cxp) / rx;
    var xcr2 = (x1p + cxp) / rx;
    var ycr1 = (y1p - cyp) / ry;
    var ycr2 = (y1p + cyp) / ry;

    var vcr1 = new Vector2D(1, 0);
    var theta1 = radian(1.0, 0.0, xcr1, ycr1);

    var deltaTheta = radian(xcr1, ycr1, -xcr2, -ycr2);
    var PIx2 = Math.PI * 2.0;
    while (deltaTheta > PIx2) deltaTheta -= PIx2;
    while (deltaTheta < 0.0) deltaTheta += PIx2;
    if (sweepFlag == false) deltaTheta -= PIx2;

    return {
        center: new Point2D(cxp * c - cyp * s + mid.x, cxp * s + cyp * c + mid.y),
        rx: rx,
        ry: ry,
        theta1: theta1,
        deltaTheta: deltaTheta
    };
}


/**
 *  IntersectionParams
 *
 *  @param {String} name
 *  @param {Array<Point2D} params
 *  @returns {IntersectionParams}
 */
function IntersectionParams(name, params) {
    this.init(name, params);
}

/**
 *  init
 *
 *  @param {String} type
 *  @param {Array<Point2D>} params
 */
IntersectionParams.prototype.init = function (type, params) {
    this.type = type;
    this.params = params;
    this.meta = {};
};

IntersectionParams.TYPE = {};
var IPTYPE = IntersectionParams.TYPE;
IPTYPE.LINE = 'Line';
IPTYPE.RECT = 'Rectangle';
IPTYPE.ROUNDRECT = 'RoundRectangle';
IPTYPE.CIRCLE = 'Circle';
IPTYPE.ELLIPSE = 'Ellipse';
IPTYPE.POLYGON = 'Polygon';
IPTYPE.POLYLINE = 'Polyline';
IPTYPE.PATH = 'Path';
IPTYPE.ARC = 'Arc';
IPTYPE.BEZIER2 = 'Bezier2';
IPTYPE.BEZIER3 = 'Bezier3';


function parsePointsString(points) {
    return points.split(" ").map(function(point) {
        point = point.split(",");
        return new Point2D(point[0], point[1]);
    });
}

IntersectionParams.newShape = function(svgElementName, props) {
    svgElementName = svgElementName.toLowerCase();

    if(svgElementName === "line") {
        return IntersectionParams.newLine(
            new Point2D(props.x1, props.y1),
            new Point2D(props.x2, props.y2)
        );
    }

    if(svgElementName === "rect") {
        if(props.rx > 0 || props.ry > 0) {
            return IntersectionParams.newRoundRect(
                props.x, props.y,
                props.width, props.height,
                props.rx, props.ry
            );
        } else {
            return IntersectionParams.newRect(
                props.x, props.y,
                props.width, props.height
            );
        }
    }

    if(svgElementName === "circle") {
        return IntersectionParams.newCircle(
            new Point2D(props.cx, props.cy),
            props.r
        );
    }

    if(svgElementName === "ellipse") {
        return IntersectionParams.newEllipse(
            new Point2D(props.cx, props.cy),
            props.rx, props.ry
        );
    }

    if(svgElementName === "polygon") {
        return IntersectionParams.newPolygon(
            parsePointsString(props.points)
        );
    }

    if(svgElementName === "polyline") {
        return IntersectionParams.newPolyline(
            parsePointsString(props.points)
        );
    }

    if(svgElementName === "path") {
        return IntersectionParams.newPath(
            props.d
        );
    }

}


///////////////////////////////////////////////////////////////////
/**
    Creates IntersectionParams for arc.

    @param {Point2D} startPoint - arc start point
    @param {Point2D} endPoint - arc end point
    @param {Number} rx - arc ellipse x radius
    @param {Number} ry - arc ellipse y radius
    @param {Number} angle - arc ellipse rotation in degrees
    @param {Boolean} largeArcFlag
    @param {Boolean} sweepFlag
    @returns {IntersectionParams}
*/
IntersectionParams.newArc = function (startPoint, endPoint, rx, ry, angle, largeArcFlag, sweepFlag) {
    var p = getArcParameters(startPoint, endPoint, rx, ry, angle, largeArcFlag, sweepFlag);
    return new IntersectionParams(IPTYPE.ARC, [p.center, p.rx, p.ry, (angle * Math.PI / 180), p.theta1, p.deltaTheta]);
};

///////////////////////////////////////////////////////////////////
/**
    Creates IntersectionParams for bezier2.

    @param {Point2D} p1
    @param {Point2D} p2
    @param {Point2D} p3
    @returns {IntersectionParams}
*/
IntersectionParams.newBezier2 = function (p1, p2, p3) {
    return new IntersectionParams(IPTYPE.BEZIER2, [p1, p2, p3]);
};

///////////////////////////////////////////////////////////////////
/**
    Creates IntersectionParams for bezier3.

    @param {Point2D} p1
    @param {Point2D} p2
    @param {Point2D} p3
    @param {Point2D} p4
    @returns {IntersectionParams}
*/
IntersectionParams.newBezier3 = function (p1, p2, p3, p4) {
    return new IntersectionParams(IPTYPE.BEZIER3, [p1, p2, p3, p4]);
};

///////////////////////////////////////////////////////////////////
/**
    Creates IntersectionParams for circle.

    @param {Point2D} c
    @param {Number} r
    @returns {IntersectionParams}
*/
IntersectionParams.newCircle = function (c, r) {
    return new IntersectionParams(IPTYPE.CIRCLE, [c, r]);
};

///////////////////////////////////////////////////////////////////
/**
    Creates IntersectionParams for ellipse.

    @param {Point2D} c
    @param {Number} rx
    @param {Number} ry
    @returns {IntersectionParams}
*/
IntersectionParams.newEllipse = function (c, rx, ry) {
    return new IntersectionParams(IPTYPE.ELLIPSE, [c, rx, ry]);
};

///////////////////////////////////////////////////////////////////
/**
    Creates IntersectionParams for line.

    @param {Point2D} a1
    @param {Point2D} a2
    @returns {IntersectionParams}
*/
IntersectionParams.newLine = function (a1, a2) {
    return new IntersectionParams(IPTYPE.LINE, [a1, a2]);
};

///////////////////////////////////////////////////////////////////
/**
    Creates IntersectionParams for polygon.

    @param {Array<Point2D>} points
    @returns {IntersectionParams}
*/
IntersectionParams.newPolygon = function (points) {
    return new IntersectionParams(IPTYPE.POLYGON, [points]);
};

///////////////////////////////////////////////////////////////////
/**
    Creates IntersectionParams for polyline.

     @param {Array<Point2D>} points
    @returns {IntersectionParams}
*/
IntersectionParams.newPolyline = function (points) {
    return new IntersectionParams(IPTYPE.POLYLINE, [points]);
};


///////////////////////////////////////////////////////////////////
/**
    Creates IntersectionParams for rectangle.

    @param {Number} x
    @param {Number} y
    @param {Number} width
    @param {Number} height
    @returns {IntersectionParams}
*/
IntersectionParams.newRect = function (x, y, width, height) {
    var points = [];
    points.push(new Point2D(x, y));
    points.push(new Point2D(x + width, y));
    points.push(new Point2D(x + width, y + height));
    points.push(new Point2D(x, y + height));
    return new IntersectionParams(IPTYPE.RECT, [points]);
};

var degreesToRadians = function (angle) {
    return angle * Math.PI / 180;
};
///////////////////////////////////////////////////////////////////
/**
    Creates IntersectionParams for round rectangle, or for rectangle if rx and ry are 0.

    @param {Number} x
    @param {Number} y
    @param {Number} width
    @param {Number} height
    @param {Number} rx
    @param {Number} ry
    @returns {IntersectionParams}
*/
IntersectionParams.newRoundRect = function (x, y, width, height, rx, ry) {
    if (rx === 0 && ry === 0)
        return IntersectionParams.newRect(x, y, width, height);
    if (rx === 0)
        rx = ry;
    if (ry === 0)
        ry = rx;
    if (rx > width / 2)
        rx = width / 2;
    if (ry > height / 2)
        rx = height / 2;
    var shape = [];
    var x0 = x, x1 = x + rx, x2 = x + width - rx, x3 = x + width;
    var y0 = y, y1 = y + ry, y2 = y + height - ry, y3 = y + height;
    shape.push(new IntersectionParams(IPTYPE.ARC, [new Point2D(x1, y1), rx, ry, 0, degreesToRadians(180), degreesToRadians(90)]));
    shape.push(new IntersectionParams(IPTYPE.LINE, [new Point2D(x1, y0), new Point2D(x2, y0)]));
    shape.push(new IntersectionParams(IPTYPE.ARC, [new Point2D(x2, y1), rx, ry, 0, degreesToRadians(-90), degreesToRadians(90)]));
    shape.push(new IntersectionParams(IPTYPE.LINE, [new Point2D(x3, y1), new Point2D(x3, y2)]));
    shape.push(new IntersectionParams(IPTYPE.ARC, [new Point2D(x2, y2), rx, ry, 0, degreesToRadians(0), degreesToRadians(90)]));
    shape.push(new IntersectionParams(IPTYPE.LINE, [new Point2D(x2, y3), new Point2D(x1, y3)]));
    shape.push(new IntersectionParams(IPTYPE.ARC, [new Point2D(x1, y2), rx, ry, 0, degreesToRadians(90), degreesToRadians(90)]));
    shape.push(new IntersectionParams(IPTYPE.LINE, [new Point2D(x0, y2), new Point2D(x0, y1)]));
    shape[shape.length - 1].meta.closePath = true;
    return new IntersectionParams(IPTYPE.ROUNDRECT, [shape]);
};




function Token(type, text) {
    if (arguments.length > 0) {
        this.init(type, text);
    }
}
Token.prototype.init = function(type, text) {
    this.type = type;
    this.text = text;
};
Token.prototype.typeis = function(type) {
    return this.type == type;
}
var Path = {};
Path.COMMAND = 0;
Path.NUMBER = 1;
Path.EOD = 2;
Path.PARAMS = {
    A: ["rx", "ry", "x-axis-rotation", "large-arc-flag", "sweep-flag", "x", "y"],
    a: ["rx", "ry", "x-axis-rotation", "large-arc-flag", "sweep-flag", "x", "y"],
    C: ["x1", "y1", "x2", "y2", "x", "y"],
    c: ["x1", "y1", "x2", "y2", "x", "y"],
    H: ["x"],
    h: ["x"],
    L: ["x", "y"],
    l: ["x", "y"],
    M: ["x", "y"],
    m: ["x", "y"],
    Q: ["x1", "y1", "x", "y"],
    q: ["x1", "y1", "x", "y"],
    S: ["x2", "y2", "x", "y"],
    s: ["x2", "y2", "x", "y"],
    T: ["x", "y"],
    t: ["x", "y"],
    V: ["y"],
    v: ["y"],
    Z: [],
    z: []
};

function tokenize(d) {
    var tokens = new Array();
    while (d != "") {
        if (d.match(/^([ \t\r\n,]+)/)) {
            d = d.substr(RegExp.$1.length);
        } else if (d.match(/^([aAcChHlLmMqQsStTvVzZ])/)) {
            tokens[tokens.length] = new Token(Path.COMMAND, RegExp.$1);
            d = d.substr(RegExp.$1.length);
        } else if (d.match(/^(([-+]?[0-9]+(\.[0-9]*)?|[-+]?\.[0-9]+)([eE][-+]?[0-9]+)?)/)) {
            tokens[tokens.length] = new Token(Path.NUMBER, parseFloat(RegExp.$1));
            d = d.substr(RegExp.$1.length);
        } else {
            throw new Error("Unrecognized segment command: " + d);
        }
    }
    tokens[tokens.length] = new Token(Path.EOD, null);
    return tokens;
}

IntersectionParams.newPath = function(d) {
    var tokens = tokenize(d);
    var index = 0;
    var token = tokens[index];
    var mode = "BOD";
    var segments = [];

    while (!token.typeis(Path.EOD)) {
        var param_length;
        var params = new Array();
        if (mode == "BOD") {
            if (token.text == "M" || token.text == "m") {
                index++;
                param_length = Path.PARAMS[token.text].length;
                mode = token.text;
            } else {
                throw new Error("Path data must begin with a moveto command");
            }
        } else {
            if (token.typeis(Path.NUMBER)) {
                param_length = Path.PARAMS[mode].length;
            } else {
                index++;
                param_length = Path.PARAMS[token.text].length;
                mode = token.text;
            }
        }
        if ((index + param_length) < tokens.length) {
            for (var i = index; i < index + param_length; i++) {
                var number = tokens[i];
                if (number.typeis(Path.NUMBER)) params[params.length] = number.text;
                else throw new Error("Parameter type is not a number: " + mode + "," + number.text);
            }
            var segment;
            var length = segments.length;
            var previous = (length == 0) ? null : segments[length - 1];
            switch (mode) {
                case "A":
                    segment = new AbsoluteArcPath(params, previous);
                    break;
                case "C":
                    segment = new AbsoluteCurveto3(params, previous);
                    break;
                case "c":
                    segment = new RelativeCurveto3(params, previous);
                    break;
                case "H":
                    segment = new AbsoluteHLineto(params, previous);
                    break;
                case "L":
                    segment = new AbsoluteLineto(params, previous);
                    break;
                case "l":
                    segment = new RelativeLineto(params, previous);
                    break;
                case "M":
                    segment = new AbsoluteMoveto(params, previous);
                    break;
                case "m":
                    segment = new RelativeMoveto(params, previous);
                    break;
                case "Q":
                    segment = new AbsoluteCurveto2(params, previous);
                    break;
                case "q":
                    segment = new RelativeCurveto2(params, previous);
                    break;
                case "S":
                    segment = new AbsoluteSmoothCurveto3(params, previous);
                    break;
                case "s":
                    segment = new RelativeSmoothCurveto3(params, previous);
                    break;
                case "T":
                    segment = new AbsoluteSmoothCurveto2(params, previous);
                    break;
                case "t":
                    segment = new RelativeSmoothCurveto2(params, previous);
                    break;
                case "Z":
                    segment = new RelativeClosePath(params, previous);
                    break;
                case "z":
                    segment = new RelativeClosePath(params, previous);
                    break;
                default:
                    throw new Error("Unsupported segment type: " + mode);
            };
            segments.push(segment);
            index += param_length;
            token = tokens[index];
            if (mode == "M") mode = "L";
            if (mode == "m") mode = "l";
        } else {
            throw new Error("Path data ended before all parameters were found");
        }
    }

    var segmentParams = [];
    for(i=0; i<segments.length; i++) {
        var ip = segments[i].getIntersectionParams();
        if(ip) {
            segmentParams.push(ip);
        }
    }

    return new IntersectionParams(IPTYPE.PATH, [segmentParams]);
}


function AbsolutePathSegment(command, params, previous) {
    if (arguments.length > 0) this.init(command, params, previous);
};
AbsolutePathSegment.prototype.init = function(command, params, previous) {
    this.command = command;
    this.previous = previous;
    this.points = [];
    var index = 0;
    while (index < params.length) {
        this.points.push(new Point2D(params[index], params[index + 1]));
        index += 2;
    }
};
AbsolutePathSegment.prototype.getLastPoint = function() {
    return this.points[this.points.length - 1];
};
AbsolutePathSegment.prototype.getIntersectionParams = function() {
    return null;
};



function AbsoluteArcPath(params, previous) {
    if (arguments.length > 0) {
        this.init("A", params, previous);
    }
}
AbsoluteArcPath.prototype.init = function(command, params, previous) {
    var point = new Array();
    var y = params.pop();
    var x = params.pop();
    point.push(x, y);
    AbsoluteArcPath.superclass.init.call(this, command, point, previous);
    this.rx = parseFloat(params.shift());
    this.ry = parseFloat(params.shift());
    this.angle = parseFloat(params.shift());
    this.arcFlag = parseFloat(params.shift());
    this.sweepFlag = parseFloat(params.shift());
};
AbsoluteArcPath.prototype.getIntersectionParams = function() {
    return new IntersectionParams("Ellipse", [this.getCenter(), this.rx, this.ry]);
};
AbsoluteArcPath.prototype.getCenter = function() {
    var startPoint = this.previous.getLastPoint();
    var endPoint = this.points[0];
    var rx = this.rx;
    var ry = this.ry;
    var angle = this.angle * Math.PI / 180;
    var c = Math.cos(angle);
    var s = Math.sin(angle);
    var TOLERANCE = 1e-6;
    var halfDiff = startPoint.subtract(endPoint).divide(2);
    var x1p = halfDiff.x * c + halfDiff.y * s;
    var y1p = halfDiff.x * -s + halfDiff.y * c;
    var x1px1p = x1p * x1p;
    var y1py1p = y1p * y1p;
    var lambda = (x1px1p / (rx * rx)) + (y1py1p / (ry * ry));
    if (lambda > 1) {
        var factor = Math.sqrt(lambda);
        rx *= factor;
        ry *= factor;
    }
    var rxrx = rx * rx;
    var ryry = ry * ry;
    var rxy1 = rxrx * y1py1p;
    var ryx1 = ryry * x1px1p;
    var factor = (rxrx * ryry - rxy1 - ryx1) / (rxy1 + ryx1);
    if (Math.abs(factor) < TOLERANCE) factor = 0;
    var sq = Math.sqrt(factor);
    if (this.arcFlag == this.sweepFlag) sq = -sq;
    var mid = startPoint.add(endPoint).divide(2);
    var cxp = sq * rx * y1p / ry;
    var cyp = sq * -ry * x1p / rx;
    return new Point2D(cxp * c - cyp * s + mid.x, cxp * s + cyp * c + mid.y);
};



function AbsoluteCurveto2(params, previous) {
    if (arguments.length > 0) {
        this.init("Q", params, previous);
    }
}
AbsoluteCurveto2.prototype = new AbsolutePathSegment();
AbsoluteCurveto2.prototype.constructor = AbsoluteCurveto2;
AbsoluteCurveto2.superclass = AbsolutePathSegment.prototype;

AbsoluteCurveto2.prototype.getIntersectionParams = function() {
    return new IntersectionParams("Bezier2", [this.previous.getLastPoint(), this.points[0], this.points[1]]);
};



function AbsoluteCurveto3(params, previous) {
    if (arguments.length > 0) {
        this.init("C", params, previous);
    }
}
AbsoluteCurveto3.prototype = new AbsolutePathSegment();
AbsoluteCurveto3.prototype.constructor = AbsoluteCurveto3;
AbsoluteCurveto3.superclass = AbsolutePathSegment.prototype;

AbsoluteCurveto3.prototype.getLastControlPoint = function() {
    return this.points[1];
};
AbsoluteCurveto3.prototype.getIntersectionParams = function() {
    return new IntersectionParams("Bezier3", [this.previous.getLastPoint(), this.points[0], this.points[1], this.points[2]]);
};


function AbsoluteHLineto(params, previous) {
    if (arguments.length > 0) {
        this.init("H", params, previous);
    }
}
AbsoluteHLineto.prototype = new AbsolutePathSegment();
AbsoluteHLineto.prototype.constructor = AbsoluteHLineto;
AbsoluteHLineto.superclass = AbsolutePathSegment.prototype;

AbsoluteHLineto.prototype.init = function(command, params, previous) {
    var prevPoint = previous.getLastPoint();
    var point = new Array();
    point.push(params.pop(), prevPoint.y);
    AbsoluteHLineto.superclass.init.call(this, command, point, previous);
};


function AbsoluteLineto(params, previous) {
    if (arguments.length > 0) {
        this.init("L", params, previous);
    }
}
AbsoluteLineto.prototype = new AbsolutePathSegment();
AbsoluteLineto.prototype.constructor = AbsoluteLineto;
AbsoluteLineto.superclass = AbsolutePathSegment.prototype;

AbsoluteLineto.prototype.getIntersectionParams = function() {
    return new IntersectionParams("Line", [this.previous.getLastPoint(), this.points[0]]);
};



function AbsoluteMoveto(params, previous) {
    if (arguments.length > 0) {
        this.init("M", params, previous);
    }
}
AbsoluteMoveto.prototype = new AbsolutePathSegment();
AbsoluteMoveto.prototype.constructor = AbsoluteMoveto;
AbsoluteMoveto.superclass = AbsolutePathSegment.prototype;


function AbsoluteSmoothCurveto2(params, previous) {
    if (arguments.length > 0) {
        this.init("T", params, previous);
    }
}
AbsoluteSmoothCurveto2.prototype = new AbsolutePathSegment();
AbsoluteSmoothCurveto2.prototype.constructor = AbsoluteSmoothCurveto2;
AbsoluteSmoothCurveto2.superclass = AbsolutePathSegment.prototype;

AbsoluteSmoothCurveto2.prototype.getControlPoint = function() {
    var lastPoint = this.previous.getLastPoint();
    var point;
    if (this.previous.command.match(/^[QqTt]$/)) {
        var ctrlPoint = this.previous.getControlPoint();
        var diff = ctrlPoint.subtract(lastPoint);
        point = lastPoint.subtract(diff);
    } else {
        point = lastPoint;
    }
    return point;
};
AbsoluteSmoothCurveto2.prototype.getIntersectionParams = function() {
    return new IntersectionParams("Bezier2", [this.previous.getLastPoint(), this.getControlPoint(), this.points[0]]);
};


function AbsoluteSmoothCurveto3(params, previous) {
    if (arguments.length > 0) {
        this.init("S", params, previous);
    }
}
AbsoluteSmoothCurveto3.prototype = new AbsolutePathSegment();
AbsoluteSmoothCurveto3.prototype.constructor = AbsoluteSmoothCurveto3;
AbsoluteSmoothCurveto3.superclass = AbsolutePathSegment.prototype;

AbsoluteSmoothCurveto3.prototype.getFirstControlPoint = function() {
    var lastPoint = this.previous.getLastPoint();
    var point;
    if (this.previous.command.match(/^[SsCc]$/)) {
        var lastControl = this.previous.getLastControlPoint();
        var diff = lastControl.subtract(lastPoint);
        point = lastPoint.subtract(diff);
    } else {
        point = lastPoint;
    }
    return point;
};
AbsoluteSmoothCurveto3.prototype.getLastControlPoint = function() {
    return this.points[0];
};
AbsoluteSmoothCurveto3.prototype.getIntersectionParams = function() {
    return new IntersectionParams("Bezier3", [this.previous.getLastPoint(), this.getFirstControlPoint(), this.points[0], this.points[1]]);
};


function RelativePathSegment(command, params, previous) {
    if (arguments.length > 0) this.init(command, params, previous);
}
RelativePathSegment.prototype = new AbsolutePathSegment();
RelativePathSegment.prototype.constructor = RelativePathSegment;
RelativePathSegment.superclass = AbsolutePathSegment.prototype;

RelativePathSegment.prototype.init = function(command, params, previous) {
    this.command = command;
    this.previous = previous;
    this.points = [];
    var lastPoint;
    if (this.previous) lastPoint = this.previous.getLastPoint();
    else lastPoint = new Point2D(0, 0);
    var index = 0;
    while (index < params.length) {
        var point = new Point2D(lastPoint.x + params[index], lastPoint.y + params[index + 1]);
        this.points.push(point);
        index += 2;
    }
};

function RelativeClosePath(params, previous) {
    if (arguments.length > 0) {
        this.init("z", params, previous);
    }
}
RelativeClosePath.prototype = new RelativePathSegment();
RelativeClosePath.prototype.constructor = RelativeClosePath;
RelativeClosePath.superclass = RelativePathSegment.prototype;
RelativeClosePath.prototype.getLastPoint = function() {
    var current = this.previous;
    var point;
    while (current) {
        if (current.command.match(/^[mMzZ]$/)) {
            point = current.getLastPoint();
            break;
        }
        current = current.previous;
    }
    return point;
};
RelativeClosePath.prototype.getIntersectionParams = function() {
    return new IntersectionParams("Line", [this.previous.getLastPoint(), this.getLastPoint()]);
};


function RelativeCurveto2(params, previous) {
    if (arguments.length > 0) {
        this.init("q", params, previous);
    }
}
RelativeCurveto2.prototype = new RelativePathSegment();
RelativeCurveto2.prototype.constructor = RelativeCurveto2;
RelativeCurveto2.superclass = RelativePathSegment.prototype;

RelativeCurveto2.prototype.getControlPoint = function() {
    return this.points[0];
};
RelativeCurveto2.prototype.getIntersectionParams = function() {
    return new IntersectionParams("Bezier2", [this.previous.getLastPoint(), this.points[0], this.points[1]]);
};


function RelativeCurveto3(params, previous) {
    if (arguments.length > 0) {
        this.init("c", params, previous);
    }
}
RelativeCurveto3.prototype = new RelativePathSegment();
RelativeCurveto3.prototype.constructor = RelativeCurveto3;
RelativeCurveto3.superclass = RelativePathSegment.prototype;

RelativeCurveto3.prototype.getLastControlPoint = function() {
    return this.points[1];
};
RelativeCurveto3.prototype.getIntersectionParams = function() {
    return new IntersectionParams("Bezier3", [this.previous.getLastPoint(), this.points[0], this.points[1], this.points[2]]);
};


function RelativeLineto(params, previous) {
    if (arguments.length > 0) {
        this.init("l", params, previous);
    }
}
RelativeLineto.prototype = new RelativePathSegment();
RelativeLineto.prototype.constructor = RelativeLineto;
RelativeLineto.superclass = RelativePathSegment.prototype;

RelativeLineto.prototype.toString = function() {
    var points = new Array();
    var command = "";
    var lastPoint;
    var point;
    if (this.previous) lastPoint = this.previous.getLastPoint();
    else lastPoint = new Point(0, 0);
    point = this.points[0].subtract(lastPoint);
    if (this.previous.constructor != this.constuctor)
        if (this.previous.constructor != RelativeMoveto) cmd = this.command;
    return cmd + point.toString();
};
RelativeLineto.prototype.getIntersectionParams = function() {
    return new IntersectionParams("Line", [this.previous.getLastPoint(), this.points[0]]);
};



function RelativeMoveto(params, previous) {
    if (arguments.length > 0) {
        this.init("m", params, previous);
    }
}
RelativeMoveto.prototype = new RelativePathSegment();
RelativeMoveto.prototype.constructor = RelativeMoveto;
RelativeMoveto.superclass = RelativePathSegment.prototype;



function RelativeSmoothCurveto2(params, previous) {
    if (arguments.length > 0) {
        this.init("t", params, previous);
    }
}
RelativeSmoothCurveto2.prototype = new RelativePathSegment();
RelativeSmoothCurveto2.prototype.constructor = RelativeSmoothCurveto2;
RelativeSmoothCurveto2.superclass = RelativePathSegment.prototype;

RelativeSmoothCurveto2.prototype.getControlPoint = function() {
    var lastPoint = this.previous.getLastPoint();
    var point;
    if (this.previous.command.match(/^[QqTt]$/)) {
        var ctrlPoint = this.previous.getControlPoint();
        var diff = ctrlPoint.subtract(lastPoint);
        point = lastPoint.subtract(diff);
    } else {
        point = lastPoint;
    }
    return point;
};
RelativeSmoothCurveto2.prototype.getIntersectionParams = function() {
    return new IntersectionParams("Bezier2", [this.previous.getLastPoint(), this.getControlPoint(), this.points[0]]);
};



function RelativeSmoothCurveto3(params, previous) {
    if (arguments.length > 0) {
        this.init("s", params, previous);
    }
}
RelativeSmoothCurveto3.prototype = new RelativePathSegment();
RelativeSmoothCurveto3.prototype.constructor = RelativeSmoothCurveto3;
RelativeSmoothCurveto3.superclass = RelativePathSegment.prototype;

RelativeSmoothCurveto3.prototype.getFirstControlPoint = function() {
    var lastPoint = this.previous.getLastPoint();
    var point;
    if (this.previous.command.match(/^[SsCc]$/)) {
        var lastControl = this.previous.getLastControlPoint();
        var diff = lastControl.subtract(lastPoint);
        point = lastPoint.subtract(diff);
    } else {
        point = lastPoint;
    }
    return point;
};
RelativeSmoothCurveto3.prototype.getLastControlPoint = function() {
    return this.points[0];
};
RelativeSmoothCurveto3.prototype.getIntersectionParams = function() {
    return new IntersectionParams("Bezier3", [this.previous.getLastPoint(), this.getFirstControlPoint(), this.points[0], this.points[1]]);
};


module.exports = IntersectionParams;

},{"kld-affine":128}],127:[function(require,module,exports){
/**
 *
 *  Intersection.js
 *
 *  copyright 2002, 2013 Kevin Lindsey
 *
 *  contribution {@link http://github.com/Quazistax/kld-intersections}
 *      @copyright 2015 Robert Benko (Quazistax) <quazistax@gmail.com>
 *      @license MIT
 */

var Point2D = require('kld-affine').Point2D;
var Vector2D = require('kld-affine').Vector2D;
var Matrix2D = require('kld-affine').Matrix2D;
var Polynomial = require('kld-polynomial').Polynomial;
var IntersectionParams = require('./IntersectionParams');
var Intersection = require('./Intersection');

var IPTYPE = IntersectionParams.TYPE;



/**
 *  bezout
 *
 *  This code is based on MgcIntr2DElpElp.cpp written by David Eberly.  His
 *  code along with many other excellent examples are avaiable at his site:
 *  http://www.geometrictools.com
 *
 *  @param {Array<Point2D>} e1
 *  @param {Array<Point2D>} e2
 *  @returns {Polynomial}
 */
function bezout(e1, e2) {
    var AB    = e1[0]*e2[1] - e2[0]*e1[1];
    var AC    = e1[0]*e2[2] - e2[0]*e1[2];
    var AD    = e1[0]*e2[3] - e2[0]*e1[3];
    var AE    = e1[0]*e2[4] - e2[0]*e1[4];
    var AF    = e1[0]*e2[5] - e2[0]*e1[5];
    var BC    = e1[1]*e2[2] - e2[1]*e1[2];
    var BE    = e1[1]*e2[4] - e2[1]*e1[4];
    var BF    = e1[1]*e2[5] - e2[1]*e1[5];
    var CD    = e1[2]*e2[3] - e2[2]*e1[3];
    var DE    = e1[3]*e2[4] - e2[3]*e1[4];
    var DF    = e1[3]*e2[5] - e2[3]*e1[5];
    var BFpDE = BF + DE;
    var BEmCD = BE - CD;

    return new Polynomial(
        AB*BC - AC*AC,
        AB*BEmCD + AD*BC - 2*AC*AE,
        AB*BFpDE + AD*BEmCD - AE*AE - 2*AC*AF,
        AB*DF + AD*BFpDE - 2*AE*AF,
        AD*DF - AF*AF
    );
}

/**
    Removes from intersection points those points that are not between two rays determined by arc parameters.
    Rays begin at ellipse center and go through arc startPoint/endPoint.

    @param {Intersection} intersection - will be modified and returned
    @param {Point2D} c - center of arc ellipse
    @param {Number} rx
    @param {Number} ry
    @param {Number} phi - in radians
    @param {Number} th1 - in radians
    @param {Number} dth - in radians
    @param {Matrix2D} [m] - arc transformation matrix
    @returns {Intersection}
*/
function removePointsNotInArc(intersection, c, rx, ry, phi, th1, dth, m) {
    if (intersection.points.length === 0) return intersection;
    if (m && !m.isIdentity())
        var mp = m.inverse();
    var np = [];
    var vx = new Vector2D(1, 0);
    var pi2 = Math.PI * 2;
    var wasNeg = dth < 0;
    var wasBig = Math.abs(dth) > Math.PI;
    var m1 = new Matrix2D().scaleNonUniform(1, ry / rx).rotate(th1);
    var m2 = new Matrix2D().scaleNonUniform(1, ry / rx).rotate(th1 + dth);

    th1 = (vx.angleBetween(vx.transform(m1)) + pi2) % pi2;
    dth = vx.transform(m1).angleBetween(vx.transform(m2));
    dth = (wasBig ? pi2 - Math.abs(dth) : Math.abs(dth)) * (wasNeg ? -1 : 1);
    var m3 = new Matrix2D().rotate(phi).multiply(m1);

    for (var i = 0, p, a; i < intersection.points.length; i++) {
        p = intersection.points[i];
        a = vx.transform(m3).angleBetween(Vector2D.fromPoints(c, (mp) ? p.transform(mp) : p));
        if (dth >= 0) {
            a = (a + 2 * pi2) % pi2;
            if (a <= dth)
                np.push(p);
        } else {
            a = (a - 2 * pi2) % pi2;
            if (a >= dth)
                np.push(p);
        }
    }
    intersection.points = np;
    return intersection;
};

/**
    points1 will be modified, points close (almost identical) to any point in points2 will be removed

    @param {Array<Point2D>} points1 - will be modified, points close to any point in points2 will be removed
    @param {Array<Point2D>} points2
*/
function removeClosePoints(points1, points2) {
    if (points1.length === 0 || points2.length === 0)
        return;
    var maxf = function (p, v) { if (p < v.x) p = v.x; if (p < v.y) p = v.y; return p; };
    var max = points1.reduce(maxf, 0);
    max = points2.reduce(maxf, max);
    var ERRF = 1e-15;
    var ZEROepsilon = 100 * max * ERRF * Math.SQRT2;
    var j;
    for (var i = 0; i < points1.length;) {
        for (j = 0; j < points2.length; j++) {
            if (points1[i].distanceFrom(points2[j]) <= ZEROepsilon) {
                points1.splice(i, 1);
                break;
            }
        }
        if (j == points2.length)
            i++;
    }
}

// The basic intersection functions for all SVG shapes expect bezier curves
// If you need to support bezier curves, plug in the functions/bezier module
// like this: intersect.plugin( require('svg-intersections/lib/functions/bezier') )
var intersectionFunctions = {

    /**
        intersectPathShape

        @param {IntersectionParams} path
        @param {IntersectionParams} shape
        @param {Matrix2D} [m1]
        @param {Matrix2D} [m2]
        @returns {Intersection}
    */
    intersectPathShape: function (path, shape, m1, m2) {
        var result = new Intersection();
        var pathParams = path.params[0];
        var inter0;
        var previnter;
        for (var inter, i = 0; i < pathParams.length; i++) {
            inter = intersect(pathParams[i], shape, m1, m2);
            if (!inter0)
                inter0 = inter;
            if (previnter) {
                removeClosePoints(previnter.points, inter.points);
                result.appendPoints(previnter.points);
            }
            previnter = inter;
        }
        if (previnter) {
            result.appendPoints(previnter.points);
        }
        return result;
    },


    /**
        intersectLinesShape

        @param {IntersectionParams} lines - IntersectionParams with points as first parameter (like types RECT, POLYLINE or POLYGON)
        @param {IntersectionParams} shape - IntersectionParams of other shape
        @param {Matrix2D} [m1]
        @param {Matrix2D} [m2]
        @param {Boolean} [closed] - if set, determines if line between first and last point will be taken into callculation too. If not set, it's true for RECT and POLYGON, false for other <b>lines</b> types.
        @returns {Intersection}
    */
    intersectLinesShape: function (lines, shape, m1, m2, closed) {
        var IPTYPE = IntersectionParams.TYPE;
        var line_points = lines.params[0];
        var ip = new IntersectionParams(IPTYPE.LINE, [0, 0]);
        var result = new Intersection();
        var inter, i;
        var intersectLine = function (i1, i2) {
            ip.params[0] = line_points[i1];
            ip.params[1] = line_points[i2];
            inter = intersect(ip, shape, m1, m2);
            removeClosePoints(inter.points, [line_points[i2]]);
            result.appendPoints(inter.points);
        }
        for (i = 0; i < line_points.length - 1; i++) {
            intersectLine(i, i + 1);
        }
        if (typeof closed !== 'undefined' && closed || lines.type === IPTYPE.RECT || lines.type === IPTYPE.POLYGON) {
            intersectLine(line_points.length - 1, 0);
        }
        return result;
    },

    ///////////////////////////////////////////////////////////////////
    /**
        intersectArcShape

        @param {IntersectionParams} arc
        @param {IntersectionParams} shape
        @param {Matrix2D} [m1]
        @param {Matrix2D} [m2]
        @returns {Intersection}
    */
    intersectArcShape: function (arc, shape, m1, m2) {
        m1 = m1 || Matrix2D.IDENTITY;
        m2 = m2 || Matrix2D.IDENTITY;
        var c1 = arc.params[0],
            rx1 = arc.params[1],
            ry1 = arc.params[2],
            phi1 = arc.params[3],
            th1 = arc.params[4],
            dth1 = arc.params[5];

        var res;
        if (m1.isIdentity() && phi1 === 0) {
            res = intersect(IntersectionParams.newEllipse(c1, rx1, ry1), shape, m1, m2);
        }
        else {
            m1 = m1.multiply(Matrix2D.IDENTITY.translate(c1.x, c1.y).rotate(phi1));
            c1 = new Point2D(0, 0);
            phi1 = 0;
            res = intersect(IntersectionParams.newEllipse(c1, rx1, ry1), shape, m1, m2);
        }
        res = removePointsNotInArc(res, c1, rx1, ry1, phi1, th1, dth1, m1);
        return res;
    },

    /**
     *  Finds intersection points of two ellipses. <br/>
     *
     *  This code is based on MgcIntr2DElpElp.cpp written by David Eberly. His
     *  code along with many other excellent examples are avaiable at his site:
     *  http://www.geometrictools.com
     *
     *  Changes - 2015 Robert Benko (Quazistax)
     *
     *  @param {Point2D} c1
     *  @param {Number} rx1
     *  @param {Number} ry1
     *  @param {Point2D} c2
     *  @param {Number} rx2
     *  @param {Number} ry2
     *  @returns {Intersection}
     */
    intersectEllipseEllipse: function (c1, rx1, ry1, c2, rx2, ry2) {
        var a = [
            ry1 * ry1, 0, rx1 * rx1, -2 * ry1 * ry1 * c1.x, -2 * rx1 * rx1 * c1.y,
            ry1 * ry1 * c1.x * c1.x + rx1 * rx1 * c1.y * c1.y - rx1 * rx1 * ry1 * ry1
        ];
        var b = [
            ry2 * ry2, 0, rx2 * rx2, -2 * ry2 * ry2 * c2.x, -2 * rx2 * rx2 * c2.y,
            ry2 * ry2 * c2.x * c2.x + rx2 * rx2 * c2.y * c2.y - rx2 * rx2 * ry2 * ry2
        ];

        var yPoly = bezout(a, b);
        var yRoots = yPoly.getRoots();
        var epsilon = 1e-3;
        var norm0 = (a[0] * a[0] + 2 * a[1] * a[1] + a[2] * a[2]) * epsilon;
        var norm1 = (b[0] * b[0] + 2 * b[1] * b[1] + b[2] * b[2]) * epsilon;
        var result = new Intersection();

        var i;
        //Handling root calculation error causing not detecting intersection
        var clip = function (val, min, max) { return Math.max(min, Math.min(max, val)); };
        for (i = 0 ; i < yRoots.length; i++) {
            yRoots[i] = clip(yRoots[i], c1.y - ry1, c1.y + ry1);
            yRoots[i] = clip(yRoots[i], c2.y - ry2, c2.y + ry2);
        }

        //For detection of multiplicated intersection points
        yRoots.sort(function (a, b) { return a - b; });
        var rootPointsN = [];

        for (var y = 0; y < yRoots.length; y++) {
            var xPoly = new Polynomial(
                a[0],
                a[3] + yRoots[y] * a[1],
                a[5] + yRoots[y] * (a[4] + yRoots[y] * a[2])
            );
            var ERRF = 1e-15;
            if (Math.abs(xPoly.coefs[0]) < 10 * ERRF * Math.abs(xPoly.coefs[2]))
                xPoly.coefs[0] = 0;
            var xRoots = xPoly.getRoots();

            rootPointsN.push(0);
            for (var x = 0; x < xRoots.length; x++) {
                var test =
                    (a[0] * xRoots[x] + a[1] * yRoots[y] + a[3]) * xRoots[x] +
                    (a[2] * yRoots[y] + a[4]) * yRoots[y] + a[5];
                if (Math.abs(test) < norm0) {
                    test =
                        (b[0] * xRoots[x] + b[1] * yRoots[y] + b[3]) * xRoots[x] +
                        (b[2] * yRoots[y] + b[4]) * yRoots[y] + b[5];
                    if (Math.abs(test) < norm1) {
                        result.appendPoint(new Point2D(xRoots[x], yRoots[y]));
                        rootPointsN[y] += 1;
                    }
                }
            }
        }

        if (result.points.length <= 0)
            return result;

        //Removal of multiplicated intersection points
        var pts = result.points;
        if (pts.length == 8) {
            pts = pts.splice(0, 6);
            pts.splice(2, 2);
        }
        else if (pts.length == 7) {
            pts = pts.splice(0, 6);
            pts.splice(2, 2);
            pts.splice(rootPointsN.indexOf(1), 1);
        }
        else if (pts.length == 6) {
            pts.splice(2, 2);
            //console.log('ElEl 6pts: N: ' + rootPointsN.toString());
            if (rootPointsN.indexOf(0) > -1) {
                if (pts[0].distanceFrom(pts[1]) < pts[2].distanceFrom(pts[3])) {
                    pts.splice(0, 1);
                }
                else {
                    pts.splice(2, 1);
                }
            }
            else if (rootPointsN[0] == rootPointsN[3]) {
                pts.splice(1, 2);
            }
        }
        else if (pts.length == 4) {
            if (
                (yRoots.length == 2)
            || (yRoots.length == 4 && (rootPointsN[0] == 2 && rootPointsN[1] == 2 || rootPointsN[2] == 2 && rootPointsN[3] == 2))
            ) {
                pts.splice(2, 2);
            }
        }
        else if (pts.length == 3 || pts.length == 5) {
            i = rootPointsN.indexOf(2);
            if (i > -1) {
                if (pts.length == 3)
                    i = i % 2;
                var ii = i + (i % 2 ? -1 : 2);
                var d1, d2, d3;
                d1 = pts[i].distanceFrom(pts[i + 1]);
                d2 = pts[i].distanceFrom(pts[ii]);
                d3 = pts[i + 1].distanceFrom(pts[ii]);
                if (d1 < d2 && d1 < d3) {
                    pts.splice(i, 1);
                }
                else {
                    pts.splice(ii, 1);
                }
            }
        }

        var poly = yPoly;
        var ZEROepsilon = yPoly.zeroErrorEstimate();
        ZEROepsilon *= 100 * Math.SQRT2;
        for (i = 0; i < pts.length - 1;) {
            if (pts[i].distanceFrom(pts[i + 1]) < ZEROepsilon) {
                pts.splice(i + 1, 1);
                continue;
            }
            i++;
        }

        result.points = pts;
        return result;
    },


    /**
     *  intersectEllipseLine
     *
     *  NOTE: Rotation will need to be added to this function
     *
     *  @param {Point2D} c
     *  @param {Number} rx
     *  @param {Number} ry
     *  @param {Point2D} a1
     *  @param {Point2D} a2
     *  @returns {Intersection}
     */
    intersectEllipseLine: function(c, rx, ry, a1, a2) {
        var result;
        var origin = new Vector2D(a1.x, a1.y);
        var dir    = Vector2D.fromPoints(a1, a2);
        var center = new Vector2D(c.x, c.y);
        var diff   = origin.subtract(center);
        var mDir   = new Vector2D( dir.x/(rx*rx),  dir.y/(ry*ry)  );
        var mDiff  = new Vector2D( diff.x/(rx*rx), diff.y/(ry*ry) );

        var a = dir.dot(mDir);
        var b = dir.dot(mDiff);
        var c = diff.dot(mDiff) - 1.0;
        var d = b*b - a*c;

        var ERRF = 1e-15;
        var ZEROepsilon = 10 * Math.max(Math.abs(a), Math.abs(b), Math.abs(c)) * ERRF;
        if (Math.abs(d) < ZEROepsilon) {
            d = 0;
        }

        if ( d < 0 ) {
            result = new Intersection("Outside");
        } else if ( d > 0 ) {
            var root = Math.sqrt(d);
            var t_a  = (-b - root) / a;
            var t_b  = (-b + root) / a;

            t_b = (t_b > 1) ? t_b - ERRF : (t_b < 0) ? t_b + ERRF : t_b;
            t_a = (t_a > 1) ? t_a - ERRF : (t_a < 0) ? t_a + ERRF : t_a;

            if ( (t_a < 0 || 1 < t_a) && (t_b < 0 || 1 < t_b) ) {
                if ( (t_a < 0 && t_b < 0) || (t_a > 1 && t_b > 1) )
                    result = new Intersection("Outside");
                else
                    result = new Intersection("Inside");
            } else {
                result = new Intersection();
                if ( 0 <= t_a && t_a <= 1 )
                    result.appendPoint( a1.lerp(a2, t_a) );
                if ( 0 <= t_b && t_b <= 1 )
                    result.appendPoint( a1.lerp(a2, t_b) );
            }
        } else {
            var t = -b/a;
            if ( 0 <= t && t <= 1 ) {
                result = new Intersection();
                result.appendPoint( a1.lerp(a2, t) );
            } else {
                result = new Intersection("Outside");
            }
        }

        return result;
    },


    /**
     *  intersectLineLine
     *
     *  @param {Point2D} a1
     *  @param {Point2D} a2
     *  @param {Point2D} b1
     *  @param {Point2D} b2
     *  @returns {Intersection}
     */
    intersectLineLine: function(a1, a2, b1, b2) {
        var result;
        var ua_t = (b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x);
        var ub_t = (a2.x - a1.x) * (a1.y - b1.y) - (a2.y - a1.y) * (a1.x - b1.x);
        var u_b  = (b2.y - b1.y) * (a2.x - a1.x) - (b2.x - b1.x) * (a2.y - a1.y);

        if ( u_b !== 0 ) {
            var ua = ua_t / u_b;
            var ub = ub_t / u_b;

            if ( 0 <= ua && ua <= 1 && 0 <= ub && ub <= 1 ) {
                result = new Intersection();
                result.points.push(
                    new Point2D(
                        a1.x + ua * (a2.x - a1.x),
                        a1.y + ua * (a2.y - a1.y)
                    )
                );
            } else {
                result = new Intersection();
            }
        } else {
            if ( ua_t === 0 || ub_t === 0 ) {
                result = new Intersection("Coincident");
            } else {
                result = new Intersection("Parallel");
            }
        }

        return result;
    },


    /**
     *  intersectRayRay
     *
     *  @param {Point2D} a1
     *  @param {Point2D} a2
     *  @param {Point2D} b1
     *  @param {Point2D} b2
     *  @returns {Intersection}
     */
    intersectRayRay: function(a1, a2, b1, b2) {
        var result;

        var ua_t = (b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x);
        var ub_t = (a2.x - a1.x) * (a1.y - b1.y) - (a2.y - a1.y) * (a1.x - b1.x);
        var u_b  = (b2.y - b1.y) * (a2.x - a1.x) - (b2.x - b1.x) * (a2.y - a1.y);

        if ( u_b !== 0 ) {
            var ua = ua_t / u_b;

            result = new Intersection();
            result.points.push(
                new Point2D(
                    a1.x + ua * (a2.x - a1.x),
                    a1.y + ua * (a2.y - a1.y)
                )
            );
        } else {
            if ( ua_t === 0 || ub_t === 0 ) {
                result = new Intersection("Coincident");
            } else {
                result = new Intersection("Parallel");
            }
        }

        return result;
    }
};

var composedShapeMethods = {};
composedShapeMethods[IPTYPE.PATH] = intersectionFunctions.intersectPathShape;
composedShapeMethods[IPTYPE.POLYLINE] = intersectionFunctions.intersectLinesShape;
composedShapeMethods[IPTYPE.POLYGON] = intersectionFunctions.intersectLinesShape;
composedShapeMethods[IPTYPE.RECT] = intersectionFunctions.intersectLinesShape;
composedShapeMethods[IPTYPE.ROUNDRECT] = intersectionFunctions.intersectPathShape;
composedShapeMethods[IPTYPE.ARC] = intersectionFunctions.intersectArcShape;



function intersect(shape1, shape2, m1, m2) {
    var ip1 = shape1;
    var ip2 = shape2;
    var result;

    if (ip1 !== null && ip2 !== null) {
        var method;
        if (method = composedShapeMethods[ip1.type]) {
            result = method(ip1, ip2, m1, m2);
        }
        else if (method = composedShapeMethods[ip2.type]) {
            result = method(ip2, ip1, m2, m1);
        }
        else {
            var params;

            var params1, params2, type1, type2;

            if (ip1.type === IPTYPE.CIRCLE) {
                params1 = [ip1.params[0], ip1.params[1], ip1.params[1]];
                type1 = IPTYPE.ELLIPSE;
            }
            else {
                params1 = ip1.params.slice();
                type1 = ip1.type;
            }

            if (ip2.type === IPTYPE.CIRCLE) {
                params2 = [ip2.params[0], ip2.params[1], ip2.params[1]];
                type2 = IPTYPE.ELLIPSE;
            }
            else {
                params2 = ip2.params.slice();
                type2 = ip2.type;
            }

            //var m1 = new Matrix2D(), m2 = new Matrix2D();
            var SMF = 1;
            var itm;
            var useCTM = (m1 instanceof Matrix2D && m2 instanceof Matrix2D);// && (!m1.isIdentity() || !m2.isIdentity()));
            if (useCTM) {
                if (type1 === IPTYPE.ELLIPSE && type2 === IPTYPE.ELLIPSE) {
                    var m1_, m2_;
                    var d2;
                    var c1 = params1[0], rx1 = params1[1], ry1 = params1[2];
                    var c2 = params2[0], rx2 = params2[1], ry2 = params2[2];

                    m1 = m1.multiply(Matrix2D.IDENTITY.translate(c1.x, c1.y).scaleNonUniform(rx1 / SMF, ry1 / SMF));
                    c1 = new Point2D(0, 0);
                    rx1 = ry1 = SMF;

                    m2 = m2.multiply(Matrix2D.IDENTITY.translate(c2.x, c2.y).scaleNonUniform(rx2, ry2));
                    c2 = new Point2D(0, 0);
                    rx2 = ry2 = 1;

                    d2 = m1.inverse().multiply(m2).getDecompositionTRSR();
                    m1_ = d2.R.inverse().multiply(d2.T.inverse());
                    m2_ = d2.S;

                    rx2 = m2_.a;
                    ry2 = m2_.d;
                    c1 = c1.transform(m1_);
                    itm = m1.multiply(m1_.inverse());

                    params1[0] = c1;
                    params1[1] = rx1;
                    params1[2] = ry1;
                    params2[0] = c2;
                    params2[1] = rx2;
                    params2[2] = ry2;
                }
                else {
                    var transParams = function (type, params, m) {
                        var transParam = function (i) {
                            params[i] = params[i].transform(m);
                        }

                        if (type === IPTYPE.LINE) {
                            transParam(0);
                            transParam(1);
                        }
                        else if (type === IPTYPE.BEZIER2) {
                            transParam(0);
                            transParam(1);
                            transParam(2);
                        }
                        else if (type === IPTYPE.BEZIER3) {
                            transParam(0);
                            transParam(1);
                            transParam(2);
                            transParam(3);
                        }
                        else {
                            throw new Error('Unknown shape: ' + type);
                        }
                    }

                    if (type2 === IPTYPE.ELLIPSE) {
                        var tmp;
                        tmp = params2; params2 = params1; params1 = tmp;
                        tmp = type2; type2 = type1; type1 = tmp;
                        tmp = m2; m2 = m1; m1 = tmp;
                    }

                    if (type1 === IPTYPE.ELLIPSE) {
                        var c1 = params1[0], rx1 = params1[1], ry1 = params1[2];

                        m1 = m1.multiply(Matrix2D.IDENTITY.translate(c1.x, c1.y).scaleNonUniform(rx1 / SMF, ry1 / SMF));
                        c1 = new Point2D(0, 0);
                        rx1 = ry1 = SMF;

                        m2_ = m1.inverse().multiply(m2);
                        transParams(type2, params2, m2_);

                        itm = m1;

                        params1[0] = c1;
                        params1[1] = rx1;
                        params1[2] = ry1;
                    }
                    else {
                        transParams(type1, params1, m1);
                        transParams(type2, params2, m2);
                        itm = Matrix2D.IDENTITY;
                    }
                }
            }

            if (type1 < type2) {
                method = "intersect" + type1 + type2;
                params = params1.concat(params2);
            } else {
                method = "intersect" + type2 + type1;
                params = params2.concat(params1);
            }

            result = intersectionFunctions[method].apply(null, params);

            if (useCTM) {
                for (var i = 0; i < result.points.length; i++) {
                    result.points[i] = result.points[i].transform(itm);
                }
            }
        }
    } else {
        result = new Intersection();
    }

    return result;
}

intersect.plugin = function() {
    for(var i = 0; i < argLength; i++) {
        var arg = arguments[i];
        for(var key in arg) {
            if(arg.hasOwnProperty(key)) {
                intersectionFunctions[key] = arg[key];
            }
        }
    }
}

module.exports = intersect;




},{"./Intersection":125,"./IntersectionParams":126,"kld-affine":128,"kld-polynomial":132}],128:[function(require,module,exports){
// expose classes

exports.Point2D = require('./lib/Point2D');
exports.Vector2D = require('./lib/Vector2D');
exports.Matrix2D = require('./lib/Matrix2D');

},{"./lib/Matrix2D":129,"./lib/Point2D":130,"./lib/Vector2D":131}],129:[function(require,module,exports){
/**
 *
 *   Matrix2D.js
 *
 *   copyright 2001-2002, 2013 Kevin Lindsey
 *
 */

/**
 *  Matrix2D
 *
 *  @param {Number} a
 *  @param {Number} b
 *  @param {Number} c
 *  @param {Number} d
 *  @param {Number} e
 *  @param {Number} f
 *  @returns {Matrix2D}
 */
function Matrix2D(a, b, c, d, e, f) {
    Object.defineProperties(this, {
        "a": {
            value: (a !== undefined) ? a : 1,
            writable: false,
            enumerable: true,
            configurable: false
        },
        "b": {
            value: (b !== undefined) ? b : 0,
            writable: false,
            enumerable: true,
            configurable: false
        },
        "c": {
            value: (c !== undefined) ? c : 0,
            writable: false,
            enumerable: true,
            configurable: false
        },
        "d": {
            value: (d !== undefined) ? d : 1,
            writable: false,
            enumerable: true,
            configurable: false
        },
        "e": {
            value: (e !== undefined) ? e : 0,
            writable: false,
            enumerable: true,
            configurable: false
        },
        "f": {
            value: (f !== undefined) ? f : 0,
            writable: false,
            enumerable: true,
            configurable: false
        }
    });
    // this.a = (a !== undefined) ? a : 1;
    // this.b = (b !== undefined) ? b : 0;
    // this.c = (c !== undefined) ? c : 0;
    // this.d = (d !== undefined) ? d : 1;
    // this.e = (e !== undefined) ? e : 0;
    // this.f = (f !== undefined) ? f : 0;
}

/**
 *  Identity matrix
 *
 *  @returns {Matrix2D}
 */
Matrix2D.IDENTITY = new Matrix2D(1, 0, 0, 1, 0, 0);

// TODO: rotate, skew, etc. matrices as well?

/**
 *  multiply
 *
 *  @pararm {Matrix2D} that
 *  @returns {Matrix2D}
 */
Matrix2D.prototype.multiply = function(that) {
    return new Matrix2D(
        this.a * that.a + this.c * that.b,
        this.b * that.a + this.d * that.b,
        this.a * that.c + this.c * that.d,
        this.b * that.c + this.d * that.d,
        this.a * that.e + this.c * that.f + this.e,
        this.b * that.e + this.d * that.f + this.f
    );
};

/**
 *  inverse
 *
 *  @returns {Matrix2D}
 */
Matrix2D.prototype.inverse = function() {
    var det1 = this.a * this.d - this.b * this.c;

    if ( det1 == 0.0 )
        throw("Matrix is not invertible");

    var idet = 1.0 / det1;
    var det2 = this.f * this.c - this.e * this.d;
    var det3 = this.e * this.b - this.f * this.a;

    return new Matrix2D(
        this.d * idet,
       -this.b * idet,
       -this.c * idet,
        this.a * idet,
          det2 * idet,
          det3 * idet
    );
};

/**
 *  translate
 *
 *  @param {Number} tx
 *  @param {Number} ty
 *  @returns {Matrix2D}
 */
Matrix2D.prototype.translate = function(tx, ty) {
    return new Matrix2D(
        this.a,
        this.b,
        this.c,
        this.d,
        this.a * tx + this.c * ty + this.e,
        this.b * tx + this.d * ty + this.f
    );
};

/**
 *  scale
 *
 *  @param {Number} scale
 *  @returns {Matrix2D}
 */
Matrix2D.prototype.scale = function(scale) {
    return new Matrix2D(
        this.a * scale,
        this.b * scale,
        this.c * scale,
        this.d * scale,
        this.e,
        this.f
    );
};

/**
 *  scaleAt
 *
 *  @param {Number} scale
 *  @param {Point2D} center
 *  @returns {Matrix2D}
 */
Matrix2D.prototype.scaleAt = function(scale, center) {
    var dx = center.x - scale * center.x;
    var dy = center.y - scale * center.y;

    return new Matrix2D(
        this.a * scale,
        this.b * scale,
        this.c * scale,
        this.d * scale,
        this.a * dx + this.c * dy + this.e,
        this.b * dx + this.d * dy + this.f
    );
};

/**
 *  scaleNonUniform
 *
 *  @param {Number} scaleX
 *  @param {Number} scaleY
 *  @returns {Matrix2D}
 */
Matrix2D.prototype.scaleNonUniform = function(scaleX, scaleY) {
    return new Matrix2D(
        this.a * scaleX,
        this.b * scaleX,
        this.c * scaleY,
        this.d * scaleY,
        this.e,
        this.f
    );
};

/**
 *  scaleNonUniformAt
 *
 *  @param {Number} scaleX
 *  @param {Number} scaleY
 *  @param {Point2D} center
 *  @returns {Matrix2D}
 */
Matrix2D.prototype.scaleNonUniformAt = function(scaleX, scaleY, center) {
    var dx = center.x - scaleX * center.x;
    var dy = center.y - scaleY * center.y;

    return new Matrix2D(
        this.a * scaleX,
        this.b * scaleX,
        this.c * scaleY,
        this.d * scaleY,
        this.a * dx + this.c * dy + this.e,
        this.b * dx + this.d * dy + this.f
    );
};

/**
 *  rotate
 *
 *  @param {Number} radians
 *  @returns {Matrix2D}
 */
Matrix2D.prototype.rotate = function(radians) {
    var c = Math.cos(radians);
    var s = Math.sin(radians);

    return new Matrix2D(
        this.a *  c + this.c * s,
        this.b *  c + this.d * s,
        this.a * -s + this.c * c,
        this.b * -s + this.d * c,
        this.e,
        this.f
    );
};

/**
 *  rotateAt
 *
 *  @param {Number} radians
 *  @param {Point2D} center
 *  @result {Matrix2D}
 */
Matrix2D.prototype.rotateAt = function(radians, center) {
    var c = Math.cos(radians);
    var s = Math.sin(radians);
    var t1 = -center.x + center.x * c - center.y * s;
    var t2 = -center.y + center.y * c + center.x * s;

    return new Matrix2D(
        this.a *  c + this.c * s,
        this.b *  c + this.d * s,
        this.a * -s + this.c * c,
        this.b * -s + this.d * c,
        this.a * t1 + this.c * t2 + this.e,
        this.b * t1 + this.d * t2 + this.f
    );
};

/**
 *  rotateFromVector
 *
 *  @param {Vector2D}
 *  @returns {Matrix2D}
 */
Matrix2D.prototype.rotateFromVector = function(vector) {
    var unit = vector.unit();
    var c = unit.x; // cos
    var s = unit.y; // sin

    return new Matrix2D(
        this.a *  c + this.c * s,
        this.b *  c + this.d * s,
        this.a * -s + this.c * c,
        this.b * -s + this.d * c,
        this.e,
        this.f
    );
};

/**
 *  flipX
 *
 *  @returns {Matrix2D}
 */
Matrix2D.prototype.flipX = function() {
    return new Matrix2D(
        -this.a,
        -this.b,
         this.c,
         this.d,
         this.e,
         this.f
    );
};

/**
 *  flipY
 *
 *  @returns {Matrix2D}
 */
Matrix2D.prototype.flipY = function() {
    return new Matrix2D(
         this.a,
         this.b,
        -this.c,
        -this.d,
         this.e,
         this.f
    );
};

/**
 *  skewX
 *
 *  @pararm {Number} radians
 *  @returns {Matrix2D}
 */
Matrix2D.prototype.skewX = function(radians) {
    var t = Math.tan(radians);

    return new Matrix2D(
        this.a,
        this.b,
        this.a * t + this.c,
        this.b * t + this.d,
        this.e,
        this.f
    );
};

// TODO: skewXAt

/**
 *  skewY
 *
 *  @pararm {Number} radians
 *  @returns {Matrix2D}
 */
Matrix2D.prototype.skewY = function(radians) {
    var t = Math.tan(angle);

    return matrix_new(
        this.a + this.c * t,
        this.b + this.d * t,
        this.c,
        this.d,
        this.e,
        this.f
    );
};

// TODO: skewYAt

/**
 *  isIdentity
 *
 *  @returns {Boolean}
 */
Matrix2D.prototype.isIdentity = function() {
    return (
        this.a === 1.0 &&
        this.b === 0.0 &&
        this.c === 0.0 &&
        this.d === 1.0 &&
        this.e === 0.0 &&
        this.f === 0.0
    );
};

/**
 *  isInvertible
 *
 *  @returns {Boolean}
 */
Matrix2D.prototype.isInvertible = function() {
    this.a * this.d - this.b * this.c !== 0.0;
};

/**
 *  getScale
 *
 *  @returns {scaleX: Number, scaleY: Number}
 */
Matrix2D.prototype.getScale = function() {
    return {
        scaleX: Math.sqrt(this.a * this.a + this.c * this.c),
        scaleY: Math.sqrt(this.b * this.b + this.d * this.d)
    };
};

/**
 *  equals
 *
 *  @param {Matrix2D} that
 *  @returns {Boolean}
 */
Matrix2D.prototype.equals = function(that) {
    return (
        this.a === that.a &&
        this.b === that.b &&
        this.c === that.c &&
        this.d === that.d &&
        this.e === that.e &&
        this.f === that.f
    );
};

/**
 *  toString
 *
 *  @returns {String}
 */
Matrix2D.prototype.toString = function() {
    return (
        "matrix(" +
        this.a + "," +
        this.b + "," +
        this.c + "," +
        this.d + "," +
        this.e + "," +
        this.f + ")"
    );
}

if (typeof module !== "undefined") {
    module.exports = Matrix2D;
}
},{}],130:[function(require,module,exports){
/**
 *
 *   Point2D.js
 *
 *   copyright 2001-2002, 2013 Kevin Lindsey
 *
 */

/**
 *  Point2D
 *
 *  @param {Number} x
 *  @param {Number} y
 *  @returns {Point2D}
 */
function Point2D(x, y) {
    Object.defineProperties(this, {
        "x": {
            value: x,
            writable: false,
            enumerable: true,
            configurable: false
        },
        "y": {
            value: y,
            writable: false,
            enumerable: true,
            configurable: false
        }
    });
    // this.x = x;
    // this.y = y;
}

/**
 *  clone
 *
 *  @returns {Point2D}
 */
Point2D.prototype.clone = function() {
    return new Point2D(this.x, this.y);
};

/**
 *  add
 *
 *  @param {Point2D|Vector2D} that
 *  @returns {Point2D}
 */
Point2D.prototype.add = function(that) {
    return new Point2D(this.x+that.x, this.y+that.y);
};

/**
 *  subtract
 *
 *  @param { Vector2D | Point2D } that
 *  @returns {Point2D}
 */
Point2D.prototype.subtract = function(that) {
    return new Point2D(this.x-that.x, this.y-that.y);
};

/**
 *  multiply
 *
 *  @param {Number} scalar
 *  @returns {Point2D}
 */
Point2D.prototype.multiply = function(scalar) {
    return new Point2D(this.x*scalar, this.y*scalar);
};

/**
 *  divide
 *
 *  @param {Number} scalar
 *  @returns {Point2D}
 */
Point2D.prototype.divide = function(scalar) {
    return new Point2D(this.x/scalar, this.y/scalar);
};

/**
 *  equals
 *
 *  @param {Point2D} that
 *  @returns {Boolean}
 */
Point2D.prototype.equals = function(that) {
    return ( this.x == that.x && this.y == that.y );
};

// utility methods

/**
 *  lerp
 *
 *  @param { Vector2D | Point2D } that
 *  @param {Number} t
 @  @returns {Point2D}
 */
Point2D.prototype.lerp = function(that, t) {
    var omt = 1.0 - t;

    return new Point2D(
        this.x * omt + that.x * t,
        this.y * omt + that.y * t
    );
};

/**
 *  distanceFrom
 *
 *  @param {Point2D} that
 *  @returns {Number}
 */
Point2D.prototype.distanceFrom = function(that) {
    var dx = this.x - that.x;
    var dy = this.y - that.y;

    return Math.sqrt(dx*dx + dy*dy);
};

/**
 *  min
 *
 *  @param {Point2D} that
 *  @returns {Number}
 */
Point2D.prototype.min = function(that) {
    return new Point2D(
        Math.min( this.x, that.x ),
        Math.min( this.y, that.y )
    );
};

/**
 *  max
 *
 *  @param {Point2D} that
 *  @returns {Number}
 */
Point2D.prototype.max = function(that) {
    return new Point2D(
        Math.max( this.x, that.x ),
        Math.max( this.y, that.y )
    );
};

/**
 *  transform
 *
 *  @param {Matrix2D}
 *  @result {Point2D}
 */
Point2D.prototype.transform = function(matrix) {
    return new Point2D(
        matrix.a * this.x + matrix.c * this.y + matrix.e,
        matrix.b * this.x + matrix.d * this.y + matrix.f
    );
};

/**
 *  toString
 *
 *  @returns {String}
 */
Point2D.prototype.toString = function() {
    return "point(" + this.x + "," + this.y + ")";
};

if (typeof module !== "undefined") {
    module.exports = Point2D;
}

},{}],131:[function(require,module,exports){
/**
 *
 *   Vector2D.js
 *
 *   copyright 2001-2002, 2013 Kevin Lindsey
 *
 */

/**
 *  Vector2D
 *
 *  @param {Number} x
 *  @param {Number} y
 *  @returns {Vector2D}
 */
function Vector2D(x, y) {
    Object.defineProperties(this, {
        "x": {
            value: x,
            writable: false,
            enumerable: true,
            configurable: false
        },
        "y": {
            value: y,
            writable: false,
            enumerable: true,
            configurable: false
        }
    });
    // this.x = x;
    // this.y = y;
}

/**
 *  fromPoints
 *
 *  @param {Point2D} p1
 *  @param {Point2D} p2
 *  @returns {Vector2D}
 */
Vector2D.fromPoints = function(p1, p2) {
    return new Vector2D(
        p2.x - p1.x,
        p2.y - p1.y
    );
};

/**
 *  length
 *
 *  @returns {Number}
 */
Vector2D.prototype.length = function() {
    return Math.sqrt(this.x*this.x + this.y*this.y);
};

/**
 *  magnitude
 *
 *  @returns {Number}
 */
Vector2D.prototype.magnitude = function() {
    return this.x*this.x + this.y*this.y;
};

/**
 *  dot
 *
 *  @param {Vector2D} that
 *  @returns {Number}
 */
Vector2D.prototype.dot = function(that) {
    return this.x*that.x + this.y*that.y;
};

/**
 *  cross
 *
 *  @param {Vector2D} that
 *  @returns {Number}
 */
Vector2D.prototype.cross = function(that) {
    return this.x*that.y - this.y*that.x;
}

/**
 *  determinant
 *
 *  @param {Vector2D} that
 *  @returns {Number}
 */
Vector2D.prototype.determinant = function(that) {
    return this.x*that.y - this.y*that.x;
};

/**
 *  unit
 *
 *  @returns {Vector2D}
 */
Vector2D.prototype.unit = function() {
    return this.divide( this.length() );
};

/**
 *  add
 *
 *  @param {Vector2D} that
 *  @returns {Vector2D}
 */
Vector2D.prototype.add = function(that) {
    return new Vector2D(this.x + that.x, this.y + that.y);
};

/**
 *  subtract
 *
 *  @param {Vector2D} that
 *  @returns {Vector2D}
 */
Vector2D.prototype.subtract = function(that) {
    return new Vector2D(this.x - that.x, this.y - that.y);
};

/**
 *  multiply
 *
 *  @param {Number} scalar
 *  @returns {Vector2D}
 */
Vector2D.prototype.multiply = function(scalar) {
    return new Vector2D(this.x * scalar, this.y * scalar);
};

/**
 *  divide
 *
 *  @param {Number} scalar
 *  @returns {Vector2D}
 */
Vector2D.prototype.divide = function(scalar) {
    return new Vector2D(this.x / scalar, this.y / scalar);
};

/**
 *  angleBetween
 *
 *  @param {Vector2D} that
 *  @returns {Number}
 */
Vector2D.prototype.angleBetween = function(that) {
    var cos = this.dot(that) / (this.length() * that.length());
    if (cos < -1) {
        cos = -1;
    }
    else if (cos > 1) {
        cos = 1;
    }
    var radians = Math.acos(cos);

    return (this.cross(that) < 0.0) ? -radians : radians;
};

/**
 *  Find a vector is that is perpendicular to this vector
 *
 *  @returns {Vector2D}
 */
Vector2D.prototype.perp = function() {
    return new Vector2D(-this.y, this.x);
};

/**
 *  Find the component of the specified vector that is perpendicular to
 *  this vector
 *
 *  @param {Vector2D} that
 *  @returns {Vector2D}
 */
Vector2D.prototype.perpendicular = function(that) {
    return this.subtract(this.project(that));
};

/**
 *  project
 *
 *  @param {Vector2D} that
 *  @returns {Vector2D}
 */
Vector2D.prototype.project = function(that) {
    var percent = this.dot(that) / that.dot(that);

    return that.multiply(percent);
};

/**
 *  transform
 *
 *  @param {Matrix2D}
 *  @returns {Vector2D}
 */
Vector2D.prototype.transform = function(matrix) {
    return new Vector2D(
        matrix.a * this.x + matrix.c * this.y,
        matrix.b * this.x + matrix.d * this.y
    );
};

/**
 *  equals
 *
 *  @param {Vector2D} that
 *  @returns {Boolean}
 */
Vector2D.prototype.equals = function(that) {
    return (
        this.x === that.x &&
        this.y === that.y
    );
};

/**
 *  toString
 *
 *  @returns {String}
 */
Vector2D.prototype.toString = function() {
    return "vector(" + this.x + "," + this.y + ")";
};

if (typeof module !== "undefined") {
    module.exports = Vector2D;
}

},{}],132:[function(require,module,exports){
// expose classes

exports.Polynomial = require('./lib/Polynomial');
exports.SqrtPolynomial = require('./lib/SqrtPolynomial');

},{"./lib/Polynomial":133,"./lib/SqrtPolynomial":134}],133:[function(require,module,exports){
/**
 *
 *   Polynomial.js
 *
 *   copyright 2002, 2103 Kevin Lindsey
 *
 */

Polynomial.TOLERANCE = 1e-6;
Polynomial.ACCURACY  = 15;


/**
 *  interpolate
 *
 *  @param {Array<Number>} xs
 *  @param {Array<Number>} ys
 *  @param {Number} n
 *  @param {Number} offset
 *  @param {Number} x
 *
 *  @returns {y:Number, dy:Number}
 */
Polynomial.interpolate = function(xs, ys, n, offset, x) {
    if ( xs.constructor !== Array || ys.constructor !== Array )
        throw new Error("Polynomial.interpolate: xs and ys must be arrays");
    if ( isNaN(n) || isNaN(offset) || isNaN(x) )
        throw new Error("Polynomial.interpolate: n, offset, and x must be numbers");

    var y  = 0;
    var dy = 0;
    var c = new Array(n);
    var d = new Array(n);
    var ns = 0;
    var result;

    var diff = Math.abs(x - xs[offset]);
    for ( var i = 0; i < n; i++ ) {
        var dift = Math.abs(x - xs[offset+i]);

        if ( dift < diff ) {
            ns = i;
            diff = dift;
        }
        c[i] = d[i] = ys[offset+i];
    }
    y = ys[offset+ns];
    ns--;

    for ( var m = 1; m < n; m++ ) {
        for ( var i = 0; i < n-m; i++ ) {
            var ho = xs[offset+i] - x;
            var hp = xs[offset+i+m] - x;
            var w = c[i+1]-d[i];
            var den = ho - hp;

            if ( den == 0.0 ) {
                result = { y: 0, dy: 0};
                break;
            }

            den = w / den;
            d[i] = hp*den;
            c[i] = ho*den;
        }
        dy = (2*(ns+1) < (n-m)) ? c[ns+1] : d[ns--];
        y += dy;
    }

    return { y: y, dy: dy };
};


/**
 *  Polynomial
 *
 *  @returns {Polynomial}
 */
function Polynomial() {
    this.init( arguments );
}


/**
 *  init
 */
Polynomial.prototype.init = function(coefs) {
    this.coefs = new Array();

    for ( var i = coefs.length - 1; i >= 0; i-- )
        this.coefs.push( coefs[i] );

    this._variable = "t";
    this._s = 0;
};


/**
 *  eval
 */
Polynomial.prototype.eval = function(x) {
    if ( isNaN(x) )
        throw new Error("Polynomial.eval: parameter must be a number");

    var result = 0;

    for ( var i = this.coefs.length - 1; i >= 0; i-- )
        result = result * x + this.coefs[i];

    return result;
};


/**
 *  add
 */
Polynomial.prototype.add = function(that) {
    var result = new Polynomial();
    var d1 = this.getDegree();
    var d2 = that.getDegree();
    var dmax = Math.max(d1,d2);

    for ( var i = 0; i <= dmax; i++ ) {
        var v1 = (i <= d1) ? this.coefs[i] : 0;
        var v2 = (i <= d2) ? that.coefs[i] : 0;

        result.coefs[i] = v1 + v2;
    }

    return result;
};


/**
 *  multiply
 */
Polynomial.prototype.multiply = function(that) {
    var result = new Polynomial();

    for ( var i = 0; i <= this.getDegree() + that.getDegree(); i++ )
        result.coefs.push(0);

    for ( var i = 0; i <= this.getDegree(); i++ )
        for ( var j = 0; j <= that.getDegree(); j++ )
            result.coefs[i+j] += this.coefs[i] * that.coefs[j];

    return result;
};


/**
 *  divide_scalar
 */
Polynomial.prototype.divide_scalar = function(scalar) {
    for ( var i = 0; i < this.coefs.length; i++ )
        this.coefs[i] /= scalar;
};


/**
 *  simplify
 */
Polynomial.prototype.simplify = function() {
    for ( var i = this.getDegree(); i >= 0; i-- ) {
        if ( Math.abs( this.coefs[i] ) <= Polynomial.TOLERANCE )
            this.coefs.pop();
        else
            break;
    }
};


/**
 *  bisection
 */
Polynomial.prototype.bisection = function(min, max) {
    var minValue = this.eval(min);
    var maxValue = this.eval(max);
    var result;

    if ( Math.abs(minValue) <= Polynomial.TOLERANCE )
        result = min;
    else if ( Math.abs(maxValue) <= Polynomial.TOLERANCE )
        result = max;
    else if ( minValue * maxValue <= 0 ) {
        var tmp1  = Math.log(max - min);
        var tmp2  = Math.LN10 * Polynomial.ACCURACY;
        var iters = Math.ceil( (tmp1+tmp2) / Math.LN2 );

        for ( var i = 0; i < iters; i++ ) {
            result = 0.5 * (min + max);
            var value = this.eval(result);

            if ( Math.abs(value) <= Polynomial.TOLERANCE ) {
                break;
            }

            if ( value * minValue < 0 ) {
                max = result;
                maxValue = value;
            } else {
                min = result;
                minValue = value;
            }
        }
    }

    return result;
};


/**
 *  toString
 */
Polynomial.prototype.toString = function() {
    var coefs = new Array();
    var signs = new Array();

    for ( var i = this.coefs.length - 1; i >= 0; i-- ) {
        var value = Math.round(this.coefs[i]*1000)/1000;
        //var value = this.coefs[i];

        if ( value != 0 ) {
            var sign = ( value < 0 ) ? " - " : " + ";

            value = Math.abs(value);
            if ( i > 0 )
                if ( value == 1 )
                    value = this._variable;
                else
                    value += this._variable;
            if ( i > 1 ) value += "^" + i;

            signs.push( sign );
            coefs.push( value );
        }
    }

    signs[0] = ( signs[0] == " + " ) ? "" : "-";

    var result = "";
    for ( var i = 0; i < coefs.length; i++ )
        result += signs[i] + coefs[i];

    return result;
};


/**
 *  trapezoid
 *  Based on trapzd in "Numerical Recipes in C", page 137
 */
Polynomial.prototype.trapezoid = function(min, max, n) {
    if ( isNaN(min) || isNaN(max) || isNaN(n) )
        throw new Error("Polynomial.trapezoid: parameters must be numbers");

    var range = max - min;
    var TOLERANCE = 1e-7;

    if ( n == 1 ) {
        var minValue = this.eval(min);
        var maxValue = this.eval(max);
        this._s = 0.5*range*( minValue + maxValue );
    } else {
        var it = 1 << (n-2);
        var delta = range / it;
        var x = min + 0.5*delta;
        var sum = 0;

        for ( var i = 0; i < it; i++ ) {
            sum += this.eval(x);
            x += delta;
        }
        this._s = 0.5*(this._s + range*sum/it);
    }

    if ( isNaN(this._s) )
        throw new Error("Polynomial.trapezoid: this._s is NaN");

    return this._s;
};


/**
 *  simpson
 *  Based on trapzd in "Numerical Recipes in C", page 139
 */
Polynomial.prototype.simpson = function(min, max) {
    if ( isNaN(min) || isNaN(max) )
        throw new Error("Polynomial.simpson: parameters must be numbers");

    var range = max - min;
    var st = 0.5 * range * ( this.eval(min) + this.eval(max) );
    var t = st;
    var s = 4.0*st/3.0;
    var os = s;
    var ost = st;
    var TOLERANCE = 1e-7;

    var it = 1;
    for ( var n = 2; n <= 20; n++ ) {
        var delta = range / it;
        var x     = min + 0.5*delta;
        var sum   = 0;

        for ( var i = 1; i <= it; i++ ) {
            sum += this.eval(x);
            x += delta;
        }

        t = 0.5 * (t + range * sum / it);
        st = t;
        s = (4.0*st - ost)/3.0;

        if ( Math.abs(s-os) < TOLERANCE*Math.abs(os) )
            break;

        os = s;
        ost = st;
        it <<= 1;
    }

    return s;
};


/**
 *  romberg
 */
Polynomial.prototype.romberg = function(min, max) {
    if ( isNaN(min) || isNaN(max) )
        throw new Error("Polynomial.romberg: parameters must be numbers");

    var MAX = 20;
    var K = 3;
    var TOLERANCE = 1e-6;
    var s = new Array(MAX+1);
    var h = new Array(MAX+1);
    var result = { y: 0, dy: 0 };

    h[0] = 1.0;
    for ( var j = 1; j <= MAX; j++ ) {
        s[j-1] = this.trapezoid(min, max, j);
        if ( j >= K ) {
            result = Polynomial.interpolate(h, s, K, j-K, 0.0);
            if ( Math.abs(result.dy) <= TOLERANCE*result.y) break;
        }
        s[j] = s[j-1];
        h[j] = 0.25 * h[j-1];
    }

    return result.y;
};

// getters and setters

/**
 *  get degree
 */
Polynomial.prototype.getDegree = function() {
    return this.coefs.length - 1;
};


/**
 *  getDerivative
 */
Polynomial.prototype.getDerivative = function() {
    var derivative = new Polynomial();

    for ( var i = 1; i < this.coefs.length; i++ ) {
        derivative.coefs.push(i*this.coefs[i]);
    }

    return derivative;
};


/**
 *  getRoots
 */
Polynomial.prototype.getRoots = function() {
    var result;

    this.simplify();
    switch ( this.getDegree() ) {
        case 0: result = new Array();              break;
        case 1: result = this.getLinearRoot();     break;
        case 2: result = this.getQuadraticRoots(); break;
        case 3: result = this.getCubicRoots();     break;
        case 4: result = this.getQuarticRoots();   break;
        default:
            result = new Array();
            // should try Newton's method and/or bisection
    }

    return result;
};


/**
 *  getRootsInInterval
 */
Polynomial.prototype.getRootsInInterval = function(min, max) {
    var roots = new Array();
    var root;

    if ( this.getDegree() == 1 ) {
        root = this.bisection(min, max);
        if ( root != null ) roots.push(root);
    } else {
        // get roots of derivative
        var deriv  = this.getDerivative();
        var droots = deriv.getRootsInInterval(min, max);

        if ( droots.length > 0 ) {
            // find root on [min, droots[0]]
            root = this.bisection(min, droots[0]);
            if ( root != null ) roots.push(root);

            // find root on [droots[i],droots[i+1]] for 0 <= i <= count-2
            for ( i = 0; i <= droots.length-2; i++ ) {
                root = this.bisection(droots[i], droots[i+1]);
                if ( root != null ) roots.push(root);
            }

            // find root on [droots[count-1],xmax]
            root = this.bisection(droots[droots.length-1], max);
            if ( root != null ) roots.push(root);
        } else {
            // polynomial is monotone on [min,max], has at most one root
            root = this.bisection(min, max);
            if ( root != null ) roots.push(root);
        }
    }

    return roots;
};


/**
 *  getLinearRoot
 */
Polynomial.prototype.getLinearRoot = function() {
    var result = new Array();
    var a = this.coefs[1];

    if ( a != 0 )
        result.push( -this.coefs[0] / a );

    return result;
};


/**
 *  getQuadraticRoots
 */
Polynomial.prototype.getQuadraticRoots = function() {
    var results = new Array();

    if ( this.getDegree() == 2 ) {
        var a = this.coefs[2];
        var b = this.coefs[1] / a;
        var c = this.coefs[0] / a;
        var d = b*b - 4*c;

        if ( d > 0 ) {
            var e = Math.sqrt(d);

            results.push( 0.5 * (-b + e) );
            results.push( 0.5 * (-b - e) );
        } else if ( d == 0 ) {
            // really two roots with same value, but we only return one
            results.push( 0.5 * -b );
        }
    }

    return results;
};


/**
 *  getCubicRoots
 *
 *  This code is based on MgcPolynomial.cpp written by David Eberly.  His
 *  code along with many other excellent examples are avaiable at his site:
 *  http://www.magic-software.com
 */
Polynomial.prototype.getCubicRoots = function() {
    var results = new Array();

    if ( this.getDegree() == 3 ) {
        var c3 = this.coefs[3];
        var c2 = this.coefs[2] / c3;
        var c1 = this.coefs[1] / c3;
        var c0 = this.coefs[0] / c3;

        var a       = (3*c1 - c2*c2) / 3;
        var b       = (2*c2*c2*c2 - 9*c1*c2 + 27*c0) / 27;
        var offset  = c2 / 3;
        var discrim = b*b/4 + a*a*a/27;
        var halfB   = b / 2;

        if ( Math.abs(discrim) <= Polynomial.TOLERANCE ) discrim = 0;

        if ( discrim > 0 ) {
            var e = Math.sqrt(discrim);
            var tmp;
            var root;

            tmp = -halfB + e;
            if ( tmp >= 0 )
                root = Math.pow(tmp, 1/3);
            else
                root = -Math.pow(-tmp, 1/3);

            tmp = -halfB - e;
            if ( tmp >= 0 )
                root += Math.pow(tmp, 1/3);
            else
                root -= Math.pow(-tmp, 1/3);

            results.push( root - offset );
        } else if ( discrim < 0 ) {
            var distance = Math.sqrt(-a/3);
            var angle    = Math.atan2( Math.sqrt(-discrim), -halfB) / 3;
            var cos      = Math.cos(angle);
            var sin      = Math.sin(angle);
            var sqrt3    = Math.sqrt(3);

            results.push( 2*distance*cos - offset );
            results.push( -distance * (cos + sqrt3 * sin) - offset);
            results.push( -distance * (cos - sqrt3 * sin) - offset);
        } else {
            var tmp;

            if ( halfB >= 0 )
                tmp = -Math.pow(halfB, 1/3);
            else
                tmp = Math.pow(-halfB, 1/3);

            results.push( 2*tmp - offset );
            // really should return next root twice, but we return only one
            results.push( -tmp - offset );
        }
    }

    return results;
};


/**
 *  getQuarticRoots
 *
 *  This code is based on MgcPolynomial.cpp written by David Eberly.  His
 *  code along with many other excellent examples are avaiable at his site:
 *  http://www.magic-software.com
 */
Polynomial.prototype.getQuarticRoots = function() {
    var results = new Array();

    if ( this.getDegree() == 4 ) {
        var c4 = this.coefs[4];
        var c3 = this.coefs[3] / c4;
        var c2 = this.coefs[2] / c4;
        var c1 = this.coefs[1] / c4;
        var c0 = this.coefs[0] / c4;

        var resolveRoots = new Polynomial(
            1, -c2, c3*c1 - 4*c0, -c3*c3*c0 + 4*c2*c0 -c1*c1
        ).getCubicRoots();
        var y       = resolveRoots[0];
        var discrim = c3*c3/4 - c2 + y;

        if ( Math.abs(discrim) <= Polynomial.TOLERANCE ) discrim = 0;

        if ( discrim > 0 ) {
            var e     = Math.sqrt(discrim);
            var t1    = 3*c3*c3/4 - e*e - 2*c2;
            var t2    = ( 4*c3*c2 - 8*c1 - c3*c3*c3 ) / ( 4*e );
            var plus  = t1+t2;
            var minus = t1-t2;

            if ( Math.abs(plus)  <= Polynomial.TOLERANCE ) plus  = 0;
            if ( Math.abs(minus) <= Polynomial.TOLERANCE ) minus = 0;

            if ( plus >= 0 ) {
                var f = Math.sqrt(plus);

                results.push( -c3/4 + (e+f)/2 );
                results.push( -c3/4 + (e-f)/2 );
            }
            if ( minus >= 0 ) {
                var f = Math.sqrt(minus);

                results.push( -c3/4 + (f-e)/2 );
                results.push( -c3/4 - (f+e)/2 );
            }
        } else if ( discrim < 0 ) {
            // no roots
        } else {
            var t2 = y*y - 4*c0;

            if ( t2 >= -Polynomial.TOLERANCE ) {
                if ( t2 < 0 ) t2 = 0;

                t2 = 2*Math.sqrt(t2);
                t1 = 3*c3*c3/4 - 2*c2;
                if ( t1+t2 >= Polynomial.TOLERANCE ) {
                    var d = Math.sqrt(t1+t2);

                    results.push( -c3/4 + d/2 );
                    results.push( -c3/4 - d/2 );
                }
                if ( t1-t2 >= Polynomial.TOLERANCE ) {
                    var d = Math.sqrt(t1-t2);

                    results.push( -c3/4 + d/2 );
                    results.push( -c3/4 - d/2 );
                }
            }
        }
    }

    return results;
};

if (typeof module !== "undefined") {
    module.exports = Polynomial;
}

},{}],134:[function(require,module,exports){
/**
 *
 *   SqrtPolynomial.js
 *
 *   copyright 2003, 2013 Kevin Lindsey
 *
 */

if (typeof module !== "undefined") {
    var Polynomial = require("./Polynomial");
}

/**
 *   class variables
 */
SqrtPolynomial.VERSION = 1.0;

// setup inheritance
SqrtPolynomial.prototype             = new Polynomial();
SqrtPolynomial.prototype.constructor = SqrtPolynomial;
SqrtPolynomial.superclass            = Polynomial.prototype;


/**
 *  SqrtPolynomial
 */
function SqrtPolynomial() {
    this.init( arguments );
}


/**
 *  eval
 *
 *  @param {Number} x
 *  @returns {Number}
 */
SqrtPolynomial.prototype.eval = function(x) {
    var TOLERANCE = 1e-7;
    var result = SqrtPolynomial.superclass.eval.call(this, x);

    // NOTE: May need to change the following.  I added these to capture
    // some really small negative values that were being generated by one
    // of my Bezier arcLength functions
    if ( Math.abs(result) < TOLERANCE ) result = 0;
    if ( result < 0 )
        throw new Error("SqrtPolynomial.eval: cannot take square root of negative number");

    return Math.sqrt(result);
};

SqrtPolynomial.prototype.toString = function() {
    var result = SqrtPolynomial.superclass.toString.call(this);

    return "sqrt(" + result + ")";
};

if (typeof module !== "undefined") {
    module.exports = SqrtPolynomial;
}

},{"./Polynomial":133}],135:[function(require,module,exports){
var bezier = require('adaptive-bezier-curve')
var abs = require('abs-svg-path')
var norm = require('normalize-svg-path')
var copy = require('vec2-copy')

function set(out, x, y) {
    out[0] = x
    out[1] = y
    return out
}

var tmp1 = [0,0],
    tmp2 = [0,0],
    tmp3 = [0,0]

function bezierTo(points, scale, start, seg) {
    bezier(start,
        set(tmp1, seg[1], seg[2]),
        set(tmp2, seg[3], seg[4]),
        set(tmp3, seg[5], seg[6]), scale, points)
}

module.exports = function contours(svg, scale) {
    var paths = []

    var points = []
    var pen = [0, 0]
    norm(abs(svg)).forEach(function(segment, i, self) {
        if (segment[0] === 'M') {
            copy(pen, segment.slice(1))
            if (points.length>0) {
                paths.push(points)
                points = []
            }
        } else if (segment[0] === 'C') {
            bezierTo(points, scale, pen, segment)
            set(pen, segment[5], segment[6])
        } else {
            throw new Error('illegal type in SVG: '+segment[0])
        }
    })
    if (points.length>0)
        paths.push(points)
    return paths
}
},{"abs-svg-path":136,"adaptive-bezier-curve":138,"normalize-svg-path":139,"vec2-copy":140}],136:[function(require,module,exports){

module.exports = absolutize

/**
 * redefine `path` with absolute coordinates
 *
 * @param {Array} path
 * @return {Array}
 */

function absolutize(path){
  var startX = 0
  var startY = 0
  var x = 0
  var y = 0

  return path.map(function(seg){
    seg = seg.slice()
    var type = seg[0]
    var command = type.toUpperCase()

    // is relative
    if (type != command) {
      seg[0] = command
      switch (type) {
        case 'a':
          seg[6] += x
          seg[7] += y
          break
        case 'v':
          seg[1] += y
          break
        case 'h':
          seg[1] += x
          break
        default:
          for (var i = 1; i < seg.length;) {
            seg[i++] += x
            seg[i++] += y
          }
      }
    }

    // update cursor state
    switch (command) {
      case 'Z':
        x = startX
        y = startY
        break
      case 'H':
        x = seg[1]
        break
      case 'V':
        y = seg[1]
        break
      case 'M':
        x = startX = seg[1]
        y = startY = seg[2]
        break
      default:
        x = seg[seg.length - 2]
        y = seg[seg.length - 1]
    }

    return seg
  })
}

},{}],137:[function(require,module,exports){
function clone(point) { //TODO: use gl-vec2 for this
    return [point[0], point[1]]
}

function vec2(x, y) {
    return [x, y]
}

module.exports = function createBezierBuilder(opt) {
    opt = opt||{}

    var RECURSION_LIMIT = typeof opt.recursion === 'number' ? opt.recursion : 8
    var FLT_EPSILON = typeof opt.epsilon === 'number' ? opt.epsilon : 1.19209290e-7
    var PATH_DISTANCE_EPSILON = typeof opt.pathEpsilon === 'number' ? opt.pathEpsilon : 1.0

    var curve_angle_tolerance_epsilon = typeof opt.angleEpsilon === 'number' ? opt.angleEpsilon : 0.01
    var m_angle_tolerance = opt.angleTolerance || 0
    var m_cusp_limit = opt.cuspLimit || 0

    return function bezierCurve(start, c1, c2, end, scale, points) {
        if (!points)
            points = []

        scale = typeof scale === 'number' ? scale : 1.0
        var distanceTolerance = PATH_DISTANCE_EPSILON / scale
        distanceTolerance *= distanceTolerance
        begin(start, c1, c2, end, points, distanceTolerance)
        return points
    }


    ////// Based on:
    ////// https://github.com/pelson/antigrain/blob/master/agg-2.4/src/agg_curves.cpp

    function begin(start, c1, c2, end, points, distanceTolerance) {
        points.push(clone(start))
        var x1 = start[0],
            y1 = start[1],
            x2 = c1[0],
            y2 = c1[1],
            x3 = c2[0],
            y3 = c2[1],
            x4 = end[0],
            y4 = end[1]
        recursive(x1, y1, x2, y2, x3, y3, x4, y4, points, distanceTolerance, 0)
        points.push(clone(end))
    }

    function recursive(x1, y1, x2, y2, x3, y3, x4, y4, points, distanceTolerance, level) {
        if(level > RECURSION_LIMIT)
            return

        var pi = Math.PI

        // Calculate all the mid-points of the line segments
        //----------------------
        var x12   = (x1 + x2) / 2
        var y12   = (y1 + y2) / 2
        var x23   = (x2 + x3) / 2
        var y23   = (y2 + y3) / 2
        var x34   = (x3 + x4) / 2
        var y34   = (y3 + y4) / 2
        var x123  = (x12 + x23) / 2
        var y123  = (y12 + y23) / 2
        var x234  = (x23 + x34) / 2
        var y234  = (y23 + y34) / 2
        var x1234 = (x123 + x234) / 2
        var y1234 = (y123 + y234) / 2

        if(level > 0) { // Enforce subdivision first time
            // Try to approximate the full cubic curve by a single straight line
            //------------------
            var dx = x4-x1
            var dy = y4-y1

            var d2 = Math.abs((x2 - x4) * dy - (y2 - y4) * dx)
            var d3 = Math.abs((x3 - x4) * dy - (y3 - y4) * dx)

            var da1, da2

            if(d2 > FLT_EPSILON && d3 > FLT_EPSILON) {
                // Regular care
                //-----------------
                if((d2 + d3)*(d2 + d3) <= distanceTolerance * (dx*dx + dy*dy)) {
                    // If the curvature doesn't exceed the distanceTolerance value
                    // we tend to finish subdivisions.
                    //----------------------
                    if(m_angle_tolerance < curve_angle_tolerance_epsilon) {
                        points.push(vec2(x1234, y1234))
                        return
                    }

                    // Angle & Cusp Condition
                    //----------------------
                    var a23 = Math.atan2(y3 - y2, x3 - x2)
                    da1 = Math.abs(a23 - Math.atan2(y2 - y1, x2 - x1))
                    da2 = Math.abs(Math.atan2(y4 - y3, x4 - x3) - a23)
                    if(da1 >= pi) da1 = 2*pi - da1
                    if(da2 >= pi) da2 = 2*pi - da2

                    if(da1 + da2 < m_angle_tolerance) {
                        // Finally we can stop the recursion
                        //----------------------
                        points.push(vec2(x1234, y1234))
                        return
                    }

                    if(m_cusp_limit !== 0.0) {
                        if(da1 > m_cusp_limit) {
                            points.push(vec2(x2, y2))
                            return
                        }

                        if(da2 > m_cusp_limit) {
                            points.push(vec2(x3, y3))
                            return
                        }
                    }
                }
            }
            else {
                if(d2 > FLT_EPSILON) {
                    // p1,p3,p4 are collinear, p2 is considerable
                    //----------------------
                    if(d2 * d2 <= distanceTolerance * (dx*dx + dy*dy)) {
                        if(m_angle_tolerance < curve_angle_tolerance_epsilon) {
                            points.push(vec2(x1234, y1234))
                            return
                        }

                        // Angle Condition
                        //----------------------
                        da1 = Math.abs(Math.atan2(y3 - y2, x3 - x2) - Math.atan2(y2 - y1, x2 - x1))
                        if(da1 >= pi) da1 = 2*pi - da1

                        if(da1 < m_angle_tolerance) {
                            points.push(vec2(x2, y2))
                            points.push(vec2(x3, y3))
                            return
                        }

                        if(m_cusp_limit !== 0.0) {
                            if(da1 > m_cusp_limit) {
                                points.push(vec2(x2, y2))
                                return
                            }
                        }
                    }
                }
                else if(d3 > FLT_EPSILON) {
                    // p1,p2,p4 are collinear, p3 is considerable
                    //----------------------
                    if(d3 * d3 <= distanceTolerance * (dx*dx + dy*dy)) {
                        if(m_angle_tolerance < curve_angle_tolerance_epsilon) {
                            points.push(vec2(x1234, y1234))
                            return
                        }

                        // Angle Condition
                        //----------------------
                        da1 = Math.abs(Math.atan2(y4 - y3, x4 - x3) - Math.atan2(y3 - y2, x3 - x2))
                        if(da1 >= pi) da1 = 2*pi - da1

                        if(da1 < m_angle_tolerance) {
                            points.push(vec2(x2, y2))
                            points.push(vec2(x3, y3))
                            return
                        }

                        if(m_cusp_limit !== 0.0) {
                            if(da1 > m_cusp_limit)
                            {
                                points.push(vec2(x3, y3))
                                return
                            }
                        }
                    }
                }
                else {
                    // Collinear case
                    //-----------------
                    dx = x1234 - (x1 + x4) / 2
                    dy = y1234 - (y1 + y4) / 2
                    if(dx*dx + dy*dy <= distanceTolerance) {
                        points.push(vec2(x1234, y1234))
                        return
                    }
                }
            }
        }

        // Continue subdivision
        //----------------------
        recursive(x1, y1, x12, y12, x123, y123, x1234, y1234, points, distanceTolerance, level + 1)
        recursive(x1234, y1234, x234, y234, x34, y34, x4, y4, points, distanceTolerance, level + 1)
    }
}

},{}],138:[function(require,module,exports){
module.exports = require('./function')()
},{"./function":137}],139:[function(require,module,exports){

var π = Math.PI
var _120 = radians(120)

module.exports = normalize

/**
 * describe `path` in terms of cubic bézier
 * curves and move commands
 *
 * @param {Array} path
 * @return {Array}
 */

function normalize(path){
  // init state
  var prev
  var result = []
  var bezierX = 0
  var bezierY = 0
  var startX = 0
  var startY = 0
  var quadX = null
  var quadY = null
  var x = 0
  var y = 0

  for (var i = 0, len = path.length; i < len; i++) {
    var seg = path[i]
    var command = seg[0]
    switch (command) {
      case 'M':
        startX = seg[1]
        startY = seg[2]
        break
      case 'A':
        seg = arc(x, y,seg[1],seg[2],radians(seg[3]),seg[4],seg[5],seg[6],seg[7])
        // split multi part
        seg.unshift('C')
        if (seg.length > 7) {
          result.push(seg.splice(0, 7))
          seg.unshift('C')
        }
        break
      case 'S':
        // default control point
        var cx = x
        var cy = y
        if (prev == 'C' || prev == 'S') {
          cx += cx - bezierX // reflect the previous command's control
          cy += cy - bezierY // point relative to the current point
        }
        seg = ['C', cx, cy, seg[1], seg[2], seg[3], seg[4]]
        break
      case 'T':
        if (prev == 'Q' || prev == 'T') {
          quadX = x * 2 - quadX // as with 'S' reflect previous control point
          quadY = y * 2 - quadY
        } else {
          quadX = x
          quadY = y
        }
        seg = quadratic(x, y, quadX, quadY, seg[1], seg[2])
        break
      case 'Q':
        quadX = seg[1]
        quadY = seg[2]
        seg = quadratic(x, y, seg[1], seg[2], seg[3], seg[4])
        break
      case 'L':
        seg = line(x, y, seg[1], seg[2])
        break
      case 'H':
        seg = line(x, y, seg[1], y)
        break
      case 'V':
        seg = line(x, y, x, seg[1])
        break
      case 'Z':
        seg = line(x, y, startX, startY)
        break
    }

    // update state
    prev = command
    x = seg[seg.length - 2]
    y = seg[seg.length - 1]
    if (seg.length > 4) {
      bezierX = seg[seg.length - 4]
      bezierY = seg[seg.length - 3]
    } else {
      bezierX = x
      bezierY = y
    }
    result.push(seg)
  }

  return result
}

function line(x1, y1, x2, y2){
  return ['C', x1, y1, x2, y2, x2, y2]
}

function quadratic(x1, y1, cx, cy, x2, y2){
  return [
    'C',
    x1/3 + (2/3) * cx,
    y1/3 + (2/3) * cy,
    x2/3 + (2/3) * cx,
    y2/3 + (2/3) * cy,
    x2,
    y2
  ]
}

// This function is ripped from
// github.com/DmitryBaranovskiy/raphael/blob/4d97d4/raphael.js#L2216-L2304
// which references w3.org/TR/SVG11/implnote.html#ArcImplementationNotes
// TODO: make it human readable

function arc(x1, y1, rx, ry, angle, large_arc_flag, sweep_flag, x2, y2, recursive) {
  if (!recursive) {
    var xy = rotate(x1, y1, -angle)
    x1 = xy.x
    y1 = xy.y
    xy = rotate(x2, y2, -angle)
    x2 = xy.x
    y2 = xy.y
    var x = (x1 - x2) / 2
    var y = (y1 - y2) / 2
    var h = (x * x) / (rx * rx) + (y * y) / (ry * ry)
    if (h > 1) {
      h = Math.sqrt(h)
      rx = h * rx
      ry = h * ry
    }
    var rx2 = rx * rx
    var ry2 = ry * ry
    var k = (large_arc_flag == sweep_flag ? -1 : 1)
      * Math.sqrt(Math.abs((rx2 * ry2 - rx2 * y * y - ry2 * x * x) / (rx2 * y * y + ry2 * x * x)))
    if (k == Infinity) k = 1 // neutralize
    var cx = k * rx * y / ry + (x1 + x2) / 2
    var cy = k * -ry * x / rx + (y1 + y2) / 2
    var f1 = Math.asin(((y1 - cy) / ry).toFixed(9))
    var f2 = Math.asin(((y2 - cy) / ry).toFixed(9))

    f1 = x1 < cx ? π - f1 : f1
    f2 = x2 < cx ? π - f2 : f2
    if (f1 < 0) f1 = π * 2 + f1
    if (f2 < 0) f2 = π * 2 + f2
    if (sweep_flag && f1 > f2) f1 = f1 - π * 2
    if (!sweep_flag && f2 > f1) f2 = f2 - π * 2
  } else {
    f1 = recursive[0]
    f2 = recursive[1]
    cx = recursive[2]
    cy = recursive[3]
  }
  // greater than 120 degrees requires multiple segments
  if (Math.abs(f2 - f1) > _120) {
    var f2old = f2
    var x2old = x2
    var y2old = y2
    f2 = f1 + _120 * (sweep_flag && f2 > f1 ? 1 : -1)
    x2 = cx + rx * Math.cos(f2)
    y2 = cy + ry * Math.sin(f2)
    var res = arc(x2, y2, rx, ry, angle, 0, sweep_flag, x2old, y2old, [f2, f2old, cx, cy])
  }
  var t = Math.tan((f2 - f1) / 4)
  var hx = 4 / 3 * rx * t
  var hy = 4 / 3 * ry * t
  var curve = [
    2 * x1 - (x1 + hx * Math.sin(f1)),
    2 * y1 - (y1 - hy * Math.cos(f1)),
    x2 + hx * Math.sin(f2),
    y2 - hy * Math.cos(f2),
    x2,
    y2
  ]
  if (recursive) return curve
  if (res) curve = curve.concat(res)
  for (var i = 0; i < curve.length;) {
    var rot = rotate(curve[i], curve[i+1], angle)
    curve[i++] = rot.x
    curve[i++] = rot.y
  }
  return curve
}

function rotate(x, y, rad){
  return {
    x: x * Math.cos(rad) - y * Math.sin(rad),
    y: x * Math.sin(rad) + y * Math.cos(rad)
  }
}

function radians(degress){
  return degress * (π / 180)
}

},{}],140:[function(require,module,exports){
module.exports = function vec2Copy(out, a) {
    out[0] = a[0]
    out[1] = a[1]
    return out
}
},{}],141:[function(require,module,exports){
var inherits = require('inherits')

module.exports = function(THREE) {

    function Complex(mesh) {
        if (!(this instanceof Complex))
            return new Complex(mesh)
        THREE.Geometry.call(this)
        this.dynamic = true

        if (mesh)
            this.update(mesh)
    }

    inherits(Complex, THREE.Geometry)

    //may expose these in next version
    Complex.prototype._updatePositions = function(positions) {
        for (var i=0; i<positions.length; i++) {
            var pos = positions[i]
            if (i > this.vertices.length-1)
                this.vertices.push(new THREE.Vector3().fromArray(pos))
            else
                this.vertices[i].fromArray(pos)
        }
        this.vertices.length = positions.length
        this.verticesNeedUpdate = true
    }

    Complex.prototype._updateCells = function(cells) {
        for (var i=0; i<cells.length; i++) {
            var face = cells[i]
            if (i > this.faces.length-1)
                this.faces.push(new THREE.Face3(face[0], face[1], face[2]))
            else {
                var tf = this.faces[i]
                tf.a = face[0]
                tf.b = face[1]
                tf.c = face[2]
            }
        }

        this.faces.length = cells.length
        this.elementsNeedUpdate = true
    }

    Complex.prototype.update = function(mesh) {
        this._updatePositions(mesh.positions)
        this._updateCells(mesh.cells)
    }

    return Complex
}
},{"inherits":142}],142:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],143:[function(require,module,exports){
var Tess2 = require('tess2')
var xtend = require('xtend')

module.exports = function(contours, opt) {
    opt = opt||{}
    contours = contours.filter(function(c) {
        return c.length>0
    })

    if (contours.length === 0) {
        return {
            positions: [],
            cells: []
        }
    }

    if (typeof opt.vertexSize !== 'number')
        opt.vertexSize = contours[0][0].length

    //flatten for tess2.js
    contours = contours.map(function(c) {
        return c.reduce(function(a, b) {
            return a.concat(b)
        })
    })

    // Tesselate
    var res = Tess2.tesselate(xtend({
        contours: contours,
        windingRule: Tess2.WINDING_ODD,
        elementType: Tess2.POLYGONS,
        polySize: 3,
        vertexSize: 2
    }, opt))

    var positions = []
    for (var i=0; i<res.vertices.length; i+=opt.vertexSize) {
        var pos = res.vertices.slice(i, i+opt.vertexSize)
        positions.push(pos)
    }

    var cells = []
    for (i=0; i<res.elements.length; i+=3) {
        var a = res.elements[i],
            b = res.elements[i+1],
            c = res.elements[i+2]
        cells.push([a, b, c])
    }

    //return a simplicial complex
    return {
        positions: positions,
        cells: cells
    }
}
},{"tess2":144,"xtend":146}],144:[function(require,module,exports){
module.exports = require('./src/tess2');
},{"./src/tess2":145}],145:[function(require,module,exports){
/*
** SGI FREE SOFTWARE LICENSE B (Version 2.0, Sept. 18, 2008)
** Copyright (C) [dates of first publication] Silicon Graphics, Inc.
** All Rights Reserved.
**
** Permission is hereby granted, free of charge, to any person obtaining a copy
** of this software and associated documentation files (the "Software"), to deal
** in the Software without restriction, including without limitation the rights
** to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
** of the Software, and to permit persons to whom the Software is furnished to do so,
** subject to the following conditions:
**
** The above copyright notice including the dates of first publication and either this
** permission notice or a reference to http://oss.sgi.com/projects/FreeB/ shall be
** included in all copies or substantial portions of the Software.
**
** THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
** INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
** PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL SILICON GRAPHICS, INC.
** BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
** TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE
** OR OTHER DEALINGS IN THE SOFTWARE.
**
** Except as contained in this notice, the name of Silicon Graphics, Inc. shall not
** be used in advertising or otherwise to promote the sale, use or other dealings in
** this Software without prior written authorization from Silicon Graphics, Inc.
*/
/*
** Author: Mikko Mononen, Aug 2013.
** The code is based on GLU libtess by Eric Veach, July 1994
*/

  "use strict";

  /* Public API */

  var Tess2 = {};

  module.exports = Tess2;

  Tess2.WINDING_ODD = 0;
  Tess2.WINDING_NONZERO = 1;
  Tess2.WINDING_POSITIVE = 2;
  Tess2.WINDING_NEGATIVE = 3;
  Tess2.WINDING_ABS_GEQ_TWO = 4;

  Tess2.POLYGONS = 0;
  Tess2.CONNECTED_POLYGONS = 1;
  Tess2.BOUNDARY_CONTOURS = 2;

  Tess2.tesselate = function(opts) {
    var debug =  opts.debug || false;
    var tess = new Tesselator();
    for (var i = 0; i < opts.contours.length; i++) {
      tess.addContour(opts.vertexSize || 2, opts.contours[i]);
    }
    tess.tesselate(opts.windingRule || Tess2.WINDING_ODD,
             opts.elementType || Tess2.POLYGONS,
             opts.polySize || 3,
             opts.vertexSize || 2,
             opts.normal || [0,0,1]);
    return {
      vertices: tess.vertices,
      vertexIndices: tess.vertexIndices,
      vertexCount: tess.vertexCount,
      elements: tess.elements,
      elementCount: tess.elementCount,
      mesh: debug ? tess.mesh : undefined
    };
  };

  /* Internal */

  var assert = function(cond) {
    if (!cond) {
      throw "Assertion Failed!";
    }
  }

  /* The mesh structure is similar in spirit, notation, and operations
  * to the "quad-edge" structure (see L. Guibas and J. Stolfi, Primitives
  * for the manipulation of general subdivisions and the computation of
  * Voronoi diagrams, ACM Transactions on Graphics, 4(2):74-123, April 1985).
  * For a simplified description, see the course notes for CS348a,
  * "Mathematical Foundations of Computer Graphics", available at the
  * Stanford bookstore (and taught during the fall quarter).
  * The implementation also borrows a tiny subset of the graph-based approach
  * use in Mantyla's Geometric Work Bench (see M. Mantyla, An Introduction
  * to Sold Modeling, Computer Science Press, Rockville, Maryland, 1988).
  *
  * The fundamental data structure is the "half-edge".  Two half-edges
  * go together to make an edge, but they point in opposite directions.
  * Each half-edge has a pointer to its mate (the "symmetric" half-edge Sym),
  * its origin vertex (Org), the face on its left side (Lface), and the
  * adjacent half-edges in the CCW direction around the origin vertex
  * (Onext) and around the left face (Lnext).  There is also a "next"
  * pointer for the global edge list (see below).
  *
  * The notation used for mesh navigation:
  *  Sym   = the mate of a half-edge (same edge, but opposite direction)
  *  Onext = edge CCW around origin vertex (keep same origin)
  *  Dnext = edge CCW around destination vertex (keep same dest)
  *  Lnext = edge CCW around left face (dest becomes new origin)
  *  Rnext = edge CCW around right face (origin becomes new dest)
  *
  * "prev" means to substitute CW for CCW in the definitions above.
  *
  * The mesh keeps global lists of all vertices, faces, and edges,
  * stored as doubly-linked circular lists with a dummy header node.
  * The mesh stores pointers to these dummy headers (vHead, fHead, eHead).
  *
  * The circular edge list is special; since half-edges always occur
  * in pairs (e and e->Sym), each half-edge stores a pointer in only
  * one direction.  Starting at eHead and following the e->next pointers
  * will visit each *edge* once (ie. e or e->Sym, but not both).
  * e->Sym stores a pointer in the opposite direction, thus it is
  * always true that e->Sym->next->Sym->next == e.
  *
  * Each vertex has a pointer to next and previous vertices in the
  * circular list, and a pointer to a half-edge with this vertex as
  * the origin (NULL if this is the dummy header).  There is also a
  * field "data" for client data.
  *
  * Each face has a pointer to the next and previous faces in the
  * circular list, and a pointer to a half-edge with this face as
  * the left face (NULL if this is the dummy header).  There is also
  * a field "data" for client data.
  *
  * Note that what we call a "face" is really a loop; faces may consist
  * of more than one loop (ie. not simply connected), but there is no
  * record of this in the data structure.  The mesh may consist of
  * several disconnected regions, so it may not be possible to visit
  * the entire mesh by starting at a half-edge and traversing the edge
  * structure.
  *
  * The mesh does NOT support isolated vertices; a vertex is deleted along
  * with its last edge.  Similarly when two faces are merged, one of the
  * faces is deleted (see tessMeshDelete below).  For mesh operations,
  * all face (loop) and vertex pointers must not be NULL.  However, once
  * mesh manipulation is finished, TESSmeshZapFace can be used to delete
  * faces of the mesh, one at a time.  All external faces can be "zapped"
  * before the mesh is returned to the client; then a NULL face indicates
  * a region which is not part of the output polygon.
  */

  function TESSvertex() {
    this.next = null; /* next vertex (never NULL) */
    this.prev = null; /* previous vertex (never NULL) */
    this.anEdge = null; /* a half-edge with this origin */

    /* Internal data (keep hidden) */
    this.coords = [0,0,0];  /* vertex location in 3D */
    this.s = 0.0;
    this.t = 0.0;     /* projection onto the sweep plane */
    this.pqHandle = 0;    /* to allow deletion from priority queue */
    this.n = 0;       /* to allow identify unique vertices */
    this.idx = 0;     /* to allow map result to original verts */
  }

  function TESSface() {
    this.next = null;   /* next face (never NULL) */
    this.prev = null;   /* previous face (never NULL) */
    this.anEdge = null;   /* a half edge with this left face */

    /* Internal data (keep hidden) */
    this.trail = null;    /* "stack" for conversion to strips */
    this.n = 0;       /* to allow identiy unique faces */
    this.marked = false;  /* flag for conversion to strips */
    this.inside = false;  /* this face is in the polygon interior */
  };

  function TESShalfEdge(side) {
    this.next = null;   /* doubly-linked list (prev==Sym->next) */
    this.Sym = null;    /* same edge, opposite direction */
    this.Onext = null;    /* next edge CCW around origin */
    this.Lnext = null;    /* next edge CCW around left face */
    this.Org = null;    /* origin vertex (Overtex too long) */
    this.Lface = null;    /* left face */

    /* Internal data (keep hidden) */
    this.activeRegion = null; /* a region with this upper edge (sweep.c) */
    this.winding = 0;     /* change in winding number when crossing
                     from the right face to the left face */
    this.side = side;
  };

  TESShalfEdge.prototype = {
    get Rface() { return this.Sym.Lface; },
    set Rface(v) { this.Sym.Lface = v; },
    get Dst() { return this.Sym.Org; },
    set Dst(v) { this.Sym.Org = v; },
    get Oprev() { return this.Sym.Lnext; },
    set Oprev(v) { this.Sym.Lnext = v; },
    get Lprev() { return this.Onext.Sym; },
    set Lprev(v) { this.Onext.Sym = v; },
    get Dprev() { return this.Lnext.Sym; },
    set Dprev(v) { this.Lnext.Sym = v; },
    get Rprev() { return this.Sym.Onext; },
    set Rprev(v) { this.Sym.Onext = v; },
    get Dnext() { return /*this.Rprev*/this.Sym.Onext.Sym; },  /* 3 pointers */
    set Dnext(v) { /*this.Rprev*/this.Sym.Onext.Sym = v; },  /* 3 pointers */
    get Rnext() { return /*this.Oprev*/this.Sym.Lnext.Sym; },  /* 3 pointers */
    set Rnext(v) { /*this.Oprev*/this.Sym.Lnext.Sym = v; },  /* 3 pointers */
  };



  function TESSmesh() {
    var v = new TESSvertex();
    var f = new TESSface();
    var e = new TESShalfEdge(0);
    var eSym = new TESShalfEdge(1);

    v.next = v.prev = v;
    v.anEdge = null;

    f.next = f.prev = f;
    f.anEdge = null;
    f.trail = null;
    f.marked = false;
    f.inside = false;

    e.next = e;
    e.Sym = eSym;
    e.Onext = null;
    e.Lnext = null;
    e.Org = null;
    e.Lface = null;
    e.winding = 0;
    e.activeRegion = null;

    eSym.next = eSym;
    eSym.Sym = e;
    eSym.Onext = null;
    eSym.Lnext = null;
    eSym.Org = null;
    eSym.Lface = null;
    eSym.winding = 0;
    eSym.activeRegion = null;

    this.vHead = v;   /* dummy header for vertex list */
    this.fHead = f;   /* dummy header for face list */
    this.eHead = e;   /* dummy header for edge list */
    this.eHeadSym = eSym; /* and its symmetric counterpart */
  };

  /* The mesh operations below have three motivations: completeness,
  * convenience, and efficiency.  The basic mesh operations are MakeEdge,
  * Splice, and Delete.  All the other edge operations can be implemented
  * in terms of these.  The other operations are provided for convenience
  * and/or efficiency.
  *
  * When a face is split or a vertex is added, they are inserted into the
  * global list *before* the existing vertex or face (ie. e->Org or e->Lface).
  * This makes it easier to process all vertices or faces in the global lists
  * without worrying about processing the same data twice.  As a convenience,
  * when a face is split, the "inside" flag is copied from the old face.
  * Other internal data (v->data, v->activeRegion, f->data, f->marked,
  * f->trail, e->winding) is set to zero.
  *
  * ********************** Basic Edge Operations **************************
  *
  * tessMeshMakeEdge( mesh ) creates one edge, two vertices, and a loop.
  * The loop (face) consists of the two new half-edges.
  *
  * tessMeshSplice( eOrg, eDst ) is the basic operation for changing the
  * mesh connectivity and topology.  It changes the mesh so that
  *  eOrg->Onext <- OLD( eDst->Onext )
  *  eDst->Onext <- OLD( eOrg->Onext )
  * where OLD(...) means the value before the meshSplice operation.
  *
  * This can have two effects on the vertex structure:
  *  - if eOrg->Org != eDst->Org, the two vertices are merged together
  *  - if eOrg->Org == eDst->Org, the origin is split into two vertices
  * In both cases, eDst->Org is changed and eOrg->Org is untouched.
  *
  * Similarly (and independently) for the face structure,
  *  - if eOrg->Lface == eDst->Lface, one loop is split into two
  *  - if eOrg->Lface != eDst->Lface, two distinct loops are joined into one
  * In both cases, eDst->Lface is changed and eOrg->Lface is unaffected.
  *
  * tessMeshDelete( eDel ) removes the edge eDel.  There are several cases:
  * if (eDel->Lface != eDel->Rface), we join two loops into one; the loop
  * eDel->Lface is deleted.  Otherwise, we are splitting one loop into two;
  * the newly created loop will contain eDel->Dst.  If the deletion of eDel
  * would create isolated vertices, those are deleted as well.
  *
  * ********************** Other Edge Operations **************************
  *
  * tessMeshAddEdgeVertex( eOrg ) creates a new edge eNew such that
  * eNew == eOrg->Lnext, and eNew->Dst is a newly created vertex.
  * eOrg and eNew will have the same left face.
  *
  * tessMeshSplitEdge( eOrg ) splits eOrg into two edges eOrg and eNew,
  * such that eNew == eOrg->Lnext.  The new vertex is eOrg->Dst == eNew->Org.
  * eOrg and eNew will have the same left face.
  *
  * tessMeshConnect( eOrg, eDst ) creates a new edge from eOrg->Dst
  * to eDst->Org, and returns the corresponding half-edge eNew.
  * If eOrg->Lface == eDst->Lface, this splits one loop into two,
  * and the newly created loop is eNew->Lface.  Otherwise, two disjoint
  * loops are merged into one, and the loop eDst->Lface is destroyed.
  *
  * ************************ Other Operations *****************************
  *
  * tessMeshNewMesh() creates a new mesh with no edges, no vertices,
  * and no loops (what we usually call a "face").
  *
  * tessMeshUnion( mesh1, mesh2 ) forms the union of all structures in
  * both meshes, and returns the new mesh (the old meshes are destroyed).
  *
  * tessMeshDeleteMesh( mesh ) will free all storage for any valid mesh.
  *
  * tessMeshZapFace( fZap ) destroys a face and removes it from the
  * global face list.  All edges of fZap will have a NULL pointer as their
  * left face.  Any edges which also have a NULL pointer as their right face
  * are deleted entirely (along with any isolated vertices this produces).
  * An entire mesh can be deleted by zapping its faces, one at a time,
  * in any order.  Zapped faces cannot be used in further mesh operations!
  *
  * tessMeshCheckMesh( mesh ) checks a mesh for self-consistency.
  */

  TESSmesh.prototype = {

    /* MakeEdge creates a new pair of half-edges which form their own loop.
    * No vertex or face structures are allocated, but these must be assigned
    * before the current edge operation is completed.
    */
    //static TESShalfEdge *MakeEdge( TESSmesh* mesh, TESShalfEdge *eNext )
    makeEdge_: function(eNext) {
      var e = new TESShalfEdge(0);
      var eSym = new TESShalfEdge(1);

      /* Make sure eNext points to the first edge of the edge pair */
      if( eNext.Sym.side < eNext.side ) { eNext = eNext.Sym; }

      /* Insert in circular doubly-linked list before eNext.
      * Note that the prev pointer is stored in Sym->next.
      */
      var ePrev = eNext.Sym.next;
      eSym.next = ePrev;
      ePrev.Sym.next = e;
      e.next = eNext;
      eNext.Sym.next = eSym;

      e.Sym = eSym;
      e.Onext = e;
      e.Lnext = eSym;
      e.Org = null;
      e.Lface = null;
      e.winding = 0;
      e.activeRegion = null;

      eSym.Sym = e;
      eSym.Onext = eSym;
      eSym.Lnext = e;
      eSym.Org = null;
      eSym.Lface = null;
      eSym.winding = 0;
      eSym.activeRegion = null;

      return e;
    },

    /* Splice( a, b ) is best described by the Guibas/Stolfi paper or the
    * CS348a notes (see mesh.h).  Basically it modifies the mesh so that
    * a->Onext and b->Onext are exchanged.  This can have various effects
    * depending on whether a and b belong to different face or vertex rings.
    * For more explanation see tessMeshSplice() below.
    */
    // static void Splice( TESShalfEdge *a, TESShalfEdge *b )
    splice_: function(a, b) {
      var aOnext = a.Onext;
      var bOnext = b.Onext;
      aOnext.Sym.Lnext = b;
      bOnext.Sym.Lnext = a;
      a.Onext = bOnext;
      b.Onext = aOnext;
    },

    /* MakeVertex( newVertex, eOrig, vNext ) attaches a new vertex and makes it the
    * origin of all edges in the vertex loop to which eOrig belongs. "vNext" gives
    * a place to insert the new vertex in the global vertex list.  We insert
    * the new vertex *before* vNext so that algorithms which walk the vertex
    * list will not see the newly created vertices.
    */
    //static void MakeVertex( TESSvertex *newVertex, TESShalfEdge *eOrig, TESSvertex *vNext )
    makeVertex_: function(newVertex, eOrig, vNext) {
      var vNew = newVertex;
      assert(vNew !== null);

      /* insert in circular doubly-linked list before vNext */
      var vPrev = vNext.prev;
      vNew.prev = vPrev;
      vPrev.next = vNew;
      vNew.next = vNext;
      vNext.prev = vNew;

      vNew.anEdge = eOrig;
      /* leave coords, s, t undefined */

      /* fix other edges on this vertex loop */
      var e = eOrig;
      do {
        e.Org = vNew;
        e = e.Onext;
      } while(e !== eOrig);
    },

    /* MakeFace( newFace, eOrig, fNext ) attaches a new face and makes it the left
    * face of all edges in the face loop to which eOrig belongs.  "fNext" gives
    * a place to insert the new face in the global face list.  We insert
    * the new face *before* fNext so that algorithms which walk the face
    * list will not see the newly created faces.
    */
    // static void MakeFace( TESSface *newFace, TESShalfEdge *eOrig, TESSface *fNext )
    makeFace_: function(newFace, eOrig, fNext) {
      var fNew = newFace;
      assert(fNew !== null);

      /* insert in circular doubly-linked list before fNext */
      var fPrev = fNext.prev;
      fNew.prev = fPrev;
      fPrev.next = fNew;
      fNew.next = fNext;
      fNext.prev = fNew;

      fNew.anEdge = eOrig;
      fNew.trail = null;
      fNew.marked = false;

      /* The new face is marked "inside" if the old one was.  This is a
      * convenience for the common case where a face has been split in two.
      */
      fNew.inside = fNext.inside;

      /* fix other edges on this face loop */
      var e = eOrig;
      do {
        e.Lface = fNew;
        e = e.Lnext;
      } while(e !== eOrig);
    },

    /* KillEdge( eDel ) destroys an edge (the half-edges eDel and eDel->Sym),
    * and removes from the global edge list.
    */
    //static void KillEdge( TESSmesh *mesh, TESShalfEdge *eDel )
    killEdge_: function(eDel) {
      /* Half-edges are allocated in pairs, see EdgePair above */
      if( eDel.Sym.side < eDel.side ) { eDel = eDel.Sym; }

      /* delete from circular doubly-linked list */
      var eNext = eDel.next;
      var ePrev = eDel.Sym.next;
      eNext.Sym.next = ePrev;
      ePrev.Sym.next = eNext;
    },


    /* KillVertex( vDel ) destroys a vertex and removes it from the global
    * vertex list.  It updates the vertex loop to point to a given new vertex.
    */
    //static void KillVertex( TESSmesh *mesh, TESSvertex *vDel, TESSvertex *newOrg )
    killVertex_: function(vDel, newOrg) {
      var eStart = vDel.anEdge;
      /* change the origin of all affected edges */
      var e = eStart;
      do {
        e.Org = newOrg;
        e = e.Onext;
      } while(e !== eStart);

      /* delete from circular doubly-linked list */
      var vPrev = vDel.prev;
      var vNext = vDel.next;
      vNext.prev = vPrev;
      vPrev.next = vNext;
    },

    /* KillFace( fDel ) destroys a face and removes it from the global face
    * list.  It updates the face loop to point to a given new face.
    */
    //static void KillFace( TESSmesh *mesh, TESSface *fDel, TESSface *newLface )
    killFace_: function(fDel, newLface) {
      var eStart = fDel.anEdge;

      /* change the left face of all affected edges */
      var e = eStart;
      do {
        e.Lface = newLface;
        e = e.Lnext;
      } while(e !== eStart);

      /* delete from circular doubly-linked list */
      var fPrev = fDel.prev;
      var fNext = fDel.next;
      fNext.prev = fPrev;
      fPrev.next = fNext;
    },

    /****************** Basic Edge Operations **********************/

    /* tessMeshMakeEdge creates one edge, two vertices, and a loop (face).
    * The loop consists of the two new half-edges.
    */
    //TESShalfEdge *tessMeshMakeEdge( TESSmesh *mesh )
    makeEdge: function() {
      var newVertex1 = new TESSvertex();
      var newVertex2 = new TESSvertex();
      var newFace = new TESSface();
      var e = this.makeEdge_( this.eHead);
      this.makeVertex_( newVertex1, e, this.vHead );
      this.makeVertex_( newVertex2, e.Sym, this.vHead );
      this.makeFace_( newFace, e, this.fHead );
      return e;
    },

    /* tessMeshSplice( eOrg, eDst ) is the basic operation for changing the
    * mesh connectivity and topology.  It changes the mesh so that
    * eOrg->Onext <- OLD( eDst->Onext )
    * eDst->Onext <- OLD( eOrg->Onext )
    * where OLD(...) means the value before the meshSplice operation.
    *
    * This can have two effects on the vertex structure:
    *  - if eOrg->Org != eDst->Org, the two vertices are merged together
    *  - if eOrg->Org == eDst->Org, the origin is split into two vertices
    * In both cases, eDst->Org is changed and eOrg->Org is untouched.
    *
    * Similarly (and independently) for the face structure,
    *  - if eOrg->Lface == eDst->Lface, one loop is split into two
    *  - if eOrg->Lface != eDst->Lface, two distinct loops are joined into one
    * In both cases, eDst->Lface is changed and eOrg->Lface is unaffected.
    *
    * Some special cases:
    * If eDst == eOrg, the operation has no effect.
    * If eDst == eOrg->Lnext, the new face will have a single edge.
    * If eDst == eOrg->Lprev, the old face will have a single edge.
    * If eDst == eOrg->Onext, the new vertex will have a single edge.
    * If eDst == eOrg->Oprev, the old vertex will have a single edge.
    */
    //int tessMeshSplice( TESSmesh* mesh, TESShalfEdge *eOrg, TESShalfEdge *eDst )
    splice: function(eOrg, eDst) {
      var joiningLoops = false;
      var joiningVertices = false;

      if( eOrg === eDst ) return;

      if( eDst.Org !== eOrg.Org ) {
        /* We are merging two disjoint vertices -- destroy eDst->Org */
        joiningVertices = true;
        this.killVertex_( eDst.Org, eOrg.Org );
      }
      if( eDst.Lface !== eOrg.Lface ) {
        /* We are connecting two disjoint loops -- destroy eDst->Lface */
        joiningLoops = true;
        this.killFace_( eDst.Lface, eOrg.Lface );
      }

      /* Change the edge structure */
      this.splice_( eDst, eOrg );

      if( ! joiningVertices ) {
        var newVertex = new TESSvertex();

        /* We split one vertex into two -- the new vertex is eDst->Org.
        * Make sure the old vertex points to a valid half-edge.
        */
        this.makeVertex_( newVertex, eDst, eOrg.Org );
        eOrg.Org.anEdge = eOrg;
      }
      if( ! joiningLoops ) {
        var newFace = new TESSface();

        /* We split one loop into two -- the new loop is eDst->Lface.
        * Make sure the old face points to a valid half-edge.
        */
        this.makeFace_( newFace, eDst, eOrg.Lface );
        eOrg.Lface.anEdge = eOrg;
      }
    },

    /* tessMeshDelete( eDel ) removes the edge eDel.  There are several cases:
    * if (eDel->Lface != eDel->Rface), we join two loops into one; the loop
    * eDel->Lface is deleted.  Otherwise, we are splitting one loop into two;
    * the newly created loop will contain eDel->Dst.  If the deletion of eDel
    * would create isolated vertices, those are deleted as well.
    *
    * This function could be implemented as two calls to tessMeshSplice
    * plus a few calls to memFree, but this would allocate and delete
    * unnecessary vertices and faces.
    */
    //int tessMeshDelete( TESSmesh *mesh, TESShalfEdge *eDel )
    delete: function(eDel) {
      var eDelSym = eDel.Sym;
      var joiningLoops = false;

      /* First step: disconnect the origin vertex eDel->Org.  We make all
      * changes to get a consistent mesh in this "intermediate" state.
      */
      if( eDel.Lface !== eDel.Rface ) {
        /* We are joining two loops into one -- remove the left face */
        joiningLoops = true;
        this.killFace_( eDel.Lface, eDel.Rface );
      }

      if( eDel.Onext === eDel ) {
        this.killVertex_( eDel.Org, null );
      } else {
        /* Make sure that eDel->Org and eDel->Rface point to valid half-edges */
        eDel.Rface.anEdge = eDel.Oprev;
        eDel.Org.anEdge = eDel.Onext;

        this.splice_( eDel, eDel.Oprev );
        if( ! joiningLoops ) {
          var newFace = new TESSface();

          /* We are splitting one loop into two -- create a new loop for eDel. */
          this.makeFace_( newFace, eDel, eDel.Lface );
        }
      }

      /* Claim: the mesh is now in a consistent state, except that eDel->Org
      * may have been deleted.  Now we disconnect eDel->Dst.
      */
      if( eDelSym.Onext === eDelSym ) {
        this.killVertex_( eDelSym.Org, null );
        this.killFace_( eDelSym.Lface, null );
      } else {
        /* Make sure that eDel->Dst and eDel->Lface point to valid half-edges */
        eDel.Lface.anEdge = eDelSym.Oprev;
        eDelSym.Org.anEdge = eDelSym.Onext;
        this.splice_( eDelSym, eDelSym.Oprev );
      }

      /* Any isolated vertices or faces have already been freed. */
      this.killEdge_( eDel );
    },

    /******************** Other Edge Operations **********************/

    /* All these routines can be implemented with the basic edge
    * operations above.  They are provided for convenience and efficiency.
    */


    /* tessMeshAddEdgeVertex( eOrg ) creates a new edge eNew such that
    * eNew == eOrg->Lnext, and eNew->Dst is a newly created vertex.
    * eOrg and eNew will have the same left face.
    */
    // TESShalfEdge *tessMeshAddEdgeVertex( TESSmesh *mesh, TESShalfEdge *eOrg );
    addEdgeVertex: function(eOrg) {
      var eNew = this.makeEdge_( eOrg );
      var eNewSym = eNew.Sym;

      /* Connect the new edge appropriately */
      this.splice_( eNew, eOrg.Lnext );

      /* Set the vertex and face information */
      eNew.Org = eOrg.Dst;

      var newVertex = new TESSvertex();
      this.makeVertex_( newVertex, eNewSym, eNew.Org );

      eNew.Lface = eNewSym.Lface = eOrg.Lface;

      return eNew;
    },


    /* tessMeshSplitEdge( eOrg ) splits eOrg into two edges eOrg and eNew,
    * such that eNew == eOrg->Lnext.  The new vertex is eOrg->Dst == eNew->Org.
    * eOrg and eNew will have the same left face.
    */
    // TESShalfEdge *tessMeshSplitEdge( TESSmesh *mesh, TESShalfEdge *eOrg );
    splitEdge: function(eOrg, eDst) {
      var tempHalfEdge = this.addEdgeVertex( eOrg );
      var eNew = tempHalfEdge.Sym;

      /* Disconnect eOrg from eOrg->Dst and connect it to eNew->Org */
      this.splice_( eOrg.Sym, eOrg.Sym.Oprev );
      this.splice_( eOrg.Sym, eNew );

      /* Set the vertex and face information */
      eOrg.Dst = eNew.Org;
      eNew.Dst.anEdge = eNew.Sym; /* may have pointed to eOrg->Sym */
      eNew.Rface = eOrg.Rface;
      eNew.winding = eOrg.winding;  /* copy old winding information */
      eNew.Sym.winding = eOrg.Sym.winding;

      return eNew;
    },


    /* tessMeshConnect( eOrg, eDst ) creates a new edge from eOrg->Dst
    * to eDst->Org, and returns the corresponding half-edge eNew.
    * If eOrg->Lface == eDst->Lface, this splits one loop into two,
    * and the newly created loop is eNew->Lface.  Otherwise, two disjoint
    * loops are merged into one, and the loop eDst->Lface is destroyed.
    *
    * If (eOrg == eDst), the new face will have only two edges.
    * If (eOrg->Lnext == eDst), the old face is reduced to a single edge.
    * If (eOrg->Lnext->Lnext == eDst), the old face is reduced to two edges.
    */

    // TESShalfEdge *tessMeshConnect( TESSmesh *mesh, TESShalfEdge *eOrg, TESShalfEdge *eDst );
    connect: function(eOrg, eDst) {
      var joiningLoops = false;
      var eNew = this.makeEdge_( eOrg );
      var eNewSym = eNew.Sym;

      if( eDst.Lface !== eOrg.Lface ) {
        /* We are connecting two disjoint loops -- destroy eDst->Lface */
        joiningLoops = true;
        this.killFace_( eDst.Lface, eOrg.Lface );
      }

      /* Connect the new edge appropriately */
      this.splice_( eNew, eOrg.Lnext );
      this.splice_( eNewSym, eDst );

      /* Set the vertex and face information */
      eNew.Org = eOrg.Dst;
      eNewSym.Org = eDst.Org;
      eNew.Lface = eNewSym.Lface = eOrg.Lface;

      /* Make sure the old face points to a valid half-edge */
      eOrg.Lface.anEdge = eNewSym;

      if( ! joiningLoops ) {
        var newFace = new TESSface();
        /* We split one loop into two -- the new loop is eNew->Lface */
        this.makeFace_( newFace, eNew, eOrg.Lface );
      }
      return eNew;
    },

    /* tessMeshZapFace( fZap ) destroys a face and removes it from the
    * global face list.  All edges of fZap will have a NULL pointer as their
    * left face.  Any edges which also have a NULL pointer as their right face
    * are deleted entirely (along with any isolated vertices this produces).
    * An entire mesh can be deleted by zapping its faces, one at a time,
    * in any order.  Zapped faces cannot be used in further mesh operations!
    */
    zapFace: function( fZap )
    {
      var eStart = fZap.anEdge;
      var e, eNext, eSym;
      var fPrev, fNext;

      /* walk around face, deleting edges whose right face is also NULL */
      eNext = eStart.Lnext;
      do {
        e = eNext;
        eNext = e.Lnext;

        e.Lface = null;
        if( e.Rface === null ) {
          /* delete the edge -- see TESSmeshDelete above */

          if( e.Onext === e ) {
            this.killVertex_( e.Org, null );
          } else {
            /* Make sure that e->Org points to a valid half-edge */
            e.Org.anEdge = e.Onext;
            this.splice_( e, e.Oprev );
          }
          eSym = e.Sym;
          if( eSym.Onext === eSym ) {
            this.killVertex_( eSym.Org, null );
          } else {
            /* Make sure that eSym->Org points to a valid half-edge */
            eSym.Org.anEdge = eSym.Onext;
            this.splice_( eSym, eSym.Oprev );
          }
          this.killEdge_( e );
        }
      } while( e != eStart );

      /* delete from circular doubly-linked list */
      fPrev = fZap.prev;
      fNext = fZap.next;
      fNext.prev = fPrev;
      fPrev.next = fNext;
    },

    countFaceVerts_: function(f) {
      var eCur = f.anEdge;
      var n = 0;
      do
      {
        n++;
        eCur = eCur.Lnext;
      }
      while (eCur !== f.anEdge);
      return n;
    },

    //int tessMeshMergeConvexFaces( TESSmesh *mesh, int maxVertsPerFace )
    mergeConvexFaces: function(maxVertsPerFace) {
      var f;
      var eCur, eNext, eSym;
      var vStart;
      var curNv, symNv;

      for( f = this.fHead.next; f !== this.fHead; f = f.next )
      {
        // Skip faces which are outside the result.
        if( !f.inside )
          continue;

        eCur = f.anEdge;
        vStart = eCur.Org;

        while (true)
        {
          eNext = eCur.Lnext;
          eSym = eCur.Sym;

          // Try to merge if the neighbour face is valid.
          if( eSym && eSym.Lface && eSym.Lface.inside )
          {
            // Try to merge the neighbour faces if the resulting polygons
            // does not exceed maximum number of vertices.
            curNv = this.countFaceVerts_( f );
            symNv = this.countFaceVerts_( eSym.Lface );
            if( (curNv+symNv-2) <= maxVertsPerFace )
            {
              // Merge if the resulting poly is convex.
              if( Geom.vertCCW( eCur.Lprev.Org, eCur.Org, eSym.Lnext.Lnext.Org ) &&
                Geom.vertCCW( eSym.Lprev.Org, eSym.Org, eCur.Lnext.Lnext.Org ) )
              {
                eNext = eSym.Lnext;
                this.delete( eSym );
                eCur = null;
                eSym = null;
              }
            }
          }

          if( eCur && eCur.Lnext.Org === vStart )
            break;

          // Continue to next edge.
          eCur = eNext;
        }
      }

      return true;
    },

    /* tessMeshCheckMesh( mesh ) checks a mesh for self-consistency.
    */
    check: function() {
      var fHead = this.fHead;
      var vHead = this.vHead;
      var eHead = this.eHead;
      var f, fPrev, v, vPrev, e, ePrev;

      fPrev = fHead;
      for( fPrev = fHead ; (f = fPrev.next) !== fHead; fPrev = f) {
        assert( f.prev === fPrev );
        e = f.anEdge;
        do {
          assert( e.Sym !== e );
          assert( e.Sym.Sym === e );
          assert( e.Lnext.Onext.Sym === e );
          assert( e.Onext.Sym.Lnext === e );
          assert( e.Lface === f );
          e = e.Lnext;
        } while( e !== f.anEdge );
      }
      assert( f.prev === fPrev && f.anEdge === null );

      vPrev = vHead;
      for( vPrev = vHead ; (v = vPrev.next) !== vHead; vPrev = v) {
        assert( v.prev === vPrev );
        e = v.anEdge;
        do {
          assert( e.Sym !== e );
          assert( e.Sym.Sym === e );
          assert( e.Lnext.Onext.Sym === e );
          assert( e.Onext.Sym.Lnext === e );
          assert( e.Org === v );
          e = e.Onext;
        } while( e !== v.anEdge );
      }
      assert( v.prev === vPrev && v.anEdge === null );

      ePrev = eHead;
      for( ePrev = eHead ; (e = ePrev.next) !== eHead; ePrev = e) {
        assert( e.Sym.next === ePrev.Sym );
        assert( e.Sym !== e );
        assert( e.Sym.Sym === e );
        assert( e.Org !== null );
        assert( e.Dst !== null );
        assert( e.Lnext.Onext.Sym === e );
        assert( e.Onext.Sym.Lnext === e );
      }
      assert( e.Sym.next === ePrev.Sym
        && e.Sym === this.eHeadSym
        && e.Sym.Sym === e
        && e.Org === null && e.Dst === null
        && e.Lface === null && e.Rface === null );
    }

  };

  var Geom = {};

  Geom.vertEq = function(u,v) {
    return (u.s === v.s && u.t === v.t);
  };

  /* Returns TRUE if u is lexicographically <= v. */
  Geom.vertLeq = function(u,v) {
    return ((u.s < v.s) || (u.s === v.s && u.t <= v.t));
  };

  /* Versions of VertLeq, EdgeSign, EdgeEval with s and t transposed. */
  Geom.transLeq = function(u,v) {
    return ((u.t < v.t) || (u.t === v.t && u.s <= v.s));
  };

  Geom.edgeGoesLeft = function(e) {
    return Geom.vertLeq( e.Dst, e.Org );
  };

  Geom.edgeGoesRight = function(e) {
    return Geom.vertLeq( e.Org, e.Dst );
  };

  Geom.vertL1dist = function(u,v) {
    return (Math.abs(u.s - v.s) + Math.abs(u.t - v.t));
  };

  //TESSreal tesedgeEval( TESSvertex *u, TESSvertex *v, TESSvertex *w )
  Geom.edgeEval = function( u, v, w ) {
    /* Given three vertices u,v,w such that VertLeq(u,v) && VertLeq(v,w),
    * evaluates the t-coord of the edge uw at the s-coord of the vertex v.
    * Returns v->t - (uw)(v->s), ie. the signed distance from uw to v.
    * If uw is vertical (and thus passes thru v), the result is zero.
    *
    * The calculation is extremely accurate and stable, even when v
    * is very close to u or w.  In particular if we set v->t = 0 and
    * let r be the negated result (this evaluates (uw)(v->s)), then
    * r is guaranteed to satisfy MIN(u->t,w->t) <= r <= MAX(u->t,w->t).
    */
    assert( Geom.vertLeq( u, v ) && Geom.vertLeq( v, w ));

    var gapL = v.s - u.s;
    var gapR = w.s - v.s;

    if( gapL + gapR > 0.0 ) {
      if( gapL < gapR ) {
        return (v.t - u.t) + (u.t - w.t) * (gapL / (gapL + gapR));
      } else {
        return (v.t - w.t) + (w.t - u.t) * (gapR / (gapL + gapR));
      }
    }
    /* vertical line */
    return 0.0;
  };

  //TESSreal tesedgeSign( TESSvertex *u, TESSvertex *v, TESSvertex *w )
  Geom.edgeSign = function( u, v, w ) {
    /* Returns a number whose sign matches EdgeEval(u,v,w) but which
    * is cheaper to evaluate.  Returns > 0, == 0 , or < 0
    * as v is above, on, or below the edge uw.
    */
    assert( Geom.vertLeq( u, v ) && Geom.vertLeq( v, w ));

    var gapL = v.s - u.s;
    var gapR = w.s - v.s;

    if( gapL + gapR > 0.0 ) {
      return (v.t - w.t) * gapL + (v.t - u.t) * gapR;
    }
    /* vertical line */
    return 0.0;
  };


  /***********************************************************************
  * Define versions of EdgeSign, EdgeEval with s and t transposed.
  */

  //TESSreal testransEval( TESSvertex *u, TESSvertex *v, TESSvertex *w )
  Geom.transEval = function( u, v, w ) {
    /* Given three vertices u,v,w such that TransLeq(u,v) && TransLeq(v,w),
    * evaluates the t-coord of the edge uw at the s-coord of the vertex v.
    * Returns v->s - (uw)(v->t), ie. the signed distance from uw to v.
    * If uw is vertical (and thus passes thru v), the result is zero.
    *
    * The calculation is extremely accurate and stable, even when v
    * is very close to u or w.  In particular if we set v->s = 0 and
    * let r be the negated result (this evaluates (uw)(v->t)), then
    * r is guaranteed to satisfy MIN(u->s,w->s) <= r <= MAX(u->s,w->s).
    */
    assert( Geom.transLeq( u, v ) && Geom.transLeq( v, w ));

    var gapL = v.t - u.t;
    var gapR = w.t - v.t;

    if( gapL + gapR > 0.0 ) {
      if( gapL < gapR ) {
        return (v.s - u.s) + (u.s - w.s) * (gapL / (gapL + gapR));
      } else {
        return (v.s - w.s) + (w.s - u.s) * (gapR / (gapL + gapR));
      }
    }
    /* vertical line */
    return 0.0;
  };

  //TESSreal testransSign( TESSvertex *u, TESSvertex *v, TESSvertex *w )
  Geom.transSign = function( u, v, w ) {
    /* Returns a number whose sign matches TransEval(u,v,w) but which
    * is cheaper to evaluate.  Returns > 0, == 0 , or < 0
    * as v is above, on, or below the edge uw.
    */
    assert( Geom.transLeq( u, v ) && Geom.transLeq( v, w ));

    var gapL = v.t - u.t;
    var gapR = w.t - v.t;

    if( gapL + gapR > 0.0 ) {
      return (v.s - w.s) * gapL + (v.s - u.s) * gapR;
    }
    /* vertical line */
    return 0.0;
  };


  //int tesvertCCW( TESSvertex *u, TESSvertex *v, TESSvertex *w )
  Geom.vertCCW = function( u, v, w ) {
    /* For almost-degenerate situations, the results are not reliable.
    * Unless the floating-point arithmetic can be performed without
    * rounding errors, *any* implementation will give incorrect results
    * on some degenerate inputs, so the client must have some way to
    * handle this situation.
    */
    return (u.s*(v.t - w.t) + v.s*(w.t - u.t) + w.s*(u.t - v.t)) >= 0.0;
  };

  /* Given parameters a,x,b,y returns the value (b*x+a*y)/(a+b),
  * or (x+y)/2 if a==b==0.  It requires that a,b >= 0, and enforces
  * this in the rare case that one argument is slightly negative.
  * The implementation is extremely stable numerically.
  * In particular it guarantees that the result r satisfies
  * MIN(x,y) <= r <= MAX(x,y), and the results are very accurate
  * even when a and b differ greatly in magnitude.
  */
  Geom.interpolate = function(a,x,b,y) {
    return (a = (a < 0) ? 0 : a, b = (b < 0) ? 0 : b, ((a <= b) ? ((b == 0) ? ((x+y) / 2) : (x + (y-x) * (a/(a+b)))) : (y + (x-y) * (b/(a+b)))));
  };

  /*
  #ifndef FOR_TRITE_TEST_PROGRAM
  #define Interpolate(a,x,b,y)  RealInterpolate(a,x,b,y)
  #else

  // Claim: the ONLY property the sweep algorithm relies on is that
  // MIN(x,y) <= r <= MAX(x,y).  This is a nasty way to test that.
  #include <stdlib.h>
  extern int RandomInterpolate;

  double Interpolate( double a, double x, double b, double y)
  {
    printf("*********************%d\n",RandomInterpolate);
    if( RandomInterpolate ) {
      a = 1.2 * drand48() - 0.1;
      a = (a < 0) ? 0 : ((a > 1) ? 1 : a);
      b = 1.0 - a;
    }
    return RealInterpolate(a,x,b,y);
  }
  #endif*/

  Geom.intersect = function( o1, d1, o2, d2, v ) {
    /* Given edges (o1,d1) and (o2,d2), compute their point of intersection.
    * The computed point is guaranteed to lie in the intersection of the
    * bounding rectangles defined by each edge.
    */
    var z1, z2;
    var t;

    /* This is certainly not the most efficient way to find the intersection
    * of two line segments, but it is very numerically stable.
    *
    * Strategy: find the two middle vertices in the VertLeq ordering,
    * and interpolate the intersection s-value from these.  Then repeat
    * using the TransLeq ordering to find the intersection t-value.
    */

    if( ! Geom.vertLeq( o1, d1 )) { t = o1; o1 = d1; d1 = t; } //swap( o1, d1 ); }
    if( ! Geom.vertLeq( o2, d2 )) { t = o2; o2 = d2; d2 = t; } //swap( o2, d2 ); }
    if( ! Geom.vertLeq( o1, o2 )) { t = o1; o1 = o2; o2 = t; t = d1; d1 = d2; d2 = t; }//swap( o1, o2 ); swap( d1, d2 ); }

    if( ! Geom.vertLeq( o2, d1 )) {
      /* Technically, no intersection -- do our best */
      v.s = (o2.s + d1.s) / 2;
    } else if( Geom.vertLeq( d1, d2 )) {
      /* Interpolate between o2 and d1 */
      z1 = Geom.edgeEval( o1, o2, d1 );
      z2 = Geom.edgeEval( o2, d1, d2 );
      if( z1+z2 < 0 ) { z1 = -z1; z2 = -z2; }
      v.s = Geom.interpolate( z1, o2.s, z2, d1.s );
    } else {
      /* Interpolate between o2 and d2 */
      z1 = Geom.edgeSign( o1, o2, d1 );
      z2 = -Geom.edgeSign( o1, d2, d1 );
      if( z1+z2 < 0 ) { z1 = -z1; z2 = -z2; }
      v.s = Geom.interpolate( z1, o2.s, z2, d2.s );
    }

    /* Now repeat the process for t */

    if( ! Geom.transLeq( o1, d1 )) { t = o1; o1 = d1; d1 = t; } //swap( o1, d1 ); }
    if( ! Geom.transLeq( o2, d2 )) { t = o2; o2 = d2; d2 = t; } //swap( o2, d2 ); }
    if( ! Geom.transLeq( o1, o2 )) { t = o1; o1 = o2; o2 = t; t = d1; d1 = d2; d2 = t; } //swap( o1, o2 ); swap( d1, d2 ); }

    if( ! Geom.transLeq( o2, d1 )) {
      /* Technically, no intersection -- do our best */
      v.t = (o2.t + d1.t) / 2;
    } else if( Geom.transLeq( d1, d2 )) {
      /* Interpolate between o2 and d1 */
      z1 = Geom.transEval( o1, o2, d1 );
      z2 = Geom.transEval( o2, d1, d2 );
      if( z1+z2 < 0 ) { z1 = -z1; z2 = -z2; }
      v.t = Geom.interpolate( z1, o2.t, z2, d1.t );
    } else {
      /* Interpolate between o2 and d2 */
      z1 = Geom.transSign( o1, o2, d1 );
      z2 = -Geom.transSign( o1, d2, d1 );
      if( z1+z2 < 0 ) { z1 = -z1; z2 = -z2; }
      v.t = Geom.interpolate( z1, o2.t, z2, d2.t );
    }
  };



  function DictNode() {
    this.key = null;
    this.next = null;
    this.prev = null;
  };

  function Dict(frame, leq) {
    this.head = new DictNode();
    this.head.next = this.head;
    this.head.prev = this.head;
    this.frame = frame;
    this.leq = leq;
  };

  Dict.prototype = {
    min: function() {
      return this.head.next;
    },

    max: function() {
      return this.head.prev;
    },

    insert: function(k) {
      return this.insertBefore(this.head, k);
    },

    search: function(key) {
      /* Search returns the node with the smallest key greater than or equal
      * to the given key.  If there is no such key, returns a node whose
      * key is NULL.  Similarly, Succ(Max(d)) has a NULL key, etc.
      */
      var node = this.head;
      do {
        node = node.next;
      } while( node.key !== null && ! this.leq(this.frame, key, node.key));

      return node;
    },

    insertBefore: function(node, key) {
      do {
        node = node.prev;
      } while( node.key !== null && ! this.leq(this.frame, node.key, key));

      var newNode = new DictNode();
      newNode.key = key;
      newNode.next = node.next;
      node.next.prev = newNode;
      newNode.prev = node;
      node.next = newNode;

      return newNode;
    },

    delete: function(node) {
      node.next.prev = node.prev;
      node.prev.next = node.next;
    }
  };


  function PQnode() {
    this.handle = null;
  }

  function PQhandleElem() {
    this.key = null;
    this.node = null;
  }

  function PriorityQ(size, leq) {
    this.size = 0;
    this.max = size;

    this.nodes = [];
    this.nodes.length = size+1;
    for (var i = 0; i < this.nodes.length; i++)
      this.nodes[i] = new PQnode();

    this.handles = [];
    this.handles.length = size+1;
    for (var i = 0; i < this.handles.length; i++)
      this.handles[i] = new PQhandleElem();

    this.initialized = false;
    this.freeList = 0;
    this.leq = leq;

    this.nodes[1].handle = 1; /* so that Minimum() returns NULL */
    this.handles[1].key = null;
  };

  PriorityQ.prototype = {

    floatDown_: function( curr )
    {
      var n = this.nodes;
      var h = this.handles;
      var hCurr, hChild;
      var child;

      hCurr = n[curr].handle;
      for( ;; ) {
        child = curr << 1;
        if( child < this.size && this.leq( h[n[child+1].handle].key, h[n[child].handle].key )) {
          ++child;
        }

        assert(child <= this.max);

        hChild = n[child].handle;
        if( child > this.size || this.leq( h[hCurr].key, h[hChild].key )) {
          n[curr].handle = hCurr;
          h[hCurr].node = curr;
          break;
        }
        n[curr].handle = hChild;
        h[hChild].node = curr;
        curr = child;
      }
    },

    floatUp_: function( curr )
    {
      var n = this.nodes;
      var h = this.handles;
      var hCurr, hParent;
      var parent;

      hCurr = n[curr].handle;
      for( ;; ) {
        parent = curr >> 1;
        hParent = n[parent].handle;
        if( parent == 0 || this.leq( h[hParent].key, h[hCurr].key )) {
          n[curr].handle = hCurr;
          h[hCurr].node = curr;
          break;
        }
        n[curr].handle = hParent;
        h[hParent].node = curr;
        curr = parent;
      }
    },

    init: function() {
      /* This method of building a heap is O(n), rather than O(n lg n). */
      for( var i = this.size; i >= 1; --i ) {
        this.floatDown_( i );
      }
      this.initialized = true;
    },

    min: function() {
      return this.handles[this.nodes[1].handle].key;
    },

    isEmpty: function() {
      this.size === 0;
    },

    /* really pqHeapInsert */
    /* returns INV_HANDLE iff out of memory */
    //PQhandle pqHeapInsert( TESSalloc* alloc, PriorityQHeap *pq, PQkey keyNew )
    insert: function(keyNew)
    {
      var curr;
      var free;

      curr = ++this.size;
      if( (curr*2) > this.max ) {
        this.max *= 2;
        var s;
        s = this.nodes.length;
        this.nodes.length = this.max+1;
        for (var i = s; i < this.nodes.length; i++)
          this.nodes[i] = new PQnode();

        s = this.handles.length;
        this.handles.length = this.max+1;
        for (var i = s; i < this.handles.length; i++)
          this.handles[i] = new PQhandleElem();
      }

      if( this.freeList === 0 ) {
        free = curr;
      } else {
        free = this.freeList;
        this.freeList = this.handles[free].node;
      }

      this.nodes[curr].handle = free;
      this.handles[free].node = curr;
      this.handles[free].key = keyNew;

      if( this.initialized ) {
        this.floatUp_( curr );
      }
      return free;
    },

    //PQkey pqHeapExtractMin( PriorityQHeap *pq )
    extractMin: function() {
      var n = this.nodes;
      var h = this.handles;
      var hMin = n[1].handle;
      var min = h[hMin].key;

      if( this.size > 0 ) {
        n[1].handle = n[this.size].handle;
        h[n[1].handle].node = 1;

        h[hMin].key = null;
        h[hMin].node = this.freeList;
        this.freeList = hMin;

        --this.size;
        if( this.size > 0 ) {
          this.floatDown_( 1 );
        }
      }
      return min;
    },

    delete: function( hCurr ) {
      var n = this.nodes;
      var h = this.handles;
      var curr;

      assert( hCurr >= 1 && hCurr <= this.max && h[hCurr].key !== null );

      curr = h[hCurr].node;
      n[curr].handle = n[this.size].handle;
      h[n[curr].handle].node = curr;

      --this.size;
      if( curr <= this.size ) {
        if( curr <= 1 || this.leq( h[n[curr>>1].handle].key, h[n[curr].handle].key )) {
          this.floatDown_( curr );
        } else {
          this.floatUp_( curr );
        }
      }
      h[hCurr].key = null;
      h[hCurr].node = this.freeList;
      this.freeList = hCurr;
    }
  };


  /* For each pair of adjacent edges crossing the sweep line, there is
  * an ActiveRegion to represent the region between them.  The active
  * regions are kept in sorted order in a dynamic dictionary.  As the
  * sweep line crosses each vertex, we update the affected regions.
  */

  function ActiveRegion() {
    this.eUp = null;    /* upper edge, directed right to left */
    this.nodeUp = null; /* dictionary node corresponding to eUp */
    this.windingNumber = 0; /* used to determine which regions are
                * inside the polygon */
    this.inside = false;    /* is this region inside the polygon? */
    this.sentinel = false;  /* marks fake edges at t = +/-infinity */
    this.dirty = false;   /* marks regions where the upper or lower
            * edge has changed, but we haven't checked
            * whether they intersect yet */
    this.fixUpperEdge = false;  /* marks temporary edges introduced when
              * we process a "right vertex" (one without
              * any edges leaving to the right) */
  };

  var Sweep = {};

  Sweep.regionBelow = function(r) {
    return r.nodeUp.prev.key;
  }

  Sweep.regionAbove = function(r) {
    return r.nodeUp.next.key;
  }

  Sweep.debugEvent = function( tess ) {
    // empty
  }


  /*
  * Invariants for the Edge Dictionary.
  * - each pair of adjacent edges e2=Succ(e1) satisfies EdgeLeq(e1,e2)
  *   at any valid location of the sweep event
  * - if EdgeLeq(e2,e1) as well (at any valid sweep event), then e1 and e2
  *   share a common endpoint
  * - for each e, e->Dst has been processed, but not e->Org
  * - each edge e satisfies VertLeq(e->Dst,event) && VertLeq(event,e->Org)
  *   where "event" is the current sweep line event.
  * - no edge e has zero length
  *
  * Invariants for the Mesh (the processed portion).
  * - the portion of the mesh left of the sweep line is a planar graph,
  *   ie. there is *some* way to embed it in the plane
  * - no processed edge has zero length
  * - no two processed vertices have identical coordinates
  * - each "inside" region is monotone, ie. can be broken into two chains
  *   of monotonically increasing vertices according to VertLeq(v1,v2)
  *   - a non-invariant: these chains may intersect (very slightly)
  *
  * Invariants for the Sweep.
  * - if none of the edges incident to the event vertex have an activeRegion
  *   (ie. none of these edges are in the edge dictionary), then the vertex
  *   has only right-going edges.
  * - if an edge is marked "fixUpperEdge" (it is a temporary edge introduced
  *   by ConnectRightVertex), then it is the only right-going edge from
  *   its associated vertex.  (This says that these edges exist only
  *   when it is necessary.)
  */

  /* When we merge two edges into one, we need to compute the combined
  * winding of the new edge.
  */
  Sweep.addWinding = function(eDst,eSrc) {
    eDst.winding += eSrc.winding;
    eDst.Sym.winding += eSrc.Sym.winding;
  }


  //static int EdgeLeq( TESStesselator *tess, ActiveRegion *reg1, ActiveRegion *reg2 )
  Sweep.edgeLeq = function( tess, reg1, reg2 ) {
    /*
    * Both edges must be directed from right to left (this is the canonical
    * direction for the upper edge of each region).
    *
    * The strategy is to evaluate a "t" value for each edge at the
    * current sweep line position, given by tess->event.  The calculations
    * are designed to be very stable, but of course they are not perfect.
    *
    * Special case: if both edge destinations are at the sweep event,
    * we sort the edges by slope (they would otherwise compare equally).
    */
    var ev = tess.event;
    var t1, t2;

    var e1 = reg1.eUp;
    var e2 = reg2.eUp;

    if( e1.Dst === ev ) {
      if( e2.Dst === ev ) {
        /* Two edges right of the sweep line which meet at the sweep event.
        * Sort them by slope.
        */
        if( Geom.vertLeq( e1.Org, e2.Org )) {
          return Geom.edgeSign( e2.Dst, e1.Org, e2.Org ) <= 0;
        }
        return Geom.edgeSign( e1.Dst, e2.Org, e1.Org ) >= 0;
      }
      return Geom.edgeSign( e2.Dst, ev, e2.Org ) <= 0;
    }
    if( e2.Dst === ev ) {
      return Geom.edgeSign( e1.Dst, ev, e1.Org ) >= 0;
    }

    /* General case - compute signed distance *from* e1, e2 to event */
    var t1 = Geom.edgeEval( e1.Dst, ev, e1.Org );
    var t2 = Geom.edgeEval( e2.Dst, ev, e2.Org );
    return (t1 >= t2);
  }


  //static void DeleteRegion( TESStesselator *tess, ActiveRegion *reg )
  Sweep.deleteRegion = function( tess, reg ) {
    if( reg.fixUpperEdge ) {
      /* It was created with zero winding number, so it better be
      * deleted with zero winding number (ie. it better not get merged
      * with a real edge).
      */
      assert( reg.eUp.winding === 0 );
    }
    reg.eUp.activeRegion = null;
    tess.dict.delete( reg.nodeUp );
  }

  //static int FixUpperEdge( TESStesselator *tess, ActiveRegion *reg, TESShalfEdge *newEdge )
  Sweep.fixUpperEdge = function( tess, reg, newEdge ) {
    /*
    * Replace an upper edge which needs fixing (see ConnectRightVertex).
    */
    assert( reg.fixUpperEdge );
    tess.mesh.delete( reg.eUp );
    reg.fixUpperEdge = false;
    reg.eUp = newEdge;
    newEdge.activeRegion = reg;
  }

  //static ActiveRegion *TopLeftRegion( TESStesselator *tess, ActiveRegion *reg )
  Sweep.topLeftRegion = function( tess, reg ) {
    var org = reg.eUp.Org;
    var e;

    /* Find the region above the uppermost edge with the same origin */
    do {
      reg = Sweep.regionAbove( reg );
    } while( reg.eUp.Org === org );

    /* If the edge above was a temporary edge introduced by ConnectRightVertex,
    * now is the time to fix it.
    */
    if( reg.fixUpperEdge ) {
      e = tess.mesh.connect( Sweep.regionBelow(reg).eUp.Sym, reg.eUp.Lnext );
      if (e === null) return null;
      Sweep.fixUpperEdge( tess, reg, e );
      reg = Sweep.regionAbove( reg );
    }
    return reg;
  }

  //static ActiveRegion *TopRightRegion( ActiveRegion *reg )
  Sweep.topRightRegion = function( reg )
  {
    var dst = reg.eUp.Dst;
    var reg = null;
    /* Find the region above the uppermost edge with the same destination */
    do {
      reg = Sweep.regionAbove( reg );
    } while( reg.eUp.Dst === dst );
    return reg;
  }

  //static ActiveRegion *AddRegionBelow( TESStesselator *tess, ActiveRegion *regAbove, TESShalfEdge *eNewUp )
  Sweep.addRegionBelow = function( tess, regAbove, eNewUp ) {
    /*
    * Add a new active region to the sweep line, *somewhere* below "regAbove"
    * (according to where the new edge belongs in the sweep-line dictionary).
    * The upper edge of the new region will be "eNewUp".
    * Winding number and "inside" flag are not updated.
    */
    var regNew = new ActiveRegion();
    regNew.eUp = eNewUp;
    regNew.nodeUp = tess.dict.insertBefore( regAbove.nodeUp, regNew );
  //  if (regNew->nodeUp == NULL) longjmp(tess->env,1);
    regNew.fixUpperEdge = false;
    regNew.sentinel = false;
    regNew.dirty = false;

    eNewUp.activeRegion = regNew;
    return regNew;
  }

  //static int IsWindingInside( TESStesselator *tess, int n )
  Sweep.isWindingInside = function( tess, n ) {
    switch( tess.windingRule ) {
      case Tess2.WINDING_ODD:
        return (n & 1) != 0;
      case Tess2.WINDING_NONZERO:
        return (n != 0);
      case Tess2.WINDING_POSITIVE:
        return (n > 0);
      case Tess2.WINDING_NEGATIVE:
        return (n < 0);
      case Tess2.WINDING_ABS_GEQ_TWO:
        return (n >= 2) || (n <= -2);
    }
    assert( false );
    return false;
  }

  //static void ComputeWinding( TESStesselator *tess, ActiveRegion *reg )
  Sweep.computeWinding = function( tess, reg ) {
    reg.windingNumber = Sweep.regionAbove(reg).windingNumber + reg.eUp.winding;
    reg.inside = Sweep.isWindingInside( tess, reg.windingNumber );
  }


  //static void FinishRegion( TESStesselator *tess, ActiveRegion *reg )
  Sweep.finishRegion = function( tess, reg ) {
    /*
    * Delete a region from the sweep line.  This happens when the upper
    * and lower chains of a region meet (at a vertex on the sweep line).
    * The "inside" flag is copied to the appropriate mesh face (we could
    * not do this before -- since the structure of the mesh is always
    * changing, this face may not have even existed until now).
    */
    var e = reg.eUp;
    var f = e.Lface;

    f.inside = reg.inside;
    f.anEdge = e;   /* optimization for tessMeshTessellateMonoRegion() */
    Sweep.deleteRegion( tess, reg );
  }


  //static TESShalfEdge *FinishLeftRegions( TESStesselator *tess, ActiveRegion *regFirst, ActiveRegion *regLast )
  Sweep.finishLeftRegions = function( tess, regFirst, regLast ) {
    /*
    * We are given a vertex with one or more left-going edges.  All affected
    * edges should be in the edge dictionary.  Starting at regFirst->eUp,
    * we walk down deleting all regions where both edges have the same
    * origin vOrg.  At the same time we copy the "inside" flag from the
    * active region to the face, since at this point each face will belong
    * to at most one region (this was not necessarily true until this point
    * in the sweep).  The walk stops at the region above regLast; if regLast
    * is NULL we walk as far as possible.  At the same time we relink the
    * mesh if necessary, so that the ordering of edges around vOrg is the
    * same as in the dictionary.
    */
    var e, ePrev;
    var reg = null;
    var regPrev = regFirst;
    var ePrev = regFirst.eUp;
    while( regPrev !== regLast ) {
      regPrev.fixUpperEdge = false; /* placement was OK */
      reg = Sweep.regionBelow( regPrev );
      e = reg.eUp;
      if( e.Org != ePrev.Org ) {
        if( ! reg.fixUpperEdge ) {
          /* Remove the last left-going edge.  Even though there are no further
          * edges in the dictionary with this origin, there may be further
          * such edges in the mesh (if we are adding left edges to a vertex
          * that has already been processed).  Thus it is important to call
          * FinishRegion rather than just DeleteRegion.
          */
          Sweep.finishRegion( tess, regPrev );
          break;
        }
        /* If the edge below was a temporary edge introduced by
        * ConnectRightVertex, now is the time to fix it.
        */
        e = tess.mesh.connect( ePrev.Lprev, e.Sym );
  //      if (e == NULL) longjmp(tess->env,1);
        Sweep.fixUpperEdge( tess, reg, e );
      }

      /* Relink edges so that ePrev->Onext == e */
      if( ePrev.Onext !== e ) {
        tess.mesh.splice( e.Oprev, e );
        tess.mesh.splice( ePrev, e );
      }
      Sweep.finishRegion( tess, regPrev );  /* may change reg->eUp */
      ePrev = reg.eUp;
      regPrev = reg;
    }
    return ePrev;
  }


  //static void AddRightEdges( TESStesselator *tess, ActiveRegion *regUp, TESShalfEdge *eFirst, TESShalfEdge *eLast, TESShalfEdge *eTopLeft, int cleanUp )
  Sweep.addRightEdges = function( tess, regUp, eFirst, eLast, eTopLeft, cleanUp ) {
    /*
    * Purpose: insert right-going edges into the edge dictionary, and update
    * winding numbers and mesh connectivity appropriately.  All right-going
    * edges share a common origin vOrg.  Edges are inserted CCW starting at
    * eFirst; the last edge inserted is eLast->Oprev.  If vOrg has any
    * left-going edges already processed, then eTopLeft must be the edge
    * such that an imaginary upward vertical segment from vOrg would be
    * contained between eTopLeft->Oprev and eTopLeft; otherwise eTopLeft
    * should be NULL.
    */
    var reg, regPrev;
    var e, ePrev;
    var firstTime = true;

    /* Insert the new right-going edges in the dictionary */
    e = eFirst;
    do {
      assert( Geom.vertLeq( e.Org, e.Dst ));
      Sweep.addRegionBelow( tess, regUp, e.Sym );
      e = e.Onext;
    } while ( e !== eLast );

    /* Walk *all* right-going edges from e->Org, in the dictionary order,
    * updating the winding numbers of each region, and re-linking the mesh
    * edges to match the dictionary ordering (if necessary).
    */
    if( eTopLeft === null ) {
      eTopLeft = Sweep.regionBelow( regUp ).eUp.Rprev;
    }
    regPrev = regUp;
    ePrev = eTopLeft;
    for( ;; ) {
      reg = Sweep.regionBelow( regPrev );
      e = reg.eUp.Sym;
      if( e.Org !== ePrev.Org ) break;

      if( e.Onext !== ePrev ) {
        /* Unlink e from its current position, and relink below ePrev */
        tess.mesh.splice( e.Oprev, e );
        tess.mesh.splice( ePrev.Oprev, e );
      }
      /* Compute the winding number and "inside" flag for the new regions */
      reg.windingNumber = regPrev.windingNumber - e.winding;
      reg.inside = Sweep.isWindingInside( tess, reg.windingNumber );

      /* Check for two outgoing edges with same slope -- process these
      * before any intersection tests (see example in tessComputeInterior).
      */
      regPrev.dirty = true;
      if( ! firstTime && Sweep.checkForRightSplice( tess, regPrev )) {
        Sweep.addWinding( e, ePrev );
        Sweep.deleteRegion( tess, regPrev );
        tess.mesh.delete( ePrev );
      }
      firstTime = false;
      regPrev = reg;
      ePrev = e;
    }
    regPrev.dirty = true;
    assert( regPrev.windingNumber - e.winding === reg.windingNumber );

    if( cleanUp ) {
      /* Check for intersections between newly adjacent edges. */
      Sweep.walkDirtyRegions( tess, regPrev );
    }
  }


  //static void SpliceMergeVertices( TESStesselator *tess, TESShalfEdge *e1, TESShalfEdge *e2 )
  Sweep.spliceMergeVertices = function( tess, e1, e2 ) {
    /*
    * Two vertices with idential coordinates are combined into one.
    * e1->Org is kept, while e2->Org is discarded.
    */
    tess.mesh.splice( e1, e2 );
  }

  //static void VertexWeights( TESSvertex *isect, TESSvertex *org, TESSvertex *dst, TESSreal *weights )
  Sweep.vertexWeights = function( isect, org, dst ) {
    /*
    * Find some weights which describe how the intersection vertex is
    * a linear combination of "org" and "dest".  Each of the two edges
    * which generated "isect" is allocated 50% of the weight; each edge
    * splits the weight between its org and dst according to the
    * relative distance to "isect".
    */
    var t1 = Geom.vertL1dist( org, isect );
    var t2 = Geom.vertL1dist( dst, isect );
    var w0 = 0.5 * t2 / (t1 + t2);
    var w1 = 0.5 * t1 / (t1 + t2);
    isect.coords[0] += w0*org.coords[0] + w1*dst.coords[0];
    isect.coords[1] += w0*org.coords[1] + w1*dst.coords[1];
    isect.coords[2] += w0*org.coords[2] + w1*dst.coords[2];
  }


  //static void GetIntersectData( TESStesselator *tess, TESSvertex *isect, TESSvertex *orgUp, TESSvertex *dstUp, TESSvertex *orgLo, TESSvertex *dstLo )
  Sweep.getIntersectData = function( tess, isect, orgUp, dstUp, orgLo, dstLo ) {
     /*
     * We've computed a new intersection point, now we need a "data" pointer
     * from the user so that we can refer to this new vertex in the
     * rendering callbacks.
     */
    isect.coords[0] = isect.coords[1] = isect.coords[2] = 0;
    isect.idx = -1;
    Sweep.vertexWeights( isect, orgUp, dstUp );
    Sweep.vertexWeights( isect, orgLo, dstLo );
  }

  //static int CheckForRightSplice( TESStesselator *tess, ActiveRegion *regUp )
  Sweep.checkForRightSplice = function( tess, regUp ) {
    /*
    * Check the upper and lower edge of "regUp", to make sure that the
    * eUp->Org is above eLo, or eLo->Org is below eUp (depending on which
    * origin is leftmost).
    *
    * The main purpose is to splice right-going edges with the same
    * dest vertex and nearly identical slopes (ie. we can't distinguish
    * the slopes numerically).  However the splicing can also help us
    * to recover from numerical errors.  For example, suppose at one
    * point we checked eUp and eLo, and decided that eUp->Org is barely
    * above eLo.  Then later, we split eLo into two edges (eg. from
    * a splice operation like this one).  This can change the result of
    * our test so that now eUp->Org is incident to eLo, or barely below it.
    * We must correct this condition to maintain the dictionary invariants.
    *
    * One possibility is to check these edges for intersection again
    * (ie. CheckForIntersect).  This is what we do if possible.  However
    * CheckForIntersect requires that tess->event lies between eUp and eLo,
    * so that it has something to fall back on when the intersection
    * calculation gives us an unusable answer.  So, for those cases where
    * we can't check for intersection, this routine fixes the problem
    * by just splicing the offending vertex into the other edge.
    * This is a guaranteed solution, no matter how degenerate things get.
    * Basically this is a combinatorial solution to a numerical problem.
    */
    var regLo = Sweep.regionBelow(regUp);
    var eUp = regUp.eUp;
    var eLo = regLo.eUp;

    if( Geom.vertLeq( eUp.Org, eLo.Org )) {
      if( Geom.edgeSign( eLo.Dst, eUp.Org, eLo.Org ) > 0 ) return false;

      /* eUp->Org appears to be below eLo */
      if( ! Geom.vertEq( eUp.Org, eLo.Org )) {
        /* Splice eUp->Org into eLo */
        tess.mesh.splitEdge( eLo.Sym );
        tess.mesh.splice( eUp, eLo.Oprev );
        regUp.dirty = regLo.dirty = true;

      } else if( eUp.Org !== eLo.Org ) {
        /* merge the two vertices, discarding eUp->Org */
        tess.pq.delete( eUp.Org.pqHandle );
        Sweep.spliceMergeVertices( tess, eLo.Oprev, eUp );
      }
    } else {
      if( Geom.edgeSign( eUp.Dst, eLo.Org, eUp.Org ) < 0 ) return false;

      /* eLo->Org appears to be above eUp, so splice eLo->Org into eUp */
      Sweep.regionAbove(regUp).dirty = regUp.dirty = true;
      tess.mesh.splitEdge( eUp.Sym );
      tess.mesh.splice( eLo.Oprev, eUp );
    }
    return true;
  }

  //static int CheckForLeftSplice( TESStesselator *tess, ActiveRegion *regUp )
  Sweep.checkForLeftSplice = function( tess, regUp ) {
    /*
    * Check the upper and lower edge of "regUp", to make sure that the
    * eUp->Dst is above eLo, or eLo->Dst is below eUp (depending on which
    * destination is rightmost).
    *
    * Theoretically, this should always be true.  However, splitting an edge
    * into two pieces can change the results of previous tests.  For example,
    * suppose at one point we checked eUp and eLo, and decided that eUp->Dst
    * is barely above eLo.  Then later, we split eLo into two edges (eg. from
    * a splice operation like this one).  This can change the result of
    * the test so that now eUp->Dst is incident to eLo, or barely below it.
    * We must correct this condition to maintain the dictionary invariants
    * (otherwise new edges might get inserted in the wrong place in the
    * dictionary, and bad stuff will happen).
    *
    * We fix the problem by just splicing the offending vertex into the
    * other edge.
    */
    var regLo = Sweep.regionBelow(regUp);
    var eUp = regUp.eUp;
    var eLo = regLo.eUp;
    var e;

    assert( ! Geom.vertEq( eUp.Dst, eLo.Dst ));

    if( Geom.vertLeq( eUp.Dst, eLo.Dst )) {
      if( Geom.edgeSign( eUp.Dst, eLo.Dst, eUp.Org ) < 0 ) return false;

      /* eLo->Dst is above eUp, so splice eLo->Dst into eUp */
      Sweep.regionAbove(regUp).dirty = regUp.dirty = true;
      e = tess.mesh.splitEdge( eUp );
      tess.mesh.splice( eLo.Sym, e );
      e.Lface.inside = regUp.inside;
    } else {
      if( Geom.edgeSign( eLo.Dst, eUp.Dst, eLo.Org ) > 0 ) return false;

      /* eUp->Dst is below eLo, so splice eUp->Dst into eLo */
      regUp.dirty = regLo.dirty = true;
      e = tess.mesh.splitEdge( eLo );
      tess.mesh.splice( eUp.Lnext, eLo.Sym );
      e.Rface.inside = regUp.inside;
    }
    return true;
  }


  //static int CheckForIntersect( TESStesselator *tess, ActiveRegion *regUp )
  Sweep.checkForIntersect = function( tess, regUp ) {
    /*
    * Check the upper and lower edges of the given region to see if
    * they intersect.  If so, create the intersection and add it
    * to the data structures.
    *
    * Returns TRUE if adding the new intersection resulted in a recursive
    * call to AddRightEdges(); in this case all "dirty" regions have been
    * checked for intersections, and possibly regUp has been deleted.
    */
    var regLo = Sweep.regionBelow(regUp);
    var eUp = regUp.eUp;
    var eLo = regLo.eUp;
    var orgUp = eUp.Org;
    var orgLo = eLo.Org;
    var dstUp = eUp.Dst;
    var dstLo = eLo.Dst;
    var tMinUp, tMaxLo;
    var isect = new TESSvertex, orgMin;
    var e;

    assert( ! Geom.vertEq( dstLo, dstUp ));
    assert( Geom.edgeSign( dstUp, tess.event, orgUp ) <= 0 );
    assert( Geom.edgeSign( dstLo, tess.event, orgLo ) >= 0 );
    assert( orgUp !== tess.event && orgLo !== tess.event );
    assert( ! regUp.fixUpperEdge && ! regLo.fixUpperEdge );

    if( orgUp === orgLo ) return false; /* right endpoints are the same */

    tMinUp = Math.min( orgUp.t, dstUp.t );
    tMaxLo = Math.max( orgLo.t, dstLo.t );
    if( tMinUp > tMaxLo ) return false; /* t ranges do not overlap */

    if( Geom.vertLeq( orgUp, orgLo )) {
      if( Geom.edgeSign( dstLo, orgUp, orgLo ) > 0 ) return false;
    } else {
      if( Geom.edgeSign( dstUp, orgLo, orgUp ) < 0 ) return false;
    }

    /* At this point the edges intersect, at least marginally */
    Sweep.debugEvent( tess );

    Geom.intersect( dstUp, orgUp, dstLo, orgLo, isect );
    /* The following properties are guaranteed: */
    assert( Math.min( orgUp.t, dstUp.t ) <= isect.t );
    assert( isect.t <= Math.max( orgLo.t, dstLo.t ));
    assert( Math.min( dstLo.s, dstUp.s ) <= isect.s );
    assert( isect.s <= Math.max( orgLo.s, orgUp.s ));

    if( Geom.vertLeq( isect, tess.event )) {
      /* The intersection point lies slightly to the left of the sweep line,
      * so move it until it''s slightly to the right of the sweep line.
      * (If we had perfect numerical precision, this would never happen
      * in the first place).  The easiest and safest thing to do is
      * replace the intersection by tess->event.
      */
      isect.s = tess.event.s;
      isect.t = tess.event.t;
    }
    /* Similarly, if the computed intersection lies to the right of the
    * rightmost origin (which should rarely happen), it can cause
    * unbelievable inefficiency on sufficiently degenerate inputs.
    * (If you have the test program, try running test54.d with the
    * "X zoom" option turned on).
    */
    orgMin = Geom.vertLeq( orgUp, orgLo ) ? orgUp : orgLo;
    if( Geom.vertLeq( orgMin, isect )) {
      isect.s = orgMin.s;
      isect.t = orgMin.t;
    }

    if( Geom.vertEq( isect, orgUp ) || Geom.vertEq( isect, orgLo )) {
      /* Easy case -- intersection at one of the right endpoints */
      Sweep.checkForRightSplice( tess, regUp );
      return false;
    }

    if(    (! Geom.vertEq( dstUp, tess.event )
      && Geom.edgeSign( dstUp, tess.event, isect ) >= 0)
      || (! Geom.vertEq( dstLo, tess.event )
      && Geom.edgeSign( dstLo, tess.event, isect ) <= 0 ))
    {
      /* Very unusual -- the new upper or lower edge would pass on the
      * wrong side of the sweep event, or through it.  This can happen
      * due to very small numerical errors in the intersection calculation.
      */
      if( dstLo === tess.event ) {
        /* Splice dstLo into eUp, and process the new region(s) */
        tess.mesh.splitEdge( eUp.Sym );
        tess.mesh.splice( eLo.Sym, eUp );
        regUp = Sweep.topLeftRegion( tess, regUp );
  //      if (regUp == NULL) longjmp(tess->env,1);
        eUp = Sweep.regionBelow(regUp).eUp;
        Sweep.finishLeftRegions( tess, Sweep.regionBelow(regUp), regLo );
        Sweep.addRightEdges( tess, regUp, eUp.Oprev, eUp, eUp, true );
        return TRUE;
      }
      if( dstUp === tess.event ) {
        /* Splice dstUp into eLo, and process the new region(s) */
        tess.mesh.splitEdge( eLo.Sym );
        tess.mesh.splice( eUp.Lnext, eLo.Oprev );
        regLo = regUp;
        regUp = Sweep.topRightRegion( regUp );
        e = Sweep.regionBelow(regUp).eUp.Rprev;
        regLo.eUp = eLo.Oprev;
        eLo = Sweep.finishLeftRegions( tess, regLo, null );
        Sweep.addRightEdges( tess, regUp, eLo.Onext, eUp.Rprev, e, true );
        return true;
      }
      /* Special case: called from ConnectRightVertex.  If either
      * edge passes on the wrong side of tess->event, split it
      * (and wait for ConnectRightVertex to splice it appropriately).
      */
      if( Geom.edgeSign( dstUp, tess.event, isect ) >= 0 ) {
        Sweep.regionAbove(regUp).dirty = regUp.dirty = true;
        tess.mesh.splitEdge( eUp.Sym );
        eUp.Org.s = tess.event.s;
        eUp.Org.t = tess.event.t;
      }
      if( Geom.edgeSign( dstLo, tess.event, isect ) <= 0 ) {
        regUp.dirty = regLo.dirty = true;
        tess.mesh.splitEdge( eLo.Sym );
        eLo.Org.s = tess.event.s;
        eLo.Org.t = tess.event.t;
      }
      /* leave the rest for ConnectRightVertex */
      return false;
    }

    /* General case -- split both edges, splice into new vertex.
    * When we do the splice operation, the order of the arguments is
    * arbitrary as far as correctness goes.  However, when the operation
    * creates a new face, the work done is proportional to the size of
    * the new face.  We expect the faces in the processed part of
    * the mesh (ie. eUp->Lface) to be smaller than the faces in the
    * unprocessed original contours (which will be eLo->Oprev->Lface).
    */
    tess.mesh.splitEdge( eUp.Sym );
    tess.mesh.splitEdge( eLo.Sym );
    tess.mesh.splice( eLo.Oprev, eUp );
    eUp.Org.s = isect.s;
    eUp.Org.t = isect.t;
    eUp.Org.pqHandle = tess.pq.insert( eUp.Org );
    Sweep.getIntersectData( tess, eUp.Org, orgUp, dstUp, orgLo, dstLo );
    Sweep.regionAbove(regUp).dirty = regUp.dirty = regLo.dirty = true;
    return false;
  }

  //static void WalkDirtyRegions( TESStesselator *tess, ActiveRegion *regUp )
  Sweep.walkDirtyRegions = function( tess, regUp ) {
    /*
    * When the upper or lower edge of any region changes, the region is
    * marked "dirty".  This routine walks through all the dirty regions
    * and makes sure that the dictionary invariants are satisfied
    * (see the comments at the beginning of this file).  Of course
    * new dirty regions can be created as we make changes to restore
    * the invariants.
    */
    var regLo = Sweep.regionBelow(regUp);
    var eUp, eLo;

    for( ;; ) {
      /* Find the lowest dirty region (we walk from the bottom up). */
      while( regLo.dirty ) {
        regUp = regLo;
        regLo = Sweep.regionBelow(regLo);
      }
      if( ! regUp.dirty ) {
        regLo = regUp;
        regUp = Sweep.regionAbove( regUp );
        if( regUp == null || ! regUp.dirty ) {
          /* We've walked all the dirty regions */
          return;
        }
      }
      regUp.dirty = false;
      eUp = regUp.eUp;
      eLo = regLo.eUp;

      if( eUp.Dst !== eLo.Dst ) {
        /* Check that the edge ordering is obeyed at the Dst vertices. */
        if( Sweep.checkForLeftSplice( tess, regUp )) {

          /* If the upper or lower edge was marked fixUpperEdge, then
          * we no longer need it (since these edges are needed only for
          * vertices which otherwise have no right-going edges).
          */
          if( regLo.fixUpperEdge ) {
            Sweep.deleteRegion( tess, regLo );
            tess.mesh.delete( eLo );
            regLo = Sweep.regionBelow( regUp );
            eLo = regLo.eUp;
          } else if( regUp.fixUpperEdge ) {
            Sweep.deleteRegion( tess, regUp );
            tess.mesh.delete( eUp );
            regUp = Sweep.regionAbove( regLo );
            eUp = regUp.eUp;
          }
        }
      }
      if( eUp.Org !== eLo.Org ) {
        if(    eUp.Dst !== eLo.Dst
          && ! regUp.fixUpperEdge && ! regLo.fixUpperEdge
          && (eUp.Dst === tess.event || eLo.Dst === tess.event) )
        {
          /* When all else fails in CheckForIntersect(), it uses tess->event
          * as the intersection location.  To make this possible, it requires
          * that tess->event lie between the upper and lower edges, and also
          * that neither of these is marked fixUpperEdge (since in the worst
          * case it might splice one of these edges into tess->event, and
          * violate the invariant that fixable edges are the only right-going
          * edge from their associated vertex).
          */
          if( Sweep.checkForIntersect( tess, regUp )) {
            /* WalkDirtyRegions() was called recursively; we're done */
            return;
          }
        } else {
          /* Even though we can't use CheckForIntersect(), the Org vertices
          * may violate the dictionary edge ordering.  Check and correct this.
          */
          Sweep.checkForRightSplice( tess, regUp );
        }
      }
      if( eUp.Org === eLo.Org && eUp.Dst === eLo.Dst ) {
        /* A degenerate loop consisting of only two edges -- delete it. */
        Sweep.addWinding( eLo, eUp );
        Sweep.deleteRegion( tess, regUp );
        tess.mesh.delete( eUp );
        regUp = Sweep.regionAbove( regLo );
      }
    }
  }


  //static void ConnectRightVertex( TESStesselator *tess, ActiveRegion *regUp, TESShalfEdge *eBottomLeft )
  Sweep.connectRightVertex = function( tess, regUp, eBottomLeft ) {
    /*
    * Purpose: connect a "right" vertex vEvent (one where all edges go left)
    * to the unprocessed portion of the mesh.  Since there are no right-going
    * edges, two regions (one above vEvent and one below) are being merged
    * into one.  "regUp" is the upper of these two regions.
    *
    * There are two reasons for doing this (adding a right-going edge):
    *  - if the two regions being merged are "inside", we must add an edge
    *    to keep them separated (the combined region would not be monotone).
    *  - in any case, we must leave some record of vEvent in the dictionary,
    *    so that we can merge vEvent with features that we have not seen yet.
    *    For example, maybe there is a vertical edge which passes just to
    *    the right of vEvent; we would like to splice vEvent into this edge.
    *
    * However, we don't want to connect vEvent to just any vertex.  We don''t
    * want the new edge to cross any other edges; otherwise we will create
    * intersection vertices even when the input data had no self-intersections.
    * (This is a bad thing; if the user's input data has no intersections,
    * we don't want to generate any false intersections ourselves.)
    *
    * Our eventual goal is to connect vEvent to the leftmost unprocessed
    * vertex of the combined region (the union of regUp and regLo).
    * But because of unseen vertices with all right-going edges, and also
    * new vertices which may be created by edge intersections, we don''t
    * know where that leftmost unprocessed vertex is.  In the meantime, we
    * connect vEvent to the closest vertex of either chain, and mark the region
    * as "fixUpperEdge".  This flag says to delete and reconnect this edge
    * to the next processed vertex on the boundary of the combined region.
    * Quite possibly the vertex we connected to will turn out to be the
    * closest one, in which case we won''t need to make any changes.
    */
    var eNew;
    var eTopLeft = eBottomLeft.Onext;
    var regLo = Sweep.regionBelow(regUp);
    var eUp = regUp.eUp;
    var eLo = regLo.eUp;
    var degenerate = false;

    if( eUp.Dst !== eLo.Dst ) {
      Sweep.checkForIntersect( tess, regUp );
    }

    /* Possible new degeneracies: upper or lower edge of regUp may pass
    * through vEvent, or may coincide with new intersection vertex
    */
    if( Geom.vertEq( eUp.Org, tess.event )) {
      tess.mesh.splice( eTopLeft.Oprev, eUp );
      regUp = Sweep.topLeftRegion( tess, regUp );
      eTopLeft = Sweep.regionBelow( regUp ).eUp;
      Sweep.finishLeftRegions( tess, Sweep.regionBelow(regUp), regLo );
      degenerate = true;
    }
    if( Geom.vertEq( eLo.Org, tess.event )) {
      tess.mesh.splice( eBottomLeft, eLo.Oprev );
      eBottomLeft = Sweep.finishLeftRegions( tess, regLo, null );
      degenerate = true;
    }
    if( degenerate ) {
      Sweep.addRightEdges( tess, regUp, eBottomLeft.Onext, eTopLeft, eTopLeft, true );
      return;
    }

    /* Non-degenerate situation -- need to add a temporary, fixable edge.
    * Connect to the closer of eLo->Org, eUp->Org.
    */
    if( Geom.vertLeq( eLo.Org, eUp.Org )) {
      eNew = eLo.Oprev;
    } else {
      eNew = eUp;
    }
    eNew = tess.mesh.connect( eBottomLeft.Lprev, eNew );

    /* Prevent cleanup, otherwise eNew might disappear before we've even
    * had a chance to mark it as a temporary edge.
    */
    Sweep.addRightEdges( tess, regUp, eNew, eNew.Onext, eNew.Onext, false );
    eNew.Sym.activeRegion.fixUpperEdge = true;
    Sweep.walkDirtyRegions( tess, regUp );
  }

  /* Because vertices at exactly the same location are merged together
  * before we process the sweep event, some degenerate cases can't occur.
  * However if someone eventually makes the modifications required to
  * merge features which are close together, the cases below marked
  * TOLERANCE_NONZERO will be useful.  They were debugged before the
  * code to merge identical vertices in the main loop was added.
  */
  //#define TOLERANCE_NONZERO FALSE

  //static void ConnectLeftDegenerate( TESStesselator *tess, ActiveRegion *regUp, TESSvertex *vEvent )
  Sweep.connectLeftDegenerate = function( tess, regUp, vEvent ) {
    /*
    * The event vertex lies exacty on an already-processed edge or vertex.
    * Adding the new vertex involves splicing it into the already-processed
    * part of the mesh.
    */
    var e, eTopLeft, eTopRight, eLast;
    var reg;

    e = regUp.eUp;
    if( Geom.vertEq( e.Org, vEvent )) {
      /* e->Org is an unprocessed vertex - just combine them, and wait
      * for e->Org to be pulled from the queue
      */
      assert( false /*TOLERANCE_NONZERO*/ );
      Sweep.spliceMergeVertices( tess, e, vEvent.anEdge );
      return;
    }

    if( ! Geom.vertEq( e.Dst, vEvent )) {
      /* General case -- splice vEvent into edge e which passes through it */
      tess.mesh.splitEdge( e.Sym );
      if( regUp.fixUpperEdge ) {
        /* This edge was fixable -- delete unused portion of original edge */
        tess.mesh.delete( e.Onext );
        regUp.fixUpperEdge = false;
      }
      tess.mesh.splice( vEvent.anEdge, e );
      Sweep.sweepEvent( tess, vEvent ); /* recurse */
      return;
    }

    /* vEvent coincides with e->Dst, which has already been processed.
    * Splice in the additional right-going edges.
    */
    assert( false /*TOLERANCE_NONZERO*/ );
    regUp = Sweep.topRightRegion( regUp );
    reg = Sweep.regionBelow( regUp );
    eTopRight = reg.eUp.Sym;
    eTopLeft = eLast = eTopRight.Onext;
    if( reg.fixUpperEdge ) {
      /* Here e->Dst has only a single fixable edge going right.
      * We can delete it since now we have some real right-going edges.
      */
      assert( eTopLeft !== eTopRight );   /* there are some left edges too */
      Sweep.deleteRegion( tess, reg );
      tess.mesh.delete( eTopRight );
      eTopRight = eTopLeft.Oprev;
    }
    tess.mesh.splice( vEvent.anEdge, eTopRight );
    if( ! Geom.edgeGoesLeft( eTopLeft )) {
      /* e->Dst had no left-going edges -- indicate this to AddRightEdges() */
      eTopLeft = null;
    }
    Sweep.addRightEdges( tess, regUp, eTopRight.Onext, eLast, eTopLeft, true );
  }


  //static void ConnectLeftVertex( TESStesselator *tess, TESSvertex *vEvent )
  Sweep.connectLeftVertex = function( tess, vEvent ) {
    /*
    * Purpose: connect a "left" vertex (one where both edges go right)
    * to the processed portion of the mesh.  Let R be the active region
    * containing vEvent, and let U and L be the upper and lower edge
    * chains of R.  There are two possibilities:
    *
    * - the normal case: split R into two regions, by connecting vEvent to
    *   the rightmost vertex of U or L lying to the left of the sweep line
    *
    * - the degenerate case: if vEvent is close enough to U or L, we
    *   merge vEvent into that edge chain.  The subcases are:
    * - merging with the rightmost vertex of U or L
    * - merging with the active edge of U or L
    * - merging with an already-processed portion of U or L
    */
    var regUp, regLo, reg;
    var eUp, eLo, eNew;
    var tmp = new ActiveRegion();

    /* assert( vEvent->anEdge->Onext->Onext == vEvent->anEdge ); */

    /* Get a pointer to the active region containing vEvent */
    tmp.eUp = vEvent.anEdge.Sym;
    /* __GL_DICTLISTKEY */ /* tessDictListSearch */
    regUp = tess.dict.search( tmp ).key;
    regLo = Sweep.regionBelow( regUp );
    if( !regLo ) {
      // This may happen if the input polygon is coplanar.
      return;
    }
    eUp = regUp.eUp;
    eLo = regLo.eUp;

    /* Try merging with U or L first */
    if( Geom.edgeSign( eUp.Dst, vEvent, eUp.Org ) === 0.0 ) {
      Sweep.connectLeftDegenerate( tess, regUp, vEvent );
      return;
    }

    /* Connect vEvent to rightmost processed vertex of either chain.
    * e->Dst is the vertex that we will connect to vEvent.
    */
    reg = Geom.vertLeq( eLo.Dst, eUp.Dst ) ? regUp : regLo;

    if( regUp.inside || reg.fixUpperEdge) {
      if( reg === regUp ) {
        eNew = tess.mesh.connect( vEvent.anEdge.Sym, eUp.Lnext );
      } else {
        var tempHalfEdge = tess.mesh.connect( eLo.Dnext, vEvent.anEdge);
        eNew = tempHalfEdge.Sym;
      }
      if( reg.fixUpperEdge ) {
        Sweep.fixUpperEdge( tess, reg, eNew );
      } else {
        Sweep.computeWinding( tess, Sweep.addRegionBelow( tess, regUp, eNew ));
      }
      Sweep.sweepEvent( tess, vEvent );
    } else {
      /* The new vertex is in a region which does not belong to the polygon.
      * We don''t need to connect this vertex to the rest of the mesh.
      */
      Sweep.addRightEdges( tess, regUp, vEvent.anEdge, vEvent.anEdge, null, true );
    }
  };


  //static void SweepEvent( TESStesselator *tess, TESSvertex *vEvent )
  Sweep.sweepEvent = function( tess, vEvent ) {
    /*
    * Does everything necessary when the sweep line crosses a vertex.
    * Updates the mesh and the edge dictionary.
    */

    tess.event = vEvent;    /* for access in EdgeLeq() */
    Sweep.debugEvent( tess );

    /* Check if this vertex is the right endpoint of an edge that is
    * already in the dictionary.  In this case we don't need to waste
    * time searching for the location to insert new edges.
    */
    var e = vEvent.anEdge;
    while( e.activeRegion === null ) {
      e = e.Onext;
      if( e == vEvent.anEdge ) {
        /* All edges go right -- not incident to any processed edges */
        Sweep.connectLeftVertex( tess, vEvent );
        return;
      }
    }

    /* Processing consists of two phases: first we "finish" all the
    * active regions where both the upper and lower edges terminate
    * at vEvent (ie. vEvent is closing off these regions).
    * We mark these faces "inside" or "outside" the polygon according
    * to their winding number, and delete the edges from the dictionary.
    * This takes care of all the left-going edges from vEvent.
    */
    var regUp = Sweep.topLeftRegion( tess, e.activeRegion );
    assert( regUp !== null );
  //  if (regUp == NULL) longjmp(tess->env,1);
    var reg = Sweep.regionBelow( regUp );
    var eTopLeft = reg.eUp;
    var eBottomLeft = Sweep.finishLeftRegions( tess, reg, null );

    /* Next we process all the right-going edges from vEvent.  This
    * involves adding the edges to the dictionary, and creating the
    * associated "active regions" which record information about the
    * regions between adjacent dictionary edges.
    */
    if( eBottomLeft.Onext === eTopLeft ) {
      /* No right-going edges -- add a temporary "fixable" edge */
      Sweep.connectRightVertex( tess, regUp, eBottomLeft );
    } else {
      Sweep.addRightEdges( tess, regUp, eBottomLeft.Onext, eTopLeft, eTopLeft, true );
    }
  };


  /* Make the sentinel coordinates big enough that they will never be
  * merged with real input features.
  */

  //static void AddSentinel( TESStesselator *tess, TESSreal smin, TESSreal smax, TESSreal t )
  Sweep.addSentinel = function( tess, smin, smax, t ) {
    /*
    * We add two sentinel edges above and below all other edges,
    * to avoid special cases at the top and bottom.
    */
    var reg = new ActiveRegion();
    var e = tess.mesh.makeEdge();
  //  if (e == NULL) longjmp(tess->env,1);

    e.Org.s = smax;
    e.Org.t = t;
    e.Dst.s = smin;
    e.Dst.t = t;
    tess.event = e.Dst;   /* initialize it */

    reg.eUp = e;
    reg.windingNumber = 0;
    reg.inside = false;
    reg.fixUpperEdge = false;
    reg.sentinel = true;
    reg.dirty = false;
    reg.nodeUp = tess.dict.insert( reg );
  //  if (reg->nodeUp == NULL) longjmp(tess->env,1);
  }


  //static void InitEdgeDict( TESStesselator *tess )
  Sweep.initEdgeDict = function( tess ) {
    /*
    * We maintain an ordering of edge intersections with the sweep line.
    * This order is maintained in a dynamic dictionary.
    */
    tess.dict = new Dict( tess, Sweep.edgeLeq );
  //  if (tess->dict == NULL) longjmp(tess->env,1);

    var w = (tess.bmax[0] - tess.bmin[0]);
    var h = (tess.bmax[1] - tess.bmin[1]);

    var smin = tess.bmin[0] - w;
    var smax = tess.bmax[0] + w;
    var tmin = tess.bmin[1] - h;
    var tmax = tess.bmax[1] + h;

    Sweep.addSentinel( tess, smin, smax, tmin );
    Sweep.addSentinel( tess, smin, smax, tmax );
  }


  Sweep.doneEdgeDict = function( tess )
  {
    var reg;
    var fixedEdges = 0;

    while( (reg = tess.dict.min().key) !== null ) {
      /*
      * At the end of all processing, the dictionary should contain
      * only the two sentinel edges, plus at most one "fixable" edge
      * created by ConnectRightVertex().
      */
      if( ! reg.sentinel ) {
        assert( reg.fixUpperEdge );
        assert( ++fixedEdges == 1 );
      }
      assert( reg.windingNumber == 0 );
      Sweep.deleteRegion( tess, reg );
      /*    tessMeshDelete( reg->eUp );*/
    }
  //  dictDeleteDict( &tess->alloc, tess->dict );
  }


  Sweep.removeDegenerateEdges = function( tess ) {
    /*
    * Remove zero-length edges, and contours with fewer than 3 vertices.
    */
    var e, eNext, eLnext;
    var eHead = tess.mesh.eHead;

    /*LINTED*/
    for( e = eHead.next; e !== eHead; e = eNext ) {
      eNext = e.next;
      eLnext = e.Lnext;

      if( Geom.vertEq( e.Org, e.Dst ) && e.Lnext.Lnext !== e ) {
        /* Zero-length edge, contour has at least 3 edges */
        Sweep.spliceMergeVertices( tess, eLnext, e ); /* deletes e->Org */
        tess.mesh.delete( e ); /* e is a self-loop */
        e = eLnext;
        eLnext = e.Lnext;
      }
      if( eLnext.Lnext === e ) {
        /* Degenerate contour (one or two edges) */
        if( eLnext !== e ) {
          if( eLnext === eNext || eLnext === eNext.Sym ) { eNext = eNext.next; }
          tess.mesh.delete( eLnext );
        }
        if( e === eNext || e === eNext.Sym ) { eNext = eNext.next; }
        tess.mesh.delete( e );
      }
    }
  }

  Sweep.initPriorityQ = function( tess ) {
    /*
    * Insert all vertices into the priority queue which determines the
    * order in which vertices cross the sweep line.
    */
    var pq;
    var v, vHead;
    var vertexCount = 0;

    vHead = tess.mesh.vHead;
    for( v = vHead.next; v !== vHead; v = v.next ) {
      vertexCount++;
    }
    /* Make sure there is enough space for sentinels. */
    vertexCount += 8; //MAX( 8, tess->alloc.extraVertices );

    pq = tess.pq = new PriorityQ( vertexCount, Geom.vertLeq );
  //  if (pq == NULL) return 0;

    vHead = tess.mesh.vHead;
    for( v = vHead.next; v !== vHead; v = v.next ) {
      v.pqHandle = pq.insert( v );
  //    if (v.pqHandle == INV_HANDLE)
  //      break;
    }

    if (v !== vHead) {
      return false;
    }

    pq.init();

    return true;
  }


  Sweep.donePriorityQ = function( tess ) {
    tess.pq = null;
  }


  Sweep.removeDegenerateFaces = function( tess, mesh ) {
    /*
    * Delete any degenerate faces with only two edges.  WalkDirtyRegions()
    * will catch almost all of these, but it won't catch degenerate faces
    * produced by splice operations on already-processed edges.
    * The two places this can happen are in FinishLeftRegions(), when
    * we splice in a "temporary" edge produced by ConnectRightVertex(),
    * and in CheckForLeftSplice(), where we splice already-processed
    * edges to ensure that our dictionary invariants are not violated
    * by numerical errors.
    *
    * In both these cases it is *very* dangerous to delete the offending
    * edge at the time, since one of the routines further up the stack
    * will sometimes be keeping a pointer to that edge.
    */
    var f, fNext;
    var e;

    /*LINTED*/
    for( f = mesh.fHead.next; f !== mesh.fHead; f = fNext ) {
      fNext = f.next;
      e = f.anEdge;
      assert( e.Lnext !== e );

      if( e.Lnext.Lnext === e ) {
        /* A face with only two edges */
        Sweep.addWinding( e.Onext, e );
        tess.mesh.delete( e );
      }
    }
    return true;
  }

  Sweep.computeInterior = function( tess ) {
    /*
    * tessComputeInterior( tess ) computes the planar arrangement specified
    * by the given contours, and further subdivides this arrangement
    * into regions.  Each region is marked "inside" if it belongs
    * to the polygon, according to the rule given by tess->windingRule.
    * Each interior region is guaranteed be monotone.
    */
    var v, vNext;

    /* Each vertex defines an event for our sweep line.  Start by inserting
    * all the vertices in a priority queue.  Events are processed in
    * lexicographic order, ie.
    *
    * e1 < e2  iff  e1.x < e2.x || (e1.x == e2.x && e1.y < e2.y)
    */
    Sweep.removeDegenerateEdges( tess );
    if ( !Sweep.initPriorityQ( tess ) ) return false; /* if error */
    Sweep.initEdgeDict( tess );

    while( (v = tess.pq.extractMin()) !== null ) {
      for( ;; ) {
        vNext = tess.pq.min();
        if( vNext === null || ! Geom.vertEq( vNext, v )) break;

        /* Merge together all vertices at exactly the same location.
        * This is more efficient than processing them one at a time,
        * simplifies the code (see ConnectLeftDegenerate), and is also
        * important for correct handling of certain degenerate cases.
        * For example, suppose there are two identical edges A and B
        * that belong to different contours (so without this code they would
        * be processed by separate sweep events).  Suppose another edge C
        * crosses A and B from above.  When A is processed, we split it
        * at its intersection point with C.  However this also splits C,
        * so when we insert B we may compute a slightly different
        * intersection point.  This might leave two edges with a small
        * gap between them.  This kind of error is especially obvious
        * when using boundary extraction (TESS_BOUNDARY_ONLY).
        */
        vNext = tess.pq.extractMin();
        Sweep.spliceMergeVertices( tess, v.anEdge, vNext.anEdge );
      }
      Sweep.sweepEvent( tess, v );
    }

    /* Set tess->event for debugging purposes */
    tess.event = tess.dict.min().key.eUp.Org;
    Sweep.debugEvent( tess );
    Sweep.doneEdgeDict( tess );
    Sweep.donePriorityQ( tess );

    if ( !Sweep.removeDegenerateFaces( tess, tess.mesh ) ) return false;
    tess.mesh.check();

    return true;
  }


  function Tesselator() {

    /*** state needed for collecting the input data ***/
    this.mesh = null;   /* stores the input contours, and eventually
              the tessellation itself */

    /*** state needed for projecting onto the sweep plane ***/

    this.normal = [0.0, 0.0, 0.0];  /* user-specified normal (if provided) */
    this.sUnit = [0.0, 0.0, 0.0]; /* unit vector in s-direction (debugging) */
    this.tUnit = [0.0, 0.0, 0.0]; /* unit vector in t-direction (debugging) */

    this.bmin = [0.0, 0.0];
    this.bmax = [0.0, 0.0];

    /*** state needed for the line sweep ***/
    this.windingRule = Tess2.WINDING_ODD; /* rule for determining polygon interior */

    this.dict = null;   /* edge dictionary for sweep line */
    this.pq = null;   /* priority queue of vertex events */
    this.event = null;    /* current sweep event being processed */

    this.vertexIndexCounter = 0;

    this.vertices = [];
    this.vertexIndices = [];
    this.vertexCount = 0;
    this.elements = [];
    this.elementCount = 0;
  };

  Tesselator.prototype = {

    dot_: function(u, v) {
      return (u[0]*v[0] + u[1]*v[1] + u[2]*v[2]);
    },

    normalize_: function( v ) {
      var len = v[0]*v[0] + v[1]*v[1] + v[2]*v[2];
      assert( len > 0.0 );
      len = Math.sqrt( len );
      v[0] /= len;
      v[1] /= len;
      v[2] /= len;
    },

    longAxis_: function( v ) {
      var i = 0;
      if( Math.abs(v[1]) > Math.abs(v[0]) ) { i = 1; }
      if( Math.abs(v[2]) > Math.abs(v[i]) ) { i = 2; }
      return i;
    },

    computeNormal_: function( norm )
    {
      var v, v1, v2;
      var c, tLen2, maxLen2;
      var maxVal = [0,0,0], minVal = [0,0,0], d1 = [0,0,0], d2 = [0,0,0], tNorm = [0,0,0];
      var maxVert = [null,null,null], minVert = [null,null,null];
      var vHead = this.mesh.vHead;
      var i;

      v = vHead.next;
      for( i = 0; i < 3; ++i ) {
        c = v.coords[i];
        minVal[i] = c;
        minVert[i] = v;
        maxVal[i] = c;
        maxVert[i] = v;
      }

      for( v = vHead.next; v !== vHead; v = v.next ) {
        for( i = 0; i < 3; ++i ) {
          c = v.coords[i];
          if( c < minVal[i] ) { minVal[i] = c; minVert[i] = v; }
          if( c > maxVal[i] ) { maxVal[i] = c; maxVert[i] = v; }
        }
      }

      /* Find two vertices separated by at least 1/sqrt(3) of the maximum
      * distance between any two vertices
      */
      i = 0;
      if( maxVal[1] - minVal[1] > maxVal[0] - minVal[0] ) { i = 1; }
      if( maxVal[2] - minVal[2] > maxVal[i] - minVal[i] ) { i = 2; }
      if( minVal[i] >= maxVal[i] ) {
        /* All vertices are the same -- normal doesn't matter */
        norm[0] = 0; norm[1] = 0; norm[2] = 1;
        return;
      }

      /* Look for a third vertex which forms the triangle with maximum area
      * (Length of normal == twice the triangle area)
      */
      maxLen2 = 0;
      v1 = minVert[i];
      v2 = maxVert[i];
      d1[0] = v1.coords[0] - v2.coords[0];
      d1[1] = v1.coords[1] - v2.coords[1];
      d1[2] = v1.coords[2] - v2.coords[2];
      for( v = vHead.next; v !== vHead; v = v.next ) {
        d2[0] = v.coords[0] - v2.coords[0];
        d2[1] = v.coords[1] - v2.coords[1];
        d2[2] = v.coords[2] - v2.coords[2];
        tNorm[0] = d1[1]*d2[2] - d1[2]*d2[1];
        tNorm[1] = d1[2]*d2[0] - d1[0]*d2[2];
        tNorm[2] = d1[0]*d2[1] - d1[1]*d2[0];
        tLen2 = tNorm[0]*tNorm[0] + tNorm[1]*tNorm[1] + tNorm[2]*tNorm[2];
        if( tLen2 > maxLen2 ) {
          maxLen2 = tLen2;
          norm[0] = tNorm[0];
          norm[1] = tNorm[1];
          norm[2] = tNorm[2];
        }
      }

      if( maxLen2 <= 0 ) {
        /* All points lie on a single line -- any decent normal will do */
        norm[0] = norm[1] = norm[2] = 0;
        norm[this.longAxis_(d1)] = 1;
      }
    },

    checkOrientation_: function() {
      var area;
      var f, fHead = this.mesh.fHead;
      var v, vHead = this.mesh.vHead;
      var e;

      /* When we compute the normal automatically, we choose the orientation
      * so that the the sum of the signed areas of all contours is non-negative.
      */
      area = 0;
      for( f = fHead.next; f !== fHead; f = f.next ) {
        e = f.anEdge;
        if( e.winding <= 0 ) continue;
        do {
          area += (e.Org.s - e.Dst.s) * (e.Org.t + e.Dst.t);
          e = e.Lnext;
        } while( e !== f.anEdge );
      }
      if( area < 0 ) {
        /* Reverse the orientation by flipping all the t-coordinates */
        for( v = vHead.next; v !== vHead; v = v.next ) {
          v.t = - v.t;
        }
        this.tUnit[0] = - this.tUnit[0];
        this.tUnit[1] = - this.tUnit[1];
        this.tUnit[2] = - this.tUnit[2];
      }
    },

  /*  #ifdef FOR_TRITE_TEST_PROGRAM
    #include <stdlib.h>
    extern int RandomSweep;
    #define S_UNIT_X  (RandomSweep ? (2*drand48()-1) : 1.0)
    #define S_UNIT_Y  (RandomSweep ? (2*drand48()-1) : 0.0)
    #else
    #if defined(SLANTED_SWEEP) */
    /* The "feature merging" is not intended to be complete.  There are
    * special cases where edges are nearly parallel to the sweep line
    * which are not implemented.  The algorithm should still behave
    * robustly (ie. produce a reasonable tesselation) in the presence
    * of such edges, however it may miss features which could have been
    * merged.  We could minimize this effect by choosing the sweep line
    * direction to be something unusual (ie. not parallel to one of the
    * coordinate axes).
    */
  /*  #define S_UNIT_X  (TESSreal)0.50941539564955385 // Pre-normalized
    #define S_UNIT_Y  (TESSreal)0.86052074622010633
    #else
    #define S_UNIT_X  (TESSreal)1.0
    #define S_UNIT_Y  (TESSreal)0.0
    #endif
    #endif*/

    /* Determine the polygon normal and project vertices onto the plane
    * of the polygon.
    */
    projectPolygon_: function() {
      var v, vHead = this.mesh.vHead;
      var norm = [0,0,0];
      var sUnit, tUnit;
      var i, first, computedNormal = false;

      norm[0] = this.normal[0];
      norm[1] = this.normal[1];
      norm[2] = this.normal[2];
      if( norm[0] === 0.0 && norm[1] === 0.0 && norm[2] === 0.0 ) {
        this.computeNormal_( norm );
        computedNormal = true;
      }
      sUnit = this.sUnit;
      tUnit = this.tUnit;
      i = this.longAxis_( norm );

  /*  #if defined(FOR_TRITE_TEST_PROGRAM) || defined(TRUE_PROJECT)
      // Choose the initial sUnit vector to be approximately perpendicular
      // to the normal.

      Normalize( norm );

      sUnit[i] = 0;
      sUnit[(i+1)%3] = S_UNIT_X;
      sUnit[(i+2)%3] = S_UNIT_Y;

      // Now make it exactly perpendicular
      w = Dot( sUnit, norm );
      sUnit[0] -= w * norm[0];
      sUnit[1] -= w * norm[1];
      sUnit[2] -= w * norm[2];
      Normalize( sUnit );

      // Choose tUnit so that (sUnit,tUnit,norm) form a right-handed frame
      tUnit[0] = norm[1]*sUnit[2] - norm[2]*sUnit[1];
      tUnit[1] = norm[2]*sUnit[0] - norm[0]*sUnit[2];
      tUnit[2] = norm[0]*sUnit[1] - norm[1]*sUnit[0];
      Normalize( tUnit );
    #else*/
      /* Project perpendicular to a coordinate axis -- better numerically */
      sUnit[i] = 0;
      sUnit[(i+1)%3] = 1.0;
      sUnit[(i+2)%3] = 0.0;

      tUnit[i] = 0;
      tUnit[(i+1)%3] = 0.0;
      tUnit[(i+2)%3] = (norm[i] > 0) ? 1.0 : -1.0;
  //  #endif

      /* Project the vertices onto the sweep plane */
      for( v = vHead.next; v !== vHead; v = v.next ) {
        v.s = this.dot_( v.coords, sUnit );
        v.t = this.dot_( v.coords, tUnit );
      }
      if( computedNormal ) {
        this.checkOrientation_();
      }

      /* Compute ST bounds. */
      first = true;
      for( v = vHead.next; v !== vHead; v = v.next ) {
        if (first) {
          this.bmin[0] = this.bmax[0] = v.s;
          this.bmin[1] = this.bmax[1] = v.t;
          first = false;
        } else {
          if (v.s < this.bmin[0]) this.bmin[0] = v.s;
          if (v.s > this.bmax[0]) this.bmax[0] = v.s;
          if (v.t < this.bmin[1]) this.bmin[1] = v.t;
          if (v.t > this.bmax[1]) this.bmax[1] = v.t;
        }
      }
    },

    addWinding_: function(eDst,eSrc) {
      eDst.winding += eSrc.winding;
      eDst.Sym.winding += eSrc.Sym.winding;
    },

    /* tessMeshTessellateMonoRegion( face ) tessellates a monotone region
    * (what else would it do??)  The region must consist of a single
    * loop of half-edges (see mesh.h) oriented CCW.  "Monotone" in this
    * case means that any vertical line intersects the interior of the
    * region in a single interval.
    *
    * Tessellation consists of adding interior edges (actually pairs of
    * half-edges), to split the region into non-overlapping triangles.
    *
    * The basic idea is explained in Preparata and Shamos (which I don''t
    * have handy right now), although their implementation is more
    * complicated than this one.  The are two edge chains, an upper chain
    * and a lower chain.  We process all vertices from both chains in order,
    * from right to left.
    *
    * The algorithm ensures that the following invariant holds after each
    * vertex is processed: the untessellated region consists of two
    * chains, where one chain (say the upper) is a single edge, and
    * the other chain is concave.  The left vertex of the single edge
    * is always to the left of all vertices in the concave chain.
    *
    * Each step consists of adding the rightmost unprocessed vertex to one
    * of the two chains, and forming a fan of triangles from the rightmost
    * of two chain endpoints.  Determining whether we can add each triangle
    * to the fan is a simple orientation test.  By making the fan as large
    * as possible, we restore the invariant (check it yourself).
    */
  //  int tessMeshTessellateMonoRegion( TESSmesh *mesh, TESSface *face )
    tessellateMonoRegion_: function( mesh, face ) {
      var up, lo;

      /* All edges are oriented CCW around the boundary of the region.
      * First, find the half-edge whose origin vertex is rightmost.
      * Since the sweep goes from left to right, face->anEdge should
      * be close to the edge we want.
      */
      up = face.anEdge;
      assert( up.Lnext !== up && up.Lnext.Lnext !== up );

      for( ; Geom.vertLeq( up.Dst, up.Org ); up = up.Lprev )
        ;
      for( ; Geom.vertLeq( up.Org, up.Dst ); up = up.Lnext )
        ;
      lo = up.Lprev;

      while( up.Lnext !== lo ) {
        if( Geom.vertLeq( up.Dst, lo.Org )) {
          /* up->Dst is on the left.  It is safe to form triangles from lo->Org.
          * The EdgeGoesLeft test guarantees progress even when some triangles
          * are CW, given that the upper and lower chains are truly monotone.
          */
          while( lo.Lnext !== up && (Geom.edgeGoesLeft( lo.Lnext )
            || Geom.edgeSign( lo.Org, lo.Dst, lo.Lnext.Dst ) <= 0.0 )) {
              var tempHalfEdge = mesh.connect( lo.Lnext, lo );
              //if (tempHalfEdge == NULL) return 0;
              lo = tempHalfEdge.Sym;
          }
          lo = lo.Lprev;
        } else {
          /* lo->Org is on the left.  We can make CCW triangles from up->Dst. */
          while( lo.Lnext != up && (Geom.edgeGoesRight( up.Lprev )
            || Geom.edgeSign( up.Dst, up.Org, up.Lprev.Org ) >= 0.0 )) {
              var tempHalfEdge = mesh.connect( up, up.Lprev );
              //if (tempHalfEdge == NULL) return 0;
              up = tempHalfEdge.Sym;
          }
          up = up.Lnext;
        }
      }

      /* Now lo->Org == up->Dst == the leftmost vertex.  The remaining region
      * can be tessellated in a fan from this leftmost vertex.
      */
      assert( lo.Lnext !== up );
      while( lo.Lnext.Lnext !== up ) {
        var tempHalfEdge = mesh.connect( lo.Lnext, lo );
        //if (tempHalfEdge == NULL) return 0;
        lo = tempHalfEdge.Sym;
      }

      return true;
    },


    /* tessMeshTessellateInterior( mesh ) tessellates each region of
    * the mesh which is marked "inside" the polygon.  Each such region
    * must be monotone.
    */
    //int tessMeshTessellateInterior( TESSmesh *mesh )
    tessellateInterior_: function( mesh ) {
      var f, next;

      /*LINTED*/
      for( f = mesh.fHead.next; f !== mesh.fHead; f = next ) {
        /* Make sure we don''t try to tessellate the new triangles. */
        next = f.next;
        if( f.inside ) {
          if ( !this.tessellateMonoRegion_( mesh, f ) ) return false;
        }
      }

      return true;
    },


    /* tessMeshDiscardExterior( mesh ) zaps (ie. sets to NULL) all faces
    * which are not marked "inside" the polygon.  Since further mesh operations
    * on NULL faces are not allowed, the main purpose is to clean up the
    * mesh so that exterior loops are not represented in the data structure.
    */
    //void tessMeshDiscardExterior( TESSmesh *mesh )
    discardExterior_: function( mesh ) {
      var f, next;

      /*LINTED*/
      for( f = mesh.fHead.next; f !== mesh.fHead; f = next ) {
        /* Since f will be destroyed, save its next pointer. */
        next = f.next;
        if( ! f.inside ) {
          mesh.zapFace( f );
        }
      }
    },

    /* tessMeshSetWindingNumber( mesh, value, keepOnlyBoundary ) resets the
    * winding numbers on all edges so that regions marked "inside" the
    * polygon have a winding number of "value", and regions outside
    * have a winding number of 0.
    *
    * If keepOnlyBoundary is TRUE, it also deletes all edges which do not
    * separate an interior region from an exterior one.
    */
  //  int tessMeshSetWindingNumber( TESSmesh *mesh, int value, int keepOnlyBoundary )
    setWindingNumber_: function( mesh, value, keepOnlyBoundary ) {
      var e, eNext;

      for( e = mesh.eHead.next; e !== mesh.eHead; e = eNext ) {
        eNext = e.next;
        if( e.Rface.inside !== e.Lface.inside ) {

          /* This is a boundary edge (one side is interior, one is exterior). */
          e.winding = (e.Lface.inside) ? value : -value;
        } else {

          /* Both regions are interior, or both are exterior. */
          if( ! keepOnlyBoundary ) {
            e.winding = 0;
          } else {
            mesh.delete( e );
          }
        }
      }
    },

    getNeighbourFace_: function(edge)
    {
      if (!edge.Rface)
        return -1;
      if (!edge.Rface.inside)
        return -1;
      return edge.Rface.n;
    },

    outputPolymesh_: function( mesh, elementType, polySize, vertexSize ) {
      var v;
      var f;
      var edge;
      var maxFaceCount = 0;
      var maxVertexCount = 0;
      var faceVerts, i;
      var elements = 0;
      var vert;

      // Assume that the input data is triangles now.
      // Try to merge as many polygons as possible
      if (polySize > 3)
      {
        mesh.mergeConvexFaces( polySize );
      }

      // Mark unused
      for ( v = mesh.vHead.next; v !== mesh.vHead; v = v.next )
        v.n = -1;

      // Create unique IDs for all vertices and faces.
      for ( f = mesh.fHead.next; f != mesh.fHead; f = f.next )
      {
        f.n = -1;
        if( !f.inside ) continue;

        edge = f.anEdge;
        faceVerts = 0;
        do
        {
          v = edge.Org;
          if ( v.n === -1 )
          {
            v.n = maxVertexCount;
            maxVertexCount++;
          }
          faceVerts++;
          edge = edge.Lnext;
        }
        while (edge !== f.anEdge);

        assert( faceVerts <= polySize );

        f.n = maxFaceCount;
        ++maxFaceCount;
      }

      this.elementCount = maxFaceCount;
      if (elementType == Tess2.CONNECTED_POLYGONS)
        maxFaceCount *= 2;
  /*    tess.elements = (TESSindex*)tess->alloc.memalloc( tess->alloc.userData,
                                sizeof(TESSindex) * maxFaceCount * polySize );
      if (!tess->elements)
      {
        tess->outOfMemory = 1;
        return;
      }*/
      this.elements = [];
      this.elements.length = maxFaceCount * polySize;

      this.vertexCount = maxVertexCount;
  /*    tess->vertices = (TESSreal*)tess->alloc.memalloc( tess->alloc.userData,
                               sizeof(TESSreal) * tess->vertexCount * vertexSize );
      if (!tess->vertices)
      {
        tess->outOfMemory = 1;
        return;
      }*/
      this.vertices = [];
      this.vertices.length = maxVertexCount * vertexSize;

  /*    tess->vertexIndices = (TESSindex*)tess->alloc.memalloc( tess->alloc.userData,
                                    sizeof(TESSindex) * tess->vertexCount );
      if (!tess->vertexIndices)
      {
        tess->outOfMemory = 1;
        return;
      }*/
      this.vertexIndices = [];
      this.vertexIndices.length = maxVertexCount;


      // Output vertices.
      for ( v = mesh.vHead.next; v !== mesh.vHead; v = v.next )
      {
        if ( v.n != -1 )
        {
          // Store coordinate
          var idx = v.n * vertexSize;
          this.vertices[idx+0] = v.coords[0];
          this.vertices[idx+1] = v.coords[1];
          if ( vertexSize > 2 )
            this.vertices[idx+2] = v.coords[2];
          // Store vertex index.
          this.vertexIndices[v.n] = v.idx;
        }
      }

      // Output indices.
      var nel = 0;
      for ( f = mesh.fHead.next; f !== mesh.fHead; f = f.next )
      {
        if ( !f.inside ) continue;

        // Store polygon
        edge = f.anEdge;
        faceVerts = 0;
        do
        {
          v = edge.Org;
          this.elements[nel++] = v.n;
          faceVerts++;
          edge = edge.Lnext;
        }
        while (edge !== f.anEdge);
        // Fill unused.
        for (i = faceVerts; i < polySize; ++i)
          this.elements[nel++] = -1;

        // Store polygon connectivity
        if ( elementType == Tess2.CONNECTED_POLYGONS )
        {
          edge = f.anEdge;
          do
          {
            this.elements[nel++] = this.getNeighbourFace_( edge );
            edge = edge.Lnext;
          }
          while (edge !== f.anEdge);
          // Fill unused.
          for (i = faceVerts; i < polySize; ++i)
            this.elements[nel++] = -1;
        }
      }
    },

  //  void OutputContours( TESStesselator *tess, TESSmesh *mesh, int vertexSize )
    outputContours_: function( mesh, vertexSize ) {
      var f;
      var edge;
      var start;
      var verts;
      var elements;
      var vertInds;
      var startVert = 0;
      var vertCount = 0;

      this.vertexCount = 0;
      this.elementCount = 0;

      for ( f = mesh.fHead.next; f !== mesh.fHead; f = f.next )
      {
        if ( !f.inside ) continue;

        start = edge = f.anEdge;
        do
        {
          this.vertexCount++;
          edge = edge.Lnext;
        }
        while ( edge !== start );

        this.elementCount++;
      }

  /*    tess->elements = (TESSindex*)tess->alloc.memalloc( tess->alloc.userData,
                                sizeof(TESSindex) * tess->elementCount * 2 );
      if (!tess->elements)
      {
        tess->outOfMemory = 1;
        return;
      }*/
      this.elements = [];
      this.elements.length = this.elementCount * 2;

  /*    tess->vertices = (TESSreal*)tess->alloc.memalloc( tess->alloc.userData,
                                sizeof(TESSreal) * tess->vertexCount * vertexSize );
      if (!tess->vertices)
      {
        tess->outOfMemory = 1;
        return;
      }*/
      this.vertices = [];
      this.vertices.length = this.vertexCount * vertexSize;

  /*    tess->vertexIndices = (TESSindex*)tess->alloc.memalloc( tess->alloc.userData,
                                    sizeof(TESSindex) * tess->vertexCount );
      if (!tess->vertexIndices)
      {
        tess->outOfMemory = 1;
        return;
      }*/
      this.vertexIndices = [];
      this.vertexIndices.length = this.vertexCount;

      var nv = 0;
      var nvi = 0;
      var nel = 0;
      startVert = 0;

      for ( f = mesh.fHead.next; f !== mesh.fHead; f = f.next )
      {
        if ( !f.inside ) continue;

        vertCount = 0;
        start = edge = f.anEdge;
        do
        {
          this.vertices[nv++] = edge.Org.coords[0];
          this.vertices[nv++] = edge.Org.coords[1];
          if ( vertexSize > 2 )
            this.vertices[nv++] = edge.Org.coords[2];
          this.vertexIndices[nvi++] = edge.Org.idx;
          vertCount++;
          edge = edge.Lnext;
        }
        while ( edge !== start );

        this.elements[nel++] = startVert;
        this.elements[nel++] = vertCount;

        startVert += vertCount;
      }
    },

    addContour: function( size, vertices )
    {
      var e;
      var i;

      if ( this.mesh === null )
          this.mesh = new TESSmesh();
  /*    if ( tess->mesh == NULL ) {
        tess->outOfMemory = 1;
        return;
      }*/

      if ( size < 2 )
        size = 2;
      if ( size > 3 )
        size = 3;

      e = null;

      for( i = 0; i < vertices.length; i += size )
      {
        if( e == null ) {
          /* Make a self-loop (one vertex, one edge). */
          e = this.mesh.makeEdge();
  /*        if ( e == NULL ) {
            tess->outOfMemory = 1;
            return;
          }*/
          this.mesh.splice( e, e.Sym );
        } else {
          /* Create a new vertex and edge which immediately follow e
          * in the ordering around the left face.
          */
          this.mesh.splitEdge( e );
          e = e.Lnext;
        }

        /* The new vertex is now e->Org. */
        e.Org.coords[0] = vertices[i+0];
        e.Org.coords[1] = vertices[i+1];
        if ( size > 2 )
          e.Org.coords[2] = vertices[i+2];
        else
          e.Org.coords[2] = 0.0;
        /* Store the insertion number so that the vertex can be later recognized. */
        e.Org.idx = this.vertexIndexCounter++;

        /* The winding of an edge says how the winding number changes as we
        * cross from the edge''s right face to its left face.  We add the
        * vertices in such an order that a CCW contour will add +1 to
        * the winding number of the region inside the contour.
        */
        e.winding = 1;
        e.Sym.winding = -1;
      }
    },

  //  int tessTesselate( TESStesselator *tess, int windingRule, int elementType, int polySize, int vertexSize, const TESSreal* normal )
    tesselate: function( windingRule, elementType, polySize, vertexSize, normal ) {
      this.vertices = [];
      this.elements = [];
      this.vertexIndices = [];

      this.vertexIndexCounter = 0;

      if (normal)
      {
        this.normal[0] = normal[0];
        this.normal[1] = normal[1];
        this.normal[2] = normal[2];
      }

      this.windingRule = windingRule;

      if (vertexSize < 2)
        vertexSize = 2;
      if (vertexSize > 3)
        vertexSize = 3;

  /*    if (setjmp(tess->env) != 0) {
        // come back here if out of memory
        return 0;
      }*/

      if (!this.mesh)
      {
        return false;
      }

      /* Determine the polygon normal and project vertices onto the plane
      * of the polygon.
      */
      this.projectPolygon_();

      /* tessComputeInterior( tess ) computes the planar arrangement specified
      * by the given contours, and further subdivides this arrangement
      * into regions.  Each region is marked "inside" if it belongs
      * to the polygon, according to the rule given by tess->windingRule.
      * Each interior region is guaranteed be monotone.
      */
      Sweep.computeInterior( this );

      var mesh = this.mesh;

      /* If the user wants only the boundary contours, we throw away all edges
      * except those which separate the interior from the exterior.
      * Otherwise we tessellate all the regions marked "inside".
      */
      if (elementType == Tess2.BOUNDARY_CONTOURS) {
        this.setWindingNumber_( mesh, 1, true );
      } else {
        this.tessellateInterior_( mesh );
      }
  //    if (rc == 0) longjmp(tess->env,1);  /* could've used a label */

      mesh.check();

      if (elementType == Tess2.BOUNDARY_CONTOURS) {
        this.outputContours_( mesh, vertexSize );     /* output contours */
      }
      else
      {
        this.outputPolymesh_( mesh, elementType, polySize, vertexSize );     /* output polygons */
      }

//      tess.mesh = null;

      return true;
    }
  };
},{}],146:[function(require,module,exports){
module.exports = extend

var hasOwnProperty = Object.prototype.hasOwnProperty;

function extend() {
    var target = {}

    for (var i = 0; i < arguments.length; i++) {
        var source = arguments[i]

        for (var key in source) {
            if (hasOwnProperty.call(source, key)) {
                target[key] = source[key]
            }
        }
    }

    return target
}

},{}],147:[function(require,module,exports){
module.exports = unindex

function unindex(positions, cells, out) {
  if (positions.positions && positions.cells) {
    out = cells
    cells = positions.cells
    positions = positions.positions
  }

  var dims = positions.length ? positions[0].length : 0
  var points = cells.length ? cells[0].length : 0

  out = out || new Float32Array(cells.length * points * dims)

  if (points === 3 && dims === 2) {
    for (var i = 0, n = 0, l = cells.length; i < l; i += 1) {
      var cell = cells[i]
      out[n++] = positions[cell[0]][0]
      out[n++] = positions[cell[0]][1]
      out[n++] = positions[cell[1]][0]
      out[n++] = positions[cell[1]][1]
      out[n++] = positions[cell[2]][0]
      out[n++] = positions[cell[2]][1]
    }
  } else
  if (points === 3 && dims === 3) {
    for (var i = 0, n = 0, l = cells.length; i < l; i += 1) {
      var cell = cells[i]
      out[n++] = positions[cell[0]][0]
      out[n++] = positions[cell[0]][1]
      out[n++] = positions[cell[0]][2]
      out[n++] = positions[cell[1]][0]
      out[n++] = positions[cell[1]][1]
      out[n++] = positions[cell[1]][2]
      out[n++] = positions[cell[2]][0]
      out[n++] = positions[cell[2]][1]
      out[n++] = positions[cell[2]][2]
    }
  } else {
    for (var i = 0, n = 0, l = cells.length; i < l; i += 1) {
      var cell = cells[i]
      for (var c = 0; c < cell.length; c++) {
        var C = cell[c]
        for (var k = 0; k < dims; k++) {
          out[n++] = positions[C][k]
        }
      }
    }
  }

  return out
}

},{}],148:[function(require,module,exports){
window.loadSvg = require('load-svg')
window.parsePath = require('extract-svg-path').parse
// window.svgMesh3d = require('svg-mesh-3d')
window.reindex= require('mesh-reindex');
window.unindex= require('unindex-mesh');
window.createGeom = require('three-simplicial-complex')(THREE)
window.meshLaplacian = require('mesh-laplacian')
window.csrMatrix = require('csr-matrix')
window.drawTriangles = require('draw-triangles-2d')
window.svgIntersections = require('svg-intersections');
window.polygonBoolean = require('2d-polygon-boolean');
// window.polybool = require('poly-bool');
window.inside = require('point-in-triangle');
window.ghClip = require('gh-clipping-algorithm');
// window.triangulate = require('delaunay-triangulate');
window.triangulateContours = require('triangulate-contours')
window.cdt2d = require('cdt2d');
window.parseSVG = require('parse-svg-path');
window.getContours = require('svg-path-contours');
window.getBounds = require('bound-points');
window.cleanPSLG = require('clean-pslg')
window.simplify = require('simplify-path')
window.random = require('random-float')
window.assign = require('object-assign')
window.normalize = require('normalize-path-scale')
window.areaPolygon = require('area-polygon');



},{"2d-polygon-boolean":5,"area-polygon":20,"bound-points":21,"cdt2d":22,"clean-pslg":40,"csr-matrix":86,"draw-triangles-2d":89,"extract-svg-path":90,"gh-clipping-algorithm":92,"load-svg":102,"mesh-laplacian":110,"mesh-reindex":114,"normalize-path-scale":115,"object-assign":117,"parse-svg-path":118,"point-in-triangle":119,"random-float":120,"simplify-path":122,"svg-intersections":124,"svg-path-contours":135,"three-simplicial-complex":141,"triangulate-contours":143,"unindex-mesh":147}]},{},[148]);

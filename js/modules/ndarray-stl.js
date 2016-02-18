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
;(function (exports) {
  'use strict'

  var i
  var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  var lookup = []
  for (i = 0; i < code.length; i++) {
    lookup[i] = code[i]
  }
  var revLookup = []

  for (i = 0; i < code.length; ++i) {
    revLookup[code.charCodeAt(i)] = i
  }
  revLookup['-'.charCodeAt(0)] = 62
  revLookup['_'.charCodeAt(0)] = 63

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

  function decode (elt) {
    var v = revLookup[elt.charCodeAt(0)]
    return v !== undefined ? v : -1
  }

  function b64ToByteArray (b64) {
    var i, j, l, tmp, placeHolders, arr

    if (b64.length % 4 > 0) {
      throw new Error('Invalid string. Length must be a multiple of 4')
    }

    // the number of equal signs (place holders)
    // if there are two placeholders, than the two characters before it
    // represent one byte
    // if there is only one, then the three characters before it represent 2 bytes
    // this is just a cheap hack to not do indexOf twice
    var len = b64.length
    placeHolders = b64.charAt(len - 2) === '=' ? 2 : b64.charAt(len - 1) === '=' ? 1 : 0

    // base64 is 4/3 + up to two characters of the original data
    arr = new Arr(b64.length * 3 / 4 - placeHolders)

    // if there are placeholders, only get up to the last complete 4 chars
    l = placeHolders > 0 ? b64.length - 4 : b64.length

    var L = 0

    function push (v) {
      arr[L++] = v
    }

    for (i = 0, j = 0; i < l; i += 4, j += 3) {
      tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
      push((tmp & 0xFF0000) >> 16)
      push((tmp & 0xFF00) >> 8)
      push(tmp & 0xFF)
    }

    if (placeHolders === 2) {
      tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
      push(tmp & 0xFF)
    } else if (placeHolders === 1) {
      tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
      push((tmp >> 8) & 0xFF)
      push(tmp & 0xFF)
    }

    return arr
  }

  function encode (num) {
    return lookup[num]
  }

  function tripletToBase64 (num) {
    return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
  }

  function encodeChunk (uint8, start, end) {
    var temp
    var output = []
    for (var i = start; i < end; i += 3) {
      temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
      output.push(tripletToBase64(temp))
    }
    return output.join('')
  }

  function uint8ToBase64 (uint8) {
    var i
    var extraBytes = uint8.length % 3 // if we have 1 byte left, pad 2 bytes
    var output = ''
    var parts = []
    var temp, length
    var maxChunkLength = 16383 // must be multiple of 3

    // go through the array every three bytes, we'll deal with trailing stuff later

    for (i = 0, length = uint8.length - extraBytes; i < length; i += maxChunkLength) {
      parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > length ? length : (i + maxChunkLength)))
    }

    // pad the end with zeros, but make sure to not forget the extra bytes
    switch (extraBytes) {
      case 1:
        temp = uint8[uint8.length - 1]
        output += encode(temp >> 2)
        output += encode((temp << 4) & 0x3F)
        output += '=='
        break
      case 2:
        temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
        output += encode(temp >> 10)
        output += encode((temp >> 4) & 0x3F)
        output += encode((temp << 2) & 0x3F)
        output += '='
        break
      default:
        break
    }

    parts.push(output)

    return parts.join('')
  }

  exports.toByteArray = b64ToByteArray
  exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

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
var isosurface = require('isosurface')
var aomesher = require('ao-mesher')
var normals = require('normals')

module.exports = function(voxels, smooth) {
  if (smooth) return smoothSTL(voxels)
  else return normalSTL(voxels)
}

window.normalSTL = normalSTL;
function normalSTL(voxels) {
  var m = aomesher(voxels)
  // ao-mesher sequence
  // 0  1  2   3   4   5   6    7
  // x, y, z, ao, nx, ny, nz, tid

  stl = []
  stl.push("solid pixel")
  for (var i = 0; i < m.length; i += 24) {
    var face = [
      [m[i + 0], m[i + 1], m[i + 2]],
      [m[i + 8], m[i + 9], m[i + 10]],
      [m[i + 16], m[i + 17], m[i + 18]]
    ]
    var normal = [128 - m[i + 4], 128 - m[i + 5], 128 - m[i + 6]]
    stl.push("facet normal "+stringifyVector( normal ))
    stl.push("outer loop")
    stl.push(stringifyVertex(face[0]))
    stl.push(stringifyVertex(face[1]))
    stl.push(stringifyVertex(face[2]))
    stl.push("endloop")
    stl.push("endfacet")
  }
  stl.push("endsolid")
  return stl.join('\n')
}

function smoothSTL(voxels) {
  var net = isosurface.surfaceNets(voxels.shape, function(x, y, z) {
    return voxels.get(x, y, z) - 1
  })

  net.normals = normals.faceNormals(net.cells, net.positions)

  stl = []
  stl.push("solid pixel")
  for (var i = 0; i < net.cells.length; ++i) {
    var cell = net.cells[i]
    var face = [
      net.positions[cell[0]],
      net.positions[cell[1]],
      net.positions[cell[2]]
    ]
    var normal = net.normals[i]
    stl.push("facet normal " + stringifyVector(normal))
    stl.push("outer loop")
    stl.push(stringifyVertex(face[2]))
    stl.push(stringifyVertex(face[1]))
    stl.push(stringifyVertex(face[0]))
    stl.push("endloop")
    stl.push("endfacet")
  }
  stl.push("endsolid")
  return stl.join('\n')
}

function stringifyVector(vec) {
  return "" + vec[0] + " " + -vec[2] + " " + vec[1]
}

function stringifyVertex(vec) {
  return "vertex " + stringifyVector(vec)
}

},{"ao-mesher":6,"isosurface":23,"normals":27}],6:[function(require,module,exports){
"use strict"

var ndarray = require("ndarray")
var compileCWise = require("cwise-compiler")
var compileMesher = require("greedy-mesher")
var pool = require("typedarray-pool")

var OPAQUE_BIT      = (1<<15)
var VOXEL_MASK      = (1<<16)-1
var AO_SHIFT        = 16
var AO_BITS         = 2
var AO_MASK         = (1<<AO_BITS)-1
var FLIP_BIT        = (1<<(AO_SHIFT+4*AO_BITS))
var TEXTURE_SHIFT   = 4
var TEXTURE_MASK    = (1<<TEXTURE_SHIFT)-1
var VERTEX_SIZE     = 8

//
// Vertex format:
//
//  x, y, z, ambient occlusion, normal_x, normal_y, normal_z, tex_id
//
//
// Voxel format:
//
//  * Max 16 bits per voxel
//  * Bit 15 is opacity flag  (set to 1 for voxel to be solid, otherwise rendererd transparent)
//  * Texture index is calculated by masking out lower order bits
//
//
// This stuff can be changed over time.  -Mik
//

//Retrieves the texture for a voxel
function voxelTexture(voxel, side, voxelSideTextureIDs) {
  return voxelSideTextureIDs ? voxelSideTextureIDs.get(voxel&0xff, side) : voxel&0xff
}

//Calculates ambient occlusion level for a vertex
function vertexAO(s1, s2, c) {
  if(s1 && s2) {
    return 1
  }
  return 3 - (s1 + s2 + c)
}

//Calculates the ambient occlusion bit mask for a facet
function facetAO(a00, a01, a02,
                 a10,      a12,
                 a20, a21, a22) {
  var s00 = (a00&OPAQUE_BIT) ? 1 : 0
    , s01 = (a01&OPAQUE_BIT) ? 1 : 0
    , s02 = (a02&OPAQUE_BIT) ? 1 : 0
    , s10 = (a10&OPAQUE_BIT) ? 1 : 0
    , s12 = (a12&OPAQUE_BIT) ? 1 : 0
    , s20 = (a20&OPAQUE_BIT) ? 1 : 0
    , s21 = (a21&OPAQUE_BIT) ? 1 : 0
    , s22 = (a22&OPAQUE_BIT) ? 1 : 0
  return (vertexAO(s10, s01, s00)<< AO_SHIFT) +
         (vertexAO(s01, s12, s02)<<(AO_SHIFT+AO_BITS)) +
         (vertexAO(s12, s21, s22)<<(AO_SHIFT+2*AO_BITS)) +
         (vertexAO(s21, s10, s20)<<(AO_SHIFT+3*AO_BITS))
}

//Generates a surface voxel, complete with ambient occlusion type
function generateSurfaceVoxel(
  v000, v001, v002,
  v010, v011, v012,
  v020, v021, v022,
  v100, v101, v102,
  v110, v111, v112,
  v120, v121, v122) {
  var t0 = !(v011 & OPAQUE_BIT)
    , t1 = !(v111 & OPAQUE_BIT)
  if(v111 && (!v011 || (t0 && !t1))) {
    return v111 | FLIP_BIT | facetAO(v000, v001, v002,
                                     v010,       v012,
                                     v020, v021, v022)
  } else if(v011 && (!v111 || (t1 && !t0))  ) {
    return v011 | facetAO(v100, v101, v102,
                          v110,       v112,
                          v120, v121, v122)
  }
}

//Compile surface stencil operator
var surfaceStencil = (function() {
  function arg(name, lv, rv, count) {
    return { name: name, lvalue: lv, rvalue: rv, count: count}
  }
  var empty_proc = { args:[], thisVars:[], localVars:[], body:"" }
  var cwise_args = [ "scalar", "array", "array", "array", "array" ]
  var cwise_arg_names = [
    arg("_func",false,true,3),
    arg("_o0",true,false,1),
    arg("_o1",true,false,1),
    arg("_o2",true,false,1) ]
  var cwise_body = [ ]
  for(var d=0; d<3; ++d) {
    var u = (d+1) % 3
    var v = (d+2) % 3
    var expr = []
    for(var dz=0; dz<2; ++dz)
    for(var dy=0; dy<=2; ++dy)
    for(var dx=0; dx<=2; ++dx) {
      var x = [dx,dy,dz]
      expr.push(["_a", x[v], x[u], x[d]].join(""))
    }
    cwise_body.push(["_o", d, "=_func(", expr.join(","), ")"].join(""))
  }
  var cwise_body_str = cwise_body.join("\n")
  for(var dx=-1; dx<=1; ++dx)
  for(var dy=-1; dy<=1; ++dy)
  for(var dz=-1; dz<=1; ++dz) {
    if(dx === 1 && dy === 1 && dz === 1) {
      continue
    }
    if(!(dx === -1 && dy === -1 && dz === -1)) {
      cwise_args.push({offset: [dx+1,dy+1,dz+1], array:3})
    }
    var carg_name = ["_a", dx+1, dy+1, dz+1].join("")
    cwise_arg_names.push(arg(carg_name, false, true, cwise_body_str.split(carg_name).length - 1))
  }
  return compileCWise({
    args: cwise_args,
    pre: empty_proc,
    body: {args: cwise_arg_names, body: cwise_body_str, thisVars: [], localVars: []},
    post: empty_proc,
    funcName: "calcAO"
  }).bind(undefined, generateSurfaceVoxel)
})();

function MeshBuilder() {
  this.buffer = pool.mallocUint8(1024)
  this.ptr = 0
  this.z = 0
  this.u = 0
  this.v = 0
  this.d = 0
}

var AO_TABLE = new Uint8Array([0, 153, 204, 255])

MeshBuilder.prototype.append = function(lo_x, lo_y, hi_x, hi_y, val) {
  var buffer = this.buffer
  var ptr = this.ptr>>>0
  var z = this.z|0
  var u = this.u|0
  var v = this.v|0
  var d = this.d|0

  //Grow buffer if we exceed capacity
  if(ptr + 6*VERTEX_SIZE > buffer.length) {
    var tmp = pool.mallocUint8(2*buffer.length);
    tmp.set(buffer)
    pool.freeUint8(buffer)
    buffer = tmp
    this.buffer = buffer
  }

  var flip = !!(val & FLIP_BIT)
  var side = d + (flip ? 3 : 0)

  var a00 = AO_TABLE[((val>>>AO_SHIFT)&AO_MASK)]
  var a10 = AO_TABLE[((val>>>(AO_SHIFT+AO_BITS))&AO_MASK)]
  var a11 = AO_TABLE[((val>>>(AO_SHIFT+2*AO_BITS))&AO_MASK)]
  var a01 = AO_TABLE[((val>>>(AO_SHIFT+3*AO_BITS))&AO_MASK)]

  var tex_id = voxelTexture(val&VOXEL_MASK, side, this.voxelSideTextureIDs)

  var nx=128, ny=128, nz=128
  var sign = flip ? 127 : 129
  if(d === 0) {
    nx = sign
  } else if(d === 1) {
    ny = sign
  } else if(d === 2) {
    nz = sign
  }

  var flipAO = a00 + a11 < a10 + a01

  if(a00 + a11 === a10 + a01) {
    flipAO = Math.max(a00,a11) < Math.max(a10,a01)
  }

  if(flipAO) {
    if(!flip) {
      buffer[ptr+u] = lo_x
      buffer[ptr+v] = lo_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a00
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8

      buffer[ptr+u] = lo_x
      buffer[ptr+v] = hi_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a01
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8

      buffer[ptr+u] = hi_x
      buffer[ptr+v] = lo_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a10
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8

      buffer[ptr+u] = hi_x
      buffer[ptr+v] = hi_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a11
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8

      buffer[ptr+u] = hi_x
      buffer[ptr+v] = lo_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a10
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8

      buffer[ptr+u] = lo_x
      buffer[ptr+v] = hi_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a01
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8

    } else {

      buffer[ptr+u] = lo_x
      buffer[ptr+v] = lo_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a00
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8

      buffer[ptr+u] = hi_x
      buffer[ptr+v] = lo_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a10
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8

      buffer[ptr+u] = lo_x
      buffer[ptr+v] = hi_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a01
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8

      buffer[ptr+u] = hi_x
      buffer[ptr+v] = hi_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a11
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8

      buffer[ptr+u] = lo_x
      buffer[ptr+v] = hi_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a01
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8

      buffer[ptr+u] = hi_x
      buffer[ptr+v] = lo_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a10
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8
    }
  } else {
    //Check if flipped
    if(flip) {
      buffer[ptr+u] = lo_x
      buffer[ptr+v] = hi_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a01
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8

      buffer[ptr+u] = lo_x
      buffer[ptr+v] = lo_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a00
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8

      buffer[ptr+u] = hi_x
      buffer[ptr+v] = hi_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a11
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8

      buffer[ptr+u] = hi_x
      buffer[ptr+v] = lo_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a10
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8

      buffer[ptr+u] = hi_x
      buffer[ptr+v] = hi_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a11
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8

      buffer[ptr+u] = lo_x
      buffer[ptr+v] = lo_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a00
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8
    } else {
      buffer[ptr+u] = lo_x
      buffer[ptr+v] = lo_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a00
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8

      buffer[ptr+u] = lo_x
      buffer[ptr+v] = hi_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a01
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8

      buffer[ptr+u] = hi_x
      buffer[ptr+v] = hi_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a11
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8

      buffer[ptr+u] = hi_x
      buffer[ptr+v] = hi_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a11
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8

      buffer[ptr+u] = hi_x
      buffer[ptr+v] = lo_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a10
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8

      buffer[ptr+u] = lo_x
      buffer[ptr+v] = lo_y
      buffer[ptr+d] = z
      buffer[ptr+3] = a00
      buffer[ptr+4] = nx
      buffer[ptr+5] = ny
      buffer[ptr+6] = nz
      buffer[ptr+7] = tex_id

      ptr += 8
    }
  }

  this.ptr = ptr
}

var meshBuilder = new MeshBuilder()

//Compile mesher
var meshSlice = compileMesher({
  order: [1, 0],
  append: MeshBuilder.prototype.append.bind(meshBuilder)
})

//Compute a mesh
function computeMesh(array, voxelSideTextureIDs) {
  var shp = array.shape.slice(0)
  var nx = (shp[0]-2)|0
  var ny = (shp[1]-2)|0
  var nz = (shp[2]-2)|0
  var sz = nx * ny * nz
  var scratch0 = pool.mallocInt32(sz)
  var scratch1 = pool.mallocInt32(sz)
  var scratch2 = pool.mallocInt32(sz)
  var rshp = [nx, ny, nz]
  var ao0 = ndarray(scratch0, rshp)
  var ao1 = ndarray(scratch1, rshp)
  var ao2 = ndarray(scratch2, rshp)

  //Calculate ao fields
  surfaceStencil(ao0, ao1, ao2, array)

  //Build mesh slices
  meshBuilder.ptr = 0
  meshBuilder.voxelSideTextureIDs = voxelSideTextureIDs

  var buffers = [ao0, ao1, ao2]
  for(var d=0; d<3; ++d) {
    var u = (d+1)%3
    var v = (d+2)%3

    //Create slice
    var st = buffers[d].transpose(d, u, v)
    var slice = st.pick(0)
    var n = rshp[d]|0

    meshBuilder.d = d
    meshBuilder.u = v
    meshBuilder.v = u

    //Generate slices
    for(var i=0; i<n; ++i) {
      meshBuilder.z = i
      meshSlice(slice)
      slice.offset += st.stride[0]
    }
  }

  //Release buffers
  pool.freeInt32(scratch0)
  pool.freeInt32(scratch1)
  pool.freeInt32(scratch2)

  //Release uint8 array if no vertices were allocated
  if(meshBuilder.ptr === 0) {
    return null
  }

  //Slice out buffer
  var rbuffer = meshBuilder.buffer
  var rptr = meshBuilder.ptr
  meshBuilder.buffer = pool.mallocUint8(1024)
  meshBuilder.ptr = 0
  return rbuffer.subarray(0, rptr)
}

module.exports = computeMesh

},{"cwise-compiler":7,"greedy-mesher":11,"ndarray":17,"typedarray-pool":22}],7:[function(require,module,exports){
"use strict"

var createThunk = require("./lib/thunk.js")

function Procedure() {
  this.argTypes = []
  this.shimArgs = []
  this.arrayArgs = []
  this.scalarArgs = []
  this.offsetArgs = []
  this.offsetArgIndex = []
  this.indexArgs = []
  this.shapeArgs = []
  this.funcName = ""
  this.pre = null
  this.body = null
  this.post = null
  this.debug = false
}

function compileCwise(user_args) {
  //Create procedure
  var proc = new Procedure()

  //Parse blocks
  proc.pre    = user_args.pre
  proc.body   = user_args.body
  proc.post   = user_args.post

  //Parse arguments
  var proc_args = user_args.args.slice(0)
  proc.argTypes = proc_args.slice(0)
  for(var i=0; i<proc_args.length; ++i) {
    var arg_type = proc_args[i]
    if(arg_type === "array") {
      proc.arrayArgs.push(i)
      proc.shimArgs.push("array" + i)
      if(i < proc.pre.args.length && proc.pre.args[i].count>0) {
        throw new Error("cwise: pre() block may not reference array args")
      }
      if(i < proc.post.args.length && proc.post.args[i].count>0) {
        throw new Error("cwise: post() block may not reference array args")
      }
    } else if(arg_type === "scalar") {
      proc.scalarArgs.push(i)
      proc.shimArgs.push("scalar" + i)
    } else if(arg_type === "index") {
      proc.indexArgs.push(i)
      if(i < proc.pre.args.length && proc.pre.args[i].count > 0) {
        throw new Error("cwise: pre() block may not reference array index")
      }
      if(i < proc.body.args.length && proc.body.args[i].lvalue) {
        throw new Error("cwise: body() block may not write to array index")
      }
      if(i < proc.post.args.length && proc.post.args[i].count > 0) {
        throw new Error("cwise: post() block may not reference array index")
      }
    } else if(arg_type === "shape") {
      proc.shapeArgs.push(i)
      if(i < proc.pre.args.length && proc.pre.args[i].lvalue) {
        throw new Error("cwise: pre() block may not write to array shape")
      }
      if(i < proc.body.args.length && proc.body.args[i].lvalue) {
        throw new Error("cwise: body() block may not write to array shape")
      }
      if(i < proc.post.args.length && proc.post.args[i].lvalue) {
        throw new Error("cwise: post() block may not write to array shape")
      }
    } else if(typeof arg_type === "object" && arg_type.offset) {
      proc.argTypes[i] = "offset"
      proc.offsetArgs.push({ array: arg_type.array, offset:arg_type.offset })
      proc.offsetArgIndex.push(i)
    } else {
      throw new Error("cwise: Unknown argument type " + proc_args[i])
    }
  }

  //Make sure at least one array argument was specified
  if(proc.arrayArgs.length <= 0) {
    throw new Error("cwise: No array arguments specified")
  }

  //Make sure arguments are correct
  if(proc.pre.args.length > proc_args.length) {
    throw new Error("cwise: Too many arguments in pre() block")
  }
  if(proc.body.args.length > proc_args.length) {
    throw new Error("cwise: Too many arguments in body() block")
  }
  if(proc.post.args.length > proc_args.length) {
    throw new Error("cwise: Too many arguments in post() block")
  }

  //Check debug flag
  proc.debug = !!user_args.printCode || !!user_args.debug

  //Retrieve name
  proc.funcName = user_args.funcName || "cwise"

  //Read in block size
  proc.blockSize = user_args.blockSize || 64

  return createThunk(proc)
}

module.exports = compileCwise

},{"./lib/thunk.js":9}],8:[function(require,module,exports){
"use strict"

var uniq = require("uniq")

function innerFill(order, proc, body) {
  var dimension = order.length
    , nargs = proc.arrayArgs.length
    , has_index = proc.indexArgs.length>0
    , code = []
    , vars = []
    , idx=0, pidx=0, i, j
  for(i=0; i<dimension; ++i) {
    vars.push(["i",i,"=0"].join(""))
  }
  //Compute scan deltas
  for(j=0; j<nargs; ++j) {
    for(i=0; i<dimension; ++i) {
      pidx = idx
      idx = order[i]
      if(i === 0) {
        vars.push(["d",j,"s",i,"=t",j,"[",idx,"]"].join(""))
      } else {
        vars.push(["d",j,"s",i,"=(t",j,"[",idx,"]-s",pidx,"*t",j,"[",pidx,"])"].join(""))
      }
    }
  }
  code.push("var " + vars.join(","))
  //Scan loop
  for(i=dimension-1; i>=0; --i) {
    idx = order[i]
    code.push(["for(i",i,"=0;i",i,"<s",idx,";++i",i,"){"].join(""))
  }
  //Push body of inner loop
  code.push(body)
  //Advance scan pointers
  for(i=0; i<dimension; ++i) {
    pidx = idx
    idx = order[i]
    for(j=0; j<nargs; ++j) {
      code.push(["p",j,"+=d",j,"s",i].join(""))
    }
    if(has_index) {
      if(i > 0) {
        code.push(["index[",pidx,"]-=s",pidx].join(""))
      }
      code.push(["++index[",idx,"]"].join(""))
    }
    code.push("}")
  }
  return code.join("\n")
}

function outerFill(matched, order, proc, body) {
  var dimension = order.length
    , nargs = proc.arrayArgs.length
    , blockSize = proc.blockSize
    , has_index = proc.indexArgs.length > 0
    , code = []
  for(var i=0; i<nargs; ++i) {
    code.push(["var offset",i,"=p",i].join(""))
  }
  //Generate matched loops
  for(var i=matched; i<dimension; ++i) {
    code.push(["for(var j"+i+"=SS[", order[i], "]|0;j", i, ">0;){"].join(""))
    code.push(["if(j",i,"<",blockSize,"){"].join(""))
    code.push(["s",order[i],"=j",i].join(""))
    code.push(["j",i,"=0"].join(""))
    code.push(["}else{s",order[i],"=",blockSize].join(""))
    code.push(["j",i,"-=",blockSize,"}"].join(""))
    if(has_index) {
      code.push(["index[",order[i],"]=j",i].join(""))
    }
  }
  for(var i=0; i<nargs; ++i) {
    var indexStr = ["offset"+i]
    for(var j=matched; j<dimension; ++j) {
      indexStr.push(["j",j,"*t",i,"[",order[j],"]"].join(""))
    }
    code.push(["p",i,"=(",indexStr.join("+"),")"].join(""))
  }
  code.push(innerFill(order, proc, body))
  for(var i=matched; i<dimension; ++i) {
    code.push("}")
  }
  return code.join("\n")
}

//Count the number of compatible inner orders
function countMatches(orders) {
  var matched = 0, dimension = orders[0].length
  while(matched < dimension) {
    for(var j=1; j<orders.length; ++j) {
      if(orders[j][matched] !== orders[0][matched]) {
        return matched
      }
    }
    ++matched
  }
  return matched
}

//Processes a block according to the given data types
function processBlock(block, proc, dtypes) {
  var code = block.body
  var pre = []
  var post = []
  for(var i=0; i<block.args.length; ++i) {
    var carg = block.args[i]
    if(carg.count <= 0) {
      continue
    }
    var re = new RegExp(carg.name, "g")
    var ptrStr = ""
    var arrNum = proc.arrayArgs.indexOf(i)
    switch(proc.argTypes[i]) {
      case "offset":
        var offArgIndex = proc.offsetArgIndex.indexOf(i)
        var offArg = proc.offsetArgs[offArgIndex]
        arrNum = offArg.array
        ptrStr = "+q" + offArgIndex
      case "array":
        ptrStr = "p" + arrNum + ptrStr
        var localStr = "l" + i
        var arrStr = "a" + arrNum
        if(carg.count === 1) {
          if(dtypes[arrNum] === "generic") {
            if(carg.lvalue) {
              pre.push(["var ", localStr, "=", arrStr, ".get(", ptrStr, ")"].join(""))
              code = code.replace(re, localStr)
              post.push([arrStr, ".set(", ptrStr, ",", localStr,")"].join(""))
            } else {
              code = code.replace(re, [arrStr, ".get(", ptrStr, ")"].join(""))
            }
          } else {
            code = code.replace(re, [arrStr, "[", ptrStr, "]"].join(""))
          }
        } else if(dtypes[arrNum] === "generic") {
          pre.push(["var ", localStr, "=", arrStr, ".get(", ptrStr, ")"].join(""))
          code = code.replace(re, localStr)
          if(carg.lvalue) {
            post.push([arrStr, ".set(", ptrStr, ",", localStr,")"].join(""))
          }
        } else {
          pre.push(["var ", localStr, "=", arrStr, "[", ptrStr, "]"].join(""))
          code = code.replace(re, localStr)
          if(carg.lvalue) {
            post.push([arrStr, "[", ptrStr, "]=", localStr].join(""))
          }
        }
      break
      case "scalar":
        code = code.replace(re, "Y" + proc.scalarArgs.indexOf(i))
      break
      case "index":
        code = code.replace(re, "index")
      break
      case "shape":
        code = code.replace(re, "shape")
      break
    }
  }
  return [pre.join("\n"), code, post.join("\n")].join("\n").trim()
}

function typeSummary(dtypes) {
  var summary = new Array(dtypes.length)
  var allEqual = true
  for(var i=0; i<dtypes.length; ++i) {
    var t = dtypes[i]
    var digits = t.match(/\d+/)
    if(!digits) {
      digits = ""
    } else {
      digits = digits[0]
    }
    if(t.charAt(0) === 0) {
      summary[i] = "u" + t.charAt(1) + digits
    } else {
      summary[i] = t.charAt(0) + digits
    }
    if(i > 0) {
      allEqual = allEqual && summary[i] === summary[i-1]
    }
  }
  if(allEqual) {
    return summary[0]
  }
  return summary.join("")
}

//Generates a cwise operator
function generateCWiseOp(proc, typesig) {

  //Compute dimension
  var dimension = typesig[1].length|0
  var orders = new Array(proc.arrayArgs.length)
  var dtypes = new Array(proc.arrayArgs.length)

  //First create arguments for procedure
  var arglist = ["SS"]
  var code = ["'use strict'"]
  var vars = []

  for(var j=0; j<dimension; ++j) {
    vars.push(["s", j, "=SS[", j, "]"].join(""))
  }
  for(var i=0; i<proc.arrayArgs.length; ++i) {
    arglist.push("a"+i)
    arglist.push("t"+i)
    arglist.push("p"+i)
    dtypes[i] = typesig[2*i]
    orders[i] = typesig[2*i+1]
  }
  for(var i=0; i<proc.scalarArgs.length; ++i) {
    arglist.push("Y" + i)
  }
  if(proc.shapeArgs.length > 0) {
    vars.push("shape=SS.slice(0)")
  }
  if(proc.indexArgs.length > 0) {
    var zeros = new Array(dimension)
    for(var i=0; i<dimension; ++i) {
      zeros[i] = "0"
    }
    vars.push(["index=[", zeros.join(","), "]"].join(""))
  }
  for(var i=0; i<proc.offsetArgs.length; ++i) {
    var off_arg = proc.offsetArgs[i]
    var init_string = []
    for(var j=0; j<off_arg.offset.length; ++j) {
      if(off_arg.offset[j] === 0) {
        continue
      } else if(off_arg.offset[j] === 1) {
        init_string.push(["t", off_arg.array, "[", j, "]"].join(""))
      } else {
        init_string.push([off_arg.offset[j], "*t", off_arg.array, "[", j, "]"].join(""))
      }
    }
    if(init_string.length === 0) {
      vars.push("q" + i + "=0")
    } else {
      vars.push(["q", i, "=(", init_string.join("+"),")|0"].join(""))
    }
  }

  //Prepare this variables
  var thisVars = uniq([].concat(proc.pre.thisVars)
                      .concat(proc.body.thisVars)
                      .concat(proc.post.thisVars))
  vars = vars.concat(thisVars)
  code.push("var " + vars.join(","))
  for(var i=0; i<proc.arrayArgs.length; ++i) {
    code.push("p"+i+"|=0")
  }

  //Inline prelude
  if(proc.pre.body.length > 3) {
    code.push(processBlock(proc.pre, proc, dtypes))
  }

  //Process body
  var body = processBlock(proc.body, proc, dtypes)
  var matched = countMatches(orders)
  if(matched < dimension) {
    code.push(outerFill(matched, orders[0], proc, body))
  } else {
    code.push(innerFill(orders[0], proc, body))
  }

  //Inline epilog
  if(proc.post.body.length > 3) {
    code.push(processBlock(proc.post, proc, dtypes))
  }

  if(proc.debug) {
    console.log("Generated cwise routine for ", typesig, ":\n\n", code.join("\n"))
  }

  var loopName = [(proc.funcName||"unnamed"), "_cwise_loop_", orders[0].join("s"),"m",matched,typeSummary(dtypes)].join("")
  var f = new Function(["function ",loopName,"(", arglist.join(","),"){", code.join("\n"),"} return ", loopName].join(""))
  return f()
}
module.exports = generateCWiseOp
},{"uniq":10}],9:[function(require,module,exports){
"use strict"

var compile = require("./compile.js")

function createThunk(proc) {
  var code = ["'use strict'", "var CACHED={}"]
  var vars = []
  var thunkName = proc.funcName + "_cwise_thunk"

  //Build thunk
  code.push(["return function ", thunkName, "(", proc.shimArgs.join(","), "){"].join(""))
  var typesig = []
  var string_typesig = []
  var proc_args = [["array",proc.arrayArgs[0],".shape"].join("")]
  for(var i=0; i<proc.arrayArgs.length; ++i) {
    var j = proc.arrayArgs[i]
    vars.push(["t", j, "=array", j, ".dtype,",
               "r", j, "=array", j, ".order"].join(""))
    typesig.push("t" + j)
    typesig.push("r" + j)
    string_typesig.push("t"+j)
    string_typesig.push("r"+j+".join()")
    proc_args.push("array" + j + ".data")
    proc_args.push("array" + j + ".stride")
    proc_args.push("array" + j + ".offset|0")
  }
  for(var i=0; i<proc.scalarArgs.length; ++i) {
    proc_args.push("scalar" + proc.scalarArgs[i])
  }
  vars.push(["type=[", string_typesig.join(","), "].join()"].join(""))
  vars.push("proc=CACHED[type]")
  code.push("var " + vars.join(","))

  code.push(["if(!proc){",
             "CACHED[type]=proc=compile([", typesig.join(","), "])}",
             "return proc(", proc_args.join(","), ")}"].join(""))

  if(proc.debug) {
    console.log("Generated thunk:", code.join("\n"))
  }

  //Compile thunk
  var thunk = new Function("compile", code.join("\n"))
  return thunk(compile.bind(undefined, proc))
}

module.exports = createThunk

},{"./compile.js":8}],10:[function(require,module,exports){
"use strict"

function unique_pred(list, compare) {
  var ptr = 1
    , len = list.length
    , a=list[0], b=list[0]
  for(var i=1; i<len; ++i) {
    b = a
    a = list[i]
    if(compare(a, b)) {
      if(i === ptr) {
        ptr++
        continue
      }
      list[ptr++] = a
    }
  }
  list.length = ptr
  return list
}

function unique_eq(list) {
  var ptr = 1
    , len = list.length
    , a=list[0], b = list[0]
  for(var i=1; i<len; ++i, b=a) {
    b = a
    a = list[i]
    if(a !== b) {
      if(i === ptr) {
        ptr++
        continue
      }
      list[ptr++] = a
    }
  }
  list.length = ptr
  return list
}

function unique(list, compare, sorted) {
  if(list.length === 0) {
    return []
  }
  if(compare) {
    if(!sorted) {
      list.sort(compare)
    }
    return unique_pred(list, compare)
  }
  if(!sorted) {
    list.sort()
  }
  return unique_eq(list)
}

module.exports = unique
},{}],11:[function(require,module,exports){
"use strict"

var pool = require("typedarray-pool")
var uniq = require("uniq")
var iota = require("iota-array")

function generateMesher(order, skip, merge, append, num_options, options, useGetter) {
  var code = []
  var d = order.length
  var i, j, k

  //Build arguments for append macro
  var append_args = new Array(2*d+1+num_options)
  for(i=0; i<d; ++i) {
    append_args[i] = "i"+i
  }
  for(i=0; i<d; ++i) {
    append_args[i+d] = "j"+i
  }
  append_args[2*d] = "oval"

  var opt_args = new Array(num_options)
  for(i=0; i<num_options; ++i) {
    opt_args[i] = "opt"+i
    append_args[2*d+1+i] = "opt"+i
  }

  //Unpack stride and shape arrays into variables
  code.push("var data=array.data,offset=array.offset,shape=array.shape,stride=array.stride")
  for(var i=0; i<d; ++i) {
    code.push(["var stride",i,"=stride[",order[i],"]|0,shape",i,"=shape[",order[i],"]|0"].join(""))
    if(i > 0) {
      code.push(["var astep",i,"=(stride",i,"-stride",i-1,"*shape",i-1,")|0"].join(""))
    } else {
      code.push(["var astep",i,"=stride",i,"|0"].join(""))
    }
    if(i > 0) {
      code.push(["var vstep",i,"=(vstep",i-1,"*shape",i-1,")|0"].join(""))
    } else {
      code.push(["var vstep",i,"=1"].join(""))
    }
    code.push(["var i",i,"=0,j",i,"=0,k",i,"=0,ustep",i,"=vstep",i,"|0,bstep",i,"=astep",i,"|0"].join(""))
  }

  //Initialize pointers
  code.push("var a_ptr=offset>>>0,b_ptr=0,u_ptr=0,v_ptr=0,i=0,d=0,val=0,oval=0")

  //Initialize count
  code.push("var count=" + iota(d).map(function(i) { return "shape"+i}).join("*"))
  code.push("var visited=mallocUint8(count)")

  //Zero out visited map
  code.push("for(;i<count;++i){visited[i]=0}")

  //Begin traversal
  for(i=d-1; i>=0; --i) {
    code.push(["for(i",i,"=0;i",i,"<shape",i,";++i",i,"){"].join(""))
  }
  code.push("if(!visited[v_ptr]){")

    if(useGetter) {
      code.push("val=data.get(a_ptr)")
    } else {
      code.push("val=data[a_ptr]")
    }

    if(skip) {
      code.push("if(!skip(val)){")
    } else {
      code.push("if(val!==0){")
    }

      //Save val to oval
      code.push("oval = val")

      //Generate merging code
      for(i=0; i<d; ++i) {
        code.push("u_ptr=v_ptr+vstep"+i)
        code.push("b_ptr=a_ptr+stride"+i)
        code.push(["j",i,"_loop: for(j",i,"=1+i",i,";j",i,"<shape",i,";++j",i,"){"].join(""))
        for(j=i-1; j>=0; --j) {
          code.push(["for(k",j,"=i",j,";k",j,"<j",j,";++k",j,"){"].join(""))
        }

          //Check if we can merge this voxel
          code.push("if(visited[u_ptr]) { break j"+i+"_loop; }")

          if(useGetter) {
            code.push("val=data.get(b_ptr)")
          } else {
            code.push("val=data[b_ptr]")
          }

          if(skip && merge) {
            code.push("if(skip(val) || !merge(oval,val)){ break j"+i+"_loop; }")
          } else if(skip) {
            code.push("if(skip(val) || val !== oval){ break j"+i+"_loop; }")
          } else if(merge) {
            code.push("if(val === 0 || !merge(oval,val)){ break j"+i+"_loop; }")
          } else {
            code.push("if(val === 0 || val !== oval){ break j"+i+"_loop; }")
          }

          //Close off loop bodies
          code.push("++u_ptr")
          code.push("b_ptr+=stride0")
        code.push("}")

        for(j=1; j<=i; ++j) {
          code.push("u_ptr+=ustep"+j)
          code.push("b_ptr+=bstep"+j)
          code.push("}")
        }
        if(i < d-1) {
          code.push("d=j"+i+"-i"+i)
          code.push(["ustep",i+1,"=(vstep",i+1,"-vstep",i,"*d)|0"].join(""))
          code.push(["bstep",i+1,"=(stride",i+1,"-stride",i,"*d)|0"].join(""))
        }
      }

      //Mark off visited table
      code.push("u_ptr=v_ptr")
      for(i=d-1; i>=0; --i) {
        code.push(["for(k",i,"=i",i,";k",i,"<j",i,";++k",i,"){"].join(""))
      }
      code.push("visited[u_ptr++]=1")
      code.push("}")
      for(i=1; i<d; ++i) {
        code.push("u_ptr+=ustep"+i)
        code.push("}")
      }

      //Append chunk to mesh
      code.push("append("+ append_args.join(",")+ ")")

    code.push("}")
  code.push("}")
  code.push("++v_ptr")
  for(var i=0; i<d; ++i) {
    code.push("a_ptr+=astep"+i)
    code.push("}")
  }

  code.push("freeUint8(visited)")

  if(options.debug) {
    console.log("GENERATING MESHER:")
    console.log(code.join("\n"))
  }

  //Compile procedure
  var args = ["append", "mallocUint8", "freeUint8"]
  if(merge) {
    args.unshift("merge")
  }
  if(skip) {
    args.unshift("skip")
  }

  //Build wrapper
  var local_args = ["array"].concat(opt_args)
  var funcName = ["greedyMesher", d, "d_ord", order.join("s") , (skip ? "skip" : "") , (merge ? "merge" : "")].join("")
  var gen_body = ["'use strict';function ", funcName, "(", local_args.join(","), "){", code.join("\n"), "};return ", funcName].join("")
  args.push(gen_body)
  var proc = Function.apply(undefined, args)

  if(skip && merge) {
    return proc(skip, merge, append, pool.mallocUint8, pool.freeUint8)
  } else if(skip) {
    return proc(skip, append, pool.mallocUint8, pool.freeUint8)
  } else if(merge) {
    return proc(merge, append, pool.mallocUint8, pool.freeUint8)
  } else {
    return proc(append, pool.mallocUint8, pool.freeUint8)
  }
}

//The actual mesh compiler
function compileMesher(options) {
  options = options || {}
  if(!options.order) {
    throw new Error("greedy-mesher: Missing order field")
  }
  if(!options.append) {
    throw new Error("greedy-mesher: Missing append field")
  }
  return generateMesher(
    options.order,
    options.skip,
    options.merge,
    options.append,
    options.extraArgs|0,
    options,
    !!options.useGetter
  )
}
module.exports = compileMesher

},{"iota-array":12,"typedarray-pool":15,"uniq":16}],12:[function(require,module,exports){
"use strict"

function iota(n) {
  var result = new Array(n)
  for(var i=0; i<n; ++i) {
    result[i] = i
  }
  return result
}

module.exports = iota
},{}],13:[function(require,module,exports){
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


},{}],14:[function(require,module,exports){
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
},{}],15:[function(require,module,exports){
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
},{"bit-twiddle":13,"buffer":1,"dup":14}],16:[function(require,module,exports){
"use strict"

function unique_pred(list, compare) {
  var ptr = 1
    , len = list.length
    , a=list[0], b=list[0]
  for(var i=1; i<len; ++i) {
    b = a
    a = list[i]
    if(compare(a, b)) {
      if(i === ptr) {
        ptr++
        continue
      }
      list[ptr++] = a
    }
  }
  list.length = ptr
  return list
}

function unique_eq(list) {
  var ptr = 1
    , len = list.length
    , a=list[0], b = list[0]
  for(var i=1; i<len; ++i, b=a) {
    b = a
    a = list[i]
    if(a !== b) {
      if(i === ptr) {
        ptr++
        continue
      }
      list[ptr++] = a
    }
  }
  list.length = ptr
  return list
}

function unique(list, compare, sorted) {
  if(list.length === 0) {
    return list
  }
  if(compare) {
    if(!sorted) {
      list.sort(compare)
    }
    return unique_pred(list, compare)
  }
  if(!sorted) {
    list.sort()
  }
  return unique_eq(list)
}

module.exports = unique

},{}],17:[function(require,module,exports){
var iota = require("iota-array")
var isBuffer = require("is-buffer")

var hasTypedArrays  = ((typeof Float64Array) !== "undefined")

function compare1st(a, b) {
  return a[0] - b[0]
}

function order() {
  var stride = this.stride
  var terms = new Array(stride.length)
  var i
  for(i=0; i<terms.length; ++i) {
    terms[i] = [Math.abs(stride[i]), i]
  }
  terms.sort(compare1st)
  var result = new Array(terms.length)
  for(i=0; i<result.length; ++i) {
    result[i] = terms[i][1]
  }
  return result
}

function compileConstructor(dtype, dimension) {
  var className = ["View", dimension, "d", dtype].join("")
  if(dimension < 0) {
    className = "View_Nil" + dtype
  }
  var useGetters = (dtype === "generic")

  if(dimension === -1) {
    //Special case for trivial arrays
    var code =
      "function "+className+"(a){this.data=a;};\
var proto="+className+".prototype;\
proto.dtype='"+dtype+"';\
proto.index=function(){return -1};\
proto.size=0;\
proto.dimension=-1;\
proto.shape=proto.stride=proto.order=[];\
proto.lo=proto.hi=proto.transpose=proto.step=\
function(){return new "+className+"(this.data);};\
proto.get=proto.set=function(){};\
proto.pick=function(){return null};\
return function construct_"+className+"(a){return new "+className+"(a);}"
    var procedure = new Function(code)
    return procedure()
  } else if(dimension === 0) {
    //Special case for 0d arrays
    var code =
      "function "+className+"(a,d) {\
this.data = a;\
this.offset = d\
};\
var proto="+className+".prototype;\
proto.dtype='"+dtype+"';\
proto.index=function(){return this.offset};\
proto.dimension=0;\
proto.size=1;\
proto.shape=\
proto.stride=\
proto.order=[];\
proto.lo=\
proto.hi=\
proto.transpose=\
proto.step=function "+className+"_copy() {\
return new "+className+"(this.data,this.offset)\
};\
proto.pick=function "+className+"_pick(){\
return TrivialArray(this.data);\
};\
proto.valueOf=proto.get=function "+className+"_get(){\
return "+(useGetters ? "this.data.get(this.offset)" : "this.data[this.offset]")+
"};\
proto.set=function "+className+"_set(v){\
return "+(useGetters ? "this.data.set(this.offset,v)" : "this.data[this.offset]=v")+"\
};\
return function construct_"+className+"(a,b,c,d){return new "+className+"(a,d)}"
    var procedure = new Function("TrivialArray", code)
    return procedure(CACHED_CONSTRUCTORS[dtype][0])
  }

  var code = ["'use strict'"]

  //Create constructor for view
  var indices = iota(dimension)
  var args = indices.map(function(i) { return "i"+i })
  var index_str = "this.offset+" + indices.map(function(i) {
        return "this.stride[" + i + "]*i" + i
      }).join("+")
  var shapeArg = indices.map(function(i) {
      return "b"+i
    }).join(",")
  var strideArg = indices.map(function(i) {
      return "c"+i
    }).join(",")
  code.push(
    "function "+className+"(a," + shapeArg + "," + strideArg + ",d){this.data=a",
      "this.shape=[" + shapeArg + "]",
      "this.stride=[" + strideArg + "]",
      "this.offset=d|0}",
    "var proto="+className+".prototype",
    "proto.dtype='"+dtype+"'",
    "proto.dimension="+dimension)

  //view.size:
  code.push("Object.defineProperty(proto,'size',{get:function "+className+"_size(){\
return "+indices.map(function(i) { return "this.shape["+i+"]" }).join("*"),
"}})")

  //view.order:
  if(dimension === 1) {
    code.push("proto.order=[0]")
  } else {
    code.push("Object.defineProperty(proto,'order',{get:")
    if(dimension < 4) {
      code.push("function "+className+"_order(){")
      if(dimension === 2) {
        code.push("return (Math.abs(this.stride[0])>Math.abs(this.stride[1]))?[1,0]:[0,1]}})")
      } else if(dimension === 3) {
        code.push(
"var s0=Math.abs(this.stride[0]),s1=Math.abs(this.stride[1]),s2=Math.abs(this.stride[2]);\
if(s0>s1){\
if(s1>s2){\
return [2,1,0];\
}else if(s0>s2){\
return [1,2,0];\
}else{\
return [1,0,2];\
}\
}else if(s0>s2){\
return [2,0,1];\
}else if(s2>s1){\
return [0,1,2];\
}else{\
return [0,2,1];\
}}})")
      }
    } else {
      code.push("ORDER})")
    }
  }

  //view.set(i0, ..., v):
  code.push(
"proto.set=function "+className+"_set("+args.join(",")+",v){")
  if(useGetters) {
    code.push("return this.data.set("+index_str+",v)}")
  } else {
    code.push("return this.data["+index_str+"]=v}")
  }

  //view.get(i0, ...):
  code.push("proto.get=function "+className+"_get("+args.join(",")+"){")
  if(useGetters) {
    code.push("return this.data.get("+index_str+")}")
  } else {
    code.push("return this.data["+index_str+"]}")
  }

  //view.index:
  code.push(
    "proto.index=function "+className+"_index(", args.join(), "){return "+index_str+"}")

  //view.hi():
  code.push("proto.hi=function "+className+"_hi("+args.join(",")+"){return new "+className+"(this.data,"+
    indices.map(function(i) {
      return ["(typeof i",i,"!=='number'||i",i,"<0)?this.shape[", i, "]:i", i,"|0"].join("")
    }).join(",")+","+
    indices.map(function(i) {
      return "this.stride["+i + "]"
    }).join(",")+",this.offset)}")

  //view.lo():
  var a_vars = indices.map(function(i) { return "a"+i+"=this.shape["+i+"]" })
  var c_vars = indices.map(function(i) { return "c"+i+"=this.stride["+i+"]" })
  code.push("proto.lo=function "+className+"_lo("+args.join(",")+"){var b=this.offset,d=0,"+a_vars.join(",")+","+c_vars.join(","))
  for(var i=0; i<dimension; ++i) {
    code.push(
"if(typeof i"+i+"==='number'&&i"+i+">=0){\
d=i"+i+"|0;\
b+=c"+i+"*d;\
a"+i+"-=d}")
  }
  code.push("return new "+className+"(this.data,"+
    indices.map(function(i) {
      return "a"+i
    }).join(",")+","+
    indices.map(function(i) {
      return "c"+i
    }).join(",")+",b)}")

  //view.step():
  code.push("proto.step=function "+className+"_step("+args.join(",")+"){var "+
    indices.map(function(i) {
      return "a"+i+"=this.shape["+i+"]"
    }).join(",")+","+
    indices.map(function(i) {
      return "b"+i+"=this.stride["+i+"]"
    }).join(",")+",c=this.offset,d=0,ceil=Math.ceil")
  for(var i=0; i<dimension; ++i) {
    code.push(
"if(typeof i"+i+"==='number'){\
d=i"+i+"|0;\
if(d<0){\
c+=b"+i+"*(a"+i+"-1);\
a"+i+"=ceil(-a"+i+"/d)\
}else{\
a"+i+"=ceil(a"+i+"/d)\
}\
b"+i+"*=d\
}")
  }
  code.push("return new "+className+"(this.data,"+
    indices.map(function(i) {
      return "a" + i
    }).join(",")+","+
    indices.map(function(i) {
      return "b" + i
    }).join(",")+",c)}")

  //view.transpose():
  var tShape = new Array(dimension)
  var tStride = new Array(dimension)
  for(var i=0; i<dimension; ++i) {
    tShape[i] = "a[i"+i+"]"
    tStride[i] = "b[i"+i+"]"
  }
  code.push("proto.transpose=function "+className+"_transpose("+args+"){"+
    args.map(function(n,idx) { return n + "=(" + n + "===undefined?" + idx + ":" + n + "|0)"}).join(";"),
    "var a=this.shape,b=this.stride;return new "+className+"(this.data,"+tShape.join(",")+","+tStride.join(",")+",this.offset)}")

  //view.pick():
  code.push("proto.pick=function "+className+"_pick("+args+"){var a=[],b=[],c=this.offset")
  for(var i=0; i<dimension; ++i) {
    code.push("if(typeof i"+i+"==='number'&&i"+i+">=0){c=(c+this.stride["+i+"]*i"+i+")|0}else{a.push(this.shape["+i+"]);b.push(this.stride["+i+"])}")
  }
  code.push("var ctor=CTOR_LIST[a.length+1];return ctor(this.data,a,b,c)}")

  //Add return statement
  code.push("return function construct_"+className+"(data,shape,stride,offset){return new "+className+"(data,"+
    indices.map(function(i) {
      return "shape["+i+"]"
    }).join(",")+","+
    indices.map(function(i) {
      return "stride["+i+"]"
    }).join(",")+",offset)}")

  //Compile procedure
  var procedure = new Function("CTOR_LIST", "ORDER", code.join("\n"))
  return procedure(CACHED_CONSTRUCTORS[dtype], order)
}

function arrayDType(data) {
  if(isBuffer(data)) {
    return "buffer"
  }
  if(hasTypedArrays) {
    switch(Object.prototype.toString.call(data)) {
      case "[object Float64Array]":
        return "float64"
      case "[object Float32Array]":
        return "float32"
      case "[object Int8Array]":
        return "int8"
      case "[object Int16Array]":
        return "int16"
      case "[object Int32Array]":
        return "int32"
      case "[object Uint8Array]":
        return "uint8"
      case "[object Uint16Array]":
        return "uint16"
      case "[object Uint32Array]":
        return "uint32"
      case "[object Uint8ClampedArray]":
        return "uint8_clamped"
    }
  }
  if(Array.isArray(data)) {
    return "array"
  }
  return "generic"
}

var CACHED_CONSTRUCTORS = {
  "float32":[],
  "float64":[],
  "int8":[],
  "int16":[],
  "int32":[],
  "uint8":[],
  "uint16":[],
  "uint32":[],
  "array":[],
  "uint8_clamped":[],
  "buffer":[],
  "generic":[]
}

;(function() {
  for(var id in CACHED_CONSTRUCTORS) {
    CACHED_CONSTRUCTORS[id].push(compileConstructor(id, -1))
  }
});

function wrappedNDArrayCtor(data, shape, stride, offset) {
  if(data === undefined) {
    var ctor = CACHED_CONSTRUCTORS.array[0]
    return ctor([])
  } else if(typeof data === "number") {
    data = [data]
  }
  if(shape === undefined) {
    shape = [ data.length ]
  }
  var d = shape.length
  if(stride === undefined) {
    stride = new Array(d)
    for(var i=d-1, sz=1; i>=0; --i) {
      stride[i] = sz
      sz *= shape[i]
    }
  }
  if(offset === undefined) {
    offset = 0
    for(var i=0; i<d; ++i) {
      if(stride[i] < 0) {
        offset -= (shape[i]-1)*stride[i]
      }
    }
  }
  var dtype = arrayDType(data)
  var ctor_list = CACHED_CONSTRUCTORS[dtype]
  while(ctor_list.length <= d+1) {
    ctor_list.push(compileConstructor(dtype, ctor_list.length-1))
  }
  var ctor = ctor_list[d+1]
  return ctor(data, shape, stride, offset)
}

module.exports = wrappedNDArrayCtor

},{"iota-array":18,"is-buffer":19}],18:[function(require,module,exports){
arguments[4][12][0].apply(exports,arguments)
},{"dup":12}],19:[function(require,module,exports){
/**
 * Determine if an object is Buffer
 *
 * Author:   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * License:  MIT
 *
 * `npm install is-buffer`
 */

module.exports = function (obj) {
  return !!(obj != null &&
    (obj._isBuffer || // For Safari 5-7 (missing Object.prototype.constructor)
      (obj.constructor &&
      typeof obj.constructor.isBuffer === 'function' &&
      obj.constructor.isBuffer(obj))
    ))
}

},{}],20:[function(require,module,exports){
arguments[4][13][0].apply(exports,arguments)
},{"dup":13}],21:[function(require,module,exports){
arguments[4][14][0].apply(exports,arguments)
},{"dup":14}],22:[function(require,module,exports){
(function (global){
"use strict"

var bits = require("bit-twiddle")
var dup = require("dup")
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
  }
}
var POOL = global.__TYPEDARRAY_POOL
var UINT8   = POOL.UINT8
  , UINT16  = POOL.UINT16
  , UINT32  = POOL.UINT32
  , INT8    = POOL.INT8
  , INT16   = POOL.INT16
  , INT32   = POOL.INT32
  , FLOAT   = POOL.FLOAT
  , DOUBLE  = POOL.DOUBLE
  , DATA    = POOL.DATA

exports.free = function free(array) {
  if(array instanceof ArrayBuffer) {
    var n = array.byteLength|0
      , log_n = bits.log2(n)
    DATA[log_n].push(array)
  } else {
    var n = array.length|0
      , log_n = bits.log2(n)
    if(array instanceof Uint8Array) {
      UINT8[log_n].push(array)
    } else if(array instanceof Uint16Array) {
      UINT16[log_n].push(array)
    } else if(array instanceof Uint32Array) {
      UINT32[log_n].push(array)
    } else if(array instanceof Int8Array) {
      INT8[log_n].push(array)
    } else if(array instanceof Int16Array) {
      INT16[log_n].push(array)
    } else if(array instanceof Int32Array) {
      INT32[log_n].push(array)
    } else if(array instanceof Float32Array) {
      FLOAT[log_n].push(array)
    } else if(array instanceof Float64Array) {
      DOUBLE[log_n].push(array)
    }
  }
}

exports.freeUint8 = function freeUint8(array) {
  UINT8[bits.log2(array.length)].push(array)
}

exports.freeUint16 = function freeUint16(array) {
  UINT16[bits.log2(array.length)].push(array)
}

exports.freeUint32 = function freeUint32(array) {
  UINT32[bits.log2(array.length)].push(array)
}

exports.freeInt8 = function freeInt8(array) {
  INT8[bits.log2(array.length)].push(array)
}

exports.freeInt16 = function freeInt16(array) {
  INT16[bits.log2(array.length)].push(array)
}

exports.freeInt32 = function freeInt32(array) {
  INT32[bits.log2(array.length)].push(array)
}

exports.freeFloat32 = exports.freeFloat = function freeFloat(array) {
  FLOAT[bits.log2(array.length)].push(array)
}

exports.freeFloat64 = exports.freeDouble = function freeDouble(array) {
  DOUBLE[bits.log2(array.length)].push(array)
}

exports.freeArrayBuffer = function freeArrayBuffer(array) {
  DATA[bits.log2(array.length)].push(array)
}

exports.malloc = function malloc(n, dtype) {
  n = bits.nextPow2(n)
  var log_n = bits.log2(n)
  if(dtype === undefined) {
    var d = DATA[log_n]
    if(d.length > 0) {
      var r = d[d.length-1]
      d.pop()
      return r
    }
    return new ArrayBuffer(n)
  } else {
    switch(dtype) {
      case "uint8":
        var u8 = UINT8[log_n]
        if(u8.length > 0) {
          return u8.pop()
        }
        return new Uint8Array(n)
      break

      case "uint16":
        var u16 = UINT16[log_n]
        if(u16.length > 0) {
          return u16.pop()
        }
        return new Uint16Array(n)
      break

      case "uint32":
        var u32 = UINT32[log_n]
        if(u32.length > 0) {
          return u32.pop()
        }
        return new Uint32Array(n)
      break

      case "int8":
        var i8 = INT8[log_n]
        if(i8.length > 0) {
          return i8.pop()
        }
        return new Int8Array(n)
      break

      case "int16":
        var i16 = INT16[log_n]
        if(i16.length > 0) {
          return i16.pop()
        }
        return new Int16Array(n)
      break

      case "int32":
        var i32 = INT32[log_n]
        if(i32.length > 0) {
          return i32.pop()
        }
        return new Int32Array(n)
      break

      case "float":
      case "float32":
        var f = FLOAT[log_n]
        if(f.length > 0) {
          return f.pop()
        }
        return new Float32Array(n)
      break

      case "double":
      case "float64":
        var dd = DOUBLE[log_n]
        if(dd.length > 0) {
          return dd.pop()
        }
        return new Float64Array(n)
      break

      default:
        return null
    }
  }
  return null
}

exports.mallocUint8 = function mallocUint8(n) {
  n = bits.nextPow2(n)
  var log_n = bits.log2(n)
  var cache = UINT8[log_n]
  if(cache.length > 0) {
    return cache.pop()
  }
  return new Uint8Array(n)
}

exports.mallocUint16 = function mallocUint16(n) {
  n = bits.nextPow2(n)
  var log_n = bits.log2(n)
  var cache = UINT16[log_n]
  if(cache.length > 0) {
    return cache.pop()
  }
  return new Uint16Array(n)
}

exports.mallocUint32 = function mallocUint32(n) {
  n = bits.nextPow2(n)
  var log_n = bits.log2(n)
  var cache = UINT32[log_n]
  if(cache.length > 0) {
    return cache.pop()
  }
  return new Uint32Array(n)
}

exports.mallocInt8 = function mallocInt8(n) {
  n = bits.nextPow2(n)
  var log_n = bits.log2(n)
  var cache = INT8[log_n]
  if(cache.length > 0) {
    return cache.pop()
  }
  return new Int8Array(n)
}

exports.mallocInt16 = function mallocInt16(n) {
  n = bits.nextPow2(n)
  var log_n = bits.log2(n)
  var cache = INT16[log_n]
  if(cache.length > 0) {
    return cache.pop()
  }
  return new Int16Array(n)
}

exports.mallocInt32 = function mallocInt32(n) {
  n = bits.nextPow2(n)
  var log_n = bits.log2(n)
  var cache = INT32[log_n]
  if(cache.length > 0) {
    return cache.pop()
  }
  return new Int32Array(n)
}

exports.mallocFloat32 = exports.mallocFloat = function mallocFloat(n) {
  n = bits.nextPow2(n)
  var log_n = bits.log2(n)
  var cache = FLOAT[log_n]
  if(cache.length > 0) {
    return cache.pop()
  }
  return new Float32Array(n)
}

exports.mallocFloat64 = exports.mallocDouble = function mallocDouble(n) {
  n = bits.nextPow2(n)
  var log_n = bits.log2(n)
  var cache = DOUBLE[log_n]
  if(cache.length > 0) {
    return cache.pop()
  }
  return new Float64Array(n)
}

exports.mallocArrayBuffer = function mallocArrayBuffer(n) {
  n = bits.nextPow2(n)
  var log_n = bits.log2(n)
  var cache = DATA[log_n]
  if(cache.length > 0) {
    return cache.pop()
  }
  return new ArrayBuffer(n)
}

exports.clearCache = function clearCache() {
  for(var i=0; i<32; ++i) {
    UINT8[i].length = 0
    UINT16[i].length = 0
    UINT32[i].length = 0
    INT8[i].length = 0
    INT16[i].length = 0
    INT32[i].length = 0
    FLOAT[i].length = 0
    DOUBLE[i].length = 0
    DATA[i].length = 0
  }
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"bit-twiddle":20,"dup":21}],23:[function(require,module,exports){
exports.surfaceNets         = require("./lib/surfacenets.js").surfaceNets;
exports.marchingCubes       = require("./lib/marchingcubes.js").marchingCubes;
exports.marchingTetrahedra  = require("./lib/marchingtetrahedra.js").marchingTetrahedra;

},{"./lib/marchingcubes.js":24,"./lib/marchingtetrahedra.js":25,"./lib/surfacenets.js":26}],24:[function(require,module,exports){
/**
 * Javascript Marching Cubes
 *
 * Based on Paul Bourke's classic implementation:
 *    http://local.wasp.uwa.edu.au/~pbourke/geometry/polygonise/
 *
 * JS port by Mikola Lysenko
 */

var edgeTable= new Uint32Array([
      0x0  , 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c,
      0x80c, 0x905, 0xa0f, 0xb06, 0xc0a, 0xd03, 0xe09, 0xf00,
      0x190, 0x99 , 0x393, 0x29a, 0x596, 0x49f, 0x795, 0x69c,
      0x99c, 0x895, 0xb9f, 0xa96, 0xd9a, 0xc93, 0xf99, 0xe90,
      0x230, 0x339, 0x33 , 0x13a, 0x636, 0x73f, 0x435, 0x53c,
      0xa3c, 0xb35, 0x83f, 0x936, 0xe3a, 0xf33, 0xc39, 0xd30,
      0x3a0, 0x2a9, 0x1a3, 0xaa , 0x7a6, 0x6af, 0x5a5, 0x4ac,
      0xbac, 0xaa5, 0x9af, 0x8a6, 0xfaa, 0xea3, 0xda9, 0xca0,
      0x460, 0x569, 0x663, 0x76a, 0x66 , 0x16f, 0x265, 0x36c,
      0xc6c, 0xd65, 0xe6f, 0xf66, 0x86a, 0x963, 0xa69, 0xb60,
      0x5f0, 0x4f9, 0x7f3, 0x6fa, 0x1f6, 0xff , 0x3f5, 0x2fc,
      0xdfc, 0xcf5, 0xfff, 0xef6, 0x9fa, 0x8f3, 0xbf9, 0xaf0,
      0x650, 0x759, 0x453, 0x55a, 0x256, 0x35f, 0x55 , 0x15c,
      0xe5c, 0xf55, 0xc5f, 0xd56, 0xa5a, 0xb53, 0x859, 0x950,
      0x7c0, 0x6c9, 0x5c3, 0x4ca, 0x3c6, 0x2cf, 0x1c5, 0xcc ,
      0xfcc, 0xec5, 0xdcf, 0xcc6, 0xbca, 0xac3, 0x9c9, 0x8c0,
      0x8c0, 0x9c9, 0xac3, 0xbca, 0xcc6, 0xdcf, 0xec5, 0xfcc,
      0xcc , 0x1c5, 0x2cf, 0x3c6, 0x4ca, 0x5c3, 0x6c9, 0x7c0,
      0x950, 0x859, 0xb53, 0xa5a, 0xd56, 0xc5f, 0xf55, 0xe5c,
      0x15c, 0x55 , 0x35f, 0x256, 0x55a, 0x453, 0x759, 0x650,
      0xaf0, 0xbf9, 0x8f3, 0x9fa, 0xef6, 0xfff, 0xcf5, 0xdfc,
      0x2fc, 0x3f5, 0xff , 0x1f6, 0x6fa, 0x7f3, 0x4f9, 0x5f0,
      0xb60, 0xa69, 0x963, 0x86a, 0xf66, 0xe6f, 0xd65, 0xc6c,
      0x36c, 0x265, 0x16f, 0x66 , 0x76a, 0x663, 0x569, 0x460,
      0xca0, 0xda9, 0xea3, 0xfaa, 0x8a6, 0x9af, 0xaa5, 0xbac,
      0x4ac, 0x5a5, 0x6af, 0x7a6, 0xaa , 0x1a3, 0x2a9, 0x3a0,
      0xd30, 0xc39, 0xf33, 0xe3a, 0x936, 0x83f, 0xb35, 0xa3c,
      0x53c, 0x435, 0x73f, 0x636, 0x13a, 0x33 , 0x339, 0x230,
      0xe90, 0xf99, 0xc93, 0xd9a, 0xa96, 0xb9f, 0x895, 0x99c,
      0x69c, 0x795, 0x49f, 0x596, 0x29a, 0x393, 0x99 , 0x190,
      0xf00, 0xe09, 0xd03, 0xc0a, 0xb06, 0xa0f, 0x905, 0x80c,
      0x70c, 0x605, 0x50f, 0x406, 0x30a, 0x203, 0x109, 0x0   ])
  , triTable = [
      [],
      [0, 8, 3],
      [0, 1, 9],
      [1, 8, 3, 9, 8, 1],
      [1, 2, 10],
      [0, 8, 3, 1, 2, 10],
      [9, 2, 10, 0, 2, 9],
      [2, 8, 3, 2, 10, 8, 10, 9, 8],
      [3, 11, 2],
      [0, 11, 2, 8, 11, 0],
      [1, 9, 0, 2, 3, 11],
      [1, 11, 2, 1, 9, 11, 9, 8, 11],
      [3, 10, 1, 11, 10, 3],
      [0, 10, 1, 0, 8, 10, 8, 11, 10],
      [3, 9, 0, 3, 11, 9, 11, 10, 9],
      [9, 8, 10, 10, 8, 11],
      [4, 7, 8],
      [4, 3, 0, 7, 3, 4],
      [0, 1, 9, 8, 4, 7],
      [4, 1, 9, 4, 7, 1, 7, 3, 1],
      [1, 2, 10, 8, 4, 7],
      [3, 4, 7, 3, 0, 4, 1, 2, 10],
      [9, 2, 10, 9, 0, 2, 8, 4, 7],
      [2, 10, 9, 2, 9, 7, 2, 7, 3, 7, 9, 4],
      [8, 4, 7, 3, 11, 2],
      [11, 4, 7, 11, 2, 4, 2, 0, 4],
      [9, 0, 1, 8, 4, 7, 2, 3, 11],
      [4, 7, 11, 9, 4, 11, 9, 11, 2, 9, 2, 1],
      [3, 10, 1, 3, 11, 10, 7, 8, 4],
      [1, 11, 10, 1, 4, 11, 1, 0, 4, 7, 11, 4],
      [4, 7, 8, 9, 0, 11, 9, 11, 10, 11, 0, 3],
      [4, 7, 11, 4, 11, 9, 9, 11, 10],
      [9, 5, 4],
      [9, 5, 4, 0, 8, 3],
      [0, 5, 4, 1, 5, 0],
      [8, 5, 4, 8, 3, 5, 3, 1, 5],
      [1, 2, 10, 9, 5, 4],
      [3, 0, 8, 1, 2, 10, 4, 9, 5],
      [5, 2, 10, 5, 4, 2, 4, 0, 2],
      [2, 10, 5, 3, 2, 5, 3, 5, 4, 3, 4, 8],
      [9, 5, 4, 2, 3, 11],
      [0, 11, 2, 0, 8, 11, 4, 9, 5],
      [0, 5, 4, 0, 1, 5, 2, 3, 11],
      [2, 1, 5, 2, 5, 8, 2, 8, 11, 4, 8, 5],
      [10, 3, 11, 10, 1, 3, 9, 5, 4],
      [4, 9, 5, 0, 8, 1, 8, 10, 1, 8, 11, 10],
      [5, 4, 0, 5, 0, 11, 5, 11, 10, 11, 0, 3],
      [5, 4, 8, 5, 8, 10, 10, 8, 11],
      [9, 7, 8, 5, 7, 9],
      [9, 3, 0, 9, 5, 3, 5, 7, 3],
      [0, 7, 8, 0, 1, 7, 1, 5, 7],
      [1, 5, 3, 3, 5, 7],
      [9, 7, 8, 9, 5, 7, 10, 1, 2],
      [10, 1, 2, 9, 5, 0, 5, 3, 0, 5, 7, 3],
      [8, 0, 2, 8, 2, 5, 8, 5, 7, 10, 5, 2],
      [2, 10, 5, 2, 5, 3, 3, 5, 7],
      [7, 9, 5, 7, 8, 9, 3, 11, 2],
      [9, 5, 7, 9, 7, 2, 9, 2, 0, 2, 7, 11],
      [2, 3, 11, 0, 1, 8, 1, 7, 8, 1, 5, 7],
      [11, 2, 1, 11, 1, 7, 7, 1, 5],
      [9, 5, 8, 8, 5, 7, 10, 1, 3, 10, 3, 11],
      [5, 7, 0, 5, 0, 9, 7, 11, 0, 1, 0, 10, 11, 10, 0],
      [11, 10, 0, 11, 0, 3, 10, 5, 0, 8, 0, 7, 5, 7, 0],
      [11, 10, 5, 7, 11, 5],
      [10, 6, 5],
      [0, 8, 3, 5, 10, 6],
      [9, 0, 1, 5, 10, 6],
      [1, 8, 3, 1, 9, 8, 5, 10, 6],
      [1, 6, 5, 2, 6, 1],
      [1, 6, 5, 1, 2, 6, 3, 0, 8],
      [9, 6, 5, 9, 0, 6, 0, 2, 6],
      [5, 9, 8, 5, 8, 2, 5, 2, 6, 3, 2, 8],
      [2, 3, 11, 10, 6, 5],
      [11, 0, 8, 11, 2, 0, 10, 6, 5],
      [0, 1, 9, 2, 3, 11, 5, 10, 6],
      [5, 10, 6, 1, 9, 2, 9, 11, 2, 9, 8, 11],
      [6, 3, 11, 6, 5, 3, 5, 1, 3],
      [0, 8, 11, 0, 11, 5, 0, 5, 1, 5, 11, 6],
      [3, 11, 6, 0, 3, 6, 0, 6, 5, 0, 5, 9],
      [6, 5, 9, 6, 9, 11, 11, 9, 8],
      [5, 10, 6, 4, 7, 8],
      [4, 3, 0, 4, 7, 3, 6, 5, 10],
      [1, 9, 0, 5, 10, 6, 8, 4, 7],
      [10, 6, 5, 1, 9, 7, 1, 7, 3, 7, 9, 4],
      [6, 1, 2, 6, 5, 1, 4, 7, 8],
      [1, 2, 5, 5, 2, 6, 3, 0, 4, 3, 4, 7],
      [8, 4, 7, 9, 0, 5, 0, 6, 5, 0, 2, 6],
      [7, 3, 9, 7, 9, 4, 3, 2, 9, 5, 9, 6, 2, 6, 9],
      [3, 11, 2, 7, 8, 4, 10, 6, 5],
      [5, 10, 6, 4, 7, 2, 4, 2, 0, 2, 7, 11],
      [0, 1, 9, 4, 7, 8, 2, 3, 11, 5, 10, 6],
      [9, 2, 1, 9, 11, 2, 9, 4, 11, 7, 11, 4, 5, 10, 6],
      [8, 4, 7, 3, 11, 5, 3, 5, 1, 5, 11, 6],
      [5, 1, 11, 5, 11, 6, 1, 0, 11, 7, 11, 4, 0, 4, 11],
      [0, 5, 9, 0, 6, 5, 0, 3, 6, 11, 6, 3, 8, 4, 7],
      [6, 5, 9, 6, 9, 11, 4, 7, 9, 7, 11, 9],
      [10, 4, 9, 6, 4, 10],
      [4, 10, 6, 4, 9, 10, 0, 8, 3],
      [10, 0, 1, 10, 6, 0, 6, 4, 0],
      [8, 3, 1, 8, 1, 6, 8, 6, 4, 6, 1, 10],
      [1, 4, 9, 1, 2, 4, 2, 6, 4],
      [3, 0, 8, 1, 2, 9, 2, 4, 9, 2, 6, 4],
      [0, 2, 4, 4, 2, 6],
      [8, 3, 2, 8, 2, 4, 4, 2, 6],
      [10, 4, 9, 10, 6, 4, 11, 2, 3],
      [0, 8, 2, 2, 8, 11, 4, 9, 10, 4, 10, 6],
      [3, 11, 2, 0, 1, 6, 0, 6, 4, 6, 1, 10],
      [6, 4, 1, 6, 1, 10, 4, 8, 1, 2, 1, 11, 8, 11, 1],
      [9, 6, 4, 9, 3, 6, 9, 1, 3, 11, 6, 3],
      [8, 11, 1, 8, 1, 0, 11, 6, 1, 9, 1, 4, 6, 4, 1],
      [3, 11, 6, 3, 6, 0, 0, 6, 4],
      [6, 4, 8, 11, 6, 8],
      [7, 10, 6, 7, 8, 10, 8, 9, 10],
      [0, 7, 3, 0, 10, 7, 0, 9, 10, 6, 7, 10],
      [10, 6, 7, 1, 10, 7, 1, 7, 8, 1, 8, 0],
      [10, 6, 7, 10, 7, 1, 1, 7, 3],
      [1, 2, 6, 1, 6, 8, 1, 8, 9, 8, 6, 7],
      [2, 6, 9, 2, 9, 1, 6, 7, 9, 0, 9, 3, 7, 3, 9],
      [7, 8, 0, 7, 0, 6, 6, 0, 2],
      [7, 3, 2, 6, 7, 2],
      [2, 3, 11, 10, 6, 8, 10, 8, 9, 8, 6, 7],
      [2, 0, 7, 2, 7, 11, 0, 9, 7, 6, 7, 10, 9, 10, 7],
      [1, 8, 0, 1, 7, 8, 1, 10, 7, 6, 7, 10, 2, 3, 11],
      [11, 2, 1, 11, 1, 7, 10, 6, 1, 6, 7, 1],
      [8, 9, 6, 8, 6, 7, 9, 1, 6, 11, 6, 3, 1, 3, 6],
      [0, 9, 1, 11, 6, 7],
      [7, 8, 0, 7, 0, 6, 3, 11, 0, 11, 6, 0],
      [7, 11, 6],
      [7, 6, 11],
      [3, 0, 8, 11, 7, 6],
      [0, 1, 9, 11, 7, 6],
      [8, 1, 9, 8, 3, 1, 11, 7, 6],
      [10, 1, 2, 6, 11, 7],
      [1, 2, 10, 3, 0, 8, 6, 11, 7],
      [2, 9, 0, 2, 10, 9, 6, 11, 7],
      [6, 11, 7, 2, 10, 3, 10, 8, 3, 10, 9, 8],
      [7, 2, 3, 6, 2, 7],
      [7, 0, 8, 7, 6, 0, 6, 2, 0],
      [2, 7, 6, 2, 3, 7, 0, 1, 9],
      [1, 6, 2, 1, 8, 6, 1, 9, 8, 8, 7, 6],
      [10, 7, 6, 10, 1, 7, 1, 3, 7],
      [10, 7, 6, 1, 7, 10, 1, 8, 7, 1, 0, 8],
      [0, 3, 7, 0, 7, 10, 0, 10, 9, 6, 10, 7],
      [7, 6, 10, 7, 10, 8, 8, 10, 9],
      [6, 8, 4, 11, 8, 6],
      [3, 6, 11, 3, 0, 6, 0, 4, 6],
      [8, 6, 11, 8, 4, 6, 9, 0, 1],
      [9, 4, 6, 9, 6, 3, 9, 3, 1, 11, 3, 6],
      [6, 8, 4, 6, 11, 8, 2, 10, 1],
      [1, 2, 10, 3, 0, 11, 0, 6, 11, 0, 4, 6],
      [4, 11, 8, 4, 6, 11, 0, 2, 9, 2, 10, 9],
      [10, 9, 3, 10, 3, 2, 9, 4, 3, 11, 3, 6, 4, 6, 3],
      [8, 2, 3, 8, 4, 2, 4, 6, 2],
      [0, 4, 2, 4, 6, 2],
      [1, 9, 0, 2, 3, 4, 2, 4, 6, 4, 3, 8],
      [1, 9, 4, 1, 4, 2, 2, 4, 6],
      [8, 1, 3, 8, 6, 1, 8, 4, 6, 6, 10, 1],
      [10, 1, 0, 10, 0, 6, 6, 0, 4],
      [4, 6, 3, 4, 3, 8, 6, 10, 3, 0, 3, 9, 10, 9, 3],
      [10, 9, 4, 6, 10, 4],
      [4, 9, 5, 7, 6, 11],
      [0, 8, 3, 4, 9, 5, 11, 7, 6],
      [5, 0, 1, 5, 4, 0, 7, 6, 11],
      [11, 7, 6, 8, 3, 4, 3, 5, 4, 3, 1, 5],
      [9, 5, 4, 10, 1, 2, 7, 6, 11],
      [6, 11, 7, 1, 2, 10, 0, 8, 3, 4, 9, 5],
      [7, 6, 11, 5, 4, 10, 4, 2, 10, 4, 0, 2],
      [3, 4, 8, 3, 5, 4, 3, 2, 5, 10, 5, 2, 11, 7, 6],
      [7, 2, 3, 7, 6, 2, 5, 4, 9],
      [9, 5, 4, 0, 8, 6, 0, 6, 2, 6, 8, 7],
      [3, 6, 2, 3, 7, 6, 1, 5, 0, 5, 4, 0],
      [6, 2, 8, 6, 8, 7, 2, 1, 8, 4, 8, 5, 1, 5, 8],
      [9, 5, 4, 10, 1, 6, 1, 7, 6, 1, 3, 7],
      [1, 6, 10, 1, 7, 6, 1, 0, 7, 8, 7, 0, 9, 5, 4],
      [4, 0, 10, 4, 10, 5, 0, 3, 10, 6, 10, 7, 3, 7, 10],
      [7, 6, 10, 7, 10, 8, 5, 4, 10, 4, 8, 10],
      [6, 9, 5, 6, 11, 9, 11, 8, 9],
      [3, 6, 11, 0, 6, 3, 0, 5, 6, 0, 9, 5],
      [0, 11, 8, 0, 5, 11, 0, 1, 5, 5, 6, 11],
      [6, 11, 3, 6, 3, 5, 5, 3, 1],
      [1, 2, 10, 9, 5, 11, 9, 11, 8, 11, 5, 6],
      [0, 11, 3, 0, 6, 11, 0, 9, 6, 5, 6, 9, 1, 2, 10],
      [11, 8, 5, 11, 5, 6, 8, 0, 5, 10, 5, 2, 0, 2, 5],
      [6, 11, 3, 6, 3, 5, 2, 10, 3, 10, 5, 3],
      [5, 8, 9, 5, 2, 8, 5, 6, 2, 3, 8, 2],
      [9, 5, 6, 9, 6, 0, 0, 6, 2],
      [1, 5, 8, 1, 8, 0, 5, 6, 8, 3, 8, 2, 6, 2, 8],
      [1, 5, 6, 2, 1, 6],
      [1, 3, 6, 1, 6, 10, 3, 8, 6, 5, 6, 9, 8, 9, 6],
      [10, 1, 0, 10, 0, 6, 9, 5, 0, 5, 6, 0],
      [0, 3, 8, 5, 6, 10],
      [10, 5, 6],
      [11, 5, 10, 7, 5, 11],
      [11, 5, 10, 11, 7, 5, 8, 3, 0],
      [5, 11, 7, 5, 10, 11, 1, 9, 0],
      [10, 7, 5, 10, 11, 7, 9, 8, 1, 8, 3, 1],
      [11, 1, 2, 11, 7, 1, 7, 5, 1],
      [0, 8, 3, 1, 2, 7, 1, 7, 5, 7, 2, 11],
      [9, 7, 5, 9, 2, 7, 9, 0, 2, 2, 11, 7],
      [7, 5, 2, 7, 2, 11, 5, 9, 2, 3, 2, 8, 9, 8, 2],
      [2, 5, 10, 2, 3, 5, 3, 7, 5],
      [8, 2, 0, 8, 5, 2, 8, 7, 5, 10, 2, 5],
      [9, 0, 1, 5, 10, 3, 5, 3, 7, 3, 10, 2],
      [9, 8, 2, 9, 2, 1, 8, 7, 2, 10, 2, 5, 7, 5, 2],
      [1, 3, 5, 3, 7, 5],
      [0, 8, 7, 0, 7, 1, 1, 7, 5],
      [9, 0, 3, 9, 3, 5, 5, 3, 7],
      [9, 8, 7, 5, 9, 7],
      [5, 8, 4, 5, 10, 8, 10, 11, 8],
      [5, 0, 4, 5, 11, 0, 5, 10, 11, 11, 3, 0],
      [0, 1, 9, 8, 4, 10, 8, 10, 11, 10, 4, 5],
      [10, 11, 4, 10, 4, 5, 11, 3, 4, 9, 4, 1, 3, 1, 4],
      [2, 5, 1, 2, 8, 5, 2, 11, 8, 4, 5, 8],
      [0, 4, 11, 0, 11, 3, 4, 5, 11, 2, 11, 1, 5, 1, 11],
      [0, 2, 5, 0, 5, 9, 2, 11, 5, 4, 5, 8, 11, 8, 5],
      [9, 4, 5, 2, 11, 3],
      [2, 5, 10, 3, 5, 2, 3, 4, 5, 3, 8, 4],
      [5, 10, 2, 5, 2, 4, 4, 2, 0],
      [3, 10, 2, 3, 5, 10, 3, 8, 5, 4, 5, 8, 0, 1, 9],
      [5, 10, 2, 5, 2, 4, 1, 9, 2, 9, 4, 2],
      [8, 4, 5, 8, 5, 3, 3, 5, 1],
      [0, 4, 5, 1, 0, 5],
      [8, 4, 5, 8, 5, 3, 9, 0, 5, 0, 3, 5],
      [9, 4, 5],
      [4, 11, 7, 4, 9, 11, 9, 10, 11],
      [0, 8, 3, 4, 9, 7, 9, 11, 7, 9, 10, 11],
      [1, 10, 11, 1, 11, 4, 1, 4, 0, 7, 4, 11],
      [3, 1, 4, 3, 4, 8, 1, 10, 4, 7, 4, 11, 10, 11, 4],
      [4, 11, 7, 9, 11, 4, 9, 2, 11, 9, 1, 2],
      [9, 7, 4, 9, 11, 7, 9, 1, 11, 2, 11, 1, 0, 8, 3],
      [11, 7, 4, 11, 4, 2, 2, 4, 0],
      [11, 7, 4, 11, 4, 2, 8, 3, 4, 3, 2, 4],
      [2, 9, 10, 2, 7, 9, 2, 3, 7, 7, 4, 9],
      [9, 10, 7, 9, 7, 4, 10, 2, 7, 8, 7, 0, 2, 0, 7],
      [3, 7, 10, 3, 10, 2, 7, 4, 10, 1, 10, 0, 4, 0, 10],
      [1, 10, 2, 8, 7, 4],
      [4, 9, 1, 4, 1, 7, 7, 1, 3],
      [4, 9, 1, 4, 1, 7, 0, 8, 1, 8, 7, 1],
      [4, 0, 3, 7, 4, 3],
      [4, 8, 7],
      [9, 10, 8, 10, 11, 8],
      [3, 0, 9, 3, 9, 11, 11, 9, 10],
      [0, 1, 10, 0, 10, 8, 8, 10, 11],
      [3, 1, 10, 11, 3, 10],
      [1, 2, 11, 1, 11, 9, 9, 11, 8],
      [3, 0, 9, 3, 9, 11, 1, 2, 9, 2, 11, 9],
      [0, 2, 11, 8, 0, 11],
      [3, 2, 11],
      [2, 3, 8, 2, 8, 10, 10, 8, 9],
      [9, 10, 2, 0, 9, 2],
      [2, 3, 8, 2, 8, 10, 0, 1, 8, 1, 10, 8],
      [1, 10, 2],
      [1, 3, 8, 9, 1, 8],
      [0, 9, 1],
      [0, 3, 8],
      []]
  , cubeVerts = [
     [0,0,0]
    ,[1,0,0]
    ,[1,1,0]
    ,[0,1,0]
    ,[0,0,1]
    ,[1,0,1]
    ,[1,1,1]
    ,[0,1,1]]
  , edgeIndex = [ [0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7] ];



exports.marchingCubes = function(dims, potential, bounds) {
  if(!bounds) {
    bounds = [[0,0,0], dims];
  }
  var scale     = [0,0,0];
  var shift     = [0,0,0];
  for(var i=0; i<3; ++i) {
    scale[i] = (bounds[1][i] - bounds[0][i]) / dims[i];
    shift[i] = bounds[0][i];
  }

  var vertices = []
    , faces = []
    , n = 0
    , grid = new Array(8)
    , edges = new Array(12)
    , x = [0,0,0];
  //March over the volume
  for(x[2]=0; x[2]<dims[2]-1; ++x[2], n+=dims[0])
  for(x[1]=0; x[1]<dims[1]-1; ++x[1], ++n)
  for(x[0]=0; x[0]<dims[0]-1; ++x[0], ++n) {
    //For each cell, compute cube mask
    var cube_index = 0;
    for(var i=0; i<8; ++i) {
      var v = cubeVerts[i]
        , s = potential(
          scale[0]*(x[0]+v[0])+shift[0],
          scale[1]*(x[1]+v[1])+shift[1],
          scale[2]*(x[2]+v[2])+shift[2]);
      grid[i] = s;
      cube_index |= (s > 0) ? 1 << i : 0;
    }
    //Compute vertices
    var edge_mask = edgeTable[cube_index];
    if(edge_mask === 0) {
      continue;
    }
    for(var i=0; i<12; ++i) {
      if((edge_mask & (1<<i)) === 0) {
        continue;
      }
      edges[i] = vertices.length;
      var nv = [0,0,0]
        , e = edgeIndex[i]
        , p0 = cubeVerts[e[0]]
        , p1 = cubeVerts[e[1]]
        , a = grid[e[0]]
        , b = grid[e[1]]
        , d = a - b
        , t = 0;
      if(Math.abs(d) > 1e-6) {
        t = a / d;
      }
      for(var j=0; j<3; ++j) {
        nv[j] = scale[j] * ((x[j] + p0[j]) + t * (p1[j] - p0[j])) + shift[j];
      }
      vertices.push(nv);
    }
    //Add faces
    var f = triTable[cube_index];
    for(var i=0; i<f.length; i += 3) {
      faces.push([edges[f[i]], edges[f[i+1]], edges[f[i+2]]]);
    }
  }
  return { positions: vertices, cells: faces };
};


},{}],25:[function(require,module,exports){
/**
 * Marching Tetrahedra in Javascript
 *
 * Based on Paul Bourke's implementation
 *  http://local.wasp.uwa.edu.au/~pbourke/geometry/polygonise/
 *
 * (Several bug fixes were made to deal with oriented faces)
 *
 * Javascript port by Mikola Lysenko
 */
var cube_vertices = [
        [0,0,0]
      , [1,0,0]
      , [1,1,0]
      , [0,1,0]
      , [0,0,1]
      , [1,0,1]
      , [1,1,1]
      , [0,1,1] ]
  , tetra_list = [
        [0,2,3,7]
      , [0,6,2,7]
      , [0,4,6,7]
      , [0,6,1,2]
      , [0,1,6,4]
      , [5,6,1,4] ];

exports.marchingTetrahedra = function(dims, potential, bounds) {

  if(!bounds) {
    bounds = [[0,0,0], dims];
  }

  var scale     = [0,0,0];
  var shift     = [0,0,0];
  for(var i=0; i<3; ++i) {
    scale[i] = (bounds[1][i] - bounds[0][i]) / dims[i];
    shift[i] = bounds[0][i];
  }

   var vertices = []
    , faces = []
    , n = 0
    , grid = new Float32Array(8)
    , edges = new Int32Array(12)
    , x = [0,0,0];

  function interp(i0, i1) {
    var g0 = grid[i0]
      , g1 = grid[i1]
      , p0 = cube_vertices[i0]
      , p1 = cube_vertices[i1]
      , v  = [x[0], x[1], x[2]]
      , t = g0 - g1;
    if(Math.abs(t) > 1e-6) {
      t = g0 / t;
    }
    for(var i=0; i<3; ++i) {
      v[i] = scale[i] * (v[i] + p0[i] + t * (p1[i] - p0[i])) + shift[i];
    }
    vertices.push(v);
    return vertices.length - 1;
  }

  //March over the volume
  for(x[2]=0; x[2]<dims[2]-1; ++x[2], n+=dims[0])
  for(x[1]=0; x[1]<dims[1]-1; ++x[1], ++n)
  for(x[0]=0; x[0]<dims[0]-1; ++x[0], ++n) {
    //Read in cube
    for(var i=0; i<8; ++i) {
      var cube_vert = cube_vertices[i];
      grid[i] = potential(
        scale[0]*(x[0]+cube_vert[0])+shift[0],
        scale[1]*(x[1]+cube_vert[1])+shift[1],
        scale[2]*(x[2]+cube_vert[2])+shift[2]);
    }
    for(var i=0; i<tetra_list.length; ++i) {
      var T = tetra_list[i]
        , triindex = 0;
      if (grid[T[0]] < 0) triindex |= 1;
      if (grid[T[1]] < 0) triindex |= 2;
      if (grid[T[2]] < 0) triindex |= 4;
      if (grid[T[3]] < 0) triindex |= 8;

      //Handle each case
      switch (triindex) {
        case 0x00:
        case 0x0F:
        break;
        case 0x0E:
          faces.push([
              interp(T[0], T[1])
            , interp(T[0], T[3])
            , interp(T[0], T[2]) ]);
        break;
        case 0x01:
          faces.push([
              interp(T[0], T[1])
            , interp(T[0], T[2])
            , interp(T[0], T[3])  ]);
        break;
        case 0x0D:
          faces.push([
              interp(T[1], T[0])
            , interp(T[1], T[2])
            , interp(T[1], T[3]) ]);
        break;
        case 0x02:
          faces.push([
              interp(T[1], T[0])
            , interp(T[1], T[3])
            , interp(T[1], T[2]) ]);
        break;
        case 0x0C:
          faces.push([
                interp(T[1], T[2])
              , interp(T[1], T[3])
              , interp(T[0], T[3])
              , interp(T[0], T[2]) ]);
        break;
        case 0x03:
          faces.push([
                interp(T[1], T[2])
              , interp(T[0], T[2])
              , interp(T[0], T[3])
              , interp(T[1], T[3]) ]);
        break;
        case 0x04:
          faces.push([
                interp(T[2], T[0])
              , interp(T[2], T[1])
              , interp(T[2], T[3]) ]);
        break;
        case 0x0B:
          faces.push([
                interp(T[2], T[0])
              , interp(T[2], T[3])
              , interp(T[2], T[1]) ]);
        break;
        case 0x05:
          faces.push([
                interp(T[0], T[1])
              , interp(T[1], T[2])
              , interp(T[2], T[3])
              , interp(T[0], T[3]) ]);
        break;
        case 0x0A:
          faces.push([
                interp(T[0], T[1])
              , interp(T[0], T[3])
              , interp(T[2], T[3])
              , interp(T[1], T[2]) ]);
        break;
        case 0x06:
          faces.push([
                interp(T[2], T[3])
              , interp(T[0], T[2])
              , interp(T[0], T[1])
              , interp(T[1], T[3]) ]);
        break;
        case 0x09:
          faces.push([
                interp(T[2], T[3])
              , interp(T[1], T[3])
              , interp(T[0], T[1])
              , interp(T[0], T[2]) ]);
        break;
        case 0x07:
          faces.push([
                interp(T[3], T[0])
              , interp(T[3], T[1])
              , interp(T[3], T[2]) ]);
        break;
        case 0x08:
          faces.push([
                interp(T[3], T[0])
              , interp(T[3], T[2])
              , interp(T[3], T[1]) ]);
        break;
      }
    }
  }

  return { positions: vertices, cells: faces };
}


},{}],26:[function(require,module,exports){
/**
 * SurfaceNets in JavaScript
 *
 * Written by Mikola Lysenko (C) 2012
 *
 * MIT License
 *
 * Based on: S.F. Gibson, "Constrained Elastic Surface Nets". (1998) MERL Tech Report.
 */
"use strict";

//Precompute edge table, like Paul Bourke does.
// This saves a bit of time when computing the centroid of each boundary cell
var cube_edges = new Int32Array(24)
  , edge_table = new Int32Array(256);
(function() {

  //Initialize the cube_edges table
  // This is just the vertex number of each cube
  var k = 0;
  for(var i=0; i<8; ++i) {
    for(var j=1; j<=4; j<<=1) {
      var p = i^j;
      if(i <= p) {
        cube_edges[k++] = i;
        cube_edges[k++] = p;
      }
    }
  }

  //Initialize the intersection table.
  //  This is a 2^(cube configuration) ->  2^(edge configuration) map
  //  There is one entry for each possible cube configuration, and the output is a 12-bit vector enumerating all edges crossing the 0-level.
  for(var i=0; i<256; ++i) {
    var em = 0;
    for(var j=0; j<24; j+=2) {
      var a = !!(i & (1<<cube_edges[j]))
        , b = !!(i & (1<<cube_edges[j+1]));
      em |= a !== b ? (1 << (j >> 1)) : 0;
    }
    edge_table[i] = em;
  }
})();

//Internal buffer, this may get resized at run time
var buffer = new Array(4096);
(function() {
  for(var i=0; i<buffer.length; ++i) {
    buffer[i] = 0;
  }
})();

exports.surfaceNets = function(dims, potential, bounds) {
  if(!bounds) {
    bounds = [[0,0,0],dims];
  }

  var scale     = [0,0,0];
  var shift     = [0,0,0];
  for(var i=0; i<3; ++i) {
    scale[i] = (bounds[1][i] - bounds[0][i]) / dims[i];
    shift[i] = bounds[0][i];
  }

  var vertices = []
    , faces = []
    , n = 0
    , x = [0, 0, 0]
    , R = [1, (dims[0]+1), (dims[0]+1)*(dims[1]+1)]
    , grid = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    , buf_no = 1;


  //Resize buffer if necessary
  if(R[2] * 2 > buffer.length) {
    var ol = buffer.length;
    buffer.length = R[2] * 2;
    while(ol < buffer.length) {
      buffer[ol++] = 0;
    }
  }

  //March over the voxel grid
  for(x[2]=0; x[2]<dims[2]-1; ++x[2], n+=dims[0], buf_no ^= 1, R[2]=-R[2]) {

    //m is the pointer into the buffer we are going to use.
    //This is slightly obtuse because javascript does not have good support for packed data structures, so we must use typed arrays :(
    //The contents of the buffer will be the indices of the vertices on the previous x/y slice of the volume
    var m = 1 + (dims[0]+1) * (1 + buf_no * (dims[1]+1));

    for(x[1]=0; x[1]<dims[1]-1; ++x[1], ++n, m+=2)
    for(x[0]=0; x[0]<dims[0]-1; ++x[0], ++n, ++m) {

      //Read in 8 field values around this vertex and store them in an array
      //Also calculate 8-bit mask, like in marching cubes, so we can speed up sign checks later
      var mask = 0, g = 0;
      for(var k=0; k<2; ++k)
      for(var j=0; j<2; ++j)
      for(var i=0; i<2; ++i, ++g) {
        var p = potential(
          scale[0]*(x[0]+i)+shift[0],
          scale[1]*(x[1]+j)+shift[1],
          scale[2]*(x[2]+k)+shift[2]);
        grid[g] = p;
        mask |= (p < 0) ? (1<<g) : 0;
      }

      //Check for early termination if cell does not intersect boundary
      if(mask === 0 || mask === 0xff) {
        continue;
      }

      //Sum up edge intersections
      var edge_mask = edge_table[mask]
        , v = [0.0,0.0,0.0]
        , e_count = 0;

      //For every edge of the cube...
      for(var i=0; i<12; ++i) {

        //Use edge mask to check if it is crossed
        if(!(edge_mask & (1<<i))) {
          continue;
        }

        //If it did, increment number of edge crossings
        ++e_count;

        //Now find the point of intersection
        var e0 = cube_edges[ i<<1 ]       //Unpack vertices
          , e1 = cube_edges[(i<<1)+1]
          , g0 = grid[e0]                 //Unpack grid values
          , g1 = grid[e1]
          , t  = g0 - g1;                 //Compute point of intersection
        if(Math.abs(t) > 1e-6) {
          t = g0 / t;
        } else {
          continue;
        }

        //Interpolate vertices and add up intersections (this can be done without multiplying)
        for(var j=0, k=1; j<3; ++j, k<<=1) {
          var a = e0 & k
            , b = e1 & k;
          if(a !== b) {
            v[j] += a ? 1.0 - t : t;
          } else {
            v[j] += a ? 1.0 : 0;
          }
        }
      }

      //Now we just average the edge intersections and add them to coordinate
      var s = 1.0 / e_count;
      for(var i=0; i<3; ++i) {
        v[i] = scale[i] * (x[i] + s * v[i]) + shift[i];
      }

      //Add vertex to buffer, store pointer to vertex index in buffer
      buffer[m] = vertices.length;
      vertices.push(v);

      //Now we need to add faces together, to do this we just loop over 3 basis components
      for(var i=0; i<3; ++i) {
        //The first three entries of the edge_mask count the crossings along the edge
        if(!(edge_mask & (1<<i)) ) {
          continue;
        }

        // i = axes we are point along.  iu, iv = orthogonal axes
        var iu = (i+1)%3
          , iv = (i+2)%3;

        //If we are on a boundary, skip it
        if(x[iu] === 0 || x[iv] === 0) {
          continue;
        }

        //Otherwise, look up adjacent edges in buffer
        var du = R[iu]
          , dv = R[iv];

        //Remember to flip orientation depending on the sign of the corner.
        if(mask & 1) {
          faces.push([buffer[m],    buffer[m-du],    buffer[m-dv]]);
          faces.push([buffer[m-dv], buffer[m-du],    buffer[m-du-dv]]);
        } else {
          faces.push([buffer[m],    buffer[m-dv],    buffer[m-du]]);
          faces.push([buffer[m-du], buffer[m-dv],    buffer[m-du-dv]]);
        }
      }
    }
  }

  //All done!  Return the result
  return { positions: vertices, cells: faces };
};

},{}],27:[function(require,module,exports){
var EPSILON = 1e-6;

//Estimate the vertex normals of a mesh
exports.vertexNormals = function(faces, positions) {

  var N         = positions.length;
  var normals   = new Array(N);

  //Initialize normal array
  for(var i=0; i<N; ++i) {
    normals[i] = [0.0, 0.0, 0.0];
  }

  //Walk over all the faces and add per-vertex contribution to normal weights
  for(var i=0; i<faces.length; ++i) {
    var f = faces[i];
    var p = 0;
    var c = f[f.length-1];
    var n = f[0];
    for(var j=0; j<f.length; ++j) {

      //Shift indices back
      p = c;
      c = n;
      n = f[(j+1) % f.length];

      var v0 = positions[p];
      var v1 = positions[c];
      var v2 = positions[n];

      //Compute infineteismal arcs
      var d01 = new Array(3);
      var m01 = 0.0;
      var d21 = new Array(3);
      var m21 = 0.0;
      for(var k=0; k<3; ++k) {
        d01[k] = v0[k]  - v1[k];
        m01   += d01[k] * d01[k];
        d21[k] = v2[k]  - v1[k];
        m21   += d21[k] * d21[k];
      }

      //Accumulate values in normal
      if(m01 * m21 > EPSILON) {
        var norm = normals[c];
        var w = 1.0 / Math.sqrt(m01 * m21);
        for(var k=0; k<3; ++k) {
          var u = (k+1)%3;
          var v = (k+2)%3;
          norm[k] += w * (d21[u] * d01[v] - d21[v] * d01[u]);
        }
      }
    }
  }

  //Scale all normals to unit length
  for(var i=0; i<N; ++i) {
    var norm = normals[i];
    var m = 0.0;
    for(var k=0; k<3; ++k) {
      m += norm[k] * norm[k];
    }
    if(m > EPSILON) {
      var w = 1.0 / Math.sqrt(m);
      for(var k=0; k<3; ++k) {
        norm[k] *= w;
      }
    } else {
      for(var k=0; k<3; ++k) {
        norm[k] = 0.0;
      }
    }
  }

  //Return the resulting set of patches
  return normals;
}

//Compute face normals of a mesh
exports.faceNormals = function(faces, positions) {
  var N         = faces.length;
  var normals   = new Array(N);

  for(var i=0; i<N; ++i) {
    var f = faces[i];
    var pos = new Array(3);
    for(var j=0; j<3; ++j) {
      pos[j] = positions[f[j]];
    }

    var d01 = new Array(3);
    var d21 = new Array(3);
    for(var j=0; j<3; ++j) {
      d01[j] = pos[1][j] - pos[0][j];
      d21[j] = pos[2][j] - pos[0][j];
    }

    var n = new Array(3);
    var l = 0.0;
    for(var j=0; j<3; ++j) {
      var u = (j+1)%3;
      var v = (j+2)%3;
      n[j] = d01[u] * d21[v] - d01[v] * d21[u];
      l += n[j] * n[j];
    }
    if(l > EPSILON) {
      l = 1.0 / Math.sqrt(l);
    } else {
      l = 0.0;
    }
    for(var j=0; j<3; ++j) {
      n[j] *= l;
    }
    normals[i] = n;
  }
  return normals;
}



},{}]},{},[5]);

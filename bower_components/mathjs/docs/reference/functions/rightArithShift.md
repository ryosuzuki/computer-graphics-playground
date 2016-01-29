# Function rightArithShift

Bitwise right arithmetic shift of a value x by y number of bits, `x >> y`.
For matrices, the function is evaluated element wise.
For units, the function is evaluated on the best prefix base.


## Syntax

```js
math.rightArithShift(x, y)
```

### Parameters

Parameter | Type | Description
--------- | ---- | -----------
`x` | number &#124; BigNumber &#124; Array &#124; Matrix | Value to be shifted
`y` | number &#124; BigNumber | Amount of shifts

### Returns

Type | Description
---- | -----------
number &#124; BigNumber &#124; Array &#124; Matrix | `x` sign-filled shifted right `y` times


## Examples

```js
math.rightArithShift(4, 2);               // returns number 1

math.rightArithShift([16, -32, 64], 4);   // returns Array [1, -2, 3]
```


## See also

[bitAnd](bitAnd.md),
[bitNot](bitNot.md),
[bitOr](bitOr.md),
[bitXor](bitXor.md),
[rightArithShift](rightArithShift.md),
[rightLogShift](rightLogShift.md)


<!-- Note: This file is automatically generated from source code comments. Changes made in this file will be overridden. -->
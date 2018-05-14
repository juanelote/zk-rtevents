# zk-rtevents

Did this because there wasn't any library that handled real-time events for ZK devices.

Uses TCP for communication and should work on ZEM600 or lower devices. 

**WARNING:** This is just a test library, it doesn't have all the features that other libraries have and only provides basic support for real-time events. **Use at your own risk!**

## Usage

```js
var zk = require("./lib/ZKRTEvents")();

zk.connect("10.0.0.12", 4370)
.on("connected", function()
{
    console.log("Connected!");

    zk.enableEvents();
})
.on("disconnected", function()
{
    console.log("Disconnected!");
})
.on("transaction", function(data)
{
    console.log(data);
})
.on("error", function(error)
{
    console.log("Whoops, error found:", error);
});
```

## Methods

| Method              | Description |
| ------------------- | ----------- | 
| connect(callback)   | Connect to ZK device. |
| disconnect()        | Disconnect from ZK device. |
| enableEvents()      | Enable Real-time events on the ZK device. |
| unlockDoor(seconds) | Unlock door for _n_ seconds. |

## Events

| Event        | Description |
| ------------ | ----------- | 
| connected    | Connected to ZK device. |
| disconnected | Disconnected from ZK device.  |
| transaction  | Real-time event transaction. Returns a JSON with the following data: ```{ enrollNumber, attState, verifyMethod, year, month, day, hours, minutes, seconds }```|
| error        | Error handling. |

## Inspiration

php_zklib: https://github.com/dnaextrim/php_zklib

js_zklib: https://github.com/bulentv/js_zklib

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

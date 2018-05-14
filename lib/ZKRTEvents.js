var net    = require("net");
var events = require("events");

function ZKRTEvents()
{
    // Si esta no es una instancia de ZKRTEvents. Crearla.
    if(!(this instanceof ZKRTEvents))
        return new ZKRTEvents();

    this.USHORT_SIZE = 0xffff;
    // Comandos del protocolo.
    this.commands =
    {
        // Comandos generales.
        CONNECT:        0x03e8,
        DISCONNECT:     0x03e9,
        ENABLE_DEVICE:  0x03ea,
        DISABLE_DEVICE: 0x03eb,
        UNLOCK_DOOR:    0x001f,
        ENABLE_EVENTS:  0x01f4,
        // Comandos de respuesta.
        ACK_OK:         0x07d0,
        ACK_ERROR:      0x07d1
    };
    // Eventos en tiempo real.
    this.events =
    {
        TRANSACTION: 0x0001,
        ALL:         0xffff
    };
    // Estado de atendencia. (Al realizar una transacción)
    this.attState =
    {
        CHECK_IN:  0x00,
        CHECK_OUT: 0x01,
        BREAK_OUT: 0x02,
        BREAK_IN:  0x03,
        OT_IN:     0x04,
        OT_OUT:    0x05
    };
    // Método de verificación.
    this.verifyMethod =
    {
        PASSWORD:    0x00,
        FINGERPRINT: 0x01,
        FACE:        0x0F
    };
    // Control de paquetes.
    this.sessionID = 0x00;
    this.replyID = 0x00;
    this.packetList = {};
    // Socket de cliente.
    this.clientSocket = null;
    // Emisor de eventos.
    events.call(this);
}

ZKRTEvents.prototype.unlockDoor = function(secs)
{
    var buffer = new Buffer(4);

    buffer.writeUInt16LE(secs, 0);
    // Éste debería ser el machineID para comunicación RS232 pero en TCP no aplica.
    buffer.writeUInt16LE(0, 2);

    this.send(this.commands.UNLOCK_DOOR, buffer, function()
    {
        console.log("Door opened!");
    });

    return this;
}

ZKRTEvents.prototype.enableEvents = function()
{
    var buffer = new Buffer(4);
    // Habilitar todos los eventos y emitir eventos individualmente.
    buffer.writeUInt16LE(this.events.ALL, 0);
    // Éste debería ser el machineID para comunicación RS232 pero en TCP no aplica.
    buffer.writeUInt16LE(0, 2);

    this.send(this.commands.ENABLE_EVENTS, buffer, function()
    {
        console.log("Real time events enabled!");
    });

    return this;
}

ZKRTEvents.prototype.connect = function(address, port, callback)
{
    var self = this;

    self.clientSocket = new net.Socket();
    self.clientSocket.setTimeout(3000);
    self.clientSocket.connect(port, address, function()
    {
        self.send(self.commands.CONNECT, new Buffer([]), function(response)
        {
            // Asignar valor de sessionID del dispositivo.
            self.sessionID = response.session_id;

            if(typeof callback == "function")
                callback();

            self.emit("connected");
        });
    });
    self.clientSocket.on("data", function(data)
    {
        self.read(data);
    });
    self.clientSocket.on("error", function(error)
    {
        // Asegurarse que el socket esté completamente destruído.
        self.clientSocket.destroy();
        self.emit("error", error);
    });

    return this;
};

ZKRTEvents.prototype.disconnect = function()
{
    var self = this;

    self.send(self.commands.DISCONNECT, new Buffer([]), function()
    {
        // Cerrar socket
        self.clientSocket.end();
        self.emit("disconnected");
    });

    return this;
}

ZKRTEvents.prototype.checksum = function(buffer)
{
    var checksum = 0;

    for(var i = 0, bufferSize = buffer.length; i < bufferSize; i += 2)
        checksum += ((i == buffer.length-1) ? buffer[i] : buffer.readUInt16LE(i)) % this.USHORT_SIZE;

    return this.USHORT_SIZE - checksum;
};

ZKRTEvents.prototype.send = function(command, data, callback)
{
    var packetBuffer = new Buffer(16 + data.length);
    var dataBuffer = new Buffer(8  + data.length);
    // Si se está conectando con el dispositivo o respondiendo un evento en tiempo real el replyID tendrá siempre un valor 0
    this.replyID = (command == this.commands.CONNECT || command == this.commands.ACK_OK) ? 0 : (this.replyID + 1) % this.USHORT_SIZE;
    // Procolo TCP de ZK. (?)
    packetBuffer.write("5050827d", 0, "hex");
    // Tamaño de data.
    packetBuffer.writeUInt32LE(dataBuffer.length, 4);
    // 2bytes de command + 2bytes de checksum (inicialmente con valor 0) + 2bytes del sessionID + 2bytes de replyID + (n)bytes de data.
    dataBuffer.writeUInt16LE(command, 0);
    dataBuffer.writeUInt16LE(0, 2);
    dataBuffer.writeUInt16LE(this.sessionID, 4);
    dataBuffer.writeUInt16LE(this.replyID, 6);
    data.copy(dataBuffer, 8);
    dataBuffer.writeUInt16LE(this.checksum(dataBuffer), 2);
    dataBuffer.copy(packetBuffer, 8);

    this.clientSocket.write(packetBuffer);
    this.packetList[this.replyID] = { packet: packetBuffer, callback: callback };
};

ZKRTEvents.prototype.read = function(buffer)
{
    var packet =
    {
        command:    buffer.readUInt16LE(8),
        checksum:   buffer.readUInt16LE(10),
        session_id: buffer.readUInt16LE(12),
        reply_id:   buffer.readUInt16LE(14),
        data:       buffer.slice(16)
    };

    switch(packet.command)
    {
        case this.commands.ACK_OK:
            if(typeof this.packetList[packet.reply_id].callback == "function")
                this.packetList[packet.reply_id].callback(packet);

            break;
        case this.commands.ENABLE_EVENTS:
            this.parseEvent(packet);

            break;
        case this.commands.ACK_ERROR:
            // Reintentar enviar packet.
            // this.clientSocket.write(this.packetList[packet.reply_id]);
            this.emit("error",
            {
                code: "PACKETSENDERR",
                message: "Packet send error.",
                packet: this.packetList[packet.reply_id]
            });

            break;
        default:
            this.emit("error",
            {
                code: "PACKETTYPEUNK",
                message: "Unknown packet type.",
                packet: packet
            });
    }
};

ZKRTEvents.prototype.parseEvent = function(packet)
{
    switch(packet.session_id)
    {
        case this.events.TRANSACTION:
            var data =
            {
                enrollNumber: packet.data.toString("ascii", 0, 16).replace(/\u0000/g, ""),
                attState:     packet.data.readUInt8(24),
                verifyMethod: packet.data.readUInt8(25),
                year:         packet.data.readUInt8(26) + 2000,
                month:        packet.data.readUInt8(27),
                day:          packet.data.readUInt8(28),
                hours:        packet.data.readUInt8(29),
                minutes:      packet.data.readUInt8(30),
                seconds:      packet.data.readUInt8(31)
            };

            this.emit("transaction", data);

            break;
    }
};

ZKRTEvents.prototype.__proto__ = events.prototype;

module.exports = ZKRTEvents;

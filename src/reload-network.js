import dgram from 'socket:dgram'
import Buffer from 'socket:buffer'
import { Xfer, recvBuff, sendBuff, PACKET_TYPE_SEND_START, peekPacket } from './dgram_xfer.js'

export const reloadServer = async (address, port, opts) => {
  return new Promise((resolve, reject) => {
  var con = new DgramConnection(address, port, opts)
    con.listen((e) => {
      if (e) {
        return reject(e)
      }
      resolve(con)
    })
  })
}

export const reloadClient = async (address, port, opts) => {
  return new Promise((resolve, reject) => {
  var con = new DgramConnection(address, port, opts)
    con.connect((e) => {
      if (e) {
        return reject(e)
      }
      resolve(con)
    })
  })
}

class DgramConnection {
  constructor (address, port, opts) {
    this.address = address
    this.port = port
    this.listening = false
    this.log = opts.log || this.log
    this.type = opts.type || 'udp4'
    this.clients = {}
    this.transfers = []
  }

  async listen(cb) {
    this.socket = await dgram.createSocket('udp4').bind(this.port, this.address, cb)
    this.socket.on('message', async (data, {port, address}) => { 
      this.serverMesssage(data, {port, address}) }
    )
    this.listening = true
  }

  async connect(cb) {
    // this.socket = dgram.createSocket('udp4', cb)
    this.socket = await dgram.createSocket('udp4').bind(0, cb)
    await this.socket.on('message', async (data, {port, address}) => { this.clientMessage (data, {port, address}) })
    await this.send("SUB")
  }

  async serverMesssage (data, {port, address}) {
    await this.addClient(data, {port, address})
  }

  async sendBuffer(buffer, clients) {
    if (!clients) clients = this.clients

    this.log(`sending buffer to ${JSON.stringify(this.clients)}`)

    Object.keys(clients).forEach((clientKey) => {
      sendBuff(this.socket, clients[clientKey].address, this.clients[clientKey].port, buffer, null, null, { log: this.log })
        .then(xfer => this.transfers.push(xfer))
    })
  }

  async clientMessage(data, {port, address}) {
    // await this.addClient(data, {port, address})

    if (peekPacket(data) === PACKET_TYPE_SEND_START) {
      this.log(`server initiating connection`)
    }
  }

  async addClient(message, {port, address}) {
    let clientKey = `${address}:${port}`
    if (!this.clients[clientKey] && Buffer.from(message).toString() === 'SUB') {
      this.clients[clientKey] = {
        port, address, ts: new Date().getTime(), state: ''
      }
      this.log(`client connected: ${JSON.stringify(this.clients[clientKey])}`)
    }
  }

  async send(data, ...args) {
    try {
      if (!this.listening) args = [this.port, this.address, ...args]
      await this.socket.send(data, ...args)
    } catch (err) {
      return err
    }
  }

  async disconnect() {
    if (this.listening) {
      try {
        await this.socket.close()
      } catch (e) {
        this.log(`server close failed: ${e.message + '\n' + e.stack}`)
      }
      
      try {
        await this.socket.disconnect()
      } catch (e) {
        this.log(`server disconnect failed: ${e.message + '\n' + e.stack}`)
      }
    } else {
      await this.socket.disconnect()
    }
  }
}
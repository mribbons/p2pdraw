import dgram from 'socket:dgram'

export default class NetTest {
  constructor (address, port, _log) {
    this.address = address
    this.port = port
    this.listening = false
    this.log = _log || log
  }

  async listen(cb) {
    this.socket = dgram.createSocket('udp4').bind(this.port, this.address, cb)
    this.listening = true
  }

  async connect(cb, messagecb) {
    // this.socket = dgram.createSocket('udp4', cb)
    this.socket = dgram.createSocket('udp4').bind(0, cb)
    // let err = await this.socket.connect(this.port, this.address, messagecb)
    // cb(err)

    //   (err) => {
    //   if (err) return err

    //   this.socket.once('message', cb)
    // })
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
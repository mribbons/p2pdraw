import fs from 'socket:fs/promises'

import { Peer } from 'socket:peer'
import { randomBytes } from 'socket:crypto'
import process from 'socket:process'
import Buffer from 'socket:buffer'
import Path from 'socket:path'
// import fs from 'socket:fs'

const makeId = async () => {
  // return (await sha256(randomBytes(32))).toString('hex')
  return (await Peer.createClusterId())
}

window.onload = async () => {
  window.addEventListener("keyup", (event) => {
    if (event.isComposing) {
      return;
    }

    if (event.key === 'c') connect();

    
    // do something
  });

  var home = Path.dirname(process.argv[0]);
  console.log(`process: ${JSON.stringify(process)}`);
  console.log(`home: ${home}`);
  connect();
}

// test port hardcoded

const connect = async() => {
  try {
    const clusterId = '1bf4140ffd12900e23aa6419b121713e898c58079b6565ab52b35e88a3b0729b'; // await makeId()
    const keys = await Peer.createKeys()
    let previousId = ''
    // const publicKeyHex = await makeId()
    // const privateKeyHex = await makeId()

    var home = process.env.HOME || process.env.HOMEDIR || process.homedir();

    // var home = Path.dirname(process.argv[0]);
    var suffix = ""
    if (process.argv.find((v) => { return v === '--from-ssc' }))
    {
      suffix = "_ssc"
    }

    const pathname = `${home}/p2pdraw${suffix}.json`;
    console.log(`config path: ${pathname}`);
    let save_config = true
    try {
      let data = JSON.parse(await fs.readFile(pathname))
      keys.publicKey = Buffer.from(data.publicKey, 'hex').buffer
      keys.privateKey = Buffer.from(data.privateKey, 'hex').buffer
      save_config = false
      console.log(`read config: ${pathname}`)
    } catch {

    }

    if (save_config) {
      console.log(`saved config: ${pathname}`)
      let data = {}
      // data.publicKey = Buffer.from(keys.publicKey, 'hex').buffer;
      data.publicKey = Buffer.from(keys.publicKey).toString('hex');
      data.privateKey = Buffer.from(keys.privateKey).toString('hex');
      fs.writeFile(pathname, JSON.stringify(data));
    }

    console.log(`clusterId: ${clusterId}`);
    console.log(`keys: ${JSON.stringify(keys)}`)
    const publicKey = Buffer.from(keys.publicKey).toString('hex')
    const privateKey = Buffer.from(keys.privateKey).toString('hex')

    // const publicKey = Buffer.from(publicKeyHex, 'hex').buffer
    // const privateKey = Buffer.from(privateKeyHex, 'hex').buffer

    // let peerId = await makeId()
    let peerId = publicKey;
    // peerId = "666333" + peerId.substring(-6);

    const peer = new Peer({ peerId, ...keys, clusterId })
    window.peer = peer
    console.log('created peer')

    const canvas = document.getElementsByTagName('canvas')[0]
    if (!canvas) {
      console.log(`unable to get canvas...`);
      return;
    }

    const context = canvas.getContext('2d')

    const setSize = () => {
      canvas.width = window.innerWidth - 30
      canvas.height = window.innerHeight - 30
    }

    setSize()
    window.addEventListener('resize', setSize)

    let isDrawing = false
    let x = 0
    let y = 0

    function drawLine(context, color, x1, y1, x2, y2) {
      context.beginPath()
      context.strokeStyle = color
      context.lineWidth = 1
      context.moveTo(x1, y1)
      context.lineTo(x2, y2)
      context.stroke()
      context.closePath()
    }

    const network = await peer.join()
    console.log(`joining...`);
    console.log(`join returned: ${network.peerId}`);
    const connect_time = new Date().getTime();

    const getOffset = e => {
      if (e.offsetX) return { offsetX: e.offsetX, offsetY: e.offsetY }
      if (!e.targetTouches[0]) return { offsetX: 0, offsetY: 0 }

      const rect = e.target.getBoundingClientRect()

      return {
        offsetX: e.changedTouches[0]?.pageX - rect.left,
        offsetY: e.changedTouches[0]?.pageY - rect.top
      }
    }

    const penDown = e => {
      isDrawing = true
      const o = getOffset(e)
      x = o.offsetX
      y = o.offsetY
    }

    const penUp = e => {
      if (!isDrawing) return
      const o = getOffset(e)
      if (o.offsetX <= 0) return
      if (o.offsetY <= 0) return

      drawLine(context, 'black', x, y, o.offsetX, o.offsetY)
      x = o.offsetX
      y = o.offsetY
      isDrawing = false
    }

    const penMove = e => {
      if (!isDrawing) return
      const o = getOffset(e)
      drawLine(context, 'black', x, y, o.offsetX, o.offsetY)
      const value = { x1: x, y1: y, x2: o.offsetX, y2: o.offsetY }
      const data = new Buffer.from(JSON.stringify(value))

      if (o.offsetX > 0) x = o.offsetX
      if (o.offsetY > 0) y = o.offsetY

      sendData(data);
    }    

    const sendData = async data => {
      const packetOpts = {
        previousId: previousId,
        clusterId: clusterId,
        // to: publicKey,
        to: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        message: {
          peerId: publicKey,
          content: data,
          ts: Date.now()
        }
      }

      console.log(`send data: ${JSON.stringify(packetOpts)}`);
      // cache packets locally
      
      const packets = await network.publish(packetOpts)
      packets.forEach(p => 
        {
          previousId = p.packetId
        })
    }

    canvas.addEventListener('touchstart', penDown)
    canvas.addEventListener('mousedown', penDown)

    canvas.addEventListener('touchend', penUp)
    canvas.addEventListener('mouseup', penUp)

    canvas.addEventListener('touchmove', penMove)
    canvas.addEventListener('mousemove', penMove)

    network.onConnect = (...args) => {
      console.log(network.peerId, network.address, network.port, 'CONNECT', ...args)
    }

    network.onPacket = async (packet, port, address) => {
      const message = JSON.parse(packet.message)
      console.log(`onPacket, timestamp: ${message.ts}`);
    //   console.log(`on packet: ${address}: ${JSON.stringify(packet)}`)
    //   // data = Buffer.from(packet.message.content).toString()
    //   // console.log(`data: ${data}`);
    //   console.log(`content: ${packet.message.content}`)
    //   const message = JSON.parse(packet.message)
      const data = Buffer.from(message.content).toString()

      // draw the line to distinguish if 
      // a) we're getting an event of our own packets at a reliable rate (so they are being recorded) 
      // b) this event ever fires for external packets
      var color = packet.message.peerId == peerId ? 'green' : 'blue';

      try {
        const { x1, y1, x2, y2 } = JSON.parse(data)
        drawLine(context, color, x1+3, y1+3, x2+3, y2+3)
      } catch (err) {
        console.log(err)
      }
    }

    network.onData = (packet, port, address, data1) => {

      if (packet.clusterId != clusterId)
        return

      if (packet.message.peerId == peerId && packet.message.ts > connect_time) {
        console.log(`ignoring new message from self: ${new DateTime(packet.timestamp.message.ts).toISOString()}`)
        return
      }

      let packetdate = `Invalid: ${packet.message.ts || packet.timestamp}`;
      try {
        packetdate = new Date(packet.message.ts || packet.timestamp).toISOString()
      } catch {}

      console.log(`onData: ${JSON.stringify(packet)} (${packetdate})`)
      // console.log(`from: ${address}, data: ${JSON.stringify(data)}`)
      // if (packet.type) return

      // console.log(`peers: ${network.peers.length}`)
      // const dataJson = Buffer.from(data).toString()
      // console.log(`data json: ${dataJson}`)
      // const data3 = JSON.parse(dataJson)
      // console.log(`data 3: ${JSON.stringify(data3)}`)

      // const message = JSON.parse(packet.message)
      try {
        if (!packet.message.content) {
          console.log(`packet without content: ${JSON.stringify(packet)} (${packetdate})`)
        } else {
          const data = Buffer.from(packet.message.content).toString()
          console.log(`data: ${JSON.stringify(data)}`)
          const { x1, y1, x2, y2 } = JSON.parse(data)
          drawLine(context, 'red', x1, y1, x2, y2)
        }
      } catch (err) {
        console.log(err)
      }
    }

    window.onunload = async () => {
      network.close()
    }
  } catch (e) {
    console.log(e);
  }
}
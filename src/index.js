import { Peer } from 'socket:peer'
import { randomBytes } from 'socket:crypto'
import process from 'socket:process'
import Buffer from 'socket:buffer'
import fs from 'socket:fs'

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
}

// test port hardcoded

const connect = async() => {
  try {
    const clusterId = '0bf4140ffd12900e23aa6419b121713e898c58079b6565ab52b35e88a3b0729b'; // await makeId()
    const keys = await Peer.createKeys()
    // const publicKeyHex = await makeId()
    // const privateKeyHex = await makeId()

    console.log(`clusterId: ${clusterId}`);
    console.log(`keys: ${JSON.stringify(keys)}`)

    // const publicKey = Buffer.from(publicKeyHex, 'hex').buffer
    // const privateKey = Buffer.from(privateKeyHex, 'hex').buffer

    let peerId = await makeId()
    peerId = "666333" + peerId.substring(-6);

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
      canvas.width = document.body.offsetWidth
      canvas.height = document.body.offsetHeight
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
    console.log('join returned...');

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

      for (const remotePeer of network.peers) {
        //
        // only send this to peers in my cluster because they are the
        // only peers who will know who to accept this kind of message.
        //
        console.log(`remote peer: ${remotePeer.peerId}`);
        if (remotePeer.clusterId !== clusterId && remotePeer.peerId.substring(0,6) !== peerId.substring(0,6)) continue
        network.send(data, remotePeer.port, remotePeer.address)
      }
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

    network.onData = (packet, port, address, data) => {
      if (packet.type) return

      console.log(`peers: ${network.peers.length}`)

      try {
        const { x1, y1, x2, y2 } = JSON.parse(data)
        drawLine(context, 'red', x1, y1, x2, y2)
      } catch (err) {
        // console.error(err)
      }
    }

    window.onunload = async () => {
      network.close()
    }
  } catch (e) {
    console.log(e);
  }
}
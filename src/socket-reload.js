/* 

Socket Reload Module
v2:
  supports keyboard mode by default

v2.1:
  fix linux and mac support (find app path)
  call application.backend.close()

Todo:
  Only works on desktop, there needs to be a way to tell mobile apps to update, and they should also pull assets from an http server

usage:

import enableSocketReload from './reload.js'

// method 1 - manual refresh using ctrl+r, cmd+r, F5
window.addEventListener('load', async () => {
  enableSocketReload({startDir: process.cwd()})
  // optionally implement a custom callback, you can use this to call custom cleanup code. defaults to window.location.reload()
  updateCallback: () => { window.location.reload() } 
})

// method 2 - live reload
window.addEventListener('load', async () => {
    enableSocketReload({startDir: process.cwd(),
    liveReload: true,
    scanInterval: 200, // how often to check for changes
    debounce: 1000, // how long to wait before calling updateCallback
    debounceCallback: () => { // This gets called when debounce is set (changes detected but updateCallback not called)
      _log(`updates inbound...`);
    },
    // optionally implement a custom callback, called after debounce has elapsed
    updateCallback: () => {
      window.location.reload()
    }
  })
})

*/

import fs from 'socket:fs/promises'
import process from 'socket:process'
import Buffer from 'socket:buffer'
import Path from 'socket:path'
import application from 'socket:application'
import os from 'socket:os'

let enabled = false
let _interval = null
let _lastUpdate = 0
let scanInterval = 500
let _opts = {}

let _copyPath = undefined
let _debounce_handle = null;
let _log = console.log

const recursePath = async(path, file_fn, data) => {
  for (const entry of (await fs.readdir(path, {withFileTypes: true}))) {
    let entry_path = Path.join(path, entry.name)
    if (entry.isDirectory()) {
      await recursePath(entry_path, file_fn, data)
    } else {
      await file_fn(entry_path, data)
    }
  }
}

const enableSocketReload = async (opts = {}) => {
  if (opts.enable === undefined) {
    opts.enable = true
  }

  if (opts.log) {
    _log = opts.log
  }

  if (opts.enable) {
    if (!opts.startDir) {
      throw "startDir must be defined to monitor for file changes."
    }
  }

  if (opts.liveReload === undefined) {
    opts.liveReload = false
  }

  _log(`liveReload: ${opts.liveReload}`)

  _opts = opts;

  if (enabled === opts.enable)
    return

  if (opts.enable) {
    _log(`platform: ${os.platform()}`)
    let osParent = '' // define os specific parent path
    os.platform() === 'darwin' && (osParent = '../')
    os.platform() === 'linux' && (osParent = '../')
    let parentPath = Path.join(_opts.startDir, `${osParent}../../../..`);
    _log(`ini path: ${`${parentPath}/socket.ini`}`)
    let ini = parseIni(Buffer.from(await fs.readFile(`${parentPath}/socket.ini`)).toString())
    let _appBasePath = Path.join(process.cwd(), `${parentPath}/../`).replaceAll('\\\\', '\\')
    _copyPath = Path.join(_appBasePath, ini['build']['copy'].replaceAll('"', ''))

    _log(`enableSocketReload: ${opts.enable}, _path: ${_copyPath} => ${_opts.startDir}`)
    
    if (opts.debounce === undefined) {
      opts.debounce = -1
    }

    if (opts.scanInterval === undefined) {
      opts.scanInterval = scanInterval;
    }

    if (!opts.updateCallback) {
      opts.updateCallback = () => { window.location.reload() }
    }

    window.addEventListener("keydown", (event) => {
      if(((event.ctrlKey || event.metaKey) && event.key === 'r') || event.key === 'F5') {
        event.preventDefault()
        startReload()
      }
    })

    if (opts.liveReload) {
      _interval = setInterval(checkRefresh, opts.scanInterval)
    }
    enabled = true
  } else {
    clearInterval(_interval)
    enabled = false;
  }
}

const parseIni = (iniString) => {
  const lines = iniString.split('\n')
  let section = '#top'
  const map = {}

  lines.forEach(line => {
    if (line[line.length - 1] === '\r') {
      line = line.substring(0, line.length - 1)
    }
    if (line.length === 0) {
      // ignore empty line
    } else if (line[0] === ';') {
      // ignore comments
    } else if (line[0] === '[' && line[line.length - 1] === ']') {
      section = `${line.substring(1, line.length - 1)}`
      if (map[section] === undefined) {
        map[section] = {}
      }
    } else {
      let [key, val] = line.split('=')
      key = key.trim()
      map[section][key] = val
    }
  })

  return map
}

const reload = async () => {
  await sscBuildOutput(_opts.startDir)
  await _opts.updateCallback()
  await application.backend.close()  
}

const startReload = async () => {
  // provide warning via debounce to give app a chance to clear resources
  if (_opts.debounce > -1) {
    if (_opts.debounceCallback) {
      await _opts.debounceCallback();
      setTimeout(reload, _opts.debounce);
    }
  }
}

const sscBuildOutput = async (dest) => {
  let recurseData = {
    dest: dest,
    base: _copyPath,
    changed: false,
  }

  await recursePath(_copyPath, async (file, data) => {
    let dest_path = file.replace(data.base, data.dest)
    let update = false
    let exists = false
    try {
      exists = await fs.access(dest_path) // todo(mribbons) fs.access should not throw exception
    } catch {
      // _log(`dest doesn't exist: ${dest_path}`);
    }

    let stat1 = await fs.stat(file);
    if (exists) {
      let stat2 = await fs.stat(dest_path);

      if (stat1.mtimeMs > stat2.mtimeMs || stat1.size !== stat2.size) {
        // _log(`update ${file}: ${stat1.mtimeMs} > ${stat2.mtimeMs}`)
        update = true;
      }
      //  else {
      //   _log(`ok ${file}: ${stat1.mtimeMs} <= ${stat2.mtimeMs}`)
      // }
    } else {
      // _log(`not in dest ${file} => ${dest_path}`)
      update = true
    }
    
    if (update) {
      // todo(@mribbons): fs.mkdir(dirname(dest_path)) - dirname / drive letter issue on win32
      // _log(`copy file: ${file} -> ${dest_path}`)
      // todo(@mribbons) - copyFile and utimes are noops. Without utimes we can't check times are even, only newer, which isn't great
      // await fs.copyFile(file, dest_path)
      // await fs.utimes(dest_path, parseInt(stat1.mtimeMs), parseInt(stat1.mtimeMs))
      await fs.writeFile(dest_path, await fs.readFile(file));
      data.changed = true
    }
  }, recurseData)

  // _log(`recurse data changed: ${recurseData.changed}`)
  return recurseData.changed
}

const checkRefresh = async () => {
  try {
    if (await sscBuildOutput(_opts.startDir)) {
      if (_opts.debounce > -1) {
        clearTimeout(_debounce_handle)
        // if debounce wait to update, other updates will reset update timeout
        setTimeout(async () => {
            await _opts.updateCallback()
            await application.backend.close()
          }, _opts.debounce)
        
        // Let consumer know that an update is coming
        if (_opts.debounceCallback) {
          await _opts.debounceCallback();
        }
      } else {
        await _opts.updateCallback()
        await application.backend.close()
      }
    }
  } catch (e) {
    _log(e)
  }
}

export default enableSocketReload
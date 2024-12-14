<script setup lang="ts">
import {ref, onMounted, onUnmounted, computed, shallowRef, onBeforeUnmount} from 'vue'
import type {Ref} from 'vue'
import Guacamole from 'guacamole-common-js'
import {encryptToken} from './utils'
import {useFullscreen, useResizeObserver, useStorage, useThrottleFn} from '@vueuse/core'
import _merge from 'lodash/merge'

const containerRef: Ref<HTMLDivElement | null> = ref(null)
const clientRef: Ref<Guacamole.Client | null> = shallowRef(null)

const getClientHW = () => {
  let pixelDensity = 1 // window.devicePixelRatio || 1
  const winWidth = rootRef.value.clientWidth * pixelDensity
  const winHeight = rootRef.value.clientHeight * pixelDensity
  return {
    width: winWidth,
    height: winHeight,
  }
}

const isShowControl = ref(true)
const isLoading = ref(false)

const connectionConfig = useStorage(
  'guac_ccc',
  JSON.stringify(
    {
      type: 'vnc',
      settings: {
        hostname: '172.18.0.2',
        port: '5901',
        password: 'Demo.password',
        'ignore-cert': true,
        'resize-method': 'display-update',
        'disable-paste': false,
      },
    },
    null,
    2,
  ),
)

const connect = async () => {
  try {
    const tunnel = new Guacamole.WebSocketTunnel('ws://localhost:8080/')
    const client = new Guacamole.Client(tunnel)
    console.log(client)

    const display = client.getDisplay()
    const displayElement = display.getElement()
    if (containerRef.value) containerRef.value.appendChild(displayElement)

    const {width, height} = getClientHW()
    let config = JSON.parse(connectionConfig.value)

    config = _merge(config, {
      settings: {
        width,
        height,
      },
    })
    console.log('[connection config]', config)

    const token = await encryptToken(
      {
        // https://github.com/vadimpronin/guacamole-lite/blob/master/examples/advanced_configuration.js

        // connection: {
        //   type: 'rdp',
        //   settings: {
        //     hostname: '192.168.56.13',
        //     username: 'user',
        //     password: 'Hyper-V',
        //     'enable-drive': true,
        //     'create-drive-path': true,
        //     security: 'any',
        //     'ignore-cert': true,
        //     'enable-wallpaper': true,
        //     width,
        //     height,
        //   },
        // },

        // connection: {
        //   type: 'vnc',
        //   settings: {
        //     hostname: '172.18.0.2',
        //     port: '5901',
        //     password: 'Demo.password',
        //     'ignore-cert': true,
        //     'resize-method': 'display-update',
        //     'disable-paste': false,
        //     width,
        //     height,
        //   },
        // },

        connection: config,
      },
      'MySuperSecretKeyForParamsToken12',
    )

    const displayMouse = new Guacamole.Mouse(displayElement)
    displayMouse.onmousedown =
      displayMouse.onmouseup =
        displayMouse.onmousemove =
          (mouseState) => {
            // client.getDisplay().showCursor(false)
            // 处理鼠标坐标缩放
            const scale = display.getScale()

            const scaledState = new Guacamole.Mouse.State(
              mouseState.x / scale,
              mouseState.y / scale,
              mouseState.left,
              mouseState.middle,
              mouseState.right,
              mouseState.up,
              mouseState.down,
            )
            client.sendMouseState(scaledState)
          }

    if (containerRef.value) containerRef.value.focus()

    const keyboard = new Guacamole.Keyboard(containerRef.value!)
    keyboard.onkeydown = (keysym) => client.sendKeyEvent(1, keysym)
    keyboard.onkeyup = (keysym) => client.sendKeyEvent(0, keysym)

    client.onerror = (error) => {
      console.error('onerror', error)
    }
    client.onjoin = (state) => {
      console.info('onjoin', state)
    }
    client.onleave = (state) => {
      console.info('onleave', state)
    }
    client.onmsg = (state) => {
      console.info('onmsg', state)
    }

    //当远程客户端的剪贴板更改时触发
    client.onclipboard = (stream, mimetype) => {
      console.info('onclipboard', stream, mimetype)
      if (/^text\//.test(mimetype)) {
        const stringReader = new Guacamole.StringReader(stream)
        let res = ''
        stringReader.ontext = function ontext(text) {
          res += text
        }
        stringReader.onend = function () {
          // console.log(res)
          inputText.value = res
        }
      }
    }

    client.onstatechange = (state) => {
      console.log('onstatechange', state, Guacamole.Client.State)
      switch (state) {
        case Guacamole.Client.State.CONNECTING:
          isLoading.value = true
          break
        case Guacamole.Client.State.CONNECTED:
          isLoading.value = false
          setTimeout(() => {
            resize(true)
            isShowControl.value = false
          }, 100)
          break
        case Guacamole.Client.State.DISCONNECTING:
          isLoading.value = true
          break
        case Guacamole.Client.State.DISCONNECTED:
          isLoading.value = false
          isShowControl.value = true
          break
        case Guacamole.Client.State.IDLE:
          isLoading.value = false
          break
        case Guacamole.Client.State.WAITING:
          isLoading.value = true
          break
        case Guacamole.Client.State.ERROR:
          isLoading.value = false
          isShowControl.value = true
          break
        default:
      }
    }

    // https://guacamole.apache.org/doc/gug/guacamole-common-js.html
    // https://github.dev/jumpserver/lion
    // 文件上传 https://github.dev/unixhot/opsany-bastion/tree/f84e9a1aa567f9bf6e50939d761d8ec2e26915fb

    client.connect(`token=${token}`)
    clientRef.value = client
  } catch (error) {
    console.error(error)
    isLoading.value = false
  }
}

onMounted(() => {
  // connect()
})

const disconnect = () => {
  if (clientRef.value) {
    clientRef.value.disconnect()
    const displayElement = clientRef.value.getDisplay().getElement()
    displayElement.parentNode.removeChild(displayElement)
    clientRef.value = null
  }
}

onBeforeUnmount(() => {
  disconnect()
})

const inputText = ref('')
const sendTextToServer = () => {
  const data = inputText.value
  if (clientRef.value && data) {
    const stream = clientRef.value.createClipboardStream('text/plain')
    const writer = new Guacamole.StringWriter(stream)

    writer.sendText(data)
    writer.sendEnd()
  }
}

const resize = useThrottleFn(
  (force = false) => {
    if (clientRef.value) {
      const client = clientRef.value
      const display = client.getDisplay()
      const width = display.getWidth()
      const height = display.getHeight()

      const {width: winWidth, height: winHeight} = getClientHW()

      const scaleW = winWidth / width
      const scaleH = winHeight / height

      const scale = Math.min(scaleW, scaleH)
      if (!scale) {
        return
      }

      if (force || width !== winWidth || height !== winHeight) {
        console.log('trigger resize', {width, height, winWidth, winHeight})
        client.sendSize(winWidth, winHeight)
        client.getDisplay().scale(scale)
      }
    }
  },
  300,
  true,
)

const rootRef = ref()
useResizeObserver(rootRef, (entries) => {
  // const entry = entries[0]
  // const { width, height } = entry.contentRect
  resize()
})

const {isFullscreen, toggle: toggleFullscreen} = useFullscreen(rootRef)
</script>

<template>
  <div ref="rootRef" class="guacamole-web-client">
    <div v-if="isLoading">Loading...</div>
    <div
      @click="containerRef?.focus()"
      ref="containerRef"
      class="guacamole-renderer"
      tabindex="0"
    ></div>
    <div class="remote-controller font-code">
      <button class="btn-toggle-hide vp-button" @click="isShowControl = !isShowControl">
        <span v-if="isShowControl" class="mdi mdi-chevron-up">^</span>
        <span v-else class="mdi mdi-chevron-down">v</span>
      </button>

      <transition name="fade">
        <div v-show="isShowControl" class="control-content flex-row-center-gap vp-panel">
          <template v-if="clientRef">
            <textarea
              class="vp-input"
              v-model="inputText"
              placeholder="Clipboard"
              @blur="sendTextToServer"
            ></textarea>
            <button class="vp-button" @click="resize">Resize</button>
            <button class="vp-button" @click="toggleFullscreen" title="Toggle Fullscreen">
              <span v-if="isFullscreen" >X</span>
              <span v-else >[ ]</span>
            </button>

            <button title="Disconnect" class="vp-button danger" @click="disconnect">
              Disconnect
            </button>
          </template>
          <div class="not-connected" v-else>
            <textarea
              v-model="connectionConfig"
              class="vp-input"
              rows="12"
              cols="40"
              placeholder="Input JSON config"
            />
            <div class="flex-row-center-gap">
              <a
                class="btn-no-style"
                href="https://github.com/vadimpronin/guacamole-lite?tab=readme-ov-file#connecting-to-the-server"
                target="_blank"
                rel="noopener noreferrer"
              >
                ???
              </a>
              <button title="Connect" class="vp-button primary" @click="connect">
                <span class="mdi mdi-connection"></span>
                Connect
              </button>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<style lang="css" scoped>
.guacamole-web-client {
  position: relative;
  width: 100%;
  height: 100%;
  .guacamole-renderer {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;

    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;


    cursor: crosshair !important;
  }

  .remote-controller {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    display: flex;
    align-items: center;
    flex-direction: column;

    .btn-toggle-hide {
      font-size: 20px;
      line-height: 1;
      padding: 0 8px;
      width: fit-content;
      position: relative;
      z-index: 10;
    }

    .control-content {
      padding: 4px 4px;
      gap: 4px;
      margin-top: -12px;
      .vp-input {
        font-size: 12px;
      }

      .vp-button {
        padding: 2px 4px;
        display: inline-flex;
        align-items: center;
        gap: 2px;
      }
      .mdi {
        font-size: 24px;
        line-height: 1;
      }
    }

    .not-connected {
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: center;

      .vp-input {
        font-size: 12px;
      }
      .flex-row-center-gap {
        align-items: center;
      }
    }
  }
}
</style>

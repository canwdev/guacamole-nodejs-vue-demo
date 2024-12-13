<script setup lang="ts">
import {ref, onMounted, onUnmounted, computed, shallowRef, onBeforeUnmount} from 'vue'
import type {Ref} from 'vue'
import Guacamole from 'guacamole-common-js'
import {encryptToken} from "./utils.ts";

const containerRef: Ref<HTMLDivElement | null> = ref(null)
const clientRef: Ref<Guacamole.Client | null> = shallowRef(null)



const connect =async () => {
  const tunnel = new Guacamole.WebSocketTunnel('ws://localhost:8080/')
  const client = new Guacamole.Client(tunnel)
  console.log(client);
  clientRef.value = client

  const displayElement = client.getDisplay().getElement()
  if (containerRef.value) containerRef.value.appendChild(displayElement)


  const token = await encryptToken({
    // connection: {
    //   type: "rdp",
    //   settings: {
    //     "hostname": "10.0.0.12",
    //     "username": "user",
    //     "password": "Test.Password",
    //     "enable-drive": true,
    //     "create-drive-path": true,
    //     "security": "any",
    //     "ignore-cert": true,
    //     "enable-wallpaper": true
    //   }
    // }

    connection: {
      type: "vnc",
      settings: {
        hostname: '10.0.0.12',
        port: '5901',
        password: 'Test.Password',
        "ignore-cert": true,
        "resize-method": "display-update"
      },
    }
  }, 'MySuperSecretKeyForParamsToken12')
  client.connect(`token=${token}`)

  const displayMouse = new Guacamole.Mouse(displayElement)
  displayMouse.onmousedown = displayMouse.onmouseup = displayMouse.onmousemove = (mouseState) => {
    client.sendMouseState(mouseState)
  }

  if (containerRef.value) containerRef.value.focus()

  const keyboard = new Guacamole.Keyboard(containerRef.value!)
  keyboard.onkeydown = (keysym) => client.sendKeyEvent(1, keysym)
  keyboard.onkeyup = (keysym) => client.sendKeyEvent(0, keysym)

  client.onstatechange = (state) => {
    console.info('Guacamole onstatechange', state)
    if (state === Guacamole.Client.State.DISCONNECTED) {
      console.error('Guacamole disconnected')
    } else if (state === Guacamole.Client.State.ERROR) {
      console.error('Guacamole error')
    }
  }
}

onMounted(() => {
  connect()
})

onBeforeUnmount(() => {
  if (clientRef.value) {
    clientRef.value.disconnect()
    clientRef.value = null
  }
})


const inputText = ref('')
const sendTextToServer = () => {
  if (clientRef.value && inputText.value) {
    const stream = clientRef.value.createClipboardStream('text/plain')
    const writer = new Guacamole.StringWriter(stream)
    writer.sendText(inputText.value)
    writer.sendEnd()
  }
}

const resizeHandler = () => {
  if (clientRef.value && containerRef.value) {
    const displayElement = clientRef.value.getDisplay().getElement()
    const width = containerRef.value.clientWidth
    const height = containerRef.value.clientHeight

    const display = clientRef.value.getDisplay();
    const layer = display.getDefaultLayer();
    clientRef.value.getDisplay().resize(layer, width, height)
    // 可以同时调整客户端的显示大小
    display.resize(width, height);
  }
}


</script>

<template>

  <!--@click="containerRef?.focus()"-->
  <div
    ref="containerRef"
    class="guacamole-renderer"
    tabindex="0"
  >
    <div class="remote-controller">
      <!--<textarea v-model="inputText"></textarea>-->
      <!--<button :disabled="!inputText" @click="sendTextToServer">Send</button>-->
      <!--<button @click="resizeHandler">Resize</button>-->
    </div>
  </div>
</template>

<style scoped lang="css">
.guacamole-renderer {
  position: relative;
  z-index: 1;
  outline: none;
  width: 100%;
  height: 100%;
  cursor: crosshair;
  background-color: #6d6d6d;
  overflow: auto;

  .remote-controller {
    position: absolute;
    right: 0;
    bottom: 0;
    z-index: 100;
  }
}
</style>

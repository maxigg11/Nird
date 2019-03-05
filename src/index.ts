import {
  NetplayState,
  NetplayInput,
  NetplayPlayer,
  NetplayManager
} from "./netplay";

import { PongState, PongInput, PONG_WIDTH, PONG_HEIGHT } from "./pong";

import { assert } from "chai";

import * as query from "query-string";

// @ts-ignore
import Peer from "peerjs";
const peer = new Peer({
  config: {
    iceServers: [{ url: "stun:stun.l.google.com:19302" }]
  }
});

const parsedHash = query.parse(window.location.hash);
const isClient = !!parsedHash.room;

const canvas = document.createElement("canvas");
canvas.width = PONG_WIDTH;
canvas.height = PONG_HEIGHT;
document.body.appendChild(canvas);
const ctx = canvas.getContext("2d")!;

const stats = document.createElement("div");
document.body.appendChild(stats);

let initialState = PongState.getInitialState();
let netplayManager: NetplayManager<PongState, PongInput> | null = null;
let players: Array<NetplayPlayer> | null = null;

if (!isClient) {
  console.log("This is a server.");
  peer.on("open", id => {
    let joinURL = `${window.location.href}#room=${id}`;
    stats.innerHTML = `<div>Join URL: <a href="${joinURL}">${joinURL}<div>`;
  });

  peer.on("connection", conn => {
    conn.on("open", () => {
      console.log("Client has connected.");

      players = [
        {
          getID() {
            return 0;
          },
          isLocalPlayer() {
            return true;
          },
          isRemotePlayer() {
            return false;
          },
          isServer() {
            return true;
          },
          isClient() {
            return false;
          }
        },
        {
          getID() {
            return 1;
          },
          isLocalPlayer() {
            return false;
          },
          isRemotePlayer() {
            return true;
          },
          isServer() {
            return false;
          },
          isClient() {
            return true;
          }
        }
      ];

      let initialInputs = new Map<
        NetplayPlayer,
        { input: PongInput; isPrediction: boolean }
      >();
      initialInputs.set(players[0], {
        input: new PongInput("none"),
        isPrediction: false
      });
      initialInputs.set(players[1], {
        input: new PongInput("none"),
        isPrediction: false
      });

      netplayManager = new NetplayManager(
        true,
        initialState,
        initialInputs,
        10,
        (frame, input) => {
          conn.send({ type: "input", frame: frame, input: input.toJSON() });
        },
        (frame, state) => {
          conn.send({ type: "state", frame: frame, state: state.toJSON() });
        }
      );

      conn.on("data", data => {
        if (data.type === "input") {
          netplayManager!.onRemoteInput(
            data.frame,
            players![1],
            PongInput.fromJSON(data.input)
          );
        }
      });

      requestAnimationFrame(gameLoop);
    });
  });
} else {
  console.log("This is a client.");
  const conn = peer.connect(parsedHash.room, { reliable: true });
  conn.on("open", () => {
    console.log("Server has connected.");

    players = [
      {
        getID() {
          return 0;
        },
        isLocalPlayer() {
          return false;
        },
        isRemotePlayer() {
          return true;
        },
        isServer() {
          return true;
        },
        isClient() {
          return false;
        }
      },
      {
        getID() {
          return 1;
        },
        isLocalPlayer() {
          return true;
        },
        isRemotePlayer() {
          return false;
        },
        isServer() {
          return false;
        },
        isClient() {
          return true;
        }
      }
    ];

    let initialInputs = new Map<
      NetplayPlayer,
      { input: PongInput; isPrediction: boolean }
    >();
    initialInputs.set(players[0], {
      input: new PongInput("none"),
      isPrediction: false
    });
    initialInputs.set(players[1], {
      input: new PongInput("none"),
      isPrediction: false
    });

    netplayManager = new NetplayManager(
      false,
      initialState,
      initialInputs,
      10,
      (frame, input) => {
        conn.send({ type: "input", frame: frame, input: input.toJSON() });
      }
    );

    conn.on("data", data => {
      if (data.type === "input") {
        netplayManager!.onRemoteInput(
          data.frame,
          players![0],
          PongInput.fromJSON(data.input)
        );
      }
      if (data.type === "state") {
        netplayManager!.onStateSync(data.frame, PongState.fromJSON(data.state));
      }
    });

    requestAnimationFrame(gameLoop);
  });
}

const TIMESTEP = 1000 / 60;

const PRESSED_KEYS = {};
document.addEventListener(
  "keydown",
  event => {
    PRESSED_KEYS[event.keyCode] = true;
  },
  false
);
document.addEventListener(
  "keyup",
  event => {
    PRESSED_KEYS[event.keyCode] = false;
  },
  false
);

let lastFrameTime = 0;
function gameLoop(timestamp) {
  if (timestamp > lastFrameTime + TIMESTEP) {
    lastFrameTime = timestamp;
  }

  // Get local input.
  let input = new PongInput("none");
  if (PRESSED_KEYS[38]) input = new PongInput("up");
  if (PRESSED_KEYS[40]) input = new PongInput("down");

  // Tick state forward.
  netplayManager!.tick(input);

  // Draw state to canvas.
  netplayManager!.getState().draw(canvas, ctx);

  // Update stats
  stats.innerHTML = `
  <div>Timestep: ${TIMESTEP}</div>
  <div>History Size: ${netplayManager!.history.length}</div>
  <div>Frame Number: ${netplayManager!.currentFrame()}</div>
  <div>Largest Future Size: ${netplayManager!.largestFutureSize()}</div>
  `;

  requestAnimationFrame(gameLoop);
}

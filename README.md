# Choo Fighters (Weed-Themed Divekick Game)

This is a test 

A local multiplayer, Divekick-style 2D fighting game designed to be played on a shared screen (a laptop or TV) using smartphones as controllers over a local network.

## The Pitch
This is a 2-4 player party game where every hit is a 1-hit kill. Players use their phones to enter their names, pick a character (Mo, Andrew, Hatem, Max, or Jon), and then have exactly two inputs: **Dive** (jump) and **Kick** (attack). It's incredibly fast, frantic, and chaotic.

## Tech Stack
- **Backend Server:** Node.js with Express.js to serve the static frontend files.
- **Networking:** Socket.io for Real-Time, low-latency communication between the smartphone controllers and the Host game client.
- **Frontend Game Client (Host):** Vanilla JavaScript and HTML5 Canvas for physics, rendering, and collision detection. 
- **Frontend Controller Client:** HTML/CSS optimized for mobile browsers, ignoring native touch-scaling to act as physical buttons.

## Getting Started (For Devs)

### Prerequisites
- [Node.js](https://nodejs.org/) installed on your machine.
- A local network (Wi-Fi router) that both the host machine and the smartphones can connect to.

### Installation
1. Clone or download this project folder.
2. Open a terminal in the project root directory.
3. Install the dependencies:
   ```bash
   npm install
   ```
   *(This installs `express` and `socket.io`)*

### Running the Game
1. Start the server:
   ```bash
   npm start
   ```
   *(Or run `node server.js` directly)*
2. The server will output something like:
   ```
   Server listening on port 3000
   Host Display: http://localhost:3000
   ```
3. **Open the Host Display:** Open your web browser on the computer running the server and go to `http://localhost:3000`. This screen must stay open to run the game loop.
4. **Connect Controllers:** Find your machine's local IP address (e.g., `192.168.1.61`). Have your friends open their phone browsers and go to `http://192.168.1.61:3000/controller.html` (Make sure they are on the same Wi-Fi!).

## Project Structure

- `server.js` - The entry point for the Node server. Handles Socket.io rooms, tracking player connections, and broadcasting controller events to the host display.
- `public/` - Static files served by Express.
  - `index.html` - The Host Display screen containing the `<canvas>`.
  - `game.js` - The core engine running on the host. Handles:
    - Rendering the background and sprites.
    - Applying gravity, momentum, jumping, and diving physics.
    - Listening for Socket.io events (`dive_start`, `kick`, etc.) and updating the state.
    - Hitbox collision checks.
    - Round timers and resets.
    - *Auto-transparent sprite processing via flood-fill.*
  - `controller.html` - The mobile UI screen with name input, character selection, and the big Dive/Kick buttons.
  - `controller.js` - The logic for the phone controller. Captures touch events and emits socket actions to the server.
  - `assets/` - Contains the character `.png` sprites and `background.png`.
- `remove_bg.js` - A legacy utility script originally used to try removing backgrounds via Jimp, before the dynamic flood-fill algorithm was added to `game.js`.

## Adding Assets or Characters

1. **Sprites:** Character sprites should be single frames facing to the **Right**.
2. **Dynamic Transparency:** The game uses a flood-fill algorithm inside `game.js` that checks the 4 corners of a `.png` when it loads. If they are solid white (or closely off-white), it turns that color transparent dynamically. You do not strictly *need* an alpha-channel transparent PNG, but having one guarantees the best results.
3. **Adding a Character:** To add a new character (e.g., "Sarah"), you must:
   - Add `sarah.png` to `public/assets/`.
   - Update `charImages` dictionary initialization and the loading array in `public/game.js`.
   - Add a new `<button>` for them in `public/controller.html` inside the `#character-select` div with `data-char="sarah"`.

## Mechanics Overview
- **Dive:** Jumps straight up (`vy = -18`). Can be pressed a second time in the air for a **Double Jump**.
- **Kick (In Air):** Dives diagonally downward in the direction of the closest living opponent. 
- **Kick (On Ground):** A quick hop backwards for defensive spacing.
- **Hit Detection:** Simple AABB (Axis-Aligned Bounding Box) collision. When a player is "Kicking", a hitbox spawns around their feet. If that box intersects the tightened "core body" hurtbox of another player, they die. 1 hit kill.

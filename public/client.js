const socket = io();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Constants for room generation
const ROOM_MIN_SIZE = 50;
const ROOM_MAX_SIZE = 200;
const MIN_ROOMS = 5;
const MAX_ROOMS = 10;
const CHUNK_SIZE = 800; // Size of each chunk in pixels
const HALLWAY_WIDTH = 10; // Width of hallways
const TILE_SIZE = 10; // Each block size in pixels

// Player object with position, speed, id, and flashlight status
let player = {
    x: 0,
    y: 0,
    speed: 5,
    id: null,
    currentChunk: { x: 0, y: 0 },
    flashlight: false, // Flashlight status
};

// Flashlight properties
let flashlightRadius = 50; // Starting radius in pixels (5 blocks)
let flashlightExpandedRadius = 150; // Expanded radius in pixels (15 blocks)
let flashlightDirection = { x: 0, y: 0 }; // Direction relative to cursor

// Objects for players, walls, rooms, items, and generated chunks
let players = {};
let walls = [];
let rooms = [];
let hallways = [];
let items = [];
let generatedChunks = new Set();
let exit = null;
let doorLocations = [];
let dev = Boolean(localStorage.getItem("dev")) || false;

if (dev) {
    player.speed = 10;
}

// Function to resize the canvas
function resizeCanvas() {
    canvas.width = window.innerWidth / 2;
    canvas.height = window.innerHeight / 2;
}

// Event listener for window resize
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Function to check if two rooms overlap
function doRoomsOverlap(room1, room2) {
    return (
        room1.x < room2.x + room2.width &&
        room1.x + room1.width > room2.x &&
        room1.y < room2.y + room2.height &&
        room1.y + room1.height > room2.y
    );
}

// Function to merge two overlapping rooms into one
function mergeRooms(room1, room2) {
    const mergedRoom = {
        x: Math.min(room1.x, room2.x),
        y: Math.min(room1.y, room2.y),
        width: Math.max(room1.x + room1.width, room2.x + room2.width) - Math.min(room1.x, room2.x),
        height: Math.max(room1.y + room1.height, room2.y + room2.height) - Math.min(room1.y, room2.y)
    };

    // Remove individual walls and add merged walls
    walls = walls.filter(
        (wall) =>
            !(
                doRoomsOverlap(
                    { x: wall.x, y: wall.y, width: wall.width, height: wall.height },
                    room1
                ) ||
                doRoomsOverlap(
                    { x: wall.x, y: wall.y, width: wall.width, height: wall.height },
                    room2
                )
            )
    );

    // Add walls around the merged room
    addRoomWalls(mergedRoom);
    return mergedRoom;
}

// Function to add walls around a room, leaving gaps for doors
function addRoomWalls(room) {
    const doorSize = 20; // Size of doors as gaps
    // Top wall with gap for door
    walls.push({
        x: room.x,
        y: room.y,
        width: room.width,
        height: 10,
        doorGap: { x: room.x + room.width / 2 - doorSize / 2, y: room.y }
    });
    // Bottom wall with gap for door
    walls.push({
        x: room.x,
        y: room.y + room.height - 10,
        width: room.width,
        height: 10,
        doorGap: { x: room.x + room.width / 2 - doorSize / 2, y: room.y + room.height - 10 }
    });
    // Left wall with gap for door
    walls.push({
        x: room.x,
        y: room.y,
        width: 10,
        height: room.height,
        doorGap: { x: room.x, y: room.y + room.height / 2 - doorSize / 2 }
    });
    // Right wall with gap for door
    walls.push({
        x: room.x + room.width - 10,
        y: room.y,
        width: 10,
        height: room.height,
        doorGap: { x: room.x + room.width - 10, y: room.y + room.height / 2 - doorSize / 2 }
    });
}

// Function to spawn the player in the first room generated
function spawnPlayerInFirstRoom(room) {
    player.x = room.x + room.width / 2 - TILE_SIZE / 2;
    player.y = room.y + room.height / 2 - TILE_SIZE / 2;
}

// Function to generate hallways connecting rooms
function generateHallway(room1, room2) {
    let x = Math.min(room1.x + room1.width / 2, room2.x + room2.width / 2);
    let y = Math.min(room1.y + room1.height / 2, room2.y + room2.height / 2);
    let width = Math.abs(room1.x + room1.width / 2 - (room2.x + room2.width / 2));
    let height = Math.abs(room1.y + room1.height / 2 - (room2.y + room2.height / 2));

    // Adjust for correct corridor-like shape
    if (width === 0) width = HALLWAY_WIDTH;
    if (height === 0) height = HALLWAY_WIDTH;

    if (width > height) {
        hallways.push({ x: x, y: y, width: width, height: HALLWAY_WIDTH }); // Horizontal hallway
    } else {
        hallways.push({ x: x, y: y, width: HALLWAY_WIDTH, height: height }); // Vertical hallway
    }

    // Check for direction changes and create bends (90, 180, 270 degrees)
    if (Math.random() < 0.5) {
        let bend = {
            x: x + (Math.random() > 0.5 ? width : 0),
            y: y + (Math.random() > 0.5 ? height : 0),
            width: HALLWAY_WIDTH,
            height: HALLWAY_WIDTH
        };
        hallways.push(bend);
    }
}

// Function to generate rooms and hallways within a chunk
function generateChunk(chunkX, chunkY, seed) {
    const chunkKey = `${chunkX},${chunkY}`;
    if (generatedChunks.has(chunkKey)) return;

    Math.seedrandom(`${seed}-${chunkX}-${chunkY}`);
    const chunkStartX = chunkX * CHUNK_SIZE;
    const chunkStartY = chunkY * CHUNK_SIZE;
    const numRooms = Math.floor(Math.random() * (MAX_ROOMS - MIN_ROOMS + 1)) + MIN_ROOMS;

    for (let i = 0; i < numRooms; i++) {
        const roomWidth = Math.floor(Math.random() * (ROOM_MAX_SIZE - ROOM_MIN_SIZE + 1)) + ROOM_MIN_SIZE;
        const roomHeight = Math.floor(Math.random() * (ROOM_MAX_SIZE - ROOM_MIN_SIZE + 1)) + ROOM_MIN_SIZE;
        const roomX = chunkStartX + Math.floor(Math.random() * (CHUNK_SIZE - roomWidth));
        const roomY = chunkStartY + Math.floor(Math.random() * (CHUNK_SIZE - roomHeight));

        const newRoom = { x: roomX, y: roomY, width: roomWidth, height: roomHeight };

        let merged = false;
        for (let room of rooms) {
            if (doRoomsOverlap(newRoom, room)) {
                const mergedRoom = mergeRooms(newRoom, room);
                rooms = rooms.filter((r) => r !== room);
                rooms.push(mergedRoom);
                merged = true;
                break;
            }
        }

        if (!merged) {
            rooms.push(newRoom);
            addRoomWalls(newRoom);

            if (chunkX === 0 && chunkY === 0 && i === 0) {
                spawnPlayerInFirstRoom(newRoom);
            }
        }

        // Create items (e.g., flashlight)
        if (Math.random() < 0.1) {
            items.push({ x: roomX + roomWidth / 2 - TILE_SIZE / 2, y: roomY + roomHeight / 2 - TILE_SIZE / 2, id: 0 }); // Flashlight item
        }
    }

    for (let i = 0; i < rooms.length - 1; i++) {
        for (let j = i + 1; j < rooms.length; j++) {
            const shouldConnect = Math.random() > 0.5;
            if (shouldConnect) {
                generateHallway(rooms[i], rooms[j]);
            }
        }
    }

    generatedChunks.add(chunkKey);
}

// Function to update local player's chunk
function updateChunks() {
    const chunkX = Math.floor(player.x / CHUNK_SIZE);
    const chunkY = Math.floor(player.y / CHUNK_SIZE);
    if (chunkX !== player.currentChunk.x || chunkY !== player.currentChunk.y) {
        player.currentChunk.x = chunkX;
        player.currentChunk.y = chunkY;
        socket.emit('requestChunk', { chunkX, chunkY });
    }
}

// Function to check wall collisions for the player
function checkWallCollision(newPosition) {
    for (let wall of walls) {
        // Check for door gap in wall, allowing passage
        if (wall.doorGap && newPosition.x >= wall.doorGap.x && newPosition.x <= wall.doorGap.x + 20 && newPosition.y >= wall.doorGap.y && newPosition.y <= wall.doorGap.y + 20) {
            continue; // Skip collision if the position is within the door gap
        }
        if (
            newPosition.x < wall.x + wall.width &&
            newPosition.x + TILE_SIZE > wall.x &&
            newPosition.y < wall.y + wall.height &&
            newPosition.y + TILE_SIZE > wall.y
        ) {
            return true; // Collision detected
        }
    }
    return false; // No collision
}

// Function to check if player collides with the exit
function checkExitCollision() {
    if (exit && player.x < exit.x + exit.width && player.x + TILE_SIZE > exit.x && player.y < exit.y + exit.height && player.y + TILE_SIZE > exit.y) {
        socket.emit('finishedLevel');
    }
}

// Function to update local player position
function updateLocalPosition() {
    let newX = player.x;
    let newY = player.y;

    // Keyboard movement
    if (keys['ArrowUp'] || keys['w']) newY -= player.speed;
    if (keys['ArrowDown'] || keys['s']) newY += player.speed;
    if (keys['ArrowLeft'] || keys['a']) newX -= player.speed;
    if (keys['ArrowRight'] || keys['d']) newX += player.speed;

    // Joystick movement
    if (joystick) {
        newX += joystick.deltaX() * player.speed;
        newY += joystick.deltaY() * player.speed;
    }

    // Check collision with walls
    if (!checkWallCollision({ x: newX, y: newY })) {
        player.x = newX;
        player.y = newY;
    }

    checkExitCollision();
    updateChunks();

    // Emit new player position to the server
    socket.emit('movePlayer', player);
}

// Function to check if the player picks up an item
function checkItemCollision() {
    items = items.filter((item) => {
        if (
            player.x < item.x + TILE_SIZE &&
            player.x + TILE_SIZE > item.x &&
            player.y < item.y + TILE_SIZE &&
            player.y + TILE_SIZE > item.y
        ) {
            if (item.id === 0) {
                player.flashlight = true; // Pick up flashlight
                flashlightRadius = flashlightExpandedRadius; // Increase radius to expanded size
            }
            return false; // Remove item after pick up
        }
        return true;
    });
}

// Function to draw rooms
function drawRooms() {
    ctx.fillStyle = 'lightgray';
    for (let room of rooms) {
        ctx.fillRect(room.x, room.y, room.width, room.height);
    }
}

// Function to draw hallways
function drawHallways() {
    ctx.fillStyle = 'darkgray';
    for (let hallway of hallways) {
        ctx.fillRect(hallway.x, hallway.y, hallway.width, hallway.height);
    }
}

// Function to draw walls
function drawWalls() {
    ctx.fillStyle = 'gray';
    for (let wall of walls) {
        // Skip drawing door gaps
        if (!wall.doorGap || (wall.doorGap.x !== player.x && wall.doorGap.y !== player.y)) {
            ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
        }
    }
}

// Function to draw items
function drawItems() {
    ctx.fillStyle = 'blue';
    for (let item of items) {
        ctx.fillRect(item.x, item.y, TILE_SIZE, TILE_SIZE);
    }
}

// Function to draw the player
function drawPlayer(player) {
    ctx.fillStyle = 'yellow';
    ctx.fillRect(player.x, player.y, TILE_SIZE, TILE_SIZE);
}

// Function to draw the flashlight effect
function drawFlashlight() {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)'; // Darker background for the whole canvas
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = 'destination-out'; // Use to create the light beam
    const gradient = ctx.createRadialGradient(
        player.x, player.y, 0,
        player.x + flashlightDirection.x * flashlightRadius,
        player.y + flashlightDirection.y * flashlightRadius,
        flashlightRadius
    );

    // Gradually transition from dim center to brighter outer edge
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)'); // Slightly dimmer near player
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.9)'); // Fade into darkness at the edge

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(player.x, player.y, flashlightRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// Modified draw function to selectively render entities within the flashlight beam
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(-player.x + canvas.width / 2, -player.y + canvas.height / 2);

    // Draw the rooms and hallways only dimly
    ctx.fillStyle = 'rgba(50, 50, 50, 0.5)'; // Darker shade for environment structures
    drawRooms();
    drawHallways();
    drawWalls();

    // Draw only the entities within the flashlight
    ctx.globalCompositeOperation = 'source-over'; // Default drawing mode to render above the darkened canvas
    drawItems();
    for (let id in players) {
        if (players.hasOwnProperty(id)) {
            drawPlayer(players[id]);
        }
    }

    drawPlayer(player);
    drawFlashlight(); // Draw the flashlight effect over everything
    ctx.restore();
    requestAnimationFrame(draw);
}

// Event listeners for keyboard input
let keys = {};
window.addEventListener('keydown', (e) => keys[e.key] = true);
window.addEventListener('keyup', (e) => keys[e.key] = false);

// Update flashlight direction based on cursor position
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - canvas.width / 2;
    const mouseY = e.clientY - rect.top - canvas.height / 2;

    // Smoothly update the direction vector
    const smoothingFactor = 0.1;
    flashlightDirection.x += smoothingFactor * (mouseX - flashlightDirection.x);
    flashlightDirection.y += smoothingFactor * (mouseY - flashlightDirection.y);

    // Normalize direction vector
    const length = Math.sqrt(flashlightDirection.x ** 2 + flashlightDirection.y ** 2);
    flashlightDirection.x /= length;
    flashlightDirection.y /= length;
});

// Event listener for socket connection
socket.on('connect', () => {
    player.id = socket.id;
    socket.emit('newPlayer', player);
});

// Event listener for level information
socket.on('levelInfo', (data) => {
    generateChunk(data.chunkX, data.chunkY, data.seed);
});

// Event listener for updating player positions
socket.on('updatePlayers', (serverPlayers) => {
    players = serverPlayers;
});

// Event listener for updating individual player position
socket.on('updatePlayerPosition', (data) => {
    if (players[data.id]) {
        players[data.id].x = data.x;
        players[data.id].y = data.y;
    }
    if (players[data.id].id === socket.id) {
        if (player.x !== players[data.id].x) player.x = players[data.id].x;
        if (player.y !== players[data.id].y) player.y = players[data.id].y;
    }
});

// Event listener for updating exit position
socket.on('updateExit', (exitData) => {
    exit = exitData;
});

// Joystick setup and initialization
let joystick = null;
function initJoystick() {
    joystick = new Joystick({
        container: document.body,
        onMove: (x, y) => {
            player.x += x * player.speed;
            player.y += y * player.speed;
        },
        onEnd: () => {
            // Additional logic when joystick stops
        }
    });
}

window.addEventListener('load', initJoystick);

// Start the game by generating the initial chunk
generateChunk(0, 0, 'worldSeed');
draw();

// Set interval to update the player's position
setInterval(updateLocalPosition, 1000 / 60);


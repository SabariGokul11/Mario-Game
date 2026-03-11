const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game Constants
const GRAVITY = 0.5;
const FRICTION = 0.8;
const MAX_FALL_SPEED = 12;

// Key state tracking
const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    ArrowUp: false,
    Space: false,
    Enter: false
};

// Listeners
window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.code) || keys.hasOwnProperty(e.key)) {
        let key = e.code === 'Space' ? 'Space' : e.key;
        if (key === 'Enter') key = 'Enter';
        keys[key] = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.code) || keys.hasOwnProperty(e.key)) {
        let key = e.code === 'Space' ? 'Space' : e.key;
        if (key === 'Enter') key = 'Enter';
        keys[key] = false;
    }
});

function checkCollision(r1, r2) {
    return (
        r1.x < r2.x + r2.width &&
        r1.x + r1.width > r2.x &&
        r1.y < r2.y + r2.height &&
        r1.y + r1.height > r2.y
    );
}

const levelData = [
"                                                                                                                                                                                            ",
"                                                                                                                                                                                            ",
"                                                                                                                                                                                            ",
"                                                                                                                                                                                            ",
"                                                                                                                                                                                            ",
"                                                                                                                                                                                            ",
"                                                                                                                                                                                            ",
"                                                                                                                                                                                            ",
"                                                                                                                                                                                            ",
"                 ?                                                                                 B                                                                                        ",
"                                                                                                  BB         F                                                                              ",
"             B?B?B                                                                               BBB         F                                                                              ",
"                                            12                                                  BBBB         F                                                                              ",
"                        E         12        34  E                                              BBBBB         F                                                                              ",
"                        12        34        34                                                BBBBBB         F                                                                              ",
"GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG  GGGGGGGGGGGGGGGGGG     GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG"
];

class Game {
    constructor() {
        this.camera = { x: 0, y: 0, width: canvas.width, height: canvas.height };
        this.score = 0;
        this.coins = 0;
        this.time = 400;
        this.lives = 3;
        this.world = 1;
        this.level = 1;
        this.entities = [];
        this.blocks = [];
        this.particles = [];
        this.state = 'START'; // START, PLAYING, WIN, GAMEOVER
        
        // Time tracking
        this.lastTime = performance.now();
        this.timerCounter = 0;
    }

    init() {
        this.restartLevel(true); // true = full restart
        requestAnimationFrame((now) => this.gameLoop(now));
    }
    
    restartLevel(fullReset = false) {
        if (fullReset) {
            this.score = 0;
            this.coins = 0;
            this.lives = 3;
        }
        
        this.camera = { x: 0, y: 0, width: canvas.width, height: canvas.height };
        this.time = 400;
        this.entities = [];
        this.particles = [];
        this.state = 'PLAYING';
        this.buildLevel();
        this.player = new Player(50, 200);
        this.updateUI();
        
        document.getElementById('overlay').classList.add('hidden');
    }

    buildLevel() {
        this.blocks = [];
        const tileSize = 32;
        const offsetY = canvas.height - (levelData.length * tileSize); // Place level at bottom
        
        for (let row = 0; row < levelData.length; row++) {
            for (let col = 0; col < levelData[row].length; col++) {
                const char = levelData[row][col];
                const x = col * tileSize;
                const y = offsetY + (row * tileSize);
                
                if (char === 'G') this.blocks.push(new Block(x, y, tileSize, tileSize, 'ground'));
                else if (char === 'B') this.blocks.push(new Block(x, y, tileSize, tileSize, 'brick'));
                else if (char === '?') this.blocks.push(new Block(x, y, tileSize, tileSize, 'question', {active: true}));
                else if (char === '1') this.blocks.push(new Block(x, y, tileSize, tileSize, 'pipe-top-left'));
                else if (char === '2') this.blocks.push(new Block(x, y, tileSize, tileSize, 'pipe-top-right'));
                else if (char === '3') this.blocks.push(new Block(x, y, tileSize, tileSize, 'pipe-body-left'));
                else if (char === '4') this.blocks.push(new Block(x, y, tileSize, tileSize, 'pipe-body-right'));
                else if (char === 'F') this.blocks.push(new Block(x, y + 16, 4, tileSize * 9, 'flagpole', {win: true})); // thin pole
                else if (char === 'E') this.entities.push(new Goomba(x, y));
            }
        }
    }

    update(dt) {
        if (this.state !== 'PLAYING') return;

        // Decrease Time
        this.timerCounter += dt;
        if (this.timerCounter >= 1000) {
            this.time--;
            this.timerCounter -= 1000;
            this.updateUI();
        }

        // Update player
        if (this.player.dead) {
            this.player.updateDeath(dt);
        } else {
            this.player.update(dt);
        }
        
        // Update entities
        for (let i = this.entities.length - 1; i >= 0; i--) {
            let ent = this.entities[i];
            ent.update(dt);
            if (ent.remove) {
                this.entities.splice(i, 1);
            }
        }
        
        // Camera follow player (only if not dead)
        if (!this.player.dead && this.player.x > this.camera.x + this.camera.width / 2.5) {
            this.camera.x = this.player.x - this.camera.width / 2.5;
        }
        
        // Clamp camera left so we can't go backwards (classic Mario style)
        if (this.player.x < this.camera.x) {
            this.player.x = this.camera.x;
            this.player.vx = 0;
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];
            p.update(dt);
            if (p.remove) {
                this.particles.splice(i, 1);
            }
        }
    }

    draw() {
        // Clear background
        ctx.fillStyle = '#5c94fc'; // Mario Sky Blue
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        // Shift context by camera
        ctx.translate(-Math.floor(this.camera.x), -Math.floor(this.camera.y));

        // Draw blocks
        this.blocks.forEach(block => block.draw());
        
        // Draw entities
        this.entities.forEach(ent => ent.draw());

        // Draw particles
        this.particles.forEach(p => p.draw());
        
        // Draw player
        if (this.player) this.player.draw();

        ctx.restore();
    }

    gameLoop(now) {
        let dt = now - this.lastTime;
        this.lastTime = now;
        
        if (dt > 100) dt = 100;

        if (this.state === 'GAMEOVER' || this.state === 'WIN') {
            if (keys['Enter']) {
                this.restartLevel(this.state === 'GAMEOVER');
                keys['Enter'] = false; // consume key
            }
        }

        this.update(dt);
        this.draw();

        requestAnimationFrame((now) => this.gameLoop(now));
    }
    
    addCoin(x, y) {
        this.coins++;
        this.score += 200;
        if (this.coins >= 100) {
            this.coins -= 100;
            this.lives++;
        }
        this.particles.push(new CoinParticle(x, y));
        this.updateUI();
    }
    
    handleDeath() {
        if (this.state !== 'PLAYING') return;
        this.lives--;
        this.updateUI();
        if (this.lives <= 0) {
            this.state = 'GAMEOVER';
            document.getElementById('overlay-title').innerText = 'GAME OVER';
            document.getElementById('overlay').classList.remove('hidden');
        } else {
            // Short delay then restart level
            setTimeout(() => this.restartLevel(), 1000);
            this.state = 'START'; // Pause updates
        }
    }
    
    levelComplete() {
        if (this.state !== 'PLAYING') return;
        this.state = 'WIN';
        this.score += this.time * 50;
        this.updateUI();
        document.getElementById('overlay-title').innerText = 'LEVEL COMPLETE';
        document.getElementById('overlay-subtitle').innerText = 'Press ENTER to Restart';
        document.getElementById('overlay').classList.remove('hidden');
    }

    updateUI() {
        document.getElementById('score').innerText = this.score.toString().padStart(6, '0');
        document.getElementById('coins').innerText = this.coins.toString().padStart(2, '0');
        document.getElementById('time').innerText = this.time.toString().padStart(3, '0');
    }
}

// Temporary placeholder classes
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 24; // Mario's width
        this.height = 32; // Mario's height
        this.vx = 0;
        this.vy = 0;
        this.speed = 0.4;
        this.maxSpeed = 4;
        this.friction = 0.8;
        this.jumpForce = -12;
        this.color = 'red';
        this.grounded = false;
        this.dead = false;
        this.frameCounter = 0;
        this.facingRight = true;
    }
    
    update(dt) {
        if (this.dead) return;

        // Horizontal Movement
        if (keys['ArrowRight']) {
            this.vx += this.speed;
            this.facingRight = true;
        } else if (keys['ArrowLeft']) {
            this.vx -= this.speed;
            this.facingRight = false;
        } else {
            this.vx *= this.friction; // apply friction when no input
        }
        
        // Clamp horizontal speed
        if (this.vx > this.maxSpeed) this.vx = this.maxSpeed;
        if (this.vx < -this.maxSpeed) this.vx = -this.maxSpeed;
        
        // Stop completely if very slow
        if (Math.abs(this.vx) < 0.1) this.vx = 0;
        
        // Animation framing
        if (Math.abs(this.vx) > 0.5) this.frameCounter += dt;
        else this.frameCounter = 0;

        // Move X
        this.x += this.vx;
        
        // Check X collisions block
        game.blocks.forEach(block => {
            if (checkCollision(this, block)) {
                if (block.type === 'flagpole') {
                    game.levelComplete();
                    return;
                }
                if (this.vx > 0) { // Moving right, hit left side of block
                    this.x = block.x - this.width;
                    this.vx = 0;
                } else if (this.vx < 0) { // Moving left, hit right side of block
                    this.x = block.x + block.width;
                    this.vx = 0;
                }
            }
        });

        // Vertical Movement
        this.vy += GRAVITY;
        if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;
        
        // Jumping
        if ((keys['Space'] || keys['ArrowUp']) && this.grounded) {
            this.vy = this.jumpForce;
            this.grounded = false;
        }

        // Move Y
        this.y += this.vy;
        this.grounded = false; // assume falling until we hit something

        // Check Y collisions
        game.blocks.forEach(block => {
            if (checkCollision(this, block)) {
                if (block.type === 'flagpole') {
                    game.levelComplete();
                    return;
                }
                if (this.vy > 0) { // Falling down, hit top of block
                    this.y = block.y - this.height;
                    this.vy = 0;
                    this.grounded = true;
                } else if (this.vy < 0) { // Jumping up, hit bottom of block
                    this.y = block.y + block.height;
                    this.vy = 0;
                    // Bumping blocks from below logic can go here
                    if (block.type === 'question' && block.state.active) {
                        block.state.active = false;
                        game.addCoin(block.x, block.y); // visual coin pop
                    } else if (block.type === 'brick') { // simple bounce or break
                        // game.breakBrick(block) or similar
                        this.vy = 0;
                    }
                }
            }
        });
        
        // Enemy collisions
        game.entities.forEach(ent => {
            if (ent.type === 'goomba' && !ent.dead && checkCollision(this, ent)) {
                // If falling down and above the goomba's center, it's a stomp
                if (this.vy > 0 && this.y + this.height < ent.y + ent.height / 2 + 10) {
                    ent.squash();
                    this.vy = this.jumpForce * 0.7; // bounce off enemy
                    game.score += 100;
                    game.updateUI();
                } else {
                    // Hit from side -> Player dies
                    this.die();
                }
            }
        });

        // Death by falling off screen
        if (this.y > canvas.height + 100) {
            this.die();
        }
    }
    
    updateDeath(dt) {
        this.vy += GRAVITY;
        this.y += this.vy;
        if (this.y > canvas.height + 100) {
            game.handleDeath();
        }
    }

    die() {
        if (this.dead) return;
        this.dead = true;
        this.vy = this.jumpForce; // death hop
        this.vx = 0;
    }
    
    draw() {
        let x = Math.floor(this.x);
        let y = Math.floor(this.y);
        
        ctx.fillStyle = this.color;
        
        if (this.dead) {
            ctx.fillStyle = '#fca044'; // yellowish/orange for death frame
            ctx.fillRect(x, y, this.width, this.height);
            return;
        }

        // Draw basic Mario geometry
        // Hat/Top
        ctx.fillStyle = 'red';
        ctx.fillRect(x, y, this.width, 10);
        // Face
        ctx.fillStyle = '#fca044';
        ctx.fillRect(x + (this.facingRight ? 4 : 0), y + 10, this.width - 4, 10);
        // Overalls
        ctx.fillStyle = 'blue';
        ctx.fillRect(x, y + 20, this.width, 12);
        
        // Simple leg swing animation if moving and grounded
        if (this.grounded && Math.abs(this.vx) > 0.5) {
            let swing = Math.floor((this.frameCounter % 200) / 100);
            if (swing === 0) {
                // Left leg up
                ctx.fillStyle = '#222';
                ctx.fillRect(x + 2, y + 30, 8, 4);
                ctx.fillRect(x + this.width - 10, y + 28, 8, 4);
            } else {
                // Right leg up
                ctx.fillStyle = '#222';
                ctx.fillRect(x + 2, y + 28, 8, 4);
                ctx.fillRect(x + this.width - 10, y + 30, 8, 4);
            }
        } else {
            // Standing or jumping
            ctx.fillStyle = '#222';
            ctx.fillRect(x, y + 30, 8, 4);
            ctx.fillRect(x + this.width - 8, y + 30, 8, 4);
        }
    }
}

class Goomba {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 32;
        this.height = 32;
        this.vx = -1; // moves left initially
        this.vy = 0;
        this.type = 'goomba';
        this.dead = false;
        this.remove = false;
        this.deathTimer = 0;
        this.frameCounter = 0;
    }
    
    update(dt) {
        if (this.dead) {
            this.deathTimer += dt;
            if (this.deathTimer > 500) { // stay squashed for 500ms
                this.remove = true;
            }
            return;
        }

        // Wake up only if player is near (standard Mario mechanic)
        if (Math.abs(this.x - game.player.x) > canvas.width) {
            return; // don't move if too far away off screen
        }

        this.frameCounter += dt;
        this.vy += GRAVITY;
        if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;

        this.x += this.vx;

        // X collisions (turn around on hit)
        game.blocks.forEach(block => {
            if (checkCollision(this, block) && block.type !== 'flagpole') {
                if (this.vx > 0) { // Moving right
                    this.x = block.x - this.width;
                    this.vx = -this.vx;
                } else if (this.vx < 0) { // Moving left
                    this.x = block.x + block.width;
                    this.vx = -this.vx;
                }
            }
        });

        this.y += this.vy;

        // Y collisions
        game.blocks.forEach(block => {
            if (checkCollision(this, block)) {
                if (this.vy > 0) { // Falling down
                    this.y = block.y - this.height;
                    this.vy = 0;
                }
            }
        });
        
        // Fall off screen -> remove
        if (this.y > canvas.height + 100) {
            this.remove = true;
        }
    }
    
    squash() {
        this.dead = true;
        this.y += 16;   // drop height
        this.height = 16; // flatten
    }
    
    draw() {
        let x = Math.floor(this.x);
        let y = Math.floor(this.y);
        
        if (this.dead) {
            ctx.fillStyle = '#a84400';
            ctx.fillRect(x, y, this.width, this.height);
            return;
        }
        
        // Brown body
        ctx.fillStyle = '#c84c0c';
        
        // Waddle animation
        let waddle = Math.floor((this.frameCounter % 400) / 200);
        
        if (waddle === 0) {
            // Frame 1
            ctx.fillRect(x + 4, y, 24, 24); // Head
            ctx.fillStyle = '#000';
            ctx.fillRect(x, y + 24, 12, 8); // left foot out
            ctx.fillRect(x + 20, y + 24, 8, 8); // right foot in
        } else {
            // Frame 2
            ctx.fillRect(x + 4, y, 24, 24); // Head
            ctx.fillStyle = '#000';
            ctx.fillRect(x + 4, y + 24, 8, 8); // left foot in
            ctx.fillRect(x + 20, y + 24, 12, 8); // right foot out
        }
        
        // Eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + 10, y + 8, 4, 8);
        ctx.fillRect(x + 18, y + 8, 4, 8);
        ctx.fillStyle = '#000';
        ctx.fillRect(x + 12, y + 10, 2, 4);
        ctx.fillRect(x + 18, y + 10, 2, 4);
    }
}

class Block {
    constructor(x, y, w, h, type, state = {}) {
        this.x = x;
        this.y = y;
        this.width = w;
        this.height = h;
        this.type = type;
        this.state = state;
    }
    
    draw() {
        let x = Math.floor(this.x);
        let y = Math.floor(this.y);
        let w = this.width;
        let h = this.height;

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;

        if (this.type === 'ground') {
            ctx.fillStyle = '#c84c0c'; // classic Mario reddish-brown ground
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
            // simple brick pattern for ground
            ctx.fillStyle = '#fca044'; // lighter highlight
            ctx.fillRect(x + 2, y + 2, w - 4, 4);
        } 
        else if (this.type === 'brick') {
            ctx.fillStyle = '#c84c0c'; // brick brown
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
            // Draw brick grid lines
            ctx.beginPath();
            ctx.moveTo(x, y + h/2); ctx.lineTo(x + w, y + h/2);
            ctx.moveTo(x + w/2, y); ctx.lineTo(x + w/2, y + h/2);
            ctx.moveTo(x + w/4, y + h/2); ctx.lineTo(x + w/4, y + h);
            ctx.moveTo(x + 3*w/4, y + h/2); ctx.lineTo(x + 3*w/4, y + h);
            ctx.stroke();
        } 
        else if (this.type === 'question') {
            if (this.state.active) { // Still has item
                ctx.fillStyle = '#f8d820'; // yellow
                ctx.fillRect(x, y, w, h);
                ctx.strokeRect(x, y, w, h);
                // Draw ? mark
                ctx.fillStyle = '#000';
                ctx.font = '20px "Press Start 2P"';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('?', x + w/2, y + h/2);
            } else { // Empty block
                ctx.fillStyle = '#886808'; // brown/goldish dead block
                ctx.fillRect(x, y, w, h);
                ctx.strokeRect(x, y, w, h);
            }
        } 
        else if (this.type.startsWith('pipe')) {
            ctx.fillStyle = '#00a800'; // light green
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
            
            // Pipe highlights
            ctx.fillStyle = '#88f800'; // brighter green reflection
            ctx.fillRect(x + 4, y, 6, h);
            
            if (this.type === 'pipe-top-left' || this.type === 'pipe-top-right') {
                // Top lip is slightly wider in classic, but our tiles dictate we just do a top bar highlight
                ctx.fillStyle = '#000';
                ctx.fillRect(x, y + h - 2, w, 2); // Bottom rim of top piece
            }
        }
        else if (this.type === 'flagpole') {
            ctx.fillStyle = '#d8a038'; // Gold ball on top
            ctx.beginPath();
            ctx.arc(x + w/2, y - 8, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#f8f8f8'; // Pole
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
        }
    }
}

class CoinParticle {
    constructor(x, y) {
        this.x = x + 8; // center approx on block
        this.y = y;
        this.width = 16;
        this.height = 24;
        this.vy = -8;
        this.remove = false;
        this.frameCounter = 0;
    }
    
    update(dt) {
        this.vy += GRAVITY * 0.8;
        this.y += this.vy;
        
        this.frameCounter += dt;
        
        if (this.vy > 5) {
            this.remove = true;
        }
    }
    
    draw() {
        let x = Math.floor(this.x);
        let y = Math.floor(this.y);
        
        ctx.fillStyle = '#f8d820'; // gold
        
        // Spin animation via width
        let spin = Math.floor((this.frameCounter % 300) / 100);
        let drawW = this.width;
        let pX = x;
        if (spin === 1) {
            drawW = this.width / 2;
            pX = x + this.width / 4;
        } else if (spin === 2) {
            drawW = 4;
            pX = x + this.width / 2 - 2;
        }
        
        ctx.fillRect(pX, y, drawW, this.height);
        
        ctx.strokeStyle = '#000';
        ctx.strokeRect(pX, y, drawW, this.height);
    }
}

// Start
const game = new Game();
game.state = 'PLAYING'; // Start directly for now
game.init();

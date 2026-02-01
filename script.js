const CANVAS = document.getElementById('game-canvas');
const CTX = CANVAS.getContext('2d');
const GAME_WIDTH = CANVAS.width;
const GAME_HEIGHT = CANVAS.height;

const BASE_SCORE_TO_UPGRADE = 10;
let score = 0;
let playerHealth = 5;
let gameRunning = true;
let isUpgrading = false;

const PLAYER = { x: GAME_WIDTH / 2, y: GAME_HEIGHT - 50, size: 20, speed: 6 };
let bullets = [];
let lastShotTime = 0;
let enemies = [];
let enemySpawnTimer = 0;
let enemiesKilled = 0;

const ENEMY_HEALTH = 10;
const ENEMY_VALUE = 3;

// --- 強化設定 (radiusにmaxLevel: 10を追加) ---
const UPGRADES = {
    fireRate: { level: 1, baseInterval: 400, cost: 10, label: "連射速度" },
    bulletCount: { level: 1, baseCount: 1, cost: 10, label: "同時弾数" },
    bounce: { level: 0, baseChance: 0.1, cost: 10, label: "バウンド弾" },
    damage: { level: 1, baseDamage: 1, cost: 10, label: "ダメージアップ" },
    speed: { level: 1, baseSpeed: 10, cost: 10, label: "弾丸速度" },
    radius: { level: 1, baseRadius: 4, cost: 10, label: "当たり判定拡大", maxLevel: 10 },
    autoAim: { level: 0, baseAimStrength: 0.005, cost: 10, label: "オートエイム" }
};

let keys = {};
document.addEventListener('keydown', (e) => { keys[e.code] = true; if(e.code==='Space') e.preventDefault(); });
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

function distance(x1, y1, x2, y2) { return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2); }

function getTotalUpgradeLevel() {
    let total = 0;
    for (const key in UPGRADES) total += UPGRADES[key].level;
    return total - 6;
}

function update(deltaTime) {
    if (!gameRunning || isUpgrading) return;

    // プレイヤー移動
    if (keys['ArrowLeft'] && PLAYER.x > PLAYER.size / 2) PLAYER.x -= PLAYER.speed;
    if (keys['ArrowRight'] && PLAYER.x < GAME_WIDTH - PLAYER.size / 2) PLAYER.x += PLAYER.speed;

    // 発射
    const now = Date.now();
    const fireInterval = UPGRADES.fireRate.baseInterval / UPGRADES.fireRate.level;
    if (keys['Space'] && (now - lastShotTime > fireInterval)) {
        shoot();
        lastShotTime = now;
    }

    // 弾丸移動
    bullets = bullets.filter(bullet => {
        bullet.x += bullet.velX * (deltaTime / 16);
        bullet.y += bullet.velY * (deltaTime / 16);
        return bullet.y > 0 && bullet.x > 0 && bullet.x < GAME_WIDTH;
    });

    // 敵の出現 (上限: 同時20体、最速0.5秒に1回)
    enemySpawnTimer += deltaTime;
    const difficulty = (getTotalUpgradeLevel() / 10) + (enemiesKilled / 100);
    const spawnInterval = Math.max(500, 3000 - difficulty * 200);
    const MAX_ENEMIES = 20;

    if (enemySpawnTimer >= spawnInterval) {
        if (enemies.length < MAX_ENEMIES) {
            spawnEnemy();
        }
        enemySpawnTimer = 0;
    }

    // 敵の移動と衝突
    enemies.forEach((enemy, eIdx) => {
        enemy.y += enemy.speed * (deltaTime / 16);
        
        bullets.forEach((bullet, bIdx) => {
            if (!bullet.hit && distance(bullet.x, bullet.y, enemy.x, enemy.y) < enemy.size / 2 + bullet.radius) {
                enemy.health -= bullet.damage;
                bullet.hit = true;
                if (enemy.health <= 0) {
                    score += ENEMY_VALUE;
                    enemiesKilled++;
                    enemies.splice(eIdx, 1);
                }
            }
        });

        if (enemy.y > GAME_HEIGHT) {
            enemies.splice(eIdx, 1);
            playerHealth--;
            if (playerHealth <= 0) gameOver();
        }
    });
    bullets = bullets.filter(b => !b.hit);

    if (score >= BASE_SCORE_TO_UPGRADE) enterUpgradeScreen();
}

function shoot() {
    const count = UPGRADES.bulletCount.level;
    const currentSpeed = UPGRADES.speed.baseSpeed * (1 + UPGRADES.speed.level * 0.1);
    const currentDamage = UPGRADES.damage.baseDamage * UPGRADES.damage.level;
    const currentRadius = UPGRADES.radius.baseRadius + (UPGRADES.radius.level * 2);

    for (let i = 0; i < count; i++) {
        let angle = count > 1 ? (i - (count - 1) / 2) * 0.1 : 0;
        bullets.push({
            x: PLAYER.x, y: PLAYER.y - 10, radius: currentRadius,
            speed: currentSpeed, damage: currentDamage,
            velX: Math.sin(angle) * currentSpeed, velY: -Math.cos(angle) * currentSpeed,
            hit: false
        });
    }
}

function spawnEnemy() {
    enemies.push({
        x: Math.random() * (GAME_WIDTH - 40) + 20, y: -20,
        size: 30, speed: 2, health: ENEMY_HEALTH + (enemiesKilled / 10)
    });
}

function draw() {
    CTX.fillStyle = '#000';
    CTX.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // プレイヤー
    CTX.fillStyle = '#0f0';
    CTX.fillRect(PLAYER.x - 10, PLAYER.y - 10, 20, 20);

    // 弾丸
    bullets.forEach(b => {
        CTX.fillStyle = 'yellow';
        CTX.beginPath(); CTX.arc(b.x, b.y, b.radius, 0, Math.PI * 2); CTX.fill();
    });

    // 敵
    enemies.forEach(e => {
        CTX.fillStyle = 'red';
        CTX.fillRect(e.x - 15, e.y - 15, 30, 30);
    });

    document.getElementById('score-display').textContent = score;
    document.getElementById('health-display').textContent = playerHealth;
}

function enterUpgradeScreen() {
    isUpgrading = true;
    document.getElementById('upgrade-score').textContent = score;
    for (let key in UPGRADES) {
        document.getElementById(`lv-${key}`).textContent = UPGRADES[key].level;
        // Radiusが10ならボタンを無効化
        if (key === 'radius' && UPGRADES[key].level >= UPGRADES[key].maxLevel) {
            document.getElementById('btn-radius').disabled = true;
            document.getElementById('btn-radius').textContent = "判定拡大 MAX";
        }
    }
    document.getElementById('upgrade-screen').style.display = 'flex';
}

function closeUpgrade() {
    isUpgrading = false;
    document.getElementById('upgrade-screen').style.display = 'none';
}

window.applyUpgrade = function(type) {
    const up = UPGRADES[type];
    if (up.maxLevel && up.level >= up.maxLevel) return; // 上限チェック

    if (score >= BASE_SCORE_TO_UPGRADE) {
        score -= BASE_SCORE_TO_UPGRADE;
        up.level++;
        document.getElementById(`lv-${type}`).textContent = up.level;
        document.getElementById('upgrade-score').textContent = score;
        
        if (score < BASE_SCORE_TO_UPGRADE) closeUpgrade();
        else enterUpgradeScreen(); // 再描画
    }
};

function gameOver() {
    gameRunning = false;
    document.getElementById('final-score').textContent = score;
    document.getElementById('game-over-screen').style.display = 'flex';
}

function gameLoop(time) {
    update(16); draw();
    if (gameRunning) requestAnimationFrame(gameLoop);
}
gameLoop();

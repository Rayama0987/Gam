// --- ゲーム設定 ---
const CANVAS = document.getElementById('game-canvas');
const CTX = CANVAS.getContext('2d');
const GAME_WIDTH = CANVAS.width;
const GAME_HEIGHT = CANVAS.height;

const BASE_SCORE_TO_UPGRADE = 10; 
let score = 0; 
let playerHealth = 5;
let gameRunning = true;
let isUpgrading = false;
let isMobileSession = false; 

const BASE_ENEMY_SIZE = 30; 
const MOBILE_ENEMY_SCALE = 1.5; 

// --- プレイヤーと弾丸の設定 ---
const PLAYER = {
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT - 50,
    size: 20,
    speed: 5
};
let bullets = [];
let lastShotTime = 0;

// --- 敵の設定 ---
let enemies = [];
let enemySpawnTimer = 0;
let enemiesKilled = 0; 
const ENEMY_HEALTH = 10;
const ENEMY_VALUE = 3; 

// --- 強化レベル管理 (radiusにmaxLevel: 10を追加) ---
const UPGRADES = {
    fireRate: { level: 1, baseInterval: 400, cost: 200, label: "連射速度" }, 
    bulletCount: { level: 1, baseCount: 1, cost: 200, label: "同時弾数" },
    bounce: { level: 0, baseChance: 0.1, cost: 200, label: "バウンド弾" }, 
    damage: { level: 1, baseDamage: 1, cost: 200, label: "ダメージアップ" },        
    speed: { level: 1, baseSpeed: 10, cost: 200, label: "弾丸速度" },             
    radius: { level: 1, baseRadius: 4, cost: 200, label: "当たり判定拡大", maxLevel: 10 },
    autoAim: { level: 0, baseAimStrength: 0.005, cost: 200, label: "オートエイム" } 
};

// --- キー入力処理 ---
let keys = {};
document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault(); 
});
document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

// --- タッチ入力処理 ---
let isTouching = false; 
let touchX = GAME_WIDTH / 2; 

CANVAS.addEventListener('touchstart', (e) => {
    e.preventDefault(); 
    isMobileSession = true; 
    isTouching = true;
    if (e.touches.length > 0) {
        const rect = CANVAS.getBoundingClientRect();
        const scaleX = CANVAS.width / rect.width; 
        touchX = (e.touches[0].clientX - rect.left) * scaleX;
    }
}, { passive: false });

CANVAS.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length > 0) {
        const rect = CANVAS.getBoundingClientRect();
        const scaleX = CANVAS.width / rect.width;
        touchX = (e.touches[0].clientX - rect.left) * scaleX;
    }
}, { passive: false });

CANVAS.addEventListener('touchend', (e) => {
    isTouching = false;
}, { passive: false });

// --- ユーティリティ関数 ---
function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function getTotalUpgradeLevel() {
    let total = 0;
    for (const key in UPGRADES) total += UPGRADES[key].level;
    return total - 6; 
}

function draw() {
    CTX.fillStyle = '#000';
    CTX.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    CTX.fillStyle = 'lime';
    CTX.fillRect(PLAYER.x - PLAYER.size / 2, PLAYER.y - PLAYER.size / 2, PLAYER.size, PLAYER.size);

    bullets.forEach(bullet => {
        CTX.fillStyle = bullet.isBounce ? 'orange' : (bullet.isAim ? 'cyan' : 'yellow');
        CTX.beginPath();
        CTX.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        CTX.fill();
    });

    enemies.forEach(enemy => {
        CTX.fillStyle = 'red';
        CTX.fillRect(enemy.x - enemy.size / 2, enemy.y - enemy.size / 2, enemy.size, enemy.size);
        const healthRatio = enemy.health / ENEMY_HEALTH;
        CTX.fillStyle = 'green';
        CTX.fillRect(enemy.x - enemy.size / 2, enemy.y - enemy.size / 2 - 10, enemy.size * healthRatio, 5);
    });

    document.getElementById('score-display').textContent = Math.floor(score); 
    document.getElementById('health-display').textContent = playerHealth;
}

function update(deltaTime) {
    if (!gameRunning || isUpgrading) return;

    // 1. プレイヤーの移動
    if (isTouching) {
        const EASE_SPEED = 0.25; 
        PLAYER.x += (touchX - PLAYER.x) * EASE_SPEED;
        PLAYER.x = Math.min(GAME_WIDTH - PLAYER.size / 2, Math.max(PLAYER.size / 2, PLAYER.x));
    } else {
        if (keys['ArrowLeft'] && PLAYER.x > PLAYER.size / 2) PLAYER.x -= PLAYER.speed;
        if (keys['ArrowRight'] && PLAYER.x < GAME_WIDTH - PLAYER.size / 2) PLAYER.x += PLAYER.speed;
    }

    // 2. 発射
    const now = Date.now();
    const fireInterval = UPGRADES.fireRate.baseInterval / UPGRADES.fireRate.level; 
    let shouldShoot = isMobileSession ? true : keys['Space'];

    if (shouldShoot && (now - lastShotTime > fireInterval)) {
        shoot();
        lastShotTime = now;
    }

    // 3. 弾丸の移動
    bullets = bullets.filter(bullet => {
        if (!bullet.isBounce) bullet.y -= bullet.speed * (deltaTime / 16); 
        else {
            bullet.x += bullet.velX * (deltaTime / 16);
            bullet.y += bullet.velY * (deltaTime / 16);
        }
        return bullet.y > 0 && bullet.x > 0 && bullet.x < GAME_WIDTH; 
    });

    // 4. 敵の出現 (上限設定版: 同時20体、最速0.5秒)
    enemySpawnTimer += deltaTime;
    const baseSpawnInterval = 5000; 
    const difficultyFactor = (getTotalUpgradeLevel() / 10) + (enemiesKilled / 100);
    const spawnInterval = Math.max(500, baseSpawnInterval - difficultyFactor * 100); 
    const MAX_ENEMIES_ON_SCREEN = 20;

    while (enemySpawnTimer >= spawnInterval) {
        if (enemies.length < MAX_ENEMIES_ON_SCREEN) {
            let numEnemiesToSpawn = Math.min(1 + Math.floor(difficultyFactor / 5), 3);
            for(let i = 0; i < numEnemiesToSpawn; i++){
                if (enemies.length < MAX_ENEMIES_ON_SCREEN) spawnEnemy(i * 60); 
            }
        }
        enemySpawnTimer -= spawnInterval; 
    }
    
    // 5. 敵の移動
    enemies.forEach(enemy => {
        enemy.y += enemy.speed * (deltaTime / 16);
    });
    
    enemies = enemies.filter(enemy => {
        if (enemy.y < GAME_HEIGHT + enemy.size / 2) return true;
        else {
            playerHealth--;
            if (playerHealth <= 0) gameOver();
            return false;
        }
    });

    checkCollisions();

    if (!isUpgrading && score >= BASE_SCORE_TO_UPGRADE) enterUpgradeScreen();
}

function findClosestEnemy() {
    let closestEnemy = null;
    let minDistance = Infinity;
    enemies.forEach(enemy => {
        const dist = distance(PLAYER.x, PLAYER.y, enemy.x, enemy.y);
        if (dist < minDistance) {
            minDistance = dist;
            closestEnemy = enemy;
        }
    });
    if (closestEnemy && closestEnemy.y > GAME_HEIGHT * (2/3)) return null;
    return closestEnemy;
}

function shoot() {
    const count = UPGRADES.bulletCount.level;
    const spreadAngle = 10; 
    const currentSpeed = UPGRADES.speed.baseSpeed * UPGRADES.speed.level;
    const currentDamage = UPGRADES.damage.baseDamage * UPGRADES.damage.level;
    const currentRadius = UPGRADES.radius.baseRadius * UPGRADES.radius.level;
    
    let aimCorrection = 0;
    let isAiming = false;
    const closestEnemy = findClosestEnemy();

    if (closestEnemy && UPGRADES.autoAim.level > 0) {
        isAiming = true;
        const targetAngle = Math.atan2(closestEnemy.x - PLAYER.x, PLAYER.y - closestEnemy.y);
        aimCorrection = targetAngle * (UPGRADES.autoAim.baseAimStrength * UPGRADES.autoAim.level);
    }

    for (let i = 0; i < count; i++) {
        let angleOffset = count > 1 ? (i - (count - 1) / 2) * spreadAngle : 0;
        const angleRad = (angleOffset * (Math.PI / 180)) - aimCorrection; 
        bullets.push({
            x: PLAYER.x, y: PLAYER.y, radius: currentRadius, speed: currentSpeed, damage: currentDamage,
            velX: Math.sin(angleRad) * currentSpeed, velY: -Math.cos(angleRad) * currentSpeed, 
            isBounce: false, isAim: isAiming && count === 1 
        });
    }
}

function spawnEnemy(yOffset = 0) {
    const enemySize = isMobileSession ? BASE_ENEMY_SIZE * MOBILE_ENEMY_SCALE : BASE_ENEMY_SIZE;
    enemies.push({
        x: Math.random() * (GAME_WIDTH - 40) + 20,
        y: -15 - yOffset, size: enemySize, speed: 1.5, health: ENEMY_HEALTH
    });
}

function checkCollisions() {
    let newBullets = [];
    const totalLevel = getTotalUpgradeLevel();
    const baseValue = ENEMY_VALUE; 
    const minValue = 0.002;
    const maxReductionLevel = 150; 
    const reductionFactor = Math.min(1, totalLevel / maxReductionLevel);
    const finalEnemyValue = Math.max(minValue, baseValue - (baseValue - minValue) * reductionFactor); 

    enemies.forEach(enemy => {
        bullets.forEach(bullet => {
            if (!bullet.hit && distance(bullet.x, bullet.y, enemy.x, enemy.y) < enemy.size / 2 + bullet.radius) {
                enemy.health -= bullet.damage;
                if (!bullet.isBounce && Math.random() < UPGRADES.bounce.level * UPGRADES.bounce.baseChance) {
                    const bounceAngle = Math.random() * Math.PI * 2; 
                    newBullets.push({
                        x: bullet.x, y: bullet.y, radius: 3, speed: bullet.speed * 0.8, damage: bullet.damage / 3,
                        velX: Math.sin(bounceAngle) * (bullet.speed * 0.8), velY: Math.cos(bounceAngle) * (bullet.speed * 0.8), isBounce: true 
                    });
                }
                bullet.hit = true; 
            }
        });
    });

    enemies = enemies.filter(enemy => {
        if (enemy.health <= 0) {
            score += finalEnemyValue; 
            enemiesKilled++; 
            return false;
        }
        return true;
    });
    bullets = bullets.filter(bullet => !bullet.hit).concat(newBullets);
}

function gameOver() {
    gameRunning = false;
    document.getElementById('final-score').textContent = Math.floor(score); 
    document.getElementById('game-over-screen').style.display = 'flex';
}

function enterUpgradeScreen() {
    isUpgrading = true;
    document.getElementById('upgrade-score').textContent = Math.floor(score);
    const list = ['fireRate', 'bulletCount', 'bounce', 'damage', 'speed', 'radius', 'autoAim'];
    list.forEach(id => {
        document.getElementById(`lv-${id}`).textContent = UPGRADES[id].level;
        if (id === 'radius' && UPGRADES[id].level >= UPGRADES[id].maxLevel) {
            const btn = document.getElementById('btn-radius');
            btn.disabled = true;
            btn.textContent = `当たり判定拡大 (MAX)`;
        }
    });
    document.getElementById('upgrade-screen').style.display = 'flex';
    document.getElementById('upgrade-message').textContent = '';
}

window.applyUpgrade = function(type) {
    if (isUpgrading) {
        const upgrade = UPGRADES[type];
        if (upgrade.maxLevel && upgrade.level >= upgrade.maxLevel) return;
        if (score < BASE_SCORE_TO_UPGRADE) {
            document.getElementById('upgrade-message').textContent = 'スコアが不足しています。（必要: 10）';
            return;
        }

        upgrade.level++;
        score -= BASE_SCORE_TO_UPGRADE; 
        document.getElementById('upgrade-message').textContent = `${upgrade.label}がレベル ${upgrade.level} に強化されました！`;
        document.getElementById('score-display').textContent = Math.floor(score);
        document.getElementById('upgrade-score').textContent = Math.floor(score);
        
        const list = ['fireRate', 'bulletCount', 'bounce', 'damage', 'speed', 'radius', 'autoAim'];
        list.forEach(id => document.getElementById(`lv-${id}`).textContent = UPGRADES[id].level);

        if (type === 'radius' && upgrade.level >= upgrade.maxLevel) {
            const btn = document.getElementById('btn-radius');
            btn.disabled = true;
            btn.textContent = `当たり判定拡大 (MAX)`;
        }

        if (score >= BASE_SCORE_TO_UPGRADE) {
            document.getElementById('upgrade-message').textContent += ' さらに強化できます。';
        } else {
            setTimeout(() => {
                isUpgrading = false;
                document.getElementById('upgrade-screen').style.display = 'none';
            }, 500);
        }
    }
};

let lastTime = 0;
function gameLoop(currentTime) {
    if (lastTime === 0) lastTime = currentTime;
    let deltaTime = Math.min(currentTime - lastTime, 250);
    lastTime = currentTime;
    update(deltaTime);
    draw();
    requestAnimationFrame(gameLoop);
}

spawnEnemy(0);
gameLoop(0);

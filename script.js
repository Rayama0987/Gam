// --- ゲーム設定 ---
const CANVAS = document.getElementById('game-canvas');
const CTX = CANVAS.getContext('2d');
const GAME_WIDTH = CANVAS.width;
const GAME_HEIGHT = CANVAS.height;

const BASE_SCORE_TO_UPGRADE = 10; 
let score = 0; 
// ★修正点: 消費されない総獲得スコアを追跡する変数を追加
let totalScoreEarned = 0; 

let playerHealth = 5;
let gameRunning = true;
let isUpgrading = false;
let isMobileSession = false; 

// ★★★ 修正点: モバイル時のサイズ倍率を 1.5 に変更 ★★★
const BASE_ENEMY_SIZE = 30; // 敵の基本サイズ
const MOBILE_ENEMY_SCALE = 1.5; // モバイル時のサイズ倍率

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

// --- 強化レベル管理 ---
const UPGRADES = {
    fireRate: { level: 1, baseInterval: 400, cost: 200, label: "連射速度" }, 
    bulletCount: { level: 1, baseCount: 1, cost: 200, label: "同時弾数" },
    bounce: { level: 0, baseChance: 0.1, cost: 200, label: "バウンド弾" }, 
    damage: { level: 1, baseDamage: 1, cost: 200, label: "ダメージアップ" },        
    speed: { level: 1, baseSpeed: 10, cost: 200, label: "弾丸速度" },             
    radius: { level: 1, baseRadius: 4, cost: 200, label: "当たり判定拡大" },
    autoAim: { level: 0, baseAimStrength: 0.005, cost: 200, label: "オートエイム" } 
};

// --- キー入力処理 (PC操作を維持) ---
let keys = {};
document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') {
        e.preventDefault(); 
    }
});
document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

// ★★★ タッチ入力処理 ★★★
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
// ★★★ ここまでタッチ入力 ★★★

// --- ユーティリティ関数 ---

function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function getTotalUpgradeLevel() {
    let total = 0;
    for (const key in UPGRADES) {
        total += UPGRADES[key].level;
    }
    return total - 6; 
}

/**
 * 描画
 */
function draw() {
    CTX.fillStyle = '#000';
    CTX.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    CTX.fillStyle = 'lime';
    CTX.fillRect(PLAYER.x - PLAYER.size / 2, PLAYER.y - PLAYER.size / 2, PLAYER.size, PLAYER.size);

    bullets.forEach(bullet => {
        if (bullet.isBounce) {
            CTX.fillStyle = 'orange'; 
        } else if (bullet.isAim) {
            CTX.fillStyle = 'cyan'; 
        } else {
            CTX.fillStyle = 'yellow';
        }
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

/**
 * ゲームロジックの更新
 */
function update(deltaTime) {
    if (!gameRunning || isUpgrading) return;

    // 1. プレイヤーの移動 (スムーズ追従を維持)
    if (isTouching) {
        const EASE_SPEED = 0.25; 
        PLAYER.x += (touchX - PLAYER.x) * EASE_SPEED;
        PLAYER.x = Math.min(GAME_WIDTH - PLAYER.size / 2, Math.max(PLAYER.size / 2, PLAYER.x));
    } else {
        if (keys['ArrowLeft'] && PLAYER.x > PLAYER.size / 2) {
            PLAYER.x -= PLAYER.speed;
        }
        if (keys['ArrowRight'] && PLAYER.x < GAME_WIDTH - PLAYER.size / 2) {
            PLAYER.x += PLAYER.speed;
        }
    }

    // 2. 発射 (常時連射を維持)
    const now = Date.now();
    const fireInterval = UPGRADES.fireRate.baseInterval / UPGRADES.fireRate.level; 

    let shouldShoot = false;
    
    if (isMobileSession) {
        shouldShoot = true; 
    } 
    else {
        shouldShoot = keys['Space'];
    }

    if (shouldShoot && (now - lastShotTime > fireInterval)) {
        shoot();
        lastShotTime = now;
    }

    // 3. 弾丸の移動 (変更なし)
    bullets = bullets.filter(bullet => {
        if (!bullet.isBounce) {
            bullet.y -= bullet.speed * (deltaTime / 16); 
        }
        else {
            bullet.x += bullet.velX * (deltaTime / 16);
            bullet.y += bullet.velY * (deltaTime / 16);
        }

        return bullet.y > 0 && bullet.x > 0 && bullet.x < GAME_WIDTH; 
    });

    // 4. 敵の出現 (変更なし)
    enemySpawnTimer += deltaTime;
    const baseSpawnInterval = 5000; 
    
    const difficultyFactor = (getTotalUpgradeLevel() / 10) + (enemiesKilled / 100);
    const spawnInterval = Math.max(200, baseSpawnInterval - difficultyFactor * 100); 

    while (enemySpawnTimer >= spawnInterval) {
        
        let numEnemiesToSpawn = 1 + Math.floor(difficultyFactor / 5);
        if (numEnemiesToSpawn < 1) {
            numEnemiesToSpawn = 1; 
        }

        for(let i = 0; i < numEnemiesToSpawn; i++){
            spawnEnemy(i * 60); 
        }

        enemySpawnTimer -= spawnInterval; 
    }
    
    // 5. 敵の移動 (変更なし)
    enemies.forEach(enemy => {
        enemy.y += enemy.speed * (deltaTime / 16);
    });
    
    enemies = enemies.filter(enemy => {
        if (enemy.y < GAME_HEIGHT + enemy.size / 2) {
            return true;
        } else {
            playerHealth--;
            if (playerHealth <= 0) {
                gameOver();
            }
            return false;
        }
    });

    // 6. 衝突判定と処理
    checkCollisions();

    // 7. 強化画面のチェック
    if (!isUpgrading && score >= BASE_SCORE_TO_UPGRADE) {
        enterUpgradeScreen();
    }
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

    if (closestEnemy && closestEnemy.y > GAME_HEIGHT * (2/3)) {
        return null;
    }

    return closestEnemy;
}


/**
 * 弾丸の発射処理 
 */
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
        let angleOffset = 0;
        if (count > 1) {
            angleOffset = (i - (count - 1) / 2) * spreadAngle;
        }
        
        const angleRad = (angleOffset * (Math.PI / 180)) - aimCorrection; 

        bullets.push({
            x: PLAYER.x,
            y: PLAYER.y,
            radius: currentRadius,
            speed: currentSpeed,
            damage: currentDamage,
            velX: Math.sin(angleRad) * currentSpeed,
            velY: -Math.cos(angleRad) * currentSpeed, 
            isBounce: false,
            isAim: isAiming && count === 1 
        });
    }
}

/**
 * 敵の出現処理 
 */
function spawnEnemy(yOffset = 0) {
    // モバイル環境で敵サイズを拡大 (1.5倍)
    const enemySize = isMobileSession ? BASE_ENEMY_SIZE * MOBILE_ENEMY_SCALE : BASE_ENEMY_SIZE;
    
    enemies.push({
        x: Math.random() * (GAME_WIDTH - 40) + 20,
        y: -15 - yOffset, 
        size: enemySize, 
        speed: 1.5, 
        health: ENEMY_HEALTH
    });
}

/**
 * 衝突判定とダメージ処理 
 */
function checkCollisions() {
    let newBullets = [];
    
    // スコア減少ロジック (維持)
    const totalLevel = getTotalUpgradeLevel();
    const baseValue = ENEMY_VALUE; 
    const minValue = 0.002;
    const maxReductionLevel = 200; 
    
    const reductionFactor = Math.min(1, totalLevel / maxReductionLevel);
    const currentEnemyValue = baseValue - (baseValue - minValue) * reductionFactor;
    const finalEnemyValue = Math.max(minValue, currentEnemyValue); 


    enemies.forEach(enemy => {
        bullets.forEach(bullet => {
            if (!bullet.hit && distance(bullet.x, bullet.y, enemy.x, enemy.y) < enemy.size / 2 + bullet.radius) {
                
                enemy.health -= bullet.damage;
                
                // バウンド処理の適用
                if (!bullet.isBounce && Math.random() < UPGRADES.bounce.level * UPGRADES.bounce.baseChance) {
                    
                    for (let i = 0; i < 1; i++) { 
                        const bounceAngle = Math.random() * Math.PI * 2; 
                        const bounceDamage = bullet.damage / 3;
                        const bounceSpeed = bullet.speed * 0.8; 
                        
                        newBullets.push({
                            x: bullet.x,
                            y: bullet.y,
                            radius: 3,
                            speed: bounceSpeed,
                            damage: bounceDamage, 
                            velX: Math.sin(bounceAngle) * bounceSpeed,
                            velY: Math.cos(bounceAngle) * bounceSpeed, 
                            isBounce: true 
                        });
                    }
                }
                
                bullet.hit = true; 
            }
        });
    });

    enemies = enemies.filter(enemy => {
        if (enemy.health <= 0) {
            score += finalEnemyValue; 
            // ★修正点: 倒した時のポイントを総獲得スコアにも加算する
            totalScoreEarned += finalEnemyValue; 
            enemiesKilled++; 
            return false;
        }
        return true;
    });
    
    bullets = bullets.filter(bullet => !bullet.hit).concat(newBullets);
}

/**
 * ゲームオーバー処理 
 */
function gameOver() {
    gameRunning = false;
    // ★修正点: 最終スコアとして totalScoreEarned を表示する
    document.getElementById('final-score').textContent = Math.floor(totalScoreEarned); 
    document.getElementById('game-over-screen').style.display = 'flex';
}

// --- 強化画面処理 ---
function enterUpgradeScreen() {
    isUpgrading = true;
    document.getElementById('upgrade-score').textContent = Math.floor(score);
    
    document.getElementById('lv-fireRate').textContent = UPGRADES.fireRate.level;
    document.getElementById('lv-bulletCount').textContent = UPGRADES.bulletCount.level;
    document.getElementById('lv-bounce').textContent = UPGRADES.bounce.level;
    document.getElementById('lv-damage').textContent = UPGRADES.damage.level;
    document.getElementById('lv-speed').textContent = UPGRADES.speed.level;
    document.getElementById('lv-radius').textContent = UPGRADES.radius.level;
    document.getElementById('lv-autoAim').textContent = UPGRADES.autoAim.level; 

    document.getElementById('upgrade-screen').style.display = 'flex';
    document.getElementById('upgrade-message').textContent = '';
}

window.applyUpgrade = function(type) {
    if (isUpgrading) {
        if (score < BASE_SCORE_TO_UPGRADE) {
            document.getElementById('upgrade-message').textContent = 'スコアが不足しています。（必要: 10）';
            return;
        }

        UPGRADES[type].level++;
        score -= BASE_SCORE_TO_UPGRADE; 
        
        document.getElementById('upgrade-message').textContent = 
            `${UPGRADES[type].label}がレベル ${UPGRADES[type].level} に強化されました！`;

        document.getElementById('score-display').textContent = Math.floor(score);
        document.getElementById('upgrade-score').textContent = Math.floor(score);

        document.getElementById('lv-fireRate').textContent = UPGRADES.fireRate.level;
        document.getElementById('lv-bulletCount').textContent = UPGRADES.bulletCount.level;
        document.getElementById('lv-bounce').textContent = UPGRADES.bounce.level;
        document.getElementById('lv-damage').textContent = UPGRADES.damage.level;
        document.getElementById('lv-speed').textContent = UPGRADES.speed.level;
        document.getElementById('lv-radius').textContent = UPGRADES.radius.level;
        document.getElementById('lv-autoAim').textContent = UPGRADES.autoAim.level; 


        if (score >= BASE_SCORE_TO_UPGRADE) {
            document.getElementById('upgrade-message').textContent += ' さらに強化できます。';
        } else {
            isUpgrading = false;
            document.getElementById('upgrade-screen').style.display = 'none';
        }
    }
};


// --- メインゲームループ ---
let lastTime = 0;
function gameLoop(currentTime) {
    if (lastTime === 0) {
        lastTime = currentTime;
    }
    
    let deltaTime = currentTime - lastTime;
    if (deltaTime > 250) {
        deltaTime = 250; 
    }
    lastTime = currentTime;

    update(deltaTime);
    draw();

    requestAnimationFrame(gameLoop);
}

// --- 初期化処理 ---
spawnEnemy(0);

enemySpawnTimer = 0; 

// ゲーム開始
gameLoop(0);


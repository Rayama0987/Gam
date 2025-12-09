// --- ゲーム設定 ---
const CANVAS = document.getElementById('game-canvas');
const CTX = CANVAS.getContext('2d');
const GAME_WIDTH = CANVAS.width;
const GAME_HEIGHT = CANVAS.height;

const BASE_SCORE_TO_UPGRADE = 10; 
let score = 0;
let playerHealth = 3;
let gameRunning = true;
let isUpgrading = false;

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
let enemiesKilled = 0; // 撃破数を追跡するためのカウンター
const ENEMY_HEALTH = 10;
const ENEMY_VALUE = 3; // 撃破スコア

// --- 強化レベル管理 ---
const UPGRADES = {
    fireRate: { level: 1, baseInterval: 400, cost: 200, label: "連射速度" }, // ms
    bulletCount: { level: 1, baseCount: 1, cost: 200, label: "同時弾数" },
    bounce: { level: 0, baseChance: 0.1, cost: 200, label: "バウンド弾" }, // 10%
    damage: { level: 1, baseDamage: 1, cost: 200, label: "ダメージアップ" },        
    speed: { level: 1, baseSpeed: 10, cost: 200, label: "弾丸速度" },             
    radius: { level: 1, baseRadius: 4, cost: 200, label: "当たり判定拡大" },
    };

// --- キー入力処理 ---
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

// ★★★ タッチ入力処理の追加（変更なし） ★★★
let isTouching = false; // タッチされているか
let touchX = GAME_WIDTH / 2; // タッチされたX座標

CANVAS.addEventListener('touchstart', (e) => {
    e.preventDefault(); 
    isTouching = true;
    if (e.touches.length > 0) {
        const rect = CANVAS.getBoundingClientRect();
        touchX = e.touches[0].clientX - rect.left;
    }
}, { passive: false });

CANVAS.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length > 0) {
        const rect = CANVAS.getBoundingClientRect();
        touchX = e.touches[0].clientX - rect.left;
    }
}, { passive: false });

CANVAS.addEventListener('touchend', (e) => {
    isTouching = false;
}, { passive: false });
// ★★★ ここまで ★★★

// --- ユーティリティ関数 ---

/**
 * 2点間の距離を計算する
 */
function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/**
 * すべての強化レベルの合計を計算する
 */
function getTotalUpgradeLevel() {
    let total = 0;
    for (const key in UPGRADES) {
        total += UPGRADES[key].level;
    }
    // ★★★ autoAim 削除に伴い、基本レベルの合計値を変更 (以前: 6 => 修正後: 5) ★★★
    // 強化レベル1が5項目 (fireRate, bulletCount, damage, speed, radius)
    // 強化レベル0が1項目 (bounce)
    // 合計: 5 * 1 + 1 * 0 = 5
    return total - 5; 
}

/**
 * 描画
 */
function draw() {
    // 1. 背景をクリア
    CTX.fillStyle = '#000';
    CTX.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // 2. プレイヤーの描画
    CTX.fillStyle = 'lime';
    CTX.fillRect(PLAYER.x - PLAYER.size / 2, PLAYER.y - PLAYER.size / 2, PLAYER.size, PLAYER.size);

    // 3. 弾丸の描画
    bullets.forEach(bullet => {
        if (bullet.isBounce) {
            CTX.fillStyle = 'orange'; 
        } else {
            // ★★★ isAim のチェックを削除 (全て通常弾またはバウンド弾) ★★★
            CTX.fillStyle = 'yellow';
        }
        CTX.beginPath();
        CTX.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        CTX.fill();
    });

    // 4. 敵の描画
    enemies.forEach(enemy => {
        CTX.fillStyle = 'red';
        CTX.fillRect(enemy.x - enemy.size / 2, enemy.y - enemy.size / 2, enemy.size, enemy.size);
        
        // ヘルスバーを描画
        const healthRatio = enemy.health / ENEMY_HEALTH;
        CTX.fillStyle = 'green';
        CTX.fillRect(enemy.x - enemy.size / 2, enemy.y - enemy.size / 2 - 10, enemy.size * healthRatio, 5);
    });

    // 5. HUDの更新
    document.getElementById('score-display').textContent = score;
    document.getElementById('health-display').textContent = playerHealth;
}

/**
 * ゲームロジックの更新
 */
function update(deltaTime) {
    if (!gameRunning || isUpgrading) return;

    // 1. プレイヤーの移動
    if (isTouching) {
        // タッチされたX座標へ即座にテレポート (画面内に制限)
        PLAYER.x = Math.min(GAME_WIDTH - PLAYER.size / 2, Math.max(PLAYER.size / 2, touchX));
    } else {
        // キーボード操作 (タッチ操作がない場合のみ)
        if (keys['ArrowLeft'] && PLAYER.x > PLAYER.size / 2) {
            PLAYER.x -= PLAYER.speed;
        }
        if (keys['ArrowRight'] && PLAYER.x < GAME_WIDTH - PLAYER.size / 2) {
            PLAYER.x += PLAYER.speed;
        }
    }

    // 2. 発射
    if (keys['Space'] || isTouching) { 
        const now = Date.now();
        const fireInterval = UPGRADES.fireRate.baseInterval / UPGRADES.fireRate.level; 

        if (now - lastShotTime > fireInterval) {
            shoot();
            lastShotTime = now;
        }
    }

    // 3. 弾丸の移動
    bullets = bullets.filter(bullet => {
        // バウンドしていない通常弾の移動 (Y軸のみ)
        if (!bullet.isBounce) {
            bullet.y -= bullet.speed * (deltaTime / 16); 
        }
        // バウンド弾の移動 (velX, velY を使用)
        else {
            bullet.x += bullet.velX * (deltaTime / 16);
            bullet.y += bullet.velY * (deltaTime / 16);
        }

        // 画面内にいる弾丸だけを残す
        return bullet.y > 0 && bullet.x > 0 && bullet.x < GAME_WIDTH; 
    });

    // 4. 敵の出現
    enemySpawnTimer += deltaTime;
    const baseSpawnInterval = 5000; 
    
    // 総合レベルと撃破数に基づいて難易度を上げる
    const difficultyFactor = (getTotalUpgradeLevel() / 10) + (enemiesKilled / 100);
    // 最小間隔を 200ms とし、難易度に応じて間隔を短縮
    const spawnInterval = Math.max(200, baseSpawnInterval - difficultyFactor * 100); 

    // whileループに変更: 経過時間に応じて敵の出現処理を確実に実行
    while (enemySpawnTimer >= spawnInterval) {
        
        // 総合レベルと撃破数に基づいて出現数を増やす
        let numEnemiesToSpawn = 1 + Math.floor(difficultyFactor / 5);
        // 最低でも1体は出現するように保証
        if (numEnemiesToSpawn < 1) {
            numEnemiesToSpawn = 1; 
        }

        for(let i = 0; i < numEnemiesToSpawn; i++){
            // Y軸オフセットを使って、少しずらして出現させる
            spawnEnemy(i * 60); 
        }

        enemySpawnTimer -= spawnInterval; 
    }
    
    // 5. 敵の移動
    enemies.forEach(enemy => {
        enemy.y += enemy.speed * (deltaTime / 16);
    });
    
    // 画面外に出た敵の処理 (プレイヤーへのダメージ)
    enemies = enemies.filter(enemy => {
        if (enemy.y < GAME_HEIGHT + enemy.size / 2) {
            return true;
        } else {
            // 敵が画面下端に到達 = ダメージ
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



/**
 * 弾丸の発射処理 (強化を考慮)
 */
function shoot() {
    const count = UPGRADES.bulletCount.level;
    const spreadAngle = 10; 
    const currentSpeed = UPGRADES.speed.baseSpeed * UPGRADES.speed.level;
    const currentDamage = UPGRADES.damage.baseDamage * UPGRADES.damage.level;
    const currentRadius = UPGRADES.radius.baseRadius * UPGRADES.radius.level;
    

    for (let i = 0; i < count; i++) {
        let angleOffset = 0;
        if (count > 1) {
            angleOffset = (i - (count - 1) / 2) * spreadAngle;
        }
        
        // ★★★ オートエイム補正を削除し、純粋なスプレッド角度のみを適用 ★★★
        const angleRad = angleOffset * (Math.PI / 180); 

        bullets.push({
            x: PLAYER.x,
            y: PLAYER.y,
            radius: currentRadius,
            speed: currentSpeed,
            damage: currentDamage,
            velX: Math.sin(angleRad) * currentSpeed,
            velY: -Math.cos(angleRad) * currentSpeed, // プレイヤーは上方向 (-Y) に撃つ
            isBounce: false,
            isAim: false // オートエイムは無いため常に false
        });
    }
}

/**
 * 敵の出現処理 (Y軸オフセットを追加)
 */
function spawnEnemy(yOffset = 0) {
    enemies.push({
        x: Math.random() * (GAME_WIDTH - 40) + 20,
        y: -15 - yOffset, // 画面上端近くから出現
        size: 30,
        speed: 1.5, // 安定した移動速度
        health: ENEMY_HEALTH
    });
}

/**
 * 衝突判定とダメージ処理
 */
function checkCollisions() {
    let newBullets = [];
    enemies.forEach(enemy => {
        bullets.forEach(bullet => {
            // 衝突判定 (弾丸はヒットフラグを持っていないもののみ判定)
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
                
                bullet.hit = true; // 弾丸はヒットした
            }
        });
    });

    // 撃破された敵とヒットした弾丸をフィルタリング
    enemies = enemies.filter(enemy => {
        if (enemy.health <= 0) {
            score += ENEMY_VALUE;
            enemiesKilled++; // 撃破数をカウント
            return false;
        }
        return true;
    });
    
    // ヒットしなかった弾丸と新しく生成されたバウンド弾を結合
    bullets = bullets.filter(bullet => !bullet.hit).concat(newBullets);
}

/**
 * ゲームオーバー処理
 */
function gameOver() {
    gameRunning = false;
    document.getElementById('final-score').textContent = score;
    document.getElementById('game-over-screen').style.display = 'flex';
}

// --- 強化画面処理 ---

/**
 * 強化画面に移行する
 */
function enterUpgradeScreen() {
    isUpgrading = true;
    document.getElementById('upgrade-score').textContent = score;
    
    // 現在のレベル表示を更新
    document.getElementById('lv-fireRate').textContent = UPGRADES.fireRate.level;
    document.getElementById('lv-bulletCount').textContent = UPGRADES.bulletCount.level;
    document.getElementById('lv-bounce').textContent = UPGRADES.bounce.level;
    document.getElementById('lv-damage').textContent = UPGRADES.damage.level;
    document.getElementById('lv-speed').textContent = UPGRADES.speed.level;
    document.getElementById('lv-radius').textContent = UPGRADES.radius.level;
    // ★★★ lv-autoAim の表示更新を削除しました ★★★

    document.getElementById('upgrade-screen').style.display = 'flex';
    document.getElementById('upgrade-message').textContent = '';
}

/**
 * 強化を適用し、スコアが 200 以上なら強化画面を維持する
 */
window.applyUpgrade = function(type) {
    // ★★★ 存在しないアップグレード ('autoAim') の呼び出しを防ぐためのチェックを追加 ★★★
    if (!UPGRADES[type]) {
        console.error("Unknown upgrade type:", type);
        return;
    }
    
    if (isUpgrading) {
        if (score < BASE_SCORE_TO_UPGRADE) {
            document.getElementById('upgrade-message').textContent = 'スコアが不足しています。（必要: 200）';
            return;
        }

        UPGRADES[type].level++;
        score -= BASE_SCORE_TO_UPGRADE; 
        
        document.getElementById('upgrade-message').textContent = 
            `${UPGRADES[type].label}がレベル ${UPGRADES[type].level} に強化されました！`;

        // スコア表示を更新
        document.getElementById('score-display').textContent = score;
        document.getElementById('upgrade-score').textContent = score;

        // 強化レベル表示を再度更新
        document.getElementById('lv-fireRate').textContent = UPGRADES.fireRate.level;
        document.getElementById('lv-bulletCount').textContent = UPGRADES.bulletCount.level;
        document.getElementById('lv-bounce').textContent = UPGRADES.bounce.level;
        document.getElementById('lv-damage').textContent = UPGRADES.damage.level;
        document.getElementById('lv-speed').textContent = UPGRADES.speed.level;
        document.getElementById('lv-radius').textContent = UPGRADES.radius.level;
        // ★★★ lv-autoAim の表示更新を削除しました ★★★


        // スコアがまだ200以上あれば、強化画面を維持して連続強化可能にする
        if (score >= BASE_SCORE_TO_UPGRADE) {
            document.getElementById('upgrade-message').textContent += ' さらに強化できます。';
        } else {
             // 200スコア未満になったらゲーム画面に戻る
            isUpgrading = false;
            document.getElementById('upgrade-screen').style.display = 'none';
        }
    }
};


// --- メインゲームループ ---
let lastTime = 0;
function gameLoop(currentTime) {
    // deltaTimeが大きくなりすぎないように制限
    if (lastTime === 0) {
        lastTime = currentTime;
    }
    
    let deltaTime = currentTime - lastTime;
    // 最大 250ms に制限
    if (deltaTime > 250) {
        deltaTime = 250; 
    }
    lastTime = currentTime;

    update(deltaTime);
    draw();

    requestAnimationFrame(gameLoop);
}

// --- 初期化処理 ---
// ゲーム開始直後、敵を1体だけ画面上部に強制的に配置する
enemies.push({
    x: GAME_WIDTH / 2,
    y: 50, // Y=50 (画面上部) に直接配置し、すぐに見えるようにする
    size: 30,
    speed: 1.5,
    health: ENEMY_HEALTH
});

// 💡 修正: 強制配置したため、タイマーをリセットしてすぐに次の敵が出ないようにする 💡
enemySpawnTimer = 0; 

// ゲーム開始
gameLoop(0);


// --- ゲーム設定 (定数) ---
const CANVAS = document.getElementById('game-canvas');
const CTX = CANVAS.getContext('2d');
const GAME_WIDTH = CANVAS.width;
const GAME_HEIGHT = CANVAS.height;

const BASE_SCORE_TO_UPGRADE = 10; 
const ENEMY_HEALTH = 10;
const ENEMY_VALUE = 3;
const BASE_ENEMY_SIZE = 30;
const MOBILE_ENEMY_SCALE = 1.5;

// --- グローバル状態 ---
let gameRunning = false; // 初期状態は停止
let isUpgrading = false;
let isMobileSession = false; 
let isMultiplayer = false; // マルチプレイヤーモードフラグ
let lastTime = 0; // ゲームループ用

// --- プレイヤーとマルチプレイヤー管理 ---
const PLAYER_COLORS = ['lime', 'cyan', 'red', 'yellow']; // P1:lime, P2:cyan, P3:red, P4:yellow
// プレイヤーの操作キー設定 (ローカルマルチプレイ用)
const INPUT_KEYS = [
    // P1 (lime): WASD (移動) + Space (射撃)
    { LEFT: 'KeyA', RIGHT: 'KeyD', SHOOT: 'Space' }, 
    // P2 (cyan): Arrows (移動) + Enter (射撃)
    { LEFT: 'ArrowLeft', RIGHT: 'ArrowRight', SHOOT: 'Enter' }, 
    // P3 (red): Numpad7 (移動) + Numpad9 (移動) + Numpad8 (射撃)
    { LEFT: 'Numpad7', RIGHT: 'Numpad9', SHOOT: 'Numpad8' }, 
    // P4 (yellow): I (移動) + P (移動) + O (射撃)
    { LEFT: 'KeyI', RIGHT: 'KeyP', SHOOT: 'KeyO' }, 
];
let players = []; // プレイヤーオブジェクトの配列
let localPlayerId = 0; // 現在操作しているプレイヤーのID (ローカルシミュレーションで使用)

// プレイヤーの基本構造
function createPlayer(id, color) {
    // 強化コストはBASE_SCORE_TO_UPGRADE (10)に統一
    const baseCost = BASE_SCORE_TO_UPGRADE;
    return {
        id: id,
        color: color,
        x: GAME_WIDTH / (PLAYER_COLORS.length + 1) * (id + 1), 
        y: GAME_HEIGHT - 50,
        size: 20,
        speed: 5,
        health: 5,
        score: 0, 
        totalScoreEarned: 0, 
        lastShotTime: 0,
        bullets: [],
        upgrades: {
            fireRate: { level: 1, baseInterval: 400, cost: baseCost, label: "連射速度" }, 
            bulletCount: { level: 1, baseCount: 1, cost: baseCost, label: "同時弾数" },
            bounce: { level: 0, baseChance: 0.1, cost: baseCost, label: "バウンド弾" }, 
            damage: { level: 1, baseDamage: 1, cost: baseCost, label: "ダメージアップ" },        
            speed: { level: 1, baseSpeed: 10, cost: baseCost, label: "弾丸速度" },             
            radius: { level: 1, baseRadius: 4, cost: baseCost, label: "当たり判定拡大" },
            autoAim: { level: 0, baseAimStrength: 0.005, cost: baseCost, label: "オートエイム" }
            // healthRecover はマルチプレイヤーでのみ動的に追加
        }
    };
}

// --- 敵と弾丸 (共有) ---
let enemies = [];
let enemySpawnTimer = 0;
let enemiesKilled = 0; 
let keys = {};

// --- イベントリスナー (キー入力、タッチ入力) ---
document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Numpad8' || e.code === 'KeyO') {
        e.preventDefault(); 
    }
});
document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

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

function getTotalUpgradeLevel(player) {
    let total = 0;
    for (const key in player.upgrades) {
        // healthRecoverはレベルを持たないのでスキップ
        total += player.upgrades[key].level || 0;
    }
    // 初期レベルの合計 (5項目が初期1)を引く
    return total - 5; 
}


// --- 描画と更新 ---

/**
 * 描画
 */
function draw() {
    CTX.fillStyle = '#000';
    CTX.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // 1. プレイヤーの描画
    players.forEach(player => {
        if (player.health <= 0) return;
        CTX.fillStyle = player.color;
        CTX.fillRect(player.x - player.size / 2, player.y - player.size / 2, player.size, player.size);
    });

    // 2. 弾丸の描画 (全てのプレイヤーの弾丸)
    players.forEach(player => {
        player.bullets.forEach(bullet => {
            let bulletColor = player.color;
            if (bullet.isBounce) {
                bulletColor = 'orange'; 
            } else if (bullet.isAim) {
                bulletColor = 'cyan'; 
            }
            CTX.fillStyle = bulletColor; 
            CTX.beginPath();
            CTX.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
            CTX.fill();
        });
    });

    // 3. 敵の描画
    enemies.forEach(enemy => {
        CTX.fillStyle = 'red';
        CTX.fillRect(enemy.x - enemy.size / 2, enemy.y - enemy.size / 2, enemy.size, enemy.size);
        
        const healthRatio = enemy.health / ENEMY_HEALTH;
        CTX.fillStyle = 'green';
        CTX.fillRect(enemy.x - enemy.size / 2, enemy.y - enemy.size / 2 - 10, enemy.size * healthRatio, 5);
    });

    // 4. HUDの更新
    updateHUD();
}

/**
 * HUDの更新 (マルチプレイヤー対応)
 */
function updateHUD() {
    const container = document.getElementById('player-stats-container');
    container.innerHTML = '';
    
    players.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-info';
        
        let statusColor = player.health <= 0 ? 'gray' : player.color;
        
        // シングルプレイヤーモードの場合は、P1のみ表示し、タイトルをシンプルにする
        const playerLabel = isMultiplayer ? `P${player.id + 1} (${player.color})` : `プレイヤー`;

        playerDiv.innerHTML = `
            <span style="color: ${statusColor}; font-weight: bold;">${playerLabel}</span>
            <span style="color: ${statusColor};">スコア: ${Math.floor(player.score)}</span>
            <span style="color: ${statusColor};">体力: ${player.health}</span>
        `;
        
        if (isMultiplayer || player.id === 0) {
             container.appendChild(playerDiv);
        }
    });
}


/**
 * ゲームロジックの更新
 */
function update(deltaTime) {
    const activePlayers = players.filter(p => p.health > 0);
    if (!gameRunning || isUpgrading) {
        if (gameRunning && activePlayers.length === 0) {
            gameOver();
        }
        return;
    }
    
    // 全員死亡時のゲームオーバーチェック
    if (activePlayers.length === 0) {
        gameOver();
        return;
    }

    // 1. プレイヤーの移動と発射
    players.forEach(player => {
        if (player.health <= 0) return; 

        // 移動
        if (isMultiplayer || player.id === 0) { // シングルモードではP1のみタッチ操作
            if (player.id === 0 && isTouching) { 
                const EASE_SPEED = 0.25; 
                player.x += (touchX - player.x) * EASE_SPEED;
                player.x = Math.min(GAME_WIDTH - player.size / 2, Math.max(player.size / 2, player.x));
            } else {
                const playerKeys = INPUT_KEYS[player.id];
                if (keys[playerKeys.LEFT] && player.x > player.size / 2) {
                    player.x -= player.speed;
                }
                if (keys[playerKeys.RIGHT] && player.x < GAME_WIDTH - player.size / 2) {
                    player.x += player.speed;
                }
            }
        }

        // 発射
        const now = Date.now();
        const fireInterval = player.upgrades.fireRate.baseInterval / player.upgrades.fireRate.level; 
        const playerKeys = INPUT_KEYS[player.id];
        
        let shouldShoot = false;
        if (player.id === 0 && isMobileSession) {
            shouldShoot = true; 
        } else {
            shouldShoot = keys[playerKeys.SHOOT];
        }

        if (shouldShoot && (now - player.lastShotTime > fireInterval)) {
            shoot(player);
            player.lastShotTime = now;
        }

        // 弾丸の移動
        player.bullets = player.bullets.filter(bullet => {
            if (!bullet.isBounce) {
                bullet.y -= bullet.speed * (deltaTime / 16); 
            } else {
                bullet.x += bullet.velX * (deltaTime / 16);
                bullet.y += bullet.velY * (deltaTime / 16);
            }
            return bullet.y > 0 && bullet.x > 0 && bullet.x < GAME_WIDTH; 
        });
    });


    // 2. 敵の出現 (プレイヤー数に応じて難易度調整)
    const activePlayerCount = activePlayers.length;
    
    enemySpawnTimer += deltaTime;
    const baseSpawnInterval = 5000; 
    
    // プレイヤー数と倒した敵の数に応じて難易度上昇
    const difficultyFactor = (activePlayerCount * 0.5) + (enemiesKilled / 100); 
    const spawnInterval = Math.max(200, baseSpawnInterval - difficultyFactor * 100); 

    while (enemySpawnTimer >= spawnInterval) {
        
        let numEnemiesToSpawn = Math.max(1, Math.floor(difficultyFactor / 5)); 
        
        for(let i = 0; i < numEnemiesToSpawn; i++){
            spawnEnemy(i * 60); 
        }

        enemySpawnTimer -= spawnInterval; 
    }
    
    // 3. 敵の移動とプレイヤーの体力減少
    enemies.forEach(enemy => {
        enemy.y += enemy.speed * (deltaTime / 16);
    });
    
    enemies = enemies.filter(enemy => {
        if (enemy.y < GAME_HEIGHT + enemy.size / 2) {
            return true;
        } else {
            // 最も体力が低いプレイヤーにダメージを与える (シングル時は自分自身)
            const alivePlayers = players.filter(p => p.health > 0);
            if (alivePlayers.length > 0) {
                let lowestHealthPlayer = alivePlayers.reduce((minP, currentP) => 
                    (currentP.health < minP.health) ? currentP : minP
                );
                lowestHealthPlayer.health--;
            }
            return false;
        }
    });

    // 4. 衝突判定と処理
    checkCollisions();

    // 5. 強化画面のチェック (強化はシングル/マルチ問わず、現在スコアが基準に達したプレイヤーが即時実行)
    players.forEach(player => {
        if (!isUpgrading && player.health > 0 && player.score >= BASE_SCORE_TO_UPGRADE) {
            enterUpgradeScreen(player.id);
        }
    });
}

function findClosestEnemy() {
    let closestEnemy = null;
    let minDistance = Infinity;

    // 現在操作しているプレイヤーの位置を基準にする (ローカルマルチのP1またはシングルプレイヤー)
    const player = players[localPlayerId]; 

    enemies.forEach(enemy => {
        const dist = distance(player.x, player.y, enemy.x, enemy.y);
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
function shoot(player) {
    const { upgrades } = player;

    const count = upgrades.bulletCount.level;
    const spreadAngle = 10; 
    const currentSpeed = upgrades.speed.baseSpeed * upgrades.speed.level;
    const currentDamage = upgrades.damage.baseDamage * upgrades.damage.level;
    const currentRadius = upgrades.radius.baseRadius * upgrades.radius.level;
    
    let aimCorrection = 0;
    let isAiming = false;
    const closestEnemy = findClosestEnemy();

    if (closestEnemy && upgrades.autoAim.level > 0) {
        isAiming = true;
        const targetAngle = Math.atan2(closestEnemy.x - player.x, player.y - closestEnemy.y);
        aimCorrection = targetAngle * (upgrades.autoAim.baseAimStrength * upgrades.autoAim.level);
    }

    for (let i = 0; i < count; i++) {
        let angleOffset = 0;
        if (count > 1) {
            angleOffset = (i - (count - 1) / 2) * spreadAngle;
        }
        
        const angleRad = (angleOffset * (Math.PI / 180)) - aimCorrection; 

        player.bullets.push({
            x: player.x,
            y: player.y,
            radius: currentRadius,
            speed: currentSpeed,
            damage: currentDamage,
            velX: Math.sin(angleRad) * currentSpeed,
            velY: -Math.cos(angleRad) * currentSpeed, 
            isBounce: false,
            isAim: isAiming && count === 1,
            ownerId: player.id 
        });
    }
}

/**
 * 敵の出現処理 
 */
function spawnEnemy(yOffset = 0) {
    const enemySize = isMobileSession ? BASE_ENEMY_SIZE * MOBILE_ENEMY_SCALE : BASE_ENEMY_SIZE;
    
    enemies.push({
        x: Math.random() * (GAME_WIDTH - 40) + 20,
        y: -15 - yOffset, 
        size: enemySize, 
        speed: 1.5, 
        health: ENEMY_HEALTH,
        lastHitBulletOwnerId: undefined 
    });
}

/**
 * 衝突判定とダメージ処理 
 */
function checkCollisions() {
    let allNewBullets = [];
    
    // スコア値はP1のレベルを基準に決定
    const totalLevel = getTotalUpgradeLevel(players[0]); 
    const baseValue = ENEMY_VALUE; 
    const minValue = 0.002;
    const maxReductionLevel = 150; 
    
    const reductionFactor = Math.min(1, totalLevel / maxReductionLevel);
    const currentEnemyValue = baseValue - (baseValue - minValue) * reductionFactor;
    const finalEnemyValue = Math.max(minValue, currentEnemyValue); 

    // 1. 全てのプレイヤーの弾丸に衝突フラグをリセット
    players.forEach(player => {
        player.bullets.forEach(bullet => {
            bullet.hit = false;
        });
    });

    // 2. 敵と弾丸の衝突判定
    enemies.forEach(enemy => {
        players.forEach(player => {
            player.bullets.forEach(bullet => {
                if (!bullet.hit && distance(bullet.x, bullet.y, enemy.x, enemy.y) < enemy.size / 2 + bullet.radius) {
                    
                    enemy.health -= bullet.damage;
                    
                    // バウンド処理の適用
                    if (!bullet.isBounce && Math.random() < player.upgrades.bounce.level * player.upgrades.bounce.baseChance) {
                        for (let i = 0; i < 1; i++) { 
                            const bounceAngle = Math.random() * Math.PI * 2; 
                            const bounceDamage = bullet.damage / 3;
                            const bounceSpeed = bullet.speed * 0.8; 
                            
                            allNewBullets.push({
                                x: bullet.x,
                                y: bullet.y,
                                radius: 3,
                                speed: bounceSpeed,
                                damage: bounceDamage, 
                                velX: Math.sin(bounceAngle) * bounceSpeed,
                                velY: Math.cos(bounceAngle) * bounceSpeed, 
                                isBounce: true,
                                ownerId: player.id 
                            });
                        }
                    }
                    
                    bullet.hit = true;
                    enemy.lastHitBulletOwnerId = player.id; 
                }
            });
        });
    });

    // 3. 敵の排除とスコア加算
    enemies = enemies.filter(enemy => {
        if (enemy.health <= 0) {
            const killerId = enemy.lastHitBulletOwnerId;

            if (killerId !== undefined) {
                players.forEach(p => {
                    let scoreMultiplier = 0;
                    if (p.id === killerId) {
                        // 自分が倒した場合: 1.0倍
                        scoreMultiplier = 1.0;
                    } else if (isMultiplayer) {
                        // 味方が倒した場合 (マルチ時のみ): 0.5倍
                        scoreMultiplier = 0.5;
                    } else {
                         // シングルプレイなら常に1.0倍
                        scoreMultiplier = 1.0; 
                    }

                    const earnedScore = finalEnemyValue * scoreMultiplier;
                    p.score += earnedScore;
                    p.totalScoreEarned += earnedScore; 
                });
            }

            enemiesKilled++; 
            return false;
        }
        return true;
    });
    
    // 4. 弾丸の更新とバウンド弾の再配置
    players.forEach(player => {
        player.bullets = player.bullets.filter(bullet => !bullet.hit);
    });

    if (allNewBullets.length > 0) {
        allNewBullets.forEach(newBullet => {
            players[newBullet.ownerId].bullets.push(newBullet); 
        });
    }
}


/**
 * ゲームオーバー処理 
 */
function gameOver() {
    gameRunning = false;
    // 死亡していないプレイヤーの中で最もスコアが高いプレイヤーの総スコアを表示
    const finalScore = players.reduce((maxScore, p) => 
        Math.max(maxScore, Math.floor(p.totalScoreEarned))
    , 0);
    
    document.getElementById('final-score').textContent = finalScore; 
    document.getElementById('game-over-screen').style.display = 'flex';
}

// --- 強化画面処理 ---
let currentUpgradePlayerId = 0;

function enterUpgradeScreen(playerId) {
    if (isUpgrading) return; 

    isUpgrading = true;
    currentUpgradePlayerId = playerId;
    const player = players[playerId];

    document.getElementById('upgrade-score').textContent = Math.floor(player.score);
    
    const container = document.getElementById('upgrade-buttons-container');
    container.innerHTML = ''; 

    // 通常のアップグレードボタンを生成
    for (const type in player.upgrades) {
        const upgrade = player.upgrades[type];
        const button = document.createElement('button');
        button.className = 'upgrade-button';
        button.setAttribute('onclick', `window.applyUpgrade('${type}')`);
        
        button.innerHTML = `${upgrade.label} (現在のLv: ${upgrade.level})`;
        container.appendChild(button);
        
        if (Object.keys(player.upgrades).indexOf(type) % 3 === 2) {
             container.appendChild(document.createElement('br'));
        }
    }
    
    // マルチプレイヤーモードでのみ体力回復ボタンを追加
    if (isMultiplayer) {
        const recoverButton = document.createElement('button');
        recoverButton.className = 'upgrade-button';
        recoverButton.style.backgroundColor = '#90ee90';
        recoverButton.setAttribute('onclick', `window.applyUpgrade('healthRecover')`);
        recoverButton.innerHTML = '体力回復 (コスト: 10 / 最も低い味方を回復)';
        container.appendChild(document.createElement('br'));
        container.appendChild(recoverButton);
    }


    document.getElementById('upgrade-screen').style.display = 'flex';
    document.getElementById('upgrade-message').textContent = `P${playerId + 1} (${player.color})が強化中... (強化コスト: ${BASE_SCORE_TO_UPGRADE})`;
}

window.applyUpgrade = function(type) {
    const playerId = currentUpgradePlayerId;
    const player = players[playerId];
    
    if (isUpgrading) {
        if (player.score < BASE_SCORE_TO_UPGRADE) {
            document.getElementById('upgrade-message').textContent = 'スコアが不足しています。（必要: 10）';
            return;
        }

        if (type === 'healthRecover') {
            // ★特殊強化: 体力回復
            player.score -= BASE_SCORE_TO_UPGRADE; 
            const maxHealth = 5; 
            
            const targetPlayer = players.filter(p => p.health > 0 && p.health < maxHealth)
                .reduce((minP, currentP) => 
                    (currentP.health < minP.health) ? currentP : minP
                , { health: maxHealth, id: undefined }); 

            if (targetPlayer.id !== undefined) {
                 targetPlayer.health++;
                 document.getElementById('upgrade-message').textContent = 
                    `P${targetPlayer.id + 1} の体力が1回復しました！`;
            } else {
                 document.getElementById('upgrade-message').textContent = 
                    `回復対象がいません（全員満タンです）。スコアが消費されました。`;
            }

            // 体力回復はレベルがないため、すぐに強化画面を閉じる
            isUpgrading = false;
            document.getElementById('upgrade-screen').style.display = 'none';

        } else {
            // 通常強化
            const upgrade = player.upgrades[type];
            player.score -= BASE_SCORE_TO_UPGRADE; 
            upgrade.level++;
            
            document.getElementById('upgrade-message').textContent = 
                `P${playerId + 1}: ${upgrade.label}がレベル ${upgrade.level} に強化されました！`;

            // 強化ボタンの表示を更新 (レベル表示の更新のため)
            enterUpgradeScreen(playerId); 
            
            if (player.score < BASE_SCORE_TO_UPGRADE) {
                document.getElementById('upgrade-message').textContent += ' 強化スコアが不足しました。ゲームに戻ります。';
                isUpgrading = false;
                document.getElementById('upgrade-screen').style.display = 'none';
            }
        }

        document.getElementById('upgrade-score').textContent = Math.floor(player.score);
        updateHUD();
    }
};


// --- ロビー/モード管理関数 ---

window.startSinglePlayer = function() {
    isMultiplayer = false;
    players = [createPlayer(0, PLAYER_COLORS[0])];
    localPlayerId = 0; 
    
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('hud').style.display = 'flex';
    
    startGame();
};

window.showLobby = function() {
    gameRunning = false;
    isUpgrading = false;
    document.getElementById('lobby-screen').style.display = 'flex';
    document.getElementById('game-over-screen').style.display = 'none';
    document.getElementById('upgrade-screen').style.display = 'none';
    document.getElementById('hud').style.display = 'none';

    // P1の初期化 (ホスト用)
    players = [createPlayer(0, PLAYER_COLORS[0])];
    document.getElementById('lobby-player-count').textContent = players.length;
    document.getElementById('start-multi-game-button').style.display = 'none';
    document.getElementById('lobby-message').textContent = 'モードを選択するか、パーティルームを作成してください。';
};

window.createOrJoinRoom = function(isHost) {
    const roomName = document.getElementById('room-name').value;
    if (!roomName) {
        document.getElementById('lobby-message').textContent = '部屋名を入力してください。';
        return;
    }

    if (isHost) {
        players = [createPlayer(0, PLAYER_COLORS[0])];
        localPlayerId = 0;
        document.getElementById('lobby-message').textContent = `「${roomName}」を作成しました。参加者 (P1: ${PLAYER_COLORS[0]}).`;
        document.getElementById('start-multi-game-button').style.display = 'block';
    } else {
        if (players.length >= 4) {
             document.getElementById('lobby-message').textContent = '満員です。最大4人までです。';
             return;
        }
        const newPlayerId = players.length;
        players.push(createPlayer(newPlayerId, PLAYER_COLORS[newPlayerId]));
        localPlayerId = newPlayerId; 
        document.getElementById('lobby-message').textContent = 
            `「${roomName}」に参加しました。 (P${newPlayerId + 1}: ${PLAYER_COLORS[newPlayerId]})`;

        document.getElementById('start-multi-game-button').style.display = 'none'; 
    }
    
    isMultiplayer = true;
    document.getElementById('lobby-player-count').textContent = players.length;
    document.getElementById('hud').style.display = 'flex';
    updateHUD();
};

window.startGame = function() {
    if (players.length === 0) {
        window.startSinglePlayer(); 
        return;
    }

    enemies = [];
    enemySpawnTimer = 0;
    enemiesKilled = 0;
    
    players.forEach((p, index) => {
        p.health = 5;
        p.score = 0;
        p.totalScoreEarned = 0;
        p.bullets = [];
        p.x = GAME_WIDTH / (players.length + 1) * (index + 1); 
    });

    gameRunning = true;
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-over-screen').style.display = 'none';
    
    spawnEnemy(0);
};


// --- メインゲームループ ---
function gameLoop(currentTime) {
    if (lastTime === 0) {
        lastTime = currentTime;
    }
    
    let deltaTime = currentTime - lastTime;
    if (deltaTime > 250) {
        deltaTime = 250; 
    }
    lastTime = currentTime;

    if (gameRunning) {
        update(deltaTime);
        draw();
    } else {
        // ゲームが停止している間もHUDは更新し続ける
        updateHUD(); 
    }

    requestAnimationFrame(gameLoop);
}

// --- 初期化処理 ---
window.onload = function() {
    window.showLobby();
    requestAnimationFrame(gameLoop); // ゲームループを開始
};

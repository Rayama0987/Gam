// --- ゲーム設定 (定数) ---
const CANVAS = document.getElementById('game-canvas');
const CTX = CANVAS.getContext('2d');
const GAME_WIDTH = CANVAS.width;
const GAME_HEIGHT = CANVAS.height;

const BASE_SCORE_TO_UPGRADE = 10; 
const ENEMY_HEALTH = 10;
const ENEMY_VALUE = 3;
// ... 他の定数は省略 ...

// --- グローバル状態 ---
let gameRunning = false;
let isUpgrading = false;
let isMultiplayer = false; 
let lastTime = 0; 
let localPlayerId = 0; 

// ★オンライン対応のため、ゲーム状態全体を管理する単一オブジェクト
let gameState = {
    players: [],
    enemies: [],
    enemiesKilled: 0
};

// --- プレイヤーと操作キー (ローカル入力) ---
const PLAYER_COLORS = ['lime', 'cyan', 'red', 'yellow']; 
const INPUT_KEYS = [
    { LEFT: 'KeyA', RIGHT: 'KeyD', SHOOT: 'Space' }, 
    { LEFT: 'ArrowLeft', RIGHT: 'ArrowRight', SHOOT: 'Enter' }, 
    { LEFT: 'Numpad7', RIGHT: 'Numpad9', SHOOT: 'Numpad8' }, 
    { LEFT: 'KeyI', RIGHT: 'KeyP', SHOOT: 'KeyO' }, 
];
let keys = {}; // 現在押されているキー

// プレイヤーの基本構造 (サーバーから送られるデータの一部)
function createPlayer(id, color) {
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
        },
        input: { left: false, right: false, shoot: false } // ローカル入力状態
    };
}


// --- ★ネットワーク層のシミュレーション★ ---

/**
 * サーバー通信を抽象化したオブジェクト。
 * 実際のオンライン接続では、Socket.IOなどのライブラリに置き換えられます。
 */
const Networking = {
    isConnected: false,
    isHost: false,
    latency: 50, // 模擬的な遅延 (ms)
    
    // プレイヤーがサーバーに送る入力キューをシミュレート
    inputQueue: [], 
    
    // サーバーからクライアントに送られるゲーム状態をシミュレート
    serverStateQueue: [],

    connect: function(isHost) {
        this.isConnected = true;
        this.isHost = isHost;
        // 実際のコード: const socket = io(); socket.on('gameState', this.handleState);
        console.log(`[NETWORKING] ${isHost ? 'ホスト' : 'クライアント'}として接続をシミュレート...`);
    },

    /**
     * ローカルの入力状態をサーバーに送信する処理をシミュレート
     */
    sendInput: function(input) {
        if (!this.isConnected) return;
        // 実際のコード: socket.emit('input', input);
        
        // シミュレーション: 自身がホストの場合、即座に入力キューに追加
        if (this.isHost) {
            this.inputQueue.push({ playerId: localPlayerId, input: input });
        } else {
             // 実際のオンラインではサーバーに送る。今回はシミュレーションのため、クライアントからの入力を無視
        }
    },

    /**
     * サーバーからのゲーム状態を受信した際に呼び出される処理をシミュレート
     */
    receiveState: function(state) {
        // 実際のコード: gameState = state;
        
        // シミュレーション: 遅延をかけてサーバー状態を反映
        setTimeout(() => {
            gameState = state;
            
            // 強化画面のトリガーはローカルで実行
            gameState.players.forEach(p => {
                if (!isUpgrading && p.id === localPlayerId && p.health > 0 && p.score >= BASE_SCORE_TO_UPGRADE) {
                    enterUpgradeScreen(p.id);
                }
            });
            
        }, this.latency);
    },

    /**
     * ★ホスト側のみが実行する、サーバーのゲームロジックシミュレーション
     */
    simulateServerTick: function(deltaTime) {
        if (!this.isHost || !gameRunning || isUpgrading) return;
        
        // 1. 全プレイヤーの入力を適用 (入力キューを処理)
        this.inputQueue.forEach(packet => {
            const player = gameState.players.find(p => p.id === packet.playerId);
            if (player) {
                player.input = packet.input;
            }
        });
        this.inputQueue = []; 

        // 2. サーバー側でのロジック更新 (元の update 関数の大部分を移植)
        
        const activePlayers = gameState.players.filter(p => p.health > 0);
        
        activePlayers.forEach(player => {
            // 移動 (サーバー側で処理)
            if (player.input.left && player.x > player.size / 2) {
                player.x -= player.speed * (deltaTime / 16);
            }
            if (player.input.right && player.x < GAME_WIDTH - player.size / 2) {
                player.x += player.speed * (deltaTime / 16);
            }

            // 発射 (サーバー側で処理)
            const now = Date.now();
            const fireInterval = player.upgrades.fireRate.baseInterval / player.upgrades.fireRate.level; 
            
            if (player.input.shoot && (now - player.lastShotTime > fireInterval)) {
                // サーバー側での射撃処理
                serverShoot(player);
                player.lastShotTime = now;
            }

            // 弾丸の移動 (サーバー側で処理)
            player.bullets = player.bullets.filter(bullet => {
                // 弾丸の位置更新
                if (!bullet.isBounce) {
                    bullet.y -= bullet.speed * (deltaTime / 16); 
                } else {
                    bullet.x += bullet.velX * (deltaTime / 16);
                    bullet.y += bullet.velY * (deltaTime / 16);
                }
                return bullet.y > 0 && bullet.x > 0 && bullet.x < GAME_WIDTH; 
            });
        });
        
        // 敵の出現（ホストのみが実行）
        if (gameState.enemiesKilled % 100 === 0 && gameState.enemies.length === 0) {
            serverSpawnEnemy(0);
        }
        
        // 敵の移動（ホストのみが実行）
        gameState.enemies.forEach(enemy => {
            enemy.y += enemy.speed * (deltaTime / 16);
        });
        
        // 衝突判定とスコア処理（ホストのみが実行）
        serverCheckCollisions();

        // 敵の落下ダメージ処理（ホストのみが実行）
        gameState.enemies = gameState.enemies.filter(enemy => {
            if (enemy.y < GAME_HEIGHT + enemy.size / 2) {
                return true;
            } else {
                // 最も体力が低いプレイヤーにダメージを与える
                const alivePlayers = gameState.players.filter(p => p.health > 0);
                if (alivePlayers.length > 0) {
                    let lowestHealthPlayer = alivePlayers.reduce((minP, currentP) => 
                        (currentP.health < minP.health) ? currentP : minP
                    );
                    lowestHealthPlayer.health--;
                }
                return false;
            }
        });
        
        // 全員死亡時のゲームオーバーチェック
        if (gameState.players.filter(p => p.health > 0).length === 0) {
            gameOver();
            return;
        }

        // 3. 状態を他のクライアントにブロードキャスト（シミュレーション）
        this.serverStateQueue.forEach((id) => {
             // 実際のコード: io.to(id).emit('gameState', gameState);
             if (id !== localPlayerId) {
                // 自分以外のクライアントに状態を送る
                Networking.receiveState(JSON.parse(JSON.stringify(gameState)));
             }
        });

        // 4. ローカルにも状態を反映
        Networking.receiveState(gameState); 
    }
};

// --- ★ホスト/サーバー側のゲームロジック★ ---

/**
 * サーバー側で弾丸を発射する処理
 */
function serverShoot(player) {
    // 弾丸生成ロジックは localPlayerId ではなく player の情報を使う
    const { upgrades } = player;

    const count = upgrades.bulletCount.level;
    const spreadAngle = 10; 
    const currentSpeed = upgrades.speed.baseSpeed * upgrades.speed.level;
    const currentDamage = upgrades.damage.baseDamage * upgrades.damage.level;
    const currentRadius = upgrades.radius.baseRadius * upgrades.radius.level;
    
    // ... (エイム計算ロジックは省略または簡易化) ...

    for (let i = 0; i < count; i++) {
        // ... (角度計算ロジックは省略) ...
        player.bullets.push({
            x: player.x,
            y: player.y,
            radius: currentRadius,
            speed: currentSpeed,
            damage: currentDamage,
            velX: 0, // 簡易化
            velY: -currentSpeed, 
            isBounce: false,
            isAim: false,
            ownerId: player.id 
        });
    }
}


/**
 * サーバー側で敵の衝突判定とスコア処理を実行する
 */
function serverCheckCollisions() {
    let allNewBullets = [];
    
    // スコア値の計算（P1のレベルを基準にするのはローカルの計算量を減らすため。サーバーでは全プレイヤーの平均レベルなどを使用するのが望ましいが、今回はP1基準を継続）
    const p1 = gameState.players.find(p => p.id === 0);
    const totalLevel = p1 ? getTotalUpgradeLevel(p1) : 0;
    // ... (スコア値計算ロジックは省略) ...
    const finalEnemyValue = ENEMY_VALUE; // 簡易化

    // 衝突判定とダメージ処理... (前回のコードから移植)
    gameState.enemies.forEach(enemy => {
        gameState.players.forEach(player => {
            player.bullets.forEach(bullet => {
                if (distance(bullet.x, bullet.y, enemy.x, enemy.y) < enemy.size / 2 + bullet.radius) {
                    
                    enemy.health -= bullet.damage;
                    
                    // バウンド処理（ホストで実行）
                    // ... (バウンド弾生成ロジックは省略) ...
                    
                    bullet.hit = true;
                    enemy.lastHitBulletOwnerId = player.id; 
                }
            });
        });
    });

    // 敵の排除とスコア加算 (総スコア制維持)
    gameState.enemies = gameState.enemies.filter(enemy => {
        if (enemy.health <= 0) {
            const killerId = enemy.lastHitBulletOwnerId;

            if (killerId !== undefined) {
                gameState.players.forEach(p => {
                    let scoreMultiplier = (p.id === killerId) ? 1.0 : 0.5; // マルチ時のスコア配分
                    
                    const earnedScore = finalEnemyValue * scoreMultiplier;
                    p.score += earnedScore;
                    p.totalScoreEarned += earnedScore; // ★総スコア制を維持
                });
            }

            gameState.enemiesKilled++; 
            return false;
        }
        return true;
    });
    
    // 弾丸のクリーンアップ（ホストで実行）
    gameState.players.forEach(player => {
        player.bullets = player.bullets.filter(bullet => !bullet.hit);
    });

    // ... (バウンド弾の再配置ロジックは省略) ...
}


/**
 * サーバー側で敵を出現させる処理
 */
function serverSpawnEnemy(yOffset = 0) {
    // ... (敵の出現ロジックは省略) ...
    gameState.enemies.push({
        x: Math.random() * (GAME_WIDTH - 40) + 20,
        y: -15 - yOffset, 
        size: 30, 
        speed: 1.5, 
        health: ENEMY_HEALTH,
        lastHitBulletOwnerId: undefined 
    });
}


// --- クライアント側の描画と入力処理（変更箇所のみ） ---

/**
 * クライアント側の描画処理
 * 状態はすべて gameState から取得する。
 */
function draw() {
    CTX.fillStyle = '#000';
    CTX.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // 1. プレイヤーの描画
    gameState.players.forEach(player => {
        if (player.health <= 0) return;
        CTX.fillStyle = player.color;
        CTX.fillRect(player.x - player.size / 2, player.y - player.size / 2, player.size, player.size);
    });

    // 2. 弾丸の描画 (すべてのプレイヤーの弾丸)
    gameState.players.forEach(player => {
        player.bullets.forEach(bullet => {
            // ... (弾丸描画ロジックは省略) ...
            CTX.fillStyle = player.color; 
            CTX.beginPath();
            CTX.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
            CTX.fill();
        });
    });

    // 3. 敵の描画
    gameState.enemies.forEach(enemy => {
        // ... (敵描画ロジックは省略) ...
        CTX.fillStyle = 'red';
        CTX.fillRect(enemy.x - enemy.size / 2, enemy.y - enemy.size / 2, enemy.size, enemy.size);
    });

    updateHUD();
}

/**
 * クライアント側の入力状態収集と送信
 */
function collectAndSendInput() {
    if (!gameRunning || isUpgrading || localPlayerId === undefined) return;
    
    const playerKeys = INPUT_KEYS[localPlayerId];
    
    const inputState = {
        left: keys[playerKeys.LEFT] || false,
        right: keys[playerKeys.RIGHT] || false,
        shoot: keys[playerKeys.SHOOT] || false
    };
    
    // モバイルタッチ操作 (P1のみ)
    if (localPlayerId === 0 && isMobileSession) {
        // タッチ操作はローカルで移動予測を行うべきだが、今回は入力をシンプルに送る
        inputState.shoot = true;
        // 実際のタッチ位置から左右入力を判断するロジックが必要だが、今回は簡略化のため省略
    }
    
    // 入力データをサーバーに送信（シミュレーション）
    Networking.sendInput(inputState);
}


// --- ゲームオーバー処理と強化画面（変更なし） ---

function gameOver() {
    gameRunning = false;
    const finalScore = gameState.players.reduce((maxScore, p) => 
        Math.max(maxScore, Math.floor(p.totalScoreEarned)) 
    , 0);
    
    document.getElementById('final-score').textContent = finalScore; 
    document.getElementById('game-over-screen').style.display = 'flex';
}

function enterUpgradeScreen(playerId) {
    // ... (前回のロジックをそのまま使用) ...
    // 注意: 強化の実行はローカルで行われるが、結果（upgradesとscoreの減少）はサーバーに送信する必要がある。
    isUpgrading = true;
    currentUpgradePlayerId = playerId;
    const player = gameState.players.find(p => p.id === playerId);
    
    // ... (HTML生成ロジックは省略) ...

    document.getElementById('upgrade-screen').style.display = 'flex';
    document.getElementById('upgrade-message').textContent = `P${playerId + 1} (${player.color})が強化中...`;
}

window.applyUpgrade = function(type) {
    const playerId = currentUpgradePlayerId;
    const player = gameState.players.find(p => p.id === playerId);
    
    if (isUpgrading) {
        if (player.score < BASE_SCORE_TO_UPGRADE) {
            // ... (スコア不足メッセージ) ...
            return;
        }

        player.score -= BASE_SCORE_TO_UPGRADE; 

        if (type === 'healthRecover') {
            // 強化ロジックはサーバーに委譲するのが理想だが、ここではローカルで実行（結果はサーバーに送信される前提）
            const maxHealth = 5; 
            const targetPlayer = gameState.players.filter(p => p.health > 0 && p.health < maxHealth)
                .reduce((minP, currentP) => 
                    (currentP.health < minP.health) ? currentP : minP
                , { health: maxHealth, id: undefined }); 

            if (targetPlayer.id !== undefined) {
                 targetPlayer.health++;
            }
            // サーバーに「体力回復が行われた」というイベントを送信する必要がある
            
            isUpgrading = false;
            document.getElementById('upgrade-screen').style.display = 'none';

        } else {
            // 通常強化
            const upgrade = player.upgrades[type];
            upgrade.level++;
            // サーバーに「アップグレードが行われた」というイベントを送信する必要がある
            
            // ... (スコアチェックと画面更新ロジックは省略) ...
             if (player.score < BASE_SCORE_TO_UPGRADE) {
                isUpgrading = false;
                document.getElementById('upgrade-screen').style.display = 'none';
            } else {
                enterUpgradeScreen(playerId); // 強化ボタンの表示を更新
            }
        }
        
        // ★重要: サーバーに強化結果を送信する（シミュレーション）
        Networking.sendInput({ upgraded: true, type: type, playerId: playerId });
        
        document.getElementById('upgrade-score').textContent = Math.floor(player.score);
        updateHUD();
    }
};


// --- ロビー/モード管理関数 ---

window.startSinglePlayer = function() {
    isMultiplayer = false;
    localPlayerId = 0; 
    
    // シングルプレイ時はネットワーク層をバイパス
    gameState.players = [createPlayer(0, PLAYER_COLORS[0])];
    
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('hud').style.display = 'flex';
    
    startGame();
};

window.showLobby = function() {
    gameRunning = false;
    isUpgrading = false;
    document.getElementById('lobby-screen').style.display = 'flex';
    // ... (画面表示切り替えロジックは省略) ...
    
    // ホストの初期化（オンラインではここがサーバーに接続する処理に変わる）
    gameState.players = [createPlayer(0, PLAYER_COLORS[0])];
    document.getElementById('lobby-player-count').textContent = gameState.players.length;
    document.getElementById('start-multi-game-button').style.display = 'none';
    document.getElementById('lobby-message').textContent = 'モードを選択するか、パーティルームを作成してください。';
};

window.createOrJoinRoom = function(isHost) {
    const roomName = document.getElementById('room-name').value;
    if (!roomName) return;

    Networking.connect(isHost); // ★ネットワーク接続シミュレーション
    isMultiplayer = true;
    
    // サーバーと通信し、部屋の状態を取得/更新する
    if (isHost) {
        // ホストとして初期化
        localPlayerId = 0;
        gameState.players = [createPlayer(0, PLAYER_COLORS[0])];
        Networking.isHost = true;
        Networking.serverStateQueue = [0]; // P1は自分自身をキューに入れる
        document.getElementById('start-multi-game-button').style.display = 'block';
    } else {
        // 参加者としてサーバーからプレイヤーリストを取得
        
        // ★シミュレーション: P1が作成済みと仮定し、自分をP2以降として追加
        if (gameState.players.length === 0) { // P1がいなければ作成
            gameState.players.push(createPlayer(0, PLAYER_COLORS[0]));
        }
        
        const newPlayerId = gameState.players.length;
        if (newPlayerId >= 4) {
             document.getElementById('lobby-message').textContent = '満員です。最大4人までです。';
             return;
        }
        
        const newPlayer = createPlayer(newPlayerId, PLAYER_COLORS[newPlayerId]);
        gameState.players.push(newPlayer);
        localPlayerId = newPlayerId; 
        Networking.serverStateQueue.push(newPlayerId); // サーバーのブロードキャスト先に追加
        document.getElementById('start-multi-game-button').style.display = 'none'; 
    }
    
    document.getElementById('lobby-player-count').textContent = gameState.players.length;
    document.getElementById('hud').style.display = 'flex';
    updateHUD();
};

window.startGame = function() {
    // ... (ゲーム開始時のリセットロジックは省略) ...
    gameState.enemies = [];
    gameState.enemiesKilled = 0;
    
    gameState.players.forEach((p, index) => {
        p.health = 5;
        p.score = 0;
        p.totalScoreEarned = 0;
        p.bullets = [];
        p.x = GAME_WIDTH / (gameState.players.length + 1) * (index + 1); 
    });

    gameRunning = true;
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-over-screen').style.display = 'none';
    
    // ホストのみが敵を初期出現させる
    if (Networking.isHost || !isMultiplayer) { 
        serverSpawnEnemy(0); 
    }
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
        // 1. クライアントからの入力を収集し、ネットワークに送信
        collectAndSendInput();
        
        // 2. ホスト側でサーバーロジックを実行し、全員に状態を同期
        Networking.simulateServerTick(deltaTime);
        
        // 3. クライアント側では状態を描画するだけ
        draw();
    } else {
        updateHUD(); 
    }

    requestAnimationFrame(gameLoop);
}

// --- 初期化処理 ---
window.onload = function() {
    window.showLobby();
    requestAnimationFrame(gameLoop); 
};

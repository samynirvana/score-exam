/**
 * Pixel Fishing Game - Core Game Controller & State Machine
 * Handles Loading Screen, Title Screen (New Game vs Continue), Area Selection Flow,
 * In-Game HUD, QTE Minigame, AFK Auto-Fish, Progression, and Cloud Sync
 */

import { 
    RARITY_CONFIG, AREAS_CONFIG, INVENTORY_CONFIG, SHOP_CATALOG, rollFishCatch, 
    getExpNeededForLevel, calculateFishPrice 
} from './fishing-config.js';
import { soundManager } from './fishing-audio.js';
import { FishingCanvas } from './fishing-canvas.js';
import { db, auth } from '../../firebase.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

export class PixelFishingGame {
    constructor() {
        // Player state
        this.player = this.loadLocalPlayerData();

        // Game states: 'IDLE' | 'WAITING' | 'HOOK_ALERT' | 'QTE' | 'CAUGHT'
        this.state = 'IDLE';

        // Auto-Fish (AFK)
        this.autoFish = (this.player.hasAutoFishUnlocked && this.player.autoFishEnabled !== false) || false;
        this.autoFishTimer = null;
        this.autoQteInterval = null;

        // Current Area
        this.currentAreaId = this.player.selectedArea || 'starter_pond';

        // Timers & Active Data
        this.waitTimer = null;
        this.hookAlertTimer = null;
        this.hookAlertTimeLeft = 2.0;
        this.hookAlertInterval = null;

        // QTE State
        this.qteSequence = [];
        this.qteCurrentIndex = 0;
        this.qteTimer = null;

        // Canvas Renderer
        const canvasEl = document.getElementById('fishingCanvas');
        this.canvasRenderer = new FishingCanvas(canvasEl, {});
        this.canvasRenderer.setArea(this.currentAreaId);
        this.canvasRenderer.player.equippedRod = this.player.equippedRod || 'rod_bamboo';
        this.canvasRenderer.player.equippedHat = this.player.equippedHat || 'hat_default';

        // Connect canvas Fish Camp NPC click to open shop
        this.canvasRenderer.onOpenShop = () => {
            this.openShop();
        };

        // Bind DOM elements & listeners
        this.initDOM();
        this.bindEvents();

        // Start render loop
        this.renderLoop = this.renderLoop.bind(this);
        requestAnimationFrame(this.renderLoop);

        // Try syncing cloud save from Firestore
        this.syncCloudSave();

        // Start Loading Screen Sequence on entry
        this.runLoadingScreenSequence();
    }

    loadLocalPlayerData() {
        const saved = localStorage.getItem('pixel_fishing_save_v1');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Backward compatibility defaults for new shop gear
                parsed.equippedRod = parsed.equippedRod || 'rod_bamboo';
                parsed.equippedHat = parsed.equippedHat || 'hat_default';
                parsed.ownedRods = parsed.ownedRods || ['rod_bamboo'];
                parsed.ownedHats = parsed.ownedHats || ['hat_default'];
                parsed.activeBaits = parsed.activeBaits || { bait_worm: 0, bait_lure: 0, bait_chum: 0 };
                parsed.hasAutoFishUnlocked = parsed.hasAutoFishUnlocked === true;
                parsed.autoFishEnabled = parsed.autoFishEnabled !== false;
                return parsed;
            } catch (e) {}
        }
        return {
            level: 1,
            exp: 0,
            coins: 100, // Starter allowance
            inventoryCapacity: INVENTORY_CONFIG.initialCapacity,
            inventory: [],
            selectedArea: 'starter_pond',
            hasSavedGame: false,
            hasAutoFishUnlocked: false,
            autoFishEnabled: false,
            equippedRod: 'rod_bamboo',
            equippedHat: 'hat_default',
            ownedRods: ['rod_bamboo'],
            ownedHats: ['hat_default'],
            activeBaits: {
                bait_worm: 0,
                bait_lure: 0,
                bait_chum: 0
            },
            stats: {
                totalCaught: 0,
                totalCoinsEarned: 0,
                heaviestFish: 0,
                rarestCaught: 'Common'
            }
        };
    }

    hasSavedProgress() {
        if (this.player.hasSavedGame) return true;
        if (localStorage.getItem('pixel_fishing_save_v1')) {
            const parsed = JSON.parse(localStorage.getItem('pixel_fishing_save_v1'));
            if (parsed && (parsed.stats?.totalCaught > 0 || parsed.level > 1 || parsed.coins !== 100 || parsed.inventory?.length > 0 || parsed.hasSavedGame)) {
                return true;
            }
        }
        return false;
    }

    async syncCloudSave() {
        try {
            if (auth && auth.currentUser) {
                const saveRef = doc(db, "fishing_saves", auth.currentUser.uid);
                const snap = await getDoc(saveRef);
                if (snap.exists()) {
                    const cloudData = snap.data();
                    if (cloudData && (cloudData.level > this.player.level || cloudData.stats?.totalCaught > this.player.stats?.totalCaught)) {
                        this.player = cloudData;
                        this.player.hasSavedGame = true;
                        this.savePlayerData(false); // Update local cache
                        this.updateUI();
                    }
                }
            }
        } catch (e) {
            // Firestore sync is progressive
        }
    }

    async savePlayerData(syncToCloud = true) {
        this.player.selectedArea = this.currentAreaId;
        this.player.hasSavedGame = true;
        localStorage.setItem('pixel_fishing_save_v1', JSON.stringify(this.player));

        if (syncToCloud && auth && auth.currentUser) {
            try {
                const saveRef = doc(db, "fishing_saves", auth.currentUser.uid);
                await setDoc(saveRef, {
                    ...this.player,
                    updatedAt: new Date(),
                    updatedBy: auth.currentUser.email || 'Angler'
                }, { merge: true });
            } catch (e) {
                // Background sync ignore
            }
        }
    }

    renderLoop() {
        this.canvasRenderer.render();
        requestAnimationFrame(this.renderLoop);
    }

    initDOM() {
        this.dom = {
            // Overlays
            loadingScreen: document.getElementById('gameLoadingScreen'),
            loadingBarFill: document.getElementById('loadingBarFill'),
            loadingStatusText: document.getElementById('loadingStatusText'),

            homeScreen: document.getElementById('gameHomeScreen'),
            homeButtonsContainer: document.getElementById('homeButtonsContainer'),
            homeSaveSummary: document.getElementById('homeSaveSummary'),

            // In-Game HUDs
            gameHudTop: document.getElementById('gameHudTop'),
            gameHudBottom: document.getElementById('gameHudBottomLeft') || document.getElementById('gameHudBottom'),
            hudHomeBtn: document.getElementById('hudHomeBtn'),

            // Stats in Top HUD
            playerLevel: document.getElementById('playerLevel'),
            playerExpText: document.getElementById('playerExpText'),
            playerExpFill: document.getElementById('playerExpFill'),
            playerCoins: document.getElementById('playerCoins'),
            inventoryBtnCount: document.getElementById('inventoryBtnCount'),
            currentAreaName: document.getElementById('currentAreaName'),
            currentAreaBonus: document.getElementById('currentAreaBonus'),

            // Middle / Bottom-Left Controls
            actionButton: document.getElementById('actionButton'),
            actionStatusText: document.getElementById('actionStatusText'),
            autoFishContainer: document.getElementById('autoFishContainer'),
            autoFishToggle: document.getElementById('autoFishToggle'),
            autoFishIndicator: document.getElementById('autoFishIndicator'),

            // Hook Alert Overlay
            hookAlertBox: document.getElementById('hookAlertBox'),
            hookTimerBar: document.getElementById('hookTimerBar'),
            hookActionBtn: document.getElementById('hookActionBtn'),

            // QTE Overlay
            qteContainer: document.getElementById('qteContainer'),
            qteStepsContainer: document.getElementById('qteStepsContainer'),
            qteTimerBar: document.getElementById('qteTimerBar') || document.getElementById('qteTimerFill'),
            qteLeftBtn: document.getElementById('qteLeftBtn'),
            qteRightBtn: document.getElementById('qteRightBtn'),

            // Modals
            catchModal: document.getElementById('catchModal'),
            catchFishName: document.getElementById('catchFishName'),
            catchFishIcon: document.getElementById('catchFishIcon'),
            catchFishRarity: document.getElementById('catchFishRarity'),
            catchFishWeight: document.getElementById('catchFishWeight'),
            catchFishPrice: document.getElementById('catchFishPrice'),
            catchFishExp: document.getElementById('catchFishExp'),
            closeCatchModalBtn: document.getElementById('closeCatchModalBtn'),

            inventoryModal: document.getElementById('inventoryModal'),
            openInventoryBtn: document.getElementById('openInventoryBtn'),
            closeInventoryBtn: document.getElementById('closeInventoryBtn'),
            inventoryGrid: document.getElementById('inventoryGrid'),
            inventoryCapacityText: document.getElementById('inventoryCapacityText'),
            upgradeBagBtn: document.getElementById('upgradeBagBtn'),
            upgradeCostText: document.getElementById('upgradeCostText'),
            sellAllBtn: document.getElementById('sellAllBtn'),
            emptyInventoryNotice: document.getElementById('emptyInventoryNotice'),

            areaModal: document.getElementById('areaModal'),
            openAreaBtn: document.getElementById('openAreaBtn'),
            closeAreaBtn: document.getElementById('closeAreaBtn'),
            areaListContainer: document.getElementById('areaListContainer'),

            // Fish Camp & Shop Modal Elements
            openShopBtn: document.getElementById('openShopBtn'),
            shopModal: document.getElementById('shopModal'),
            closeShopBtn: document.getElementById('closeShopBtn'),
            shopModalCoins: document.getElementById('shopModalCoins'),
            shopTabSell: document.getElementById('shopTabSell'),
            shopTabBuy: document.getElementById('shopTabBuy'),
            shopSectionSell: document.getElementById('shopSectionSell'),
            shopSectionBuy: document.getElementById('shopSectionBuy'),
            shopSellCountBadge: document.getElementById('shopSellCountBadge'),
            shopSellTackleCount: document.getElementById('shopSellTackleCount'),
            shopSellTotalVal: document.getElementById('shopSellTotalVal'),
            shopSellAllBtn: document.getElementById('shopSellAllBtn'),
            shopSellEmptyNotice: document.getElementById('shopSellEmptyNotice'),
            shopSellGrid: document.getElementById('shopSellGrid'),
            shopRodsGrid: document.getElementById('shopRodsGrid'),
            shopBaitsGrid: document.getElementById('shopBaitsGrid'),
            shopHatsGrid: document.getElementById('shopHatsGrid'),
            shopModulesGrid: document.getElementById('shopModulesGrid'),

            soundToggleBtn: document.getElementById('soundToggleBtn'),
            soundIcon: document.getElementById('soundIcon')
        };
    }

    bindEvents() {
        // Main Action Button (Inside Game)
        this.dom.actionButton.addEventListener('click', () => {
            soundManager.init();
            if (this.state === 'IDLE') {
                this.startCasting();
            } else if (this.state === 'WAITING') {
                this.cancelFishing();
            }
        });

        // Hook Alert Click
        this.dom.hookActionBtn.addEventListener('click', () => {
            if (this.state === 'HOOK_ALERT') {
                this.handleHookSuccess();
            }
        });

        // Canvas context menu & clicks
        const canvasContainer = document.getElementById('gameCanvasContainer');
        canvasContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (this.state === 'QTE') {
                this.handleQteInput('R');
            }
        });

        canvasContainer.addEventListener('mousedown', (e) => {
            if (this.state === 'QTE') {
                if (e.button === 0) { // Left click
                    this.handleQteInput('L');
                }
            } else if (this.state === 'HOOK_ALERT') {
                this.handleHookSuccess();
            }
        });

        // Dedicated QTE Buttons for touch/mobile
        this.dom.qteLeftBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.state === 'QTE') this.handleQteInput('L');
        });

        this.dom.qteRightBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.state === 'QTE') this.handleQteInput('R');
        });

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            if (this.state === 'QTE') {
                const k = e.key.toLowerCase();
                if (k === 'a' || k === 'arrowleft') {
                    this.handleQteInput('L');
                } else if (k === 'd' || k === 'arrowright') {
                    this.handleQteInput('R');
                }
            } else if (this.state === 'HOOK_ALERT') {
                if (e.code === 'Space' || e.key === 'Enter') {
                    e.preventDefault();
                    this.handleHookSuccess();
                }
            }
        });

        // Auto-Fish Toggle
        this.dom.autoFishToggle.addEventListener('click', () => {
            soundManager.init();
            this.toggleAutoFish();
        });

        // Catch Modal Close
        this.dom.closeCatchModalBtn.addEventListener('click', () => {
            this.closeCatchModal();
        });

        // Inventory Modal
        this.dom.openInventoryBtn.addEventListener('click', () => {
            soundManager.init();
            this.openInventory();
        });
        this.dom.closeInventoryBtn.addEventListener('click', () => {
            this.closeInventory();
        });
        this.dom.upgradeBagBtn.addEventListener('click', () => {
            this.upgradeInventoryCapacity();
        });
        this.dom.sellAllBtn.addEventListener('click', () => {
            this.sellAllFish();
        });

        // Area Selector Modal
        this.dom.openAreaBtn.addEventListener('click', () => {
            soundManager.init();
            this.openAreaSelector();
        });
        this.dom.closeAreaBtn.addEventListener('click', () => {
            this.closeAreaSelector();
        });

        // Fish Camp & Shop Modal Listeners
        if (this.dom.openShopBtn) {
            this.dom.openShopBtn.addEventListener('click', () => {
                soundManager.init();
                this.openShop();
            });
        }
        if (this.dom.closeShopBtn) {
            this.dom.closeShopBtn.addEventListener('click', () => {
                this.closeShop();
            });
        }
        if (this.dom.shopTabSell) {
            this.dom.shopTabSell.addEventListener('click', () => {
                this.switchShopTab('sell');
            });
        }
        if (this.dom.shopTabBuy) {
            this.dom.shopTabBuy.addEventListener('click', () => {
                this.switchShopTab('buy');
            });
        }
        if (this.dom.shopSellAllBtn) {
            this.dom.shopSellAllBtn.addEventListener('click', () => {
                this.sellAllFish();
                this.updateShopUI();
            });
        }

        // Sound Toggle
        this.dom.soundToggleBtn.addEventListener('click', () => {
            const isMuted = soundManager.toggleMute();
            this.dom.soundIcon.innerText = isMuted ? '🔇' : '🔊';
            this.dom.soundToggleBtn.classList.toggle('muted', isMuted);
        });
        if (soundManager.muted) {
            this.dom.soundIcon.innerText = '🔇';
            this.dom.soundToggleBtn.classList.add('muted');
        }

        // Return to Home Screen from HUD
        this.dom.hudHomeBtn.addEventListener('click', () => {
            if (this.state !== 'IDLE') this.cancelFishing();
            this.showHomeScreen();
        });
    }

    // ==========================================================================
    // 1. LOADING SCREEN SEQUENCE
    // ==========================================================================
    runLoadingScreenSequence() {
        this.dom.loadingScreen.style.display = 'flex';
        this.dom.loadingScreen.classList.add('active');
        this.dom.homeScreen.style.display = 'none';
        this.dom.gameHudTop.style.display = 'none';
        this.dom.gameHudBottom.style.display = 'none';

        const stages = [
            { pct: 25, text: "Inspecting fishing tackle & lines..." },
            { pct: 55, text: "Tuning water ripples & weather..." },
            { pct: 85, text: "Stocking fish species..." },
            { pct: 100, text: "Angler ready!" }
        ];

        let stageIdx = 0;
        const interval = setInterval(() => {
            if (stageIdx < stages.length) {
                const s = stages[stageIdx];
                this.dom.loadingBarFill.style.width = `${s.pct}%`;
                this.dom.loadingStatusText.innerText = s.text;
                stageIdx++;
            } else {
                clearInterval(interval);
                setTimeout(() => {
                    this.dom.loadingScreen.style.opacity = '0';
                    setTimeout(() => {
                        this.dom.loadingScreen.style.display = 'none';
                        this.showHomeScreen();
                    }, 300);
                }, 350);
            }
        }, 280);
    }

    // ==========================================================================
    // 2. HOME SCREEN (New Game vs Continue)
    // ==========================================================================
    showHomeScreen() {
        this.dom.homeScreen.style.display = 'flex';
        this.dom.homeScreen.style.opacity = '1';
        this.dom.gameHudTop.style.display = 'none';
        this.dom.gameHudBottom.style.display = 'none';

        const hasSave = this.hasSavedProgress();

        if (hasSave) {
            // User already has saved game progress:
            // SHOW CONTINUE BUTTON, REMOVE NEW GAME BUTTON!
            this.dom.homeButtonsContainer.innerHTML = `
                <button type="button" id="homeContinueBtn" class="btn-home-action btn-home-continue">
                    <span>▶ Continue Game</span>
                    <small style="opacity: 0.85; font-size: 13px;">(Lv. ${this.player.level} - ${this.player.coins.toLocaleString()} 🪙)</small>
                </button>
            `;

            // Display save summary
            this.dom.homeSaveSummary.style.display = 'flex';
            this.dom.homeSaveSummary.innerHTML = `
                <span>Level: <strong>Lv. ${this.player.level}</strong></span>
                <span>Caught: <strong>${this.player.stats.totalCaught}</strong></span>
                <span>Best: <strong>${this.player.stats.heaviestFish} kg</strong></span>
                <span>Coins: <strong style="color: #facc15;">${this.player.coins.toLocaleString()} 🪙</strong></span>
            `;

            const continueBtn = document.getElementById('homeContinueBtn');
            if (continueBtn) {
                continueBtn.addEventListener('click', () => {
                    soundManager.init();
                    soundManager.playQteSuccess();
                    this.handleContinueFlow();
                });
            }
        } else {
            // First time playing: SHOW NEW GAME BUTTON
            this.dom.homeButtonsContainer.innerHTML = `
                <button type="button" id="homeNewGameBtn" class="btn-home-action btn-home-new">
                    <span>✨ New Game</span>
                </button>
            `;
            this.dom.homeSaveSummary.style.display = 'none';

            const newGameBtn = document.getElementById('homeNewGameBtn');
            if (newGameBtn) {
                newGameBtn.addEventListener('click', () => {
                    soundManager.init();
                    soundManager.playQteSuccess();
                    this.handleNewGameFlow();
                });
            }
        }
    }

    // After clicking Continue or New Game, go directly to Selecting Fishing Area!
    handleContinueFlow() {
        this.dom.homeScreen.style.display = 'none';
        this.dom.gameHudTop.style.display = 'flex';
        this.dom.gameHudBottom.style.display = 'flex';
        this.updateUI();

        // Immediately open Area Selector
        this.openAreaSelector();
    }

    handleNewGameFlow() {
        this.player = {
            level: 1,
            exp: 0,
            coins: 100,
            inventoryCapacity: INVENTORY_CONFIG.initialCapacity,
            inventory: [],
            selectedArea: 'starter_pond',
            hasSavedGame: true,
            hasAutoFishUnlocked: false,
            equippedRod: 'rod_bamboo',
            equippedHat: 'hat_default',
            ownedRods: ['rod_bamboo'],
            ownedHats: ['hat_default'],
            activeBaits: {
                bait_worm: 0,
                bait_lure: 0,
                bait_chum: 0
            },
            stats: {
                totalCaught: 0,
                totalCoinsEarned: 0,
                heaviestFish: 0,
                rarestCaught: 'Common'
            }
        };
        this.savePlayerData(true);

        this.dom.homeScreen.style.display = 'none';
        this.dom.gameHudTop.style.display = 'flex';
        this.dom.gameHudBottom.style.display = 'flex';
        this.updateUI();

        // Immediately open Area Selector
        this.openAreaSelector();
    }

    // ==========================================================================
    // 3. GAMEPLAY FISHING CYCLE
    // ==========================================================================
    startCasting() {
        // Check if inventory full
        if (this.player.inventory.length >= this.player.inventoryCapacity) {
            this.canvasRenderer.addFloatingText('🎒 Bag Full! Sell fish first', null, null, '#f87171');
            soundManager.playQteMiss();
            if (this.autoFish) this.toggleAutoFish();
            this.openInventory();
            return;
        }

        this.state = 'WAITING';
        this.updateActionButton();

        this.canvasRenderer.castLine();
        soundManager.playCast();
        setTimeout(() => soundManager.playSplash(), 220);

        // Calculate bite speed bonus from equipped rod and active baits
        const equippedRod = SHOP_CATALOG.rods.find(r => r.id === (this.player.equippedRod || 'rod_bamboo')) || SHOP_CATALOG.rods[0];
        let speedMultiplier = 1.0 - (equippedRod.speedBonus || 0);

        if (this.player.activeBaits && this.player.activeBaits.bait_worm > 0) {
            speedMultiplier *= 0.5; // Worms make bites 2x faster
        }

        // Base waiting phase: 10 to 20 seconds, modified by gear
        const baseWait = 10000 + Math.random() * 10000;
        const waitDuration = Math.max(2500, Math.round(baseWait * speedMultiplier));
        this.dom.actionStatusText.innerText = "Waiting for bite...";

        clearTimeout(this.waitTimer);
        this.waitTimer = setTimeout(() => {
            this.triggerHookAlert();
        }, waitDuration);
    }

    cancelFishing() {
        clearTimeout(this.waitTimer);
        clearTimeout(this.hookAlertTimer);
        clearInterval(this.hookAlertInterval);
        clearInterval(this.qteInterval);
        if (this.autoQteInterval) {
            clearInterval(this.autoQteInterval);
            this.autoQteInterval = null;
        }
        this.canvasRenderer.recallLine();
        this.state = 'IDLE';
        this.dom.hookAlertBox.classList.remove('active');
        this.dom.qteContainer.classList.remove('active');
        this.updateActionButton();
        this.dom.actionStatusText.innerText = "Ready to fish.";
    }

    // Hook Alert Window: exactly 2.0s to respond
    triggerHookAlert() {
        this.state = 'HOOK_ALERT';
        this.canvasRenderer.setBite(true);
        soundManager.playHookAlert();

        this.dom.hookAlertBox.classList.add('active');
        this.dom.actionStatusText.innerText = "🚨 FISH ON! HOOK IT NOW! 🚨";
        this.updateActionButton();

        this.hookAlertTimeLeft = 2.0;
        this.dom.hookTimerBar.style.width = '100%';

        const startTime = Date.now();
        const duration = 2000;

        clearInterval(this.hookAlertInterval);
        this.hookAlertInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, duration - elapsed);
            const pct = (remaining / duration) * 100;
            this.dom.hookTimerBar.style.width = `${pct}%`;

            if (remaining <= 0) {
                clearInterval(this.hookAlertInterval);
            }
        }, 30);

        clearTimeout(this.hookAlertTimer);
        this.hookAlertTimer = setTimeout(() => {
            this.handleHookEscape();
        }, duration);

        // AFK Auto-Fish auto reaction
        if (this.autoFish) {
            setTimeout(() => {
                if (this.state === 'HOOK_ALERT') {
                    this.handleHookSuccess();
                }
            }, 300 + Math.random() * 300);
        }
    }

    handleHookSuccess() {
        clearTimeout(this.hookAlertTimer);
        clearInterval(this.hookAlertInterval);
        this.dom.hookAlertBox.classList.remove('active');

        soundManager.playQteSuccess();
        this.canvasRenderer.addFloatingText('HOOKED! 🎣', null, null, '#38bdf8');

        this.startQteMinigame();
    }

    handleHookEscape() {
        clearTimeout(this.hookAlertTimer);
        clearInterval(this.hookAlertInterval);
        this.dom.hookAlertBox.classList.remove('active');

        soundManager.playEscape();
        this.canvasRenderer.addFloatingText('Fish Escaped... 💨', null, null, '#f87171');
        this.canvasRenderer.recallLine();

        this.state = 'IDLE';
        this.updateActionButton();
        this.dom.actionStatusText.innerText = "The fish got away! Cast again.";

        if (this.autoFish) {
            setTimeout(() => {
                if (this.autoFish && this.state === 'IDLE') this.startCasting();
            }, 1200);
        }
    }

    // Reel-In Minigame (QTE): 10 Clicks (Left / Right)
    startQteMinigame() {
        this.state = 'QTE';
        this.updateActionButton();
        this.dom.actionStatusText.innerText = "Reeling in! Follow the L / R sequence!";

        this.qteSequence = [];
        for (let i = 0; i < 10; i++) {
            this.qteSequence.push(Math.random() > 0.5 ? 'L' : 'R');
        }
        this.qteCurrentIndex = 0;

        this.renderQteSteps();
        this.dom.qteContainer.classList.add('active');

        const qteDuration = 8000;
        if (this.dom.qteTimerBar) {
            this.dom.qteTimerBar.style.width = '100%';
        }
        const startTime = Date.now();

        clearInterval(this.qteInterval);
        this.qteInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, qteDuration - elapsed);
            const pct = (remaining / qteDuration) * 100;
            if (this.dom.qteTimerBar) {
                this.dom.qteTimerBar.style.width = `${pct}%`;
            }

            if (remaining <= 0) {
                clearInterval(this.qteInterval);
                if (this.state === 'QTE') {
                    this.handleQteFail();
                }
            }
        }, 40);

        if (this.autoFish) {
            this.runAutoFishQte();
        }
    }

    runAutoFishQte() {
        if (this.autoQteInterval) {
            clearInterval(this.autoQteInterval);
            this.autoQteInterval = null;
        }

        // Automatic left/right reeling clicks
        this.autoQteInterval = setInterval(() => {
            if (!this.autoFish || this.state !== 'QTE') {
                clearInterval(this.autoQteInterval);
                this.autoQteInterval = null;
                return;
            }

            if (this.qteCurrentIndex < this.qteSequence.length) {
                const expected = this.qteSequence[this.qteCurrentIndex];
                if (expected) {
                    this.handleQteInput(expected);
                }
            } else {
                clearInterval(this.autoQteInterval);
                this.autoQteInterval = null;
            }
        }, 160);
    }

    renderQteSteps() {
        this.dom.qteStepsContainer.innerHTML = this.qteSequence.map((step, idx) => {
            let statusClass = '';
            if (idx < this.qteCurrentIndex) statusClass = 'passed';
            else if (idx === this.qteCurrentIndex) statusClass = 'current';

            const label = step === 'L' ? 'LEFT' : 'RIGHT';
            return `<div class="qte-step-pill ${statusClass}" data-step="${step}">${label} (${step})</div>`;
        }).join('');
    }

    handleQteInput(input) {
        if (this.state !== 'QTE') return;

        const expected = this.qteSequence[this.qteCurrentIndex];
        if (input === expected) {
            soundManager.playQteSuccess();
            this.qteCurrentIndex++;
            this.renderQteSteps();

            if (this.qteCurrentIndex >= this.qteSequence.length) {
                if (this.autoQteInterval) {
                    clearInterval(this.autoQteInterval);
                    this.autoQteInterval = null;
                }
                clearInterval(this.qteInterval);
                this.handleCatchSuccess();
            }
        } else {
            soundManager.playQteMiss();
            const currEl = this.dom.qteStepsContainer.querySelector('.qte-step-pill.current');
            if (currEl) {
                currEl.classList.add('error');
                setTimeout(() => currEl.classList.remove('error'), 250);
            }
        }
    }

    handleQteFail() {
        if (this.autoQteInterval) {
            clearInterval(this.autoQteInterval);
            this.autoQteInterval = null;
        }
        clearInterval(this.qteInterval);
        this.dom.qteContainer.classList.remove('active');
        soundManager.playEscape();
        this.canvasRenderer.addFloatingText('Line snapped! 💥', null, null, '#f87171');
        this.canvasRenderer.recallLine();

        this.state = 'IDLE';
        this.updateActionButton();
        this.dom.actionStatusText.innerText = "Line snapped! Fish escaped.";

        if (this.autoFish) {
            setTimeout(() => {
                if (this.autoFish && this.state === 'IDLE') this.startCasting();
            }, 1500);
        }
    }

    // Successful Catch
    handleCatchSuccess() {
        if (this.autoQteInterval) {
            clearInterval(this.autoQteInterval);
            this.autoQteInterval = null;
        }
        this.dom.qteContainer.classList.remove('active');
        this.canvasRenderer.recallLine();
        this.state = 'CAUGHT';

        // Gear & Cosmetic Bonuses
        const equippedRod = SHOP_CATALOG.rods.find(r => r.id === (this.player.equippedRod || 'rod_bamboo')) || SHOP_CATALOG.rods[0];
        let extraRarity = equippedRod.rarityBonus || 0;
        let priceMultiplier = 1.0;
        let boosterMultiplier = 1.0;

        // Hat perks
        if (this.player.equippedHat === 'hat_straw') boosterMultiplier *= 1.05; // Straw hat +5% EXP
        if (this.player.equippedHat === 'hat_captain') priceMultiplier *= 1.10; // Captain cap +10% price

        // Bait consumables
        if (this.player.activeBaits?.bait_lure > 0) {
            extraRarity += 0.35;
            this.player.activeBaits.bait_lure--;
            this.canvasRenderer.addFloatingText('✨ Prismatic Lure Active!', null, this.canvasRenderer.player.y - 48, '#38bdf8');
        }
        if (this.player.activeBaits?.bait_chum > 0) {
            priceMultiplier *= 2.5;
            boosterMultiplier *= 2.5;
            this.player.activeBaits.bait_chum--;
            this.canvasRenderer.addFloatingText('🌟 Golden Chum 2.5x Multiplier!', null, this.canvasRenderer.player.y - 48, '#facc15');
        }
        if (this.player.activeBaits?.bait_worm > 0) {
            this.player.activeBaits.bait_worm--;
        }

        const caughtFish = rollFishCatch(this.currentAreaId, this.player.level, boosterMultiplier, {
            extraRarityBonus: extraRarity,
            priceMultiplier
        });

        this.player.inventory.unshift(caughtFish);
        this.player.stats.totalCaught++;
        if (caughtFish.weight > this.player.stats.heaviestFish) {
            this.player.stats.heaviestFish = caughtFish.weight;
        }

        this.addExp(caughtFish.exp);

        soundManager.playCatchFanfare();
        this.canvasRenderer.addFloatingText(`+${caughtFish.name}!`, null, null, caughtFish.rarityColor);
        this.canvasRenderer.addFloatingText(`+${caughtFish.exp} EXP`, null, this.canvasRenderer.player.y - 42, '#a78bfa');

        this.savePlayerData(true);
        this.updateUI();
        this.showCatchModal(caughtFish);

        if (this.autoFish) {
            setTimeout(() => {
                this.closeCatchModal();
                if (this.autoFish && this.state === 'IDLE') {
                    if (this.player.inventory.length < this.player.inventoryCapacity) {
                        this.startCasting();
                    } else {
                        this.canvasRenderer.addFloatingText('🎒 Bag Full! Auto-Fish Stopped', null, null, '#f87171');
                        this.toggleAutoFish();
                    }
                }
            }, 1200);
        }
    }

    showCatchModal(fish) {
        this.dom.catchFishName.innerText = fish.name;
        this.dom.catchFishIcon.innerText = fish.icon;
        this.dom.catchFishRarity.innerText = `${fish.rarityName} (${fish.rarityMultiplier}x)`;
        this.dom.catchFishRarity.style.color = fish.rarityColor;
        this.dom.catchFishRarity.style.backgroundColor = fish.badgeBg;
        this.dom.catchFishRarity.style.borderColor = fish.badgeBorder;

        this.dom.catchFishWeight.innerText = `${fish.weight} kg`;
        this.dom.catchFishPrice.innerText = `${fish.price.toLocaleString()} 🪙`;
        this.dom.catchFishExp.innerText = `+${fish.exp} EXP`;

        this.dom.catchModal.classList.add('active');
    }

    closeCatchModal() {
        this.dom.catchModal.classList.remove('active');
        if (this.state === 'CAUGHT') {
            this.state = 'IDLE';
            this.updateActionButton();
            this.dom.actionStatusText.innerText = "Ready to cast!";
        }
    }

    // ==========================================================================
    // 4. AUTO-FISH (AFK) TOGGLE
    // ==========================================================================
    toggleAutoFish() {
        if (!this.player.hasAutoFishUnlocked) {
            soundManager.playQteMiss();
            this.canvasRenderer.addFloatingText('🔒 Auto-Fish is locked! Buy in Shop.', null, null, '#f87171');
            return;
        }

        this.autoFish = !this.autoFish;
        this.player.autoFishEnabled = this.autoFish;
        this.savePlayerData(false);

        if (this.dom.autoFishToggle) this.dom.autoFishToggle.classList.toggle('active', this.autoFish);
        if (this.dom.autoFishIndicator) this.dom.autoFishIndicator.innerText = this.autoFish ? 'ON' : 'OFF';

        if (this.autoFish) {
            this.canvasRenderer.addFloatingText('🤖 Auto-Fish Activated', null, null, '#38bdf8');
            if (this.state === 'IDLE') {
                this.startCasting();
            } else if (this.state === 'QTE') {
                // If toggled while looking at the minigame, immediately start auto-reeling!
                this.runAutoFishQte();
            } else if (this.state === 'HOOK_ALERT') {
                this.handleHookSuccess();
            }
        } else {
            this.canvasRenderer.addFloatingText('Auto-Fish Deactivated', null, null, '#94a3b8');
            if (this.autoQteInterval) {
                clearInterval(this.autoQteInterval);
                this.autoQteInterval = null;
            }
        }
    }

    // ==========================================================================
    // 5. PROGRESSION & LEVELING
    // ==========================================================================
    addExp(amount) {
        this.player.exp += amount;
        let needed = getExpNeededForLevel(this.player.level);

        while (this.player.exp >= needed) {
            this.player.exp -= needed;
            this.player.level++;
            soundManager.playLevelUp();
            this.canvasRenderer.addFloatingText(`🎉 LEVEL UP! Lv. ${this.player.level}`, null, null, '#facc15');
            needed = getExpNeededForLevel(this.player.level);
        }

        this.savePlayerData(true);
        this.updateUI();
    }

    // ==========================================================================
    // 6. INVENTORY & FISH MARKET
    // ==========================================================================
    openInventory() {
        this.updateInventoryModalUI();
        this.dom.inventoryModal.classList.add('active');
    }

    closeInventory() {
        this.dom.inventoryModal.classList.remove('active');
    }

    updateInventoryModalUI() {
        const inv = this.player.inventory;
        const cap = this.player.inventoryCapacity;

        this.dom.inventoryCapacityText.innerText = `${inv.length} / ${cap}`;

        const upgradeCost = INVENTORY_CONFIG.getUpgradeCost(cap);
        this.dom.upgradeCostText.innerText = `${upgradeCost.toLocaleString()} 🪙`;

        if (cap >= INVENTORY_CONFIG.maxCapacity) {
            this.dom.upgradeBagBtn.disabled = true;
            this.dom.upgradeBagBtn.innerText = "Max Capacity (200)";
        } else {
            this.dom.upgradeBagBtn.disabled = this.player.coins < upgradeCost;
            this.dom.upgradeBagBtn.innerHTML = `<span>🎒 Upgrade (+5 Slots)</span> <strong id="upgradeCostText">${upgradeCost} 🪙</strong>`;
        }

        const totalValue = inv.reduce((sum, f) => sum + f.price, 0);
        this.dom.sellAllBtn.disabled = inv.length === 0;
        this.dom.sellAllBtn.innerText = `Sell All (${totalValue.toLocaleString()} 🪙)`;

        if (inv.length === 0) {
            this.dom.emptyInventoryNotice.style.display = 'block';
            this.dom.inventoryGrid.innerHTML = '';
            return;
        }

        this.dom.emptyInventoryNotice.style.display = 'none';

        this.dom.inventoryGrid.innerHTML = inv.map(fish => `
            <div class="fish-card" style="border-color: ${fish.badgeBorder};">
                <div class="fish-card-header">
                    <span class="fish-icon">${fish.icon}</span>
                    <span class="fish-rarity-badge" style="color: ${fish.rarityColor}; background: ${fish.badgeBg}; border: 1px solid ${fish.badgeBorder};">
                        ${fish.rarityName}
                    </span>
                </div>
                <h4 class="fish-name">${fish.name}</h4>
                <div class="fish-meta">
                    <span>Weight: <strong>${fish.weight} kg</strong></span>
                    <span>Value: <strong style="color: #facc15;">${fish.price.toLocaleString()} 🪙</strong></span>
                </div>
                <button type="button" class="btn-sell-single" data-id="${fish.id}">
                    Sell for ${fish.price.toLocaleString()} 🪙
                </button>
            </div>
        `).join('');

        this.dom.inventoryGrid.querySelectorAll('.btn-sell-single').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                this.sellSingleFish(id);
            });
        });
    }

    sellSingleFish(id) {
        const index = this.player.inventory.findIndex(f => f.id === id);
        if (index === -1) return;

        const fish = this.player.inventory[index];
        this.player.coins += fish.price;
        this.player.stats.totalCoinsEarned += fish.price;
        this.player.inventory.splice(index, 1);

        soundManager.playCoin();
        this.canvasRenderer.addFloatingText(`+${fish.price} 🪙`, null, null, '#facc15');

        this.savePlayerData(true);
        this.updateUI();
        this.updateInventoryModalUI();
    }

    sellAllFish() {
        if (this.player.inventory.length === 0) return;

        const totalEarned = this.player.inventory.reduce((sum, f) => sum + f.price, 0);
        this.player.coins += totalEarned;
        this.player.stats.totalCoinsEarned += totalEarned;
        const count = this.player.inventory.length;
        this.player.inventory = [];

        soundManager.playCoin();
        this.canvasRenderer.addFloatingText(`Sold ${count} fish for +${totalEarned.toLocaleString()} 🪙!`, null, null, '#facc15');

        this.savePlayerData(true);
        this.updateUI();
        this.updateInventoryModalUI();
    }

    upgradeInventoryCapacity() {
        const cap = this.player.inventoryCapacity;
        if (cap >= INVENTORY_CONFIG.maxCapacity) return;

        const cost = INVENTORY_CONFIG.getUpgradeCost(cap);
        if (this.player.coins < cost) {
            soundManager.playQteMiss();
            alert("Not enough coins for bag upgrade!");
            return;
        }

        this.player.coins -= cost;
        this.player.inventoryCapacity = Math.min(INVENTORY_CONFIG.maxCapacity, cap + INVENTORY_CONFIG.upgradeStep);

        soundManager.playCoin();
        this.canvasRenderer.addFloatingText(`🎒 Bag Upgraded to ${this.player.inventoryCapacity} slots!`, null, null, '#38bdf8');

        this.savePlayerData(true);
        this.updateUI();
        this.updateInventoryModalUI();
    }

    // ==========================================================================
    // 6.5. FISH CAMP & SHOP (Captain Barnaby's Trading Post - Sell & Buy)
    // ==========================================================================
    openShop() {
        if (this.state === 'WAITING') {
            this.cancelFishing();
        }
        this.activeShopTab = this.activeShopTab || 'sell';
        this.switchShopTab(this.activeShopTab);
        this.updateShopUI();
        this.dom.shopModal.classList.add('active');
        soundManager.playQteSuccess();
    }

    closeShop() {
        this.dom.shopModal.classList.remove('active');
    }

    switchShopTab(tab) {
        this.activeShopTab = tab;
        if (tab === 'sell') {
            this.dom.shopTabSell?.classList.add('active');
            this.dom.shopTabBuy?.classList.remove('active');
            if (this.dom.shopSectionSell) this.dom.shopSectionSell.style.display = 'block';
            if (this.dom.shopSectionBuy) this.dom.shopSectionBuy.style.display = 'none';
        } else {
            this.dom.shopTabBuy?.classList.add('active');
            this.dom.shopTabSell?.classList.remove('active');
            if (this.dom.shopSectionBuy) this.dom.shopSectionBuy.style.display = 'block';
            if (this.dom.shopSectionSell) this.dom.shopSectionSell.style.display = 'none';
        }
        this.updateShopUI();
    }

    updateShopUI() {
        if (!this.dom.shopModal) return;

        // 1. Balance
        if (this.dom.shopModalCoins) {
            this.dom.shopModalCoins.innerText = `${this.player.coins.toLocaleString()} 🪙`;
        }

        const inv = this.player.inventory;
        const cap = this.player.inventoryCapacity;

        // 2. Sell Tab Information
        if (this.dom.shopSellCountBadge) this.dom.shopSellCountBadge.innerText = inv.length;
        if (this.dom.shopSellTackleCount) this.dom.shopSellTackleCount.innerText = `${inv.length} / ${cap}`;

        const totalValue = inv.reduce((sum, f) => sum + f.price, 0);
        if (this.dom.shopSellTotalVal) this.dom.shopSellTotalVal.innerText = `${totalValue.toLocaleString()} 🪙`;

        if (this.dom.shopSellAllBtn) {
            this.dom.shopSellAllBtn.disabled = inv.length === 0;
            this.dom.shopSellAllBtn.innerText = `💰 Sell All (${totalValue.toLocaleString()} 🪙)`;
        }

        if (this.dom.shopSellEmptyNotice) {
            this.dom.shopSellEmptyNotice.style.display = inv.length === 0 ? 'block' : 'none';
        }

        if (this.dom.shopSellGrid) {
            if (inv.length === 0) {
                this.dom.shopSellGrid.innerHTML = '';
            } else {
                this.dom.shopSellGrid.innerHTML = inv.map(fish => `
                    <div class="fish-card" style="border-color: ${fish.badgeBorder};">
                        <div class="fish-card-header">
                            <span class="fish-icon">${fish.icon}</span>
                            <span class="fish-rarity-badge" style="color: ${fish.rarityColor}; background: ${fish.badgeBg}; border: 1px solid ${fish.badgeBorder};">
                                ${fish.rarityName}
                            </span>
                        </div>
                        <h4 class="fish-name">${fish.name}</h4>
                        <div class="fish-meta">
                            <span>Weight: <strong>${fish.weight} kg</strong></span>
                            <span>Value: <strong style="color: #facc15;">${fish.price.toLocaleString()} 🪙</strong></span>
                        </div>
                        <button type="button" class="btn-sell-single btn-shop-sell-fish" data-id="${fish.id}">
                            Sell for ${fish.price.toLocaleString()} 🪙
                        </button>
                    </div>
                `).join('');

                this.dom.shopSellGrid.querySelectorAll('.btn-shop-sell-fish').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const id = btn.getAttribute('data-id');
                        this.sellSingleFish(id);
                        this.updateShopUI();
                    });
                });
            }
        }

        // 3. Buy Tab: Fishing Rods
        if (this.dom.shopRodsGrid) {
            this.dom.shopRodsGrid.innerHTML = SHOP_CATALOG.rods.map(rod => {
                const isOwned = (this.player.ownedRods || []).includes(rod.id);
                const isEquipped = this.player.equippedRod === rod.id;
                const canAfford = this.player.coins >= rod.price;

                let actionHtml = '';
                if (isEquipped) {
                    actionHtml = `<span class="badge-equipped">Equipped ✓</span>`;
                } else if (isOwned) {
                    actionHtml = `<button type="button" class="btn-shop-equip" data-equip-rod="${rod.id}">Equip</button>`;
                } else {
                    actionHtml = `
                        <button type="button" class="btn-shop-buy" data-buy-rod="${rod.id}" ${!canAfford ? 'disabled style="opacity: 0.6; cursor: not-allowed;"' : ''}>
                            Buy (${rod.price.toLocaleString()} 🪙)
                        </button>
                    `;
                }

                return `
                    <div class="shop-item-card ${isEquipped ? 'equipped' : ''}">
                        <div class="shop-item-top">
                            <span class="shop-item-icon" style="color: ${rod.color};">${rod.icon}</span>
                            <div class="shop-item-meta">
                                <h4 class="shop-item-name">${rod.name}</h4>
                                <p class="shop-item-desc">${rod.desc}</p>
                                <span class="shop-item-perk">⚡ -${Math.round(rod.speedBonus * 100)}% Bite Time ${rod.rarityBonus ? `• +${Math.round(rod.rarityBonus * 100)}% Rare Luck` : ''}</span>
                            </div>
                        </div>
                        <div class="shop-item-bottom">
                            <span class="shop-item-price">${rod.price > 0 ? `${rod.price.toLocaleString()} 🪙` : 'Starter'}</span>
                            ${actionHtml}
                        </div>
                    </div>
                `;
            }).join('');

            this.dom.shopRodsGrid.querySelectorAll('[data-buy-rod]').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.buyRod(btn.getAttribute('data-buy-rod'));
                });
            });

            this.dom.shopRodsGrid.querySelectorAll('[data-equip-rod]').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.equipRod(btn.getAttribute('data-equip-rod'));
                });
            });
        }

        // 4. Buy Tab: Baits & Boosters
        if (this.dom.shopBaitsGrid) {
            this.dom.shopBaitsGrid.innerHTML = SHOP_CATALOG.baits.map(bait => {
                const charges = (this.player.activeBaits && this.player.activeBaits[bait.id]) || 0;
                const canAfford = this.player.coins >= bait.price;

                return `
                    <div class="shop-item-card">
                        <div class="shop-item-top">
                            <span class="shop-item-icon">${bait.icon}</span>
                            <div class="shop-item-meta">
                                <h4 class="shop-item-name">${bait.name}</h4>
                                <p class="shop-item-desc">${bait.desc}</p>
                                <span class="shop-item-perk">Active Uses: <strong>${charges} remaining</strong></span>
                            </div>
                        </div>
                        <div class="shop-item-bottom">
                            <span class="shop-item-price">${bait.price} 🪙</span>
                            <button type="button" class="btn-shop-buy" data-buy-bait="${bait.id}" ${!canAfford ? 'disabled style="opacity: 0.6; cursor: not-allowed;"' : ''}>
                                Buy (+5 uses)
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            this.dom.shopBaitsGrid.querySelectorAll('[data-buy-bait]').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.buyBait(btn.getAttribute('data-buy-bait'));
                });
            });
        }

        // 5. Buy Tab: Tackle Bag & Cosmetic Hats
        if (this.dom.shopHatsGrid) {
            const upgradeCost = INVENTORY_CONFIG.getUpgradeCost(cap);
            const canAffordBag = this.player.coins >= upgradeCost && cap < INVENTORY_CONFIG.maxCapacity;

            const bagHtml = `
                <div class="shop-item-card">
                    <div class="shop-item-top">
                        <span class="shop-item-icon">🎒</span>
                        <div class="shop-item-meta">
                            <h4 class="shop-item-name">Tackle Box Upgrade (+5)</h4>
                            <p class="shop-item-desc">Increases fish storage capacity from ${cap} to ${Math.min(INVENTORY_CONFIG.maxCapacity, cap + 5)} slots.</p>
                            <span class="shop-item-perk">Current: ${cap} / ${INVENTORY_CONFIG.maxCapacity} slots</span>
                        </div>
                    </div>
                    <div class="shop-item-bottom">
                        <span class="shop-item-price">${cap >= INVENTORY_CONFIG.maxCapacity ? 'MAX' : `${upgradeCost} 🪙`}</span>
                        <button type="button" class="btn-shop-buy" id="shopUpgradeBagBtn" ${!canAffordBag ? 'disabled style="opacity: 0.6; cursor: not-allowed;"' : ''}>
                            ${cap >= INVENTORY_CONFIG.maxCapacity ? 'Maxed Out' : 'Expand Bag'}
                        </button>
                    </div>
                </div>
            `;

            const hatsHtml = SHOP_CATALOG.hats.map(hat => {
                const isOwned = (this.player.ownedHats || []).includes(hat.id);
                const isEquipped = this.player.equippedHat === hat.id;
                const canAfford = this.player.coins >= hat.price;

                let actionHtml = '';
                if (isEquipped) {
                    actionHtml = `<span class="badge-equipped">Wearing ✓</span>`;
                } else if (isOwned) {
                    actionHtml = `<button type="button" class="btn-shop-equip" data-equip-hat="${hat.id}">Wear</button>`;
                } else {
                    actionHtml = `
                        <button type="button" class="btn-shop-buy" data-buy-hat="${hat.id}" ${!canAfford ? 'disabled style="opacity: 0.6; cursor: not-allowed;"' : ''}>
                            Buy (${hat.price.toLocaleString()} 🪙)
                        </button>
                    `;
                }

                return `
                    <div class="shop-item-card ${isEquipped ? 'equipped' : ''}">
                        <div class="shop-item-top">
                            <span class="shop-item-icon">${hat.icon}</span>
                            <div class="shop-item-meta">
                                <h4 class="shop-item-name">${hat.name}</h4>
                                <p class="shop-item-desc">${hat.desc}</p>
                            </div>
                        </div>
                        <div class="shop-item-bottom">
                            <span class="shop-item-price">${hat.price > 0 ? `${hat.price.toLocaleString()} 🪙` : 'Starter'}</span>
                            ${actionHtml}
                        </div>
                    </div>
                `;
            }).join('');

            this.dom.shopHatsGrid.innerHTML = bagHtml + hatsHtml;

            const bagBtn = document.getElementById('shopUpgradeBagBtn');
            if (bagBtn) {
                bagBtn.addEventListener('click', () => {
                    this.upgradeInventoryCapacity();
                    this.updateShopUI();
                });
            }

            this.dom.shopHatsGrid.querySelectorAll('[data-buy-hat]').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.buyHat(btn.getAttribute('data-buy-hat'));
                });
            });

            this.dom.shopHatsGrid.querySelectorAll('[data-equip-hat]').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.equipHat(btn.getAttribute('data-equip-hat'));
                });
            });
        }

        // 6. Buy Tab: Modules & Automation
        if (this.dom.shopModulesGrid && SHOP_CATALOG.modules) {
            this.dom.shopModulesGrid.innerHTML = SHOP_CATALOG.modules.map(mod => {
                const isOwned = this.player.hasAutoFishUnlocked;
                const canAfford = this.player.coins >= mod.price;

                let actionHtml = '';
                if (isOwned) {
                    actionHtml = `<span class="badge-equipped">Unlocked ✓</span>`;
                } else {
                    actionHtml = `
                        <button type="button" class="btn-shop-buy" data-buy-mod="${mod.id}" ${!canAfford ? 'disabled style="opacity: 0.6; cursor: not-allowed;"' : ''}>
                            Unlock (${mod.price.toLocaleString()} 🪙)
                        </button>
                    `;
                }

                return `
                    <div class="shop-item-card ${isOwned ? 'equipped' : ''}">
                        <div class="shop-item-top">
                            <span class="shop-item-icon">${mod.icon}</span>
                            <div class="shop-item-meta">
                                <h4 class="shop-item-name">${mod.name}</h4>
                                <p class="shop-item-desc">${mod.desc}</p>
                                <span class="shop-item-perk">⚡ Fully Automatic AFK Fishing</span>
                            </div>
                        </div>
                        <div class="shop-item-bottom">
                            <span class="shop-item-price">${mod.price.toLocaleString()} 🪙</span>
                            ${actionHtml}
                        </div>
                    </div>
                `;
            }).join('');

            this.dom.shopModulesGrid.querySelectorAll('[data-buy-mod]').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.buyModule(btn.getAttribute('data-buy-mod'));
                });
            });
        }
    }

    buyModule(modId) {
        const mod = SHOP_CATALOG.modules?.find(m => m.id === modId);
        if (!mod || this.player.coins < mod.price) {
            soundManager.playQteMiss();
            return;
        }

        this.player.coins -= mod.price;
        if (modId === 'module_autofish') {
            this.player.hasAutoFishUnlocked = true;
            this.player.autoFishEnabled = true;
            this.autoFish = true;
            if (this.dom.autoFishToggle) this.dom.autoFishToggle.classList.add('active');
            if (this.dom.autoFishIndicator) this.dom.autoFishIndicator.innerText = 'ON';
        }

        soundManager.playCoin();
        this.canvasRenderer.addFloatingText(`🤖 Unlocked & Activated ${mod.name}!`, null, null, '#38bdf8');

        this.savePlayerData(true);
        this.updateUI();
        this.updateShopUI();
    }

    buyRod(rodId) {
        const rod = SHOP_CATALOG.rods.find(r => r.id === rodId);
        if (!rod || this.player.coins < rod.price) {
            soundManager.playQteMiss();
            return;
        }

        this.player.coins -= rod.price;
        if (!this.player.ownedRods.includes(rodId)) {
            this.player.ownedRods.push(rodId);
        }
        this.player.equippedRod = rodId;
        this.canvasRenderer.player.equippedRod = rodId;

        soundManager.playCoin();
        this.canvasRenderer.addFloatingText(`🎣 Bought & Equipped ${rod.name}!`, null, null, '#38bdf8');

        this.savePlayerData(true);
        this.updateUI();
        this.updateShopUI();
    }

    equipRod(rodId) {
        if (!this.player.ownedRods.includes(rodId)) return;
        this.player.equippedRod = rodId;
        this.canvasRenderer.player.equippedRod = rodId;

        const rod = SHOP_CATALOG.rods.find(r => r.id === rodId);
        soundManager.playQteSuccess();
        this.canvasRenderer.addFloatingText(`🎣 Equipped ${rod?.name || 'Rod'}!`, null, null, '#38bdf8');

        this.savePlayerData(true);
        this.updateShopUI();
    }

    buyBait(baitId) {
        const bait = SHOP_CATALOG.baits.find(b => b.id === baitId);
        if (!bait || this.player.coins < bait.price) {
            soundManager.playQteMiss();
            return;
        }

        this.player.coins -= bait.price;
        this.player.activeBaits = this.player.activeBaits || {};
        this.player.activeBaits[baitId] = (this.player.activeBaits[baitId] || 0) + (bait.charges || 5);

        soundManager.playCoin();
        this.canvasRenderer.addFloatingText(`+${bait.charges} ${bait.name}!`, null, null, '#facc15');

        this.savePlayerData(true);
        this.updateUI();
        this.updateShopUI();
    }

    buyHat(hatId) {
        const hat = SHOP_CATALOG.hats.find(h => h.id === hatId);
        if (!hat || this.player.coins < hat.price) {
            soundManager.playQteMiss();
            return;
        }

        this.player.coins -= hat.price;
        if (!this.player.ownedHats.includes(hatId)) {
            this.player.ownedHats.push(hatId);
        }
        this.player.equippedHat = hatId;
        this.canvasRenderer.player.equippedHat = hatId;

        soundManager.playCoin();
        this.canvasRenderer.addFloatingText(`👑 Equipped ${hat.name}!`, null, null, '#facc15');

        this.savePlayerData(true);
        this.updateUI();
        this.updateShopUI();
    }

    equipHat(hatId) {
        if (!this.player.ownedHats.includes(hatId)) return;
        this.player.equippedHat = hatId;
        this.canvasRenderer.player.equippedHat = hatId;

        const hat = SHOP_CATALOG.hats.find(h => h.id === hatId);
        soundManager.playQteSuccess();
        this.canvasRenderer.addFloatingText(`👑 Wearing ${hat?.name || 'Hat'}!`, null, null, '#facc15');

        this.savePlayerData(true);
        this.updateShopUI();
    }

    // ==========================================================================
    // 7. AREA SELECTOR (Accessible via Continue / New Game flow or in-game button)
    // ==========================================================================
    openAreaSelector() {
        this.renderAreaList();
        this.dom.areaModal.classList.add('active');
    }

    closeAreaSelector() {
        this.dom.areaModal.classList.remove('active');
    }

    renderAreaList() {
        this.dom.areaListContainer.innerHTML = AREAS_CONFIG.map(area => {
            const isSelected = area.id === this.currentAreaId;
            const isUnlocked = area.unlocked;

            return `
                <div class="area-card ${isSelected ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}" data-id="${area.id}">
                    <div class="area-card-left">
                        <span class="area-icon">${area.icon}</span>
                        <div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <h4 class="area-name">${area.name}</h4>
                                <span class="area-bonus-badge">${area.expBonus}x EXP</span>
                                ${!isUnlocked ? `<span class="area-locked-badge">🔒 Locked</span>` : ''}
                            </div>
                            <p class="area-desc">${area.description}</p>
                        </div>
                    </div>
                    <div class="area-card-right">
                        ${isSelected ? `<span class="area-active-tag">Active</span>` : ''}
                        ${isUnlocked && !isSelected ? `<button type="button" class="btn-select-area" data-id="${area.id}">Cast Here 🎣</button>` : ''}
                        ${!isUnlocked ? `<span style="font-size: 11px; color: #94a3b8; font-weight: 700;">Coming Soon</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        this.dom.areaListContainer.querySelectorAll('.btn-select-area').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                this.selectArea(id);
            });
        });
    }

    selectArea(areaId) {
        const area = AREAS_CONFIG.find(a => a.id === areaId);
        if (!area || !area.unlocked) return;

        if (this.state !== 'IDLE') {
            this.cancelFishing();
        }

        this.currentAreaId = area.id;
        this.canvasRenderer.setArea(area.id);
        this.savePlayerData(true);
        this.updateUI();
        this.closeAreaSelector();

        soundManager.playQteSuccess();
        this.canvasRenderer.addFloatingText(`Arrived at ${area.name}!`, null, null, '#38bdf8');
    }

    // ==========================================================================
    // 8. UI UPDATER (IN-GAME HUD)
    // ==========================================================================
    updateUI() {
        this.dom.playerLevel.innerText = `Lv. ${this.player.level}`;
        const needed = getExpNeededForLevel(this.player.level);
        const pct = Math.min(100, Math.round((this.player.exp / needed) * 100));
        this.dom.playerExpText.innerText = `${this.player.exp} / ${needed} EXP`;
        this.dom.playerExpFill.style.width = `${pct}%`;

        this.dom.playerCoins.innerText = `${this.player.coins.toLocaleString()} 🪙`;
        this.dom.inventoryBtnCount.innerText = `${this.player.inventory.length}/${this.player.inventoryCapacity}`;

        const area = AREAS_CONFIG.find(a => a.id === this.currentAreaId) || AREAS_CONFIG[0];
        if (this.dom.currentAreaName) this.dom.currentAreaName.innerText = area.name;
        if (this.dom.currentAreaBonus) this.dom.currentAreaBonus.innerText = `${area.expBonus}x EXP`;

        // Auto-Fish toggle visibility based on unlock status
        if (this.dom.autoFishContainer) {
            this.dom.autoFishContainer.style.display = this.player.hasAutoFishUnlocked ? 'block' : 'none';
        }
        if (this.dom.autoFishToggle && this.dom.autoFishIndicator) {
            this.dom.autoFishToggle.classList.toggle('active', !!this.autoFish);
            this.dom.autoFishIndicator.innerText = this.autoFish ? 'ON' : 'OFF';
        }

        this.updateActionButton();
    }

    updateActionButton() {
        const btn = this.dom.actionButton;
        if (!btn) return;
        if (this.state === 'IDLE') {
            btn.className = 'btn-circular-cast';
            btn.innerHTML = '<span class="cast-btn-icon">🎣</span><span class="cast-btn-label">Cast</span>';
            btn.disabled = false;
        } else if (this.state === 'WAITING') {
            btn.className = 'btn-circular-cast btn-cancel';
            btn.innerHTML = '<span class="cast-btn-icon">❌</span><span class="cast-btn-label">Cancel</span>';
            btn.disabled = false;
        } else if (this.state === 'HOOK_ALERT') {
            btn.className = 'btn-circular-cast btn-alert-pulse';
            btn.innerHTML = '<span class="cast-btn-icon">⚡</span><span class="cast-btn-label">HOOK!</span>';
            btn.disabled = false;
        } else if (this.state === 'QTE') {
            btn.className = 'btn-circular-cast btn-disabled';
            btn.innerHTML = '<span class="cast-btn-icon">🔄</span><span class="cast-btn-label">Reel</span>';
            btn.disabled = true;
        } else if (this.state === 'CAUGHT') {
            btn.className = 'btn-circular-cast btn-disabled';
            btn.innerHTML = '<span class="cast-btn-icon">✨</span><span class="cast-btn-label">Done</span>';
            btn.disabled = true;
        }
    }
}

// Instantiate game on page load
window.addEventListener('DOMContentLoaded', () => {
    window.game = new PixelFishingGame();
});

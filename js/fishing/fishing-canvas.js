/**
 * Pixel Fishing Game - HTML5 Canvas Pixel-Art Renderer
 * Updated Aesthetic: Cozy 16-bit indie RPG art style matching the user's screenshot.
 *
 * Fixes & Features:
 * 1. Fixed Layout:
 *    - Lake is bounded on the left (X: 0 to 310, Y: 0 to 155).
 *    - The entire right side (X >= 310, Y: 0 to 270) is SOLID LAND and forest clearing!
 *    - NO trees in the water! Background trees are planted firmly on dry forest soil at the top-right.
 *    - The Cabin sits squarely on solid sage-green grass at (X: 390, Y: 110) with stacked woodpile,
 *      chopping block with axe, mini shed, and timber bench.
 *    - Continuous, smooth winding dirt footpath connecting the cabin door seamlessly to the fishing pier!
 * 2. Fish Silhouettes Based on Area Rarity:
 *    - Starter Pond contains only Common fish -> ONLY small minnow shadows spawn (7-10px)!
 * 3. Dynamic Cast Bait Trajectory & Variable Range:
 *    - Bait landing spot varies widely in distance (Y: 38 to 130) and spread (X: 45 to 295).
 *    - Animated ballistic flight trajectory with water splash ripple.
 * 4. Shop NPC Captain Barnaby stands outside the cabin door on solid ground.
 */

import { AREAS_CONFIG } from './fishing-config.js';

export class FishingCanvas {
    constructor(canvas, config) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.config = config || {};

        this.currentArea = 'starter_pond';

        this.width = 480;
        this.height = 270;
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        // Player state
        this.player = {
            x: 160,
            y: 195,
            speed: 1.8,
            dir: 'N',
            facingAngle: -Math.PI / 2,
            isMoving: false,
            animTimer: 0,
            walkFrame: 0,
            isFishing: false,
            equippedRod: 'rod_bamboo',
            equippedHat: 'hat_default'
        };

        this.targetPos = null;

        // Bobber with ballistic flight physics
        this.bobber = {
            active: false,
            x: 200,
            y: 95,
            baseY: 95,
            startX: 160,
            startY: 195,
            targetX: 200,
            targetY: 95,
            flightProgress: 1.0,
            isFlying: false,
            arcHeight: 40,
            isBiting: false
        };

        // Cabin & Shop NPC on the right solid ground
        this.camp = {
            x: 390,
            y: 155,
            npcX: 388,
            npcY: 195,
            interactRadius: 52,
            isHovered: false
        };

        this.onOpenShop = null;

        this.time = 0;
        this.ripples = [];
        this.floatingTexts = [];
        this.shadowFish = [];
        this.initShadowFish();

        this.keys = {};
        this.setupInputListeners();

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.ctx.imageSmoothingEnabled = false;
    }

    setArea(areaId) {
        this.currentArea = areaId;
        this.ripples = [];
        this.initShadowFish();
        if (areaId === 'starter_pond') {
            this.player.x = 160;
            this.player.y = 195;
            this.player.dir = 'N';
        } else {
            this.player.x = 200;
            this.player.y = 205;
            this.player.dir = 'N';
        }
    }

    // --- FISH SILHOUETTES BASED ON AREA RARITY ---
    getFishSizesForCurrentArea() {
        const area = AREAS_CONFIG.find(a => a.id === this.currentArea) || AREAS_CONFIG[0];
        const chances = area.rarityChances || [{ rarity: 'common', chance: 1.0 }];
        const raritiesPresent = chances.map(c => c.rarity);

        const hasGodlyOrLegendary = raritiesPresent.some(r => 
            ['godly', 'heavenly', 'angelic', 'mythical', 'ultra_rare', 'legendary'].includes(r)
        );
        const hasRare = raritiesPresent.includes('rare');
        const hasLarge = raritiesPresent.includes('large');

        if (hasGodlyOrLegendary) {
            return [
                { type: 'small', length: 8, height: 3, speed: 0.55 + Math.random() * 0.3, tail: 4, prob: 0.30 },
                { type: 'medium', length: 16, height: 5, speed: 0.35 + Math.random() * 0.2, tail: 6, prob: 0.30 },
                { type: 'large', length: 26, height: 8, speed: 0.22 + Math.random() * 0.12, tail: 8, prob: 0.25 },
                { type: 'monster', length: 42, height: 13, speed: 0.12 + Math.random() * 0.08, tail: 12, prob: 0.15 }
            ];
        } else if (hasRare) {
            return [
                { type: 'small', length: 8, height: 3, speed: 0.55 + Math.random() * 0.3, tail: 4, prob: 0.45 },
                { type: 'medium', length: 16, height: 5, speed: 0.35 + Math.random() * 0.2, tail: 6, prob: 0.35 },
                { type: 'large', length: 24, height: 7, speed: 0.22 + Math.random() * 0.12, tail: 7, prob: 0.20 }
            ];
        } else if (hasLarge) {
            return [
                { type: 'small', length: 8, height: 3, speed: 0.55 + Math.random() * 0.3, tail: 4, prob: 0.70 },
                { type: 'medium', length: 15, height: 5, speed: 0.35 + Math.random() * 0.2, tail: 5, prob: 0.30 }
            ];
        } else {
            // ONLY COMMON FISH (Starter Pond) -> ONLY small fish silhouettes!
            return [
                { type: 'small', length: 7 + Math.random() * 3, height: 3, speed: 0.45 + Math.random() * 0.35, tail: 3, prob: 1.0 }
            ];
        }
    }

    createShadowFish(initialX = null) {
        const pool = this.getFishSizesForCurrentArea();
        let rand = Math.random();
        let picked = pool[0];
        let accum = 0;
        for (const s of pool) {
            accum += s.prob;
            if (rand <= accum) {
                picked = s;
                break;
            }
        }

        const dir = Math.random() > 0.5 ? 1 : -1;
        // Keep fish strictly inside the water bounds (X: 20 to 290, Y: 30 to 135)
        const x = initialX !== null ? initialX : Math.random() * 260 + 20;
        const y = 30 + Math.random() * 105;

        return {
            x,
            y,
            speed: picked.speed,
            length: picked.length,
            height: picked.height,
            tailSize: picked.tail,
            type: picked.type,
            wiggle: Math.random() * Math.PI * 2,
            dir
        };
    }

    initShadowFish() {
        this.shadowFish = [];
        for (let i = 0; i < 5; i++) {
            this.shadowFish.push(this.createShadowFish());
        }
    }

    setupInputListeners() {
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            const key = e.key.toLowerCase();
            if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(key)) {
                this.keys[key] = true;
                this.targetPos = null;
            }
            if (key === 'e') {
                const distToNpc = Math.hypot(this.player.x - this.camp.npcX, this.player.y - this.camp.npcY);
                if (distToNpc <= this.camp.interactRadius && this.onOpenShop) {
                    this.onOpenShop();
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (this.keys[key]) {
                delete this.keys[key];
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.width / rect.width;
            const scaleY = this.height / rect.height;
            const mouseX = (e.clientX - rect.left) * scaleX;
            const mouseY = (e.clientY - rect.top) * scaleY;

            // Hover over Cabin or NPC area (X: 350-475, Y: 110-245)
            const isInsideCamp = mouseX >= 350 && mouseX <= 475 && mouseY >= 110 && mouseY <= 245;
            this.camp.isHovered = isInsideCamp;
            this.canvas.style.cursor = isInsideCamp ? 'pointer' : 'default';
        });

        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.width / rect.width;
            const scaleY = this.height / rect.height;
            const clickX = (e.clientX - rect.left) * scaleX;
            const clickY = (e.clientY - rect.top) * scaleY;

            // Click on Cabin or NPC opens Shop
            if (clickX >= 350 && clickX <= 475 && clickY >= 110 && clickY <= 245) {
                if (this.onOpenShop) {
                    this.onOpenShop();
                    return;
                }
            }

            if (this.player.isFishing) return;

            // Walkable navigation
            // Pier on left: X in [45, 115], Y in [130, 172]
            // Meadow shore: X in [25, 455], Y in [165, 248]
            let clampedX = Math.max(25, Math.min(this.width - 25, clickX));
            let clampedY = Math.max(165, Math.min(248, clickY));

            if (clickX >= 45 && clickX <= 115 && clickY >= 130 && clickY <= 172) {
                clampedX = clickX;
                clampedY = clickY;
            }

            this.targetPos = { x: clampedX, y: clampedY };
        });
    }

    // --- VARIABLE CAST BAIT RANGE & TRAJECTORY ---
    castLine() {
        this.player.isFishing = true;
        this.player.dir = 'N';

        // Wide spread across the lake water body (X: 45 to 295, Y: 38 to 132)
        const spreadX = (Math.random() - 0.5) * 180;
        const targetX = Math.max(45, Math.min(295, this.player.x + spreadX));
        const targetY = 38 + Math.random() * 94;

        const rodTip = this.getRodTipPosition();

        this.bobber.active = true;
        this.bobber.startX = rodTip.x;
        this.bobber.startY = rodTip.y;
        this.bobber.targetX = targetX;
        this.bobber.targetY = targetY;
        this.bobber.baseY = targetY;
        this.bobber.x = rodTip.x;
        this.bobber.y = rodTip.y;
        this.bobber.flightProgress = 0;
        this.bobber.isFlying = true;
        this.bobber.arcHeight = 35 + Math.random() * 25;
        this.bobber.isBiting = false;
    }

    setBite(isBiting) {
        this.bobber.isBiting = isBiting;
        if (isBiting) {
            this.addRipple(this.bobber.x, this.bobber.y, 8, 2.0);
            this.addRipple(this.bobber.x, this.bobber.y, 14, 1.5);
        }
    }

    recallLine() {
        this.player.isFishing = false;
        this.bobber.active = false;
        this.bobber.isFlying = false;
        this.bobber.isBiting = false;
    }

    addRipple(x, y, maxRadius = 15, speed = 1.0) {
        this.ripples.push({
            x,
            y,
            radius: 2,
            maxRadius,
            speed,
            alpha: 0.85
        });
    }

    addFloatingText(text, x, y, color = '#fef08a') {
        this.floatingTexts.push({
            text,
            x: x || this.player.x,
            y: (y || this.player.y - 28),
            vy: -0.6,
            alpha: 1.0,
            color
        });
    }

    update() {
        this.time += 0.05;

        // Player movement
        if (!this.player.isFishing) {
            let dx = 0;
            let dy = 0;

            if (this.keys['w'] || this.keys['arrowup']) dy -= 1;
            if (this.keys['s'] || this.keys['arrowdown']) dy += 1;
            if (this.keys['a'] || this.keys['arrowleft']) dx -= 1;
            if (this.keys['d'] || this.keys['arrowright']) dx += 1;

            if (this.targetPos) {
                const toX = this.targetPos.x - this.player.x;
                const toY = this.targetPos.y - this.player.y;
                const dist = Math.hypot(toX, toY);
                if (dist > 3) {
                    dx = toX / dist;
                    dy = toY / dist;
                } else {
                    this.targetPos = null;
                }
            }

            if (dx !== 0 || dy !== 0) {
                this.player.isMoving = true;
                const len = Math.hypot(dx, dy);
                const normX = (dx / len) * this.player.speed;
                const normY = (dy / len) * this.player.speed;

                const nextX = this.player.x + normX;
                const nextY = this.player.y + normY;

                const isOnPier = nextX >= 45 && nextX <= 118 && nextY >= 130 && nextY <= 175;
                const isOnShore = nextX >= 25 && nextX <= this.width - 25 && nextY >= 165 && nextY <= 248;

                if (isOnPier || isOnShore) {
                    this.player.x = nextX;
                    this.player.y = nextY;
                } else if (isOnShore) {
                    this.player.x = Math.max(25, Math.min(this.width - 25, nextX));
                    this.player.y = Math.max(165, Math.min(248, nextY));
                }

                this.update8Direction(dx, dy);

                this.player.animTimer++;
                if (this.player.animTimer % 8 === 0) {
                    this.player.walkFrame = (this.player.walkFrame + 1) % 4;
                }
            } else {
                this.player.isMoving = false;
                this.player.walkFrame = 0;
            }
        }

        // Bobber flight and floating physics
        if (this.bobber.active) {
            if (this.bobber.isFlying) {
                this.bobber.flightProgress += 0.055;
                const t = Math.min(1.0, this.bobber.flightProgress);
                const linearX = this.bobber.startX + (this.bobber.targetX - this.bobber.startX) * t;
                const linearY = this.bobber.startY + (this.bobber.targetY - this.bobber.startY) * t;
                const arc = Math.sin(t * Math.PI) * this.bobber.arcHeight;

                this.bobber.x = linearX;
                this.bobber.y = linearY - arc;

                if (t >= 1.0) {
                    this.bobber.isFlying = false;
                    this.bobber.x = this.bobber.targetX;
                    this.bobber.y = this.bobber.targetY;
                    this.bobber.baseY = this.bobber.targetY;
                    this.addRipple(this.bobber.x, this.bobber.y, 8, 1.8);
                    this.addRipple(this.bobber.x, this.bobber.y, 14, 1.2);
                }
            } else if (this.bobber.isBiting) {
                this.bobber.y = this.bobber.baseY + Math.sin(this.time * 18) * 3.5 + 2;
                if (Math.random() < 0.22) {
                    this.addRipple(this.bobber.x, this.bobber.y, 7, 1.8);
                }
            } else {
                this.bobber.y = this.bobber.baseY + Math.sin(this.time * 2) * 1.5;
                if (Math.random() < 0.02) {
                    this.addRipple(this.bobber.x, this.bobber.y, 5, 0.6);
                }
            }
        }

        // Stepped pixel ripples update
        for (let i = this.ripples.length - 1; i >= 0; i--) {
            const r = this.ripples[i];
            r.radius += 0.32 * r.speed;
            r.alpha -= 0.016;
            if (r.alpha <= 0 || r.radius >= r.maxRadius) {
                this.ripples.splice(i, 1);
            }
        }

        // Shadow fish update (bounded by water width: strictly X <= 300)
        this.shadowFish.forEach(fish => {
            fish.x += fish.speed * fish.dir;
            fish.wiggle += 0.14;
            if (fish.x > 295) {
                Object.assign(fish, this.createShadowFish(-25));
                fish.dir = 1;
            } else if (fish.x < -25) {
                Object.assign(fish, this.createShadowFish(290));
                fish.dir = -1;
            }
        });

        // Floating texts
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.y += ft.vy;
            ft.alpha -= 0.018;
            if (ft.alpha <= 0) {
                this.floatingTexts.splice(i, 1);
            }
        }
    }

    update8Direction(dx, dy) {
        if (Math.abs(dx) < 0.1 && dy < -0.1) this.player.dir = 'N';
        else if (dx > 0.1 && dy < -0.1) this.player.dir = 'NE';
        else if (dx > 0.1 && Math.abs(dy) < 0.1) this.player.dir = 'E';
        else if (dx > 0.1 && dy > 0.1) this.player.dir = 'SE';
        else if (Math.abs(dx) < 0.1 && dy > 0.1) this.player.dir = 'S';
        else if (dx < -0.1 && dy > 0.1) this.player.dir = 'SW';
        else if (dx < -0.1 && Math.abs(dy) < 0.1) this.player.dir = 'W';
        else if (dx < -0.1 && dy < -0.1) this.player.dir = 'NW';
    }

    render() {
        this.update();
        this.ctx.clearRect(0, 0, this.width, this.height);

        if (this.currentArea === 'fishing_pool') {
            this.renderFishingPool();
        } else {
            this.renderCozyLakeAndCabin();
        }

        this.renderShadowFish();
        this.renderRipples();

        if (this.bobber.active) {
            this.renderFishingLineAndBobber();
        }

        this.renderPlayer();
        this.renderShopNPC();
        this.renderFloatingText();
    }

    // =========================================================================
    // PROPER ENVIRONMENT LAYOUT (CABIN ON SOLID GROUND, NO TREES IN WATER)
    // =========================================================================
    renderCozyLakeAndCabin() {
        const ctx = this.ctx;
        const lakeWidth = 310;
        const waterHeight = 155;

        // 1. SOLID LAND BASE ACROSS ENTIRE RIGHT SIDE & BOTTOM
        // Sage-green ground (#769b83) covers right side from Y=0 to 270, and bottom from Y=155 to 270
        ctx.fillStyle = '#769b83';
        ctx.fillRect(0, 0, this.width, this.height);

        // Darker forest shade under top-right trees
        ctx.fillStyle = '#567c66';
        ctx.fillRect(lakeWidth, 0, this.width - lakeWidth, 90);

        // 2. MOUNTAIN LAKE WATER (Strictly on left: X: 0 to 310, Y: 0 to 155)
        ctx.fillStyle = '#2c5464';
        ctx.fillRect(0, 0, lakeWidth, waterHeight);

        // Stepped water wave bands (only inside water bounds)
        const waveBands = [
            { y: 16, h: 5, col: '#366173' },
            { y: 34, h: 6, col: '#3d7083' },
            { y: 55, h: 6, col: '#498599' },
            { y: 78, h: 7, col: '#3d7083' },
            { y: 102, h: 7, col: '#498599' },
            { y: 124, h: 7, col: '#366173' },
            { y: 142, h: 7, col: '#254755' }
        ];

        waveBands.forEach(band => {
            ctx.fillStyle = band.col;
            const waveShift = Math.sin(this.time * 0.8 + band.y * 0.12) * 4;
            for (let x = -8; x < lakeWidth - 5; x += 18) {
                const py = Math.round(band.y + Math.sin(this.time + x * 0.08) * 1.5);
                ctx.fillRect(x + waveShift, py, 13, band.h);
            }
        });

        // Water sparkles (strictly inside water)
        ctx.fillStyle = '#bce3ee';
        for (let i = 0; i < 8; i++) {
            const sx = Math.round(((i * 39 + this.time * 12) % (lakeWidth - 30)) + 15);
            const sy = Math.round(20 + (i * 19) % 115);
            const alpha = (Math.sin(this.time * 2.5 + i) + 1) * 0.35;
            ctx.globalAlpha = Math.max(0.1, alpha);
            ctx.fillRect(sx, sy, 2, 1);
            ctx.fillRect(sx + 1, sy - 1, 1, 3);
        }
        ctx.globalAlpha = 1.0;

        // Floating Lily Pads (strictly in lake)
        const lilyPads = [
            { x: 135, y: 55, r: 11, flower: true },
            { x: 220, y: 105, r: 12, flower: false },
            { x: 260, y: 55, r: 13, flower: true },
            { x: 75, y: 85, r: 10, flower: false }
        ];

        lilyPads.forEach((pad, idx) => {
            const bobY = Math.round(pad.y + Math.sin(this.time + idx) * 1.2);
            ctx.fillStyle = 'rgba(25, 45, 55, 0.45)';
            ctx.beginPath();
            ctx.ellipse(pad.x, bobY + 2, pad.r, pad.r * 0.65, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#384c3c';
            ctx.beginPath();
            ctx.arc(pad.x, bobY, pad.r, 0.35, Math.PI * 1.85);
            ctx.lineTo(pad.x, bobY);
            ctx.fill();

            ctx.fillStyle = '#59775f';
            ctx.beginPath();
            ctx.arc(pad.x, bobY, pad.r * 0.75, 0.4, Math.PI * 1.8);
            ctx.lineTo(pad.x, bobY);
            ctx.fill();

            if (pad.flower) {
                ctx.fillStyle = '#d9859b';
                ctx.fillRect(pad.x - 2, bobY - 2, 4, 3);
                ctx.fillStyle = '#fce7b2';
                ctx.fillRect(pad.x - 1, bobY - 1, 2, 1);
            }
        });

        // 3. SHORELINE BANKS (Frames the lake on bottom and right)
        this.renderShorelineEdge(lakeWidth, waterHeight);

        // 4. WOODEN FISHING PIER ON LEFT
        this.renderWoodenPier();

        // 5. SMOOTH WINDING DIRT FOOTPATH & MEADOW DETAILS
        this.renderSageMeadow(lakeWidth);

        // 6. SCREENSHOT CABIN & YARD ACCENTS (Firmly on solid right-side land!)
        this.renderScreenshotCabin(lakeWidth);
    }

    renderWoodenPier() {
        const ctx = this.ctx;
        const x1 = 48;
        const x2 = 115;
        const yTop = 132;
        const yBottom = 168;

        // Submerged Pilings
        [52, 80, 110].forEach(px => {
            ctx.fillStyle = 'rgba(20, 40, 50, 0.55)';
            ctx.fillRect(px, yTop + 10, 6, 24);

            ctx.fillStyle = '#5c3726';
            ctx.fillRect(px, yTop + 2, 6, 28);
            ctx.fillStyle = '#8c563e';
            ctx.fillRect(px + 1, yTop + 2, 2, 28);

            ctx.fillStyle = '#3a5948';
            ctx.fillRect(px, yTop + 22, 6, 3);
        });

        // Cedar Planks
        for (let py = yTop; py < yBottom; py += 7) {
            const isAlt = (py % 14) === 0;
            ctx.fillStyle = isAlt ? '#b67d58' : '#8c563e';
            ctx.fillRect(x1, py, x2 - x1, 6);

            ctx.fillStyle = '#c8926d';
            ctx.fillRect(x1, py, x2 - x1, 1);
            ctx.fillStyle = '#4a2818';
            ctx.fillRect(x1, py + 5, x2 - x1, 1);

            ctx.fillStyle = '#2b3648';
            ctx.fillRect(x1 + 3, py + 2, 2, 1);
            ctx.fillRect(x2 - 5, py + 2, 2, 1);
        }

        // Mooring Posts
        [x1 + 2, x2 - 6].forEach(bx => {
            ctx.fillStyle = '#5c3726';
            ctx.fillRect(bx, yTop - 4, 4, 6);
            ctx.fillStyle = '#8c563e';
            ctx.fillRect(bx, yTop - 5, 4, 2);
            ctx.fillStyle = '#e8d4b8';
            ctx.fillRect(bx - 1, yTop, 6, 2);
        });
    }

    renderShorelineEdge(lakeWidth, waterHeight) {
        const ctx = this.ctx;

        // Bottom horizontal shoreline (X: 0 to lakeWidth)
        const wave = Math.sin(this.time * 2) * 1.5;
        ctx.fillStyle = '#d2ecf4';
        for (let x = 0; x < lakeWidth; x += 8) {
            if (x >= 45 && x <= 118) continue;
            const fy = Math.round(waterHeight - 3 + Math.sin(this.time * 1.5 + x * 0.12) * 1.2 + wave);
            ctx.fillRect(x, fy, 6, 2);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x + 2, fy, 2, 1);
            ctx.fillStyle = '#d2ecf4';
        }

        // Right vertical bank separating lake from cabin clearing (X = lakeWidth, Y: 0 to waterHeight)
        for (let y = 0; y < waterHeight; y += 8) {
            const fx = Math.round(lakeWidth - 4 + Math.sin(this.time * 1.2 + y * 0.15) * 1.2);
            ctx.fillStyle = '#d2ecf4';
            ctx.fillRect(fx, y, 3, 6);
        }

        // Waterline shadow undercut
        ctx.fillStyle = '#1c3742';
        ctx.fillRect(0, waterHeight, lakeWidth + 3, 3);
        ctx.fillRect(lakeWidth, 0, 3, waterHeight);

        // Muddy clay bank
        ctx.fillStyle = '#66412f';
        ctx.fillRect(0, waterHeight + 2, lakeWidth + 5, 3);
        ctx.fillRect(lakeWidth + 2, 0, 3, waterHeight + 5);

        // Slate stone cliff border
        ctx.fillStyle = '#39475c';
        ctx.fillRect(0, waterHeight + 5, lakeWidth + 7, 4);
        ctx.fillRect(lakeWidth + 4, 0, 4, waterHeight + 8);

        ctx.fillStyle = '#5b6e8a';
        for (let sx = 0; sx < lakeWidth; sx += 16) {
            ctx.fillRect(sx, waterHeight + 5, 3, 1);
            ctx.fillRect(sx + 7, waterHeight + 7, 3, 1);
        }
        for (let sy = 0; sy < waterHeight; sy += 16) {
            ctx.fillRect(lakeWidth + 5, sy, 1, 3);
            ctx.fillRect(lakeWidth + 6, sy + 7, 1, 3);
        }
    }

    renderSageMeadow(lakeWidth) {
        const ctx = this.ctx;

        // Organic grass tufts
        ctx.fillStyle = '#9cbfa8';
        for (let gx = 12; gx < this.width - 20; gx += 22) {
            const gy = 172 + (gx * 9) % 76;
            if (gx > 340 && gy < 220) continue; // keep cabin front clear
            ctx.fillRect(gx, gy, 2, 3);
            ctx.fillRect(gx + 2, gy - 1, 2, 4);
        }

        // CONTINUOUS SMOOTH WINDING DIRT FOOTPATH
        // Starts at Cabin Doorstep (X: 388, Y: 180), curves smoothly across meadow to the Pier (X: 95, Y: 168)
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 1. Dark earth foundation
        ctx.strokeStyle = '#613e2b';
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.moveTo(388, 180);
        ctx.quadraticCurveTo(365, 205, 310, 214);
        ctx.quadraticCurveTo(240, 222, 175, 212);
        ctx.quadraticCurveTo(120, 198, 92, 168);
        ctx.stroke();

        // 2. Warm clay midtone
        ctx.strokeStyle = '#916246';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(388, 180);
        ctx.quadraticCurveTo(365, 205, 310, 214);
        ctx.quadraticCurveTo(240, 222, 175, 212);
        ctx.quadraticCurveTo(120, 198, 92, 168);
        ctx.stroke();

        // 3. Earthen highlight center
        ctx.strokeStyle = '#b88a68';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(388, 180);
        ctx.quadraticCurveTo(365, 205, 310, 214);
        ctx.quadraticCurveTo(240, 222, 175, 212);
        ctx.quadraticCurveTo(120, 198, 92, 168);
        ctx.stroke();

        // Little stepping pebbles on path
        ctx.fillStyle = '#cbb39e';
        const pebbles = [
            { x: 375, y: 195 },
            { x: 335, y: 208 },
            { x: 275, y: 216 },
            { x: 215, y: 217 },
            { x: 155, y: 208 },
            { x: 110, y: 185 }
        ];
        pebbles.forEach(p => {
            ctx.fillRect(p.x, p.y, 3, 2);
            ctx.fillStyle = '#8c563e';
            ctx.fillRect(p.x + 1, p.y + 1, 1, 1);
            ctx.fillStyle = '#cbb39e';
        });

        // Wildflowers
        const flowers = [
            { x: 28, y: 185, col: '#fce7b2' },
            { x: 140, y: 232, col: '#d9859b' },
            { x: 195, y: 178, col: '#fce7b2' },
            { x: 285, y: 238, col: '#b8a5d6' },
            { x: 325, y: 178, col: '#fce7b2' }
        ];
        flowers.forEach(b => {
            ctx.fillStyle = '#3a5948';
            ctx.fillRect(b.x, b.y, 1, 3);
            ctx.fillStyle = b.col;
            ctx.fillRect(b.x - 1, b.y - 1, 3, 2);
        });
    }

    // --- SCREENSHOT CABIN & BACKGROUND FOREST (FIRMLY ON DRY LAND) ---
    renderScreenshotCabin(lakeWidth) {
        const ctx = this.ctx;
        // Cabin is placed on the solid ground at top-right
        const houseX = 390;
        const houseY = 108;

        // 1. BACKGROUND FOREST TREES (All X >= 325, strictly on dry green ground at back!)
        this.renderForestTree(340, 52, 22);
        this.renderForestTree(395, 42, 25);
        this.renderForestTree(445, 48, 22);
        this.renderForestTree(468, 88, 20);

        // 2. Cast shadow under cabin (soft angled shadow)
        ctx.fillStyle = 'rgba(40, 68, 55, 0.45)';
        ctx.beginPath();
        ctx.ellipse(houseX + 16, houseY + 70, 45, 15, 0.12, 0, Math.PI * 2);
        ctx.fill();

        // 3. Lower Floor Walls (Warm Cedar Timbers)
        ctx.fillStyle = '#351f1c';
        ctx.fillRect(houseX - 25, houseY + 28, 56, 42);

        ctx.fillStyle = '#8c563e';
        ctx.fillRect(houseX - 23, houseY + 30, 52, 38);

        // Horizontal plank lines
        ctx.fillStyle = '#5a362a';
        for (let py = houseY + 35; py <= houseY + 65; py += 7) {
            ctx.fillRect(houseX - 23, py, 52, 1);
        }

        // Vertical corner timber pillars
        ctx.fillStyle = '#b67d58';
        ctx.fillRect(houseX - 23, houseY + 30, 6, 38);
        ctx.fillRect(houseX + 23, houseY + 30, 6, 38);
        ctx.fillStyle = '#5a362a';
        ctx.fillRect(houseX - 17, houseY + 30, 1, 38);
        ctx.fillRect(houseX + 23, houseY + 30, 1, 38);

        // Front Doorway (Planked door with handle)
        ctx.fillStyle = '#273243';
        ctx.fillRect(houseX - 7, houseY + 44, 16, 24);
        ctx.fillStyle = '#4f5d75';
        ctx.fillRect(houseX - 5, houseY + 46, 12, 22);
        ctx.fillStyle = '#39475c';
        ctx.fillRect(houseX - 1, houseY + 46, 1, 22);
        ctx.fillRect(houseX + 3, houseY + 46, 1, 22);
        ctx.fillStyle = '#fce7b2';
        ctx.fillRect(houseX + 4, houseY + 56, 2, 3);

        // Porch Eave Trim
        ctx.fillStyle = '#273243';
        ctx.fillRect(houseX - 28, houseY + 26, 62, 5);
        ctx.fillStyle = '#5b6e8a';
        ctx.fillRect(houseX - 27, houseY + 27, 60, 2);

        // 4. Upper Floor Timber Walls & Attic Window
        ctx.fillStyle = '#8c563e';
        ctx.fillRect(houseX - 19, houseY + 5, 44, 22);
        ctx.fillStyle = '#b67d58';
        ctx.fillRect(houseX - 17, houseY + 7, 40, 18);

        // Attic Window
        ctx.fillStyle = '#273243';
        ctx.fillRect(houseX - 6, houseY + 10, 14, 13);
        ctx.fillStyle = '#5b6e8a';
        ctx.fillRect(houseX - 4, houseY + 12, 10, 9);
        ctx.fillStyle = '#1e2634';
        ctx.fillRect(houseX - 2, houseY + 14, 6, 5);

        // 5. Stone Chimney on Roof Left Slope
        ctx.fillStyle = '#273243';
        ctx.fillRect(houseX - 24, houseY - 24, 12, 26);
        ctx.fillStyle = '#4f617a';
        ctx.fillRect(houseX - 22, houseY - 22, 8, 22);
        ctx.fillStyle = '#7b90b2';
        ctx.fillRect(houseX - 22, houseY - 22, 3, 4);
        ctx.fillRect(houseX - 18, houseY - 14, 4, 3);
        ctx.fillRect(houseX - 22, houseY - 6, 4, 3);
        ctx.fillStyle = '#273243';
        ctx.fillRect(houseX - 25, houseY - 25, 14, 3);
        ctx.fillStyle = '#1e2634';
        ctx.fillRect(houseX - 23, houseY - 25, 10, 1);

        // Smoke puff
        const puffY = houseY - 28 - ((this.time * 5) % 12);
        const puffAlpha = 1 - (((this.time * 5) % 12) / 12);
        ctx.fillStyle = `rgba(226, 232, 240, ${puffAlpha * 0.65})`;
        ctx.fillRect(houseX - 20 + Math.sin(this.time * 2) * 2, puffY, 3, 3);

        // 6. Gabled Roof in Slate Steel-Blue
        ctx.fillStyle = '#273243';
        ctx.beginPath();
        ctx.moveTo(houseX - 35, houseY + 22);
        ctx.lineTo(houseX + 3, houseY - 26);
        ctx.lineTo(houseX + 11, houseY - 26);
        ctx.lineTo(houseX - 27, houseY + 22);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#5b6e8a';
        ctx.beginPath();
        ctx.moveTo(houseX - 33, houseY + 20);
        ctx.lineTo(houseX + 4, houseY - 24);
        ctx.lineTo(houseX + 9, houseY - 24);
        ctx.lineTo(houseX - 28, houseY + 20);
        ctx.closePath();
        ctx.fill();

        // Right slope & main roof face
        ctx.fillStyle = '#39475c';
        ctx.beginPath();
        ctx.moveTo(houseX + 4, houseY - 26);
        ctx.lineTo(houseX + 42, houseY + 16);
        ctx.lineTo(houseX + 36, houseY + 22);
        ctx.lineTo(houseX - 2, houseY - 20);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#5b6e8a';
        ctx.beginPath();
        ctx.moveTo(houseX + 5, houseY - 24);
        ctx.lineTo(houseX + 40, houseY + 14);
        ctx.lineTo(houseX + 35, houseY + 19);
        ctx.lineTo(houseX, houseY - 19);
        ctx.closePath();
        ctx.fill();

        // Roof plank highlights
        ctx.strokeStyle = '#7b90b2';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(houseX + 10, houseY - 18);
        ctx.lineTo(houseX - 20, houseY + 12);
        ctx.moveTo(houseX + 18, houseY - 10);
        ctx.lineTo(houseX - 12, houseY + 20);
        ctx.moveTo(houseX + 26, houseY - 2);
        ctx.lineTo(houseX + 4, houseY + 22);
        ctx.stroke();

        // 7. YARD ACCENTS:
        // A. Stacked Firewood
        const pileX = houseX + 46;
        const pileY = houseY + 54;
        ctx.fillStyle = '#5c3726';
        ctx.fillRect(pileX, pileY, 13, 14);
        const logCoords = [
            { x: pileX + 1, y: pileY + 8 },
            { x: pileX + 5, y: pileY + 8 },
            { x: pileX + 9, y: pileY + 8 },
            { x: pileX + 3, y: pileY + 4 },
            { x: pileX + 7, y: pileY + 4 },
            { x: pileX + 5, y: pileY }
        ];
        logCoords.forEach(l => {
            ctx.fillStyle = '#b67d58';
            ctx.fillRect(l.x, l.y, 4, 4);
            ctx.fillStyle = '#5c3726';
            ctx.fillRect(l.x + 1, l.y + 1, 2, 2);
        });

        // B. Tree Stump with Axe
        const stumpX = houseX + 66;
        const stumpY = houseY + 57;
        ctx.fillStyle = '#5a362a';
        ctx.fillRect(stumpX, stumpY, 9, 10);
        ctx.fillStyle = '#b67d58';
        ctx.fillRect(stumpX + 1, stumpY, 7, 3);
        ctx.fillStyle = '#8c563e';
        ctx.fillRect(stumpX + 3, stumpY - 5, 8, 2);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(stumpX + 2, stumpY - 3, 3, 4);

        // C. Mini Shed / Outbuilding
        const shedX = houseX + 55;
        const shedY = houseY + 16;
        ctx.fillStyle = '#5a362a';
        ctx.fillRect(shedX, shedY + 7, 18, 14);
        ctx.fillStyle = '#b67d58';
        ctx.fillRect(shedX + 1, shedY + 8, 16, 12);
        ctx.fillStyle = '#273243';
        ctx.fillRect(shedX + 5, shedY + 11, 8, 9);
        ctx.fillStyle = '#273243';
        ctx.beginPath();
        ctx.moveTo(shedX - 2, shedY + 8);
        ctx.lineTo(shedX + 9, shedY - 2);
        ctx.lineTo(shedX + 20, shedY + 8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#5b6e8a';
        ctx.beginPath();
        ctx.moveTo(shedX - 1, shedY + 7);
        ctx.lineTo(shedX + 9, shedY - 1);
        ctx.lineTo(shedX + 19, shedY + 7);
        ctx.closePath();
        ctx.fill();

        // D. Wooden Bench
        const benchX = houseX - 44;
        const benchY = houseY + 68;
        ctx.fillStyle = '#5a362a';
        ctx.fillRect(benchX, benchY, 14, 10);
        ctx.fillStyle = '#b67d58';
        ctx.fillRect(benchX, benchY, 14, 3);
        ctx.fillRect(benchX + 2, benchY + 7, 10, 2);
    }

    renderForestTree(cx, cy, r) {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(35, 55, 45, 0.45)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + r - 2, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Trunk
        ctx.fillStyle = '#5a362a';
        ctx.fillRect(cx - 3, cy + r - 12, 6, 12);
        ctx.fillStyle = '#8c563e';
        ctx.fillRect(cx - 5, cy + r - 4, 3, 4);
        ctx.fillRect(cx + 2, cy + r - 4, 3, 4);

        // Canopy
        ctx.fillStyle = '#233227';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#384c3c';
        ctx.beginPath();
        ctx.arc(cx, cy - 2, r - 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#59775f';
        ctx.beginPath();
        ctx.arc(cx - 2, cy - 5, r - 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#8ba888';
        ctx.beginPath();
        ctx.arc(cx - 4, cy - 8, r - 7, 0, Math.PI * 2);
        ctx.fill();
    }

    // --- SHOP NPC: CAPTAIN BARNABY STANDING ON SOLID GROUND ---
    renderShopNPC() {
        const ctx = this.ctx;
        const npcX = this.camp.npcX; // ~388
        const npcY = this.camp.npcY; // ~195

        const idleBob = Math.sin(this.time * 2) > 0.5 ? 1 : 0;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(npcX, npcY + 3, 7, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1e2634';
        ctx.fillRect(npcX - 4, npcY - 4, 3, 6);
        ctx.fillRect(npcX + 1, npcY - 4, 3, 6);

        ctx.fillStyle = '#2b394b';
        ctx.fillRect(npcX - 5, npcY - 15 + idleBob, 10, 11);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(npcX - 2, npcY - 16 + idleBob, 4, 3);
        ctx.fillStyle = '#fce7b2';
        ctx.fillRect(npcX - 3, npcY - 12 + idleBob, 2, 2);
        ctx.fillRect(npcX + 1, npcY - 12 + idleBob, 2, 2);

        ctx.fillStyle = '#fed7aa';
        ctx.fillRect(npcX - 3, npcY - 21 + idleBob, 6, 6);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(npcX - 3, npcY - 17 + idleBob, 6, 4);
        ctx.fillStyle = '#1e2634';
        ctx.fillRect(npcX - 2, npcY - 19 + idleBob, 1, 2);
        ctx.fillRect(npcX + 1, npcY - 19 + idleBob, 1, 2);

        ctx.fillStyle = '#1e2634';
        ctx.fillRect(npcX - 4, npcY - 24 + idleBob, 8, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(npcX - 5, npcY - 22 + idleBob, 10, 2);
        ctx.fillStyle = '#fce7b2';
        ctx.fillRect(npcX - 1, npcY - 24 + idleBob, 2, 2);

        ctx.fillStyle = '#5a362a';
        ctx.fillRect(npcX + 3, npcY - 16 + idleBob, 4, 2);
        ctx.fillRect(npcX + 6, npcY - 18 + idleBob, 2, 3);
        const smokeY = npcY - 20 - ((this.time * 6) % 10);
        ctx.fillStyle = `rgba(241, 245, 249, 0.6)`;
        ctx.fillRect(npcX + 6, smokeY, 2, 2);

        const distToPlayer = Math.hypot(this.player.x - npcX, this.player.y - npcY);
        const isNearby = distToPlayer <= this.camp.interactRadius || this.camp.isHovered;

        const badgeY = npcY - 33 + Math.sin(this.time * 3) * 2;
        const badgeW = isNearby ? 68 : 42;
        const badgeH = 14;
        const badgeX = npcX - badgeW / 2;

        ctx.fillStyle = isNearby ? '#3b82f6' : 'rgba(27, 38, 54, 0.88)';
        ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
        ctx.strokeStyle = isNearby ? '#93c5fd' : '#fce7b2';
        ctx.lineWidth = 1;
        ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        if (isNearby) {
            ctx.fillText('💬 SHOP [E]', npcX, badgeY + 10);
        } else {
            ctx.fillText('💬 Shop', npcX, badgeY + 10);
        }
    }

    renderFishingPool() {
        const ctx = this.ctx;
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(0, 0, this.width, 160);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.lineWidth = 1;
        for (let y = 15; y < 155; y += 18) {
            const waveY = y + Math.sin(this.time * 1.5 + y * 0.1) * 2;
            ctx.beginPath();
            ctx.moveTo(0, waveY);
            ctx.lineTo(this.width, waveY);
            ctx.stroke();
        }

        ctx.fillStyle = '#b45309';
        ctx.fillRect(0, 166, this.width, this.height - 166);
    }

    // --- SHADOW FISH (Strictly inside water bounds) ---
    renderShadowFish() {
        const ctx = this.ctx;

        this.shadowFish.forEach(fish => {
            const bodyY = Math.round(fish.y + Math.sin(fish.wiggle) * 1.4);
            const bodyX = Math.round(fish.x);

            const alpha = fish.type === 'monster' ? 0.60 : 0.45;
            ctx.fillStyle = `rgba(18, 38, 48, ${alpha})`;

            ctx.beginPath();
            ctx.ellipse(bodyX, bodyY, fish.length, fish.height, 0, 0, Math.PI * 2);
            ctx.fill();

            if (fish.type === 'large' || fish.type === 'monster') {
                const finX = bodyX - (fish.length * 0.2 * fish.dir);
                ctx.beginPath();
                ctx.moveTo(finX, bodyY - fish.height * 0.8);
                ctx.lineTo(finX - (fish.length * 0.3 * fish.dir), bodyY - fish.height * 1.6);
                ctx.lineTo(finX - (fish.length * 0.6 * fish.dir), bodyY - fish.height * 0.8);
                ctx.closePath();
                ctx.fill();
            }

            const tailX = bodyX - (fish.length * 0.9 * fish.dir);
            const tailWaggle = Math.sin(fish.wiggle * 1.8) * (fish.tailSize * 0.35);

            ctx.beginPath();
            ctx.moveTo(tailX, bodyY);
            ctx.lineTo(tailX - (fish.tailSize * 0.9 * fish.dir), bodyY - fish.tailSize * 0.7 + tailWaggle);
            ctx.lineTo(tailX - (fish.tailSize * 0.5 * fish.dir), bodyY + tailWaggle);
            ctx.lineTo(tailX - (fish.tailSize * 0.9 * fish.dir), bodyY + fish.tailSize * 0.7 + tailWaggle);
            ctx.closePath();
            ctx.fill();
        });
    }

    renderRipples() {
        const ctx = this.ctx;
        this.ripples.forEach(r => {
            this.drawPixelRipple(ctx, Math.round(r.x), Math.round(r.y), Math.round(r.radius), r.alpha);
        });
    }

    drawPixelRipple(ctx, cx, cy, radius, alpha) {
        if (alpha <= 0 || radius < 1) return;
        ctx.fillStyle = `rgba(210, 236, 244, ${alpha * 0.9})`;

        const rx = Math.max(2, radius);
        const ry = Math.max(1, Math.round(radius * 0.45));

        const steps = Math.max(8, rx * 2);
        for (let i = 0; i < steps; i++) {
            const angle = (i / steps) * Math.PI * 2;
            const px = Math.round(cx + Math.cos(angle) * rx);
            const py = Math.round(cy + Math.sin(angle) * ry);
            ctx.fillRect(px, py, 2, 1);
        }

        if (radius < 7) {
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.fillRect(cx - 1, cy, 3, 1);
        }
    }

    renderFishingLineAndBobber() {
        const ctx = this.ctx;
        const b = this.bobber;

        const rodTip = this.getRodTipPosition();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rodTip.x, rodTip.y);

        const midX = (rodTip.x + b.x) / 2;
        const midY = (rodTip.y + b.y) / 2 + (b.isBiting ? 2 : (b.isFlying ? -14 : 10));
        ctx.quadraticCurveTo(midX, midY, b.x, b.y);
        ctx.stroke();

        if (!b.isFlying) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.beginPath();
            ctx.ellipse(b.x, b.y + 2, 4, 2, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(b.x - 3, b.y, 6, 3);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(b.x - 3, b.y - 3, 6, 3);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(b.x - 1, b.y - 6, 2, 3);
    }

    getRodTipPosition() {
        const p = this.player;
        switch (p.dir) {
            case 'N':
            case 'NE':
            case 'NW':
                return { x: p.x + 8, y: p.y - 24 };
            case 'E':
                return { x: p.x + 20, y: p.y - 12 };
            case 'W':
                return { x: p.x - 20, y: p.y - 12 };
            case 'S':
            case 'SE':
            case 'SW':
            default:
                return { x: p.x + 10, y: p.y - 4 };
        }
    }

    renderPlayer() {
        const ctx = this.ctx;
        const p = this.player;
        const x = Math.round(p.x);
        const y = Math.round(p.y);
        const isFishing = p.isFishing;
        const dir = p.dir;

        ctx.fillStyle = 'rgba(25, 45, 35, 0.38)';
        ctx.beginPath();
        ctx.ellipse(x, y + 2, 7, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();

        const legOffset = p.isMoving ? (p.walkFrame % 2 === 0 ? 1 : -1) : 0;

        ctx.fillStyle = '#1f2733';
        ctx.fillRect(x - 4, y - 3 + legOffset, 3, 4);
        ctx.fillRect(x + 2, y - 3 - legOffset, 3, 4);

        ctx.fillStyle = '#2c394b';
        ctx.fillRect(x - 4, y - 8, 9, 6);

        ctx.fillStyle = '#475e7a';
        ctx.fillRect(x - 5, y - 17, 11, 10);

        ctx.fillStyle = '#8c563e';
        ctx.fillRect(x - 5, y - 10, 11, 2);
        ctx.fillStyle = '#fce7b2';
        ctx.fillRect(x - 1, y - 10, 2, 2);

        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(x - 2, y - 17, 4, 2);

        ctx.fillStyle = '#fed7aa';
        ctx.fillRect(x - 4, y - 23, 8, 7);

        ctx.fillStyle = '#1e2634';
        if (dir === 'S' || dir === 'SE' || dir === 'SW') {
            ctx.fillRect(x - 3, y - 20, 2, 2);
            ctx.fillRect(x + 1, y - 20, 2, 2);
        } else if (dir === 'E' || dir === 'NE') {
            ctx.fillRect(x + 2, y - 20, 2, 2);
        } else if (dir === 'W' || dir === 'NW') {
            ctx.fillRect(x - 4, y - 20, 2, 2);
        }

        ctx.fillStyle = '#5a362a';
        ctx.fillRect(x - 5, y - 25, 10, 4);
        ctx.fillRect(x - 4, y - 27, 8, 3);

        this.renderPlayerHat(x, y);
        this.renderFishingRod(x, y, dir, isFishing);
    }

    renderPlayerHat(x, y) {
        const ctx = this.ctx;
        const hatId = this.player.equippedHat || 'hat_default';
        if (hatId === 'hat_default') return;

        if (hatId === 'hat_straw') {
            ctx.fillStyle = '#ca8a04';
            ctx.fillRect(x - 7, y - 26, 14, 3);
            ctx.fillStyle = '#eab308';
            ctx.fillRect(x - 4, y - 29, 8, 4);
            ctx.fillStyle = '#16a34a';
            ctx.fillRect(x - 4, y - 26, 8, 1);
        } else if (hatId === 'hat_captain') {
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(x - 6, y - 26, 12, 3);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x - 5, y - 30, 10, 5);
            ctx.fillStyle = '#facc15';
            ctx.fillRect(x - 1, y - 28, 2, 2);
        } else if (hatId === 'hat_crown') {
            ctx.fillStyle = '#facc15';
            ctx.fillRect(x - 6, y - 27, 12, 4);
            ctx.fillRect(x - 6, y - 31, 3, 4);
            ctx.fillRect(x - 1, y - 33, 2, 6);
            ctx.fillRect(x + 3, y - 31, 3, 4);
            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(x - 1, y - 26, 2, 2);
        }
    }

    renderFishingRod(x, y, dir, isFishing) {
        const ctx = this.ctx;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';

        const rodId = this.player.equippedRod || 'rod_bamboo';
        let rodColor = '#8c563e';
        let reelColor = '#fce7b2';

        if (rodId === 'rod_fiberglass') {
            rodColor = '#0284c7';
            reelColor = '#38bdf8';
        } else if (rodId === 'rod_carbon') {
            rodColor = '#10b981';
            reelColor = '#6ee7b7';
        } else if (rodId === 'rod_titanium') {
            rodColor = '#8b5cf6';
            reelColor = '#c084fc';
        } else if (rodId === 'rod_trident') {
            rodColor = '#f59e0b';
            reelColor = '#facc15';
        }

        ctx.strokeStyle = rodColor;

        ctx.beginPath();
        if (isFishing) {
            ctx.moveTo(x + 4, y - 12);
            ctx.lineTo(x + 8, y - 24);
        } else {
            switch (dir) {
                case 'E':
                case 'SE':
                    ctx.moveTo(x + 4, y - 10);
                    ctx.lineTo(x + 16, y - 22);
                    break;
                case 'W':
                case 'SW':
                    ctx.moveTo(x - 4, y - 10);
                    ctx.lineTo(x - 16, y - 22);
                    break;
                default:
                    ctx.moveTo(x + 4, y - 10);
                    ctx.lineTo(x + 12, y - 24);
                    break;
            }
        }
        ctx.stroke();

        ctx.fillStyle = reelColor;
        ctx.fillRect(x + 3, y - 12, 3, 3);
    }

    renderFloatingText() {
        const ctx = this.ctx;
        this.floatingTexts.forEach(ft => {
            ctx.save();
            ctx.globalAlpha = Math.max(0, ft.alpha);
            ctx.font = 'bold 12px "Outfit", monospace';
            ctx.fillStyle = ft.color;
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
            ctx.shadowBlur = 4;
            ctx.fillText(ft.text, ft.x, ft.y);
            ctx.restore();
        });
    }
}

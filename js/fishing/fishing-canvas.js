/**
 * Pixel Fishing Game - HTML5 Canvas Pixel-Art Renderer
 * Updated Architecture:
 * 1. Foot-Level Player Collision & Solid Water Colliders:
 *    - 12x8 foot-level bounding box centered at player feet.
 *    - Impassable deep water colliders: player CANNOT walk on water.
 *    - Wooden pier platform is walkable, but outer pier edges into water are blocked.
 *    - Smooth axis-aligned sliding against colliders.
 * 2. Clean House Sprite & Unblocked Rear Passage:
 *    - Clean, properly aligned gabled roof, stone chimney, timber siding, and attic window without glitchy lines.
 *    - Removed rear fence blockage so player can freely walk and explore behind the house.
 * 3. Dynamic Proximity-Only Shop Text:
 *    - Permanent floating "Shop" banner completely removed.
 *    - Subtle "[E] Talk" prompt only displays when player is within 32px of Captain Barnaby.
 * 4. Clean Shoreline Water Borders:
 *    - Removed unnatural dotted green/brown fringe lines.
 *    - Clean, natural shoreline edge where water seamlessly meets the grass.
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
            y: 130,
            npcX: 388,
            npcY: 185,
            interactRadius: 32, // Proximity trigger distance (within 32px)
            isHovered: false
        };

        this.onOpenShop = null;

        this.time = 0;
        this.ripples = [];
        this.floatingTexts = [];
        this.shadowFish = [];

        // Pre-generated static environmental features
        this.initEnvironment();
        this.initShadowFish();

        this.keys = {};
        this.setupInputListeners();

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.ctx.imageSmoothingEnabled = false;
    }

    // =========================================================================
    // ENVIRONMENTAL INITIALIZATION
    // =========================================================================
    initEnvironment() {
        // Natural Tree Clusters (placed so player can explore behind house)
        this.trees = [
            // Deep forest canopy behind cabin (top-right, tucked back)
            { x: 335, y: 36, r: 21, tint: '#385542', trunkH: 12 },
            { x: 380, y: 28, r: 24, tint: '#2f4b39', trunkH: 13 },
            { x: 425, y: 26, r: 23, tint: '#3c5d46', trunkH: 12 },
            { x: 462, y: 38, r: 20, tint: '#324f3c', trunkH: 11 },
            { x: 468, y: 88, r: 22, tint: '#3a5a44', trunkH: 12 },
            { x: 302, y: 34, r: 19, tint: '#42664d', trunkH: 10 },
            // Grove along far right side
            { x: 465, y: 155, r: 21, tint: '#35533f', trunkH: 12 },
            { x: 462, y: 225, r: 24, tint: '#2d4836', trunkH: 14 }
        ];

        // NO rear fence blockage - rear passage is completely unblocked!
        this.fences = [];

        // Scattered Lily Pads in natural clusters
        this.lilyPads = [
            { x: 75, y: 65, r: 10, flower: false, rot: 0.8 },
            { x: 92, y: 72, r: 8, flower: true, rot: 2.1 },
            { x: 148, y: 52, r: 12, flower: true, rot: 1.4 },
            { x: 172, y: 45, r: 9, flower: false, rot: 3.8 },
            { x: 225, y: 92, r: 13, flower: false, rot: 0.3 },
            { x: 248, y: 102, r: 10, flower: true, rot: 4.2 },
            { x: 265, y: 48, r: 12, flower: true, rot: 2.7 }
        ];

        // Submerged river stones in the pond
        this.waterRocks = [
            { x: 42, y: 48, w: 9, h: 6 },
            { x: 125, y: 118, w: 12, h: 7 },
            { x: 195, y: 38, w: 8, h: 5 },
            { x: 278, y: 128, w: 11, h: 7 }
        ];

        // Environmental meadow decor: grass clumps, wildflowers, and pebbles
        this.meadowDecor = [];
        let seed = 77;
        const pseudoRand = () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };

        const flowerColors = ['#fce7b2', '#f472b6', '#c084fc', '#93c5fd', '#fef08a'];

        for (let i = 0; i < 46; i++) {
            const gx = 15 + Math.round(pseudoRand() * 450);
            const gy = 35 + Math.round(pseudoRand() * 220);

            // Avoid placing decor right on top of house footprint or lake
            if (gx >= 360 && gx <= 425 && gy >= 120 && gy <= 175) continue;
            if (this.isPointInWater(gx, gy)) continue;

            const typeRoll = pseudoRand();
            if (typeRoll < 0.45) {
                this.meadowDecor.push({
                    type: 'grass',
                    x: gx,
                    y: gy,
                    color: pseudoRand() > 0.5 ? '#88b594' : '#5f8a6c',
                    blades: 2 + Math.floor(pseudoRand() * 2)
                });
            } else if (typeRoll < 0.75) {
                this.meadowDecor.push({
                    type: 'flower',
                    x: gx,
                    y: gy,
                    stemColor: '#3c6448',
                    petalColor: flowerColors[Math.floor(pseudoRand() * flowerColors.length)]
                });
            } else {
                this.meadowDecor.push({
                    type: 'pebble',
                    x: gx,
                    y: gy,
                    w: 3 + Math.floor(pseudoRand() * 3),
                    h: 2 + Math.floor(pseudoRand() * 2),
                    color: pseudoRand() > 0.5 ? '#94a3b8' : '#788896'
                });
            }
        }
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

    // =========================================================================
    // 1. FOOT-LEVEL COLLISION & WATER BOUNDING BOX SYSTEM
    // =========================================================================

    /**
     * Mathematical shoreline boundary calculation:
     * Lake is on the top-left portion of the map.
     */
    getLakeShoreY(x) {
        if (x > 306) return -1; // east of the lake
        if (x >= 285) {
            // Curves smoothly around the south-east bank of the lake
            const t = (x - 285) / 21;
            return 152 - t * 40;
        }
        // Smooth undulating southern shoreline
        return 154 + Math.sin(x * 0.025) * 3 + Math.cos(x * 0.05) * 2;
    }

    getLakeShoreX(y) {
        if (y > 156) return -1; // south of the lake
        if (y >= 135) {
            const t = (y - 135) / 21;
            return 304 - t * 12;
        }
        // Eastern bank of the lake curving up to y=0
        return 294 + Math.sin(y * 0.035) * 8;
    }

    /**
     * Checks if a point is within the deep water body
     */
    isPointInWater(px, py) {
        if (px < 0 || py < 0) return true;
        const shoreY = this.getLakeShoreY(px);
        const shoreX = this.getLakeShoreX(py);
        return py <= shoreY && px <= shoreX;
    }

    /**
     * Checks if a point is on the walkable wooden pier deck
     * Deck surface: X: 54 to 114, Y: 132 to 172
     */
    isPointOnPier(px, py) {
        return px >= 54 && px <= 114 && py >= 132 && py <= 172;
    }

    /**
     * Point-level walkability test:
     * - Deep water: impassable (cannot walk on water)
     * - Pier platform: walkable
     * - Outer pier edges: solid colliders (cannot fall into water)
     * - House walls/foundation: solid obstacle
     * - Rear of house: OPEN & WALKABLE
     */
    isPointWalkable(px, py) {
        // Map edge boundaries
        if (px < 14 || px > this.width - 14 || py < 25 || py > this.height - 12) {
            return false;
        }

        const onPier = this.isPointOnPier(px, py);
        const inWater = this.isPointInWater(px, py);

        // Solid impassable water collider
        if (inWater && !onPier) {
            return false;
        }

        // Outer pier edges over water
        if (py < 132 && px >= 50 && px <= 118) {
            return false; // North end of pier drops into water
        }

        // Shop House walls & foundation obstacle
        // House is located at (390, 108). Walls occupy X: 365 to 415, Y: 136 to 172.
        // Behind house (Y < 136) and sides (X < 365, X > 415) are completely open!
        if (px >= 365 && px <= 415 && py >= 136 && py <= 172) {
            return false;
        }

        // Outbuilding shed obstacle
        if (px >= 444 && px <= 468 && py >= 126 && py <= 140) {
            return false;
        }

        // Stacked firewood obstacle
        if (px >= 435 && px <= 450 && py >= 158 && py <= 170) {
            return false;
        }

        // Shopkeeper NPC feet collision
        if (px >= 383 && px <= 393 && py >= 180 && py <= 188) {
            return false;
        }

        return true;
    }

    /**
     * Foot-Level Bounding Box Check:
     * Positioned at the character's feet:
     * Width = 12, Height = 8, centered at (x, y) where y is ground contact.
     */
    canPlayerOccupy(x, y) {
        const halfW = 6;  // width = 12
        const topH = 6;   // height = 8 (y - 6 to y + 2)
        const botH = 2;

        const testPoints = [
            { px: x - halfW, py: y - topH },
            { px: x + halfW, py: y - topH },
            { px: x - halfW, py: y + botH },
            { px: x + halfW, py: y + botH },
            { px: x, py: y - 2 }
        ];

        for (let i = 0; i < testPoints.length; i++) {
            if (!this.isPointWalkable(testPoints[i].px, testPoints[i].py)) {
                return false;
            }
        }
        return true;
    }

    // =========================================================================
    // FISH SILHOUETTES BASED ON AREA RARITY
    // =========================================================================
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
        const x = initialX !== null ? initialX : Math.random() * 250 + 25;
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

    // =========================================================================
    // INPUT LISTENERS & INTERACTION
    // =========================================================================
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
                // Proximity trigger within 32px
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

            // Hover over NPC within 32px
            const distToNpc = Math.hypot(mouseX - this.camp.npcX, mouseY - this.camp.npcY);
            const isHovered = distToNpc <= this.camp.interactRadius;
            this.camp.isHovered = isHovered;
            this.canvas.style.cursor = isHovered ? 'pointer' : 'default';
        });

        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.width / rect.width;
            const scaleY = this.height / rect.height;
            const clickX = (e.clientX - rect.left) * scaleX;
            const clickY = (e.clientY - rect.top) * scaleY;

            // Click on NPC opens Shop
            const distToNpc = Math.hypot(clickX - this.camp.npcX, clickY - this.camp.npcY);
            if (distToNpc <= this.camp.interactRadius) {
                if (this.onOpenShop) {
                    this.onOpenShop();
                    return;
                }
            }

            if (this.player.isFishing) return;

            // Set target only if clicked location is walkable
            if (this.canPlayerOccupy(clickX, clickY)) {
                this.targetPos = { x: clickX, y: clickY };
            }
        });
    }

    // =========================================================================
    // FISHING LINE & BOBBER FLIGHT
    // =========================================================================
    castLine() {
        this.player.isFishing = true;
        this.player.dir = 'N';

        // Organic spread across the water body (X: 45 to 280, Y: 40 to 130)
        const spreadX = (Math.random() - 0.5) * 150;
        const targetX = Math.max(45, Math.min(280, this.player.x + spreadX));
        const targetY = 40 + Math.random() * 85;

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

    // =========================================================================
    // GAME LOOP UPDATE WITH FOOT-LEVEL COLLISION & AXIS SLIDING
    // =========================================================================
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

                // Move with smooth axis-aligned sliding against colliders
                let moved = false;
                if (this.canPlayerOccupy(this.player.x + normX, this.player.y + normY)) {
                    this.player.x += normX;
                    this.player.y += normY;
                    moved = true;
                } else if (this.canPlayerOccupy(this.player.x + normX, this.player.y)) {
                    this.player.x += normX;
                    moved = true;
                } else if (this.canPlayerOccupy(this.player.x, this.player.y + normY)) {
                    this.player.y += normY;
                    moved = true;
                }

                if (!moved && this.targetPos) {
                    this.targetPos = null;
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

        // Shadow fish update (contained in organic lake bounds)
        this.shadowFish.forEach(fish => {
            fish.x += fish.speed * fish.dir;
            fish.wiggle += 0.14;
            if (fish.x > 285) {
                Object.assign(fish, this.createShadowFish(-25));
                fish.dir = 1;
            } else if (fish.x < -25) {
                Object.assign(fish, this.createShadowFish(280));
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

    // =========================================================================
    // MAIN RENDER WITH DYNAMIC Y-SORTING
    // =========================================================================
    render() {
        this.update();
        this.ctx.clearRect(0, 0, this.width, this.height);

        if (this.currentArea === 'fishing_pool') {
            this.renderFishingPool();
            this.renderShadowFish();
            this.renderRipples();
            if (this.bobber.active) this.renderFishingLineAndBobber();
            this.renderPlayer();
            this.renderShopNPC();
            this.renderFloatingText();
            return;
        }

        // 1. TERRAIN BASE LAYER (Meadow grass, organic lake water, clean shorelines, path)
        this.renderOrganicTerrain();

        // 2. SUBMERGED WATER ELEMENTS (Rocks, shadow fish, ripples, lily pads)
        this.renderSubmergedLakeElements();

        // 3. PIER BASE & TIMBERS (Anchored in water & ground)
        this.renderWoodenPierBase();

        // 4. DYNAMIC Y-SORTED ENTITY LAYER (Trees, Cabin, Yard props, NPC, Player)
        this.renderDynamicYSortedEntities();

        // 5. PIER FOREGROUND ACCENTS & MOORINGS
        this.renderWoodenPierAccents();

        // 6. FOREGROUND OVERLAYS (Fishing line/bobber, proximity prompt, Floating texts)
        if (this.bobber.active) {
            this.renderFishingLineAndBobber();
        }

        // Proximity-only prompt (within 32px)
        this.renderShopNPCBadge();
        this.renderFloatingText();
    }

    // =========================================================================
    // 1. ORGANIC TERRAIN BASE (CLEAN SHORELINE, NO UNNATURAL DOTTED FRINGES)
    // =========================================================================
    renderOrganicTerrain() {
        const ctx = this.ctx;

        // Base meadow soil (#6e917b warm sage grass)
        ctx.fillStyle = '#6e917b';
        ctx.fillRect(0, 0, this.width, this.height);

        // Gradient under forest grove in background
        const forestGrad = ctx.createLinearGradient(310, 0, this.width, 90);
        forestGrad.addColorStop(0, '#537661');
        forestGrad.addColorStop(1, '#486854');
        ctx.fillStyle = forestGrad;
        ctx.fillRect(305, 0, this.width - 305, 85);

        // Trace the Organic Lake Path
        ctx.save();
        this.traceOrganicPondPath(ctx);

        // Deep water base
        const waterGrad = ctx.createLinearGradient(0, 0, 0, 160);
        waterGrad.addColorStop(0, '#1c3d4e');
        waterGrad.addColorStop(0.5, '#244d62');
        waterGrad.addColorStop(1, '#2d5e75');
        ctx.fillStyle = waterGrad;
        ctx.fill();

        // Smooth wave caustics
        this.renderFluidWaterCaustics(ctx);
        ctx.restore();

        // 4. CLEAN SHORELINE WATER BORDERS (No unnatural dotted fringe lines!)
        this.renderCleanShorelines(ctx);

        // Natural Winding Dirt Path connecting pier to cabin door
        this.renderOrganicWindingPath(ctx);

        // Open meadow decor (grass clumps, wildflowers, pebbles)
        this.renderMeadowDecor(ctx);
    }

    traceOrganicPondPath(ctx) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(292, 0);
        // Clean curving right bank
        ctx.bezierCurveTo(294, 25, 308, 55, 304, 88);
        ctx.bezierCurveTo(300, 115, 312, 136, 296, 150);
        // Clean undulating bottom shoreline
        ctx.bezierCurveTo(260, 162, 218, 150, 180, 158);
        ctx.bezierCurveTo(145, 164, 115, 152, 75, 156);
        ctx.bezierCurveTo(40, 159, 15, 152, 0, 155);
        ctx.closePath();
    }

    renderFluidWaterCaustics(ctx) {
        // Specular water sparkles
        ctx.fillStyle = '#bce6f2';
        for (let i = 0; i < 9; i++) {
            const sx = Math.round(((i * 37 + this.time * 11) % 270) + 12);
            const sy = Math.round(18 + (i * 15) % 115);
            const alpha = (Math.sin(this.time * 2.2 + i * 1.5) + 1) * 0.35;
            if (alpha > 0.15) {
                ctx.globalAlpha = alpha;
                ctx.fillRect(sx, sy, 2, 1);
                ctx.fillRect(sx + 1, sy - 1, 1, 3);
            }
        }
        ctx.globalAlpha = 1.0;

        // Smooth flowing sine-wave caustics
        const waveRows = [
            { y: 22, h: 2, col: '#335c70', speed: 0.8 },
            { y: 44, h: 3, col: '#3b6a80', speed: -0.6 },
            { y: 68, h: 2, col: '#467b93', speed: 0.9 },
            { y: 94, h: 3, col: '#3b6a80', speed: -0.7 },
            { y: 120, h: 2, col: '#335c70', speed: 0.8 },
            { y: 140, h: 2, col: '#284b5c', speed: -0.5 }
        ];

        waveRows.forEach((row, idx) => {
            ctx.fillStyle = row.col;
            const shift = (this.time * 8 * row.speed) % 24;
            for (let x = 6; x < 285; x += 24) {
                const px = x + shift;
                if (px < 4 || px > 288) continue;
                const py = Math.round(row.y + Math.sin(this.time * 1.2 + x * 0.05 + idx) * 1.5);
                ctx.fillRect(px, py, 11, row.h);
            }
        });
    }

    /**
     * CLEAN SHORELINE BORDER:
     * Removes the unnatural dotted green/brown pixel fringes.
     * Replaced with a clean, seamless shoreline where water meets the grass naturally.
     */
    renderCleanShorelines(ctx) {
        ctx.save();

        // 1. Shallow water inner turquoise border
        this.traceOrganicPondPath(ctx);
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#397891';
        ctx.stroke();

        ctx.lineWidth = 2;
        ctx.strokeStyle = '#529ab3';
        ctx.stroke();

        // 2. Clean, solid warm sand/soil bank line (continuous, NO dots or dashes)
        ctx.beginPath();
        ctx.moveTo(293, 0);
        ctx.bezierCurveTo(295, 25, 309, 55, 305, 88);
        ctx.bezierCurveTo(301, 115, 313, 136, 297, 151);
        ctx.bezierCurveTo(261, 163, 219, 151, 181, 159);
        ctx.bezierCurveTo(146, 165, 116, 153, 76, 157);
        ctx.bezierCurveTo(41, 160, 15, 153, 0, 156);

        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#5a3d2b'; // Rich natural earth border
        ctx.stroke();

        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#7c543c'; // Warm soil highlight
        ctx.stroke();

        // 3. Gentle smooth water foam lapping at the shore
        const waveLap = Math.sin(this.time * 2.2) * 1.0;
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = `rgba(225, 245, 255, ${0.4 + waveLap * 0.15})`;
        ctx.beginPath();
        ctx.moveTo(291, 0);
        ctx.bezierCurveTo(293, 25, 307 + waveLap, 55, 303, 88);
        ctx.bezierCurveTo(299, 115, 311 + waveLap, 136, 295, 149);
        ctx.bezierCurveTo(259, 161 + waveLap, 217, 149, 179, 157);
        ctx.bezierCurveTo(144, 163 + waveLap, 114, 151, 74, 155);
        ctx.bezierCurveTo(39, 158 + waveLap, 14, 151, 0, 154);
        ctx.stroke();

        ctx.restore();
    }

    renderOrganicWindingPath(ctx) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const traceWindingPath = () => {
            ctx.beginPath();
            ctx.moveTo(95, 168);
            ctx.bezierCurveTo(125, 178, 155, 206, 205, 212);
            ctx.bezierCurveTo(255, 218, 305, 214, 345, 200);
            ctx.bezierCurveTo(365, 192, 380, 186, 388, 180);
        };

        // Dark rich soil base
        ctx.lineWidth = 18;
        ctx.strokeStyle = '#4e3322';
        traceWindingPath();
        ctx.stroke();

        // Warm clay dirt midtone
        ctx.lineWidth = 13;
        ctx.strokeStyle = '#805436';
        traceWindingPath();
        ctx.stroke();

        // Packed trail highlight
        ctx.lineWidth = 7;
        ctx.strokeStyle = '#ab7e57';
        traceWindingPath();
        ctx.stroke();

        // Fan-out dirt area in front of Shop doorstep
        ctx.fillStyle = '#805436';
        ctx.beginPath();
        ctx.ellipse(388, 182, 17, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ab7e57';
        ctx.beginPath();
        ctx.ellipse(388, 182, 12, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Stepping stones
        const pathStones = [
            { x: 108, y: 174, w: 4, h: 3 },
            { x: 142, y: 194, w: 5, h: 3 },
            { x: 182, y: 210, w: 4, h: 3 },
            { x: 228, y: 214, w: 5, h: 3 },
            { x: 278, y: 215, w: 4, h: 3 },
            { x: 324, y: 206, w: 5, h: 3 },
            { x: 362, y: 192, w: 4, h: 3 }
        ];

        pathStones.forEach(st => {
            ctx.fillStyle = '#4a3325';
            ctx.fillRect(st.x, st.y + 1, st.w, st.h);
            ctx.fillStyle = '#c7b39b';
            ctx.fillRect(st.x, st.y, st.w, st.h);
            ctx.fillStyle = '#dfd2bf';
            ctx.fillRect(st.x + 1, st.y, st.w - 2, 1);
        });

        ctx.restore();
    }

    renderMeadowDecor(ctx) {
        this.meadowDecor.forEach(d => {
            if (d.type === 'grass') {
                ctx.fillStyle = d.color;
                ctx.fillRect(d.x, d.y, 1, 3);
                ctx.fillRect(d.x + 1, d.y - 1, 1, 4);
                if (d.blades > 2) ctx.fillRect(d.x + 2, d.y + 1, 1, 2);
            } else if (d.type === 'flower') {
                ctx.fillStyle = d.stemColor;
                ctx.fillRect(d.x, d.y, 1, 3);
                ctx.fillStyle = d.petalColor;
                ctx.fillRect(d.x - 1, d.y - 1, 3, 2);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(d.x, d.y - 1, 1, 1);
            } else if (d.type === 'pebble') {
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                ctx.fillRect(d.x, d.y + 1, d.w, d.h);
                ctx.fillStyle = d.color;
                ctx.fillRect(d.x, d.y, d.w, d.h);
                ctx.fillStyle = '#cbd5e1';
                ctx.fillRect(d.x, d.y, Math.max(1, d.w - 1), 1);
            }
        });
    }

    // =========================================================================
    // 2. SUBMERGED LAKE ELEMENTS
    // =========================================================================
    renderSubmergedLakeElements() {
        const ctx = this.ctx;

        // Submerged River Rocks
        this.waterRocks.forEach(rk => {
            ctx.fillStyle = 'rgba(15, 30, 40, 0.55)';
            ctx.fillRect(rk.x - 1, rk.y, rk.w + 2, rk.h + 2);
            ctx.fillStyle = '#425866';
            ctx.fillRect(rk.x, rk.y, rk.w, rk.h);
            ctx.fillStyle = '#617d91';
            ctx.fillRect(rk.x + 1, rk.y + 1, rk.w - 2, 2);
        });

        this.renderShadowFish();
        this.renderRipples();

        // Clustered Lily Pads with blooming flowers
        this.lilyPads.forEach((pad, idx) => {
            const bobY = Math.round(pad.y + Math.sin(this.time + idx * 1.3) * 1.1);

            ctx.fillStyle = 'rgba(15, 35, 45, 0.45)';
            ctx.beginPath();
            ctx.ellipse(pad.x, bobY + 2, pad.r, pad.r * 0.65, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#2d4233';
            ctx.beginPath();
            ctx.arc(pad.x, bobY, pad.r, pad.rot, pad.rot + Math.PI * 1.8);
            ctx.lineTo(pad.x, bobY);
            ctx.fill();

            ctx.fillStyle = '#4a6b52';
            ctx.beginPath();
            ctx.arc(pad.x, bobY, pad.r * 0.78, pad.rot + 0.1, pad.rot + Math.PI * 1.75);
            ctx.lineTo(pad.x, bobY);
            ctx.fill();

            if (pad.flower) {
                ctx.fillStyle = '#f472b6';
                ctx.fillRect(pad.x - 2, bobY - 3, 5, 4);
                ctx.fillStyle = '#fdf2f8';
                ctx.fillRect(pad.x - 1, bobY - 2, 3, 2);
                ctx.fillStyle = '#facc15';
                ctx.fillRect(pad.x, bobY - 1, 1, 1);
            }
        });
    }

    // =========================================================================
    // 3. WOODEN PIER BASE
    // =========================================================================
    renderWoodenPierBase() {
        const ctx = this.ctx;
        const x1 = 52;
        const x2 = 116;
        const yTop = 132;
        const yBottom = 168;

        // Pier drop shadow
        ctx.fillStyle = 'rgba(15, 30, 40, 0.45)';
        ctx.fillRect(x1 + 4, yTop + 6, x2 - x1, yBottom - yTop + 4);

        // Submerged Wood Pilings
        [56, 84, 110].forEach(px => {
            ctx.fillStyle = '#1c2d28';
            ctx.fillRect(px, yTop + 8, 7, 26);
            ctx.fillStyle = '#4a2f20';
            ctx.fillRect(px + 1, yTop + 2, 5, 26);
            ctx.fillStyle = '#2f4b39';
            ctx.fillRect(px, yTop + 18, 7, 4); // Algae line
        });

        // Cedar Decking Planks
        for (let py = yTop; py < yBottom; py += 7) {
            const isAlt = (py % 14) === 0;
            ctx.fillStyle = isAlt ? '#9d6848' : '#825338';
            ctx.fillRect(x1, py, x2 - x1, 6);

            ctx.fillStyle = '#b8815d';
            ctx.fillRect(x1, py, x2 - x1, 1);

            ctx.fillStyle = '#422515';
            ctx.fillRect(x1, py + 5, x2 - x1, 1);

            ctx.fillStyle = '#222b38';
            ctx.fillRect(x1 + 3, py + 2, 2, 2);
            ctx.fillRect(x2 - 5, py + 2, 2, 2);
        }

        // Shore ramp apron
        ctx.fillStyle = '#6b432a';
        ctx.fillRect(x1 + 10, yBottom, (x2 - x1) - 20, 6);
        ctx.fillStyle = '#9d6848';
        ctx.fillRect(x1 + 12, yBottom + 1, (x2 - x1) - 24, 4);
    }

    renderWoodenPierAccents() {
        const ctx = this.ctx;
        const x1 = 52;
        const x2 = 116;
        const yTop = 132;

        [x1 + 2, x2 - 7].forEach(bx => {
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(bx - 1, yTop - 1, 7, 4);

            ctx.fillStyle = '#4a2f20';
            ctx.fillRect(bx, yTop - 6, 5, 8);
            ctx.fillStyle = '#825338';
            ctx.fillRect(bx + 1, yTop - 7, 3, 2);
            ctx.fillStyle = '#e2d9c8';
            ctx.fillRect(bx - 1, yTop - 2, 7, 2);
        });
    }

    // =========================================================================
    // 4. DYNAMIC Y-SORTED ENTITY SYSTEM
    // =========================================================================
    renderDynamicYSortedEntities() {
        const entities = [];

        // 1. Natural Trees
        this.trees.forEach(t => {
            entities.push({
                y: t.y + t.r,
                type: 'tree',
                data: t
            });
        });

        // 2. Cabin & Outbuilding Props
        const houseX = 390;
        const houseY = 108;

        entities.push({
            y: houseY + 36,
            type: 'shed',
            data: { x: houseX + 55, y: houseY + 16 }
        });

        entities.push({
            y: houseY + 70,
            type: 'cabin',
            data: { x: houseX, y: houseY }
        });

        entities.push({
            y: houseY + 68,
            type: 'firewood',
            data: { x: houseX + 46, y: houseY + 54 }
        });

        entities.push({
            y: houseY + 67,
            type: 'stump',
            data: { x: houseX + 66, y: houseY + 57 }
        });

        entities.push({
            y: houseY + 76,
            type: 'bench',
            data: { x: houseX - 44, y: houseY + 66 }
        });

        // 3. Shop NPC Captain Barnaby
        entities.push({
            y: this.camp.npcY,
            type: 'npc',
            data: { x: this.camp.npcX, y: this.camp.npcY }
        });

        // 4. Player Character
        entities.push({
            y: this.player.y,
            type: 'player',
            data: { x: this.player.x, y: this.player.y }
        });

        // Dynamic Y-Sorting
        entities.sort((a, b) => a.y - b.y);

        entities.forEach(ent => {
            switch (ent.type) {
                case 'tree':
                    this.drawOrganicTree(ent.data);
                    break;
                case 'shed':
                    this.drawMiniShed(ent.data.x, ent.data.y);
                    break;
                case 'cabin':
                    this.drawCozyCabin(ent.data.x, ent.data.y);
                    break;
                case 'firewood':
                    this.drawStackedFirewood(ent.data.x, ent.data.y);
                    break;
                case 'stump':
                    this.drawChoppingStump(ent.data.x, ent.data.y);
                    break;
                case 'bench':
                    this.drawTimberBench(ent.data.x, ent.data.y);
                    break;
                case 'npc':
                    this.drawShopNPCCharacter(ent.data.x, ent.data.y);
                    break;
                case 'player':
                    this.drawPlayerCharacter();
                    break;
            }
        });
    }

    // =========================================================================
    // ENTITY DRAWING METHODS
    // =========================================================================
    drawOrganicTree(tree) {
        const ctx = this.ctx;
        const { x, y, r, tint, trunkH } = tree;
        const groundY = y + r;

        // Ground shadow
        ctx.fillStyle = 'rgba(30, 48, 38, 0.42)';
        ctx.beginPath();
        ctx.ellipse(x + 2, groundY, r * 0.95, r * 0.4, 0.1, 0, Math.PI * 2);
        ctx.fill();

        // Trunk
        ctx.fillStyle = '#42281b';
        ctx.fillRect(x - 4, groundY - trunkH, 8, trunkH);
        ctx.fillStyle = '#6e442d';
        ctx.fillRect(x - 2, groundY - trunkH, 4, trunkH);
        ctx.fillStyle = '#42281b';
        ctx.fillRect(x - 6, groundY - 3, 3, 3);
        ctx.fillRect(x + 3, groundY - 3, 3, 3);

        // Canopy tiers
        ctx.fillStyle = '#1c2e22';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = tint || '#2f4b39';
        ctx.beginPath();
        ctx.arc(x - 1, y - 2, r - 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#4a7256';
        ctx.beginPath();
        ctx.arc(x - (r * 0.25), y - (r * 0.25), r * 0.55, 0, Math.PI * 2);
        ctx.arc(x + (r * 0.2), y - (r * 0.2), r * 0.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#739e7c';
        ctx.beginPath();
        ctx.arc(x - (r * 0.3), y - (r * 0.35), r * 0.35, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * SIMPLE, MINIMALISTIC, COMPLETE SHOP CABIN:
     * - Solid, complete gabled roof with slate shingles (NO hollow spaces or grass showing through!).
     * - Stone chimney solidly embedded into the left roof slope with gentle animated smoke.
     * - Cozy attic window centered on the roof.
     * - Warm horizontal cedar walls, corner timber posts, framed door with brass knob, doorstep,
     *   and warm golden-lit front window with flower box.
     */
    drawCozyCabin(houseX, houseY) {
        const ctx = this.ctx;

        // 1. Soft ground drop shadow beneath entire building
        ctx.fillStyle = 'rgba(25, 40, 30, 0.45)';
        ctx.beginPath();
        ctx.ellipse(houseX, houseY + 68, 42, 14, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Chimney (Built solidly into the left roof slope)
        const chimX = houseX - 22;
        const chimY = houseY - 22;
        const chimW = 10;
        const chimH = 22;

        ctx.fillStyle = '#232f3e';
        ctx.fillRect(chimX - 1, chimY - 1, chimW + 2, chimH + 1);
        ctx.fillStyle = '#475a6e';
        ctx.fillRect(chimX, chimY, chimW, chimH);

        // Stone brick courses
        ctx.fillStyle = '#627991';
        ctx.fillRect(chimX + 1, chimY + 2, 4, 3);
        ctx.fillRect(chimX + 5, chimY + 6, 4, 3);
        ctx.fillRect(chimX + 1, chimY + 10, 3, 3);
        ctx.fillRect(chimX + 6, chimY + 14, 3, 3);

        // Chimney Cap
        ctx.fillStyle = '#1c2532';
        ctx.fillRect(chimX - 2, chimY - 3, chimW + 4, 3);
        ctx.fillStyle = '#627991';
        ctx.fillRect(chimX - 1, chimY - 3, chimW + 2, 1);

        // Chimney Smoke puff
        const puffY = chimY - 6 - ((this.time * 5) % 12);
        const puffAlpha = 1 - (((this.time * 5) % 12) / 12);
        ctx.fillStyle = `rgba(240, 245, 250, ${puffAlpha * 0.65})`;
        ctx.fillRect(chimX + 3 + Math.sin(this.time * 2) * 2, puffY, 3, 3);

        // 3. Lower Main Building Walls (Warm Cedar Timber Planks)
        const wallW = 56;
        const wallH = 46;
        const wallX = houseX - wallW / 2; // houseX - 28
        const wallY = houseY + 22;

        // Dark foundation border
        ctx.fillStyle = '#2a1a12';
        ctx.fillRect(wallX - 1, wallY, wallW + 2, wallH + 1);

        // Cedar plank body
        ctx.fillStyle = '#8c563e';
        ctx.fillRect(wallX, wallY, wallW, wallH);

        // Horizontal shiplap plank grooves
        ctx.fillStyle = '#5c3726';
        for (let py = wallY + 7; py < wallY + wallH; py += 7) {
            ctx.fillRect(wallX + 1, py, wallW - 2, 1);
            // Subtle plank highlight
            ctx.fillStyle = '#9e674b';
            ctx.fillRect(wallX + 1, py + 1, wallW - 2, 1);
            ctx.fillStyle = '#5c3726';
        }

        // Vertical corner timber pillars
        ctx.fillStyle = '#b67d58';
        ctx.fillRect(wallX, wallY, 5, wallH);
        ctx.fillRect(wallX + wallW - 5, wallY, 5, wallH);
        ctx.fillStyle = '#5c3726';
        ctx.fillRect(wallX + 4, wallY, 1, wallH);
        ctx.fillRect(wallX + wallW - 5, wallY, 1, wallH);

        // 4. Front Doorway (Centered)
        const doorW = 16;
        const doorH = 25;
        const doorX = houseX - doorW / 2;
        const doorY = wallY + wallH - doorH;

        // Dark outer door frame
        ctx.fillStyle = '#1e2836';
        ctx.fillRect(doorX - 1, doorY - 1, doorW + 2, doorH + 1);

        // Navy/charcoal wood door
        ctx.fillStyle = '#37485c';
        ctx.fillRect(doorX, doorY, doorW, doorH);

        // Inset door panels
        ctx.fillStyle = '#263445';
        ctx.fillRect(doorX + 2, doorY + 3, 5, 8);
        ctx.fillRect(doorX + 9, doorY + 3, 5, 8);
        ctx.fillRect(doorX + 2, doorY + 13, 5, 9);
        ctx.fillRect(doorX + 9, doorY + 13, 5, 9);

        // Polished brass handle
        ctx.fillStyle = '#fce7b2';
        ctx.fillRect(doorX + 12, doorY + 13, 2, 2);

        // Stone / Timber Doorstep
        ctx.fillStyle = '#65432d';
        ctx.fillRect(doorX - 2, doorY + doorH, doorW + 4, 3);
        ctx.fillStyle = '#8f6143';
        ctx.fillRect(doorX - 1, doorY + doorH, doorW + 2, 1);

        // 5. Cozy Lower Front Window (Left of door)
        const winX = houseX - 21;
        const winY = wallY + 12;
        const winW = 11;
        const winH = 13;

        ctx.fillStyle = '#1e2836';
        ctx.fillRect(winX - 1, winY - 1, winW + 2, winH + 2);
        // Warm golden interior glow
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(winX, winY, winW, winH);
        // Window mullion cross
        ctx.fillStyle = '#1e2836';
        ctx.fillRect(winX + 5, winY, 1, winH);
        ctx.fillRect(winX, winY + 6, winW, 1);
        // White reflection glint
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(winX + 1, winY + 1, 2, 2);

        // Flower box under window
        ctx.fillStyle = '#5c3726';
        ctx.fillRect(winX - 1, winY + winH, winW + 2, 4);
        ctx.fillStyle = '#2f4f38'; // Green foliage
        ctx.fillRect(winX, winY + winH - 1, winW, 2);
        // Tiny flowers
        ctx.fillStyle = '#f472b6';
        ctx.fillRect(winX + 1, winY + winH - 2, 2, 2);
        ctx.fillStyle = '#fce7b2';
        ctx.fillRect(winX + 5, winY + winH - 2, 2, 2);
        ctx.fillStyle = '#c084fc';
        ctx.fillRect(winX + 8, winY + winH - 2, 2, 2);

        // 6. Porch Lantern (Right of door)
        const lanX = houseX + 12;
        const lanY = wallY + 14;
        ctx.fillStyle = '#1e2836';
        ctx.fillRect(lanX, lanY, 3, 1); // Bracket
        ctx.fillRect(lanX + 1, lanY, 1, 3);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(lanX, lanY + 3, 3, 4); // Glowing lantern
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(lanX + 1, lanY + 4, 1, 2);
        ctx.fillStyle = '#1e2836';
        ctx.fillRect(lanX, lanY + 7, 3, 1);

        // 7. SOLID, COMPLETE GABLED ROOF (No hollow spaces, no grass showing through!)
        const roofPeakX = houseX;
        const roofPeakY = houseY - 14;
        const roofLeftX = houseX - 35;
        const roofRightX = houseX + 35;
        const roofEaveY = houseY + 22;

        // A. Complete Solid Base Roof Polygon
        ctx.fillStyle = '#243344';
        ctx.beginPath();
        ctx.moveTo(roofPeakX, roofPeakY);
        ctx.lineTo(roofRightX, roofEaveY);
        ctx.lineTo(roofLeftX, roofEaveY);
        ctx.closePath();
        ctx.fill();

        // B. Horizontal Tiered Shingle Courses (Giving clean, minimalistic RPG volume)
        // Shingle Tier 1 (Apex):
        ctx.fillStyle = '#32455c';
        ctx.beginPath();
        ctx.moveTo(roofPeakX, roofPeakY);
        ctx.lineTo(roofPeakX + 12, houseY - 5);
        ctx.lineTo(roofPeakX - 12, houseY - 5);
        ctx.closePath();
        ctx.fill();

        // Shingle Tier 2:
        ctx.fillStyle = '#3f5670';
        ctx.beginPath();
        ctx.moveTo(roofPeakX - 12, houseY - 5);
        ctx.lineTo(roofPeakX + 12, houseY - 5);
        ctx.lineTo(roofPeakX + 20, houseY + 4);
        ctx.lineTo(roofPeakX - 20, houseY + 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#283647';
        ctx.fillRect(roofPeakX - 20, houseY + 3, 40, 1); // Shingle shadow groove

        // Shingle Tier 3:
        ctx.fillStyle = '#4c6685';
        ctx.beginPath();
        ctx.moveTo(roofPeakX - 20, houseY + 4);
        ctx.lineTo(roofPeakX + 20, houseY + 4);
        ctx.lineTo(roofPeakX + 28, houseY + 13);
        ctx.lineTo(roofPeakX - 28, houseY + 13);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#283647';
        ctx.fillRect(roofPeakX - 28, houseY + 12, 56, 1); // Shingle shadow groove

        // Shingle Tier 4 (Bottom Eave Course):
        ctx.fillStyle = '#3f5670';
        ctx.beginPath();
        ctx.moveTo(roofPeakX - 28, houseY + 13);
        ctx.lineTo(roofPeakX + 28, houseY + 13);
        ctx.lineTo(roofRightX, roofEaveY);
        ctx.lineTo(roofLeftX, roofEaveY);
        ctx.closePath();
        ctx.fill();

        // Subtle vertical shingle tile notches for pixel detail
        ctx.fillStyle = '#283647';
        ctx.fillRect(roofPeakX - 9, houseY + 5, 1, 7);
        ctx.fillRect(roofPeakX + 8, houseY + 5, 1, 7);
        ctx.fillRect(roofPeakX - 16, houseY + 14, 1, 8);
        ctx.fillRect(roofPeakX, houseY + 14, 1, 8);
        ctx.fillRect(roofPeakX + 15, houseY + 14, 1, 8);

        // C. Clean Timber Eave Fascia Beam
        ctx.fillStyle = '#1c2532';
        ctx.fillRect(roofLeftX - 1, roofEaveY, (roofRightX - roofLeftX) + 2, 4);
        ctx.fillStyle = '#4c6482';
        ctx.fillRect(roofLeftX, roofEaveY, roofRightX - roofLeftX, 1); // Eave highlight

        // D. Left & Right Bargeboard Rake Trims
        ctx.strokeStyle = '#1c2532';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(roofLeftX - 1, roofEaveY + 3);
        ctx.lineTo(roofPeakX, roofPeakY - 1);
        ctx.lineTo(roofRightX + 1, roofEaveY + 3);
        ctx.stroke();

        ctx.strokeStyle = '#5a7799';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(roofLeftX, roofEaveY + 2);
        ctx.lineTo(roofPeakX, roofPeakY);
        ctx.stroke();

        // E. Solid Ridge Cap at Roof Peak
        ctx.fillStyle = '#5a7799';
        ctx.fillRect(roofPeakX - 6, roofPeakY - 2, 12, 3);
        ctx.fillStyle = '#7a9ec7';
        ctx.fillRect(roofPeakX - 5, roofPeakY - 2, 10, 1);

        // 8. Attic Window (Cleanly embedded in the center of the roof)
        const attW = 12;
        const attH = 12;
        const attX = houseX - attW / 2;
        const attY = houseY + 3;

        ctx.fillStyle = '#1c2532';
        ctx.fillRect(attX - 1, attY - 1, attW + 2, attH + 2);

        // Sky-blue glass with dark frame
        ctx.fillStyle = '#93c5fd';
        ctx.fillRect(attX, attY, attW, attH);

        // Window mullion cross
        ctx.fillStyle = '#1c2532';
        ctx.fillRect(attX + 5, attY, 2, attH);
        ctx.fillRect(attX, attY + 5, attW, 2);

        // Specular glint
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(attX + 1, attY + 1, 2, 2);

        // Window timber sill
        ctx.fillStyle = '#5c3726';
        ctx.fillRect(attX - 2, attY + attH, attW + 4, 2);
        ctx.fillStyle = '#8c563e';
        ctx.fillRect(attX - 1, attY + attH, attW + 2, 1);
    }

    // Mini Shed / Outbuilding
    drawMiniShed(shedX, shedY) {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(30, 50, 40, 0.4)';
        ctx.fillRect(shedX - 2, shedY + 18, 22, 6);

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
    }

    // Stacked Firewood
    drawStackedFirewood(pileX, pileY) {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(30, 50, 40, 0.4)';
        ctx.fillRect(pileX, pileY + 12, 14, 4);

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
    }

    // Chopping Stump with Axe
    drawChoppingStump(stumpX, stumpY) {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(30, 50, 40, 0.4)';
        ctx.fillRect(stumpX, stumpY + 8, 10, 4);

        ctx.fillStyle = '#5a362a';
        ctx.fillRect(stumpX, stumpY, 9, 10);
        ctx.fillStyle = '#b67d58';
        ctx.fillRect(stumpX + 1, stumpY, 7, 3);
        ctx.fillStyle = '#8c563e';
        ctx.fillRect(stumpX + 3, stumpY - 5, 8, 2);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(stumpX + 2, stumpY - 3, 3, 4);
    }

    // Timber Bench
    drawTimberBench(benchX, benchY) {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(30, 50, 40, 0.35)';
        ctx.fillRect(benchX, benchY + 8, 15, 4);

        ctx.fillStyle = '#5a362a';
        ctx.fillRect(benchX, benchY, 14, 10);
        ctx.fillStyle = '#b67d58';
        ctx.fillRect(benchX, benchY, 14, 3);
        ctx.fillRect(benchX + 2, benchY + 7, 10, 2);
    }

    // Shop NPC Captain Barnaby
    drawShopNPCCharacter(npcX, npcY) {
        const ctx = this.ctx;
        const idleBob = Math.sin(this.time * 2) > 0.5 ? 1 : 0;

        // Ground drop shadow
        ctx.fillStyle = 'rgba(25, 40, 30, 0.45)';
        ctx.beginPath();
        ctx.ellipse(npcX, npcY + 3, 8, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Boots & Pants
        ctx.fillStyle = '#1e2634';
        ctx.fillRect(npcX - 4, npcY - 4, 3, 6);
        ctx.fillRect(npcX + 1, npcY - 4, 3, 6);

        // Sailor Coat & Shirt
        ctx.fillStyle = '#2b394b';
        ctx.fillRect(npcX - 5, npcY - 15 + idleBob, 10, 11);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(npcX - 2, npcY - 16 + idleBob, 4, 3);
        ctx.fillStyle = '#fce7b2';
        ctx.fillRect(npcX - 3, npcY - 12 + idleBob, 2, 2);
        ctx.fillRect(npcX + 1, npcY - 12 + idleBob, 2, 2);

        // Head & Beard
        ctx.fillStyle = '#fed7aa';
        ctx.fillRect(npcX - 3, npcY - 21 + idleBob, 6, 6);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(npcX - 3, npcY - 17 + idleBob, 6, 4);
        ctx.fillStyle = '#1e2634';
        ctx.fillRect(npcX - 2, npcY - 19 + idleBob, 1, 2);
        ctx.fillRect(npcX + 1, npcY - 19 + idleBob, 1, 2);

        // Captain's Cap
        ctx.fillStyle = '#1e2634';
        ctx.fillRect(npcX - 4, npcY - 24 + idleBob, 8, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(npcX - 5, npcY - 22 + idleBob, 10, 2);
        ctx.fillStyle = '#fce7b2';
        ctx.fillRect(npcX - 1, npcY - 24 + idleBob, 2, 2);

        // Pipe & Smoke
        ctx.fillStyle = '#5a362a';
        ctx.fillRect(npcX + 3, npcY - 16 + idleBob, 4, 2);
        ctx.fillRect(npcX + 6, npcY - 18 + idleBob, 2, 3);
        const smokeY = npcY - 20 - ((this.time * 6) % 10);
        ctx.fillStyle = `rgba(241, 245, 249, 0.6)`;
        ctx.fillRect(npcX + 6, smokeY, 2, 2);
    }

    /**
     * 3. PROXIMITY-ONLY SHOP PROMPT:
     * Completely removes the permanent floating "Shop" banner.
     * Only displays a subtle "[E] Talk" prompt when player is within 32px of the shopkeeper.
     */
    renderShopNPCBadge() {
        const ctx = this.ctx;
        const npcX = this.camp.npcX;
        const npcY = this.camp.npcY;

        const distToPlayer = Math.hypot(this.player.x - npcX, this.player.y - npcY);

        // DYNAMIC PROXIMITY TRIGGER: ONLY show within 32px or when hovered
        if (distToPlayer > 32 && !this.camp.isHovered) {
            return; // Completely hidden when away!
        }

        // Subtle, elegant proximity prompt: "[E] Talk"
        const badgeY = npcY - 32 + Math.sin(this.time * 3) * 1.5;
        const badgeW = 44;
        const badgeH = 13;
        const badgeX = npcX - badgeW / 2;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
        ctx.fill();

        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('[E] Talk', npcX, badgeY + 9.5);
    }

    // Player Character drawing
    drawPlayerCharacter() {
        const ctx = this.ctx;
        const p = this.player;
        const x = Math.round(p.x);
        const y = Math.round(p.y);
        const isFishing = p.isFishing;
        const dir = p.dir;

        // Ground drop shadow
        ctx.fillStyle = 'rgba(25, 40, 30, 0.45)';
        ctx.beginPath();
        ctx.ellipse(x, y + 2, 8, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        const legOffset = p.isMoving ? (p.walkFrame % 2 === 0 ? 1 : -1) : 0;

        // Boots & Legs
        ctx.fillStyle = '#1f2733';
        ctx.fillRect(x - 4, y - 3 + legOffset, 3, 4);
        ctx.fillRect(x + 2, y - 3 - legOffset, 3, 4);

        // Pants
        ctx.fillStyle = '#2c394b';
        ctx.fillRect(x - 4, y - 8, 9, 6);

        // Shirt / Jacket
        ctx.fillStyle = '#475e7a';
        ctx.fillRect(x - 5, y - 17, 11, 10);

        // Belt & Buckle
        ctx.fillStyle = '#8c563e';
        ctx.fillRect(x - 5, y - 10, 11, 2);
        ctx.fillStyle = '#fce7b2';
        ctx.fillRect(x - 1, y - 10, 2, 2);

        // Collar
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(x - 2, y - 17, 4, 2);

        // Face & Head
        ctx.fillStyle = '#fed7aa';
        ctx.fillRect(x - 4, y - 23, 8, 7);

        // Eyes based on 8-directional facing
        ctx.fillStyle = '#1e2634';
        if (dir === 'S' || dir === 'SE' || dir === 'SW') {
            ctx.fillRect(x - 3, y - 20, 2, 2);
            ctx.fillRect(x + 1, y - 20, 2, 2);
        } else if (dir === 'E' || dir === 'NE') {
            ctx.fillRect(x + 2, y - 20, 2, 2);
        } else if (dir === 'W' || dir === 'NW') {
            ctx.fillRect(x - 4, y - 20, 2, 2);
        }

        // Hair
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

    // =========================================================================
    // FISHING POOL FALLBACK & UTILITY RENDERS
    // =========================================================================
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

    renderPlayer() {
        this.drawPlayerCharacter();
    }

    renderShopNPC() {
        this.drawShopNPCCharacter(this.camp.npcX, this.camp.npcY);
        this.renderShopNPCBadge();
    }

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
        ctx.fillStyle = `rgba(210, 236, 244, ${alpha * 0.85})`;

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

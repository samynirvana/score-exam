/**
 * Pixel Fishing Game - Core Game Configuration
 * Rarities, weight ranges, areas, catch tables, and economic formulas
 */

export const RARITY_CONFIG = {
    common: {
        id: 'common',
        name: 'Common',
        multiplier: 1.5,
        color: '#94a3b8',
        badgeBg: 'rgba(148, 163, 184, 0.15)',
        badgeBorder: '#94a3b8',
        glowColor: 'rgba(148, 163, 184, 0.4)',
        types: [
            { type: 1, minWeight: 0.1, maxWeight: 1.0, prob: 0.50 },
            { type: 2, minWeight: 1.0, maxWeight: 4.0, prob: 0.30 },
            { type: 3, minWeight: 4.0, maxWeight: 6.0, prob: 0.10 },
            { type: 4, minWeight: 6.0, maxWeight: 8.0, prob: 0.075 },
            { type: 5, minWeight: 8.0, maxWeight: 10.0, prob: 0.025 }
        ]
    },
    large: {
        id: 'large',
        name: 'Large',
        multiplier: 2.5,
        color: '#38bdf8',
        badgeBg: 'rgba(56, 189, 248, 0.15)',
        badgeBorder: '#38bdf8',
        glowColor: 'rgba(56, 189, 248, 0.4)',
        types: [
            { type: 1, minWeight: 10.0, maxWeight: 12.0, prob: 0.50 },
            { type: 2, minWeight: 12.0, maxWeight: 17.0, prob: 0.30 },
            { type: 3, minWeight: 17.0, maxWeight: 22.0, prob: 0.10 },
            { type: 4, minWeight: 22.0, maxWeight: 30.0, prob: 0.075 },
            { type: 5, minWeight: 30.0, maxWeight: 35.0, prob: 0.025 }
        ]
    },
    rare: {
        id: 'rare',
        name: 'Rare',
        multiplier: 5.0,
        color: '#3b82f6',
        badgeBg: 'rgba(59, 130, 246, 0.15)',
        badgeBorder: '#3b82f6',
        glowColor: 'rgba(59, 130, 246, 0.4)',
        types: [
            { type: 1, minWeight: 35.0, maxWeight: 50.0, prob: 0.50 },
            { type: 2, minWeight: 50.0, maxWeight: 55.0, prob: 0.30 },
            { type: 3, minWeight: 55.0, maxWeight: 60.0, prob: 0.10 },
            { type: 4, minWeight: 60.0, maxWeight: 65.0, prob: 0.075 },
            { type: 5, minWeight: 65.0, maxWeight: 70.0, prob: 0.025 }
        ]
    },
    legendary: {
        id: 'legendary',
        name: 'Legendary',
        multiplier: 10.0,
        color: '#a855f7',
        badgeBg: 'rgba(168, 85, 247, 0.15)',
        badgeBorder: '#a855f7',
        glowColor: 'rgba(168, 85, 247, 0.4)',
        types: [
            { type: 1, minWeight: 70.0, maxWeight: 73.0, prob: 0.50 },
            { type: 2, minWeight: 73.0, maxWeight: 75.0, prob: 0.30 },
            { type: 3, minWeight: 75.0, maxWeight: 78.0, prob: 0.10 },
            { type: 4, minWeight: 78.0, maxWeight: 80.0, prob: 0.075 },
            { type: 5, minWeight: 80.0, maxWeight: 85.0, prob: 0.025 }
        ]
    },
    ultra_rare: {
        id: 'ultra_rare',
        name: 'Ultra Rare',
        multiplier: 15.0,
        color: '#ec4899',
        badgeBg: 'rgba(236, 72, 153, 0.15)',
        badgeBorder: '#ec4899',
        glowColor: 'rgba(236, 72, 153, 0.4)',
        types: [
            { type: 1, minWeight: 85.0, maxWeight: 90.0, prob: 0.50 },
            { type: 2, minWeight: 90.0, maxWeight: 95.0, prob: 0.30 },
            { type: 3, minWeight: 95.0, maxWeight: 100.0, prob: 0.10 },
            { type: 4, minWeight: 105.0, maxWeight: 110.0, prob: 0.075 },
            { type: 5, minWeight: 110.0, maxWeight: 115.0, prob: 0.025 }
        ]
    },
    mythical: {
        id: 'mythical',
        name: 'Mythical',
        multiplier: 18.0,
        color: '#f97316',
        badgeBg: 'rgba(249, 115, 22, 0.15)',
        badgeBorder: '#f97316',
        glowColor: 'rgba(249, 115, 22, 0.4)',
        types: [
            { type: 1, minWeight: 115.0, maxWeight: 118.0, prob: 0.50 },
            { type: 2, minWeight: 118.0, maxWeight: 121.0, prob: 0.30 },
            { type: 3, minWeight: 124.0, maxWeight: 127.0, prob: 0.10 },
            { type: 4, minWeight: 127.0, maxWeight: 130.0, prob: 0.075 },
            { type: 5, minWeight: 130.0, maxWeight: 133.0, prob: 0.025 }
        ]
    },
    heavenly: {
        id: 'heavenly',
        name: 'Heavenly',
        multiplier: 20.0,
        color: '#eab308',
        badgeBg: 'rgba(234, 179, 8, 0.15)',
        badgeBorder: '#eab308',
        glowColor: 'rgba(234, 179, 8, 0.4)',
        types: [
            { type: 1, minWeight: 133.0, maxWeight: 138.0, prob: 0.50 },
            { type: 2, minWeight: 138.0, maxWeight: 141.0, prob: 0.30 },
            { type: 3, minWeight: 141.0, maxWeight: 145.0, prob: 0.10 },
            { type: 4, minWeight: 145.0, maxWeight: 150.0, prob: 0.075 },
            { type: 5, minWeight: 150.0, maxWeight: 155.0, prob: 0.025 }
        ]
    },
    angelic: {
        id: 'angelic',
        name: 'Angelic',
        multiplier: 35.0,
        color: '#14b8a6',
        badgeBg: 'rgba(20, 184, 166, 0.15)',
        badgeBorder: '#14b8a6',
        glowColor: 'rgba(20, 184, 166, 0.4)',
        types: [
            { type: 1, minWeight: 155.0, maxWeight: 165.0, prob: 0.50 },
            { type: 2, minWeight: 165.0, maxWeight: 170.0, prob: 0.30 },
            { type: 3, minWeight: 170.0, maxWeight: 175.0, prob: 0.10 },
            { type: 4, minWeight: 185.0, maxWeight: 195.0, prob: 0.075 },
            { type: 5, minWeight: 195.0, maxWeight: 250.0, prob: 0.025 }
        ]
    },
    godly: {
        id: 'godly',
        name: 'Godly',
        multiplier: 50.0,
        color: '#ef4444',
        badgeBg: 'rgba(239, 68, 68, 0.15)',
        badgeBorder: '#ef4444',
        glowColor: 'rgba(239, 68, 68, 0.4)',
        types: [
            { type: 1, minWeight: 250.0, maxWeight: 300.0, prob: 0.50 },
            { type: 2, minWeight: 300.0, maxWeight: 400.0, prob: 0.30 },
            { type: 3, minWeight: 400.0, maxWeight: 700.0, prob: 0.10 },
            { type: 4, minWeight: 700.0, maxWeight: 1000.0, prob: 0.075 },
            { type: 5, minWeight: 1000.0, maxWeight: 2000.0, prob: 0.025 }
        ]
    }
};

export const AREAS_CONFIG = [
    {
        id: 'starter_pond',
        name: 'Starter Pond',
        icon: '🌿',
        unlocked: true,
        expBonus: 1.0,
        theme: 'pond',
        tagline: 'Quiet mossy waters & lily pads',
        description: 'Animated calm green water, lily pads, floating ambient ripples, and soft mossy shore.',
        rarityChances: [
            { rarity: 'common', chance: 1.0 }
        ],
        fishPool: {
            common: [
                { type: 1, name: 'Tiny Minnow', icon: '🐟', desc: 'A quick little freshwater minnow.' },
                { type: 2, name: 'Mud Carp', icon: '🐡', desc: 'Bottom feeder with thick whiskers.' },
                { type: 3, name: 'Moss Bluegill', icon: '🐠', desc: 'Camouflaged with mossy green scales.' },
                { type: 4, name: 'Pond Catfish', icon: '🐟', desc: 'Heavy and whiskered pond dweller.' },
                { type: 5, name: 'Giant Tadpole', icon: '🐸', desc: 'An unnervingly huge prehistoric tadpole.' }
            ]
        }
    },
    {
        id: 'fishing_pool',
        name: 'Fishing Pool',
        icon: '🏊‍♂️',
        unlocked: true,
        expBonus: 1.5,
        theme: 'pool',
        tagline: 'Resort pool & wooden deck',
        description: 'Animated resort pool with vibrant turquoise water, tile grid floor, floating tubes, and wooden deck.',
        rarityChances: [
            { rarity: 'common', chance: 0.85 },
            { rarity: 'large', chance: 0.15 }
        ],
        fishPool: {
            common: [
                { type: 1, name: 'Pool Guppy', icon: '🐟', desc: 'Thrives on pool filter bubbles.' },
                { type: 2, name: 'Floating Goldfish', icon: '🐠', desc: 'Lost its way into the shallow end.' },
                { type: 3, name: 'Rubber Ducky Fish', icon: '🐤', desc: 'Squeaks when pulled out of the water!' },
                { type: 4, name: 'Tile Sunfish', icon: '🐡', desc: 'Patterns resemble ceramic pool mosaics.' },
                { type: 5, name: 'Pool Drain Catfish', icon: '🐟', desc: 'Lurks beneath the deep end drain.' }
            ],
            large: [
                { type: 1, name: 'Chlorinated Bass', icon: '🐟', desc: 'Scales emit a fresh chemical shimmer.' },
                { type: 2, name: 'Inflatable Koi', icon: '🎏', desc: 'Filled with helium and pool vibes.' },
                { type: 3, name: 'Deck Salmon', icon: '🐠', desc: 'Leaps gracefully onto sun loungers.' },
                { type: 4, name: 'Filter Sturgeon', icon: '🦈', desc: 'Massive swimmer that cleans the pump.' },
                { type: 5, name: 'Pool Party Tuna', icon: '🐟', desc: 'The life of the underwater party.' }
            ]
        }
    },
    { id: 'lake', name: 'Emerald Lake', icon: '🏞️', unlocked: false, expBonus: 2.0, minLevel: 10, theme: 'lake', tagline: 'Locked (Coming Soon)', description: 'Deep mountain lake shrouded in morning mist.' },
    { id: 'river', name: 'Rushing River', icon: '🌊', unlocked: false, expBonus: 2.5, minLevel: 20, theme: 'river', tagline: 'Locked (Coming Soon)', description: 'Fast rapids hiding powerful migratory fish.' },
    { id: 'sea', name: 'Coral Sea', icon: '🪸', unlocked: false, expBonus: 3.2, minLevel: 30, theme: 'sea', tagline: 'Locked (Coming Soon)', description: 'Vibrant coral reef with exotic species.' },
    { id: 'ocean', name: 'Deep Ocean', icon: '🐋', unlocked: false, expBonus: 4.0, minLevel: 45, theme: 'ocean', tagline: 'Locked (Coming Soon)', description: 'Abyssal depths where giant marine titans roam.' },
    { id: 'legendary_water', name: 'Legendary Water', icon: '🔮', unlocked: false, expBonus: 5.5, minLevel: 60, theme: 'legendary', tagline: 'Locked (Coming Soon)', description: 'Glowing enchanted waters with mythical creatures.' },
    { id: 'mythical_sea', name: 'Mythical Sea', icon: '🌌', unlocked: false, expBonus: 7.0, minLevel: 75, theme: 'mythical', tagline: 'Locked (Coming Soon)', description: 'Surreal realm between reality and dreams.' },
    { id: 'heaven', name: 'Celestial Heaven', icon: '✨', unlocked: false, expBonus: 10.0, minLevel: 90, theme: 'heaven', tagline: 'Locked (Coming Soon)', description: 'Floating sky realm blessed by divine angler spirits.' }
];

export const BASE_EXP = 20;

/**
 * Fish Price Formula:
 * Fish Price = (Fish Rarity Value * Fish Weight * Character Level * 1.2)
 */
export function calculateFishPrice(rarityMultiplier, weight, level) {
    const raw = rarityMultiplier * weight * level * 1.2;
    return Math.max(1, Math.round(raw));
}

/**
 * EXP Earned Formula:
 * EXP Earned = (Fish Rarity Value * Base EXP * Area EXP Bonus * Active Booster Multiplier)
 */
export function calculateExpEarned(rarityMultiplier, baseExp = BASE_EXP, areaExpBonus = 1.0, boosterMultiplier = 1.0) {
    const raw = rarityMultiplier * baseExp * areaExpBonus * boosterMultiplier;
    return Math.max(5, Math.round(raw));
}

/**
 * Leveling curve: Level 1 needs 100, Level 2 needs 150, etc.
 */
export function getExpNeededForLevel(level) {
    return Math.round(100 * Math.pow(level, 1.25));
}

export const INVENTORY_CONFIG = {
    initialCapacity: 10,
    maxCapacity: 200,
    upgradeStep: 5,
    getUpgradeCost: (currentCap) => {
        return Math.round(40 + (currentCap - 10) * 8);
    }
};

export const SHOP_CATALOG = {
    rods: [
        {
            id: 'rod_bamboo',
            name: 'Old Bamboo Rod',
            icon: '🎋',
            price: 0,
            desc: 'A humble handcrafted bamboo pole. Reliable and classic.',
            speedBonus: 0, // wait time reduction in %
            rarityBonus: 0, // extra rare weight
            color: '#a16207'
        },
        {
            id: 'rod_fiberglass',
            name: 'Fiberglass Spinner',
            icon: '🎣',
            price: 220,
            desc: 'Flexible composite rod. Reduces bite waiting time by 20%.',
            speedBonus: 0.20,
            rarityBonus: 0.05,
            color: '#0284c7'
        },
        {
            id: 'rod_carbon',
            name: 'Carbon Fiber Pro',
            icon: '⚡',
            price: 650,
            desc: 'Ultralight tournament-grade rod. 35% faster bites and +15% rarity luck.',
            speedBonus: 0.35,
            rarityBonus: 0.15,
            color: '#10b981'
        },
        {
            id: 'rod_titanium',
            name: 'Titanium Abyss Rod',
            icon: '🌊',
            price: 1500,
            desc: 'Forged from deep sea alloys. 50% faster bites and +30% rarity luck.',
            speedBonus: 0.50,
            rarityBonus: 0.30,
            color: '#8b5cf6'
        },
        {
            id: 'rod_trident',
            name: "Neptune's Trident Rod",
            icon: '🔱',
            price: 3600,
            desc: 'Blessed by ocean deities. 65% faster bites and doubles legendary chances!',
            speedBonus: 0.65,
            rarityBonus: 0.60,
            color: '#f59e0b'
        }
    ],
    baits: [
        {
            id: 'bait_worm',
            name: 'Wiggler Bait (5x)',
            icon: '🪱',
            price: 60,
            charges: 5,
            desc: 'Sweet earthworms that attract fish twice as fast for 5 casts.',
            type: 'speed',
            multiplier: 2.0
        },
        {
            id: 'bait_lure',
            name: 'Prismatic Lure (5x)',
            icon: '✨',
            price: 140,
            charges: 5,
            desc: 'Reflective spinner that significantly boosts chances of rarer fish for 5 casts.',
            type: 'rarity',
            multiplier: 1.5
        },
        {
            id: 'bait_chum',
            name: 'Golden Chum Pack (5x)',
            icon: '🌟',
            price: 280,
            charges: 5,
            desc: 'Infused with golden flakes. Grants 2.5x EXP and Coin sell bonus for 5 casts!',
            type: 'gold_exp',
            multiplier: 2.5
        }
    ],
    hats: [
        {
            id: 'hat_default',
            name: 'Classic Angler Cap',
            icon: '🧢',
            price: 0,
            desc: 'Standard fisherman cap with hook badge.',
            hatColor: '#475569',
            brimColor: '#334155',
            badgeColor: '#f43f5e'
        },
        {
            id: 'hat_straw',
            name: 'Woven Straw Hat',
            icon: '👒',
            price: 180,
            desc: 'Protects from the scorching afternoon sun. +5% bonus EXP.',
            hatColor: '#eab308',
            brimColor: '#ca8a04',
            badgeColor: '#15803d'
        },
        {
            id: 'hat_captain',
            name: "Captain's Bicorn Hat",
            icon: '🧑‍✈️',
            price: 520,
            desc: 'Look like an experienced skipper of high seas. +10% sell value on fish!',
            hatColor: '#1e293b',
            brimColor: '#e2e8f0',
            badgeColor: '#f59e0b'
        },
        {
            id: 'hat_crown',
            name: 'Angler King Crown',
            icon: '👑',
            price: 1800,
            desc: 'Pure gold crown studded with sapphires. Royalty of all 9 fishing realms!',
            hatColor: '#facc15',
            brimColor: '#eab308',
            badgeColor: '#38bdf8'
        }
    ],
    modules: [
        {
            id: 'module_autofish',
            name: '🤖 Auto-Fisher Droid',
            icon: '🤖',
            price: 350,
            desc: 'Permanent upgrade. Unlocks hands-free AFK Auto-Fishing: automatically casts, hooks, and reels in catches!',
            type: 'permanent_unlock'
        }
    ]
};

/**
 * Catch Logic Helper:
 * Determines rarity, fish type, species, weight, price, and exp
 */
export function rollFishCatch(areaId, playerLevel, boosterMultiplier = 1.0, options = {}) {
    const area = AREAS_CONFIG.find(a => a.id === areaId) || AREAS_CONFIG[0];
    const extraRarityBonus = options.extraRarityBonus || 0; // boosts chances toward higher rarities
    const priceMultiplier = options.priceMultiplier || 1.0;
    
    // 1. Rarity Roll with optional luck modifier
    // If luck bonus is present, roll twice and pick the higher rarity or shift roll down
    let randRarity = Math.random();
    if (extraRarityBonus > 0) {
        randRarity = Math.min(randRarity, Math.random() * (1 - extraRarityBonus * 0.4));
    }
    
    let cumulative = 0;
    let selectedRarityKey = 'common';
    for (const r of area.rarityChances) {
        cumulative += r.chance;
        if (randRarity <= cumulative) {
            selectedRarityKey = r.rarity;
            break;
        }
    }

    const rarityConfig = RARITY_CONFIG[selectedRarityKey] || RARITY_CONFIG.common;

    // 2. Fish Type Roll (Type 1: 50%, Type 2: 30%, Type 3: 10%, Type 4: 7.5%, Type 5: 2.5%)
    let randType = Math.random();
    if (extraRarityBonus > 0 && Math.random() < extraRarityBonus) {
        // Bias slightly towards higher fish type numbers
        randType = Math.max(randType, Math.random());
    }
    let typeCumulative = 0;
    let selectedTypeObj = rarityConfig.types[0];
    for (const t of rarityConfig.types) {
        typeCumulative += t.prob;
        if (randType <= typeCumulative) {
            selectedTypeObj = t;
            break;
        }
    }

    // 3. Weight Roll within Type range
    const minW = selectedTypeObj.minWeight;
    const maxW = selectedTypeObj.maxWeight;
    const rawWeight = minW + Math.random() * (maxW - minW);
    const weight = Math.round(rawWeight * 100) / 100;

    // 4. Species details from Area Fish Pool
    const pool = area.fishPool[selectedRarityKey] || area.fishPool.common;
    const species = pool.find(s => s.type === selectedTypeObj.type) || pool[0];

    // 5. Calculations
    const basePrice = calculateFishPrice(rarityConfig.multiplier, weight, playerLevel);
    const price = Math.round(basePrice * priceMultiplier);
    const exp = calculateExpEarned(rarityConfig.multiplier, BASE_EXP, area.expBonus, boosterMultiplier);

    return {
        id: 'fish_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        name: species.name,
        icon: species.icon,
        desc: species.desc,
        rarityId: rarityConfig.id,
        rarityName: rarityConfig.name,
        rarityMultiplier: rarityConfig.multiplier,
        rarityColor: rarityConfig.color,
        badgeBg: rarityConfig.badgeBg,
        badgeBorder: rarityConfig.badgeBorder,
        glowColor: rarityConfig.glowColor,
        type: selectedTypeObj.type,
        weight: weight,
        price: price,
        exp: exp,
        areaId: area.id,
        areaName: area.name,
        caughtAt: Date.now()
    };
}

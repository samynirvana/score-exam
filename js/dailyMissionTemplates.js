/**
 * Daily Mission Template Library & Preset Bank
 * Provides pre-crafted, engaging missions across diverse categories and task types.
 */

export const MISSION_TEMPLATES = [
    // --- 🌟 Weekly Themed Days ---
    {
        id: 'theme_monday_goal',
        category: 'weekly',
        categoryName: '🌟 Weekly Themes',
        badge: 'Mindset Monday',
        badgeColor: '#6366f1',
        title: 'Mindset Monday: 1 Goal & Game Plan',
        taskType: 'opinion',
        description: 'Set your intention for the week! Write 1 clear academic or personal goal you want to achieve by Friday, and 1 specific action you will take each day to reach it.',
        questionPrompt: ''
    },
    {
        id: 'theme_tuesday_trivia',
        category: 'weekly',
        categoryName: '🌟 Weekly Themes',
        badge: 'Trivia Tuesday',
        badgeColor: '#3b82f6',
        title: 'Trivia Tuesday: Mind-Blowing Fact',
        taskType: 'question',
        questionPrompt: 'What is one weird, surprising, or little-known fact about science, nature, or history that blows your mind?',
        description: 'Research or share an extraordinary fact! Explain what makes it so fascinating and where you learned it.'
    },
    {
        id: 'theme_wednesday_whatif_cars',
        category: 'weekly',
        categoryName: '🌟 Weekly Themes',
        badge: 'What-If Wednesday',
        badgeColor: '#ec4899',
        title: 'What If Cars Had Never Been Invented?',
        taskType: 'question',
        questionPrompt: 'If cars hadn\'t been invented, what would our cities, travel, and daily life look like today?',
        description: 'Use your imagination! Think about alternative transportation, environment, city design, and how people would commute.'
    },
    {
        id: 'theme_wednesday_whatif_animals',
        category: 'weekly',
        categoryName: '🌟 Weekly Themes',
        badge: 'What-If Wednesday',
        badgeColor: '#ec4899',
        title: 'What If Animals Could Talk?',
        taskType: 'opinion',
        description: 'If every animal suddenly gained the ability to speak human language, which species would be the friendliest? Which would be the rudest? How would the world change?',
        questionPrompt: ''
    },
    {
        id: 'theme_wednesday_whatif_superpower',
        category: 'weekly',
        categoryName: '🌟 Weekly Themes',
        badge: 'What-If Wednesday',
        badgeColor: '#ec4899',
        title: 'What If You Had 1 Superpower for 24 Hours?',
        taskType: 'opinion',
        description: 'If you were granted any one superpower (flying, invisibility, time manipulation, telepathy) for only 24 hours, what would you choose and what would you do with it?',
        questionPrompt: ''
    },
    {
        id: 'theme_thursday_gratitude',
        category: 'weekly',
        categoryName: '🌟 Weekly Themes',
        badge: 'Thankful Thursday',
        badgeColor: '#10b981',
        title: 'Thankful Thursday: Appreciation Note',
        taskType: 'opinion',
        description: 'Write a genuine note of appreciation or compliment to a classmate, teacher, or family member who helped or encouraged you recently. What did they do?',
        questionPrompt: ''
    },
    {
        id: 'theme_friday_flashback',
        category: 'weekly',
        categoryName: '🌟 Weekly Themes',
        badge: 'Flashback Friday',
        badgeColor: '#f59e0b',
        title: 'Flashback Friday: Biggest "Aha!" Moment',
        taskType: 'opinion',
        description: 'Reflect on this past week: What was the single most interesting, surprising, or helpful concept you learned in class? How can you apply it in real life?',
        questionPrompt: ''
    },

    // --- 📸 Scavenger Hunt & Photo Missions ---
    {
        id: 'photo_symmetry',
        category: 'photo',
        categoryName: '📸 Photo & Scavenger',
        badge: 'Math in Nature',
        badgeColor: '#ec4899',
        title: 'Photo Hunt: Find Radial or Bilateral Symmetry',
        taskType: 'photo',
        description: 'Look around school, your home, or a garden. Find an object, leaf, building, or design that has clear symmetry. Upload or snap a picture and explain the symmetry lines in your caption!'
    },
    {
        id: 'photo_organized_desk',
        category: 'photo',
        categoryName: '📸 Photo & Scavenger',
        badge: 'Habits',
        badgeColor: '#10b981',
        title: 'Tidy Desk Challenge: Before & After or Clean Workspace',
        taskType: 'photo',
        description: 'Organize your study desk or backpack! Snap a photo of your clean, ready-to-study workspace. Mention your top 1 tip for keeping it clutter-free.'
    },
    {
        id: 'photo_healthy_habit',
        category: 'photo',
        categoryName: '📸 Photo & Scavenger',
        badge: 'Wellness',
        badgeColor: '#06b6d4',
        title: 'Fuel Your Brain: Healthy Snack or Meal',
        taskType: 'photo',
        description: 'Snap a picture of a healthy food, fruit, or snack you ate today. Briefly explain what nutrients or vitamins it provides to keep your energy high.'
    },
    {
        id: 'photo_book_cover',
        category: 'photo',
        categoryName: '📸 Photo & Scavenger',
        badge: 'Reading',
        badgeColor: '#8b5cf6',
        title: 'Show Your Book: Current Read & Pitch',
        taskType: 'photo',
        description: 'Take a photo of the book, magazine, or article you are currently reading. In the caption, write a 1-sentence hook to convince your classmates to read it!'
    },

    // --- 💬 Friendly Debates & Opinions ---
    {
        id: 'opinion_school_hours',
        category: 'opinion',
        categoryName: '💬 Debates & Opinions',
        badge: 'Debate',
        badgeColor: '#8b5cf6',
        title: 'Debate: Should School Start 1 Hour Later?',
        taskType: 'opinion',
        description: 'Many sleep scientists argue teens learn better starting at 9:00 AM instead of 8:00 AM. What do you think? Give 2 pros and 2 potential drawbacks.'
    },
    {
        id: 'opinion_books_vs_screens',
        category: 'opinion',
        categoryName: '💬 Debates & Opinions',
        badge: 'Hot Take',
        badgeColor: '#8b5cf6',
        title: 'Paper Books vs. Digital Screens',
        taskType: 'opinion',
        description: 'Which do you prefer for reading and studying: physical paper books or digital screens/e-readers? Give 2 strong reasons supporting your preference.'
    },
    {
        id: 'opinion_three_apps',
        category: 'opinion',
        categoryName: '💬 Debates & Opinions',
        badge: 'Dilemma',
        badgeColor: '#8b5cf6',
        title: 'The 3-App Desert Island Challenge',
        taskType: 'opinion',
        description: 'If you were restricted to having only 3 apps on your phone or tablet for the rest of your life, which 3 would you pick and why?'
    },
    {
        id: 'opinion_ai_homework',
        category: 'opinion',
        categoryName: '💬 Debates & Opinions',
        badge: 'Future Tech',
        badgeColor: '#8b5cf6',
        title: 'Ethics: Artificial Intelligence in Schoolwork',
        taskType: 'opinion',
        description: 'Should students be allowed to use AI (like chatbots) to help with schoolwork? Where is the line between using AI as a tutor vs. cheating?'
    },

    // --- 🧩 Brain Teasers & Riddles ---
    {
        id: 'riddle_towel',
        category: 'question',
        categoryName: '🧩 Riddles & Logic',
        badge: 'Riddle',
        badgeColor: '#3b82f6',
        title: 'Riddle of the Day: What Gets Wetter?',
        taskType: 'question',
        questionPrompt: 'What gets wetter and wetter the more it dries?',
        description: 'Think outside the box! Answer the riddle and explain your reasoning.'
    },
    {
        id: 'riddle_keyboard',
        category: 'question',
        categoryName: '🧩 Riddles & Logic',
        badge: 'Riddle',
        badgeColor: '#3b82f6',
        title: 'Riddle of the Day: Keys with No Locks',
        taskType: 'question',
        questionPrompt: 'I have keys, but no locks. I have space, but no room. You can enter, but you can’t go outside. What am I?',
        description: 'Type your answer and explain why it fits every single clue!'
    },
    {
        id: 'riddle_river_crossing',
        category: 'question',
        categoryName: '🧩 Riddles & Logic',
        badge: 'Logic Puzzle',
        badgeColor: '#3b82f6',
        title: 'Classic Puzzle: Fox, Goose & Bag of Grain',
        taskType: 'question',
        questionPrompt: 'How can a farmer take a fox, a goose, and a bag of grain across a river in a small boat that holds only the farmer and one item, without the fox eating the goose or the goose eating the grain?',
        description: 'Write out the step-by-step trips the farmer must take to get all three safely across.'
    },

    // --- 🎙️ Voice & Pronunciation ---
    {
        id: 'audio_read_aloud',
        category: 'audio',
        categoryName: '🎙️ Voice & Audio',
        badge: 'Pronunciation',
        badgeColor: '#f59e0b',
        title: 'Read Aloud: 30-Second Expressive Reading',
        taskType: 'audio',
        description: 'Record yourself reading a paragraph from your English textbook or a favorite novel. Focus on clear pronunciation, pacing, and emotional expression!'
    },
    {
        id: 'audio_elevator_pitch',
        category: 'audio',
        categoryName: '🎙️ Voice & Audio',
        badge: 'Speaking',
        badgeColor: '#f59e0b',
        title: 'Elevator Pitch: 45-Second Invention Pitch',
        taskType: 'audio',
        description: 'Record a 30 to 45-second audio pitch for a new invention you would love to create. Explain what problem it solves and why everyone needs one!'
    },
    {
        id: 'audio_tongue_twister',
        category: 'audio',
        categoryName: '🎙️ Voice & Audio',
        badge: 'Fun Challenge',
        badgeColor: '#f59e0b',
        title: 'Tongue Twister Sprint: 3 Times Fast!',
        taskType: 'audio',
        description: 'Record yourself saying this tongue twister 3 times as fast and clearly as you can: "She sells seashells by the seashore, and the shells she sells are seashells for sure."'
    },

    // --- 🔗 Link & Digital Showcases ---
    {
        id: 'link_canva_slide',
        category: 'link',
        categoryName: '🔗 Link & Projects',
        badge: 'Design',
        badgeColor: '#06b6d4',
        title: 'Showcase: Submit a Canva Poster or Slide',
        taskType: 'link',
        description: 'Design a digital poster or slide (using Canva, Google Slides, or similar tool) summarizing this week\'s topic. Paste your viewable link and write a brief summary!'
    },
    {
        id: 'link_scratch_project',
        category: 'link',
        categoryName: '🔗 Link & Projects',
        badge: 'Coding',
        badgeColor: '#06b6d4',
        title: 'Tech Showcase: Share a Coding or Interactive Link',
        taskType: 'link',
        description: 'Share a link to an educational interactive game, Scratch project, simulation, or GitHub repo you created or discovered. Describe what it does!'
    },
    {
        id: 'link_article_summary',
        category: 'link',
        categoryName: '🔗 Link & Projects',
        badge: 'Research',
        badgeColor: '#06b6d4',
        title: 'Current Events: Share & Summarize an Article',
        taskType: 'link',
        description: 'Find a reputable news or science article published this week. Paste the link and summarize the 3 main takeaways in your own words.'
    },

    // --- 🎨 Drawing & Sketches ---
    {
        id: 'drawing_mindmap',
        category: 'drawing',
        categoryName: '🎨 Draw & Sketch',
        badge: 'Visual Learning',
        badgeColor: '#a855f7',
        title: 'Visual Mind Map: Draw Today\'s Core Concept',
        taskType: 'drawing',
        description: 'Use the on-screen sketchpad to draw a mind map or diagram illustrating the main idea taught in class today. Use different colors for key branches!'
    },
    {
        id: 'drawing_invention',
        category: 'drawing',
        categoryName: '🎨 Draw & Sketch',
        badge: 'Creativity',
        badgeColor: '#a855f7',
        title: 'Blueprint: Sketch an Invention for Year 3000',
        taskType: 'drawing',
        description: 'Sketch a blueprint of a futuristic machine or gadget. Label at least 3 parts and add a short caption explaining how it works!'
    },
    {
        id: 'drawing_comic',
        category: 'drawing',
        categoryName: '🎨 Draw & Sketch',
        badge: 'Storytelling',
        badgeColor: '#a855f7',
        title: '3-Panel Comic: A Day in the Life',
        taskType: 'drawing',
        description: 'Draw a mini 3-panel comic strip about a funny school moment, a scientific reaction, or a historical event.'
    },

    // --- 🤝 Kindness & Good Habits ---
    {
        id: 'general_kindness',
        category: 'general',
        categoryName: '🤝 Kindness & Habits',
        badge: 'Character',
        badgeColor: '#10b981',
        title: 'Secret Agent of Kindness: 1 Good Deed',
        taskType: 'general',
        description: 'Do one kind deed today without seeking attention or credit (holding a door, helping clean up, cheering up a peer). Describe what you did and how it felt!'
    },
    {
        id: 'general_reading_streak',
        category: 'general',
        categoryName: '🤝 Kindness & Habits',
        badge: 'Focus',
        badgeColor: '#10b981',
        title: '20-Minute Deep Reading Streak',
        taskType: 'general',
        description: 'Read a book for 20 minutes uninterrupted without checking your phone. Tell us the title, pages read, and one quote or sentence that stood out to you.'
    }
];

let activeCategoryFilter = 'all';
let currentSelectCallback = null;

/**
 * Open the Template Picker Modal
 */
export function openTemplatePicker(onSelectCallback) {
    currentSelectCallback = onSelectCallback;
    let modal = document.getElementById('dmTemplatePickerModal');
    if (!modal) {
        modal = createTemplatePickerModal();
        document.body.appendChild(modal);
    }
    renderTemplateCards();
    const container = document.getElementById('dmTemplatesGridContainer');
    if (container) container.scrollTop = 0;
    modal.style.display = 'flex';
}

/**
 * Close the Template Picker Modal
 */
export function closeTemplatePicker() {
    const modal = document.getElementById('dmTemplatePickerModal');
    if (modal) modal.style.display = 'none';
    currentSelectCallback = null;
}

/**
 * Create the Modal DOM Element
 */
function createTemplatePickerModal() {
    const modal = document.createElement('div');
    modal.id = 'dmTemplatePickerModal';
    modal.className = 'dm-modal-backdrop';
    modal.style.display = 'none';

    modal.innerHTML = `
        <div class="dm-template-modal-card" style="max-width: 880px; width: 94%; height: min(86vh, 760px); max-height: 90vh; background: var(--bg-main, #ffffff); border-radius: 20px; box-shadow: 0 25px 60px rgba(0,0,0,0.28); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border-color, #e2e8f0); position: relative; box-sizing: border-box;">
            <!-- Header -->
            <div class="dm-template-header" style="flex: 0 0 auto; flex-shrink: 0; padding: 18px 24px; border-bottom: 1.5px solid var(--border-color, #e2e8f0); display: flex; align-items: center; justify-content: space-between; background: linear-gradient(135deg, rgba(99,102,241,0.06), rgba(236,72,153,0.06)); box-sizing: border-box;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #6366f1, #a855f7); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 4px 14px rgba(99,102,241,0.35); flex-shrink: 0;">
                        💡
                    </div>
                    <div>
                        <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: var(--text-dark, #0f172a);">Daily Mission Idea & Preset Bank</h3>
                        <p style="margin: 2px 0 0 0; font-size: 12.5px; color: var(--text-gray, #64748b);">Pick any engaging template below to instantly populate your mission</p>
                    </div>
                </div>
                <button type="button" id="dmCloseTemplatePickerBtn" class="dm-form-close" style="position: static; font-size: 18px; width: 34px; height: 34px; flex-shrink: 0;" aria-label="Close">✕</button>
            </div>

            <!-- Category Filter Tabs -->
            <div class="dm-template-pills-bar" id="dmTemplateCategoryPills" style="flex: 0 0 auto; flex-shrink: 0; min-height: 52px; padding: 10px 24px; background: var(--bg-body, #f8fafc); border-bottom: 1px solid var(--border-color, #e2e8f0); display: flex; gap: 8px; align-items: center; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; box-sizing: border-box; position: relative; z-index: 2;">
                <button type="button" class="dm-template-cat-pill active" data-cat="all">🌟 All (${MISSION_TEMPLATES.length})</button>
                <button type="button" class="dm-template-cat-pill" data-cat="weekly">🌟 Weekly Themes</button>
                <button type="button" class="dm-template-cat-pill" data-cat="photo">📸 Photos</button>
                <button type="button" class="dm-template-cat-pill" data-cat="opinion">💬 Debates</button>
                <button type="button" class="dm-template-cat-pill" data-cat="question">🧩 Riddles</button>
                <button type="button" class="dm-template-cat-pill" data-cat="audio">🎙️ Voice</button>
                <button type="button" class="dm-template-cat-pill" data-cat="link">🔗 Links</button>
                <button type="button" class="dm-template-cat-pill" data-cat="drawing">🎨 Drawing</button>
                <button type="button" class="dm-template-cat-pill" data-cat="general">🤝 Kindness</button>
            </div>

            <!-- Templates List Container -->
            <div id="dmTemplatesGridContainer" class="dm-templates-grid" style="flex: 1 1 0%; min-height: 0; overflow-y: auto; padding: 20px 24px; display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; align-content: start; box-sizing: border-box; position: relative; z-index: 1;">
                <!-- Dynamically populated -->
            </div>
        </div>
    `;

    // Event listeners
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeTemplatePicker();
    });

    const closeBtn = modal.querySelector('#dmCloseTemplatePickerBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeTemplatePicker);

    modal.querySelectorAll('.dm-template-cat-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            modal.querySelectorAll('.dm-template-cat-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeCategoryFilter = btn.getAttribute('data-cat') || 'all';
            renderTemplateCards();
        });
    });

    return modal;
}

/**
 * Render cards based on category
 */
function renderTemplateCards() {
    const container = document.getElementById('dmTemplatesGridContainer');
    if (!container) return;
    container.scrollTop = 0;

    const filtered = activeCategoryFilter === 'all'
        ? MISSION_TEMPLATES
        : MISSION_TEMPLATES.filter(t => t.category === activeCategoryFilter);

    const typeIcons = {
        photo: '📸 Photo',
        opinion: '💬 Opinion',
        question: '❓ Q&A',
        general: '📋 Task',
        audio: '🎙️ Voice',
        link: '🔗 Link',
        drawing: '🎨 Drawing'
    };

    container.innerHTML = filtered.map(t => {
        const typeText = typeIcons[t.taskType] || 'Task';
        return `
            <div class="dm-template-card" style="border: 1.5px solid var(--border-color, #e2e8f0); border-radius: 14px; padding: 14px 16px; background: var(--bg-main, #ffffff); display: flex; flex-direction: column; justify-content: space-between; min-height: 185px; box-sizing: border-box; transition: all 0.2s ease; cursor: pointer;" data-id="${t.id}">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 6px;">
                        <span style="font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 999px; background: rgba(99,102,241,0.1); color: ${t.badgeColor || '#6366f1'};">${t.badge}</span>
                        <span style="font-size: 11px; font-weight: 700; color: var(--text-gray, #64748b);">${typeText}</span>
                    </div>
                    <h4 style="margin: 0 0 6px 0; font-size: 14.5px; font-weight: 800; color: var(--text-dark, #0f172a); line-height: 1.35;">${escapeHtml(t.title)}</h4>
                    <p style="margin: 0; font-size: 12px; color: var(--text-gray, #64748b); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${escapeHtml(t.description)}</p>
                </div>
                <button type="button" class="dm-use-template-btn" style="margin-top: 14px; width: 100%; padding: 7px 12px; border-radius: 8px; background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; font-size: 12.5px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.15s ease;">
                    Use This Template ✨
                </button>
            </div>
        `;
    }).join('');

    // Click handler for template cards
    container.querySelectorAll('.dm-template-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.getAttribute('data-id');
            const template = MISSION_TEMPLATES.find(t => t.id === id);
            if (template && typeof currentSelectCallback === 'function') {
                currentSelectCallback(template);
                closeTemplatePicker();
            }
        });
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
}

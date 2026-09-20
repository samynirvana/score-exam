// learningData.js - Comprehensive English Grade 9 Gamified Learning Curriculum
export const ENGLISH_G9_MODULES = [
  {
    id: "unit-1",
    level: 1,
    title: "16 English Tenses",
    subtitle: "Master the complete timeline of time, aspects, and verb transformations",
    category: "Grammar Core",
    icon: "⏱️",
    badge: "Time Traveler",
    xpReward: 350,
    formula: "Aspects: Simple | Continuous (be + V-ing) | Perfect (have/has/had + V3) | Perfect Continuous (have/has/had + been + V-ing)",
    deepExplanation: `
      English has 16 tense structures formed by 4 time dimensions (Present, Past, Future, Past Future) and 4 aspectual forms (Simple, Continuous, Perfect, Perfect Continuous).
      
      <h3>The 4x4 Tense Matrix</h3>
      <table class="matrix-table">
        <thead>
          <tr>
            <th>Aspect</th>
            <th>Present</th>
            <th>Past</th>
            <th>Future</th>
            <th>Past Future</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Simple</strong></td>
            <td>S + V1(s/es)</td>
            <td>S + V2</td>
            <td>S + will + V1</td>
            <td>S + would + V1</td>
          </tr>
          <tr>
            <td><strong>Continuous</strong></td>
            <td>S + is/am/are + V-ing</td>
            <td>S + was/were + V-ing</td>
            <td>S + will be + V-ing</td>
            <td>S + would be + V-ing</td>
          </tr>
          <tr>
            <td><strong>Perfect</strong></td>
            <td>S + have/has + V3</td>
            <td>S + had + V3</td>
            <td>S + will have + V3</td>
            <td>S + would have + V3</td>
          </tr>
          <tr>
            <td><strong>Perfect Continuous</strong></td>
            <td>S + have/has been + V-ing</td>
            <td>S + had been + V-ing</td>
            <td>S + will have been + V-ing</td>
            <td>S + would have been + V-ing</td>
          </tr>
        </tbody>
      </table>

      <h3>Key Mindset & Distinctions</h3>
      <ul>
        <li><strong>Present Perfect vs. Simple Past:</strong> Present Perfect connects an event to *right now* (results matter), while Simple Past is anchored in an expired time bucket (e.g. *yesterday*, *in 2022*).</li>
        <li><strong>Past Perfect (The 'Before-Past'):</strong> Used exclusively when two past actions occur and you need to highlight which one concluded *first*. Example: <em>When John arrived, the movie had already started.</em></li>
        <li><strong>Future Continuous:</strong> Visualizes an action in mid-motion at a specific future benchmark. Example: <em>Tomorrow at 8 PM, I will be flying over the Pacific.</em></li>
      </ul>
    `,
    contexts: {
      movie: {
        title: "The Terminator (1984) & Back to the Future (1985)",
        quote: "\"I'll be back.\" — The Terminator (Simple Future for promise/threat). In Back to the Future: \"Where we're going, we don't need roads.\" (Present Continuous as immediate predetermined future).",
        breakdown: "Sci-fi movies play with tense shifts because characters travel across timelines. Marty McFly frequently uses Past Future: *\"I knew you would say that!\"* showing future perspective seen from the past."
      },
      music: {
        title: "Adele - \"Rolling in the Deep\" & Queen - \"Bohemian Rhapsody\"",
        quote: "\"We could have had it all... Rolling in the deep\" (Past Modal Perfect), and Queen's \"Mama, life had just begun, but now I've gone and thrown it all away\" (Past Perfect vs Present Perfect contrast).",
        breakdown: "Songwriters use Present Perfect (*\"I've loved and I've lost\"*) to capture personal growth where the journey continues into the current heartbeat of the melody."
      },
      book: {
        title: "George Orwell - 1984 & F. Scott Fitzgerald - The Great Gatsby",
        quote: "\"Who controls the past controls the future: who controls the present controls the past.\" (Simple Present expressing universal, timeless philosophical maxims).",
        breakdown: "In *The Great Gatsby*, Nick Carraway writes in Past Perfect whenever recounting Gatsby's past dreams (*\"He had waited five years and bought a mansion on where he had dispensed starlight to casual moths\"*)."
      }
    },
    practiceQuestions: [
      {
        id: "q1-1",
        question: "By the time the school bell rings tomorrow afternoon, we ______ all our final exam projects.",
        options: ["will have finished", "will finish", "had finished", "finish"],
        correctIndex: 0,
        explanation: "'By the time + Present' points to an action that will be completed before another future moment, requiring Future Perfect (will have + V3)."
      },
      {
        id: "q1-2",
        question: "When Detective Miller entered the vault, the thieves ______ through the rooftop skylight.",
        options: ["have already escaped", "had already escaped", "were escaping", "would escape"],
        correctIndex: 1,
        explanation: "The escape occurred before Detective Miller entered (both in the past), demanding Past Perfect (had + V3)."
      },
      {
        id: "q1-3",
        question: "Look at those dark storm clouds gathering! It ______ any second.",
        options: ["is going to rain", "rains", "will have rained", "had rained"],
        correctIndex: 0,
        explanation: "'Be going to' is used when there is present visual evidence of an imminent event."
      },
      {
        id: "q1-4",
        question: "She was exhausted because she ______ non-stop since 6 o'clock in the morning.",
        options: ["has worked", "had been working", "will be working", "works"],
        correctIndex: 1,
        explanation: "Duration leading up to a past moment ('was exhausted') requires Past Perfect Continuous (had been + V-ing)."
      },
      {
        id: "q1-5",
        question: "I thought you ______ join us for the astronomy lecture last night.",
        options: ["would", "will", "are going to", "have to"],
        correctIndex: 0,
        explanation: "Past Future ('thought' is in the past, so 'will' shifts to its past form 'would')."
      }
    ]
  },
  {
    id: "unit-2",
    level: 2,
    title: "Passive Voice: Present & Past",
    subtitle: "Shift focus from who did it to what happened",
    category: "Syntax & Voice",
    icon: "🔄",
    badge: "Agent of Action",
    xpReward: 320,
    formula: "Subject + [Be: is/am/are OR was/were] + Past Participle (V3) [+ by Agent]",
    deepExplanation: `
      The passive voice is used when the focus is on the action, the result, or the recipient of the action, rather than the doer (agent).

      <h3>Tense Conversions</h3>
      <ul>
        <li><strong>Simple Present Passive:</strong> <code>is / am / are + V3</code><br><em>Active:</em> The chef bakes the bread daily. <br><em>Passive:</em> The bread <strong>is baked</strong> daily.</li>
        <li><strong>Present Continuous Passive:</strong> <code>is / am / are + being + V3</code><br><em>Active:</em> Workers are repairing the bridge. <br><em>Passive:</em> The bridge <strong>is being repaired</strong>.</li>
        <li><strong>Simple Past Passive:</strong> <code>was / were + V3</code><br><em>Active:</em> Shakespeare wrote Romeo and Juliet in the 1590s. <br><em>Passive:</em> Romeo and Juliet <strong>was written</strong> by Shakespeare.</li>
        <li><strong>Past Continuous Passive:</strong> <code>was / were + being + V3</code><br><em>Active:</em> The police were questioning the suspect at midnight. <br><em>Passive:</em> The suspect <strong>was being questioned</strong> at midnight.</li>
      </ul>

      <h3>When to use the Passive Voice:</h3>
      <ol>
        <li>When the agent is unknown or irrelevant: <em>My bicycle was stolen last weekend.</em></li>
        <li>In scientific, legal, and news reporting: <em>Over 5,000 samples were analyzed in the laboratory.</em></li>
        <li>To soften blame or maintain diplomacy: <em>Mistakes were made during the negotiation.</em></li>
      </ol>
    `,
    contexts: {
      movie: {
        title: "Star Wars: Episode IV - A New Hope",
        quote: "\"A long time ago in a galaxy far, far away... The Death Star was constructed under the Emperor's secret orders.\"",
        breakdown: "In movie trailers and openings, passive voice creates mystery and grand scale by highlighting massive galactic events rather than bureaucratic technicians."
      },
      music: {
        title: "Coldplay - \"Viva La Vida\"",
        quote: "\"One minute I held the key, next the walls were closed on me... Roman cavalry choirs are singing...\"",
        breakdown: "Chris Martin uses past passive (*\"the walls were closed on me\"*) to emphasize feelings of helplessness, where forces beyond his control took away his crown."
      },
      book: {
        title: "The Hobbit by J.R.R. Tolkien",
        quote: "\"In a hole in the ground there lived a hobbit... Not a wet, dirty hole... where shadows were cast and treasures were guarded.\"",
        breakdown: "Fantasy literature uses passive voice to describe ancient relics and ruins where the original creators were lost to time."
      }
    },
    practiceQuestions: [
      {
        id: "q2-1",
        question: "Every morning, organic vegetables ______ from local farms to our school cafeteria.",
        options: ["are delivered", "delivered", "are delivering", "have delivered"],
        correctIndex: 0,
        explanation: "Plural subject ('organic vegetables') in simple present routine requires 'are + V3' (are delivered)."
      },
      {
        id: "q2-2",
        question: "The historic fortress ______ in 1789 by renowned royal architects.",
        options: ["was constructed", "constructed", "is constructed", "was constructing"],
        correctIndex: 0,
        explanation: "Singular subject ('fortress') in an expired historical year (1789) takes 'was constructed'."
      },
      {
        id: "q2-3",
        question: "Please excuse the noise in the hallway; the exhibition boards ______ by the art club.",
        options: ["are being set up", "were set up", "are setting up", "have set up"],
        correctIndex: 0,
        explanation: "Action in progress right now ('Please excuse the noise') in passive needs 'is/are being + V3'."
      },
      {
        id: "q2-4",
        question: "Which of the following sentences is correctly written in passive voice?",
        options: [
          "The Mona Lisa was painted by Leonardo da Vinci.",
          "Leonardo da Vinci was painted the Mona Lisa.",
          "The Mona Lisa painted Leonardo da Vinci.",
          "The Mona Lisa is been painted by Leonardo da Vinci."
        ],
        correctIndex: 0,
        explanation: "'The Mona Lisa was painted by Leonardo da Vinci' follows correct 'was + V3 + by agent' syntax."
      },
      {
        id: "q2-5",
        question: "While the students were eating lunch, the chemistry experiment ______ by the laboratory staff.",
        options: ["was being cleaned", "is cleaned", "cleaned", "was cleaning"],
        correctIndex: 0,
        explanation: "Continuous action in the past ('While students were eating...') in passive voice requires 'was being cleaned'."
      }
    ]
  },
  {
    id: "unit-3",
    level: 3,
    title: "Conditionals: 1st, 2nd, & 3rd",
    subtitle: "Navigate real possibilities, hypothetical fantasies, and past regrets",
    category: "Logic & Modality",
    icon: "🔀",
    badge: "Multiverse Oracle",
    xpReward: 360,
    formula: "1st: If + Present, will + V1 | 2nd: If + Past, would + V1 | 3rd: If + Past Perfect, would have + V3",
    deepExplanation: `
      Conditionals describe cause-and-effect relationships across degrees of probability and reality.

      <h3>The 3 Core Conditional Realms</h3>
      <table class="matrix-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>If-Clause</th>
            <th>Main Clause</th>
            <th>Meaning & Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>First (Real / Possible)</strong></td>
            <td>If + Simple Present</td>
            <td>S + will / can + V1</td>
            <td>Realistic future possibilities and probable outcomes.</td>
          </tr>
          <tr>
            <td><strong>Second (Unreal Present)</strong></td>
            <td>If + Simple Past (were)</td>
            <td>S + would / could + V1</td>
            <td>Imaginary, hypothetical present scenarios; daydreaming.</td>
          </tr>
          <tr>
            <td><strong>Third (Unreal Past)</strong></td>
            <td>If + Past Perfect (had + V3)</td>
            <td>S + would have + V3</td>
            <td>Past regrets, alternative historical outcomes that never happened.</td>
          </tr>
        </tbody>
      </table>

      <h3>Pro Tips & Quirks</h3>
      <ul>
        <li>In the 2nd Conditional, formal English prefers <strong>were</strong> for all subjects: <em>If I were you...</em> or <em>If she were here today...</em> (the subjunctive mood).</li>
        <li>Never put <strong>will</strong> or <strong>would</strong> inside the <em>if</em>-clause itself! (❌ <em>If I will study...</em> ➔ ✔️ <em>If I study...</em>).</li>
      </ul>
    `,
    contexts: {
      movie: {
        title: "Avengers: Endgame (2019)",
        quote: "\"If we don't do this, millions will suffer (1st). If we had another way, I wouldn't have asked you (2nd). If Tony had listened, none of this would have happened (3rd).\"",
        breakdown: "Doctor Strange views 14,000,605 conditional branches of reality. The climax hinges on 3rd conditionals: lamenting how past choices could have reshaped destiny."
      },
      music: {
        title: "Beyoncé - \"If I Were a Boy\" & Gloria Gaynor - \"I Will Survive\"",
        quote: "\"If I were a boy, I think I could understand how it feels to love a girl...\" (2nd Conditional - imagination/empathy).",
        breakdown: "Beyoncé uses the subjunctive *\"were\"* throughout the song to construct an alternate identity and examine emotional double standards."
      },
      book: {
        title: "Robert Frost - \"The Road Not Taken\"",
        quote: "\"Two roads diverged in a yellow wood... And that has made all the difference.\"",
        breakdown: "While Frost implies conditional thoughts, literature thrives on 3rd conditional thinking: *\"If I had taken the other road, what would my life have become?\"*"
      }
    },
    practiceQuestions: [
      {
        id: "q3-1",
        question: "If our team ______ the regional debate competition next Friday, we will advance to the nationals.",
        options: ["wins", "won", "had won", "will win"],
        correctIndex: 0,
        explanation: "1st conditional if-clause takes simple present ('wins') to match future result ('will advance')."
      },
      {
        id: "q3-2",
        question: "If I ______ a billion dollars right now, I would build an eco-friendly sanctuary in the mountains.",
        options: ["had", "have", "would have", "had had"],
        correctIndex: 0,
        explanation: "2nd conditional expresses an imaginary present wish using simple past ('had')."
      },
      {
        id: "q3-3",
        question: "If the captain ______ the lighthouse warning signals, the ship would not have crashed into the reef.",
        options: ["had noticed", "noticed", "notices", "would notice"],
        correctIndex: 0,
        explanation: "3rd conditional requires 'had + V3' (had noticed) to match past result ('would not have crashed')."
      },
      {
        id: "q3-4",
        question: "If she were the student council president, she ______ new after-school coding clubs.",
        options: ["would introduce", "will introduce", "would have introduced", "introduces"],
        correctIndex: 0,
        explanation: "2nd conditional main clause takes 'would + V1' (would introduce) when paired with 'were'."
      },
      {
        id: "q3-5",
        question: "Identify the incorrect sentence:",
        options: [
          "If it will rain tomorrow, we will cancel the picnic.",
          "If you freeze water, it becomes ice.",
          "If they had trained harder, they would have won the championship.",
          "If I were taller, I would play professional basketball."
        ],
        correctIndex: 0,
        explanation: "Option A is incorrect because 'will' must never be placed inside the 'if' conditional clause."
      }
    ]
  },
  {
    id: "unit-4",
    level: 4,
    title: "Time Conjunctions",
    subtitle: "Choreograph the sequence and flow of complex narrative events",
    category: "Text Cohesion",
    icon: "⏳",
    badge: "Chronos Weaver",
    xpReward: 300,
    formula: "Conjunctions: while, when, as soon as, until, before, after, since, whenever",
    deepExplanation: `
      Time conjunctions link clauses to show chronological order, simultaneous events, or causal milestones.

      <h3>The Essential Time Conjunction Arsenal</h3>
      <ul>
        <li><strong>When:</strong> Used for short, instantaneous events that interrupt or pinpoint moments. <br><em>Example: When the phone rang, I dropped the glass.</em></li>
        <li><strong>While / As:</strong> Used for continuous, ongoing background activities over a duration. <br><em>Example: While we were hiking through the forest, it started to hail.</em></li>
        <li><strong>As soon as:</strong> Indicates an immediate sequence (zero time lag). <br><em>Example: As soon as the teacher entered, the class became silent.</em></li>
        <li><strong>Until / Till:</strong> Marks the endpoint or cutoff time of an ongoing state. <br><em>Example: We stayed in the shelter until the thunderstorm passed.</em></li>
        <li><strong>Since:</strong> Marks the starting point of an action that continues to the present. <br><em>Example: She has practiced violin every day since she was seven.</em></li>
      </ul>

      <h3>The Golden Future Rule</h3>
      <p>In time clauses referring to the future, <strong>never use future tense</strong>! Always use the <strong>Simple Present</strong>.</p>
      <p>✔️ <em>I will call you as soon as I <strong>arrive</strong> at the airport.</em> (NOT: ❌ <em>as soon as I will arrive</em>).</p>
    `,
    contexts: {
      movie: {
        title: "Harry Potter and the Prisoner of Azkaban",
        quote: "\"Before you turn the Time-Turner, ensure no one sees you. As soon as you hear the clock strike three, run!\"",
        breakdown: "Hermione's time travel instructions are entirely anchored in precise time conjunctions to prevent paradoxes."
      },
      music: {
        title: "Green Day - \"Wake Me Up When September Ends\"",
        quote: "\"Summer has come and passed... Wake me up when September ends.\"",
        breakdown: "Billie Joe Armstrong uses *when* as an emotional threshold marker, transitioning between grief and hope."
      },
      book: {
        title: "The Chronicles of Narnia by C.S. Lewis",
        quote: "\"As soon as Lucy stepped through the wardrobe, cold fir needles brushed against her face until she reached the snowy lamppost.\"",
        breakdown: "C.S. Lewis builds immersive sensory transitions by chaining conjunctions from sudden discovery (*as soon as*) to arrival (*until*)."
      }
    },
    practiceQuestions: [
      {
        id: "q4-1",
        question: "I will send you the science laboratory report as soon as I ______ home tonight.",
        options: ["get", "will get", "got", "am getting"],
        correctIndex: 0,
        explanation: "Time clauses starting with 'as soon as' referring to future actions use simple present ('get')."
      },
      {
        id: "q4-2",
        question: "______ we were walking along the beach, we spotted dolphins leaping in the distance.",
        options: ["While", "Until", "Before", "Unless"],
        correctIndex: 0,
        explanation: "'While' introduces continuous duration ('were walking') during which another event occurred."
      },
      {
        id: "q4-3",
        question: "Please remain seated in the aircraft ______ the captain has turned off the seatbelt sign.",
        options: ["until", "since", "while", "as soon as"],
        correctIndex: 0,
        explanation: "'Until' indicates the condition/time up to which the action ('remain seated') must continue."
      },
      {
        id: "q4-4",
        question: "Mr. Henderson has been teaching robotics at our academy ______ 2018.",
        options: ["since", "for", "during", "until"],
        correctIndex: 0,
        explanation: "'Since' is used with specific starting points in time (2018) paired with Present Perfect."
      },
      {
        id: "q4-5",
        question: "The power went out ______ she was saving her design project on the computer.",
        options: ["just as", "until", "before", "since"],
        correctIndex: 0,
        explanation: "'Just as' expresses precise simultaneity of an interruption during an ongoing action."
      }
    ]
  },
  {
    id: "unit-5",
    level: 5,
    title: "Relative Clauses & Pronouns",
    subtitle: "Combine sentences with precision using Who, Which, That, Whose, and Where",
    category: "Sentence Architecture",
    icon: "🔗",
    badge: "Syntax Sculptor",
    xpReward: 340,
    formula: "Relative Pronouns: Who (people), Which (things), That (both, defining), Whose (possession), Where (places), When (times)",
    deepExplanation: `
      Relative clauses give extra information about a noun without having to start a completely new sentence.

      <h3>Defining vs. Non-Defining Clauses</h3>
      <table class="matrix-table">
        <thead>
          <tr>
            <th>Feature</th>
            <th>Defining (Essential)</th>
            <th>Non-Defining (Extra Info)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Punctuation</strong></td>
            <td>No commas!</td>
            <td>Separated by commas ( , ... , )</td>
          </tr>
          <tr>
            <td><strong>Meaning</strong></td>
            <td>Identifies which specific item is meant.</td>
            <td>Adds interesting trivia; sentence still works without it.</td>
          </tr>
          <tr>
            <td><strong>Use of 'That'</strong></td>
            <td>✔️ Allowed and very common.</td>
            <td>❌ NEVER use 'that' after a comma! Use *which* or *who*.</td>
          </tr>
          <tr>
            <td><strong>Example</strong></td>
            <td><em>The student <strong>who scored 100</strong> won the medal.</em></td>
            <td><em>Albert Einstein, <strong>who developed relativity</strong>, loved music.</em></td>
          </tr>
        </tbody>
      </table>

      <h3>Tricky Pronoun: Whose</h3>
      <p><strong>Whose</strong> indicates possession and replaces *his, her, their, its*.</p>
      <p><em>I met a programmer. <strong>Her</strong> game became a viral hit.</em> ➔ <em>I met a programmer <strong>whose</strong> game became a viral hit.</em></p>
    `,
    contexts: {
      movie: {
        title: "Spider-Man: Into the Spider-Verse",
        quote: "\"Miles Morales is a teenager who was bitten by a radioactive spider, whose destiny was rewritten in a multiverse of heroes.\"",
        breakdown: "Superhero origins rely on relative clauses to fuse identity (*who was bitten*) with tragic destiny (*whose uncle taught him responsibility*)."
      },
      music: {
        title: "The Beatles - \"Eleanor Rigby\" & Justin Bieber - \"Ghost\"",
        quote: "\"Eleanor Rigby, who died in the church and was buried along with her name...\" (Non-defining relative clause detailing her poignant isolation).",
        breakdown: "Paul McCartney creates vivid character sketches in a few lines by attaching non-defining relative clauses to everyday names."
      },
      book: {
        title: "The Lord of the Rings by J.R.R. Tolkien",
        quote: "\"One Ring to rule them all, One Ring to find them, One Ring to bring them all, and in the darkness bind them, in the Land of Mordor where the Shadows lie.\"",
        breakdown: "Tolkien uses relative place clauses (*where the Shadows lie*) to lend ancient mythic resonance to fantasy geographies."
      }
    },
    practiceQuestions: [
      {
        id: "q5-1",
        question: "The young aerospace engineer ______ designed the Mars rover landing gear graduated from our school.",
        options: ["who", "which", "whose", "where"],
        correctIndex: 0,
        explanation: "'Who' is the subject relative pronoun referring to people ('aerospace engineer')."
      },
      {
        id: "q5-2",
        question: "Mount Everest, ______ is the highest peak above sea level, attracts hundreds of climbers each spring.",
        options: ["which", "that", "where", "what"],
        correctIndex: 0,
        explanation: "Non-defining clause with commas cannot use 'that'; 'which' is required for things."
      },
      {
        id: "q5-3",
        question: "We recently visited the observatory ______ Galileo observed Jupiter's four largest moons.",
        options: ["where", "which", "that", "when"],
        correctIndex: 0,
        explanation: "'Where' refers to a place in which an action occurred ('at the observatory')."
      },
      {
        id: "q5-4",
        question: "The author ______ latest fantasy novel won the national book award will give a guest lecture tomorrow.",
        options: ["whose", "who", "whom", "which"],
        correctIndex: 0,
        explanation: "'Whose' indicates possession ('the author's latest fantasy novel')."
      },
      {
        id: "q5-5",
        question: "The laptop ______ I bought for coding competitions has an ultra-fast processor.",
        options: ["that", "whom", "where", "whose"],
        correctIndex: 0,
        explanation: "Defining relative clause referring to an object takes 'that' or 'which'."
      }
    ]
  },
  {
    id: "unit-6",
    level: 6,
    title: "Permission, Habits, & Invitations",
    subtitle: "Social diplomacy: used to, would, be used to, may, could, and polite requests",
    category: "Social Interaction",
    icon: "🤝",
    badge: "Diplomatic Envoy",
    xpReward: 310,
    formula: "Habits: used to + V1 | be used to + V-ing. Requests: Could/May/Would you mind + V-ing?",
    deepExplanation: `
      English uses specialized auxiliary verbs and idioms to express manners, social boundaries, and habitual routines.

      <h3>The Big Habit Confusion: Used to vs. Be Used to</h3>
      <table class="matrix-table">
        <thead>
          <tr>
            <th>Structure</th>
            <th>Meaning</th>
            <th>Formula</th>
            <th>Example</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Used to + V1</strong></td>
            <td>Past habit or past state that is NO LONGER true today.</td>
            <td>Subject + used to + bare infinitive</td>
            <td><em>I <strong>used to play</strong> chess every afternoon. (Now I don't).</em></td>
          </tr>
          <tr>
            <td><strong>Be used to + V-ing</strong></td>
            <td>Accustomed to; comfortable with something because of familiarity.</td>
            <td>Subject + be + used to + noun / V-ing</td>
            <td><em>He <strong>is used to waking</strong> up at 5 AM. (It feels normal).</em></td>
          </tr>
          <tr>
            <td><strong>Get used to + V-ing</strong></td>
            <td>The process of becoming accustomed over time.</td>
            <td>Subject + get + used to + noun / V-ing</td>
            <td><em>You will soon <strong>get used to wearing</strong> braces.</em></td>
          </tr>
        </tbody>
      </table>

      <h3>Politeness & Diplomacy Scale</h3>
      <ul>
        <li><em>Direct / Casual:</em> Can I borrow your calculator?</li>
        <li><em>Polite:</em> Could I borrow your calculator, please?</li>
        <li><em>Formal & Professional:</em> May I borrow your calculator?</li>
        <li><em>Maximum Etiquette:</em> <strong>Would you mind if I borrowed</strong> your calculator? / <strong>Would you mind lending</strong> me your calculator?</li>
      </ul>
    `,
    contexts: {
      movie: {
        title: "The King's Speech (2010)",
        quote: "\"May I sit down?\" — \"If you please.\" — \"Would you mind reading this passage aloud without stopping?\"",
        breakdown: "British period films showcase the nuances of high diplomacy where tone and modal verbs signal authority, respect, and emotional trust."
      },
      music: {
        title: "Gotye - \"Somebody That I Used to Know\"",
        quote: "\"Now and then I think of when we were together... But you didn't have to cut me off, make out like it never happened and that we were nothing... Now you're just somebody that I used to know.\"",
        breakdown: "The worldwide hit centers entirely on the emotional finality of *used to know* — someone who once held intimate significance is now completely in the past."
      },
      book: {
        title: "Pride and Prejudice by Jane Austen",
        quote: "\"May I have the honor of your hand for the next two dances, Miss Elizabeth?\" — \"You would do me a great kindness if you allowed me to decline.\"",
        breakdown: "Austen's characters navigate social tensions purely through polite requests, passive refusals, and modal subtleties."
      }
    },
    practiceQuestions: [
      {
        id: "q6-1",
        question: "When I was in primary school, I ______ collect rare postage stamps, but now I prefer coding games.",
        options: ["used to", "am used to", "use to", "get used to"],
        correctIndex: 0,
        explanation: "A past habit that is no longer practiced takes 'used to + bare infinitive'."
      },
      {
        id: "q6-2",
        question: "Although the Tokyo subway system was confusing at first, Maya ______ taking the train every morning.",
        options: ["is now used to", "used to", "use to", "is used"],
        correctIndex: 0,
        explanation: "'Is used to + V-ing' means she has become accustomed to the routine."
      },
      {
        id: "q6-3",
        question: "Would you mind ______ the window? The wind is blowing the exam papers away.",
        options: ["closing", "close", "to close", "closed"],
        correctIndex: 0,
        explanation: "'Would you mind' is strictly followed by a gerund (V-ing)."
      },
      {
        id: "q6-4",
        question: "\"______ I submit my history assignment on Monday morning, Professor?\" (Choose the most polite/formal option)",
        options: ["May", "Can", "Will", "Must"],
        correctIndex: 0,
        explanation: "'May' is the most formal and respectful modal for asking permission in academic contexts."
      },
      {
        id: "q6-5",
        question: "How would you politely invite a classmate to your birthday party?",
        options: [
          "Would you like to come to my birthday celebration this Saturday?",
          "You must come to my party now.",
          "Are you coming or what?",
          "You have to be at my party."
        ],
        correctIndex: 0,
        explanation: "'Would you like to + V1' is the gold standard for polite social invitations."
      }
    ]
  },
  {
    id: "unit-7",
    level: 7,
    title: "Reported Speech: Questions & Commands",
    subtitle: "Convert direct dialogues into backshifted narrative reports",
    category: "Narrative Voice",
    icon: "💬",
    badge: "Master Herald",
    xpReward: 350,
    formula: "Statements: S + said (that) ... | Questions: S + asked if/wh- ... | Imperatives: S + told/ordered + Obj + to-V1",
    deepExplanation: `
      Reported speech conveys what someone said without quoting their exact words. This requires shifting tenses backward (backshifting), adjusting pronouns, and changing time/place markers.

      <h3>The Backshifting Rule Table</h3>
      <ul>
        <li><strong>Simple Present (V1)</strong> ➔ <strong>Simple Past (V2)</strong></li>
        <li><strong>Present Continuous (is/am/are)</strong> ➔ <strong>Past Continuous (was/were)</strong></li>
        <li><strong>Simple Past (V2) & Present Perfect (have/has + V3)</strong> ➔ <strong>Past Perfect (had + V3)</strong></li>
        <li><strong>Will / Can</strong> ➔ <strong>Would / Could</strong></li>
      </ul>

      <h3>Reporting Questions</h3>
      <p>Questions in reported speech <strong>lose their question word order</strong> and do not use <em>do/does/did</em>. They become normal affirmative statements!</p>
      <ul>
        <li><strong>Yes/No Question:</strong> <em>\"Are you ready?\"</em> ➔ He asked me <strong>if / whether I was ready</strong>. (NOT: ❌ <em>if was I ready</em>).</li>
        <li><strong>Wh- Question:</strong> <em>\"Where do you live?\"</em> ➔ She asked me <strong>where I lived</strong>. (NOT: ❌ <em>where did I live</em>).</li>
      </ul>

      <h3>Reporting Imperatives (Commands & Requests)</h3>
      <p>Use <strong>to + V1</strong> for positive commands and <strong>not to + V1</strong> for negative commands.</p>
      <p><em>\"Don't touch the chemical beaker!\"</em> ➔ The teacher ordered us <strong>not to touch</strong> the chemical beaker.</p>
    `,
    contexts: {
      movie: {
        title: "Sherlock Holmes (2009)",
        quote: "\"Dr. Watson reported that Holmes had warned the inspector not to disturb the crime scene evidence.\"",
        breakdown: "Detective stories rely on reported speech during interrogations: *\"The suspect claimed that he had been sleeping when the clock struck midnight.\"*"
      },
      music: {
        title: "Olivia Rodrigo - \"deja vu\"",
        quote: "\"Do you call her, almost say my name? 'Cause let's be honest, we kinda did it first... She said that she loved you, but does she know the truth?\"",
        breakdown: "Pop heartbreak anthems frequently invoke reported speech (*\"You told me that I was the only one\"*) to contrast past promises with current reality."
      },
      book: {
        title: "To Kill a Mockingbird by Harper Lee",
        quote: "\"Atticus asked Mayella if she remembered what had happened on the night of November twenty-first.\"",
        breakdown: "Courtroom cross-examinations in classic literature are masterclasses in converting rapid-fire direct questions into formal reported records."
      }
    },
    practiceQuestions: [
      {
        id: "q7-1",
        question: "Direct: \"I am preparing the slides for the assembly,\" Sarah said.<br>Reported: Sarah said that she ______ the slides for the assembly.",
        options: ["was preparing", "is preparing", "has prepared", "had prepared"],
        correctIndex: 0,
        explanation: "Present continuous ('am preparing') backshifts into past continuous ('was preparing')."
      },
      {
        id: "q7-2",
        question: "Direct: \"Did you complete the physics assignment?\" Liam asked me.<br>Reported: Liam asked me ______ the physics assignment.",
        options: [
          "if I had completed",
          "did I complete",
          "if did I complete",
          "whether have I completed"
        ],
        correctIndex: 0,
        explanation: "Yes/No past question converts into 'if + subject + past perfect' with normal statement word order."
      },
      {
        id: "q7-3",
        question: "Direct: \"Don't open your exam booklets yet,\" the proctor announced.<br>Reported: The proctor instructed the students ______ their exam booklets yet.",
        options: ["not to open", "to not open", "don't open", "should not open"],
        correctIndex: 0,
        explanation: "Negative imperative in reported speech takes 'not to + V1' (not to open)."
      },
      {
        id: "q7-4",
        question: "Direct: \"Where will the tournament take place?\" the coach asked.<br>Reported: The coach inquired where the tournament ______ take place.",
        options: ["would", "will", "can", "is going to"],
        correctIndex: 0,
        explanation: "'Will' backshifts into 'would', keeping affirmative word order ('the tournament would')."
      },
      {
        id: "q7-5",
        question: "Direct: \"I have never seen such an incredible solar eclipse,\" David remarked.<br>Reported: David remarked that he ______ such an incredible solar eclipse.",
        options: ["had never seen", "has never seen", "was never seeing", "never saw"],
        correctIndex: 0,
        explanation: "Present perfect ('have never seen') backshifts into past perfect ('had never seen')."
      }
    ]
  },
  {
    id: "unit-8",
    level: 8,
    title: "Modals of Deduction",
    subtitle: "Estimate probability and solve mysteries: Must, Cant, Might, and Could",
    category: "Probability & Logic",
    icon: "🔍",
    badge: "Master Inquisitor",
    xpReward: 330,
    formula: "Present: Must / Can't / Might + V1 | Past: Must have / Can't have / Might have + V3",
    deepExplanation: `
      Modals of deduction express how certain you are about a situation based on available clues.

      <h3>Degrees of Certainty</h3>
      <table class="matrix-table">
        <thead>
          <tr>
            <th>Modal</th>
            <th>Certainty Level</th>
            <th>Meaning & Deduction</th>
            <th>Present Example</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Must</strong></td>
            <td>95% Sure (Positive)</td>
            <td>Logic tells you it is practically certain.</td>
            <td><em>His lights are on; he <strong>must be</strong> home.</em></td>
          </tr>
          <tr>
            <td><strong>Can't</strong></td>
            <td>99% Sure (Negative)</td>
            <td>Logic tells you it is completely impossible.</td>
            <td><em>She <strong>can't be</strong> in Paris; I just saw her in the library!</em></td>
          </tr>
          <tr>
            <td><strong>Might / Could / May</strong></td>
            <td>50% Possibility</td>
            <td>It is possible, but you are not sure.</td>
            <td><em>Take an umbrella; it <strong>might rain</strong> later.</em></td>
          </tr>
        </tbody>
      </table>

      <h3>Past Deductions (Modals + Perfect Infinitive)</h3>
      <p>When deducing past mysteries, attach <strong>have + V3</strong>:</p>
      <ul>
        <li><em>Look at the broken glass and missing laptop. The burglars <strong>must have broken</strong> in through the terrace.</em></li>
        <li><em>He <strong>can't have stolen</strong> the car; he was live on television at that exact moment.</em></li>
        <li><em>Where is your backpack? I <strong>might have left</strong> it in the science laboratory.</em></li>
      </ul>
    `,
    contexts: {
      movie: {
        title: "Knives Out (2019) & Glass Onion",
        quote: "\"He can't have committed suicide; the angle of the wound proves someone else must have held the blade.\"",
        breakdown: "Detective Benoit Blanc's entire deductive monologue is constructed around modals of deduction evaluating contradictory evidence."
      },
      music: {
        title: "Roxette - \"It Must Have Been Love\"",
        quote: "\"It must have been love, but it's over now. It must have been good, but I lost it somehow.\"",
        breakdown: "The lyrics use past deduction (*\"must have been\"*) looking back through memories to make sense of a vanished romance."
      },
      book: {
        title: "The Hound of the Baskervilles by Arthur Conan Doyle",
        quote: "\"The owner of this walking stick must be an elderly country practitioner who walks a great deal, for the iron ferrule is worn down entirely.\"",
        breakdown: "Sherlock Holmes deduces a client's biography by examining physical wear and applying rigorous 'must be' logic."
      }
    },
    practiceQuestions: [
      {
        id: "q8-1",
        question: "The streets are completely soaked and puddles are everywhere. It ______ heavily last night.",
        options: ["must have rained", "can't have rained", "might rain", "must rain"],
        correctIndex: 0,
        explanation: "Strong positive evidence about a past event ('streets are soaked') requires 'must have + V3'."
      },
      {
        id: "q8-2",
        question: "Alex ______ at the library right now; I just saw him boarding a flight to London twenty minutes ago!",
        options: ["can't be", "must be", "might be", "could be"],
        correctIndex: 0,
        explanation: "Impossibility in the present requires 'can't be'."
      },
      {
        id: "q8-3",
        question: "I can't find my locker key anywhere. I ______ it inside the gym bag.",
        options: ["might have dropped", "must drop", "can't have dropped", "would drop"],
        correctIndex: 0,
        explanation: "A 50/50 possible past action uses 'might have + V3'."
      },
      {
        id: "q8-4",
        question: "The scientist won the Nobel Prize twice. She ______ exceptionally brilliant in her field.",
        options: ["must be", "can't be", "might not be", "shouldn't be"],
        correctIndex: 0,
        explanation: "Winning two Nobel prizes provides logical certainty in the present: 'must be'."
      },
      {
        id: "q8-5",
        question: "The ancient temple was built with 50-ton stones. The ancient builders ______ advanced lever mechanisms.",
        options: ["must have utilized", "can't have utilized", "should utilize", "might utilize"],
        correctIndex: 0,
        explanation: "Deducing how 50-ton stones were lifted in antiquity demands past deduction: 'must have utilized'."
      }
    ]
  },
  {
    id: "unit-9",
    level: 9,
    title: "Money & Jobs Vocabulary",
    subtitle: "Navigate financial literacy, professions, career paths, and economic idioms",
    category: "Real-World Lexis",
    icon: "💼",
    badge: "Global Tycoon",
    xpReward: 290,
    formula: "Collocations: earn a salary | pay in installments | invest in | budget for | make a living",
    deepExplanation: `
      Mastering financial and workplace vocabulary prepares students for global communication, economics, and professional dialogue.

      <h3>Key Financial Distinctions</h3>
      <ul>
        <li><strong>Salary vs. Wage:</strong> A <em>salary</em> is fixed compensation paid monthly/annually (office professionals), while a <em>wage</em> is calculated hourly or weekly (trades, shifts).</li>
        <li><strong>Borrow vs. Lend:</strong> You <em>borrow</em> FROM someone (take in); someone <em>lends</em> TO you (give out). <br><em>Example: Can I borrow $10? / Yes, I will lend you $10.</em></li>
        <li><strong>Afford:</strong> Having enough money or time to do something (usually preceded by can/can't). <br><em>Example: We can't afford to rent an office downtown yet.</em></li>
        <li><strong>Cost an arm and a leg:</strong> Idiom meaning something is exorbitantly expensive.</li>
        <li><strong>Make ends meet:</strong> Idiom meaning to have just enough money to pay for basic necessities.</li>
      </ul>

      <h3>Modern Career & Workplace Terminology</h3>
      <ul>
        <li><strong>Freelancer / Gig Economy:</strong> Working independently for multiple clients rather than a single full-time employer.</li>
        <li><strong>Entrepreneur:</strong> An individual who creates and scales a new venture while accepting financial risk.</li>
        <li><strong>Internship:</strong> Practical workplace training for students or recent graduates to acquire industry exposure.</li>
      </ul>
    `,
    contexts: {
      movie: {
        title: "The Pursuit of Happyness (2006)",
        quote: "\"Chris Gardner worked as an unpaid intern at a stock brokerage, struggling to make ends meet while striving for a full-time salaried position.\"",
        breakdown: "Will Smith's character embodies financial grit, moving from commission-based debt to landing an elite finance career."
      },
      music: {
        title: "ABBA - \"Money, Money, Money\" & Travie McCoy - \"Billionaire\"",
        quote: "\"I work all night, I work all day to pay the bills I have to pay... In my dreams I have a plan, if I got me a wealthy man...\"",
        breakdown: "Pop songs reflect economic realities: from working overtime to cover bills, to imagining how wealth could fund philanthropic foundations."
      },
      book: {
        title: "Rich Dad Poor Dad by Robert Kiyosaki",
        quote: "\"The poor and the middle class work for money. The rich have money work for them.\"",
        breakdown: "Kiyosaki uses economic vocabulary to contrast liabilities with productive assets and passive investments."
      }
    },
    practiceQuestions: [
      {
        id: "q9-1",
        question: "Could you please ______ me twenty dollars until Friday? I forgot my wallet at home.",
        options: ["lend", "borrow", "invest", "afford"],
        correctIndex: 0,
        explanation: "'Lend' means to give temporarily to someone else; 'borrow' means to take."
      },
      {
        id: "q9-2",
        question: "After working hard for five years as a junior developer, Sophia received a major promotion and a substantial ______ increase.",
        options: ["salary", "debt", "fee", "fare"],
        correctIndex: 0,
        explanation: "Professional monthly/annual compensation is referred to as a 'salary'."
      },
      {
        id: "q9-3",
        question: "Buying that ultra-rare vintage sports car must have cost ______.",
        options: ["an arm and a leg", "a penny for your thoughts", "the extra mile", "two birds with one stone"],
        correctIndex: 0,
        explanation: "'Cost an arm and a leg' is the recognized English idiom meaning extremely expensive."
      },
      {
        id: "q9-4",
        question: "An individual who founds and manages their own startup company while bearing financial risk is called an ______.",
        options: ["entrepreneur", "employee", "intern", "apprentice"],
        correctIndex: 0,
        explanation: "An 'entrepreneur' is a person who starts and runs a business undertaking financial risk."
      },
      {
        id: "q9-5",
        question: "During high inflation, families often struggle to ______ each month.",
        options: ["make ends meet", "break the ice", "spill the beans", "hit the books"],
        correctIndex: 0,
        explanation: "'Make ends meet' means to earn just enough money to pay for essential living expenses."
      }
    ]
  },
  {
    id: "unit-10",
    level: 10,
    title: "Verbs Followed by Gerund or Infinitive",
    subtitle: "Crack the code of verb patterns: enjoy reading vs. hope to learn vs. verbs that shift meaning",
    category: "Syntactic Complements",
    icon: "🎭",
    badge: "Dual Catalyst",
    xpReward: 340,
    formula: "Verb + Gerund (V-ing) | Verb + Infinitive (to + V1) | Meaning Shifters: stop, remember, forget, try",
    deepExplanation: `
      In English, when one verb follows another, the second verb must take either the gerund (-ing) form or the infinitive (to + verb).

      <h3>1. Verbs Followed Strictly by Gerund (-ing)</h3>
      <p><em>enjoy, avoid, consider, mind, finish, practice, suggest, imagine, admit, miss</em></p>
      <p>✔️ <em>I <strong>enjoy coding</strong> late at night.</em> (NOT: ❌ <em>enjoy to code</em>).</p>

      <h3>2. Verbs Followed Strictly by Infinitive (to + V1)</h3>
      <p><em>decide, hope, plan, refuse, promise, agree, afford, manage, offer, expect</em></p>
      <p>✔️ <em>We <strong>decided to launch</strong> the space balloon.</em> (NOT: ❌ <em>decided launching</em>).</p>

      <h3>3. The Dangerous Meaning Shifters</h3>
      <table class="matrix-table">
        <thead>
          <tr>
            <th>Verb</th>
            <th>With Gerund (-ing)</th>
            <th>With Infinitive (to + V1)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Remember</strong></td>
            <td>Recall a past memory: <br><em>I remember locking the door.</em></td>
            <td>Don't forget a future duty: <br><em>Remember to lock the door!</em></td>
          </tr>
          <tr>
            <td><strong>Stop</strong></td>
            <td>Quit doing an action permanently/ongoing: <br><em>He stopped smoking.</em></td>
            <td>Pause an action IN ORDER TO do something else: <br><em>He stopped to tie his shoe.</em></td>
          </tr>
          <tr>
            <td><strong>Try</strong></td>
            <td>Experiment with a method to see if it works: <br><em>Try restarting your router.</em></td>
            <td>Make a strenuous effort against difficulty: <br><em>Try to lift this heavy boulder.</em></td>
          </tr>
        </tbody>
      </table>
    `,
    contexts: {
      movie: {
        title: "Inception (2010)",
        quote: "\"Do you remember how you got here? Think. You never remember the beginning of a dream, do you?\"",
        breakdown: "Cobb tests reality by asking characters if they remember *getting* somewhere (gerund for accessing episodic memory)."
      },
      music: {
        title: "Journey - \"Don't Stop Believin'\"",
        quote: "\"Don't stop believin', hold on to that feelin'...\"",
        breakdown: "The rock anthem uses *stop + gerund* to urge listeners never to cease their ongoing act of belief."
      },
      book: {
        title: "Alice's Adventures in Wonderland by Lewis Carroll",
        quote: "\"Alice tried to open the tiny golden door, but she had forgotten to pick up the key from the glass table.\"",
        breakdown: "Carroll highlights Alice's comedic frustrations using *tried to open* (effort) and *forgotten to pick up* (omitted duty)."
      }
    },
    practiceQuestions: [
      {
        id: "q10-1",
        question: "My brother avoids ______ sugary energy drinks before going to bed.",
        options: ["drinking", "to drink", "drink", "drank"],
        correctIndex: 0,
        explanation: "'Avoid' is always followed by a gerund ('drinking')."
      },
      {
        id: "q10-2",
        question: "After months of negotiations, both school councils agreed ______ a joint campus sports tournament.",
        options: ["to organize", "organizing", "organize", "organized"],
        correctIndex: 0,
        explanation: "'Agree' is always followed by an infinitive ('to organize')."
      },
      {
        id: "q10-3",
        question: "On our road trip through the Alps, we stopped ______ photographs of the sun rising over the peaks.",
        options: ["to take", "taking", "take", "took"],
        correctIndex: 0,
        explanation: "'Stopped to take' means paused their journey in order to take photos."
      },
      {
        id: "q10-4",
        question: "Please remember ______ off the Bunsen burner before leaving the science laboratory.",
        options: ["to turn", "turning", "turn", "turned"],
        correctIndex: 0,
        explanation: "'Remember to turn' denotes remembering an upcoming obligation/duty."
      },
      {
        id: "q10-5",
        question: "If your laptop screen stays blank, try ______ the power button for ten seconds.",
        options: ["holding", "to hold", "hold", "held"],
        correctIndex: 0,
        explanation: "'Try + gerund' means to experiment with a method to solve a problem."
      }
    ]
  },
  {
    id: "unit-11",
    level: 11,
    title: "Extreme Adjectives & Modifiers",
    subtitle: "Elevate your vocabulary beyond \"very\": freezing, boiling, furious, spotless, and absolute intensifiers",
    category: "Stylistic Sophistication",
    icon: "🌋",
    badge: "Lexical Virtuoso",
    xpReward: 310,
    formula: "Gradable (very/fairly + good/cold) VS Extreme/Non-gradable (absolutely/completely + freezing/furious)",
    deepExplanation: `
      In academic writing and expressive storytelling, replacing weak combinations like *\"very tired\"* with extreme adjectives like *\"exhausted\"* instantly elevates your score.

      <h3>The Absolute Rule of Modifiers</h3>
      <ul>
        <li><strong>Gradable Adjectives:</strong> Can exist in varying degrees (a little, somewhat, very, extremely). <br><em>cold, hot, tired, angry, small, dirty, happy</em></li>
        <li><strong>Extreme (Non-gradable) Adjectives:</strong> Already carry the meaning of \"very\" inside themselves! They CANNOT take \"very\". <br>❌ <em>very freezing</em> ➔ ✔️ <strong>absolutely freezing</strong><br>❌ <em>very furious</em> ➔ ✔️ <strong>completely furious</strong></li>
      </ul>

      <h3>Master Vocabulary Upgrade List</h3>
      <table class="matrix-table">
        <thead>
          <tr>
            <th>Basic (Gradable)</th>
            <th>Extreme (Non-gradable)</th>
            <th>Compatible Modifiers</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>very cold</td>
            <td><strong>freezing</strong></td>
            <td>absolutely, completely</td>
          </tr>
          <tr>
            <td>very hot</td>
            <td><strong>boiling / scorching</strong></td>
            <td>absolutely, positively</td>
          </tr>
          <tr>
            <td>very tired</td>
            <td><strong>exhausted</strong></td>
            <td>totally, utterly</td>
          </tr>
          <tr>
            <td>very angry</td>
            <td><strong>furious</strong></td>
            <td>absolutely, utterly</td>
          </tr>
          <tr>
            <td>very clean</td>
            <td><strong>spotless</strong></td>
            <td>completely, immaculate</td>
          </tr>
          <tr>
            <td>very big</td>
            <td><strong>colossal / gigantic</strong></td>
            <td>absolutely, truly</td>
          </tr>
          <tr>
            <td>very hungry</td>
            <td><strong>starving / famished</strong></td>
            <td>literally, absolutely</td>
          </tr>
        </tbody>
      </table>
    `,
    contexts: {
      movie: {
        title: "Interstellar (2014)",
        quote: "\"Dr. Mann's planet is freezing, completely uninhabitable, with colossal frozen clouds hovering across the horizon.\"",
        breakdown: "Christopher Nolan's space epic avoids generic adjectives to evoke awe and dread: landscapes are *colossal*, temperatures are *freezing*, and isolation is *utter*."
      },
      music: {
        title: "Sia - \"Titanium\"",
        quote: "\"I'm bulletproof, nothing to lose. Fire away, fire away... Shoot me down, but I won't fall, I am titanium!\"",
        breakdown: "Sia uses non-gradable, absolute metaphors (*bulletproof, unbreakable, titanium*) to signal total resilience beyond ordinary strength."
      },
      book: {
        title: "Frankenstein by Mary Shelley",
        quote: "\"The icy glaciers of Mont Blanc were colossal, and the wind was absolutely piercing as the creature vanished into the mist.\"",
        breakdown: "Romantic Gothic literature relies heavily on extreme, sublime vocabulary to contrast human fragility against nature's raw majesty."
      }
    },
    practiceQuestions: [
      {
        id: "q11-1",
        question: "After running a full 42-kilometer marathon in the desert heat, the athletes were ______.",
        options: ["exhausted", "very exhausted", "a bit furious", "fairly gigantic"],
        correctIndex: 0,
        explanation: "'Exhausted' is an extreme adjective meaning 'very tired'; it cannot be modified with 'very'."
      },
      {
        id: "q11-2",
        question: "Which modifier is grammatically correct to place before the extreme adjective \"freezing\"?",
        options: ["absolutely", "very", "slightly", "fairly"],
        correctIndex: 0,
        explanation: "Extreme adjectives take non-gradable intensifiers like 'absolutely' or 'completely'."
      },
      {
        id: "q11-3",
        question: "The surgical operating room was cleaned thoroughly until it was ______.",
        options: ["spotless", "very cleanable", "boiling", "starving"],
        correctIndex: 0,
        explanation: "'Spotless' means impeccably and completely clean."
      },
      {
        id: "q11-4",
        question: "The principal was ______ when she discovered someone had vandalized the brand-new school murals.",
        options: ["furious", "very furious", "slightly boiling", "a little starving"],
        correctIndex: 0,
        explanation: "'Furious' means extremely angry and stands alone without 'very'."
      },
      {
        id: "q11-5",
        question: "Identify the sentence that contains a grammatical error:",
        options: [
          "The winter breeze in northern Canada was very freezing.",
          "The archaeological team uncovered a colossal Roman monument.",
          "We were absolutely starving after the six-hour hike.",
          "The diamond tiara was utterly priceless."
        ],
        correctIndex: 0,
        explanation: "Option A is incorrect because 'freezing' cannot be paired with 'very' (should be 'absolutely freezing' or 'very cold')."
      }
    ]
  },
  {
    id: "unit-12",
    level: 12,
    title: "Essential Phrasal Verbs",
    subtitle: "Unlock native fluency with separable and inseparable idiomatic verbs",
    category: "Idiomatic Mastery",
    icon: "🚀",
    badge: "Fluency Champion",
    xpReward: 380,
    formula: "Verb + Particle (preposition/adverb) creating a brand new figurative meaning",
    deepExplanation: `
      Phrasal verbs are multi-word verbs where the combination creates a meaning distinct from the individual words.

      <h3>The 4 Phrasal Verb Categories</h3>
      <ol>
        <li><strong>Transitive & Separable:</strong> The object can go between the verb and particle. <br><em>Turn off the lights</em> OR <em>Turn the lights off</em>. <br>⚠️ <strong>Pronoun Rule:</strong> If the object is a pronoun (it, them, him, her), it MUST go in the middle! <br>✔️ <em>Turn <strong>it</strong> off</em> (NOT: ❌ <em>Turn off it</em>).</li>
        <li><strong>Transitive & Inseparable:</strong> The object must strictly follow the particle. <br><em>I ran into <strong>my teacher</strong> at the supermarket.</em> (NOT: ❌ <em>ran my teacher into</em>).</li>
        <li><strong>Intransitive:</strong> Takes no direct object at all. <br><em>The airplane <strong>took off</strong> smoothly. / He needs to <strong>grow up</strong>.</em></li>
        <li><strong>Three-Word Phrasal Verbs (Verb + Particle + Preposition):</strong> Always inseparable. <br><em>look forward to, run out of, catch up with, put up with.</em></li>
      </ol>

      <h3>High-Yield Academic Phrasal Verbs</h3>
      <ul>
        <li><strong>Call off:</strong> Cancel an event. (<em>They called off the soccer match due to lightning.</em>)</li>
        <li><strong>Put off:</strong> Postpone/delay. (<em>Never put off until tomorrow what you can do today.</em>)</li>
        <li><strong>Figure out:</strong> Solve or understand a problem through reasoning.</li>
        <li><strong>Give up:</strong> Surrender or quit a habit.</li>
        <li><strong>Look up to:</strong> Admire and respect someone as a role model.</li>
      </ul>
    `,
    contexts: {
      movie: {
        title: "Top Gun: Maverick (2022) & Apollo 13",
        quote: "\"Prepare for takeoff... Don't give up on your wingman! We're running out of fuel, we need to figure out a trajectory!\"",
        breakdown: "Aviation and survival films run on high-stakes phrasal verbs: *take off, back down, run out of, hold on, carry out*."
      },
      music: {
        title: "Bill Withers - \"Lean on Me\" & Elton John - \"Don't Go Breaking My Heart\"",
        quote: "\"Lean on me, when you're not strong, and I'll be your friend, I'll help you carry on...\"",
        breakdown: "Timeless anthems use phrasal verbs (*lean on, carry on, give up, let down*) to forge heartfelt emotional connections."
      },
      book: {
        title: "The Catcher in the Rye by J.D. Salinger",
        quote: "\"I kept looking for someone I could really look up to, but people always ended up letting you down.\"",
        breakdown: "Holden Caulfield's colloquial, authentic teenage voice is powered by conversational phrasal verbs (*look up to, let down, hang around, kick out*)."
      }
    },
    practiceQuestions: [
      {
        id: "q12-1",
        question: "Because of torrential rain and flooded fields, the school committee decided to ______ the sports festival.",
        options: ["call off", "call on", "call out", "call in"],
        correctIndex: 0,
        explanation: "'Call off' means to cancel an event entirely."
      },
      {
        id: "q12-2",
        question: "The printer ran out of ink. Please replace ______ before printing the exam papers.",
        options: ["it", "out it", "it out", "them"],
        correctIndex: 0,
        explanation: "'Replace it' (or for separable phrasal verbs: pronouns must be placed between the verb and particle)."
      },
      {
        id: "q12-3",
        question: "I have always ______ my chemistry teacher for her dedication and passion for science.",
        options: ["looked up to", "looked down on", "looked forward to", "looked after to"],
        correctIndex: 0,
        explanation: "'Look up to' is an idiomatic phrasal verb meaning to admire and respect someone."
      },
      {
        id: "q12-4",
        question: "Don't ______ your homework until Sunday midnight; start early to avoid unnecessary stress.",
        options: ["put off", "put out", "put on", "put away"],
        correctIndex: 0,
        explanation: "'Put off' means to postpone or procrastinate."
      },
      {
        id: "q12-5",
        question: "It took the robotics club three hours to ______ why the sensor was failing to detect obstacles.",
        options: ["figure out", "break down", "give in", "drop out"],
        correctIndex: 0,
        explanation: "'Figure out' means to decipher, solve, or understand through logical thinking."
      }
    ]
  }
];

export const GRADE_CLASS_CATALOG = [
  { id: "Grade 9A", grade: "G9", name: "Grade 9A", label: "Grade 9A (SMP)", availableSubjects: ["English", "ICT", "Math", "Science"] },
  { id: "Grade 9B", grade: "G9", name: "Grade 9B", label: "Grade 9B (SMP)", availableSubjects: ["English", "ICT", "Math", "Science"] },
  { id: "Grade 9C", grade: "G9", name: "Grade 9C", label: "Grade 9C (SMP)", availableSubjects: ["English", "ICT", "Math", "Science"] },
  { id: "Grade 7A", grade: "G7", name: "Grade 7A", label: "Grade 7A (SMP)", availableSubjects: ["English", "ICT"] },
  { id: "Grade 7B", grade: "G7", name: "Grade 7B", label: "Grade 7B (SMP)", availableSubjects: ["English", "ICT"] },
  { id: "Grade 8A", grade: "G8", name: "Grade 8A", label: "Grade 8A (SMP)", availableSubjects: ["English", "ICT"] },
  { id: "Grade 8B", grade: "G8", name: "Grade 8B", label: "Grade 8B (SMP)", availableSubjects: ["English", "ICT"] },
  { id: "Grade 10A", grade: "G10", name: "Grade 10A", label: "Grade 10A (SMA)", availableSubjects: ["English", "ICT"] },
  { id: "Grade 10B", grade: "G10", name: "Grade 10B", label: "Grade 10B (SMA)", availableSubjects: ["English", "ICT"] },
  { id: "Grade 11A", grade: "G11", name: "Grade 11A", label: "Grade 11A (SMA)", availableSubjects: ["English", "ICT"] },
  { id: "Grade 12", grade: "G12", name: "Grade 12", label: "Grade 12 (SMA)", availableSubjects: ["English", "ICT"] }
];

how tasur works - my notes

so tasur is basically an AI study tool. you upload your notes, a pdf, slides, whatever — and it reads everything and builds a mindmap out of it. not like a simple summary, it actually figures out the concepts and how they relate to each other. prerequisites, contrasts, examples, part-of relationships. the whole thing.

the mindmap is the main thing you interact with. its like a visual tree where the root node is your overall topic (like "Unit 3: Distributed Systems" or whatever you uploaded) and then it branches out into subtopics and sub-subtopics. each branch gets its own color from this palette — slate blue, forest green, terracotta, that kind of thing. nodes closer to the root are bigger and darker, deeper nodes get smaller and lighter. creates a natural visual hierarchy so you can tell at a glance whats foundational vs whats advanced.

every node on the map has a colored dot next to it showing your confidence level:
- green dot = mastered (you know this)
- amber dot = reviewing (getting there but not solid yet)  
- red dot = struggling (needs work)

these aren't arbitrary. there are actual thresholds. mastered means your confidence score is 0.7 or above. reviewing is 0.3 to 0.7. struggling is below 0.3. the scores update every time you do a flashcard, answer an assessment, or interact with the AI about that concept.

you can collapse and expand branches. theres a little bubble on the edge of nodes — shows "+3" or whatever number of hidden children when collapsed, and a minus sign when expanded. hover over any node and you get a study cue tooltip, like a little hint about that concept.


UPLOADING DOCUMENTS

ok so the upload process. you can upload:
- PDFs (even scanned ones, it does OCR)
- Word docs (.docx)
- Plain text files
- Images (png, jpg) — also OCR'd
- PowerPoint slides (.pptx)
- NOT old .ppt files though, you gotta save as .pptx first

max file size is 25 MB. they recommend uploading individual chapters not entire textbooks which makes sense.

when you upload, you pick a few things:
1. your domain hint (like "database systems" or "organic chemistry")
2. learning mode — steady or fast (more on this later, this is important)
3. optional custom instructions (like "focus on clinical applications" or "emphasize proofs")

then it processes through these stages and you can watch the progress in real time:
extracting text → generating mindmap → analyzing concepts → searching for gaps → creating flashcards → saving everything

its all streamed via SSE so you see each step happen. pretty satisfying honestly.

OH and you can add more documents to an existing session later. like if you uploaded chapter 5 and then want to add chapter 6, you just hit "+ doc" on that session and it merges the new concepts into your existing mindmap. your progress on old concepts is preserved.


THE TWO LEARNING MODES

this is probably the most important thing to understand about tasur. everything changes based on which mode you pick.

STEADY MODE (the default)
- confidence threshold is 0.7 — you need 70% mastery before the system considers a concept "mastered"
- prerequisites are STRICTLY enforced. if concept B depends on concept A, you really should understand A first
- flashcards prioritize your worst gaps first. whatever cards are most overdue, those come up first
- when the AI checks your understanding, it gives you a text box and you have to actually write out your answer. no shortcuts
- this is for when you want deep understanding. exam prep, complex topics, things you actually need to master

FAST MODE
- confidence threshold drops to 0.5 — only need 50% to be considered mastered
- prerequisites are "gentle guides" not hard blockers. you can skip ahead
- flashcards prioritize by exam importance first. high-priority concepts come up before obscure details
- comprehension checks are just "Got it" / "Not yet" buttons. quick and binary
- this is cramming mode basically. when you need to cover a lot of ground fast and dont need deep mastery of everything

you pick the mode when you create the session and cant change it after. so choose wisely i guess.


FLASHCARDS AND SPACED REPETITION

tasur uses SM-2 which is the same algorithm as anki and supermemo. the basic idea: you review a card, rate how well you remembered it, and the algorithm schedules the next review based on that rating.

the ratings and what they mean:
- Again (quality 0): total blank. interval resets to 1 day. ease factor drops by 0.2
- Hard (quality 3): got it but it was painful. mild ease adjustment
- Good (quality 4): got it with some thought. standard progression
- Easy (quality 5): instant recall. ease factor goes up

interval progression works like: first review after 1 day, second review after 6 days, then each subsequent interval is previous × ease factor. ease factor starts at 2.5 and has a floor of 1.3 so it cant drop below that.

cards that have never been reviewed always show up first because those have the highest information density — you havent seen them at all yet.

there are four types of flashcards and theyre color coded:
blue = Recall ("What is normalization?") — pure definition retrieval
green = Application ("Given this table, apply 3NF") — use knowledge in context  
purple = Explain ("Explain ACID properties in simple terms") — teach-back format
amber = Compare ("How does 2NF differ from 3NF?") — comparative analysis

each card also has a difficulty rating (easy, intermediate, hard) shown as a colored dot, and some cards have optional hints you can toggle on.

the flip animation is pretty slick actually, full 3D rotate on the Y axis with backface hidden. 0.45 second transition.

IMPORTANT: flashcard ratings dont directly overwrite your confidence score. theres a blending formula:
new_confidence = 0.7 × old_confidence + 0.3 × new_signal

so if youre at 0.8 confidence and bomb a card (signal = 0.0), you drop to 0.56, not to zero. it preserves momentum across multiple reviews which feels fair.

the rating-to-signal mapping:
again → 0.0
hard → 0.4
good → 0.7
easy → 1.0


remember that flashcard scheduling differs by mode too:

in fast mode: never-reviewed cards first, then sorted by exam priority (high-value stuff first), with most-overdue as tiebreaker

in steady mode: never-reviewed cards first, then sorted by most overdue (biggest gaps first), with exam priority as tiebreaker


THE AI CHAT / TUTORING

click any concept on the mindmap and you go to the chat interface for that concept. its a two-column layout — chat on the left, "FocusZone" sidebar on the right.

the FocusZone shows:
- which concept youre currently studying
- the source document and section it came from
- page references
- nearby related concepts from the mindmap

the AI isnt just a generic chatbot. its specifically tutoring you on that one concept, using your uploaded notes as the knowledge base. it knows what youve uploaded. the messages come in different styles:
- explanations (serif text, parchment background — feels like reading a textbook)
- analogies (italicized, different tone)
- assessments (inline comprehension checks right in the chat)
- visual suggestions (tables, comparison cards, diagrams rendered inline)

the visual suggestions are interesting. the AI can generate:
- tables (proper HTML tables with headers and rows)
- comparison layouts (two-column cards showing how concepts differ — great for "contrasts_with" relationships)
- diagrams (node-and-edge descriptions, rendered as text-based diagrams)

when you first enter a concept, the orchestrator runs to figure out the best teaching approach. after that, subsequent messages go directly to the concept explainer without the orchestrator overhead.

micro-assessments in steady mode: you get a text area and have to write out your understanding. the AI evaluates what you wrote.

micro-assessments in fast mode: just two buttons, "Got it" or "Not yet". instant, no friction.

both types update your confidence score for that concept.


CONFIDENCE TRACKING IN DETAIL

every concept has an understanding_state per user per session. it tracks:
- confidence score (0.0 to 1.0)
- exposure count (how many times youve seen this concept)
- last assessed timestamp
- assessment history (array of {timestamp, score, method} entries)
- effective modalities (which teaching formats work best for you on this concept — maybe you learn "joins" better from tables but "normalization" better from analogies)

the assessment methods that get logged:
- micro_assessment (inline comprehension check)
- flashcard (spaced repetition rating)
- teach_back (you explain it, AI grades you)
- chat_response (free text dialogue)
- visual_suggestion (interacting with a suggested diagram or table)

concept complexity levels:
foundational — prerequisites for other concepts, taught first
intermediate — depends on foundational concepts  
advanced — depends on multiple foundational and intermediate concepts

exam priority is set during parsing based on how deep the concept is in the mindmap tree. shallower nodes (closer to root) get higher exam priority because theyre usually the big important topics. this is what drives flashcard sorting in fast mode.


SHARING SESSIONS

you can share any session with classmates. heres how it works:

1. click share on your session — generates a unique link with a 12-character code
2. send the link to someone
3. they click it, log in (or get redirected to login if not authenticated)
4. system creates a session_shares record linking them to your session
5. their understanding_state gets bootstrapped — every concept starts at confidence 0, fresh slate
6. they see the same mindmap, same flashcards, same chat — but their progress is completely independent

so if youve mastered 15 out of 20 concepts and share with a friend, they start at 0 out of 20. the content is shared, the progress is not. which makes total sense.

the share link is idempotent — if you generate it twice you get the same link back. you can also revoke it (deletes the active link) but people who already accepted the share keep their access.

if you click your own share link it just redirects you to your mindmap. no duplicate records.

one thing: shared sessions arent real-time collaborative. you cant see each other studying or anything. its more like "here's my study material, make your own progress on it."


NAVIGATING THE APP

dashboard shows all your sessions as cards. each card shows:
- session title
- domain badge (like "DISTRIBUTED SYSTEMS" in caps)
- mode indicator (⚡ Fast or ◎ Steady)  
- progress ("12 of 18 concepts mastered · 3 days ago")
- resume button, add document button, delete button

sessions that are still processing show separately with a real-time progress bar.

the resume flow is smart: when you come back to a session, the orchestrator figures out which concept you should study next and highlights it with a pulsing amber ring on the mindmap. so you dont have to remember where you left off.

main routes:
/dashboard — your sessions
/study/[sessionId]/mindmap — the mindmap view
/study/[sessionId]/chat — AI tutoring (navigated via clicking nodes)
/study/[sessionId]/flashcards — spaced repetition deck
/share/[code] — accept a share link


CONCEPT RELATIONSHIPS

the mindmap isnt just a tree, its actually a knowledge graph. concepts can have these types of relationships:

prerequisite — you need to understand A before B (strictly enforced in steady mode)
sequential — sibling ordering from the tree structure  
related — conceptually connected but not dependent
contrasts_with — opposing concepts (like "centralized vs decentralized") — these can be bidirectional
part_of — containment (like "Lamport's algorithm is part of Logical clocks")
example_of — concrete instance (like "NTP is an example of Clock synchronization")

each relationship has a weight (0.0 to 1.0, strength of connection) and a bidirectional flag.


THE DESIGN

tasur has this warm scholarly aesthetic. they call it the "Scholarly Canvas" design system.

dark mode uses charcoal backgrounds with cream text. light mode uses warm cream backgrounds with dark text. the primary accent color is burnt sienna. typography mixes serif headers (Instrument Serif — feels like a manuscript) with clean sans-serif body text (Inter) and monospace for technical elements (JetBrains Mono).

no hard borders anywhere, just tonal layering through background colors. shadows are warm and subtle. rounded corners everywhere (8-12px). transitions are smooth, 0.15 to 0.45 seconds.

the confidence colors again:
mastered green = #3D7A5E (forest green)
reviewing amber = #C2692A (warm amber / burnt sienna)  
struggling red = #9B5C4A (terracotta)

the mindmap branch colors cycle through 8 options: slate blue, forest green, terracotta, muted violet, amber umber, subdued teal, parchment brown, dusty rose. deeper nodes inherit their branch color but lighter.


RANDOM THINGS I WANT TO REMEMBER

- sessions can have multiple documents merged together. the knowledge graph connects concepts across documents
- web search can augment your material if the AI detects gaps in your notes
- understanding state syncs immediately on every assessment, no batching
- chat history is preserved per concept — you can leave and come back and your whole conversation is there
- the orchestrator determines teaching approach on first visit to a concept, then gets out of the way
- the upload pipeline runs through a Go backend service, not in Next.js directly
- 3D flip animation on flashcards uses CSS preserve-3d and rotateY transforms
- search on the mindmap dims non-matching nodes to 30% opacity, matching ones stay full
- file processing streams progress via Server-Sent Events so the UI updates in real time
- concept nodes know their own complexity level: foundational, intermediate, or advanced
- you can add custom instructions during upload to steer how the mindmap gets generated

the whole thing is basically: upload messy notes → get organized knowledge graph → study with AI tutoring + spaced repetition → track your mastery → share with friends

thats tasur.

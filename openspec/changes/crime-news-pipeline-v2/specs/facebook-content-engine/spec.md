## ADDED Requirements

### Requirement: Facebook post title generation
The system SHALL generate an emoji title for each article following: ≤16 words, punchy/hook-style, with ONE specific emoji at the end matching the crime type.

#### Scenario: Title with weapon-specific emoji
- **WHEN** the article involves an ax → 🪓, knife/stabbing → 🔪, gun/shooting → 🔫, fire/arson → 🔥, drowning → 🌊, drugs/overdose → 💊, general murder → 💀, arrest → 🚔, court/trial → ⚖️, missing/abduction → 🔍
- **THEN** the emojiTitle SHALL end with the matching emoji

#### Scenario: Title length constraint
- **WHEN** an emojiTitle is generated
- **THEN** it SHALL contain at most 16 words (not counting the emoji)

### Requirement: Facebook post body generation
The system SHALL generate a 4-paragraph Facebook post body for each article following the exact editorial format.

#### Scenario: Paragraph 1 — the hook
- **WHEN** the facebookText is generated
- **THEN** paragraph 1 SHALL be ~2 sentences: "What started as [trigger] ended in [outcome]." + "[Suspect name, age] is behind bars charged with [crime] of [victim name, age]."

#### Scenario: Paragraph 2 — the discovery
- **WHEN** the facebookText is generated
- **THEN** paragraph 2 SHALL be ~3-4 sentences covering: who discovered the crime, what details they noticed, sensory details, the discovery moment. SHALL use real names and specific details.

#### Scenario: Paragraph 3 — suspect background
- **WHEN** the facebookText is generated
- **THEN** paragraph 3 SHALL be ~3 sentences covering: suspect's character/background + witness account + key physical evidence found. SHALL use direct quotes where available.

#### Scenario: Paragraph 4 — irony and punch
- **WHEN** the facebookText is generated
- **THEN** paragraph 4 SHALL be ~2 sentences: contrast suspect's denial with evidence, ending with a punchy observation.

#### Scenario: CTA line
- **WHEN** the facebookText is generated
- **THEN** it SHALL end with a blank line followed by "👉 Please follow for more!"

### Requirement: Comment bait generation
The system SHALL generate a 3-paragraph comment bait section designed to provoke engagement.

#### Scenario: Comment bait paragraph 1 — forensic deep dive
- **WHEN** commentBait is generated
- **THEN** paragraph 1 SHALL be ~3 sentences covering: forensic/medical details, specific investigative techniques, matching physical evidence.

#### Scenario: Comment bait paragraph 2 — the petty trigger
- **WHEN** commentBait is generated
- **THEN** paragraph 2 SHALL be ~2 sentences expressing dismay at the absurdly small trigger that caused the violence.

#### Scenario: Comment bait paragraph 3 — systemic critique
- **WHEN** commentBait is generated
- **THEN** paragraph 3 SHALL be ~3-4 sentences covering: prior record, open warrants, known to police + the systemic question ("why was this person still free?"). SHALL end by naming the victim and what they deserved.

### Requirement: Facebook-safe language
All generated content SHALL avoid Facebook-banned/flagged words and phrases.

#### Scenario: Content avoids restricted terms
- **WHEN** facebookText or commentBait is generated
- **THEN** the text SHALL NOT contain explicitly violent graphic descriptions, profanity, or words known to trigger Facebook's content moderation

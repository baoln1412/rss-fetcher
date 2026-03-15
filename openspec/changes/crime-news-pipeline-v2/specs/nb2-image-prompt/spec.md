## ADDED Requirements

### Requirement: NB2 image prompt generation
The system SHALL generate a structured text prompt for each article that can be copied and pasted into Google Nano Banana 2 to produce an Instagram-format crime news image.

#### Scenario: Prompt specifies 4:5 aspect ratio
- **WHEN** an nb2Prompt is generated
- **THEN** it SHALL specify a 4:5 (Instagram) aspect ratio image

#### Scenario: Prompt includes darkened background image
- **WHEN** the article has an `imageUrl`
- **THEN** the prompt SHALL instruct NB2 to use that image as a full-bleed background, darkened 40%
- **WHEN** the article has no `imageUrl`
- **THEN** the prompt SHALL describe a generic dark crime scene background

#### Scenario: Prompt includes circular portrait with yellow border
- **WHEN** the article has a `portraitUrl`
- **THEN** the prompt SHALL instruct NB2 to place it in a circular frame in the bottom-left area (30% width) with an 8px `#f0e523` border
- **WHEN** the article has no `portraitUrl`
- **THEN** the prompt SHALL describe a generic shadowed portrait silhouette

#### Scenario: Prompt includes eye-censor bar
- **WHEN** nb2Prompt is generated
- **THEN** the prompt SHALL specify a black rectangle covering the eyes of any person in both the portrait and background images (privacy / dramatic effect)

#### Scenario: Prompt includes title text overlay
- **WHEN** nb2Prompt is generated
- **THEN** the prompt SHALL specify the emojiTitle (≤16 words) rendered in Source Sans Variable Black font, positioned in the top area, with: the most dramatic keyword(s) in `#f0e523` yellow, remaining words in white, and a drop shadow for readability

#### Scenario: Prompt includes brand color
- **WHEN** nb2Prompt is generated
- **THEN** all accent colors in the prompt SHALL use `#f0e523` (bright yellow)

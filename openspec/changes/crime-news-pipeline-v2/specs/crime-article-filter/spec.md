## ADDED Requirements

### Requirement: Crime keyword filtering on general feeds
The system SHALL filter articles from general-news RSS feeds using a crime keyword matching strategy to ensure only crime-relevant articles enter the pipeline.

#### Scenario: Article title contains a crime keyword
- **WHEN** an article's title contains any of: murder, kill, dead, death, arrest, charged, suspect, shooting, shot, stabbing, assault, robbery, kidnap, abduct, missing, court, trial, verdict, homicide, manslaughter, rape, carjacking, burglary, arson, fentanyl, overdose, indicted, convicted, sentenced
- **THEN** the article SHALL pass the crime filter

#### Scenario: Article description contains a crime keyword
- **WHEN** an article's title does not match but its description contains a crime keyword
- **THEN** the article SHALL pass the crime filter

#### Scenario: Non-crime article from a general feed
- **WHEN** an article from a general-news feed (e.g., AP News, NYT US) does not contain any crime keywords in title or description
- **THEN** the article SHALL be excluded from the pipeline

#### Scenario: Articles from crime-specific feeds bypass filtering
- **WHEN** an article comes from a feed flagged as `crimeSpecific: true` (e.g., Law & Crime, Court TV, Crime Online)
- **THEN** the article SHALL bypass keyword filtering and be included automatically

### Requirement: Minimum 20 articles per fetch
The system SHALL target outputting at least 20 crime-relevant articles per fetch cycle, falling back to looser date windows if the 7-day window yields fewer.

#### Scenario: Sufficient recent articles
- **WHEN** the 7-day window produces ≥20 crime articles
- **THEN** the system SHALL return the top 20 sorted by pubDate descending

#### Scenario: Insufficient recent articles
- **WHEN** the 7-day window produces <20 crime articles
- **THEN** the system SHALL expand to all available articles (no date filter) and return up to 25

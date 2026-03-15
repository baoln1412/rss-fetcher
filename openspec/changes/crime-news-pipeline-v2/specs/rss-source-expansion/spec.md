## ADDED Requirements

### Requirement: Expanded RSS feed registry
The system SHALL maintain a registry of at least 20 US news RSS feed endpoints covering both mainstream outlets and specialist crime publications.

#### Scenario: All major crime outlets are included
- **WHEN** the feed registry is loaded
- **THEN** it SHALL include feeds from: NYT US, CNN Crime, Fox News Crime, USA Today Crime, NBC Crime Courts, ABC News US, CBS News Crime, Washington Post National, AP News Crime, Law & Crime, Court TV, Crime Online, Oxygen Crime News, People Crime News, Courthouse News Service

#### Scenario: Crime-specific endpoints are preferred
- **WHEN** a news outlet provides a crime-specific RSS feed (e.g., CNN Crime & Justice, NBC Crime Courts, CBS Crime)
- **THEN** the system SHALL use the crime-specific endpoint instead of the general news feed

#### Scenario: Each feed entry has a name and URL
- **WHEN** the system reads a feed entry from the registry
- **THEN** it SHALL have a `name` (human-readable source label) and `url` (RSS feed URL)

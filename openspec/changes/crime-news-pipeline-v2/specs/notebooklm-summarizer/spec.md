## ADDED Requirements

### Requirement: NotebookLM-based article summarization
The system SHALL use NotebookLM MCP tools to create a temporary notebook, ingest article URLs as sources, and query for factual summaries — replacing the `claude -p` subprocess approach.

#### Scenario: Successful batch summarization
- **WHEN** the pipeline receives a batch of articles to process
- **THEN** the system SHALL:
  1. Create a new NotebookLM notebook (named `Crime News – YYYY-MM-DD`)
  2. Add each article URL as a source using `notebook_add_url`
  3. Query the notebook for a factual 3-4 paragraph summary per article
  4. Delete the notebook after processing is complete

#### Scenario: Article URL cannot be ingested
- **WHEN** NotebookLM fails to ingest an article URL (paywall, 404, blocked)
- **THEN** the system SHALL fall back to the article's RSS description for that article's content

#### Scenario: NotebookLM MCP is unavailable
- **WHEN** the NotebookLM MCP server is not running or authentication has expired
- **THEN** the system SHALL log the error and fall back to using RSS descriptions for all articles

#### Scenario: Notebook cleanup
- **WHEN** the pipeline completes (success or failure)
- **THEN** the system SHALL delete the temporary notebook to avoid clutter

### Requirement: Summary quality
Each article summary SHALL include: who is involved (full names, ages when available), what happened, key evidence or witness details, and how the crime was discovered.

#### Scenario: Summary includes key details
- **WHEN** the notebook query returns a summary for an article
- **THEN** the summary SHALL contain at least 3 paragraphs with specific factual details extracted from the source article

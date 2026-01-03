# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

xml2rows is a streaming CLI tool that converts large XML files to JSONL or CSV format. Designed for processing multi-gigabyte files (like Discogs data dumps) with constant memory usage.

## Commands

```bash
# Install dependencies
pnpm install

# Run the tool
node index.js <input.xml> -r <record-tag> [options]

# Example: Convert Discogs artists to JSONL
node index.js ../gigger/discogs-data/discogs_20260101_artists.xml -r artist -o artists.jsonl

# Example: Convert to CSV
node index.js ../gigger/discogs-data/discogs_20260101_masters.xml -r master -c -o masters.csv
```

## Architecture

Single-file CLI tool (`index.js`) using the `sax` streaming XML parser. Key functions:

- `streamConvert()` - Main streaming pipeline: creates read stream → SAX parser → write stream
- `promoteId()` - Normalizes `id` attributes and elements (e.g., `<master id="123">` and `<id>123</id>` both become `{"id":"123"}`)
- `flatten()` - Converts nested objects to dot notation; arrays become JSON strings for consistent CSV columns
- `escapeCsvValue()` - Handles CSV escaping (commas, quotes, newlines)

## Key Design Decisions

- **Streaming**: Uses SAX parser to handle multi-GB files without loading into memory
- **Array Handling**: In flatten/CSV mode, arrays are stored as JSON strings rather than expanded columns (`urls.url` contains `["url1","url2"]` instead of creating `urls.url[0]`, `urls.url[1]`)
- **JSONL Output**: One JSON object per line (no wrapping array) for streaming consumption

## User Preferences

- Use `pnpm` (not npm)
- Use JavaScript/Node (not Python)
- Don't commit to git unless explicitly asked

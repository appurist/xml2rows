# xml2rows

A streaming command-line tool to convert large XML files to JSONL or CSV format. Designed for processing multi-gigabyte XML files with minimal memory usage.

## Installation

```bash
bun install
```

## Build Standalone Executable

```bash
bun run build    # Creates ./xml2rows
```

## Usage

```bash
bun index.js <input.xml> [options]

# Or use the compiled executable
./xml2rows <input.xml> [options]
```

### Options

| Option | Description |
|--------|-------------|
| `-r, --record <tag>` | Record element to extract (auto-detected from first child if omitted) |
| `-o, --output <file>` | Output file path (default: `{basename}.jsonl` or `{basename}.csv`) |
| `-c, --csv` | Output as CSV instead of JSONL. Automatically enables flattening |
| `-C, --camel` | Convert snake_case keys to camelCase |
| `-f, --flatten` | Flatten nested structures using dot notation |
| `-n, --nested` | Keep nested structure (default for JSON) |
| `-p, --pretty` | Pretty print JSON output (one record per multiple lines) |
| `-m, --meta` | Output root element attributes as first line (JSON) or comment (CSV) |
| `-v, --version` | Show version number |
| `-h, --help` | Show help message |

## Output Formats

### JSONL (default)

One JSON object per line. Ideal for streaming processing of large datasets:

```jsonl
{"id":"1","name":"The Persuader","aliases":{"name":[{"#text":"Jesper Dahlbäck","id":"239"}]}}
{"id":"2","name":"Mr. James Barth & A.D.","aliases":{"name":[{"#text":"Puente Latino","id":"2470"}]}}
```

### CSV (`--csv`)

Comma-separated values with header row. Arrays are stored as JSON strings for consistent column count:

```csv
id,name,aliases.name
1,The Persuader,"[{""#text"":""Jesper Dahlbäck"",""id"":""239""}]"
2,Mr. James Barth & A.D.,"[{""#text"":""Puente Latino"",""id"":""2470""}]"
```

### Flattened JSON (`--flatten`)

Nested structures converted to dot notation, arrays as JSON strings:

```jsonl
{"id":"1","name":"The Persuader","aliases.name":"[{\"#text\":\"Jesper Dahlbäck\",\"id\":\"239\"}]"}
```

## Examples

```bash
# Convert artists XML to JSONL (auto-detects <artist> from <artists>, outputs artists.jsonl)
bun index.js artists.xml

# Convert to CSV (outputs artists.csv)
bun index.js artists.xml -c

# Specify output file
bun index.js artists.xml -o /path/to/output.jsonl

# Flattened JSONL
bun index.js masters.xml -f

# Include root element metadata
bun index.js data.xml -m

# Convert keys to camelCase (data_quality → dataQuality)
bun index.js artists.xml -C

# Explicit record element (when auto-detection won't work)
bun index.js data.xml -r item
```

## Features

- **Streaming**: Processes files of any size with constant memory usage
- **Auto-Detection**: Automatically detects record element when child name is a substring of root (e.g., `<artist>` in `<artists>`)
- **ID Promotion**: Automatically promotes `id` attributes to `id` fields (e.g., `<master id="123">` becomes `{"id":"123",...}`)
- **Progress Reporting**: Shows progress every 10,000 records on stderr
- **Proper Escaping**: CSV values with commas, quotes, or newlines are properly escaped

## Processing JSONL Output

```javascript
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

const rl = createInterface({
  input: createReadStream('artists.jsonl')
});

for await (const line of rl) {
  const record = JSON.parse(line);
  console.log(record.id, record.name);
}
```

## License

MIT

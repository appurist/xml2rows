# xml2rows

A streaming command-line tool to convert large XML files to JSONL or CSV format. Designed for processing multi-gigabyte XML files with minimal memory usage.

## Installation

```bash
pnpm install
```

## Usage

```bash
node index.js <input.xml> -r <record-tag> [options]
```

### Options

| Option | Description |
|--------|-------------|
| `-r, --record <tag>` | **Required.** The XML element name to extract as records (e.g., `artist`, `label`, `master`) |
| `-o, --output <file>` | Output file path. Defaults to stdout |
| `-c, --csv` | Output as CSV instead of JSONL. Automatically enables flattening |
| `-f, --flatten` | Flatten nested structures using dot notation |
| `-n, --nested` | Keep nested structure (default for JSON) |
| `-p, --pretty` | Pretty print JSON output (one record per multiple lines) |
| `-m, --meta` | Output root element attributes as first line (JSON) or comment (CSV) |
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
# Convert artists XML to JSONL
node index.js artists.xml -r artist -o artists.jsonl

# Convert to CSV
node index.js artists.xml -r artist -c -o artists.csv

# Pretty print JSON to stdout
node index.js labels.xml -r label -p | head -50

# Flattened JSONL
node index.js masters.xml -r master -f -o masters-flat.jsonl

# Include root element metadata
node index.js data.xml -r item -m -o items.jsonl
```

## Features

- **Streaming**: Processes files of any size with constant memory usage
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

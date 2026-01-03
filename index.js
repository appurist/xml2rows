#!/usr/bin/env node

import { createReadStream, createWriteStream } from 'fs';
import sax from 'sax';

function showHelp() {
  console.log(`
xml2rows - Stream convert large XML files to JSON/JSONL/CSV

Usage: xml2rows <input.xml> [options]

Options:
  -o, --output <file>   Output file (default: stdout)
  -r, --record <tag>    Record element to extract (e.g., "artist", "label")
  -f, --flatten         Flatten nested structures (auto-enabled for CSV)
  -n, --nested          Keep nested structure (default for JSON)
  -p, --pretty          Pretty print JSON output
  -c, --csv             Output as CSV instead of JSONL
  -m, --meta            Output root element metadata as first line
  -h, --help            Show this help message

Examples:
  xml2rows artists.xml -r artist
  xml2rows artists.xml -r artist -o artists.jsonl
  xml2rows artists.xml -r artist -c -o artists.csv
  xml2rows labels.xml -r label --flatten -o labels.jsonl
`);
}

// Promote @id/@discogsId attributes to id/discogsId if not already present
function promoteId(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  // Promote @id to id
  if (obj['@id'] !== undefined && obj.id === undefined) {
    obj.id = obj['@id'];
    delete obj['@id'];
  }

  // Promote @discogsId to discogsId
  if (obj['@discogsId'] !== undefined && obj.discogsId === undefined) {
    obj.discogsId = obj['@discogsId'];
    delete obj['@discogsId'];
  }

  // Recursively process nested objects and arrays
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'object' && item !== null) {
          promoteId(item);
        }
      });
    } else if (typeof value === 'object' && value !== null) {
      promoteId(value);
    }
  }

  return obj;
}

function flatten(obj, prefix = '', result = {}) {
  for (const key in obj) {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, newKey, result);
    } else if (Array.isArray(value)) {
      // Store arrays as JSON strings for consistent column count
      result[newKey] = JSON.stringify(value);
    } else {
      result[newKey] = value;
    }
  }
  return result;
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function parseArgs(args) {
  const options = {
    input: null,
    output: null,
    record: null,
    flatten: false,
    pretty: false,
    csv: false,
    meta: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      showHelp();
      process.exit(0);
    } else if (arg === '-o' || arg === '--output') {
      options.output = args[++i];
    } else if (arg === '-r' || arg === '--record') {
      options.record = args[++i];
    } else if (arg === '-f' || arg === '--flatten') {
      options.flatten = true;
    } else if (arg === '-n' || arg === '--nested') {
      options.flatten = false;
    } else if (arg === '-p' || arg === '--pretty') {
      options.pretty = true;
    } else if (arg === '-c' || arg === '--csv') {
      options.csv = true;
    } else if (arg === '-m' || arg === '--meta') {
      options.meta = true;
    } else if (!arg.startsWith('-')) {
      options.input = arg;
    }
  }

  // CSV requires flattening
  if (options.csv) {
    options.flatten = true;
  }

  return options;
}

function streamConvert(options) {
  return new Promise((resolve, reject) => {
    const parser = sax.createStream(true, { trim: true });
    const input = createReadStream(options.input);
    const output = options.output
      ? createWriteStream(options.output)
      : process.stdout;

    let recordCount = 0;
    let depth = 0;
    let inRecord = false;
    let recordDepth = 0;
    let currentRecord = null;
    let stack = [];
    let textBuffer = '';
    let rootEmitted = false;

    // CSV state
    let csvColumns = null;

    parser.on('opentag', (node) => {
      depth++;

      // Capture root element metadata if --meta is enabled
      if (options.meta && depth === 1 && !rootEmitted) {
        const hasAttributes = Object.keys(node.attributes).length > 0;
        if (hasAttributes) {
          const meta = { _root: node.name };
          for (const [key, value] of Object.entries(node.attributes)) {
            meta[key] = value;
          }
          if (options.csv) {
            // For CSV, output meta as a comment line
            output.write('# ' + JSON.stringify(meta) + '\n');
          } else {
            const json = options.pretty
              ? JSON.stringify(meta, null, 2)
              : JSON.stringify(meta);
            output.write(json + '\n');
          }
        }
        rootEmitted = true;
      }

      // Only treat as a new record if we're not already inside one
      if (!inRecord && options.record && node.name === options.record) {
        inRecord = true;
        recordDepth = depth;
        currentRecord = {};
        stack = [currentRecord];

        // Add attributes to the record
        if (Object.keys(node.attributes).length > 0) {
          for (const [key, value] of Object.entries(node.attributes)) {
            currentRecord[`@${key}`] = value;
          }
        }
        return;
      }

      if (inRecord) {
        const parent = stack[stack.length - 1];
        const newObj = {};

        // Add attributes
        if (Object.keys(node.attributes).length > 0) {
          for (const [key, value] of Object.entries(node.attributes)) {
            newObj[`@${key}`] = value;
          }
        }

        // Handle array vs single element
        if (parent[node.name] !== undefined) {
          if (!Array.isArray(parent[node.name])) {
            parent[node.name] = [parent[node.name]];
          }
          parent[node.name].push(newObj);
        } else {
          parent[node.name] = newObj;
        }

        stack.push(newObj);
      }

      textBuffer = '';
    });

    parser.on('text', (text) => {
      if (inRecord && text.trim()) {
        textBuffer += text;
      }
    });

    parser.on('cdata', (text) => {
      if (inRecord) {
        textBuffer += text;
      }
    });

    parser.on('closetag', (tagName) => {
      if (inRecord) {
        if (tagName === options.record && depth === recordDepth) {
          // Emit the completed record
          let record = currentRecord;
          promoteId(record);
          if (options.flatten) {
            record = flatten(record);
          }

          if (options.csv) {
            // CSV output
            if (csvColumns === null) {
              // First record - establish columns and output header
              csvColumns = Object.keys(record);
              output.write(csvColumns.map(escapeCsvValue).join(',') + '\n');
            }
            // Output row values in column order
            const row = csvColumns.map(col => escapeCsvValue(record[col]));
            output.write(row.join(',') + '\n');
          } else {
            // JSON output
            const json = options.pretty
              ? JSON.stringify(record, null, 2)
              : JSON.stringify(record);
            output.write(json + '\n');
          }

          recordCount++;

          if (recordCount % 10000 === 0) {
            process.stderr.write(`\rProcessed ${recordCount.toLocaleString()} records...`);
          }

          inRecord = false;
          currentRecord = null;
          stack = [];
        } else {
          const current = stack.pop();
          const parent = stack[stack.length - 1];

          // If the element only has text content, simplify it
          if (textBuffer.trim()) {
            const keys = Object.keys(current);
            if (keys.length === 0) {
              // Simple text-only element
              if (Array.isArray(parent[tagName])) {
                parent[tagName][parent[tagName].length - 1] = textBuffer.trim();
              } else {
                parent[tagName] = textBuffer.trim();
              }
            } else {
              // Element has both attributes and text
              current['#text'] = textBuffer.trim();
            }
          } else if (Object.keys(current).length === 0) {
            // Empty element - set to empty string or remove
            if (Array.isArray(parent[tagName])) {
              parent[tagName][parent[tagName].length - 1] = '';
            } else {
              parent[tagName] = '';
            }
          }
        }
      }

      textBuffer = '';
      depth--;
    });

    parser.on('error', (err) => {
      console.error('\nError parsing XML:', err.message);
      reject(err);
    });

    parser.on('end', () => {
      if (options.output) {
        output.end();
      }
      process.stderr.write(`\rProcessed ${recordCount.toLocaleString()} records total.\n`);
      resolve(recordCount);
    });

    input.on('error', (err) => {
      console.error('Error reading file:', err.message);
      reject(err);
    });

    input.pipe(parser);
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showHelp();
    process.exit(1);
  }

  const options = parseArgs(args);

  if (!options.input) {
    console.error('Error: No input file specified');
    process.exit(1);
  }

  if (!options.record) {
    console.error('Error: No record element specified. Use -r <tag> to specify which element to extract.');
    console.error('Example: xml2rows artists.xml -r artist');
    process.exit(1);
  }

  try {
    await streamConvert(options);
  } catch (err) {
    process.exit(1);
  }
}

main();

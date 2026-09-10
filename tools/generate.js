import { stringify } from "javascript-stringify";
import fs from "node:fs";

function generatePrinters() {
  let output = "";
  output += `const printerDefinitions = {\n`;

  try {
    let files = fs.readdirSync("data/printers");

    for (let file of files) {
      let data = fs.readFileSync("data/printers/" + file, "utf8");

      let definition = {};

      try {
        definition = JSON.parse(data);
      } catch (err) {
        console.log("Error parsing file: " + file);
        console.log(data);
        throw err;
      }

      let name = file.replace(/\.json$/, "");

      output += `\t'${name}': ${stringify(definition)},\n`;
    }
  } catch (err) {
    // Never swallow: a partial output would corrupt the generated module.
    console.error(err);
    throw err;
  }

  output += "};\n\n";

  output += "export default printerDefinitions;\n";

  fs.writeFileSync("generated/printers.js", output, "utf8");
}

function generateMappings() {
  let output = "";
  output += `const codepageMappings = {\n`;

  try {
    output += `\t'esc-pos': {\n`;

    let files = fs.readdirSync("data/mappings/esc-pos");

    for (let file of files) {
      let data = fs.readFileSync("data/mappings/esc-pos/" + file, "utf8");
      // Tolerate CRLF line endings: a trailing "\t\r" would otherwise
      // parse as a mapping entry without a value.
      let lines = data.replace(/\r/g, "").split("\n");

      let name = file.replace(/\.txt$/, "").replace(/-legacy/g, "\/legacy");
      let list = new Map();

      for (let line of lines) {
        if (line.length > 1 && line.charAt(0) != "#") {
          let [, key, value] = line.split(/\t/);

          if (!key || value === undefined) {
            throw new Error(
              "Invalid mapping line in " + file + ": " + JSON.stringify(line),
            );
          }

          list.set(parseInt(key, 16), value.trim());
        }
      }

      if (list.size === 0) {
        throw new Error("No mapping entries found in " + file);
      }

      let mapping = new Array(Math.max(...list.keys()));

      for (let [key, value] of list) {
        mapping[key] = value;
      }

      output += `\t\t'${name}': ${stringify(mapping)},\n`;
    }

    output += `\t},\n`;
  } catch (err) {
    // Never swallow: a partial output would corrupt the generated module.
    console.error(err);
    throw err;
  }

  try {
    output += `\t'star-prnt': {\n`;

    let files = fs.readdirSync("data/mappings/star-prnt");

    for (let file of files) {
      let data = fs.readFileSync("data/mappings/star-prnt/" + file, "utf8");
      // Tolerate CRLF line endings, see the esc-pos block above.
      let lines = data.replace(/\r/g, "").split("\n");

      let name = file.replace(/\.txt$/, "").replace(/-legacy/g, "\/legacy");
      let list = new Map();

      for (let line of lines) {
        if (line.length > 1 && line.charAt(0) != "#") {
          let [, key, value] = line.split(/\t/);

          if (!key || value === undefined) {
            throw new Error(
              "Invalid mapping line in " + file + ": " + JSON.stringify(line),
            );
          }

          list.set(parseInt(key, 16), value.trim());
        }
      }

      if (list.size === 0) {
        throw new Error("No mapping entries found in " + file);
      }

      let mapping = new Array(Math.max(...list.keys()));

      for (let [key, value] of list) {
        mapping[key] = value;
      }

      output += `\t\t'${name}': ${stringify(mapping)},\n`;
    }

    output += "\t}\n";
  } catch (err) {
    // Never swallow: a partial output would corrupt the generated module.
    console.error(err);
    throw err;
  }

  output += "};\n\n";

  output += "codepageMappings['star-line'] = codepageMappings['star-prnt'];\n";
  output +=
    "codepageMappings['esc-pos']['zijang'] = codepageMappings['esc-pos']['pos-5890'];\n\n";
  output += "export default codepageMappings;\n";

  fs.writeFileSync("generated/mapping.js", output, "utf8");
}

generateMappings();
generatePrinters();

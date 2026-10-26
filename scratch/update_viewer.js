import fs from "fs";

const svg = fs.readFileSync("schema_diagram_detailed.svg", "utf8");
let html = fs.readFileSync("schema_viewer.html", "utf8");

const startTag = '<div id="svg-wrapper">';
const endTag = '</div>\n\n  <canvas id="export-canvas"';

const startIndex = html.indexOf(startTag);
const endIndex = html.indexOf(endTag);

if (startIndex !== -1 && endIndex !== -1) {
  const before = html.substring(0, startIndex + startTag.length);
  let after = html.substring(endIndex);

  // Update canvas width/height to match new 3300x2150 canvas
  after = after.replace(/canvas\.width = \d+ \* exportScale;/, "canvas.width = 3300 * exportScale;");
  after = after.replace(/canvas\.height = \d+ \* exportScale;/, "canvas.height = 2150 * exportScale;");

  const updatedHtml = before + "\n      " + svg + "\n    " + after;
  fs.writeFileSync("schema_viewer.html", updatedHtml, "utf8");
  console.log("Successfully updated schema_viewer.html with latest 3300x2150 SVG!");
} else {
  console.error("Could not locate tags in schema_viewer.html", { startIndex, endIndex });
}

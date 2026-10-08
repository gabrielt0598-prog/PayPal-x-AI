// Creates .env from .env.example on first run so there's one obvious place to
// paste API keys. .env is git-ignored (see .gitignore) and is never overwritten.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

if (!existsSync(".env")) {
  const template = readFileSync(".env.example", "utf8");
  // Swap the template's "don't put keys here" header for one meant for .env.
  const body = template.replace(/^(#.*\n)+\n/, "");
  const header = [
    "# Your local API keys. This file is git-ignored and never committed or pushed.",
    "# Paste each key after its = sign (no quotes needed), then restart `npm run dev`.",
    "# Leave a key blank to keep that integration in mock mode.",
    "",
    "",
  ].join("\n");
  writeFileSync(".env", header + body);
  console.log("Created .env from .env.example — add your API keys there (it is git-ignored).");
}

// Refuse to continue if .env would be committed.
try {
  execSync("git check-ignore -q .env", { stdio: "ignore" });
} catch (e) {
  if (e && typeof e === "object" && "status" in e && e.status === 1) {
    console.error("ERROR: .env is NOT git-ignored. Fix .gitignore before adding keys.");
    process.exit(1);
  }
  // git missing or not a repo: nothing to check.
}

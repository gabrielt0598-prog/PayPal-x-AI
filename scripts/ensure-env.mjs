// Creates .env from .env.example on first run so there's one obvious place to
// paste API keys. .env is git-ignored (see .gitignore) and is never overwritten.
import { copyFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
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

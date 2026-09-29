# my-app

Field Clock is a simple time clock for field teams, built as a single HTML page.

- Team members clock in and out with a 4-digit PIN.
- An admin screen (PIN protected) shows live status, lets you add or remove team members, correct entries, and export hours to Excel (.xlsx).

It runs as a Claude artifact and stores its data in the artifact's built-in database (`reps`, `entries`, and `config/admin` collections). Open `index.html` inside a Claude artifact to use it; it will not store data when opened as a plain file.

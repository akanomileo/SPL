// Let successful CLI runs drain native build workers on Windows.
// Retained for compatibility; errors still exit immediately.
// Errors retain their nonzero exit codes; no output-based success fallback.
const exit = process.exit.bind(process);
process.exit = (code = 0) => {
  if (Number(code) === 0) {
    process.exitCode = 0;
    return;
  }
  exit(code);
};

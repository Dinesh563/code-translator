/**
 * A minimal, dependency-free progress indicator.
 *
 * On a TTY it renders an animated spinner that updates in place; when output
 * is redirected (not a TTY) it stays silent so logs/pipes aren't polluted with
 * control characters. All methods are no-ops in the non-TTY case except the
 * final newline handling.
 */
export class Progress {
  static readonly #frames: readonly string[] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  readonly #stream: NodeJS.WriteStream;
  readonly #isTty: boolean;
  #frame = 0;
  #active = false;

  public constructor(stream: NodeJS.WriteStream = process.stderr) {
    this.#stream = stream;
    this.#isTty = stream.isTTY === true;
  }

  /** Renders or updates the current status line. */
  public update(message: string): void {
    if (!this.#isTty) {
      return;
    }
    const frame: string = Progress.#frames[this.#frame] ?? Progress.#frames[0] ?? "";
    this.#frame = (this.#frame + 1) % Progress.#frames.length;
    this.#active = true;
    this.#stream.write(`\r\u001b[2K${frame} ${message}`);
  }

  /** Clears the status line and optionally prints a final message. */
  public done(message?: string): void {
    if (this.#isTty && this.#active) {
      this.#stream.write("\r\u001b[2K");
      this.#active = false;
    }
    if (message !== undefined) {
      this.#stream.write(`${message}\n`);
    }
  }
}

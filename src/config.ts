import { config as loadDotenv } from "dotenv";

loadDotenv();

/**
 * Resolved, validated application configuration.
 * Constructed once via {@link getConfig} and passed explicitly thereafter.
 */
export interface AppConfig {
  readonly anthropicApiKey: string;
}

/**
 * Thrown when required configuration is missing or invalid.
 * Carries a user-facing message intended to be printed without a stack trace.
 */
export class ConfigError extends Error {
  public override readonly name = "ConfigError";

  public constructor(message: string) {
    super(message);
  }
}

/**
 * Reads and validates configuration from the environment.
 *
 * @throws {ConfigError} if `ANTHROPIC_API_KEY` is absent or empty.
 */
export function getConfig(): AppConfig {
  const apiKey: string | undefined = process.env["ANTHROPIC_API_KEY"];

  if (apiKey === undefined || apiKey.trim() === "") {
    throw new ConfigError(
      "Missing ANTHROPIC_API_KEY. Set it in your environment or a .env file.\n" +
        "Example: echo 'ANTHROPIC_API_KEY=sk-ant-...' >> .env",
    );
  }

  return { anthropicApiKey: apiKey };
}

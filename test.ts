import { readFile } from "node:fs/promises";
import path from "node:path";

const GREETING = "hello";

export function add(a: number, b: number): number {
  return a + b;
}

function privateHelper(): void {
  console.log(GREETING);
}

export class Calculator {
  private total = 0;

  add(n: number): this {
    this.total += n;
    return this;
  }

  get value(): number {
    return this.total;
  }
}

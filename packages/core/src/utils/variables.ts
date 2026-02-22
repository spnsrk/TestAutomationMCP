/**
 * Variable interpolation engine for test definitions.
 * Resolves ${variable.path} references in strings against a context map.
 */
export class VariableResolver {
  private context = new Map<string, unknown>();

  set(key: string, value: unknown): void {
    this.context.set(key, value);
  }

  get(key: string): unknown {
    return this.context.get(key);
  }

  setAll(variables: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(variables)) {
      this.context.set(key, value);
    }
  }

  resolve(template: string): string {
    return template.replace(/\$\{([^}]+)\}/g, (_match, path: string) => {
      const value = this.resolvePath(path.trim());
      if (value === undefined) {
        return `\${${path}}`;
      }
      return String(value);
    });
  }

  resolveObject<T>(obj: T): T {
    if (typeof obj === "string") {
      return this.resolve(obj) as T;
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.resolveObject(item)) as T;
    }
    if (obj !== null && typeof obj === "object") {
      const resolved: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = this.resolveObject(value);
      }
      return resolved as T;
    }
    return obj;
  }

  private resolvePath(path: string): unknown {
    const parts = path.split(".");
    let current: unknown = undefined;

    const rootKey = parts[0];
    current = this.context.get(rootKey);

    for (let i = 1; i < parts.length && current != null; i++) {
      const part = parts[i];
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, prop, indexStr] = arrayMatch;
        current = (current as Record<string, unknown>)[prop];
        if (Array.isArray(current)) {
          current = current[parseInt(indexStr, 10)];
        }
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    }

    return current;
  }

  toJSON(): Record<string, unknown> {
    return Object.fromEntries(this.context);
  }
}

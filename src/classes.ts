export class InsertValue<T> {
  value: T
  constructor(value: T) {
    this.value = value
  }
}

export class TransformValue<T> {
  public envKey: string
  public transformFunction: (envValue: string) => T

  constructor(envKey: string, transformFunction: (envValue: string) => T) {
    this.envKey = envKey
    this.transformFunction = transformFunction
  }
}

export class SecretKey {
  secret: string
  constructor(secret: string) {
    this.secret = secret
  }
}

export class Secret {
  toJSON() {
    return '[secret]'
  }
  reveal: { (): string }

  constructor(secret: string) {
    this.reveal = () => secret
  }
}
